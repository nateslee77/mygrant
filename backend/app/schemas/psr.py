import uuid
from datetime import date, datetime

from pydantic import BaseModel

CATEGORIES = [
    "RPOSD",
    "State of California NRA",
    "Conservancy (RMC,BHUWC)",
    "Cooling Amenities and Fairfax",
    "Other",
]


class PSRDueDateCreate(BaseModel):
    due_date: date
    submitted: bool = False
    submitted_date: date | None = None


class PSRDueDateUpdate(BaseModel):
    due_date: date | None = None
    submitted: bool | None = None
    submitted_date: date | None = None


class PSRDueDateOut(BaseModel):
    id: uuid.UUID
    due_date: date
    submitted: bool
    submitted_date: date | None

    class Config:
        from_attributes = True


class PSRNoteCreate(BaseModel):
    note_text: str


class PSRNoteOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    user_id: uuid.UUID | None
    author_name: str
    note_text: str
    created_at: datetime

    class Config:
        from_attributes = True


class PSRProjectBase(BaseModel):
    project_name: str
    category: str
    grantor: str | None = None
    funding_source: str | None = None
    ad_number: str | None = None
    district: int | None = None
    grant_manager: str | None = None
    performance_end_date: date | None = None
    link: str | None = None


class PSRProjectCreate(PSRProjectBase):
    pass


class PSRProjectUpdate(BaseModel):
    project_name: str | None = None
    category: str | None = None
    grantor: str | None = None
    funding_source: str | None = None
    ad_number: str | None = None
    district: int | None = None
    grant_manager: str | None = None
    performance_end_date: date | None = None
    link: str | None = None


class PSRProjectOut(PSRProjectBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    due_dates: list[PSRDueDateOut] = []
    notes: list[PSRNoteOut] = []

    class Config:
        from_attributes = True


class PSRProjectListResponse(BaseModel):
    items: list[PSRProjectOut]
    total_count: int
    due_soon_count: int
