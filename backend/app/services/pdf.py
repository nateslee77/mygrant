import re
from datetime import date
from decimal import Decimal
from pathlib import Path

from jinja2 import Environment, FileSystemLoader

from app.models.models import Grant, GrantAward, GrantNote

TEMPLATE_DIR = Path(__file__).resolve().parents[1] / "templates"
_env = Environment(loader=FileSystemLoader(str(TEMPLATE_DIR)))

_STATUS_CLASS = {"Active": "active", "Closed": "closed", "Withdrawn": "withdrawn"}


def _safe_filename_part(text: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "_", text).strip("_")
    return slug or "grant"


def render_grant_pdf(grant: Grant, notes: list[GrantNote], status: str, generated_by_name: str) -> bytes:
    from weasyprint import HTML  # imported lazily: requires the GTK3 runtime (Pango/Cairo/GObject),
    # not available in every environment (notably plain Windows without it installed).

    template = _env.get_template("grant_snapshot.html")
    amount_display = f"${grant.grant_amount:,.2f}" if grant.grant_amount is not None else "—"
    sharepoint_is_url = bool(grant.sharepoint_link) and grant.sharepoint_link.strip().lower().startswith(("http://", "https://"))

    html_content = template.render(
        grant=grant,
        notes=notes,
        status=status,
        status_class=_STATUS_CLASS.get(status, "closed"),
        amount_display=amount_display,
        sharepoint_is_url=sharepoint_is_url,
        generated_date=date.today().strftime("%m/%d/%Y"),
        generated_by=generated_by_name,
    )
    return HTML(string=html_content).write_pdf()


def build_snapshot_filename(project_name: str) -> str:
    return f"{_safe_filename_part(project_name)}_snapshot_{date.today().isoformat()}.pdf"


def render_grant_awards_report_pdf(awards: list[GrantAward], generated_by_name: str) -> bytes:
    from weasyprint import HTML  # imported lazily: see note in render_grant_pdf above.

    template = _env.get_template("grant_awards_report.html")
    total_amount = sum((a.amount for a in awards if a.amount is not None), Decimal("0"))

    html_content = template.render(
        awards=awards,
        total_count=len(awards),
        total_amount_display=f"${total_amount:,.2f}",
        generated_date=date.today().strftime("%m/%d/%Y"),
        generated_by=generated_by_name,
    )
    return HTML(string=html_content).write_pdf()


def build_grant_awards_report_filename() -> str:
    return f"grants_awarded_report_{date.today().isoformat()}.pdf"


def render_monthly_report_pdf(data: dict, generated_by_name: str) -> bytes:
    from weasyprint import HTML  # imported lazily: see note in render_grant_pdf above.

    template = _env.get_template("monthly_report.html")
    html_content = template.render(
        **data,
        grants_awarded_amount_display=f"${data['grants_awarded_amount']:,.2f}",
        generated_date=date.today().strftime("%m/%d/%Y"),
        generated_by=generated_by_name,
    )
    return HTML(string=html_content).write_pdf()
