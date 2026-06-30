"""initial netwatch persistence schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-06-28 00:00:00
"""
from __future__ import annotations

from alembic import op

from netwatch_light.storage import metadata


revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    metadata.create_all(op.get_bind())


def downgrade() -> None:
    metadata.drop_all(op.get_bind())
