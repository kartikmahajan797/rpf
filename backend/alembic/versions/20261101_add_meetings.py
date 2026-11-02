"""add meetings table

Revision ID: 20261101_add_meetings
Revises: 20261101_initial
Create Date: 2026-11-01 01:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20261101_add_meetings"
down_revision = "20261101_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "meetings",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("project_id", sa.String(length=64), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("started_at", sa.String(length=64), nullable=False),
        sa.Column("duration_sec", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("transcript", sa.Text(), nullable=False, server_default=""),
        sa.Column("audio_paths", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="completed"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_meetings_project_id"), "meetings", ["project_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_meetings_project_id"), table_name="meetings")
    op.drop_table("meetings")
