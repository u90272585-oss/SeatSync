from datetime import date, time
from typing import Optional

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class VenueRead(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    location: str
    opening_hours: str
    active: bool

    model_config = ConfigDict(from_attributes=True)


class TableRead(BaseModel):
    id: int
    venue_id: str
    table_number: int
    display_name: str
    seat_capacity: int
    active: bool
    blocked: bool
    block_reason: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class TableUpdate(BaseModel):
    active: Optional[bool] = None
    blocked: Optional[bool] = None
    block_reason: Optional[str] = Field(default=None, max_length=255)
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    seat_capacity: Optional[int] = Field(default=None, ge=1, le=24)

    model_config = ConfigDict(extra="forbid")


class AvailabilityResponse(BaseModel):
    venue_id: str
    date: date
    time: time
    guest_count: int = Field(..., gt=0)
    duration_minutes: int = 90
    available_tables: list[TableRead]
