from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Optional
from uuid import uuid4

import pytest
from sqlalchemy import Numeric, create_engine, event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.models import Booking, DiningTable, Payment, User, Venue


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")

    @event.listens_for(engine, "connect")
    def _enable_foreign_keys(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys=ON")
        finally:
            cursor.close()

    Base.metadata.create_all(engine)
    test_session_factory = sessionmaker(bind=engine)
    with test_session_factory() as session:
        yield session
    Base.metadata.drop_all(engine)
    engine.dispose()


def _make_booking(session: Session) -> Booking:
    suffix = uuid4().hex
    user = User(name="Test Guest", email=f"{suffix}@example.test", password_hash="test-hash")
    venue = Venue(
        id=suffix,
        name="Test Venue",
        location="Test Location",
        opening_hours="09:00-20:00",
        active=True,
    )
    session.add_all([user, venue])
    session.flush()

    table = DiningTable(
        venue_id=venue.id,
        table_number=1,
        display_name="Table 1",
        seat_capacity=4,
        active=True,
        blocked=False,
    )
    session.add(table)
    session.flush()

    booking = Booking(
        user_id=user.id,
        venue_id=venue.id,
        table_id=table.id,
        reservation_date=date.today() + timedelta(days=1),
        start_time=time(12, 0),
        end_time=time(13, 30),
        guest_count=2,
    )
    session.add(booking)
    session.flush()
    return booking


def _make_payment(
    booking: Booking,
    *,
    invoice_id: Optional[str] = None,
    idempotency_key: str,
    gateway_transaction_id: Optional[str] = None,
    status: str = "pending",
    expires_at: Optional[datetime] = None,
) -> Payment:
    return Payment(
        booking_id=booking.id,
        invoice_id=invoice_id or uuid4().hex,
        idempotency_key=idempotency_key,
        secret_hash=uuid4().hex,
        gateway_transaction_id=gateway_transaction_id,
        status=status,
        expires_at=expires_at or datetime.now(timezone.utc) + timedelta(minutes=10),
    )


def test_payment_amount_default_is_decimal_100_kzt(db_session: Session):
    booking = _make_booking(db_session)
    payment = Payment(
        booking_id=booking.id,
        invoice_id=uuid4().hex,
        idempotency_key=uuid4().hex,
        secret_hash=uuid4().hex,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )
    db_session.add(payment)
    db_session.flush()

    assert isinstance(Payment.__table__.c.amount.type, Numeric)
    assert (Payment.__table__.c.amount.type.precision, Payment.__table__.c.amount.type.scale) == (10, 2)
    assert payment.amount == Decimal("100.00")
    assert isinstance(payment.amount, Decimal)
    assert payment.currency == "KZT"


@pytest.mark.parametrize("valid_status", ["pending", "paid", "failed", "cancelled", "expired"])
def test_payment_status_constraint_accepts_allowed_values(db_session: Session, valid_status: str):
    booking = _make_booking(db_session)
    db_session.add(_make_payment(booking, idempotency_key=uuid4().hex, status=valid_status))
    db_session.flush()


def test_payment_status_constraint_rejects_unknown_value(db_session: Session):
    booking = _make_booking(db_session)
    db_session.add(_make_payment(booking, idempotency_key=uuid4().hex, status="authorized"))

    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()


def test_duplicate_invoice_id_is_rejected(db_session: Session):
    booking = _make_booking(db_session)
    invoice_id = uuid4().hex
    db_session.add(_make_payment(booking, invoice_id=invoice_id, idempotency_key=uuid4().hex))
    db_session.flush()
    db_session.add(_make_payment(booking, invoice_id=invoice_id, idempotency_key=uuid4().hex))

    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()


def test_duplicate_idempotency_key_for_same_booking_is_rejected(db_session: Session):
    booking = _make_booking(db_session)
    idempotency_key = uuid4().hex
    db_session.add(_make_payment(booking, idempotency_key=idempotency_key))
    db_session.flush()
    db_session.add(_make_payment(booking, idempotency_key=idempotency_key))

    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()


def test_only_one_pending_payment_is_allowed_per_booking(db_session: Session):
    booking = _make_booking(db_session)
    db_session.add(_make_payment(booking, idempotency_key="pending-attempt-1"))
    db_session.flush()
    db_session.add(_make_payment(booking, idempotency_key="pending-attempt-2"))

    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()


def test_failed_payment_does_not_block_a_new_pending_attempt(db_session: Session):
    booking = _make_booking(db_session)
    db_session.add(_make_payment(booking, idempotency_key="failed-attempt", status="failed"))
    db_session.flush()
    db_session.add(_make_payment(booking, idempotency_key="new-pending-attempt", status="pending"))

    db_session.flush()


def test_same_idempotency_key_is_allowed_for_different_bookings(db_session: Session):
    first_booking = _make_booking(db_session)
    second_booking = _make_booking(db_session)
    idempotency_key = "reused-per-booking-key"
    db_session.add_all([
        _make_payment(first_booking, idempotency_key=idempotency_key),
        _make_payment(second_booking, idempotency_key=idempotency_key),
    ])

    db_session.flush()


def test_duplicate_non_null_gateway_transaction_id_is_rejected(db_session: Session):
    booking = _make_booking(db_session)
    transaction_id = "gateway-transaction-1"
    db_session.add(_make_payment(
        booking, idempotency_key=uuid4().hex, gateway_transaction_id=transaction_id
    ))
    db_session.flush()
    db_session.add(_make_payment(
        booking, idempotency_key=uuid4().hex, gateway_transaction_id=transaction_id
    ))

    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()


def test_booking_delete_is_restricted_while_payment_exists(db_session: Session):
    booking = _make_booking(db_session)
    db_session.add(_make_payment(booking, idempotency_key=uuid4().hex))
    db_session.flush()
    assert db_session.connection().exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1

    db_session.delete(booking)
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()


def test_payment_expiry_has_no_independent_default():
    expiry_column = Payment.__table__.c.expires_at

    assert expiry_column.default is None
    assert expiry_column.server_default is None


def test_payment_constraints_have_stable_names():
    constraints = {constraint.name for constraint in Payment.__table__.constraints}

    assert "ck_payments_status" in constraints
    assert "uq_payments_invoice_id" in constraints
    assert "uq_payments_booking_id_idempotency_key" in constraints
    assert "uq_payments_gateway_transaction_id" in constraints


def test_booking_expiry_remains_nullable_for_existing_rows():
    assert Booking.__table__.c.expires_at.nullable is True
