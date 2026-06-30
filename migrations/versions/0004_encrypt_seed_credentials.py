"""add seed credential encryption metadata

Revision ID: 0004_encrypt_seed_credentials
Revises: 0003_metric_observability
Create Date: 2026-06-30 00:00:00
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0004_encrypt_seed_credentials"
down_revision = "0003_metric_observability"
branch_labels = None
depends_on = None


def _columns(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    columns = _columns("seed_credentials")
    if "encrypted" not in columns:
        op.add_column(
            "seed_credentials",
            sa.Column("encrypted", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
        op.create_index("ix_seed_credentials_encrypted", "seed_credentials", ["encrypted"])
    if "key_id" not in columns:
        op.add_column(
            "seed_credentials",
            sa.Column("key_id", sa.String(length=80), nullable=False, server_default=""),
        )
        op.create_index("ix_seed_credentials_key_id", "seed_credentials", ["key_id"])


def downgrade() -> None:
    columns = _columns("seed_credentials")
    if "key_id" in columns:
        op.drop_index("ix_seed_credentials_key_id", table_name="seed_credentials")
        op.drop_column("seed_credentials", "key_id")
    if "encrypted" in columns:
        op.drop_index("ix_seed_credentials_encrypted", table_name="seed_credentials")
        op.drop_column("seed_credentials", "encrypted")
