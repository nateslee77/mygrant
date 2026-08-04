import uuid
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.models import Grant, Notification, PSRDueDate, PSRProject, User

EXPIRING_WINDOW_DAYS = 30
PSR_DUE_THRESHOLDS = (30, 14, 7)  # days-before-due reminders, checked closest-first


def notify_users(
    db: Session,
    *,
    user_ids: list[uuid.UUID],
    grant_id: uuid.UUID | None = None,
    psr_due_date_id: uuid.UUID | None = None,
    type_: str,
    message: str,
) -> None:
    for uid in user_ids:
        db.add(Notification(user_id=uid, grant_id=grant_id, psr_due_date_id=psr_due_date_id, type=type_, message=message))


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


def check_and_notify_psr_due_dates(db: Session) -> None:
    """Run as a cheap check on relevant reads. For each unsubmitted PSR due
    date within 30/14/7 days of its due date, sends one reminder per
    threshold it has newly crossed into (closest threshold that applies),
    to every active admin/editor, without re-sending a threshold already
    notified for that due date."""
    today = date.today()
    window_end = today + timedelta(days=max(PSR_DUE_THRESHOLDS))

    candidates = db.scalars(
        select(PSRDueDate).where(
            PSRDueDate.submitted.is_(False),
            PSRDueDate.due_date >= today,
            PSRDueDate.due_date <= window_end,
        )
    ).all()

    if not candidates:
        return

    recipient_ids = db.scalars(
        select(User.id).where(User.status == "active", User.role.in_(("admin", "editor")))
    ).all()
    if not recipient_ids:
        return

    already_notified = set(
        db.execute(
            select(Notification.psr_due_date_id, Notification.type).where(
                Notification.psr_due_date_id.in_([d.id for d in candidates])
            )
        ).all()
    )

    for due in candidates:
        days_left = (due.due_date - today).days
        threshold = next((t for t in sorted(PSR_DUE_THRESHOLDS) if days_left <= t), None)
        if threshold is None:
            continue
        type_ = f"psr_due_{threshold}"
        if (due.id, type_) in already_notified:
            continue
        project = db.get(PSRProject, due.project_id)
        if project is None:
            continue
        message = f"{project.project_name} PSR due {due.due_date.isoformat()} ({threshold}-day reminder)"
        notify_users(db, user_ids=recipient_ids, psr_due_date_id=due.id, type_=type_, message=message)
