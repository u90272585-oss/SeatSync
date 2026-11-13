from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.api.deps import get_current_user
from app.api.routes.admin import router as admin_router
from app.api.routes.bookings import router as bookings_router
from app.api.routes.demo_payments import router as demo_payments_router
from app.api.routes.venues import router as venues_router
from app.core.config import Settings, settings
from app.db.base import Base
from app.db.session import get_db
from app.models import Booking, DiningTable, Payment, User, Venue


@pytest.fixture
def demo_api(monkeypatch, tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'demo-payments.sqlite3'}",
        connect_args={"check_same_thread": False, "timeout": 10},
    )

    @event.listens_for(engine, "connect")
    def _enable_test_foreign_keys(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys=ON")
        finally:
            cursor.close()

    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    suffix = uuid4().hex
    with factory() as db:
        owner = User(name="Demo Owner", email=f"owner-{suffix}@example.test", password_hash="unused")
        stranger = User(name="Demo Stranger", email=f"stranger-{suffix}@example.test", password_hash="unused")
        venue = Venue(
            id=suffix,
            name="Demo Venue",
            location="Demo Location",
            opening_hours="09:00-20:00",
            active=True,
        )
        db.add_all([owner, stranger, venue])
        db.flush()
        table = DiningTable(
            venue_id=venue.id,
            table_number=1,
            display_name="Demo Table",
            seat_capacity=4,
            active=True,
            blocked=False,
        )
        db.add(table)
        db.commit()
        owner_id, stranger_id, venue_id, table_id = owner.id, stranger.id, venue.id, table.id

    actor = {"id": owner_id, "role": "guest"}
    app = FastAPI()
    app.include_router(bookings_router, prefix="/api")
    app.include_router(demo_payments_router, prefix="/api")
    app.include_router(venues_router, prefix="/api")
    app.include_router(admin_router, prefix="/api")

    def override_db():
        with factory() as db:
            yield db

    def override_user(request: Request):
        user_id = request.headers.get("x-test-user-id", actor["id"])
        role = actor["role"] if user_id == actor["id"] else "guest"
        return SimpleNamespace(id=user_id, role=role)

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    monkeypatch.setattr(settings, "DEMO_PAYMENTS_ENABLED", True)
    monkeypatch.setattr(settings, "ENVIRONMENT", "testing")

    with TestClient(app) as client:
        yield SimpleNamespace(
            client=client,
            actor=actor,
            owner_id=owner_id,
            stranger_id=stranger_id,
            venue_id=venue_id,
            table_id=table_id,
            factory=factory,
        )

    Base.metadata.drop_all(engine)
    engine.dispose()


def _create_booking(api, *, start_time="15:00", end_time="16:30", headers=None):
    reservation_date = (date.today() + timedelta(days=30)).isoformat()
    response = api.client.post(
        "/api/bookings",
        headers=headers,
        json={
            "venue_id": api.venue_id,
            "table_id": api.table_id,
            "reservation_date": reservation_date,
            "start_time": start_time,
            "end_time": end_time,
            "guest_count": 2,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _initiate(api, booking_id, key="demo-idempotency-1", **extra):
    payload = {"idempotency_key": key, **extra}
    return api.client.post(f"/api/demo-payments/bookings/{booking_id}", json=payload)


def _simulate(api, payment_id, scenario):
    return api.client.post(
        f"/api/demo-payments/{payment_id}/simulate",
        json={"scenario": scenario},
    )


def test_settings_default_demo_payments_off():
    assert Settings.model_fields["DEMO_PAYMENTS_ENABLED"].default is False


def test_demo_endpoints_are_disabled_when_flag_is_off(demo_api, monkeypatch):
    monkeypatch.setattr(settings, "DEMO_PAYMENTS_ENABLED", False)
    booking = _create_booking(demo_api)

    response = _initiate(demo_api, booking["id"])

    assert response.status_code == 404


def test_demo_endpoints_remain_disabled_in_production(demo_api, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    booking = _create_booking(demo_api)

    response = _initiate(demo_api, booking["id"])

    assert response.status_code == 404


@pytest.mark.parametrize("environment", ["production", "prod", "staging", "live", "unknown"])
def test_demo_endpoints_reject_production_and_unrecognized_environments(demo_api, monkeypatch, environment):
    monkeypatch.setattr(settings, "ENVIRONMENT", environment)
    booking = _create_booking(demo_api)

    assert _initiate(demo_api, booking["id"]).status_code == 404


def test_initiation_sets_fixed_amount_currency_and_shared_ten_minute_expiry(demo_api):
    booking = _create_booking(demo_api)
    with demo_api.factory() as db:
        stored_booking = db.query(Booking).filter(Booking.id == booking["id"]).one()
        original_expiry = stored_booking.expires_at.replace(tzinfo=timezone.utc)
        created_at = stored_booking.created_at.replace(tzinfo=timezone.utc)

    response = _initiate(demo_api, booking["id"])

    assert response.status_code == 201, response.text
    result = response.json()
    expiry = datetime.fromisoformat(result["expires_at"].replace("Z", "+00:00"))
    assert result["amount"] == "100.00"
    assert result["currency"] == "KZT"
    assert result["status"] == "pending"
    assert result["booking_status"] == "pending_payment"
    assert expiry == original_expiry
    assert abs((expiry - (created_at + timedelta(minutes=10))).total_seconds()) < 1

    with demo_api.factory() as db:
        payment = db.query(Payment).filter(Payment.id == result["id"]).one()
        stored_booking = db.query(Booking).filter(Booking.id == booking["id"]).one()
        assert payment.amount == Decimal("100.00")
        assert payment.currency == "KZT"
        assert payment.expires_at == stored_booking.expires_at
        assert stored_booking.status == "pending_payment"


def test_client_cannot_override_payment_fields(demo_api):
    booking = _create_booking(demo_api)

    response = _initiate(
        demo_api,
        booking["id"],
        amount="0.01",
        currency="USD",
        status="paid",
        user_id=demo_api.stranger_id,
        expires_at="2099-01-01T00:00:00Z",
    )

    assert response.status_code == 422


def test_only_owner_can_initiate_or_simulate_payment(demo_api):
    booking = _create_booking(demo_api)
    initiated = _initiate(demo_api, booking["id"])
    assert initiated.status_code == 201
    payment_id = initiated.json()["id"]

    demo_api.actor["id"] = demo_api.stranger_id
    assert _initiate(demo_api, booking["id"], "another-key").status_code == 404
    assert _simulate(demo_api, payment_id, "success").status_code == 404


def test_failure_does_not_confirm_booking(demo_api):
    booking = _create_booking(demo_api)
    initiated = _initiate(demo_api, booking["id"])
    assert initiated.json()["booking_status"] == "pending_payment"

    result = _simulate(demo_api, initiated.json()["id"], "failure")

    assert result.status_code == 200
    assert result.json()["status"] == "failed"
    assert result.json()["booking_status"] == "pending_payment"


def test_success_confirms_booking_only_after_verified_demo_result(demo_api):
    booking = _create_booking(demo_api)
    initiated = _initiate(demo_api, booking["id"])
    assert initiated.json()["booking_status"] != "confirmed"

    result = _simulate(demo_api, initiated.json()["id"], "success")

    assert result.status_code == 200
    assert result.json()["status"] == "paid"
    assert result.json()["booking_status"] == "confirmed"
    with demo_api.factory() as db:
        stored_booking = db.query(Booking).filter(Booking.id == booking["id"]).one()
        stored_payment = db.query(Payment).filter(Payment.id == initiated.json()["id"]).one()
        assert stored_booking.status == "confirmed"
        assert stored_payment.status == "paid"
        assert stored_payment.verified_at is not None
        assert stored_payment.gateway_transaction_id.startswith("demo-")


def test_repeated_success_is_idempotent(demo_api):
    booking = _create_booking(demo_api)
    initiated = _initiate(demo_api, booking["id"])
    payment_id = initiated.json()["id"]

    first = _simulate(demo_api, payment_id, "success")
    second = _simulate(demo_api, payment_id, "success")

    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    with demo_api.factory() as db:
        assert db.query(Payment).filter(Payment.booking_id == booking["id"]).count() == 1


def test_repeated_initiation_with_same_key_returns_same_payment(demo_api):
    booking = _create_booking(demo_api)

    first = _initiate(demo_api, booking["id"], "same-request-key")
    replay = _initiate(demo_api, booking["id"], "same-request-key")

    assert first.status_code == replay.status_code == 201
    assert first.json() == replay.json()


def test_retry_after_failure_reuses_original_expiry(demo_api):
    booking = _create_booking(demo_api)
    first = _initiate(demo_api, booking["id"], "first-attempt")
    expiry = first.json()["expires_at"]
    assert _simulate(demo_api, first.json()["id"], "failure").status_code == 200

    retry = _initiate(demo_api, booking["id"], "retry-attempt")

    assert retry.status_code == 201, retry.text
    assert retry.json()["expires_at"] == expiry
    with demo_api.factory() as db:
        assert db.query(Payment).filter(Payment.booking_id == booking["id"]).count() == 2


def test_expiry_scenario_expires_payment_and_releases_table(demo_api):
    booking = _create_booking(demo_api)
    initiated = _initiate(demo_api, booking["id"])
    result = _simulate(demo_api, initiated.json()["id"], "expiry")

    assert result.status_code == 200
    assert result.json()["status"] == "expired"
    assert result.json()["booking_status"] == "expired"
    availability = demo_api.client.get(
        f"/api/venues/{demo_api.venue_id}/availability",
        params={
            "date": booking["reservation_date"],
            "time": booking["start_time"],
            "guest_count": booking["guest_count"],
        },
    )
    assert availability.status_code == 200
    assert demo_api.table_id in [table["id"] for table in availability.json()["available_tables"]]


def test_success_after_real_expiry_is_rejected_and_releases_hold(demo_api):
    booking = _create_booking(demo_api)
    initiated = _initiate(demo_api, booking["id"])
    payment_id = initiated.json()["id"]
    past = datetime.now(timezone.utc) - timedelta(seconds=1)
    with demo_api.factory() as db:
        db.query(Payment).filter(Payment.id == payment_id).update({Payment.expires_at: past})
        db.query(Booking).filter(Booking.id == booking["id"]).update({Booking.expires_at: past})
        db.commit()

    result = _simulate(demo_api, payment_id, "success")

    assert result.status_code == 409
    with demo_api.factory() as db:
        assert db.query(Payment).filter(Payment.id == payment_id).one().status == "expired"
        assert db.query(Booking).filter(Booking.id == booking["id"]).one().status == "expired"


def test_naturally_expired_hold_does_not_block_availability(demo_api):
    booking = _create_booking(demo_api)
    initiated = _initiate(demo_api, booking["id"])
    past = datetime.now(timezone.utc) - timedelta(seconds=1)
    with demo_api.factory() as db:
        db.query(Payment).filter(Payment.id == initiated.json()["id"]).update({Payment.expires_at: past})
        db.query(Booking).filter(Booking.id == booking["id"]).update({Booking.expires_at: past})
        db.commit()

    availability = demo_api.client.get(
        f"/api/venues/{demo_api.venue_id}/availability",
        params={
            "date": booking["reservation_date"],
            "time": booking["start_time"],
            "guest_count": booking["guest_count"],
        },
    )

    assert availability.status_code == 200
    assert demo_api.table_id in [table["id"] for table in availability.json()["available_tables"]]


def test_expired_precheckout_booking_does_not_block_availability_or_admin_pending_count(demo_api):
    booking = _create_booking(demo_api)
    past = datetime.now(timezone.utc) - timedelta(seconds=1)
    with demo_api.factory() as db:
        db.query(Booking).filter(Booking.id == booking["id"]).update({Booking.expires_at: past})
        db.commit()

    availability = demo_api.client.get(
        f"/api/venues/{demo_api.venue_id}/availability",
        params={
            "date": booking["reservation_date"],
            "time": booking["start_time"],
            "guest_count": booking["guest_count"],
        },
    )
    demo_api.actor["role"] = "admin"
    stats = demo_api.client.get("/api/admin/stats")

    assert availability.status_code == 200
    assert demo_api.table_id in [table["id"] for table in availability.json()["available_tables"]]
    assert stats.status_code == 200
    assert stats.json()["pending_bookings"] == 0


def test_concurrent_overlapping_bookings_allow_only_one(demo_api):
    barrier = Barrier(2)
    reservation_date = (date.today() + timedelta(days=30)).isoformat()
    payload = {
        "venue_id": demo_api.venue_id,
        "table_id": demo_api.table_id,
        "reservation_date": reservation_date,
        "start_time": "15:00",
        "end_time": "16:30",
        "guest_count": 2,
    }

    def create_for(user_id):
        barrier.wait(timeout=5)
        return demo_api.client.post(
            "/api/bookings",
            headers={"x-test-user-id": user_id},
            json=payload,
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(create_for, demo_api.owner_id)
        second = pool.submit(create_for, demo_api.stranger_id)
        responses = [first.result(timeout=15), second.result(timeout=15)]

    assert sorted(response.status_code for response in responses) == [201, 409]


def test_concurrent_payment_initiation_with_different_keys_creates_one_pending_payment(demo_api):
    booking = _create_booking(demo_api)
    barrier = Barrier(2)

    def initiate(key):
        barrier.wait(timeout=5)
        return _initiate(demo_api, booking["id"], key)

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(initiate, "concurrent-key-a")
        second = pool.submit(initiate, "concurrent-key-b")
        responses = [first.result(timeout=15), second.result(timeout=15)]

    assert sorted(response.status_code for response in responses) == [201, 409]
    with demo_api.factory() as db:
        assert db.query(Payment).filter(
            Payment.booking_id == booking["id"], Payment.status == "pending"
        ).count() == 1


def test_concurrent_same_key_initiation_returns_same_payment(demo_api):
    booking = _create_booking(demo_api)
    barrier = Barrier(2)

    def initiate():
        barrier.wait(timeout=5)
        return _initiate(demo_api, booking["id"], "same-concurrent-key")

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(initiate)
        second = pool.submit(initiate)
        responses = [first.result(timeout=15), second.result(timeout=15)]

    assert [response.status_code for response in responses] == [201, 201]
    assert responses[0].json() == responses[1].json()
