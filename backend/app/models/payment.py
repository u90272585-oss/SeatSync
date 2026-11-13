import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Numeric, String, UniqueConstraint, func, text
from sqlalchemy.orm import backref
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'paid', 'failed', 'cancelled', 'expired')",
            name="ck_payments_status",
        ),
        UniqueConstraint("invoice_id", name="uq_payments_invoice_id"),
        UniqueConstraint(
            "booking_id", "idempotency_key", name="uq_payments_booking_id_idempotency_key"
        ),
        UniqueConstraint("gateway_transaction_id", name="uq_payments_gateway_transaction_id"),
        Index(
            "uq_payments_one_pending_per_booking",
            "booking_id",
            unique=True,
            sqlite_where=text("status = 'pending'"),
            postgresql_where=text("status = 'pending'"),
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    booking_id: Mapped[str] = mapped_column(
        ForeignKey("bookings.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    invoice_id: Mapped[str] = mapped_column(String(32), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("100.00"))
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="KZT")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    secret_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    gateway_transaction_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    # The payment service must explicitly assign expires_at. When creating a
    # payment and its booking hold, it must calculate ONE UTC timestamp and
    # assign that exact value to both Booking.expires_at and Payment.expires_at.
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    booking: Mapped["Booking"] = relationship(backref=backref("payments", passive_deletes=True))
