from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.user import User
from app.schemas.payment import DemoPaymentCreate, DemoPaymentRead, DemoPaymentSimulation
from app.services.demo_payment import demo_payment_service


router = APIRouter(prefix="/demo-payments", tags=["demo-payments"])


def require_demo_payments_enabled() -> None:
    environment = settings.ENVIRONMENT.strip().casefold()
    allowed_environments = {"development", "dev", "demo", "testing", "test"}
    if not settings.DEMO_PAYMENTS_ENABLED or environment not in allowed_environments:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")


@router.post(
    "/bookings/{booking_id}",
    response_model=DemoPaymentRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_demo_payments_enabled)],
)
def initiate_demo_payment(
    booking_id: str,
    payload: DemoPaymentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return demo_payment_service.initiate(
        db,
        booking_id=booking_id,
        user_id=current_user.id,
        idempotency_key=payload.idempotency_key,
    )


@router.post(
    "/{payment_id}/simulate",
    response_model=DemoPaymentRead,
    dependencies=[Depends(require_demo_payments_enabled)],
)
def simulate_demo_payment(
    payment_id: str,
    payload: DemoPaymentSimulation,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return demo_payment_service.simulate(
        db,
        payment_id=payment_id,
        user_id=current_user.id,
        scenario=payload.scenario,
    )
