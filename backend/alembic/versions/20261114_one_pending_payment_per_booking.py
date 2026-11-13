"""Allow at most one pending payment per booking.

Revision ID: 20261114_one_pending_payment
Revises: 20261113_scope_payment_idempotency
Create Date: 2026-11-14
"""

from alembic import op
import sqlalchemy as sa


revision = "20261114_one_pending_payment"
down_revision = "20261113_scope_payment_idempotency"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "uq_payments_one_pending_per_booking",
        "payments",
        ["booking_id"],
        unique=True,
        sqlite_where=sa.text("status = 'pending'"),
        postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_index("uq_payments_one_pending_per_booking", table_name="payments")
