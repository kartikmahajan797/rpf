"""add document templates and project handoff

Revision ID: 20261109_add_templates_handoff
Revises: 20261109_add_estimation
Create Date: 2026-11-09 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20261109_add_templates_handoff"
down_revision = "20261109_add_estimation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "document_templates",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("kind", sa.String(length=8), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("sections", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.String(length=64), nullable=False),
    )
    op.create_index("ix_document_templates_kind", "document_templates", ["kind"])
    op.create_table(
        "project_handoffs",
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.id"), primary_key=True),
        sa.Column("delivery_lead", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("start_date", sa.String(length=32), nullable=False, server_default=""),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("updated_at", sa.String(length=64), nullable=True),
        sa.Column("handed_off_at", sa.String(length=64), nullable=True),
        sa.Column("handed_off_by", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("project_handoffs")
    op.drop_index("ix_document_templates_kind", table_name="document_templates")
    op.drop_table("document_templates")
