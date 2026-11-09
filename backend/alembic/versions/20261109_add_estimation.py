"""add estimation and pricing tables

Revision ID: 20261109_add_estimation
Revises: 20261105_add_solution_design
Create Date: 2026-11-09 10:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20261109_add_estimation"
down_revision = "20261105_add_solution_design"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "estimation_settings",
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.id"), primary_key=True),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default="USD"),
        sa.Column("commercial_model", sa.String(length=32), nullable=False, server_default="tbd"),
        sa.Column("contingency_pct", sa.Float(), nullable=False, server_default="10"),
        sa.Column("discount_pct", sa.Float(), nullable=False, server_default="0"),
        sa.Column("days_per_point", sa.Float(), nullable=False, server_default="1"),
        sa.Column("assumptions", sa.Text(), nullable=False, server_default=""),
        sa.Column("updated_at", sa.String(length=64), nullable=True),
        sa.Column("last_item_number", sa.Integer(), nullable=False, server_default="0"),
    )

    op.create_table(
        "estimate_roles",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("day_rate", sa.Float(), nullable=False, server_default="0"),
        sa.Column("headcount", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_index("ix_estimate_roles_project_id", "estimate_roles", ["project_id"])

    op.create_table(
        "estimate_items",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("phase", sa.String(length=16), nullable=False, server_default="build"),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("role_id", sa.String(length=64), nullable=True),
        sa.Column("optimistic_days", sa.Float(), nullable=False, server_default="0"),
        sa.Column("likely_days", sa.Float(), nullable=False, server_default="0"),
        sa.Column("pessimistic_days", sa.Float(), nullable=False, server_default="0"),
        sa.Column("story_id", sa.String(length=64), nullable=True),
        sa.Column("requirement_ids", sa.JSON(), nullable=False),
    )
    op.create_index("ix_estimate_items_project_id", "estimate_items", ["project_id"])
    op.create_index("ix_estimate_items_story_id", "estimate_items", ["story_id"])


def downgrade() -> None:
    op.drop_index("ix_estimate_items_story_id", table_name="estimate_items")
    op.drop_index("ix_estimate_items_project_id", table_name="estimate_items")
    op.drop_table("estimate_items")
    op.drop_index("ix_estimate_roles_project_id", table_name="estimate_roles")
    op.drop_table("estimate_roles")
    op.drop_table("estimation_settings")
