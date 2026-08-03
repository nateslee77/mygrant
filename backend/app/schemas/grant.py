import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class GrantBase(BaseModel):
    project_name: str
    grantor: str | None = None
    funding_source: str | None = None
    grant_officer: str | None = None
    scope: str | None = None
    current_exp_date: date | None = None
    orig_exp_date: date | None = None
    amended_exp_date: date | None = None
    grant_amount: Decimal | None = None
    grants_manager: str | None = None
    program_manager: str | None = None
    district: int | None = None
    sharepoint_link: str | None = None
    withdrawn: bool = False


class GrantCreate(GrantBase):
    pass


class GrantUpdate(BaseModel):
    project_name: str | None = None
    grantor: str | None = None
    funding_source: str | None = None
    grant_officer: str | None = None
    scope: str | None = None
    current_exp_date: date | None = None
    orig_exp_date: date | None = None
    amended_exp_date: date | None = None
    grant_amount: Decimal | None = None
    grants_manager: str | None = None
    program_manager: str | None = None
    district: int | None = None
    withdrawn: bool | None = None


class SharePointLinkUpdate(BaseModel):
    sharepoint_link: str | None = None


class GrantOut(GrantBase):
    id: uuid.UUID
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class GrantListItem(BaseModel):
    id: uuid.UUID
    project_name: str
    grantor: str | None
    funding_source: str | None
    status: str
    district: int | None
    current_exp_date: date | None
    grant_amount: Decimal | None
    grants_manager: str | None

    class Config:
        from_attributes = True


class GrantListResponse(BaseModel):
    items: list[GrantListItem]
    total: int
    page: int
    page_size: int


class ExpiringGrantItem(BaseModel):
    id: uuid.UUID
    project_name: str
    grantor: str | None
    current_exp_date: date | None
    district: int | None

    class Config:
        from_attributes = True


class GrantNoteCreate(BaseModel):
    note_text: str


class GrantNoteOut(BaseModel):
    id: uuid.UUID
    grant_id: uuid.UUID
    user_id: uuid.UUID
    author_name: str
    note_text: str
    created_at: datetime

    class Config:
        from_attributes = True
