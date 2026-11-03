"""add business analysis tables

Revision ID: 20261103_add_business_analysis
Revises: 20261102_backfill_source_ids
Create Date: 2026-11-03 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20261103_add_business_analysis"
down_revision = "20261102_backfill_source_ids"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "business_analyses",
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.id"), primary_key=True),
        sa.Column("current_state", sa.Text(), nullable=False, server_default=""),
        sa.Column("future_state", sa.Text(), nullable=False, server_default=""),
        sa.Column("objectives", sa.Text(), nullable=False, server_default=""),
        sa.Column("updated_at", sa.String(length=64), nullable=True),
        sa.Column("last_gap_number", sa.Integer(), nullable=False, server_default="0"),
    )

    op.create_table(
        "analysis_gaps",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("area", sa.String(length=255), nullable=False),
        sa.Column("current", sa.Text(), nullable=False, server_default=""),
        sa.Column("target", sa.Text(), nullable=False, server_default=""),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("impact", sa.String(length=16), nullable=False, server_default="medium"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="open"),
        sa.Column("requirement_ids", sa.JSON(), nullable=False),
    )
    op.create_index("ix_analysis_gaps_project_id", "analysis_gaps", ["project_id"])

    op.create_table(
        "stakeholders",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("organization", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("influence", sa.String(length=16), nullable=False, server_default="medium"),
        sa.Column("interest", sa.String(length=16), nullable=False, server_default="medium"),
        sa.Column("attitude", sa.String(length=16), nullable=False, server_default="neutral"),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
    )
    op.create_index("ix_stakeholders_project_id", "stakeholders", ["project_id"])

    op.create_table(
        "process_maps",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False, server_default="as-is"),
        sa.Column("steps", sa.JSON(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("updated_at", sa.String(length=64), nullable=False),
    )
    op.create_index("ix_process_maps_project_id", "process_maps", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_process_maps_project_id", table_name="process_maps")
    op.drop_table("process_maps")
    op.drop_index("ix_stakeholders_project_id", table_name="stakeholders")
    op.drop_table("stakeholders")
    op.drop_index("ix_analysis_gaps_project_id", table_name="analysis_gaps")
    op.drop_table("analysis_gaps")
    op.drop_table("business_analyses")
