import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr


class UserOut(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    role: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class InviteRequest(BaseModel):
    email: EmailStr
    role: str
    name: str | None = None


class RoleChangeRequest(BaseModel):
    role: str
