"""backfill requirements.source_ids

Rows that existed before 20261101_extend_requirements got NULL, which the API
schema (a list) rejects, so GET /requirements returned 500 on existing data.

Revision ID: 20261102_backfill_source_ids
Revises: 20261101_extend_requirements
Create Date: 2026-11-02 00:00:00.000000
"""

from alembic import op


revision = "20261102_backfill_source_ids"
down_revision = "20261101_extend_requirements"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE requirements SET source_ids = '[]' WHERE source_ids IS NULL")


def downgrade() -> None:
    # Data-only fix; nothing to undo.
    pass
