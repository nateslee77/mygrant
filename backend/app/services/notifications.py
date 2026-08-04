import uuid
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.models import Grant, Notification, User

EXPIRING_WINDOW_DAYS = 30


def notify_users(db: Session, *, user_ids: list[uuid.UUID], grant_id: uuid.UUID | None, type_: str, message: str) -> None:
    for uid in user_ids:
        db.add(Notification(user_id=uid, grant_id=grant_id, type=type_, message=message))


def check_and_notify_expiring_grants(db: Session) -> None:
    """Run as a cheap check on relevant reads. Creates one 'grant_expiring'
    notification per active user for any grant that has newly entered the
    30-day expiration window and hasn't already been notified about."""
    today = date.today()
    window_end = today + timedelta(days=EXPIRING_WINDOW_DAYS)

    candidate_grants = db.scalars(
        select(Grant).where(
            Grant.withdrawn.is_(False),
            Grant.current_exp_date.isnot(None),
            Grant.current_exp_date >= today,
            Grant.current_exp_date <= window_end,
        )
    ).all()

    if not candidate_grants:
        return

    already_notified_grant_ids = set(
        db.scalars(
            select(Notification.grant_id).where(
                Notification.type == "grant_expiring",
                Notification.grant_id.in_([g.id for g in candidate_grants]),
            )
        ).all()
    )

    recipient_ids = db.scalars(
        select(User.id).where(User.status == "active", User.role.in_(("admin", "editor")))
    ).all()
    if not recipient_ids:
        return

    for grant in candidate_grants:
        if grant.id in already_notified_grant_ids:
            continue
        message = f"{grant.project_name} is expiring on {grant.current_exp_date.isoformat()}"
        notify_users(db, user_ids=recipient_ids, grant_id=grant.id, type_="grant_expiring", message=message)
