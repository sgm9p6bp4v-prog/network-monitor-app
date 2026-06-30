"""add metric samples and poll run history

Revision ID: 0003_metric_observability
Revises: 0002_topology_evidence
Create Date: 2026-06-28 00:00:02
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0003_metric_observability"
down_revision = "0002_topology_evidence"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    tables = _tables()
    if "metric_samples" not in tables:
        op.create_table(
            "metric_samples",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("metric_name", sa.String(length=160), nullable=False),
            sa.Column("target_type", sa.String(length=40), nullable=False),
            sa.Column("target_id", sa.String(length=260), nullable=False),
            sa.Column("device_id", sa.String(length=200), nullable=True),
            sa.Column("interface_id", sa.String(length=240), nullable=True),
            sa.Column("ts", sa.Float(), nullable=False),
            sa.Column("value_float", sa.Float(), nullable=True),
            sa.Column("value_text", sa.Text(), nullable=True),
            sa.Column("quality", sa.String(length=40), nullable=False, server_default="ok"),
            sa.Column("labels", sa.JSON(), nullable=False),
            sa.Column("payload", sa.JSON(), nullable=False),
        )
        op.create_index("ix_metric_samples_metric_name", "metric_samples", ["metric_name"])
        op.create_index("ix_metric_samples_target_type", "metric_samples", ["target_type"])
        op.create_index("ix_metric_samples_target_id", "metric_samples", ["target_id"])
        op.create_index("ix_metric_samples_device_id", "metric_samples", ["device_id"])
        op.create_index("ix_metric_samples_interface_id", "metric_samples", ["interface_id"])
        op.create_index("ix_metric_samples_ts", "metric_samples", ["ts"])
        op.create_index("ix_metric_samples_quality", "metric_samples", ["quality"])

    if "poll_runs" not in tables:
        op.create_table(
            "poll_runs",
            sa.Column("id", sa.String(length=260), primary_key=True),
            sa.Column("source", sa.String(length=160), nullable=False, server_default="poll"),
            sa.Column("status", sa.String(length=40), nullable=False, server_default="unknown"),
            sa.Column("started_at", sa.String(length=80), nullable=False, server_default=""),
            sa.Column("finished_at", sa.String(length=80), nullable=False, server_default=""),
            sa.Column("duration_ms", sa.Integer(), nullable=True),
            sa.Column("seed_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("successes", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("failures", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("payload", sa.JSON(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_poll_runs_source", "poll_runs", ["source"])
        op.create_index("ix_poll_runs_status", "poll_runs", ["status"])
        op.create_index("ix_poll_runs_started_at", "poll_runs", ["started_at"])


def downgrade() -> None:
    tables = _tables()
    if "poll_runs" in tables:
        op.drop_index("ix_poll_runs_started_at", table_name="poll_runs")
        op.drop_index("ix_poll_runs_status", table_name="poll_runs")
        op.drop_index("ix_poll_runs_source", table_name="poll_runs")
        op.drop_table("poll_runs")
    if "metric_samples" in tables:
        op.drop_index("ix_metric_samples_quality", table_name="metric_samples")
        op.drop_index("ix_metric_samples_ts", table_name="metric_samples")
        op.drop_index("ix_metric_samples_interface_id", table_name="metric_samples")
        op.drop_index("ix_metric_samples_device_id", table_name="metric_samples")
        op.drop_index("ix_metric_samples_target_id", table_name="metric_samples")
        op.drop_index("ix_metric_samples_target_type", table_name="metric_samples")
        op.drop_index("ix_metric_samples_metric_name", table_name="metric_samples")
        op.drop_table("metric_samples")
