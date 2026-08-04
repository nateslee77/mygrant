import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_admin, require_editor
from app.models.models import GrantAward, User
from app.schemas.grant_award import (
    GrantAwardCreate,
    GrantAwardListResponse,
    GrantAwardOut,
    GrantAwardUpdate,
)
from app.services.audit import write_audit_log

router = APIRouter(prefix="/grant-awards", tags=["grant-awards"])


def _get_award_or_404(db: Session, award_id: uuid.UUID) -> GrantAward:
    award = db.get(GrantAward, award_id)
    if award is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grant award not found")
    return award


@router.get("", response_model=GrantAwardListResponse)
def list_grant_awards(db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    awards = db.scalars(select(GrantAward).order_by(GrantAward.award_date.desc().nulls_last())).all()
    total_amount = sum((a.amount for a in awards if a.amount is not None), Decimal("0"))
    return GrantAwardListResponse(items=awards, total_count=len(awards), total_amount=total_amount)


@router.post("", response_model=GrantAwardOut, status_code=status.HTTP_201_CREATED)
def create_grant_award(payload: GrantAwardCreate, db: Session = Depends(get_db), user: User = Depends(require_editor)):
    award = GrantAward(**payload.model_dump())
    db.add(award)
    db.flush()

    write_audit_log(
        db,
        user_id=user.id,
        action="created_award",
        table_name="grant_awards",
        record_id=award.id,
        detail={"after": payload.model_dump(mode="json")},
    )
    db.commit()
    db.refresh(award)
    return award


@router.patch("/{award_id}", response_model=GrantAwardOut)
def update_grant_award(award_id: uuid.UUID, payload: GrantAwardUpdate, db: Session = Depends(get_db), user: User = Depends(require_editor)):
    award = _get_award_or_404(db, award_id)

    changes = payload.model_dump(exclude_unset=True)
    before = {k: getattr(award, k) for k in changes}
    for key, value in changes.items():
        setattr(award, key, value)

    def _jsonable(d: dict) -> dict:
        out = {}
        for k, v in d.items():
            out[k] = v.isoformat() if hasattr(v, "isoformat") else (str(v) if isinstance(v, Decimal) else v)
        return out

    write_audit_log(
        db,
        user_id=user.id,
        action="updated_award",
        table_name="grant_awards",
        record_id=award.id,
        detail={"before": _jsonable(before), "after": _jsonable(changes)},
    )
    db.commit()
    db.refresh(award)
    return award


@router.delete("/{award_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_grant_award(award_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    award = _get_award_or_404(db, award_id)

    snapshot = {
        "project_name": award.project_name,
        "grantor": award.grantor,
        "award_date": award.award_date.isoformat() if award.award_date else None,
        "amount": str(award.amount) if award.amount is not None else None,
    }

    write_audit_log(
        db,
        user_id=user.id,
        action="deleted_award",
        table_name="grant_awards",
        record_id=award.id,
        detail={"project_name": award.project_name, "snapshot": snapshot},
    )

    db.delete(award)
    db.commit()
