import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import ENUM, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

user_role_enum = ENUM("admin", "editor", "viewer", name="user_role", create_type=False)
user_status_enum = ENUM("invited", "active", "deactivated", name="user_status", create_type=False)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    role: Mapped[str] = mapped_column(user_role_enum, nullable=False)
    status: Mapped[str] = mapped_column(user_status_enum, nullable=False, default="invited")
    invite_token: Mapped[str | None] = mapped_column(String, nullable=True, unique=True)
    invite_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Grant(Base):
    __tablename__ = "grants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    grantor: Mapped[str | None] = mapped_column(String, nullable=True)
    funding_source: Mapped[str | None] = mapped_column(String, nullable=True)
    grant_officer: Mapped[str | None] = mapped_column(String, nullable=True)
    scope: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_exp_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    orig_exp_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    amended_exp_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    grant_amount: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    grants_manager: Mapped[str | None] = mapped_column(String, nullable=True)
    program_manager: Mapped[str | None] = mapped_column(String, nullable=True)
    district: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sharepoint_link: Mapped[str | None] = mapped_column(String, nullable=True)
    withdrawn: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Manual override of the date-computed Active/Closed status ('active' | 'closed' | null).
    # null means "compute from current_exp_date as usual". Ignored if withdrawn is true.
    status_override: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    notes: Mapped[list["GrantNote"]] = relationship(
        back_populates="grant", cascade="all, delete-orphan", order_by="GrantNote.created_at.desc()"
    )


class GrantNote(Base):
    __tablename__ = "grant_notes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    grant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("grants.id", ondelete="CASCADE"), nullable=False)
    # Nullable + SET NULL so deleting a user account never destroys their notes;
    # author_name is a permanent snapshot of who wrote it, independent of
    # whether the account still exists.
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    author_name: Mapped[str] = mapped_column(String, nullable=False)
    note_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    grant: Mapped["Grant"] = relationship(back_populates="notes")
    user: Mapped["User | None"] = relationship()


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    # Permanent snapshot of the acting user's name, independent of whether the
    # account still exists -- deleting a user must never erase the change log.
    user_name: Mapped[str | None] = mapped_column(String, nullable=True)
    action: Mapped[str] = mapped_column(String, nullable=False)
    table_name: Mapped[str] = mapped_column(String, nullable=False)
    record_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    detail: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User | None"] = relationship()


class GrantAward(Base):
    __tablename__ = "grant_awards"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    grantor: Mapped[str | None] = mapped_column(String, nullable=True)
    award_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    amount: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class DeedRestriction(Base):
    __tablename__ = "deed_restrictions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    grantor: Mapped[str | None] = mapped_column(String, nullable=True)
    funding_source: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="Draft")
    notes: Mapped[str | None] = mapped_column(String, nullable=True)
    sharepoint_link: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class PSRProject(Base):
    __tablename__ = "psr_projects"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    category: Mapped[str] = mapped_column(String, nullable=False)
    grantor: Mapped[str | None] = mapped_column(String, nullable=True)
    funding_source: Mapped[str | None] = mapped_column(String, nullable=True)
    ad_number: Mapped[str | None] = mapped_column(String, nullable=True)
    district: Mapped[int | None] = mapped_column(Integer, nullable=True)
    grant_manager: Mapped[str | None] = mapped_column(String, nullable=True)
    performance_end_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    link: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    due_dates: Mapped[list["PSRDueDate"]] = relationship(
        "PSRDueDate", back_populates="project", cascade="all, delete-orphan", order_by="PSRDueDate.due_date"
    )
    notes: Mapped[list["PSRNote"]] = relationship(
        "PSRNote", back_populates="project", cascade="all, delete-orphan", order_by="PSRNote.created_at.desc()"
    )


class PSRDueDate(Base):
    __tablename__ = "psr_due_dates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("psr_projects.id", ondelete="CASCADE"), nullable=False)
    due_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    submitted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    submitted_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    project: Mapped["PSRProject"] = relationship("PSRProject", back_populates="due_dates")


class PSRNote(Base):
    __tablename__ = "psr_notes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("psr_projects.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    author_name: Mapped[str] = mapped_column(String, nullable=False)
    note_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped["PSRProject"] = relationship("PSRProject", back_populates="notes")


class MonthlyReportNote(Base):
    __tablename__ = "monthly_report_notes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # "YYYY-MM" -- notes are keyed by month, not tied to any other record.
    month: Mapped[str] = mapped_column(String, nullable=False, index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    author_name: Mapped[str] = mapped_column(String, nullable=False)
    note_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User | None"] = relationship()


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    grant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("grants.id", ondelete="CASCADE"), nullable=True)
    psr_due_date_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("psr_due_dates.id", ondelete="CASCADE"), nullable=True
    )
    type: Mapped[str] = mapped_column(String, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
