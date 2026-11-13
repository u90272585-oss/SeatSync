"""Local-only simulated payment provider and state transitions."""

import secrets
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal, NamedTuple, Optional

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.booking_rules import (
    BOOKING_HOLD_DURATION,
    begin_serialized_write,
    ensure_booking_allowed,
    lock_booking_for_update,
)
from app.models.booking import Booking
from app.models.payment import Payment
from app.models.table import DiningTable
from app.models.venue import Venue
from app.schemas.booking import BookingCreate


BOOKING_FEE = Decimal("100.00")
BOOKING_CURRENCY = "KZT"
DemoScenario = Literal["success", "failure", "expiry"]


class DemoOutcome(NamedTuple):
    scenario: DemoScenario
    verified: bool
    transaction_id: Optional[str]


class DemoPaymentProvider:
    """Deterministic demo-only outcome adapter; it performs no network calls."""

    def simulate(self, scenario: DemoScenario, payment_id: str) -> DemoOutcome:
        return DemoOutcome(
            scenario=scenario,
            verified=scenario == "success",
            transaction_id=f"demo-{payment_id}" if scenario == "success" else None,
        )


def _utc(value: datetime) -> datetime:
    # SQLite may return naive values for DateTime(timezone=True); stored values
    # are created as UTC and can safely be interpreted as UTC on readback.
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _payment_read(payment: Payment, booking: Booking) -> dict:
    return {
        "id": payment.id,
        "booking_id": payment.booking_id,
        "amount": payment.amount,
        "currency": payment.currency,
        "status": payment.status,
        "expires_at": _utc(payment.expires_at),
        "booking_status": booking.status,
    }


class DemoPaymentService:
    def __init__(self, provider: Optional[DemoPaymentProvider] = None) -> None:
        self.provider = provider or DemoPaymentProvider()

    def initiate(
        self,
        db: Session,
        *,
        booking_id: str,
        user_id: str,
        idempotency_key: str,
    ) -> dict:
        begin_serialized_write(db)
        booking = (
            db.query(Booking)
            .filter(Booking.id == booking_id, Booking.user_id == user_id)
            .with_for_update()
            .first()
        )
        if booking is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")

        prior_for_key = (
            db.query(Payment)
            .filter(Payment.booking_id == booking.id, Payment.idempotency_key == idempotency_key)
            .first()
        )
        if prior_for_key is not None:
            return _payment_read(prior_for_key, booking)

        if booking.status not in {"pending", "pending_payment"}:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Booking is not eligible for payment.")

        now = datetime.now(timezone.utc)
        if booking.expires_at is not None and _utc(booking.expires_at) <= now:
            booking.status = "expired"
            for pending in db.query(Payment).filter(
                Payment.booking_id == booking.id, Payment.status == "pending"
            ):
                pending.status = "expired"
            db.commit()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Booking payment hold has expired.")

        attempts = db.query(Payment).filter(Payment.booking_id == booking.id).all()
        for attempt in attempts:
            if attempt.status == "paid":
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Booking is already paid.")
            if attempt.status == "pending":
                if _utc(attempt.expires_at) <= now:
                    attempt.status = "expired"
                    booking.status = "expired"
                    db.commit()
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Payment attempt has expired.")
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A payment attempt is already pending.")

        venue = db.query(Venue).filter(Venue.id == booking.venue_id).first()
        table = db.query(DiningTable).filter(DiningTable.id == booking.table_id).first()
        candidate = BookingCreate(
            venue_id=booking.venue_id,
            table_id=booking.table_id,
            reservation_date=booking.reservation_date,
            start_time=booking.start_time,
            end_time=booking.end_time,
            guest_count=booking.guest_count,
            notes=booking.notes,
        )
        ensure_booking_allowed(
            db,
            table,
            venue,
            candidate,
            exclude_booking_id=booking.id,
            user_id=booking.user_id,
        )

        # The hold starts at booking creation. Preserve it across checkout and
        # retries; only legacy rows without an expiry receive a one-time value.
        expires_at = _utc(booking.expires_at) if booking.expires_at is not None else now + BOOKING_HOLD_DURATION
        booking.status = "pending_payment"
        booking.expires_at = expires_at
        payment = Payment(
            booking_id=booking.id,
            invoice_id=f"demo_{uuid.uuid4().hex[:27]}",
            idempotency_key=idempotency_key,
            amount=BOOKING_FEE,
            currency=BOOKING_CURRENCY,
            status="pending",
            secret_hash=secrets.token_hex(32),
            expires_at=expires_at,
        )
        db.add(payment)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            existing = (
                db.query(Payment)
                .filter(Payment.booking_id == booking_id, Payment.idempotency_key == idempotency_key)
                .first()
            )
            if existing is not None:
                existing_booking = db.query(Booking).filter(Booking.id == existing.booking_id).first()
                if existing_booking is not None:
                    return _payment_read(existing, existing_booking)
            active = db.query(Payment).filter(
                Payment.booking_id == booking_id,
                Payment.status == "pending",
            ).first()
            if active is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A payment attempt is already pending.",
                )
            raise
        db.refresh(payment)
        db.refresh(booking)
        return _payment_read(payment, booking)

    def simulate(
        self,
        db: Session,
        *,
        payment_id: str,
        user_id: str,
        scenario: DemoScenario,
    ) -> dict:
        begin_serialized_write(db)
        payment = (
            db.query(Payment)
            .join(Booking, Booking.id == Payment.booking_id)
            .filter(Payment.id == payment_id, Booking.user_id == user_id)
            .first()
        )
        if payment is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found.")
        lock_booking_for_update(db, payment.booking_id)
        booking = db.query(Booking).filter(Booking.id == payment.booking_id).first()
        assert booking is not None
        if db.get_bind().dialect.name != "sqlite":
            payment = db.query(Payment).filter(Payment.id == payment_id).with_for_update().first()
            assert payment is not None

        target_status = {"success": "paid", "failure": "failed", "expiry": "expired"}[scenario]
        if payment.status == target_status:
            return _payment_read(payment, booking)
        if payment.status != "pending":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Payment is no longer pending.")
        if booking.status != "pending_payment":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Booking is no longer awaiting payment.")

        now = datetime.now(timezone.utc)
        if _utc(payment.expires_at) <= now:
            payment.status = "expired"
            booking.status = "expired"
            db.commit()
            if scenario == "success":
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Payment hold has expired.")
            db.refresh(payment)
            db.refresh(booking)
            return _payment_read(payment, booking)

        outcome = self.provider.simulate(scenario, payment.id)
        if outcome.scenario == "success" and outcome.verified:
            payment.status = "paid"
            payment.gateway_transaction_id = outcome.transaction_id
            payment.verified_at = now
            booking.status = "confirmed"
        elif outcome.scenario == "failure":
            payment.status = "failed"
        else:
            payment.status = "expired"
            booking.status = "expired"

        db.commit()
        db.refresh(payment)
        db.refresh(booking)
        return _payment_read(payment, booking)


demo_payment_service = DemoPaymentService()
