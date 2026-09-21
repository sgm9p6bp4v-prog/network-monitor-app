from __future__ import annotations

import asyncio

from netwatch_light import snmp_live


def _empty_tables(definitions: dict[str, str]) -> dict[str, dict[str, object]]:
    return {name: {} for name in definitions}


def test_fs_management_addresses_are_read_from_values():
    assert snmp_live._fs_lldp_management_addresses(
        {
            "1.192": "192.168.100.160",
            "2.191": "",
            "3.190": "999.1.1.1",
        }
    ) == {"1.192": "192.168.100.160"}


def test_neighbor_mac_parser_accepts_macos_unpadded_arp_output():
    assert snmp_live._neighbor_mac_from_text(
        "? (192.168.100.120) at 64:9d:99:8:74:48 on en0 ifscope [ethernet]"
    ) == "64:9d:99:08:74:48"


def test_fs_private_anonymous_lldp_requires_same_port_fdb_evidence():
    rows = _empty_tables(snmp_live.FS_LLDP_OIDS)
    rows["remote_chassis_id"] = {
        "1.188": "C400.ADD7.26F4",
        "2.192": "649D.99C9.00C4",
    }
    rows["remote_port_id"] = {
        "1.188": "C400.ADD7.26F4",
        "2.192": "TGi0/28",
    }
    rows["remote_sys_name"] = {"2.192": "S3900_VX2_Case_B"}

    accepted, suppressed = snmp_live._select_lldp_remote_indexes(
        rows,
        {},
        "fs-private",
        [],
    )
    assert accepted == ["2.192"]
    assert suppressed == ["1.188"]

    accepted, suppressed = snmp_live._select_lldp_remote_indexes(
        rows,
        {},
        "fs-private",
        [
            {
                "mac": "c4:00:ad:d7:26:f4",
                "if_index": "188",
                "bridge_port": "188",
                "vlan": "1005",
                "source_table": "Q-BRIDGE-MIB",
            }
        ],
    )
    assert accepted == ["1.188", "2.192"]
    assert suppressed == []


def test_standard_lldp_keeps_anonymous_rows_without_fdb_evidence():
    rows = _empty_tables(snmp_live.LLDP_OIDS)
    rows["remote_chassis_id"] = {"3.188.1": "C400.ADD7.26F4"}

    accepted, suppressed = snmp_live._select_lldp_remote_indexes(
        rows,
        {},
        "standard",
        [],
    )

    assert accepted == ["3.188.1"]
    assert suppressed == []


def test_fs_switch_falls_back_to_private_lldp_tree(monkeypatch):
    async def fake_get_system(config):
        return {
            "sys_name": "S3900_A",
            "sys_descr": "FS S3900",
            "sys_object_id": "1.3.6.1.4.1.52642.1.446.0",
        }

    async def fake_walk_many(config, definitions):
        rows = _empty_tables(definitions)
        if definitions is snmp_live.FS_LLDP_OIDS:
            rows["remote_chassis_id"] = {"1.192": "649D.99C9.00C4"}
            rows["remote_port_id"] = {"1.192": "TGi0/28"}
            rows["remote_sys_name"] = {"1.192": "S3900_B"}
        elif definitions is snmp_live.FS_LLDP_LOCAL_OIDS:
            rows["local_port_id"] = {"192": "TGi0/28"}
        return rows

    async def fake_walk_many_optional(config, definitions):
        rows = _empty_tables(definitions)
        if definitions is snmp_live.FS_LLDP_REMOTE_MGMT_OIDS:
            rows["remote_mgmt_address"] = {"1.192": "192.168.100.160"}
        return rows

    async def fake_resolve_management_mac(host):
        assert host == "192.168.100.155"
        return "64:9d:99:08:74:48"

    monkeypatch.setattr(snmp_live, "_get_system", fake_get_system)
    monkeypatch.setattr(snmp_live, "_walk_many", fake_walk_many)
    monkeypatch.setattr(snmp_live, "_walk_many_optional", fake_walk_many_optional)
    monkeypatch.setattr(snmp_live, "_resolve_management_mac", fake_resolve_management_mac)

    discovery = asyncio.run(
        snmp_live.discover_seed(
            snmp_live.SnmpSeedConfig(host="192.168.100.155", community="test")
        )
    )

    assert discovery["counts"]["lldp_oid_profile"] == "fs-private"
    assert discovery["counts"]["lldp_candidates"] == 1
    assert discovery["candidates"][0]["name"] == "S3900_B"
    assert discovery["candidates"][0]["ip"] == "192.168.100.160"
    assert discovery["candidates"][0]["lldp_local_port"] == "TGi0/28"
    assert discovery["links"][0]["remote_port"] == "TGi0/28"
    assert discovery["device"]["management_mac"] == "64:9d:99:08:74:48"
    assert discovery["counts"]["management_mac_resolved"] is True
