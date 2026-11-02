"""extend requirements and add meeting summary

Revision ID: 20261101_extend_requirements
Revises: 20261101_add_meetings
Create Date: 2026-11-01 02:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20261101_extend_requirements"
down_revision = "20261101_add_meetings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Extend requirements table
    with op.batch_alter_table("requirements") as batch_op:
        batch_op.add_column(sa.Column("description", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("rationale", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("source_ids", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("notes", sa.Text(), nullable=True))

    # Add summary column to meetings table
    with op.batch_alter_table("meetings") as batch_op:
        batch_op.add_column(sa.Column("summary", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("meetings") as batch_op:
        batch_op.drop_column("summary")

    with op.batch_alter_table("requirements") as batch_op:
        batch_op.drop_column("notes")
        batch_op.drop_column("source_ids")
        batch_op.drop_column("rationale")
        batch_op.drop_column("description")
