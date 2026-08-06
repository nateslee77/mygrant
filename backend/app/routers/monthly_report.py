from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.models import User
from app.schemas.monthly_report import MonthlyReportResponse
from app.services.monthly_report import build_monthly_report_filename, fetch_monthly_report, parse_month, render_monthly_report_docx
from app.services.pdf import render_monthly_report_pdf

router = APIRouter(prefix="/monthly-report", tags=["monthly-report"])


@router.get("", response_model=MonthlyReportResponse)
def get_monthly_report(month: str, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    year, month_num = parse_month(month)
    return fetch_monthly_report(db, year, month_num)


@router.get("/pdf")
def download_monthly_report_pdf(month: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    year, month_num = parse_month(month)
    data = fetch_monthly_report(db, year, month_num)
    pdf_bytes = render_monthly_report_pdf(data, user.name)
    filename = build_monthly_report_filename(data["month"], "pdf")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/docx")
def download_monthly_report_docx(month: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    year, month_num = parse_month(month)
    data = fetch_monthly_report(db, year, month_num)
    docx_bytes = render_monthly_report_docx(data, user.name)
    filename = build_monthly_report_filename(data["month"], "docx")

    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
