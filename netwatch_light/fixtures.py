from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def now_clock() -> str:
    return datetime.now().strftime("%H:%M:%S")


def default_devices() -> list[dict]:
    return [
        {
            "id": "core-01",
            "name": "fs-core-01",
            "ip": "10.10.0.2",
            "vendor": "FS",
            "model": "S5860-20SQ",
            "status": "up",
            "fingerprint": "uuid+sysObjectID+chassis-8c:1f:64:10:00:01",
            "alerting_enabled": True,
            "layout": {"x": 520, "y": 70, "locked": True, "source": "manual"},
            "interfaces": [
                {
                    "id": "core-01-eth1-1",
                    "name": "eth1/1",
                    "if_alias": "uplink to agg-01",
                    "admin_status": "up",
                    "oper_status": "up",
                    "in_bps": 812_000_000,
                    "out_bps": 690_000_000,
                    "in_errors": 0,
                    "out_errors": 0,
                    "in_discards": 1,
                    "out_discards": 1,
                    "alerting_enabled": True,
                },
                {
                    "id": "core-01-eth1-2",
                    "name": "eth1/2",
                    "if_alias": "uplink to edge-02",
                    "admin_status": "up",
                    "oper_status": "up",
                    "in_bps": 226_000_000,
                    "out_bps": 241_000_000,
                    "in_errors": 0,
                    "out_errors": 0,
                    "in_discards": 0,
                    "out_discards": 0,
                    "alerting_enabled": True,
                },
                {
                    "id": "core-01-eth1-20",
                    "name": "eth1/20",
                    "if_alias": "reserved",
                    "admin_status": "down",
                    "oper_status": "down",
                    "in_bps": 0,
                    "out_bps": 0,
                    "in_errors": 0,
                    "out_errors": 0,
                    "in_discards": 0,
                    "out_discards": 0,
                    "alerting_enabled": False,
                },
            ],
        },
        {
            "id": "agg-01",
            "name": "fs-agg-01",
            "ip": "10.10.0.11",
            "vendor": "FS",
            "model": "S5850-48T4Q",
            "status": "up",
            "fingerprint": "uuid+sysObjectID+chassis-8c:1f:64:10:00:11",
            "alerting_enabled": True,
            "layout": {"x": 80, "y": 245, "locked": True, "source": "manual"},
            "interfaces": [
                {
                    "id": "agg-01-eth1-49",
                    "name": "eth1/49",
                    "if_alias": "core uplink",
                    "admin_status": "up",
                    "oper_status": "up",
                    "in_bps": 612_000_000,
                    "out_bps": 590_000_000,
                    "in_errors": 0,
                    "out_errors": 1,
                    "in_discards": 0,
                    "out_discards": 1,
                    "alerting_enabled": True,
                },
                {
                    "id": "agg-01-eth1-4",
                    "name": "eth1/4",
                    "if_alias": "edge-01",
                    "admin_status": "up",
                    "oper_status": "up",
                    "in_bps": 92_000_000,
                    "out_bps": 38_000_000,
                    "in_errors": 0,
                    "out_errors": 0,
                    "in_discards": 0,
                    "out_discards": 0,
                    "alerting_enabled": True,
                },
            ],
        },
        {
            "id": "edge-01",
            "name": "fs-edge-01",
            "ip": "10.10.1.21",
            "vendor": "FS",
            "model": "S3410-24TS-P",
            "status": "warning",
            "fingerprint": "uuid+sysObjectID+chassis-8c:1f:64:10:01:21",
            "alerting_enabled": True,
            "layout": {"x": 390, "y": 395, "locked": False, "source": "manual"},
            "interfaces": [
                {
                    "id": "edge-01-eth1-1",
                    "name": "eth1/1",
                    "if_alias": "agg uplink",
                    "admin_status": "up",
                    "oper_status": "up",
                    "in_bps": 120_000_000,
                    "out_bps": 145_000_000,
                    "in_errors": 1,
                    "out_errors": 0,
                    "in_discards": 2,
                    "out_discards": 4,
                    "alerting_enabled": True,
                },
                {
                    "id": "edge-01-eth1-24",
                    "name": "eth1/24",
                    "if_alias": "access floor 2",
                    "admin_status": "up",
                    "oper_status": "down",
                    "in_bps": 0,
                    "out_bps": 0,
                    "in_errors": 18,
                    "out_errors": 0,
                    "in_discards": 42,
                    "out_discards": 9,
                    "alerting_enabled": True,
                },
            ],
        },
        {
            "id": "edge-02",
            "name": "fs-edge-02",
            "ip": "10.10.2.22",
            "vendor": "FS",
            "model": "S3410-24TS-P",
            "status": "up",
            "fingerprint": "uuid+sysObjectID+chassis-8c:1f:64:10:02:22",
            "alerting_enabled": True,
            "layout": {"x": 820, "y": 245, "locked": False, "source": "manual"},
            "interfaces": [
                {
                    "id": "edge-02-eth1-1",
                    "name": "eth1/1",
                    "if_alias": "core uplink",
                    "admin_status": "up",
                    "oper_status": "up",
                    "in_bps": 140_000_000,
                    "out_bps": 109_000_000,
                    "in_errors": 0,
                    "out_errors": 0,
                    "in_discards": 1,
                    "out_discards": 0,
                    "alerting_enabled": True,
                },
                {
                    "id": "edge-02-eth1-13",
                    "name": "eth1/13",
                    "if_alias": "access lab",
                    "admin_status": "up",
                    "oper_status": "up",
                    "in_bps": 18_000_000,
                    "out_bps": 11_000_000,
                    "in_errors": 0,
                    "out_errors": 0,
                    "in_discards": 0,
                    "out_discards": 0,
                    "alerting_enabled": True,
                },
            ],
        },
        {
            "id": "pending-01",
            "name": "fs-lab-pending",
            "ip": "10.10.9.31",
            "vendor": "FS",
            "model": "LLDP candidate",
            "status": "pending",
            "fingerprint": "pending-lldp-one-sided",
            "alerting_enabled": False,
            "layout": {"x": 820, "y": 425, "locked": False, "source": "auto"},
            "interfaces": [
                {
                    "id": "pending-01-eth1-1",
                    "name": "eth1/1",
                    "if_alias": "candidate uplink",
                    "admin_status": "unknown",
                    "oper_status": "unknown",
                    "in_bps": None,
                    "out_bps": None,
                    "in_errors": 0,
                    "out_errors": 0,
                    "in_discards": 0,
                    "out_discards": 0,
                    "alerting_enabled": False,
                }
            ],
        },
    ]


def default_links() -> list[dict]:
    return [
        {
            "id": "link-core-agg",
            "from": "core-01",
            "to": "agg-01",
            "status": "confirmed",
            "evidence": "LLDP both sides",
        },
        {
            "id": "link-core-edge-02",
            "from": "core-01",
            "to": "edge-02",
            "status": "confirmed",
            "evidence": "LLDP both sides",
        },
        {
            "id": "link-agg-edge-01",
            "from": "agg-01",
            "to": "edge-01",
            "status": "confirmed",
            "evidence": "LLDP both sides",
        },
        {
            "id": "link-edge-02-pending",
            "from": "edge-02",
            "to": "pending-01",
            "status": "pending",
            "evidence": "LLDP one side",
        },
    ]


def default_alerts() -> list[dict]:
    return [
        {
            "id": "alert-01",
            "device_id": "edge-01",
            "interface_id": "edge-01-eth1-24",
            "title": "eth1/24 oper down",
            "detail": "admin up + oper down for 3 polling cycles",
            "severity": "critical",
            "state": "active",
            "created_at": now_iso(),
        },
        {
            "id": "alert-02",
            "device_id": "edge-01",
            "interface_id": "edge-01-eth1-24",
            "title": "eth1/24 discard rate",
            "detail": "discard rate above global threshold",
            "severity": "warning",
            "state": "active",
            "created_at": now_iso(),
        },
        {
            "id": "alert-03",
            "device_id": "agg-01",
            "interface_id": "agg-01-eth1-49",
            "title": "eth1/49 transient errors",
            "detail": "acknowledged during maintenance window",
            "severity": "warning",
            "state": "acknowledged",
            "created_at": now_iso(),
        },
    ]


def default_events() -> list[dict]:
    return [
        {"id": str(uuid4()), "time": now_clock(), "text": "Light API started with FS-like SNMP fixtures"},
        {"id": str(uuid4()), "time": now_clock(), "text": "LLDP topology loaded: 3 confirmed links, 1 pending link"},
        {"id": str(uuid4()), "time": now_clock(), "text": "Static threshold alert active on edge-01 eth1/24"},
    ]


def metric_catalog() -> list[str]:
    return [
        "interface.admin_status",
        "interface.oper_status",
        "interface.in_octets",
        "interface.out_octets",
        "interface.in_bps",
        "interface.out_bps",
        "interface.in_errors",
        "interface.out_errors",
        "interface.in_discards",
        "interface.out_discards",
        "interface.in_error_rate",
        "interface.out_error_rate",
        "interface.in_discard_rate",
        "interface.out_discard_rate",
    ]


def default_settings() -> dict:
    return {
        "polling": {
            "status_seconds": 30,
            "traffic_seconds": 60,
            "inventory_minutes": 15,
            "global_concurrency": 50,
            "per_device_concurrency": 2,
            "getbulk": "adaptive, starts at 25",
            "backend_auto_poll": False,
            "backend_interval_seconds": 30,
            "backend_status": "stopped",
        },
        "thresholds": {
            "interface_error_counter": 1,
            "interface_discard_counter": 1,
        },
        "security": {
            "credential_storage": "local JSON state file, mode 0600 (credentials still plaintext)",
            "master_key": "not configured",
            "credential_dek": "not implemented; at-rest encryption still pending",
            "write_session": "1h HttpOnly write-session cookie + X-CSRF-Token; empty setup token disables writes unless NETWATCH_LAN_TRUSTED=1",
        },
    }
