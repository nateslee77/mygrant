import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_admin, require_editor
from app.models.models import Grant, GrantNote, User
from app.schemas.grant import (
    GrantBase,
    GrantCreate,
    GrantListItem,
    GrantListResponse,
    GrantNoteCreate,
    GrantNoteOut,
    GrantOut,
    GrantUpdate,
    SharePointLinkUpdate,
)
from app.services.audit import write_audit_log
from app.services.grant_status import compute_status
from app.services.pdf import build_grants_report_filename, build_snapshot_filename, render_grant_pdf, render_grants_report_pdf

router = APIRouter(prefix="/grants", tags=["grants"])


def _get_grant_or_404(db: Session, grant_id: uuid.UUID) -> Grant:
    grant = db.get(Grant, grant_id)
    if grant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grant not found")
    return grant


def _to_list_item(grant: Grant) -> GrantListItem:
    return GrantListItem(
        id=grant.id,
        project_name=grant.project_name,
        grantor=grant.grantor,
        funding_source=grant.funding_source,
        grant_officer=grant.grant_officer,
        scope=grant.scope,
        status=compute_status(grant),
        district=grant.district,
        orig_exp_date=grant.orig_exp_date,
        current_exp_date=grant.current_exp_date,
        amended_exp_date=grant.amended_exp_date,
        grant_amount=grant.grant_amount,
        grants_manager=grant.grants_manager,
        program_manager=grant.program_manager,
        sharepoint_link=grant.sharepoint_link,
    )


def _to_out(grant: Grant) -> GrantOut:
    base = GrantBase.model_validate(grant, from_attributes=True)
    return GrantOut(
        **base.model_dump(),
        id=grant.id,
        status=compute_status(grant),
        created_at=grant.created_at,
        updated_at=grant.updated_at,
    )


@router.get("", response_model=GrantListResponse)
def list_grants(
    status_filter: str | None = Query(default=None, alias="status"),
    district: int | None = None,
    grantor: str | None = None,
    grants_manager: str | None = None,
    funding_source: str | None = None,
    search: str | None = None,
    expiring_within: int | None = None,
    page: int = 1,
    page_size: int = 50,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    query = select(Grant)
    if district is not None:
        query = query.where(Grant.district == district)
    if grantor:
        query = query.where(Grant.grantor == grantor)
    if grants_manager:
        query = query.where(Grant.grants_manager == grants_manager)
    if funding_source:
        query = query.where(Grant.funding_source == funding_source)
    if search:
        query = query.where(Grant.project_name.ilike(f"%{search}%"))

    all_matching = db.scalars(query.order_by(Grant.project_name.asc())).all()

    if status_filter:
        all_matching = [g for g in all_matching if compute_status(g) == status_filter]

    if expiring_within is not None:
        today = date.today()
        window_end = today + timedelta(days=expiring_within)
        all_matching = [
            g for g in all_matching
            if g.current_exp_date is not None and today <= g.current_exp_date <= window_end
        ]

    total = len(all_matching)
    start = (page - 1) * page_size
    page_items = all_matching[start : start + page_size]

    return GrantListResponse(
        items=[_to_list_item(g) for g in page_items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/report/pdf")
def download_grants_report(
    report_type: str = Query(default="full"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if report_type not in ("full", "summary"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "report_type must be 'full' or 'summary'")

    grants = db.scalars(select(Grant)).all()
    pdf_bytes = render_grants_report_pdf(grants, report_type, user.name)
    filename = build_grants_report_filename(report_type)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{grant_id}", response_model=GrantOut)
def get_grant(grant_id: uuid.UUID, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    grant = _get_grant_or_404(db, grant_id)
    return _to_out(grant)


@router.post("", response_model=GrantOut, status_code=status.HTTP_201_CREATED)
def create_grant(payload: GrantCreate, db: Session = Depends(get_db), user: User = Depends(require_editor)):
    grant = Grant(**payload.model_dump())
    db.add(grant)
    db.flush()

    write_audit_log(
        db,
        user_id=user.id,
        user_name=user.name,
        action="created_grant",
        table_name="grants",
        record_id=grant.id,
        detail={"after": payload.model_dump(mode="json")},
    )
    db.commit()
    db.refresh(grant)
    return _to_out(grant)


@router.patch("/{grant_id}", response_model=GrantOut)
def update_grant(grant_id: uuid.UUID, payload: GrantUpdate, db: Session = Depends(get_db), user: User = Depends(require_editor)):
    grant = _get_grant_or_404(db, grant_id)

    changes = payload.model_dump(exclude_unset=True)
    if changes.get("status_override") == "auto":
        changes["status_override"] = None
    before = {k: getattr(grant, k) for k in changes}
    for key, value in changes.items():
        setattr(grant, key, value)

    write_audit_log(
        db,
        user_id=user.id,
        user_name=user.name,
        action="updated_grant",
        table_name="grants",
        record_id=grant.id,
        detail={"before": _jsonable(before), "after": _jsonable(changes)},
    )
    db.commit()
    db.refresh(grant)
    return _to_out(grant)


@router.delete("/{grant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_grant(grant_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    grant = _get_grant_or_404(db, grant_id)

    snapshot = GrantBase.model_validate(grant, from_attributes=True).model_dump(mode="json")
    snapshot["created_at"] = grant.created_at.isoformat()

    notes = db.scalars(select(GrantNote).where(GrantNote.grant_id == grant.id)).all()
    notes_snapshot = [
        {
            "id": str(n.id),
            "user_id": str(n.user_id) if n.user_id else None,
            "author_name": n.author_name,
            "note_text": n.note_text,
            "created_at": n.created_at.isoformat(),
        }
        for n in notes
    ]

    write_audit_log(
        db,
        user_id=user.id,
        user_name=user.name,
        action="deleted_grant",
        table_name="grants",
        record_id=grant.id,
        detail={"project_name": grant.project_name, "snapshot": snapshot, "notes_snapshot": notes_snapshot},
    )

    db.delete(grant)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/{grant_id}/sharepoint-link", response_model=GrantOut)
def update_sharepoint_link(grant_id: uuid.UUID, payload: SharePointLinkUpdate, db: Session = Depends(get_db), user: User = Depends(require_editor)):
    grant = _get_grant_or_404(db, grant_id)
    before = grant.sharepoint_link
    grant.sharepoint_link = payload.sharepoint_link

    write_audit_log(
        db,
        user_id=user.id,
        user_name=user.name,
        action="updated_sharepoint_link",
        table_name="grants",
        record_id=grant.id,
        detail={"before": before, "after": payload.sharepoint_link},
    )
    db.commit()
    db.refresh(grant)
    return _to_out(grant)


@router.get("/{grant_id}/notes", response_model=list[GrantNoteOut])
def list_notes(grant_id: uuid.UUID, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    _get_grant_or_404(db, grant_id)
    notes = db.scalars(
        select(GrantNote)
        .where(GrantNote.grant_id == grant_id)
        .order_by(GrantNote.created_at.desc())
    ).all()
    return [
        GrantNoteOut(
            id=n.id,
            grant_id=n.grant_id,
            user_id=n.user_id,
            author_name=n.author_name,
            note_text=n.note_text,
            created_at=n.created_at,
        )
        for n in notes
    ]


@router.post("/{grant_id}/notes", response_model=GrantNoteOut, status_code=status.HTTP_201_CREATED)
def add_note(grant_id: uuid.UUID, payload: GrantNoteCreate, db: Session = Depends(get_db), user: User = Depends(require_editor)):
    grant = _get_grant_or_404(db, grant_id)

    note = GrantNote(grant_id=grant.id, user_id=user.id, author_name=user.name, note_text=payload.note_text)
    db.add(note)
    db.flush()

    write_audit_log(
        db,
        user_id=user.id,
        user_name=user.name,
        action="added_note",
        table_name="grant_notes",
        record_id=note.id,
        detail={"grant_id": str(grant.id), "note_text": payload.note_text},
    )

    db.commit()
    db.refresh(note)

    return GrantNoteOut(
        id=note.id,
        grant_id=note.grant_id,
        user_id=note.user_id,
        author_name=user.name,
        note_text=note.note_text,
        created_at=note.created_at,
    )


@router.delete("/{grant_id}/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(grant_id: uuid.UUID, note_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require_editor)):
    grant = _get_grant_or_404(db, grant_id)
    note = db.get(GrantNote, note_id)
    if note is None or note.grant_id != grant.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")

    write_audit_log(
        db,
        user_id=user.id,
        user_name=user.name,
        action="deleted_note",
        table_name="grant_notes",
        record_id=note.id,
        detail={
            "grant_id": str(grant.id),
            "note_text": note.note_text,
            "note_user_id": str(note.user_id) if note.user_id else None,
            "note_author_name": note.author_name,
            "note_created_at": note.created_at.isoformat(),
        },
    )

    db.delete(note)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{grant_id}/pdf")
def download_pdf(grant_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    grant = _get_grant_or_404(db, grant_id)
    notes = db.scalars(
        select(GrantNote)
        .where(GrantNote.grant_id == grant_id)
        .order_by(GrantNote.created_at.asc())
    ).all()

    pdf_bytes = render_grant_pdf(grant, notes, compute_status(grant), user.name)
    filename = build_snapshot_filename(grant.project_name)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _jsonable(d: dict) -> dict:
    out = {}
    for k, v in d.items():
        if hasattr(v, "isoformat"):
            out[k] = v.isoformat()
        else:
            out[k] = v if isinstance(v, (str, int, float, bool)) or v is None else str(v)
    return out
