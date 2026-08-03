import uuid

from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class SetPasswordRequest(BaseModel):
    token: str
    password: str


class InviteInfoResponse(BaseModel):
    name: str
    email: str


class UserMeResponse(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    role: str
    status: str

    class Config:
        from_attributes = True
