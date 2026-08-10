import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_editor
from app.models.models import MonthlyReportNote, User
from app.schemas.monthly_report import MonthlyReportNoteCreate, MonthlyReportResponse
from app.services.audit import write_audit_log
from app.services.monthly_report import build_monthly_report_filename, fetch_monthly_report, parse_month, render_monthly_report_docx
from app.services.pdf import render_monthly_report_pdf

router = APIRouter(prefix="/monthly-report", tags=["monthly-report"])


@router.get("", response_model=MonthlyReportResponse)
def get_monthly_report(month: str, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    year, month_num = parse_month(month)
    return fetch_monthly_report(db, year, month_num)


@router.post("/notes", response_model=MonthlyReportResponse, status_code=status.HTTP_201_CREATED)
def add_monthly_report_note(
    month: str, payload: MonthlyReportNoteCreate, db: Session = Depends(get_db), user: User = Depends(require_editor)
):
    year, month_num = parse_month(month)
    note = MonthlyReportNote(month=f"{year:04d}-{month_num:02d}", user_id=user.id, author_name=user.name, note_text=payload.note_text)
    db.add(note)
    db.flush()

    write_audit_log(
        db,
        user_id=user.id,
        user_name=user.name,
        action="added_monthly_report_note",
        table_name="monthly_report_notes",
        record_id=note.id,
        detail={"month": note.month, "note_text": payload.note_text},
    )
    db.commit()
    return fetch_monthly_report(db, year, month_num)


@router.delete("/notes/{note_id}", response_model=MonthlyReportResponse)
def delete_monthly_report_note(note_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require_editor)):
    note = db.get(MonthlyReportNote, note_id)
    if note is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")

    year, month_num = parse_month(note.month)

    write_audit_log(
        db,
        user_id=user.id,
        user_name=user.name,
        action="deleted_monthly_report_note",
        table_name="monthly_report_notes",
        record_id=note.id,
        detail={"month": note.month, "note_text": note.note_text},
    )
    db.delete(note)
    db.commit()
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
