import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class GrantAwardBase(BaseModel):
    project_name: str
    grantor: str | None = None
    award_date: date | None = None
    amount: Decimal | None = None


class GrantAwardCreate(GrantAwardBase):
    pass


class GrantAwardUpdate(BaseModel):
    project_name: str | None = None
    grantor: str | None = None
    award_date: date | None = None
    amount: Decimal | None = None


class GrantAwardOut(GrantAwardBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class GrantAwardListResponse(BaseModel):
    items: list[GrantAwardOut]
    total_count: int
    total_amount: Decimal
