import uuid
from datetime import datetime

from pydantic import BaseModel

VALID_STATUSES = {"Recorded", "Draft"}


class DeedRestrictionBase(BaseModel):
    project_name: str
    grantor: str | None = None
    funding_source: str | None = None
    status: str = "Draft"
    notes: str | None = None
    sharepoint_link: str | None = None


class DeedRestrictionCreate(DeedRestrictionBase):
    pass


class DeedRestrictionUpdate(BaseModel):
    project_name: str | None = None
    grantor: str | None = None
    funding_source: str | None = None
    status: str | None = None
    notes: str | None = None
    sharepoint_link: str | None = None


class DeedRestrictionOut(DeedRestrictionBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DeedRestrictionListResponse(BaseModel):
    items: list[DeedRestrictionOut]
    total_count: int
    recorded_count: int
    draft_count: int
