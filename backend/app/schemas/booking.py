from datetime import date, datetime, time
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class BookingBase(BaseModel):
    venue_id: str
    table_id: int
    reservation_date: date
    start_time: time
    end_time: time
    guest_count: int = Field(..., gt=0, le=24)
    notes: Optional[str] = Field(default=None, max_length=255)

    model_config = ConfigDict(extra="forbid")


class BookingCreate(BookingBase):
    pass


class BookingUpdate(BaseModel):
    venue_id: Optional[str] = None
    table_id: Optional[int] = None
    reservation_date: Optional[date] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    guest_count: Optional[int] = Field(default=None, gt=0, le=24)
    notes: Optional[str] = Field(default=None, max_length=255)
    status: Optional[Literal["pending", "confirmed", "cancelled"]] = None

    model_config = ConfigDict(extra="forbid")


class AdminBookingCreate(BookingCreate):
    guest_email: EmailStr


class BookingRead(BaseModel):
    id: str
    user_id: str
    venue_id: str
    table_id: int
    reservation_date: date
    start_time: time
    end_time: time
    guest_count: int
    status: str
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
