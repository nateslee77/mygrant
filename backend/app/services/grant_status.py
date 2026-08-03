from datetime import date

from app.models.models import Grant


def compute_status(grant: Grant, today: date | None = None) -> str:
    today = today or date.today()
    if grant.withdrawn:
        return "Withdrawn"
    if grant.status_override == "active":
        return "Active"
    if grant.status_override == "closed":
        return "Closed"
    if grant.current_exp_date is not None and grant.current_exp_date < today:
        return "Closed"
    return "Active"
