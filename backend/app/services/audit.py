import uuid

from sqlalchemy.orm import Session

from app.models.models import AuditLog


def write_audit_log(
    db: Session,
    *,
    user_id: uuid.UUID | None,
    user_name: str | None = None,
    action: str,
    table_name: str,
    record_id: uuid.UUID | None,
    detail: dict | None = None,
) -> None:
    entry = AuditLog(
        user_id=user_id,
        user_name=user_name,
        action=action,
        table_name=table_name,
        record_id=record_id,
        detail=detail,
    )
    db.add(entry)
