"""Add payment attempts and booking hold expiry.

Revision ID: 20261113_add_payments
Revises: 20261010_initial
Create Date: 2026-11-13
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20261113_add_payments"
down_revision = "20261010_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Nullable to preserve existing bookings; new booking code will set the
    # 10-minute hold deadline in a later phase.
    op.add_column("bookings", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_bookings_expires_at", "bookings", ["expires_at"], unique=False)

    op.create_table(
        "payments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("booking_id", sa.String(length=36), nullable=False),
        sa.Column("invoice_id", sa.String(length=32), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("amount", sa.Numeric(precision=10, scale=2), server_default=sa.text("100.00"), nullable=False),
        sa.Column("currency", sa.String(length=3), server_default=sa.text("'KZT'"), nullable=False),
        sa.Column("status", sa.String(length=20), server_default=sa.text("'pending'"), nullable=False),
        sa.Column("secret_hash", sa.String(length=128), nullable=False),
        sa.Column("gateway_transaction_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "status IN ('pending', 'paid', 'failed', 'cancelled', 'expired')",
            name="ck_payments_status",
        ),
        sa.UniqueConstraint("invoice_id", name="uq_payments_invoice_id"),
        sa.UniqueConstraint("idempotency_key", name="uq_payments_idempotency_key"),
        sa.UniqueConstraint("gateway_transaction_id", name="uq_payments_gateway_transaction_id"),
    )
    op.create_index("ix_payments_booking_id", "payments", ["booking_id"], unique=False)
    op.create_index("ix_payments_status", "payments", ["status"], unique=False)
    op.create_index("ix_payments_expires_at", "payments", ["expires_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_payments_expires_at", table_name="payments")
    op.drop_index("ix_payments_status", table_name="payments")
    op.drop_index("ix_payments_booking_id", table_name="payments")
    op.drop_table("payments")
    op.drop_index("ix_bookings_expires_at", table_name="bookings")
    op.drop_column("bookings", "expires_at")
