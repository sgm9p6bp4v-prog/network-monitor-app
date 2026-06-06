from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import time
from typing import Any
from uuid import uuid4


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def now_clock() -> str:
    return datetime.now().strftime("%H:%M:%S")


class NetWatchState:
    """In-memory state for the light demo app.

    This is intentionally not a persistence layer. It gives the first working
    app realistic API behavior while the real Postgres/Timescale schema is
    still being built.
    """

    def __init__(self) -> None:
        self.mode = "mock"
        self.live_failures = 0
        self.live_counters: dict[str, dict[str, float | int]] = {}
        self.devices: list[dict[str, Any]] = [
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
        self.links: list[dict[str, Any]] = [
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
        self.alerts: list[dict[str, Any]] = [
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
        self.events: list[dict[str, Any]] = [
            {"id": str(uuid4()), "time": now_clock(), "text": "Light API started with FS-like SNMP fixtures"},
            {"id": str(uuid4()), "time": now_clock(), "text": "LLDP topology loaded: 3 confirmed links, 1 pending link"},
            {"id": str(uuid4()), "time": now_clock(), "text": "Static threshold alert active on edge-01 eth1/24"},
        ]
        self.metric_catalog = [
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
        self.settings = {
            "polling": {
                "status_seconds": 30,
                "traffic_seconds": 60,
                "inventory_minutes": 15,
                "global_concurrency": 50,
                "per_device_concurrency": 2,
                "getbulk": "adaptive, starts at 25",
            },
            "security": {
                "credential_storage": "encrypted in DB",
                "master_key": "Docker secret file",
                "credential_dek": "one data encryption key per credential",
                "write_session": "setup token exchanged for 1 hour session",
            },
        }

    def snapshot(self) -> dict[str, Any]:
        return {
            "mode": self.mode,
            "devices": deepcopy(self.devices),
            "links": deepcopy(self.links),
            "alerts": deepcopy(self.alerts),
            "events": deepcopy(self.events),
            "metric_catalog": deepcopy(self.metric_catalog),
            "settings": deepcopy(self.settings),
        }

    def add_event(self, text: str) -> dict[str, Any]:
        event = {"id": str(uuid4()), "time": now_clock(), "text": text}
        self.events.insert(0, event)
        self.events = self.events[:12]
        return event

    def run_poll(self) -> dict[str, Any]:
        if self.mode == "live":
            event = self.add_event("Live poll requested: use Add seed to refresh SNMP data in this light build")
            return {"event": event, "snapshot": self.snapshot()}
        edge = self._device("edge-01")
        if edge:
            for interface in edge["interfaces"]:
                if interface["id"] == "edge-01-eth1-24":
                    interface["in_discards"] += 3
                    interface["in_errors"] += 1
        event = self.add_event("Manual SNMP poll completed: status, traffic and discard rates refreshed")
        return {"event": event, "snapshot": self.snapshot()}

    def run_discovery(self) -> dict[str, Any]:
        if self.mode == "live":
            event = self.add_event("Live LLDP discovery requested: run Add seed to refresh neighbor candidates")
            return {"event": event, "snapshot": self.snapshot()}
        pending = next((link for link in self.links if link["status"] == "pending"), None)
        if pending:
            text = "LLDP discovery kept fs-lab-pending as pending: one-sided evidence only"
        else:
            self.links.append(
                {
                    "id": "link-edge-02-pending",
                    "from": "edge-02",
                    "to": "pending-01",
                    "status": "pending",
                    "evidence": "LLDP one side",
                }
            )
            text = "LLDP discovery added a pending candidate link from edge-02"
        event = self.add_event(text)
        return {"event": event, "snapshot": self.snapshot()}

    def update_alert(self, alert_id: str, action: str) -> dict[str, Any] | None:
        alert = next((item for item in self.alerts if item["id"] == alert_id), None)
        if alert is None:
            return None
        if action == "ack" and alert["state"] == "active":
            alert["state"] = "acknowledged"
            event = self.add_event(f"Alert acknowledged: {alert['title']}")
            return {"alert": deepcopy(alert), "event": event, "snapshot": self.snapshot()}
        if action == "resolve" and alert["state"] != "resolved":
            alert["state"] = "resolved"
            event = self.add_event(f"Alert resolved: {alert['title']}")
            return {"alert": deepcopy(alert), "event": event, "snapshot": self.snapshot()}
        event = self.add_event(f"Alert unchanged: {alert['title']}")
        return {"alert": deepcopy(alert), "event": event, "snapshot": self.snapshot()}

    def clear_live_inventory(self) -> dict[str, Any]:
        self.mode = "live"
        self.devices = []
        self.links = []
        self.alerts = []
        event = self.add_event("Live mode enabled: mock devices cleared, waiting for SNMP seed")
        return {"event": event, "snapshot": self.snapshot()}

    def import_live_discovery(self, discovery: dict[str, Any]) -> dict[str, Any]:
        self.mode = "live"
        self.live_failures = 0
        device = deepcopy(discovery["device"])
        self._calculate_live_rates(device)
        self.devices = [device, *deepcopy(discovery["candidates"])]
        self.links = deepcopy(discovery["links"])
        self.alerts = self._alerts_from_live_devices(self.devices)
        counts = discovery["counts"]
        event = self.add_event(
            "Live seed imported: "
            f"{counts['interfaces']} interfaces, {counts['lldp_candidates']} LLDP candidates"
        )
        return {"event": event, "snapshot": self.snapshot()}

    def mark_live_poll_failed(self, reason: str) -> dict[str, Any]:
        self.live_failures += 1
        status = "down" if self.live_failures >= 3 else "unknown"
        for device in self.devices:
            if device.get("status") != "pending":
                device["status"] = status
                for interface in device.get("interfaces", []):
                    if interface.get("admin_status") == "up":
                        interface["oper_status"] = "unknown"
                        interface["in_bps"] = None
                        interface["out_bps"] = None
        event = self.add_event(f"Live poll failed ({self.live_failures}/3): {reason}")
        return {"event": event, "snapshot": self.snapshot()}

    def _calculate_live_rates(self, device: dict[str, Any]) -> None:
        now = time.monotonic()
        for interface in device.get("interfaces", []):
            key = interface["id"]
            previous = self.live_counters.get(key)
            in_octets = interface.get("in_octets")
            out_octets = interface.get("out_octets")
            if previous and isinstance(in_octets, int) and isinstance(out_octets, int):
                elapsed = max(0.001, now - float(previous["time"]))
                previous_in = int(previous.get("in_octets", 0))
                previous_out = int(previous.get("out_octets", 0))
                interface["in_bps"] = round(((in_octets - previous_in) * 8) / elapsed) if in_octets >= previous_in else None
                interface["out_bps"] = round(((out_octets - previous_out) * 8) / elapsed) if out_octets >= previous_out else None
            self.live_counters[key] = {
                "time": now,
                "in_octets": int(in_octets or 0),
                "out_octets": int(out_octets or 0),
            }

    def _alerts_from_live_devices(self, devices: list[dict[str, Any]]) -> list[dict[str, Any]]:
        alerts: list[dict[str, Any]] = []
        for device in devices:
            if not device.get("alerting_enabled"):
                continue
            for interface in device.get("interfaces", []):
                if interface.get("admin_status") == "up" and interface.get("oper_status") not in {"up", "unknown"}:
                    alerts.append(
                        {
                            "id": f"live-alert-{interface['id']}",
                            "device_id": device["id"],
                            "interface_id": interface["id"],
                            "title": f"{interface['name']} oper {interface['oper_status']}",
                            "detail": "live SNMP: admin up + oper not up",
                            "severity": "critical",
                            "state": "active",
                            "created_at": now_iso(),
                        }
                    )
        return alerts

    def _device(self, device_id: str) -> dict[str, Any] | None:
        return next((device for device in self.devices if device["id"] == device_id), None)
