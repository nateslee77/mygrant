"""add deed_restrictions table

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-04

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "deed_restrictions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_name", sa.String(), nullable=False),
        sa.Column("grantor", sa.String(), nullable=True),
        sa.Column("funding_source", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="Draft"),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("sharepoint_link", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_deed_restrictions_project_name", "deed_restrictions", ["project_name"])


def downgrade() -> None:
    op.drop_table("deed_restrictions")
