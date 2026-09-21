from __future__ import annotations

from netwatch_light.state import NetWatchState


def _switch(device_id: str, ip: str, mac: str, interface_mac: str) -> dict:
    return {
        "id": device_id,
        "name": device_id,
        "ip": ip,
        "status": "up",
        "device_type": "switch",
        "source": "snmp-seed",
        "management_mac": mac,
        "interfaces": [
            {
                "id": f"{device_id}-if-1",
                "name": "eth-0-1",
                "mac": interface_mac,
                "admin_status": "up",
                "oper_status": "up",
            }
        ],
    }


def test_fdb_endpoint_matching_seed_management_mac_is_merged_into_seed():
    state = NetWatchState()
    source = _switch("switch-a", "192.168.100.100", "64:9d:99:00:00:01", "64:9d:99:00:00:02")
    target = _switch("switch-b", "192.168.100.120", "64:9d:99:08:74:48", "64:9d:99:08:74:49")
    endpoint = {
        "id": "endpoint-management",
        "name": "KVM Sternpunkt Ethernet",
        "ip": "unknown",
        "status": "observed",
        "device_type": "endpoint",
        "source": "mac-table",
        "mac": "64:9d:99:08:74:48",
        "chassis_id": "64:9d:99:08:74:48",
        "fingerprint": "mac+64:9d:99:08:74:48",
        "observed_source": "Q-BRIDGE-MIB",
        "interfaces": [],
    }
    state.devices = [source, target, endpoint]
    state.links = [
        {
            "id": "observed-link",
            "from": source["id"],
            "to": endpoint["id"],
            "from_interface": "switch-a-if-1",
            "to_interface": "endpoint-management-port",
            "local_port": "eth-0-4",
            "remote_port": "KVM Sternpunkt Ethernet",
            "status": "observed",
            "evidence": "Port description",
            "last_seen": "2026-09-19T09:00:00+00:00",
        }
    ]

    assert state._deduplicate_observed_topology() is True
    state._annotate_topology_links()

    assert {device["id"] for device in state.devices} == {"switch-a", "switch-b"}
    assert len(state.links) == 1
    link = state.links[0]
    assert link["from"] == "switch-a"
    assert link["to"] == "switch-b"
    assert link["link_type"] == "management"
    assert link["directness"] == "management"
    assert link["confidence"] == 78
    assert link["to_interface"] == "switch-b-management"
    assert link["management_mac"] == "64:9d:99:08:74:48"
    assert {source["source"] for source in link["evidence_sources"]} == {"arp", "fdb"}


def test_live_merge_preserves_a_previously_resolved_management_mac():
    state = NetWatchState()
    existing = _switch("switch-b", "192.168.100.120", "64:9d:99:08:74:48", "64:9d:99:08:74:49")
    existing["management_mac_source"] = "local-arp"
    replacement = _switch("switch-b", "192.168.100.120", "", "64:9d:99:08:74:49")
    devices = {"switch-b": existing}

    state._merge_device(devices, replacement)

    assert devices["switch-b"]["management_mac"] == "64:9d:99:08:74:48"
    assert devices["switch-b"]["management_mac_source"] == "local-arp"


def test_current_port_description_refreshes_a_persisted_management_link():
    state = NetWatchState()
    source = _switch("switch-a", "192.168.100.100", "64:9d:99:00:00:01", "64:9d:99:00:00:02")
    target = _switch("switch-b", "192.168.100.120", "64:9d:99:08:74:48", "64:9d:99:08:74:49")
    state.devices = [source, target]
    state.links = [
        {
            "id": "management-link",
            "from": "switch-a",
            "to": "switch-b",
            "from_interface": "switch-a-if-1",
            "to_interface": "switch-b-management",
            "local_port": "eth-0-4",
            "remote_port": "management 192.168.100.120",
            "management_mac": "64:9d:99:08:74:48",
            "link_type": "management",
            "status": "observed",
            "evidence": "Management ARP + MAC table Q-BRIDGE-MIB",
            "seed_key": "192.168.100.100:161",
        }
    ]
    current = {
        "id": "port-description-link",
        "from": "switch-a",
        "to": "described-endpoint",
        "from_interface": "switch-a-if-1",
        "to_interface": "described-endpoint-port",
        "local_port": "eth-0-4",
        "remote_port": "KVM Sternpunkt Ethernet",
        "status": "observed",
        "evidence": "Port description",
    }

    state._merge_live_links(
        [current],
        {"described-endpoint": "switch-b"},
        "192.168.100.100:161",
    )
    state._annotate_topology_links()

    assert len(state.links) == 1
    link = state.links[0]
    assert link["to"] == "switch-b"
    assert link["link_type"] == "management"
    assert link["missing_polls"] == 0
    assert link["stale"] is False
    assert link["confidence"] == 78
    assert link["line_style"] == "solid"
