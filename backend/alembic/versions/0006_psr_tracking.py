"""add PSR (status report) tracking tables

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-04

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "psr_projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_name", sa.String(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("grantor", sa.String(), nullable=True),
        sa.Column("funding_source", sa.String(), nullable=True),
        sa.Column("ad_number", sa.String(), nullable=True),
        sa.Column("district", sa.Integer(), nullable=True),
        sa.Column("grant_manager", sa.String(), nullable=True),
        sa.Column("performance_end_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_psr_projects_project_name", "psr_projects", ["project_name"])

    op.create_table(
        "psr_due_dates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("psr_projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("submitted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("submitted_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "psr_notes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("psr_projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("author_name", sa.String(), nullable=False),
        sa.Column("note_text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.add_column(
        "notifications",
        sa.Column("psr_due_date_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("psr_due_dates.id", ondelete="CASCADE"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("notifications", "psr_due_date_id")
    op.drop_table("psr_notes")
    op.drop_table("psr_due_dates")
    op.drop_table("psr_projects")
