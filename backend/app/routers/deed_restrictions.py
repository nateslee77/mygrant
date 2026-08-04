import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_admin, require_editor
from app.models.models import DeedRestriction, User
from app.schemas.deed_restriction import (
    VALID_STATUSES,
    DeedRestrictionCreate,
    DeedRestrictionListResponse,
    DeedRestrictionOut,
    DeedRestrictionUpdate,
)
from app.services.audit import write_audit_log

router = APIRouter(prefix="/deed-restrictions", tags=["deed-restrictions"])


def _get_or_404(db: Session, item_id: uuid.UUID) -> DeedRestriction:
    item = db.get(DeedRestriction, item_id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deed restriction not found")
    return item


def _validate_status(value: str | None) -> None:
    if value is not None and value not in VALID_STATUSES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Status must be one of {sorted(VALID_STATUSES)}")


@router.get("", response_model=DeedRestrictionListResponse)
def list_deed_restrictions(db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    items = db.scalars(select(DeedRestriction).order_by(DeedRestriction.project_name)).all()
    recorded_count = sum(1 for i in items if i.status == "Recorded")
    draft_count = sum(1 for i in items if i.status == "Draft")
    return DeedRestrictionListResponse(
        items=items, total_count=len(items), recorded_count=recorded_count, draft_count=draft_count
    )


@router.post("", response_model=DeedRestrictionOut, status_code=status.HTTP_201_CREATED)
def create_deed_restriction(payload: DeedRestrictionCreate, db: Session = Depends(get_db), user: User = Depends(require_editor)):
    _validate_status(payload.status)
    item = DeedRestriction(**payload.model_dump())
    db.add(item)
    db.flush()

    write_audit_log(
        db,
        user_id=user.id,
        user_name=user.name,
        action="created_deed_restriction",
        table_name="deed_restrictions",
        record_id=item.id,
        detail={"after": payload.model_dump(mode="json")},
    )
    db.commit()
    db.refresh(item)
    return item


@router.patch("/{item_id}", response_model=DeedRestrictionOut)
def update_deed_restriction(item_id: uuid.UUID, payload: DeedRestrictionUpdate, db: Session = Depends(get_db), user: User = Depends(require_editor)):
    item = _get_or_404(db, item_id)
    _validate_status(payload.status)

    changes = payload.model_dump(exclude_unset=True)
    before = {k: getattr(item, k) for k in changes}
    for key, value in changes.items():
        setattr(item, key, value)

    write_audit_log(
        db,
        user_id=user.id,
        user_name=user.name,
        action="updated_deed_restriction",
        table_name="deed_restrictions",
        record_id=item.id,
        detail={"before": before, "after": changes},
    )
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_deed_restriction(item_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    item = _get_or_404(db, item_id)

    snapshot = {
        "project_name": item.project_name,
        "grantor": item.grantor,
        "funding_source": item.funding_source,
        "status": item.status,
        "notes": item.notes,
        "sharepoint_link": item.sharepoint_link,
    }

    write_audit_log(
        db,
        user_id=user.id,
        user_name=user.name,
        action="deleted_deed_restriction",
        table_name="deed_restrictions",
        record_id=item.id,
        detail={"project_name": item.project_name, "snapshot": snapshot},
    )

    db.delete(item)
    db.commit()
