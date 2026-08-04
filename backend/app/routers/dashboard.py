from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.models import Grant, GrantAward, PSRDueDate, User
from app.schemas.dashboard import DashboardStats
from app.schemas.grant import ExpiringGrantItem
from app.services.grant_status import compute_status
from app.services.notifications import check_and_notify_expiring_grants, check_and_notify_psr_due_dates

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=DashboardStats)
def get_stats(db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    check_and_notify_expiring_grants(db)
    check_and_notify_psr_due_dates(db)
    db.commit()

    grants = db.scalars(select(Grant)).all()

    active_count = 0
    closed_count = 0
    total_active_funding = Decimal("0")

    for grant in grants:
        s = compute_status(grant)
        if s == "Active":
            active_count += 1
            if grant.grant_amount is not None:
                total_active_funding += grant.grant_amount
        elif s == "Closed":
            closed_count += 1

    awards = db.scalars(select(GrantAward)).all()
    total_awards_count = len(awards)
    total_awards_amount = sum((a.amount for a in awards if a.amount is not None), Decimal("0"))

    today = date.today()
    psr_due_soon_count = db.scalar(
        select(func.count()).select_from(PSRDueDate).where(
            PSRDueDate.submitted.is_(False),
            PSRDueDate.due_date >= today,
            PSRDueDate.due_date <= today + timedelta(days=30),
        )
    )

    return DashboardStats(
        active_count=active_count,
        closed_count=closed_count,
        total_active_funding=total_active_funding,
        total_awards_count=total_awards_count,
        total_awards_amount=total_awards_amount,
        psr_due_soon_count=psr_due_soon_count or 0,
    )


@router.get("/expiring", response_model=list[ExpiringGrantItem])
def get_expiring(window: int = 30, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    if window not in (30, 180):
        window = 30

    today = date.today()
    window_end = today + timedelta(days=window)

    grants = db.scalars(
        select(Grant)
        .where(
            Grant.withdrawn.is_(False),
            Grant.current_exp_date.isnot(None),
            Grant.current_exp_date >= today,
            Grant.current_exp_date <= window_end,
        )
        .order_by(Grant.current_exp_date.asc())
    ).all()

    return [ExpiringGrantItem.model_validate(g, from_attributes=True) for g in grants]
