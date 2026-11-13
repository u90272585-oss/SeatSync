"""Scope payment idempotency keys to their booking.

Revision ID: 20261113_scope_payment_idempotency
Revises: 20261113_add_payments
Create Date: 2026-11-13
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "20261113_scope_payment_idempotency"
down_revision = "20261113_add_payments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # batch_alter_table emits a table rebuild on SQLite and ALTER CONSTRAINT
    # operations on PostgreSQL.
    with op.batch_alter_table("payments") as batch_op:
        batch_op.drop_constraint("uq_payments_idempotency_key", type_="unique")
        batch_op.create_unique_constraint(
            "uq_payments_booking_id_idempotency_key", ["booking_id", "idempotency_key"]
        )


def downgrade() -> None:
    # Downgrade restores the former global uniqueness rule. It can only apply
    # if no two bookings currently share an idempotency key.
    with op.batch_alter_table("payments") as batch_op:
        batch_op.drop_constraint("uq_payments_booking_id_idempotency_key", type_="unique")
        batch_op.create_unique_constraint("uq_payments_idempotency_key", ["idempotency_key"])
