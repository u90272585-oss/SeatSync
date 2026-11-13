from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class DemoPaymentCreate(BaseModel):
    idempotency_key: str = Field(..., min_length=1, max_length=128)

    model_config = ConfigDict(extra="forbid")


class DemoPaymentSimulation(BaseModel):
    scenario: Literal["success", "failure", "expiry"]

    model_config = ConfigDict(extra="forbid")


class DemoPaymentRead(BaseModel):
    id: str
    booking_id: str
    amount: Decimal
    currency: str
    status: str
    expires_at: datetime
    booking_status: str
