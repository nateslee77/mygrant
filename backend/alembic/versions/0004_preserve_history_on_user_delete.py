"""denormalize author/actor names and allow user deletion without losing history

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-04

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # grant_notes: snapshot author_name, make user_id nullable + SET NULL on delete
    op.add_column("grant_notes", sa.Column("author_name", sa.String(), nullable=True))
    op.execute(
        "UPDATE grant_notes gn SET author_name = u.name FROM users u WHERE gn.user_id = u.id"
    )
    op.execute("UPDATE grant_notes SET author_name = 'Unknown' WHERE author_name IS NULL")
    op.alter_column("grant_notes", "author_name", nullable=False)

    op.drop_constraint("grant_notes_user_id_fkey", "grant_notes", type_="foreignkey")
    op.alter_column("grant_notes", "user_id", nullable=True)
    op.create_foreign_key(
        "grant_notes_user_id_fkey", "grant_notes", "users", ["user_id"], ["id"], ondelete="SET NULL"
    )

    # audit_log: snapshot user_name, SET NULL on delete
    op.add_column("audit_log", sa.Column("user_name", sa.String(), nullable=True))
    op.execute(
        "UPDATE audit_log a SET user_name = u.name FROM users u WHERE a.user_id = u.id"
    )
    op.drop_constraint("audit_log_user_id_fkey", "audit_log", type_="foreignkey")
    op.create_foreign_key(
        "audit_log_user_id_fkey", "audit_log", "users", ["user_id"], ["id"], ondelete="SET NULL"
    )


def downgrade() -> None:
    op.drop_constraint("audit_log_user_id_fkey", "audit_log", type_="foreignkey")
    op.create_foreign_key("audit_log_user_id_fkey", "audit_log", "users", ["user_id"], ["id"])
    op.drop_column("audit_log", "user_name")

    op.drop_constraint("grant_notes_user_id_fkey", "grant_notes", type_="foreignkey")
    op.alter_column("grant_notes", "user_id", nullable=False)
    op.create_foreign_key("grant_notes_user_id_fkey", "grant_notes", "users", ["user_id"], ["id"])
    op.drop_column("grant_notes", "author_name")
