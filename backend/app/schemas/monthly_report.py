import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class MonthlyReportPSRItem(BaseModel):
    due_date_id: uuid.UUID
    project_id: uuid.UUID
    project_name: str
    category: str
    grantor: str | None
    due_date: date
    submitted: bool
    submitted_date: date | None


class MonthlyReportPerformanceEndingItem(BaseModel):
    project_id: uuid.UUID
    project_name: str
    category: str
    grantor: str | None
    performance_end_date: date


class MonthlyReportAwardItem(BaseModel):
    id: uuid.UUID
    project_name: str
    grantor: str | None
    award_date: date | None
    amount: Decimal | None

    class Config:
        from_attributes = True


class MonthlyReportExpiringGrantItem(BaseModel):
    id: uuid.UUID
    project_name: str
    grantor: str | None
    current_exp_date: date | None
    district: int | None
    grant_amount: Decimal | None

    class Config:
        from_attributes = True


class MonthlyReportResponse(BaseModel):
    month: str
    month_label: str

    psr_submitted: list[MonthlyReportPSRItem]
    grants_awarded: list[MonthlyReportAwardItem]
    psr_due: list[MonthlyReportPSRItem]
    psr_performance_ending: list[MonthlyReportPerformanceEndingItem]
    grants_expiring: list[MonthlyReportExpiringGrantItem]

    psr_submitted_count: int
    grants_awarded_count: int
    grants_awarded_amount: Decimal
    psr_due_count: int
    psr_performance_ending_count: int
    grants_expiring_count: int
