import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

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
    status_override: Literal["active", "closed"] | None = None


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
    status_override: Literal["active", "closed", "auto"] | None = None


class SharePointLinkUpdate(BaseModel):
    sharepoint_link: str | None = None


class GrantOut(GrantBase):
    id: uuid.UUID
    status: str
    is_expired: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class GrantListItem(BaseModel):
    id: uuid.UUID
    project_name: str
    grantor: str | None
    funding_source: str | None
    grant_officer: str | None
    scope: str | None
    status: str
    is_expired: bool
    district: int | None
    orig_exp_date: date | None
    current_exp_date: date | None
    amended_exp_date: date | None
    grant_amount: Decimal | None
    grants_manager: str | None
    program_manager: str | None
    sharepoint_link: str | None

    class Config:
        from_attributes = True


class GrantListResponse(BaseModel):
    items: list[GrantListItem]
    total: int
    page: int
    page_size: int


class GrantsReportRequest(BaseModel):
    report_type: Literal["full", "summary"] = "full"
    # The exact set of grants currently visible on the All Grants page (after its
    # client-side tab/search/column filters), so the report matches what's on
    # screen rather than re-deriving filter logic server-side. None = all grants.
    grant_ids: list[uuid.UUID] | None = None
    # Human-readable summary of whatever filters produced grant_ids (e.g.
    # "Status: Active; Grantor: State of California"), printed on the report
    # so readers know its scope. None/blank = no filters applied.
    filters_description: str | None = None


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
    user_id: uuid.UUID | None
    author_name: str
    note_text: str
    created_at: datetime

    class Config:
        from_attributes = True
