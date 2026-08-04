import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.core.deps import get_current_user, require_admin, require_editor
from app.models.models import PSRDueDate, PSRNote, PSRProject, User
from app.schemas.psr import (
    PSRDueDateCreate,
    PSRDueDateUpdate,
    PSRNoteCreate,
    PSRProjectCreate,
    PSRProjectListResponse,
    PSRProjectOut,
    PSRProjectUpdate,
)
from app.services.audit import write_audit_log

router = APIRouter(prefix="/psr-projects", tags=["psr"])

DUE_SOON_WINDOW_DAYS = 30


def _get_project_or_404(db: Session, project_id: uuid.UUID) -> PSRProject:
    project = db.get(PSRProject, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Status report project not found")
    return project


def _project_snapshot(project: PSRProject) -> dict:
    return {
        "project_name": project.project_name,
        "category": project.category,
        "grantor": project.grantor,
        "funding_source": project.funding_source,
        "ad_number": project.ad_number,
        "district": project.district,
        "grant_manager": project.grant_manager,
        "performance_end_date": project.performance_end_date.isoformat() if project.performance_end_date else None,
    }


@router.get("", response_model=PSRProjectListResponse)
def list_psr_projects(db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    items = db.scalars(
        select(PSRProject)
        .options(selectinload(PSRProject.due_dates), selectinload(PSRProject.notes))
        .order_by(PSRProject.project_name)
    ).all()

    today = date.today()
    window_end = today + timedelta(days=DUE_SOON_WINDOW_DAYS)
    due_soon_count = sum(
        1
        for p in items
        for d in p.due_dates
        if not d.submitted and d.due_date is not None and today <= d.due_date <= window_end
    )

    return PSRProjectListResponse(items=items, total_count=len(items), due_soon_count=due_soon_count)


@router.post("", response_model=PSRProjectOut, status_code=status.HTTP_201_CREATED)
def create_psr_project(payload: PSRProjectCreate, db: Session = Depends(get_db), user: User = Depends(require_editor)):
    project = PSRProject(**payload.model_dump())
    db.add(project)
    db.flush()

    write_audit_log(
        db,
        user_id=user.id,
        user_name=user.name,
        action="created_psr_project",
        table_name="psr_projects",
        record_id=project.id,
        detail={"after": payload.model_dump(mode="json")},
    )
    db.commit()
    db.refresh(project)
    return project


@router.patch("/{project_id}", response_model=PSRProjectOut)
def update_psr_project(project_id: uuid.UUID, payload: PSRProjectUpdate, db: Session = Depends(get_db), user: User = Depends(require_editor)):
    project = _get_project_or_404(db, project_id)

    changes = payload.model_dump(exclude_unset=True)
    before = {k: getattr(project, k) for k in changes}
    for key, value in changes.items():
        setattr(project, key, value)

    def _jsonable(d: dict) -> dict:
        return {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in d.items()}

    write_audit_log(
        db,
        user_id=user.id,
        user_name=user.name,
        action="updated_psr_project",
        table_name="psr_projects",
        record_id=project.id,
        detail={"before": _jsonable(before), "after": _jsonable(changes)},
    )
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_psr_project(project_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    project = _get_project_or_404(db, project_id)

    due_dates_snapshot = [
        {"due_date": d.due_date.isoformat(), "submitted": d.submitted, "submitted_date": d.submitted_date.isoformat() if d.submitted_date else None}
        for d in project.due_dates
    ]
    notes_snapshot = [
        {"author_name": n.author_name, "note_text": n.note_text, "created_at": n.created_at.isoformat()} for n in project.notes
    ]

    write_audit_log(
        db,
        user_id=user.id,
        user_name=user.name,
        action="deleted_psr_project",
        table_name="psr_projects",
        record_id=project.id,
        detail={
            "project_name": project.project_name,
            "snapshot": _project_snapshot(project),
            "due_dates_snapshot": due_dates_snapshot,
            "notes_snapshot": notes_snapshot,
        },
    )

    db.delete(project)
    db.commit()


@router.post("/{project_id}/due-dates", response_model=PSRProjectOut, status_code=status.HTTP_201_CREATED)
def add_due_date(project_id: uuid.UUID, payload: PSRDueDateCreate, db: Session = Depends(get_db), user: User = Depends(require_editor)):
    project = _get_project_or_404(db, project_id)
    due = PSRDueDate(project_id=project.id, **payload.model_dump())
    db.add(due)
    db.flush()

    write_audit_log(
        db,
        user_id=user.id,
        user_name=user.name,
        action="added_psr_due_date",
        table_name="psr_due_dates",
        record_id=due.id,
        detail={"project_id": str(project.id), "project_name": project.project_name, "due_date": payload.due_date.isoformat()},
    )
    db.commit()
    db.refresh(project)
    return project


@router.patch("/{project_id}/due-dates/{due_id}", response_model=PSRProjectOut)
def update_due_date(
    project_id: uuid.UUID, due_id: uuid.UUID, payload: PSRDueDateUpdate, db: Session = Depends(get_db), user: User = Depends(require_editor)
):
    project = _get_project_or_404(db, project_id)
    due = db.get(PSRDueDate, due_id)
    if due is None or due.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Due date not found")

    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(due, key, value)

    write_audit_log(
        db,
        user_id=user.id,
        user_name=user.name,
        action="updated_psr_due_date",
        table_name="psr_due_dates",
        record_id=due.id,
        detail={"project_id": str(project.id), "project_name": project.project_name, "changes": {k: str(v) for k, v in changes.items()}},
    )
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}/due-dates/{due_id}", response_model=PSRProjectOut)
def delete_due_date(project_id: uuid.UUID, due_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require_editor)):
    project = _get_project_or_404(db, project_id)
    due = db.get(PSRDueDate, due_id)
    if due is None or due.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Due date not found")

    write_audit_log(
        db,
        user_id=user.id,
        user_name=user.name,
        action="deleted_psr_due_date",
        table_name="psr_due_dates",
        record_id=due.id,
        detail={"project_id": str(project.id), "project_name": project.project_name, "due_date": due.due_date.isoformat()},
    )
    db.delete(due)
    db.commit()
    db.refresh(project)
    return project


@router.post("/{project_id}/notes", response_model=PSRProjectOut, status_code=status.HTTP_201_CREATED)
def add_note(project_id: uuid.UUID, payload: PSRNoteCreate, db: Session = Depends(get_db), user: User = Depends(require_editor)):
    project = _get_project_or_404(db, project_id)
    note = PSRNote(project_id=project.id, user_id=user.id, author_name=user.name, note_text=payload.note_text)
    db.add(note)
    db.flush()

    write_audit_log(
        db,
        user_id=user.id,
        user_name=user.name,
        action="added_psr_note",
        table_name="psr_notes",
        record_id=note.id,
        detail={"project_id": str(project.id), "project_name": project.project_name, "note_text": payload.note_text},
    )
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}/notes/{note_id}", response_model=PSRProjectOut)
def delete_note(project_id: uuid.UUID, note_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require_editor)):
    project = _get_project_or_404(db, project_id)
    note = db.get(PSRNote, note_id)
    if note is None or note.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")

    write_audit_log(
        db,
        user_id=user.id,
        user_name=user.name,
        action="deleted_psr_note",
        table_name="psr_notes",
        record_id=note.id,
        detail={"project_id": str(project.id), "project_name": project.project_name, "note_text": note.note_text},
    )
    db.delete(note)
    db.commit()
    db.refresh(project)
    return project
