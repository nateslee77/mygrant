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
    # Reaching current_exp_date no longer auto-closes a grant -- it stays
    # Active until someone explicitly closes it (status_override). See
    # is_expired() for the "past its expiration date but still open" flag.
    return "Active"


def is_expired(grant: Grant, today: date | None = None) -> bool:
    """True when an Active grant (not withdrawn, not manually closed) has
    passed its current_exp_date -- i.e. it needs someone to look at it and
    decide whether to close it, extend it, etc."""
    today = today or date.today()
    if grant.withdrawn or grant.status_override == "closed":
        return False
    return grant.current_exp_date is not None and grant.current_exp_date < today
