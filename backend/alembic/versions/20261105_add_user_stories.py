"""add epics and user stories

Revision ID: 20261105_add_user_stories
Revises: 20261105_add_project_documents
Create Date: 2026-11-05 01:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20261105_add_user_stories"
down_revision = "20261105_add_project_documents"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "backlog_meta",
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.id"), primary_key=True),
        sa.Column("last_epic_number", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_story_number", sa.Integer(), nullable=False, server_default="0"),
    )

    op.create_table(
        "epics",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
    )
    op.create_index("ix_epics_project_id", "epics", ["project_id"])

    op.create_table(
        "user_stories",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("epic_id", sa.String(length=64), nullable=True),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("persona", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("goal", sa.Text(), nullable=False, server_default=""),
        sa.Column("benefit", sa.Text(), nullable=False, server_default=""),
        sa.Column("acceptance_criteria", sa.JSON(), nullable=False),
        sa.Column("priority", sa.String(length=16), nullable=False, server_default="should"),
        sa.Column("story_points", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="backlog"),
        sa.Column("requirement_ids", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.String(length=64), nullable=False),
        sa.Column("updated_at", sa.String(length=64), nullable=False),
    )
    op.create_index("ix_user_stories_project_id", "user_stories", ["project_id"])
    op.create_index("ix_user_stories_epic_id", "user_stories", ["epic_id"])


def downgrade() -> None:
    op.drop_index("ix_user_stories_epic_id", table_name="user_stories")
    op.drop_index("ix_user_stories_project_id", table_name="user_stories")
    op.drop_table("user_stories")
    op.drop_index("ix_epics_project_id", table_name="epics")
    op.drop_table("epics")
    op.drop_table("backlog_meta")
