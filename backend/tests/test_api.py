import os
import uuid
from datetime import date, timedelta

os.environ.setdefault("SEATSYNC_ENVIRONMENT", "testing")
os.environ.setdefault("SEATSYNC_DATABASE_URL", "sqlite:///./test_seatsync.db")
os.environ.setdefault("SEATSYNC_JWT_SECRET_KEY", uuid.uuid4().hex + uuid.uuid4().hex)
os.environ.setdefault("SEATSYNC_FIRST_ADMIN_PASSWORD", f"TestOnly-{uuid.uuid4().hex}!")

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app


client = TestClient(app)


def create_user():
    email = f"guest+{uuid.uuid4().hex}@example.com"
    password = "StrongPass123!"
    registration = client.post(
        "/api/auth/register",
        json={"name": "SeatSync Test Guest", "email": email, "password": password},
    )
    assert registration.status_code == 201, registration.text
    login = client.post("/api/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, login.text
    return login.json()


def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_register_and_login_flow():
    email = f"jane+{uuid.uuid4().hex[:8]}@example.com"
    payload = {"name": "Jane Guest", "email": email, "password": "StrongPass123!"}
    reg = client.post("/api/auth/register", json=payload)
    assert reg.status_code == 201, reg.text
    login = client.post("/api/auth/login", json={"email": payload["email"], "password": payload["password"]})
    assert login.status_code == 200, login.text
    data = login.json()
    assert data["user"]["email"] == payload["email"]
    assert data["token"]
    assert "password" not in data["user"]
    assert "password_hash" not in data["user"]


def test_invalid_login_and_guest_access():
    bad = client.post("/api/auth/login", json={"email": "nope@example.com", "password": "wrong"})
    assert bad.status_code == 401

    guest_email = f"guest+{uuid.uuid4().hex[:8]}@example.com"
    client.post("/api/auth/register", json={"name": "Guest User", "email": guest_email, "password": "StrongPass123!"})
    guest_token = client.post(
        "/api/auth/login",
        json={"email": guest_email, "password": "StrongPass123!"},
    ).json()["token"]
    response = client.get("/api/bookings/my", headers={"Authorization": f"Bearer {guest_token}"})
    assert response.status_code == 200


def test_venues_and_availability():
    venues = client.get("/api/venues")
    assert venues.status_code == 200
    data = venues.json()
    assert len(data["venues"]) >= 3

    availability = client.get(
        "/api/venues/cafe/availability",
        params={"date": "2099-01-15", "time": "18:00", "guest_count": 2},
    )
    assert availability.status_code == 200
    assert "available_tables" in availability.json()


def test_profile_update_requires_authentication():
    user = create_user()
    headers = {"Authorization": f"Bearer {user['token']}"}

    unauthenticated = client.patch("/api/auth/me", json={"name": "Updated"})
    assert unauthenticated.status_code == 401

    updated = client.patch("/api/auth/me", headers=headers, json={"name": "Updated Guest"})
    assert updated.status_code == 200
    assert updated.json()["name"] == "Updated Guest"
    assert updated.json()["email"] == user["user"]["email"]


def test_booking_create_overlap_update_and_cancel():
    user = create_user()
    headers = {"Authorization": f"Bearer {user['token']}"}
    reservation_date = date.today() + timedelta(days=1200 + uuid.uuid4().int % 1000)
    availability = client.get(
        "/api/venues/cafe/availability",
        params={"date": reservation_date.isoformat(), "time": "15:00", "guest_count": 2},
    )
    assert availability.status_code == 200, availability.text
    table_id = availability.json()["available_tables"][0]["id"]
    payload = {
        "venue_id": "cafe",
        "table_id": table_id,
        "reservation_date": reservation_date.isoformat(),
        "start_time": "15:00",
        "end_time": "16:30",
        "guest_count": 2,
    }

    created = client.post("/api/bookings", headers=headers, json=payload)
    assert created.status_code == 201, created.text
    booking_id = created.json()["id"]

    overlapping = dict(payload, start_time="15:30", end_time="17:00")
    conflict = client.post("/api/bookings", headers=headers, json=overlapping)
    assert conflict.status_code == 409

    another_table = next(
        table["id"]
        for table in availability.json()["available_tables"]
        if table["id"] != table_id
    )
    duplicate = client.post(
        "/api/bookings",
        headers=headers,
        json=dict(payload, table_id=another_table),
    )
    assert duplicate.status_code == 409

    unchanged_schedule = client.patch(
        f"/api/bookings/{booking_id}",
        headers=headers,
        json={"notes": "Window seat"},
    )
    assert unchanged_schedule.status_code == 200, unchanged_schedule.text
    assert unchanged_schedule.json()["notes"] == "Window seat"

    second = client.post(
        "/api/bookings",
        headers=headers,
        json=dict(payload, start_time="17:00", end_time="18:30"),
    )
    assert second.status_code == 201, second.text
    conflicting_edit = client.patch(
        f"/api/bookings/{booking_id}",
        headers=headers,
        json={"start_time": "16:30", "end_time": "18:00"},
    )
    assert conflicting_edit.status_code == 409

    own_bookings = client.get("/api/bookings/my", headers=headers)
    assert {item["id"] for item in own_bookings.json()} >= {booking_id, second.json()["id"]}

    cancelled = client.post(f"/api/bookings/{booking_id}/cancel", headers=headers)
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    replacement = client.post("/api/bookings", headers=headers, json=payload)
    assert replacement.status_code == 201, replacement.text


def test_admin_endpoints_reject_guests_and_validate_updates():
    guest = create_user()
    guest_headers = {"Authorization": f"Bearer {guest['token']}"}
    assert client.get("/api/admin/bookings").status_code == 401
    assert client.get("/api/admin/bookings", headers=guest_headers).status_code == 403
    assert client.get("/api/admin/bookings/export").status_code == 401
    assert client.get("/api/admin/bookings/export", headers=guest_headers).status_code == 403

    admin_login = client.post(
        "/api/auth/login",
        json={"email": settings.FIRST_ADMIN_EMAIL, "password": settings.FIRST_ADMIN_PASSWORD},
    )
    assert admin_login.status_code == 200, admin_login.text
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['token']}"}
    tables = client.get("/api/admin/tables", headers=admin_headers)
    assert tables.status_code == 200
    assert client.get("/api/admin/stats", headers=admin_headers).status_code == 200

    reservation_date = date.today() + timedelta(days=3000 + uuid.uuid4().int % 1000)
    availability = client.get(
        "/api/venues/cafe/availability",
        params={"date": reservation_date.isoformat(), "time": "15:00", "guest_count": 2},
    )
    assert availability.status_code == 200
    created = client.post(
        "/api/admin/bookings",
        headers=admin_headers,
        json={
            "guest_email": guest["user"]["email"],
            "venue_id": "cafe",
            "table_id": availability.json()["available_tables"][0]["id"],
            "reservation_date": reservation_date.isoformat(),
            "start_time": "15:00",
            "end_time": "16:30",
            "guest_count": 2,
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["guest_email"] == guest["user"]["email"]
    exported = client.get("/api/admin/bookings/export", headers=admin_headers)
    assert exported.status_code == 200
    assert "text/csv" in exported.headers["content-type"]
    assert created.json()["id"] in exported.text
    updated = client.patch(
        f"/api/admin/bookings/{created.json()['id']}",
        headers=admin_headers,
        json={"status": "pending", "notes": "Call to confirm"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["status"] == "pending"

    invalid = client.patch(
        f"/api/admin/bookings/{created.json()['id']}",
        headers=admin_headers,
        json={"status": "arriving", "arbitrary": "ignored"},
    )
    assert invalid.status_code == 422
    assert client.post(
        f"/api/admin/bookings/{created.json()['id']}/cancel",
        headers=admin_headers,
    ).status_code == 200

    missing = client.patch(
        "/api/admin/tables/999999",
        headers=admin_headers,
        json={"active": True},
    )
    assert missing.status_code == 404
