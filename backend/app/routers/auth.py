import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.models import User
from app.schemas.auth import (
    InviteInfoResponse,
    LoginRequest,
    SetPasswordRequest,
    TokenResponse,
    UserMeResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE_NAME = "refresh_token"


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=True,
        # frontend (Vercel) and backend (Render) are different sites, so the
        # refresh cookie must be SameSite=None to be sent on cross-site fetches.
        samesite="none",
        max_age=7 * 24 * 60 * 60,
        path="/auth",
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email.lower()))

    if user is None or user.password_hash is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    if user.status != "active":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "This account is not active")

    access_token = create_access_token(str(user.id), user.role)
    refresh_token = create_refresh_token(str(user.id), user.role)
    _set_refresh_cookie(response, refresh_token)

    return TokenResponse(access_token=access_token)


@router.post("/refresh", response_model=TokenResponse)
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(REFRESH_COOKIE_NAME)
    if token is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No refresh token")

    payload = decode_token(token)
    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired refresh token")

    user = db.get(User, uuid.UUID(payload["sub"]))
    if user is None or user.status != "active":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or inactive user")

    access_token = create_access_token(str(user.id), user.role)
    new_refresh_token = create_refresh_token(str(user.id), user.role)
    _set_refresh_cookie(response, new_refresh_token)

    return TokenResponse(access_token=access_token)


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(REFRESH_COOKIE_NAME, path="/auth")
    return {"ok": True}


@router.get("/me", response_model=UserMeResponse)
def me(user: User = Depends(get_current_user)):
    return user


@router.get("/invite-info", response_model=InviteInfoResponse)
def invite_info(token: str, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.invite_token == token))
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invalid or expired invite link")
    if user.invite_token_expires_at is None or user.invite_token_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_410_GONE, "This invite link has expired. Ask an admin to re-invite you.")
    return InviteInfoResponse(name=user.name, email=user.email)


@router.post("/set-password", response_model=TokenResponse)
def set_password(payload: SetPasswordRequest, response: Response, db: Session = Depends(get_db)):
    if len(payload.password) < 8:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Password must be at least 8 characters")

    user = db.scalar(select(User).where(User.invite_token == payload.token))
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invalid or expired invite link")
    if user.invite_token_expires_at is None or user.invite_token_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_410_GONE, "This invite link has expired. Ask an admin to re-invite you.")

    user.password_hash = hash_password(payload.password)
    user.status = "active"
    user.invite_token = None
    user.invite_token_expires_at = None
    db.commit()

    access_token = create_access_token(str(user.id), user.role)
    refresh_token = create_refresh_token(str(user.id), user.role)
    _set_refresh_cookie(response, refresh_token)

    return TokenResponse(access_token=access_token)
