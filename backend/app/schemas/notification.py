import uuid
from datetime import datetime

from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: uuid.UUID
    grant_id: uuid.UUID | None
    type: str
    message: str
    read: bool
    created_at: datetime

    class Config:
        from_attributes = True
