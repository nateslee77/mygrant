from decimal import Decimal

from pydantic import BaseModel


class DashboardStats(BaseModel):
    active_count: int
    closed_count: int
    total_active_funding: Decimal
