import csv
import io
from datetime import date as date_type
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import PlainTextResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_admin
from app.core.booking_rules import ensure_booking_allowed
from app.db.session import get_db
from app.models.booking import Booking
from app.models.table import DiningTable
from app.models.user import User
from app.models.venue import Venue
from app.schemas.booking import AdminBookingCreate, BookingCreate, BookingRead, BookingUpdate
from app.schemas.venue import TableUpdate

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/bookings")
def list_admin_bookings(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status: Optional[Literal["pending", "confirmed", "cancelled"]] = None,
    date: Optional[date_type] = None,
    search: Optional[str] = None,
    venue_id: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    query = db.query(Booking).options(joinedload(Booking.user), joinedload(Booking.venue), joinedload(Booking.table))
    if status:
        query = query.filter(Booking.status == status)
    if date:
        query = query.filter(Booking.reservation_date == date)
    if venue_id:
        query = query.filter(Booking.venue_id == venue_id)
    if search:
        term = f"%{search.strip()}%"
        query = query.join(User, Booking.user_id == User.id).filter(
            or_(
                User.name.ilike(f"%{search}%"),
                User.email.ilike(f"%{search}%"),
                Booking.notes.ilike(f"%{search}%"),
            )
        )

    total = query.count()
    items = query.order_by(Booking.reservation_date.desc(), Booking.start_time.desc()).offset((page - 1) * page_size).limit(page_size).all()
    bookings = []
    for item in items:
        result = BookingRead.model_validate(item).model_dump()
        result.update({"guest_name": item.user.name, "guest_email": item.user.email, "venue_name": item.venue.name, "table_number": item.table.table_number})
        bookings.append(result)
    return {"page": page, "page_size": page_size, "total": total, "bookings": bookings}


@router.get("/bookings/export")
def export_admin_bookings(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    bookings = db.query(Booking).order_by(Booking.reservation_date.desc(), Booking.start_time.desc()).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "user_id", "venue_id", "table_id", "reservation_date", "start_time", "end_time", "guest_count", "status", "notes"])
    for booking in bookings:
        writer.writerow([
            booking.id,
            booking.user_id,
            booking.venue_id,
            booking.table_id,
            booking.reservation_date.isoformat(),
            booking.start_time.isoformat(),
            booking.end_time.isoformat(),
            booking.guest_count,
            booking.status,
            booking.notes or "",
        ])
    return PlainTextResponse(content=output.getvalue(), media_type="text/csv")


@router.get("/bookings/{booking_id}")
def get_admin_booking(booking_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    booking = db.query(Booking).options(joinedload(Booking.user), joinedload(Booking.venue), joinedload(Booking.table)).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")
    result = BookingRead.model_validate(booking).model_dump()
    result.update({"guest_name": booking.user.name, "guest_email": booking.user.email, "venue_name": booking.venue.name, "table_number": booking.table.table_number})
    return result


@router.post("/bookings", status_code=status.HTTP_201_CREATED)
def create_admin_booking(
    payload: AdminBookingCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    user = db.query(User).filter(User.email == payload.guest_email.lower().strip()).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found.")
    venue = db.query(Venue).filter(Venue.id == payload.venue_id).first()
    table = db.query(DiningTable).filter(
        DiningTable.id == payload.table_id,
        DiningTable.venue_id == payload.venue_id,
    ).first()
    if table is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found for this venue.")
    ensure_booking_allowed(db, table, venue, payload, user_id=user.id)
    booking = Booking(
        user_id=user.id,
        venue_id=payload.venue_id,
        table_id=payload.table_id,
        reservation_date=payload.reservation_date,
        start_time=payload.start_time,
        end_time=payload.end_time,
        guest_count=payload.guest_count,
        status="confirmed",
        notes=payload.notes,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    result = BookingRead.model_validate(booking).model_dump()
    result.update({"guest_name": user.name, "guest_email": user.email, "venue_name": venue.name, "table_number": table.table_number})
    return result


@router.patch("/bookings/{booking_id}")
def update_admin_booking(booking_id: str, updates: BookingUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")
    if booking.status == "cancelled":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cancelled bookings cannot be edited.")
    update_data = updates.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No booking changes were provided.")
    if any(update_data.get(field) is None for field in ("venue_id", "table_id", "reservation_date", "start_time", "end_time", "guest_count") if field in update_data):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Booking fields cannot be null.")
    venue_id = update_data.get("venue_id", booking.venue_id)
    table_id = update_data.get("table_id", booking.table_id)
    venue = db.query(Venue).filter(Venue.id == venue_id).first()
    table = db.query(DiningTable).filter(DiningTable.id == table_id, DiningTable.venue_id == venue_id).first()
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
    db.commit()
    db.refresh(booking)
    return BookingRead.model_validate(booking).model_dump()


@router.post("/bookings/{booking_id}/cancel")
def cancel_admin_booking(booking_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")
    booking.status = "cancelled"
    db.commit()
    return {"message": "Booking cancelled successfully.", "booking": BookingRead.model_validate(booking).model_dump()}


@router.get("/tables")
def list_admin_tables(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    tables = db.query(DiningTable).join(Venue).order_by(Venue.name, DiningTable.table_number).all()
    result = []
    for table in tables:
        result.append(
            {
                "id": table.id,
                "venue_id": table.venue_id,
                "venue_name": table.venue.name,
                "table_number": table.table_number,
                "display_name": table.display_name,
                "seat_capacity": table.seat_capacity,
                "active": table.active,
                "blocked": table.blocked,
                "block_reason": table.block_reason,
            }
        )
    return {"tables": result, "count": len(result)}


@router.patch("/tables/{table_id}")
def update_admin_table(
    table_id: int,
    updates: TableUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    table = db.query(DiningTable).filter(DiningTable.id == table_id).first()
    if not table:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found.")
    update_data = updates.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No table changes were provided.")
    if "display_name" in update_data:
        update_data["display_name"] = update_data["display_name"].strip()
        if not update_data["display_name"]:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Table name cannot be blank.")
    active_bookings = db.query(Booking).filter(
        Booking.table_id == table.id,
        Booking.reservation_date >= date_type.today(),
        Booking.status != "cancelled",
    ).all()
    new_capacity = update_data.get("seat_capacity", table.seat_capacity)
    if any(booking.guest_count > new_capacity for booking in active_bookings):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Table capacity cannot be reduced below an existing booking's guest count.")
    if (update_data.get("blocked") is True or update_data.get("active") is False) and active_bookings:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cancel or move existing bookings before disabling this table.")
    for field, value in update_data.items():
        setattr(table, field, value)
    db.commit()
    db.refresh(table)
    return {"message": "Table updated successfully.", "table": table.id}


@router.get("/stats")
def get_admin_stats(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    bookings = db.query(Booking.status, Booking.guest_count).all()
    tables = db.query(DiningTable.active, DiningTable.blocked).all()
    return {
        "total_bookings": len(bookings),
        "confirmed_bookings": sum(1 for booking_status, _ in bookings if booking_status == "confirmed"),
        "pending_bookings": sum(1 for booking_status, _ in bookings if booking_status == "pending"),
        "cancelled_bookings": sum(1 for booking_status, _ in bookings if booking_status == "cancelled"),
        "total_guests": sum(guest_count for booking_status, guest_count in bookings if booking_status != "cancelled"),
        "active_tables": sum(1 for active, blocked in tables if active and not blocked),
        "blocked_tables": sum(1 for _, blocked in tables if blocked),
    }
