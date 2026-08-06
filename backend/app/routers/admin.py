import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import require_admin
from app.core.security import generate_invite_token
from app.models.models import AuditLog, DeedRestriction, Grant, GrantAward, GrantNote, PSRDueDate, PSRNote, PSRProject, User
from app.schemas.audit import AuditLogOut, AuditLogResponse
from app.schemas.deed_restriction import DeedRestrictionCreate
from app.schemas.grant import GrantCreate
from app.schemas.grant_award import GrantAwardCreate
from app.schemas.psr import PSRProjectCreate
from app.schemas.user import InviteRequest, InviteResponse, RoleChangeRequest, UserOut
from app.services.audit import write_audit_log

RESTORABLE_ACTIONS = {"deleted_grant", "deleted_note", "deleted_award", "deleted_deed_restriction", "deleted_psr_project"}

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


@router.post("/users/invite", response_model=InviteResponse, status_code=status.HTTP_201_CREATED)
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
        if existing.status == "invited":
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "This email already has a pending invite — use Resend Invite in the Users table instead",
            )
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
        user_name=admin.name,
        action="invited_user",
        table_name="users",
        record_id=new_user.id,
        detail={"email": email, "role": payload.role},
    )
    db.commit()
    db.refresh(new_user)

    invite_link = f"{settings.frontend_url}/set-password?token={new_user.invite_token}"
    return InviteResponse(**UserOut.model_validate(new_user).model_dump(), invite_link=invite_link)


@router.post("/users/{user_id}/resend-invite", response_model=InviteResponse)
def resend_invite(user_id: uuid.UUID, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if target.status != "invited":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only users with a pending invite can have it resent")

    target.invite_token = generate_invite_token()
    target.invite_token_expires_at = datetime.now(timezone.utc) + timedelta(hours=INVITE_EXPIRY_HOURS)

    write_audit_log(
        db,
        user_id=admin.id,
        user_name=admin.name,
        action="resent_invite",
        table_name="users",
        record_id=target.id,
        detail={"email": target.email, "role": target.role},
    )
    db.commit()
    db.refresh(target)

    invite_link = f"{settings.frontend_url}/set-password?token={target.invite_token}"
    return InviteResponse(**UserOut.model_validate(target).model_dump(), invite_link=invite_link)


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
        user_name=admin.name,
        action="changed_role",
        table_name="users",
        record_id=target.id,
        detail={"before": before_role, "after": payload.role},
    )
    db.commit()
    db.refresh(target)
    return target


@router.get("/audit-log", response_model=AuditLogResponse)
def list_audit_log(
    page: int = 1,
    page_size: int = 50,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    total = db.query(AuditLog).count()
    start = (page - 1) * page_size

    entries = db.scalars(
        select(AuditLog)
        .order_by(AuditLog.created_at.desc())
        .offset(start)
        .limit(page_size)
    ).all()

    def _related_grant_id(entry: AuditLog) -> uuid.UUID | None:
        if entry.table_name == "grants" and entry.record_id is not None:
            return entry.record_id
        if entry.table_name == "grant_notes" and entry.detail and entry.detail.get("grant_id"):
            try:
                return uuid.UUID(entry.detail["grant_id"])
            except ValueError:
                return None
        return None

    grant_ids = {gid for e in entries if (gid := _related_grant_id(e)) is not None}
    grant_names: dict[uuid.UUID, str] = {}
    if grant_ids:
        rows = db.execute(select(Grant.id, Grant.project_name).where(Grant.id.in_(grant_ids))).all()
        grant_names = {row[0]: row[1] for row in rows}

    items = [
        AuditLogOut(
            id=e.id,
            user_name=e.user_name or "System",
            action=e.action,
            table_name=e.table_name,
            record_id=e.record_id,
            detail=e.detail,
            grant_project_name=grant_names.get(_related_grant_id(e)),
            created_at=e.created_at,
        )
        for e in entries
    ]

    return AuditLogResponse(items=items, total=total, page=page, page_size=page_size)


@router.post("/audit-log/{entry_id}/restore")
def restore_audit_log_entry(entry_id: uuid.UUID, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    entry = db.get(AuditLog, entry_id)
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Change log entry not found")
    if entry.action not in RESTORABLE_ACTIONS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This change log entry isn't a deletion and can't be restored")

    detail = entry.detail or {}

    if entry.action == "deleted_grant":
        snapshot = detail.get("snapshot")
        if not snapshot:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "No snapshot was captured for this deletion (it happened before restore support was added)",
            )
        if entry.record_id is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Missing original grant id")
        if db.get(Grant, entry.record_id) is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "A grant with this id already exists — already restored?")

        parsed = GrantCreate(**{k: v for k, v in snapshot.items() if k != "created_at"})
        restored = Grant(id=entry.record_id, **parsed.model_dump())
        if snapshot.get("created_at"):
            restored.created_at = datetime.fromisoformat(snapshot["created_at"])
        db.add(restored)
        db.flush()

        for note in detail.get("notes_snapshot", []):
            db.add(
                GrantNote(
                    id=uuid.UUID(note["id"]),
                    grant_id=restored.id,
                    user_id=uuid.UUID(note["user_id"]) if note.get("user_id") else None,
                    author_name=note.get("author_name", "Unknown"),
                    note_text=note["note_text"],
                    created_at=datetime.fromisoformat(note["created_at"]),
                )
            )

        write_audit_log(
            db,
            user_id=admin.id,
            user_name=admin.name,
            action="restored_grant",
            table_name="grants",
            record_id=restored.id,
            detail={
                "project_name": restored.project_name,
                "restored_from": str(entry.id),
                "notes_restored": len(detail.get("notes_snapshot", [])),
            },
        )
        db.commit()
        return {"restored": True, "table": "grants", "id": str(restored.id)}

    if entry.action == "deleted_award":
        snapshot = detail.get("snapshot")
        if not snapshot:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "No snapshot was captured for this deletion")
        if entry.record_id is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Missing original award id")
        if db.get(GrantAward, entry.record_id) is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "An award with this id already exists — already restored?")

        parsed = GrantAwardCreate(**snapshot)
        restored_award = GrantAward(id=entry.record_id, **parsed.model_dump())
        db.add(restored_award)
        db.flush()

        write_audit_log(
            db,
            user_id=admin.id,
            user_name=admin.name,
            action="restored_award",
            table_name="grant_awards",
            record_id=restored_award.id,
            detail={"project_name": restored_award.project_name, "restored_from": str(entry.id)},
        )
        db.commit()
        return {"restored": True, "table": "grant_awards", "id": str(restored_award.id)}

    if entry.action == "deleted_deed_restriction":
        snapshot = detail.get("snapshot")
        if not snapshot:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "No snapshot was captured for this deletion")
        if entry.record_id is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Missing original deed restriction id")
        if db.get(DeedRestriction, entry.record_id) is not None:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "A deed restriction with this id already exists — already restored?"
            )

        parsed = DeedRestrictionCreate(**snapshot)
        restored_dr = DeedRestriction(id=entry.record_id, **parsed.model_dump())
        db.add(restored_dr)
        db.flush()

        write_audit_log(
            db,
            user_id=admin.id,
            user_name=admin.name,
            action="restored_deed_restriction",
            table_name="deed_restrictions",
            record_id=restored_dr.id,
            detail={"project_name": restored_dr.project_name, "restored_from": str(entry.id)},
        )
        db.commit()
        return {"restored": True, "table": "deed_restrictions", "id": str(restored_dr.id)}

    if entry.action == "deleted_psr_project":
        snapshot = detail.get("snapshot")
        if not snapshot:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "No snapshot was captured for this deletion")
        if entry.record_id is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Missing original status report project id")
        if db.get(PSRProject, entry.record_id) is not None:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "A status report project with this id already exists — already restored?"
            )

        parsed = PSRProjectCreate(**snapshot)
        restored_project = PSRProject(id=entry.record_id, **parsed.model_dump())
        db.add(restored_project)
        db.flush()

        for d in detail.get("due_dates_snapshot", []):
            db.add(
                PSRDueDate(
                    project_id=restored_project.id,
                    due_date=date.fromisoformat(d["due_date"]),
                    submitted=d["submitted"],
                    submitted_date=date.fromisoformat(d["submitted_date"]) if d.get("submitted_date") else None,
                )
            )
        for n in detail.get("notes_snapshot", []):
            db.add(
                PSRNote(
                    project_id=restored_project.id,
                    user_id=None,
                    author_name=n["author_name"],
                    note_text=n["note_text"],
                )
            )

        write_audit_log(
            db,
            user_id=admin.id,
            user_name=admin.name,
            action="restored_psr_project",
            table_name="psr_projects",
            record_id=restored_project.id,
            detail={"project_name": restored_project.project_name, "restored_from": str(entry.id)},
        )
        db.commit()
        return {"restored": True, "table": "psr_projects", "id": str(restored_project.id)}

    # deleted_note
    grant_id_str = detail.get("grant_id")
    if not grant_id_str:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Missing grant reference for this note")
    grant_id = uuid.UUID(grant_id_str)
    if db.get(Grant, grant_id) is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "The grant this note belonged to no longer exists — restore the grant first"
        )
    if entry.record_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Missing original note id")
    if db.get(GrantNote, entry.record_id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A note with this id already exists — already restored?")

    note_user_id = uuid.UUID(detail["note_user_id"]) if detail.get("note_user_id") else None
    note_created_at = (
        datetime.fromisoformat(detail["note_created_at"]) if detail.get("note_created_at") else datetime.now(timezone.utc)
    )

    restored_note = GrantNote(
        id=entry.record_id,
        grant_id=grant_id,
        user_id=note_user_id,
        author_name=detail.get("note_author_name", "Unknown"),
        note_text=detail.get("note_text", ""),
        created_at=note_created_at,
    )
    db.add(restored_note)
    db.flush()

    write_audit_log(
        db,
        user_id=admin.id,
        user_name=admin.name,
        action="restored_note",
        table_name="grant_notes",
        record_id=restored_note.id,
        detail={"grant_id": grant_id_str, "note_text": restored_note.note_text, "restored_from": str(entry.id)},
    )
    db.commit()
    return {"restored": True, "table": "grant_notes", "id": str(restored_note.id)}


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
        user_name=admin.name,
        action="deactivated_user",
        table_name="users",
        record_id=target.id,
        detail=None,
    )
    db.commit()
    db.refresh(target)
    return target


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: uuid.UUID, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    if target.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot delete your own account")

    # Notes/change-log entries this user authored are preserved: their author name
    # is already snapshotted independently, and the FK relationships are
    # ON DELETE SET NULL rather than restricting, so deleting the account here
    # never destroys or corrupts that history.
    write_audit_log(
        db,
        user_id=admin.id,
        user_name=admin.name,
        action="deleted_user_account",
        table_name="users",
        record_id=target.id,
        detail={"email": target.email, "name": target.name, "role": target.role},
    )

    db.delete(target)
    db.commit()
