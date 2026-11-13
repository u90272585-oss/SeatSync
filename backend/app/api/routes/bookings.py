from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.booking_rules import (
    BOOKING_HOLD_DURATION,
    begin_serialized_write,
    ensure_booking_allowed,
    lock_booking_for_update,
)
from app.db.session import get_db
from app.models.booking import Booking
from app.models.payment import Payment
from app.models.table import DiningTable
from app.models.user import User
from app.models.venue import Venue
from app.schemas.booking import BookingCreate, BookingRead, BookingUpdate

router = APIRouter(prefix="/bookings", tags=["bookings"])

def _booking_access(current_user: User, booking: Booking):
    if current_user.role == "admin" or booking.user_id == current_user.id:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to access this booking.")


@router.post("", response_model=BookingRead, status_code=status.HTTP_201_CREATED)
def create_booking(payload: BookingCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    begin_serialized_write(db)
    venue = db.query(Venue).filter(Venue.id == payload.venue_id).first()
    table = db.query(DiningTable).filter(DiningTable.id == payload.table_id, DiningTable.venue_id == payload.venue_id).first()
    if table is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found for this venue.")
    ensure_booking_allowed(db, table, venue, payload, user_id=current_user.id)

    booking = Booking(
        user_id=current_user.id,
        venue_id=payload.venue_id,
        table_id=payload.table_id,
        reservation_date=payload.reservation_date,
        start_time=payload.start_time,
        end_time=payload.end_time,
        guest_count=payload.guest_count,
        # A pre-checkout hold lasts ten minutes. Payment initiation calculates
        # a fresh deadline once and assigns it to both booking and payment.
        status="pending",
        notes=payload.notes,
        expires_at=datetime.now(timezone.utc) + BOOKING_HOLD_DURATION,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


@router.get("/my", response_model=list[BookingRead])
def list_my_bookings(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    bookings = (
        db.query(Booking)
        .filter(Booking.user_id == current_user.id)
        .order_by(Booking.reservation_date.desc(), Booking.start_time.desc())
        .all()
    )
    return bookings


@router.get("/{booking_id}", response_model=BookingRead)
def get_booking(booking_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")
    _booking_access(current_user, booking)
    return booking


@router.patch("/{booking_id}", response_model=BookingRead)
def update_booking(
    booking_id: str,
    payload: BookingUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    begin_serialized_write(db)
    lock_booking_for_update(db, booking_id)
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")
    _booking_access(current_user, booking)

    if booking.status == "cancelled":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cancelled bookings cannot be edited.")

    update_data = payload.model_dump(exclude_unset=True)
    if "status" in update_data and update_data["status"] not in {"pending", "confirmed", "cancelled"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported booking status.")

    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No booking changes were provided.")
    if "status" in update_data and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only administrators can change booking status.")
    if update_data.get("status") in {"pending", "confirmed"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Booking status can only be confirmed by a successful demo payment.",
        )
    if any(
        update_data.get(field) is None
        for field in ("venue_id", "table_id", "reservation_date", "start_time", "end_time", "guest_count")
        if field in update_data
    ):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Booking fields cannot be null.")

    venue_id = update_data.get("venue_id", booking.venue_id)
    table_id = update_data.get("table_id", booking.table_id)
    venue = db.query(Venue).filter(Venue.id == venue_id).first()
    table = db.query(DiningTable).filter(
        DiningTable.id == table_id,
        DiningTable.venue_id == venue_id,
    ).first()
    candidate = BookingCreate(
        venue_id=venue_id,
        table_id=table_id,
        reservation_date=update_data.get("reservation_date", booking.reservation_date),
        start_time=update_data.get("start_time", booking.start_time),
        end_time=update_data.get("end_time", booking.end_time),
        guest_count=update_data.get("guest_count", booking.guest_count),
        notes=update_data.get("notes", booking.notes),
    )
    if update_data.get("status", booking.status) != "cancelled":
        if any(field in update_data for field in ("venue_id", "table_id", "reservation_date", "start_time", "end_time", "guest_count")) or (
            update_data.get("status", booking.status) != booking.status
            and update_data.get("status") != "cancelled"
        ):
            ensure_booking_allowed(
                db,
                table,
                venue,
                candidate,
                exclude_booking_id=booking.id,
                user_id=booking.user_id,
            )

    for field, value in update_data.items():
        setattr(booking, field, value)
    if booking.status == "cancelled":
        db.query(Payment).filter(
            Payment.booking_id == booking.id,
            Payment.status == "pending",
        ).update({Payment.status: "cancelled"}, synchronize_session=False)

    db.commit()
    db.refresh(booking)
    return booking


@router.post("/{booking_id}/cancel", response_model=BookingRead)
def cancel_booking(booking_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    begin_serialized_write(db)
    lock_booking_for_update(db, booking_id)
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")
    _booking_access(current_user, booking)
    booking.status = "cancelled"
    db.query(Payment).filter(
        Payment.booking_id == booking.id,
        Payment.status == "pending",
    ).update({Payment.status: "cancelled"}, synchronize_session=False)
    db.commit()
    db.refresh(booking)
    return booking
