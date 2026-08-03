import uuid
from datetime import datetime

from pydantic import BaseModel


class AuditLogOut(BaseModel):
    id: uuid.UUID
    user_name: str
    action: str
    table_name: str
    record_id: uuid.UUID | None
    detail: dict | None
    grant_project_name: str | None
    created_at: datetime


class AuditLogResponse(BaseModel):
    items: list[AuditLogOut]
    total: int
    page: int
    page_size: int
