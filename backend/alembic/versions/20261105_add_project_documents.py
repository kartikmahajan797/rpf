"""add BRD / FRD project documents

Revision ID: 20261105_add_project_documents
Revises: 20261103_add_business_analysis
Create Date: 2026-11-05 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20261105_add_project_documents"
down_revision = "20261103_add_business_analysis"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_documents",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("kind", sa.String(length=8), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("sections", sa.JSON(), nullable=False),
        sa.Column("approval_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.String(length=64), nullable=False),
        sa.Column("updated_at", sa.String(length=64), nullable=False),
        sa.Column("approved_at", sa.String(length=64), nullable=True),
        sa.Column("approved_by", sa.String(length=64), nullable=True),
    )
    op.create_index("ix_project_documents_project_id", "project_documents", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_project_documents_project_id", table_name="project_documents")
    op.drop_table("project_documents")
