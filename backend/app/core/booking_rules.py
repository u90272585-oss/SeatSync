from datetime import date, datetime, time
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.models.table import DiningTable
from app.models.venue import Venue
from app.schemas.booking import BookingCreate


def ensure_booking_allowed(
    db: Session,
    table: Optional[DiningTable],
    venue: Optional[Venue],
    payload: BookingCreate,
    exclude_booking_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> None:
    if table is None or venue is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table or venue not found.")
    if not venue.active or not table.active or table.blocked:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This table is unavailable.")
    if payload.guest_count > table.seat_capacity:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Guest count exceeds table capacity.")
    if payload.reservation_date < date.today() or (
        payload.reservation_date == date.today()
        and datetime.combine(payload.reservation_date, payload.start_time) <= datetime.now()
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reservations must be in the future.")
    if payload.end_time <= payload.start_time:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="End time must be after the start time.")
    try:
        opening_text, closing_text = venue.opening_hours.split("-", 1)
        opening_time = time.fromisoformat(opening_text)
        closing_time = time.fromisoformat(closing_text)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Venue opening hours are not configured correctly.") from exc
    if payload.start_time < opening_time or payload.end_time > closing_time:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The selected time is outside venue opening hours.")

    conflict_query = db.query(Booking).filter(
        Booking.table_id == table.id,
        Booking.reservation_date == payload.reservation_date,
        Booking.status != "cancelled",
        Booking.start_time < payload.end_time,
        Booking.end_time > payload.start_time,
    )
    if exclude_booking_id:
        conflict_query = conflict_query.filter(Booking.id != exclude_booking_id)
    if conflict_query.first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This table is already reserved for the selected slot.",
        )
    if user_id:
        duplicate_query = db.query(Booking).filter(
            Booking.user_id == user_id,
            Booking.venue_id == payload.venue_id,
            Booking.reservation_date == payload.reservation_date,
            Booking.start_time == payload.start_time,
            Booking.end_time == payload.end_time,
            Booking.guest_count == payload.guest_count,
            Booking.status != "cancelled",
        )
        if exclude_booking_id:
            duplicate_query = duplicate_query.filter(Booking.id != exclude_booking_id)
        if duplicate_query.first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An identical booking already exists for this account.",
            )
