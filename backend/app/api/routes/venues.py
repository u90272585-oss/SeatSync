from datetime import date as date_type, datetime, time as time_cls

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.booking import Booking
from app.models.table import DiningTable
from app.models.venue import Venue
from app.schemas.venue import AvailabilityResponse, TableRead, VenueRead

router = APIRouter(prefix="/venues", tags=["venues"])


@router.get("")
def list_venues(db: Session = Depends(get_db)):
    venues = db.query(Venue).order_by(Venue.name).all()
    return {"count": len(venues), "venues": [VenueRead.model_validate(venue).model_dump() for venue in venues]}


@router.get("/{venue_id}", response_model=VenueRead)
def get_venue(venue_id: str, db: Session = Depends(get_db)):
    venue = db.query(Venue).filter(Venue.id == venue_id).first()
    if not venue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Venue not found.")
    return venue


@router.get("/{venue_id}/tables", response_model=list[TableRead])
def list_venue_tables(venue_id: str, db: Session = Depends(get_db)):
    venue = db.query(Venue).filter(Venue.id == venue_id).first()
    if not venue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Venue not found.")
    tables = db.query(DiningTable).filter(DiningTable.venue_id == venue_id).order_by(DiningTable.table_number).all()
    return tables


@router.get("/{venue_id}/availability", response_model=AvailabilityResponse)
def get_availability(
    venue_id: str,
    date: date_type = Query(...),
    time_value: time_cls = Query(..., alias="time"),
    guest_count: int = Query(..., gt=0, le=24),
    duration_minutes: int = Query(default=90, gt=0, le=240),
    db: Session = Depends(get_db),
):
    venue = db.query(Venue).filter(Venue.id == venue_id, Venue.active.is_(True)).first()
    if not venue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Venue not found or inactive.")

    start_minutes = (time_value.hour * 60) + time_value.minute
    end_minutes = start_minutes + duration_minutes
    if date < date_type.today() or (
        date == date_type.today() and datetime.combine(date, time_value) <= datetime.now()
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Availability must be checked for a future time.")
    if end_minutes >= 24 * 60:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Reservations cannot extend past midnight.")
    end_hours, end_minutes_remainder = divmod(end_minutes, 60)
    end_dt = time_cls(hour=end_hours, minute=end_minutes_remainder)
    try:
        opening_text, closing_text = venue.opening_hours.split("-", 1)
        opening_time = time_cls.fromisoformat(opening_text)
        closing_time = time_cls.fromisoformat(closing_text)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Venue opening hours are not configured correctly.") from exc
    if time_value < opening_time or end_dt > closing_time:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The selected time is outside venue opening hours.")

    tables = (
        db.query(DiningTable)
        .filter(
            DiningTable.venue_id == venue_id,
            DiningTable.active.is_(True),
            DiningTable.blocked.is_(False),
            DiningTable.seat_capacity >= guest_count,
        )
        .order_by(DiningTable.table_number)
        .all()
    )

    available_tables = []
    for table in tables:
        conflict = (
            db.query(Booking)
            .filter(
                Booking.table_id == table.id,
                Booking.reservation_date == date,
                Booking.status != "cancelled",
                Booking.start_time < end_dt,
                Booking.end_time > time_value,
            )
            .first()
        )
        if conflict is None:
            available_tables.append(table)

    return {
        "venue_id": venue_id,
        "date": date,
        "time": time_value,
        "guest_count": guest_count,
        "duration_minutes": duration_minutes,
        "available_tables": [TableRead.model_validate(table).model_dump() for table in available_tables],
    }
