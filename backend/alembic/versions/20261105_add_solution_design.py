"""add solution design tables

Revision ID: 20261105_add_solution_design
Revises: 20261105_add_user_stories
Create Date: 2026-11-05 01:10:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20261105_add_solution_design"
down_revision = "20261105_add_user_stories"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "solution_designs",
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.id"), primary_key=True),
        sa.Column("overview", sa.Text(), nullable=False, server_default=""),
        sa.Column("hosting", sa.String(length=32), nullable=False, server_default="tbd"),
        sa.Column("architecture_style", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("technical_approach", sa.Text(), nullable=False, server_default=""),
        sa.Column("nfr_approach", sa.Text(), nullable=False, server_default=""),
        sa.Column("updated_at", sa.String(length=64), nullable=True),
        sa.Column("last_decision_number", sa.Integer(), nullable=False, server_default="0"),
    )

    op.create_table(
        "solution_components",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("layer", sa.String(length=32), nullable=False, server_default="service"),
        sa.Column("technology", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("is_new", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("requirement_ids", sa.JSON(), nullable=False),
    )
    op.create_index("ix_solution_components_project_id", "solution_components", ["project_id"])

    op.create_table(
        "integrations",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("external_system", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("direction", sa.String(length=16), nullable=False, server_default="outbound"),
        sa.Column("protocol", sa.String(length=16), nullable=False, server_default="rest"),
        sa.Column("frequency", sa.String(length=16), nullable=False, server_default="real-time"),
        sa.Column("data", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="proposed"),
        sa.Column("requirement_ids", sa.JSON(), nullable=False),
    )
    op.create_index("ix_integrations_project_id", "integrations", ["project_id"])

    op.create_table(
        "design_decisions",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("context", sa.Text(), nullable=False, server_default=""),
        sa.Column("decision", sa.Text(), nullable=False, server_default=""),
        sa.Column("alternatives", sa.Text(), nullable=False, server_default=""),
        sa.Column("consequences", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="proposed"),
        sa.Column("updated_at", sa.String(length=64), nullable=False),
    )
    op.create_index("ix_design_decisions_project_id", "design_decisions", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_design_decisions_project_id", table_name="design_decisions")
    op.drop_table("design_decisions")
    op.drop_index("ix_integrations_project_id", table_name="integrations")
    op.drop_table("integrations")
    op.drop_index("ix_solution_components_project_id", table_name="solution_components")
    op.drop_table("solution_components")
    op.drop_table("solution_designs")
