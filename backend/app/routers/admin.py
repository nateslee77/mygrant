import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import require_admin
from app.core.security import generate_invite_token
from app.models.models import User
from app.schemas.user import InviteRequest, RoleChangeRequest, UserOut
from app.services.audit import write_audit_log
from app.services.email import send_invite_email

router = APIRouter(prefix="/admin", tags=["admin"])

VALID_ROLES = {"admin", "editor", "viewer"}
INVITE_EXPIRY_HOURS = 72


def _derive_name_from_email(email: str) -> str:
    local_part = email.split("@")[0]
    words = local_part.replace(".", " ").replace("_", " ").replace("-", " ").split()
    return " ".join(w.capitalize() for w in words) or local_part


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _admin: User = Depends(require_admin)):
    return db.scalars(select(User).order_by(User.created_at.desc())).all()


@router.post("/users/invite", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def invite_user(payload: InviteRequest, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if payload.role not in VALID_ROLES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid role")

    email = payload.email.lower().strip()
    domain = email.split("@")[-1]
    if domain != settings.allowed_invite_domain:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Email must be on the {settings.allowed_invite_domain} domain",
        )

    existing = db.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A user with this email already exists")

    new_user = User(
        email=email,
        name=payload.name or _derive_name_from_email(email),
        role=payload.role,
        status="invited",
        invite_token=generate_invite_token(),
        invite_token_expires_at=datetime.now(timezone.utc) + timedelta(hours=INVITE_EXPIRY_HOURS),
    )
    db.add(new_user)
    db.flush()

    write_audit_log(
        db,
        user_id=admin.id,
        action="invited_user",
        table_name="users",
        record_id=new_user.id,
        detail={"email": email, "role": payload.role},
    )
    db.commit()
    db.refresh(new_user)

    try:
        send_invite_email(email, new_user.invite_token)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"User was created but the invite email failed to send: {exc}",
        ) from exc

    return new_user


@router.patch("/users/{user_id}/role", response_model=UserOut)
def change_role(user_id: uuid.UUID, payload: RoleChangeRequest, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if payload.role not in VALID_ROLES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid role")

    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    before_role = target.role
    target.role = payload.role

    write_audit_log(
        db,
        user_id=admin.id,
        action="changed_role",
        table_name="users",
        record_id=target.id,
        detail={"before": before_role, "after": payload.role},
    )
    db.commit()
    db.refresh(target)
    return target


@router.patch("/users/{user_id}/deactivate", response_model=UserOut)
def deactivate_user(user_id: uuid.UUID, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    if target.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot deactivate your own account")

    target.status = "deactivated"

    write_audit_log(
        db,
        user_id=admin.id,
        action="deactivated_user",
        table_name="users",
        record_id=target.id,
        detail=None,
    )
    db.commit()
    db.refresh(target)
    return target
