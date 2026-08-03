"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-08-03

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    user_role = postgresql.ENUM("admin", "editor", "viewer", name="user_role")
    user_status = postgresql.ENUM("invited", "active", "deactivated", name="user_status")
    user_role.create(op.get_bind())
    user_status.create(op.get_bind())

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(), nullable=False, unique=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=True),
        sa.Column("role", postgresql.ENUM("admin", "editor", "viewer", name="user_role", create_type=False), nullable=False),
        sa.Column("status", postgresql.ENUM("invited", "active", "deactivated", name="user_status", create_type=False), nullable=False, server_default="invited"),
        sa.Column("invite_token", sa.String(), nullable=True, unique=True),
        sa.Column("invite_token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "grants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_name", sa.String(), nullable=False),
        sa.Column("grantor", sa.String(), nullable=True),
        sa.Column("funding_source", sa.String(), nullable=True),
        sa.Column("grant_officer", sa.String(), nullable=True),
        sa.Column("scope", sa.Text(), nullable=True),
        sa.Column("current_exp_date", sa.Date(), nullable=True),
        sa.Column("orig_exp_date", sa.Date(), nullable=True),
        sa.Column("amended_exp_date", sa.Date(), nullable=True),
        sa.Column("grant_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("grants_manager", sa.String(), nullable=True),
        sa.Column("program_manager", sa.String(), nullable=True),
        sa.Column("district", sa.Integer(), nullable=True),
        sa.Column("sharepoint_link", sa.String(), nullable=True),
        sa.Column("withdrawn", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_grants_project_name", "grants", ["project_name"])

    op.create_table(
        "grant_notes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("grant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("grants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("note_text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_grant_notes_grant_id", "grant_notes", ["grant_id"])

    op.create_table(
        "audit_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("table_name", sa.String(), nullable=False),
        sa.Column("record_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("detail", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("grant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("grants.id", ondelete="CASCADE"), nullable=True),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])


def downgrade() -> None:
    op.drop_table("notifications")
    op.drop_table("audit_log")
    op.drop_table("grant_notes")
    op.drop_table("grants")
    op.drop_table("users")
    postgresql.ENUM(name="user_status").drop(op.get_bind())
    postgresql.ENUM(name="user_role").drop(op.get_bind())
