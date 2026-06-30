"""add structured topology evidence

Revision ID: 0002_topology_evidence
Revises: 0001_initial_schema
Create Date: 2026-06-28 00:00:01
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0002_topology_evidence"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def _columns(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    link_columns = _columns("links")
    if "confidence" not in link_columns:
        op.add_column("links", sa.Column("confidence", sa.Integer(), nullable=True))
        op.create_index("ix_links_confidence", "links", ["confidence"])
    if "directness" not in link_columns:
        op.add_column("links", sa.Column("directness", sa.String(length=40), nullable=True))
        op.create_index("ix_links_directness", "links", ["directness"])

    inspector = sa.inspect(op.get_bind())
    if "topology_evidence" not in inspector.get_table_names():
        op.create_table(
            "topology_evidence",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("link_id", sa.String(length=260), sa.ForeignKey("links.id", ondelete="CASCADE"), nullable=False),
            sa.Column("source", sa.String(length=80), nullable=False),
            sa.Column("direction", sa.String(length=40), nullable=False, server_default=""),
            sa.Column("weight", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("detail", sa.Text(), nullable=False, server_default=""),
            sa.Column("observed_at", sa.String(length=80), nullable=False, server_default=""),
            sa.Column("payload", sa.JSON(), nullable=False),
        )
        op.create_index("ix_topology_evidence_link_id", "topology_evidence", ["link_id"])
        op.create_index("ix_topology_evidence_source", "topology_evidence", ["source"])


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "topology_evidence" in inspector.get_table_names():
        op.drop_index("ix_topology_evidence_source", table_name="topology_evidence")
        op.drop_index("ix_topology_evidence_link_id", table_name="topology_evidence")
        op.drop_table("topology_evidence")
    link_columns = _columns("links")
    if "directness" in link_columns:
        op.drop_index("ix_links_directness", table_name="links")
        op.drop_column("links", "directness")
    if "confidence" in link_columns:
        op.drop_index("ix_links_confidence", table_name="links")
        op.drop_column("links", "confidence")
