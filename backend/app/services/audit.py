import uuid

from sqlalchemy.orm import Session

from app.models.models import AuditLog


def write_audit_log(
    db: Session,
    *,
    user_id: uuid.UUID | None,
    action: str,
    table_name: str,
    record_id: uuid.UUID | None,
    detail: dict | None = None,
) -> None:
    entry = AuditLog(
        user_id=user_id,
        action=action,
        table_name=table_name,
        record_id=record_id,
        detail=detail,
    )
    db.add(entry)
