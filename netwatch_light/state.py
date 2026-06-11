from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path
import time
from typing import Any
from uuid import uuid4

SNAPSHOT_VERSION = 2
EVENT_CAP = 20


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def now_clock() -> str:
    return datetime.now().strftime("%H:%M:%S")


class NetWatchState:
    """State container for the light app, persisted to a local JSON file."""

    def __init__(self, persistence_path: Path | None = None) -> None:
        self.persistence_path = persistence_path
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
                "backend_auto_poll": False,
                "backend_interval_seconds": 30,
                "backend_status": "stopped",
            },
            "thresholds": {
                "interface_error_counter": 1,
                "interface_discard_counter": 1,
            },
            "security": {
                "credential_storage": "local JSON state file in light build",
                "master_key": "not configured",
                "credential_dek": "not implemented; plaintext local file",
                "write_session": "not implemented",
            },
        }
        self.seeds: list[dict[str, Any]] = []
        self.seed_credentials: list[dict[str, Any]] = []
        self._load()

    def _payload(self) -> dict[str, Any]:
        return {
            "version": SNAPSHOT_VERSION,
            "mode": self.mode,
            "live_failures": self.live_failures,
            "devices": self.devices,
            "links": self.links,
            "alerts": self.alerts,
            "events": self.events[:EVENT_CAP],
            "metric_catalog": self.metric_catalog,
            "settings": self.settings,
            "seeds": self.seeds,
            "seed_credentials": self.seed_credentials,
        }

    def _load(self) -> None:
        if self.persistence_path is None or not self.persistence_path.exists():
            return
        try:
            data = json.loads(self.persistence_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return
        if not isinstance(data, dict):
            return
        self.mode = data.get("mode", self.mode)
        self.live_failures = int(data.get("live_failures", self.live_failures) or 0)
        self.devices = data.get("devices", self.devices)
        self.links = data.get("links", self.links)
        self.alerts = data.get("alerts", self.alerts)
        self.events = data.get("events", self.events)[:EVENT_CAP]
        self.metric_catalog = data.get("metric_catalog", self.metric_catalog)
        loaded_settings = data.get("settings", {})
        if isinstance(loaded_settings, dict):
            self.settings.update(loaded_settings)
            self.settings.setdefault("polling", {})
            self.settings["polling"].setdefault("backend_auto_poll", False)
            self.settings["polling"].setdefault("backend_interval_seconds", 30)
            self.settings["polling"].setdefault("backend_status", "stopped")
            self.settings.setdefault("thresholds", {})
            self.settings["thresholds"].setdefault("interface_error_counter", 1)
            self.settings["thresholds"].setdefault("interface_discard_counter", 1)
            self.settings["security"] = {
                "credential_storage": "local JSON state file in light build",
                "master_key": "not configured",
                "credential_dek": "not implemented; plaintext local file",
                "write_session": "not implemented",
            }
        self.seeds = data.get("seeds", self.seeds)
        self.seed_credentials = data.get("seed_credentials", self.seed_credentials)

    def persist(self) -> None:
        if self.persistence_path is None:
            return
        self.persistence_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self.persistence_path.with_suffix(".tmp")
        tmp_path.write_text(json.dumps(self._payload(), indent=2), encoding="utf-8")
        tmp_path.replace(self.persistence_path)

    def snapshot(self) -> dict[str, Any]:
        return {
            "mode": self.mode,
            "devices": deepcopy(self.devices),
            "links": deepcopy(self.links),
            "alerts": deepcopy(self.alerts),
            "events": deepcopy(self.events),
            "metric_catalog": deepcopy(self.metric_catalog),
            "settings": deepcopy(self.settings),
            "seeds": deepcopy(self.seeds),
        }

    def add_event(self, text: str) -> dict[str, Any]:
        event = {"id": str(uuid4()), "time": now_clock(), "text": text}
        self.events.insert(0, event)
        self.events = self.events[:EVENT_CAP]
        self.persist()
        return event

    def run_poll(self) -> dict[str, Any]:
        if self.mode == "live":
            event = self.add_event("Live poll skipped: no saved SNMP seed credentials configured")
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
        self.live_failures = 0
        self.live_counters = {}
        self.devices = []
        self.links = []
        self.alerts = []
        self.seeds = []
        self.seed_credentials = []
        self.events = []
        event = self.add_event("Live mode enabled: mock devices cleared, waiting for SNMP seed")
        return {"event": event, "snapshot": self.snapshot()}

    def set_backend_polling(self, enabled: bool, interval_seconds: int) -> dict[str, Any]:
        polling = self.settings.setdefault("polling", {})
        polling["backend_auto_poll"] = enabled
        polling["backend_interval_seconds"] = interval_seconds
        polling["backend_status"] = "running" if enabled else "stopped"
        event = self.add_event(
            f"Backend auto poll {'enabled' if enabled else 'disabled'}: {interval_seconds}s interval"
        )
        return {"event": event, "snapshot": self.snapshot()}

    def register_live_seed(self, seed_metadata: dict[str, Any]) -> None:
        key = seed_metadata["key"]
        existing = next((seed for seed in self.seeds if seed.get("key") == key), None)
        if existing:
            existing.update(seed_metadata)
        else:
            self.seeds.append(seed_metadata)
        self.persist()

    def register_seed_credentials(self, credential: dict[str, Any]) -> None:
        key = credential["key"]
        existing = next((item for item in self.seed_credentials if item.get("key") == key), None)
        if existing:
            existing.update(credential)
        else:
            self.seed_credentials.append(credential)
        self.persist()

    def update_device_layouts(self, layouts: dict[str, dict[str, Any]]) -> dict[str, Any]:
        updated = 0
        for device in self.devices:
            layout = layouts.get(device["id"])
            if not isinstance(layout, dict):
                continue
            try:
                x = float(layout["x"])
                y = float(layout["y"])
            except (KeyError, TypeError, ValueError):
                continue
            device["layout"] = {
                "x": x,
                "y": y,
                "locked": bool(layout.get("locked", False)),
                "source": "saved-map",
            }
            updated += 1
        if updated:
            self.persist()
        event = self.add_event(f"Topology layout saved for {updated} device(s)")
        return {"event": event, "updated": updated, "snapshot": self.snapshot()}

    def import_live_discovery(self, discovery: dict[str, Any], seed_key: str | None = None) -> dict[str, Any]:
        self.mode = "live"
        self.live_failures = 0
        device = deepcopy(discovery["device"])
        if seed_key:
            device["seed_key"] = seed_key
        device["last_seen"] = now_iso()
        self._calculate_live_rates(device)
        devices_by_id = {
            item["id"]: deepcopy(item)
            for item in self.devices
            if not self._should_replace_auto_discovery_item(item, seed_key)
        }
        candidate_remap: dict[str, str] = {}
        pending_match_id = self._find_pending_device_id(device, devices_by_id)
        if pending_match_id and pending_match_id != device["id"]:
            pending = devices_by_id.pop(pending_match_id)
            candidate_remap[pending_match_id] = device["id"]
            if pending.get("layout") and not pending.get("layout", {}).get("source") == "manual":
                device["layout"] = pending["layout"]
        self._merge_device(devices_by_id, device)
        for candidate in deepcopy(discovery["candidates"]):
            if seed_key:
                candidate["seed_key"] = seed_key
            candidate["last_seen"] = now_iso()
            match_id = self._find_existing_device_id(candidate, devices_by_id)
            if match_id and match_id != candidate["id"] and devices_by_id[match_id].get("status") != "pending":
                candidate_remap[candidate["id"]] = match_id
                continue
            self._merge_device(devices_by_id, candidate)
        self.devices = list(devices_by_id.values())
        self._merge_live_links(discovery["links"], candidate_remap, seed_key)
        self._propagate_endpoint_port_traffic()
        self._sync_alerts_from_devices()
        counts = discovery["counts"]
        event = self.add_event(
            "Live seed imported: "
            f"{counts['interfaces']} interfaces, {counts['lldp_candidates']} LLDP candidates, "
            f"{counts.get('mac_endpoints', 0)} MAC endpoints, "
            f"{counts.get('described_endpoints', 0)} described endpoints"
        )
        return {"event": event, "snapshot": self.snapshot()}

    def mark_live_poll_failed(self, reason: str, seed_key: str | None = None) -> dict[str, Any]:
        self.live_failures += 1
        status = "down" if self.live_failures >= 3 else "unknown"
        for device in self.devices:
            if device.get("status") != "pending" and (seed_key is None or device.get("seed_key") == seed_key):
                device["status"] = status
                for interface in device.get("interfaces", []):
                    if interface.get("admin_status") == "up":
                        interface["oper_status"] = "unknown"
                        interface["in_bps"] = None
                        interface["out_bps"] = None
        for seed in self.seeds:
            if seed_key is None or seed.get("key") == seed_key:
                seed["status"] = status
                seed["last_error"] = reason
        self._propagate_endpoint_port_traffic()
        self._sync_alerts_from_devices()
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

    def _propagate_endpoint_port_traffic(self) -> None:
        devices_by_id = {device["id"]: device for device in self.devices}
        interfaces_by_id: dict[str, tuple[dict[str, Any], dict[str, Any]]] = {}
        for device in self.devices:
            for interface in device.get("interfaces", []):
                interfaces_by_id[interface["id"]] = (device, interface)

        endpoint_links_by_interface: dict[str, int] = {}
        endpoint_links: list[dict[str, Any]] = []
        for link in self.links:
            endpoint = devices_by_id.get(link.get("to"))
            from_interface = link.get("from_interface")
            if not endpoint or endpoint.get("device_type") != "endpoint" or not from_interface:
                continue
            endpoint_links.append(link)
            endpoint_links_by_interface[from_interface] = endpoint_links_by_interface.get(from_interface, 0) + 1

        for device in self.devices:
            if device.get("device_type") != "endpoint":
                continue
            device.pop("observed_traffic", None)
            for interface in device.get("interfaces", []):
                interface["in_bps"] = None
                interface["out_bps"] = None
                interface["if_high_speed"] = None
                interface.pop("traffic_source", None)
                interface.pop("traffic_note", None)

        for link in endpoint_links:
            endpoint = devices_by_id.get(link["to"])
            source = interfaces_by_id.get(link.get("from_interface"))
            if not endpoint or not source:
                continue
            switch, switch_interface = source
            endpoint_interfaces = endpoint.get("interfaces") or []
            if not endpoint_interfaces:
                continue

            shared_count = endpoint_links_by_interface.get(link["from_interface"], 0)
            traffic_note = "shared switch port" if shared_count > 1 else "single endpoint switch port"
            traffic = {
                "source": "switch-port",
                "switch_device_id": switch["id"],
                "switch_name": switch.get("name") or switch["id"],
                "switch_interface_id": switch_interface["id"],
                "switch_port": switch_interface.get("name") or link.get("local_port") or "unknown",
                "switch_port_alias": switch_interface.get("if_alias") or "",
                "switch_in_bps": switch_interface.get("in_bps"),
                "switch_out_bps": switch_interface.get("out_bps"),
                "endpoint_in_bps": switch_interface.get("out_bps"),
                "endpoint_out_bps": switch_interface.get("in_bps"),
                "if_high_speed": switch_interface.get("if_high_speed"),
                "shared_port": shared_count > 1,
                "shared_endpoint_count": shared_count,
                "note": traffic_note,
            }
            endpoint["observed_traffic"] = traffic

            endpoint_interface = endpoint_interfaces[0]
            endpoint_interface["in_bps"] = traffic["endpoint_in_bps"]
            endpoint_interface["out_bps"] = traffic["endpoint_out_bps"]
            endpoint_interface["if_high_speed"] = traffic["if_high_speed"]
            endpoint_interface["admin_status"] = switch_interface.get("admin_status", endpoint_interface.get("admin_status", "unknown"))
            endpoint_interface["oper_status"] = switch_interface.get("oper_status", endpoint_interface.get("oper_status", "observed"))
            endpoint_interface["in_errors"] = switch_interface.get("out_errors") or 0
            endpoint_interface["out_errors"] = switch_interface.get("in_errors") or 0
            endpoint_interface["in_discards"] = switch_interface.get("out_discards") or 0
            endpoint_interface["out_discards"] = switch_interface.get("in_discards") or 0
            endpoint_interface["traffic_source"] = "switch-port"
            endpoint_interface["traffic_note"] = traffic_note

    def _merge_device(self, devices_by_id: dict[str, dict[str, Any]], device: dict[str, Any]) -> None:
        existing = devices_by_id.get(device["id"])
        if existing:
            if existing.get("layout"):
                device["layout"] = existing["layout"]
            device["alerting_enabled"] = existing.get("alerting_enabled", device.get("alerting_enabled", True))
        devices_by_id[device["id"]] = device

    def _should_replace_auto_discovery_item(self, item: dict[str, Any], seed_key: str | None) -> bool:
        if not seed_key or item.get("seed_key") != seed_key:
            return False
        if item.get("status") not in {"pending", "observed"}:
            return False
        return item.get("layout", {}).get("source") not in {"manual", "saved-map"}

    def _find_existing_device_id(
        self, candidate: dict[str, Any], devices_by_id: dict[str, dict[str, Any]]
    ) -> str | None:
        if candidate["id"] in devices_by_id:
            return candidate["id"]
        candidate_name = (candidate.get("name") or "").strip().lower()
        candidate_fp = self._normalize_identifier(candidate.get("fingerprint"))
        candidate_chassis = self._normalize_identifier(candidate.get("chassis_id"))
        candidate_lldp_name = (candidate.get("lldp_sys_name") or "").strip().lower()
        candidate_mac = self._normalize_identifier(candidate.get("mac") or candidate.get("observed_mac"))
        for device_id, device in devices_by_id.items():
            if device.get("status") == "pending":
                continue
            device_name = (device.get("name") or "").strip().lower()
            device_fp = self._normalize_identifier(device.get("fingerprint"))
            device_chassis = self._normalize_identifier(device.get("chassis_id"))
            interface_ids = {
                self._normalize_identifier(interface.get("if_phys_address"))
                for interface in device.get("interfaces", [])
                if interface.get("if_phys_address")
            }
            device_mac = self._normalize_identifier(device.get("mac") or device.get("observed_mac"))
            if candidate_lldp_name and candidate_lldp_name == device_name:
                return device_id
            if candidate_name and candidate_name == device_name:
                return device_id
            if candidate_fp and device_fp and candidate_fp == device_fp:
                return device_id
            if candidate_chassis and device_chassis and candidate_chassis == device_chassis:
                return device_id
            if candidate_fp and candidate_fp in interface_ids:
                return device_id
            if candidate_chassis and candidate_chassis in interface_ids:
                return device_id
            if candidate_mac and (candidate_mac == device_mac or candidate_mac in interface_ids):
                return device_id
        return None

    def _find_pending_device_id(
        self, device: dict[str, Any], devices_by_id: dict[str, dict[str, Any]]
    ) -> str | None:
        device_name = (device.get("name") or "").strip().lower()
        device_ip = str(device.get("ip") or "").strip()
        device_fp = self._normalize_identifier(device.get("fingerprint"))
        device_chassis = self._normalize_identifier(device.get("chassis_id"))
        device_identifiers = {device_fp, device_chassis}
        device_identifiers.update(
            self._normalize_identifier(interface.get("if_phys_address"))
            for interface in device.get("interfaces", [])
            if interface.get("if_phys_address")
        )
        device_identifiers.discard("")

        pending_devices = [item for item in devices_by_id.values() if item.get("status") == "pending"]
        unique_ip_matches = [
            item["id"]
            for item in pending_devices
            if device_ip and device_ip != "unknown" and str(item.get("ip") or "") == device_ip
        ]

        for pending in pending_devices:
            pending_names = {
                (pending.get("name") or "").strip().lower(),
                (pending.get("lldp_sys_name") or "").strip().lower(),
            }
            pending_names.discard("")
            if device_name and not device_name.startswith("lldp neighbor") and device_name in pending_names:
                return pending["id"]

            pending_identifiers = {
                self._normalize_identifier(pending.get("fingerprint")),
                self._normalize_identifier(pending.get("chassis_id")),
            }
            pending_identifiers.discard("")
            if device_identifiers.intersection(pending_identifiers):
                return pending["id"]

        if len(unique_ip_matches) == 1:
            return unique_ip_matches[0]
        return None

    def _normalize_identifier(self, value: Any) -> str:
        text = str(value or "").strip().lower()
        if not text:
            return ""
        return "".join(char for char in text if char.isalnum())

    def _merge_live_links(
        self, links: list[dict[str, Any]], candidate_remap: dict[str, str], seed_key: str | None
    ) -> None:
        merged: dict[str, dict[str, Any]] = {}
        for existing_link in self.links:
            if seed_key and existing_link.get("seed_key") == seed_key:
                continue
            link = deepcopy(existing_link)
            link["from"] = candidate_remap.get(link["from"], link["from"])
            link["to"] = candidate_remap.get(link["to"], link["to"])
            if link.get("from") == link.get("to"):
                continue
            link["id"] = self._stable_link_id(link)
            merged[link["id"]] = link
        for raw_link in links:
            link = deepcopy(raw_link)
            link["from"] = candidate_remap.get(link["from"], link["from"])
            link["to"] = candidate_remap.get(link["to"], link["to"])
            if link.get("from") == link.get("to"):
                continue
            if seed_key:
                link["seed_key"] = seed_key
            link["id"] = self._stable_link_id(link)
            existing = merged.get(link["id"], {})
            merged[link["id"]] = {**existing, **link}
        self.links = list(merged.values())
        self._confirm_reciprocal_links()

    def _stable_link_id(self, link: dict[str, Any]) -> str:
        from_if = str(link.get("from_interface") or link.get("local_port") or "any").replace("/", "-")
        to_if = str(link.get("to_interface") or link.get("remote_port") or "any").replace("/", "-")
        return f"link-{link['from']}-{link['to']}-{from_if}-{to_if}"

    def _confirm_reciprocal_links(self) -> None:
        for link in self.links:
            for other in self.links:
                if link is other:
                    continue
                if link.get("from") == other.get("to") and link.get("to") == other.get("from"):
                    link["status"] = "confirmed"
                    other["status"] = "confirmed"
                    link["evidence"] = "LLDP both sides"
                    other["evidence"] = "LLDP both sides"

    def _alerts_from_live_devices(self, devices: list[dict[str, Any]]) -> list[dict[str, Any]]:
        alerts: list[dict[str, Any]] = []
        thresholds = self.settings.get("thresholds", {})
        error_threshold = int(thresholds.get("interface_error_counter", 1) or 1)
        discard_threshold = int(thresholds.get("interface_discard_counter", 1) or 1)
        for device in devices:
            if not device.get("alerting_enabled"):
                continue
            if device.get("status") == "down":
                alerts.append(
                    {
                        "id": f"live-alert-device-{device['id']}",
                        "device_id": device["id"],
                        "interface_id": None,
                        "title": f"{device['name']} unreachable",
                        "detail": "SNMP poll failed repeatedly and the device was marked down",
                        "severity": "critical",
                        "state": "active",
                        "created_at": now_iso(),
                    }
                )
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
                errors = int(interface.get("in_errors") or 0) + int(interface.get("out_errors") or 0)
                discards = int(interface.get("in_discards") or 0) + int(interface.get("out_discards") or 0)
                if errors >= error_threshold:
                    alerts.append(
                        {
                            "id": f"live-alert-errors-{interface['id']}",
                            "device_id": device["id"],
                            "interface_id": interface["id"],
                            "title": f"{interface['name']} error counters",
                            "detail": f"live SNMP: {errors} cumulative input/output errors",
                            "severity": "warning",
                            "state": "active",
                            "created_at": now_iso(),
                        }
                    )
                if discards >= discard_threshold:
                    alerts.append(
                        {
                            "id": f"live-alert-discards-{interface['id']}",
                            "device_id": device["id"],
                            "interface_id": interface["id"],
                            "title": f"{interface['name']} discard counters",
                            "detail": f"live SNMP: {discards} cumulative input/output discards",
                            "severity": "warning",
                            "state": "active",
                            "created_at": now_iso(),
                        }
                    )
        return alerts

    def _sync_alerts_from_devices(self) -> None:
        generated = self._alerts_from_live_devices(self.devices)
        generated_by_id = {alert["id"]: alert for alert in generated}
        existing_by_id = {alert["id"]: alert for alert in self.alerts}
        next_alerts: list[dict[str, Any]] = []

        for alert_id, alert in generated_by_id.items():
            existing = existing_by_id.get(alert_id)
            if existing:
                alert["created_at"] = existing.get("created_at", alert["created_at"])
                if existing.get("state") == "acknowledged":
                    alert["state"] = "acknowledged"
            next_alerts.append(alert)

        for alert in self.alerts:
            alert_id = alert["id"]
            if not alert_id.startswith("live-alert-") or alert_id in generated_by_id:
                continue
            if alert.get("state") != "resolved":
                resolved = deepcopy(alert)
                resolved["state"] = "resolved"
                resolved["detail"] = f"{resolved.get('detail', '')} (auto-resolved: condition no longer present)".strip()
                next_alerts.append(resolved)

        self.alerts = next_alerts

    def _device(self, device_id: str) -> dict[str, Any] | None:
        return next((device for device in self.devices if device["id"] == device_id), None)
