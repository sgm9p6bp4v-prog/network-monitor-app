from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import uuid5, NAMESPACE_DNS

from pysnmp.hlapi.asyncio import (
    CommunityData,
    ContextData,
    ObjectIdentity,
    ObjectType,
    SnmpEngine,
    UdpTransportTarget,
    UsmUserData,
    bulk_walk_cmd,
    get_cmd,
    usmAesCfb128Protocol,
    usmDESPrivProtocol,
    usmHMACMD5AuthProtocol,
    usmHMACSHAAuthProtocol,
    usmNoAuthProtocol,
    usmNoPrivProtocol,
)


SYSTEM_OIDS = {
    "sys_descr": "1.3.6.1.2.1.1.1.0",
    "sys_object_id": "1.3.6.1.2.1.1.2.0",
    "sys_name": "1.3.6.1.2.1.1.5.0",
}

TABLE_OIDS = {
    "if_descr": "1.3.6.1.2.1.2.2.1.2",
    "if_phys_address": "1.3.6.1.2.1.2.2.1.6",
    "if_admin_status": "1.3.6.1.2.1.2.2.1.7",
    "if_oper_status": "1.3.6.1.2.1.2.2.1.8",
    "if_in_discards": "1.3.6.1.2.1.2.2.1.13",
    "if_in_errors": "1.3.6.1.2.1.2.2.1.14",
    "if_out_discards": "1.3.6.1.2.1.2.2.1.19",
    "if_out_errors": "1.3.6.1.2.1.2.2.1.20",
    "if_name": "1.3.6.1.2.1.31.1.1.1.1",
    "if_hc_in_octets": "1.3.6.1.2.1.31.1.1.1.6",
    "if_hc_out_octets": "1.3.6.1.2.1.31.1.1.1.10",
    "if_high_speed": "1.3.6.1.2.1.31.1.1.1.15",
    "if_alias": "1.3.6.1.2.1.31.1.1.1.18",
}

LLDP_OIDS = {
    "remote_chassis_id": "1.0.8802.1.1.2.1.4.1.1.5",
    "remote_port_id": "1.0.8802.1.1.2.1.4.1.1.7",
    "remote_port_desc": "1.0.8802.1.1.2.1.4.1.1.8",
    "remote_sys_name": "1.0.8802.1.1.2.1.4.1.1.9",
}

ADMIN_STATUS = {1: "up", 2: "down", 3: "testing"}
OPER_STATUS = {
    1: "up",
    2: "down",
    3: "testing",
    4: "unknown",
    5: "dormant",
    6: "notPresent",
    7: "lowerLayerDown",
}


@dataclass
class SnmpSeedConfig:
    host: str
    port: int = 161
    version: str = "2c"
    community: str = ""
    username: str = ""
    auth_key: str = ""
    priv_key: str = ""
    auth_protocol: str = "SHA"
    priv_protocol: str = "AES"


def _is_printable(text: str) -> bool:
    if not text:
        return False
    printable = sum(1 for char in text if char.isprintable())
    return printable / len(text) > 0.85


def _text(value: Any) -> str:
    if value is None:
        return ""
    if hasattr(value, "asOctets"):
        raw = bytes(value.asOctets())
        if not raw:
            return ""
        try:
            decoded = raw.decode("utf-8", errors="ignore").strip("\x00").strip()
            if _is_printable(decoded):
                return decoded
        except UnicodeDecodeError:
            pass
        return ":".join(f"{byte:02x}" for byte in raw)
    if hasattr(value, "prettyPrint"):
        return value.prettyPrint()
    return str(value)


def _int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _suffix(oid: Any, base: str) -> str | None:
    base_parts = tuple(int(part) for part in base.split("."))
    if hasattr(oid, "asTuple"):
        oid_parts = tuple(int(part) for part in oid.asTuple())
    else:
        oid_text = _text(oid)
        oid_parts = tuple(int(part) for part in oid_text.strip(".").split(".") if part.isdigit())
    if oid_parts == base_parts:
        return ""
    if oid_parts[: len(base_parts)] != base_parts:
        return None
    return ".".join(str(part) for part in oid_parts[len(base_parts) :])


def _auth_data(config: SnmpSeedConfig) -> CommunityData | UsmUserData:
    if config.version == "3":
        auth_protocol = {
            "NONE": usmNoAuthProtocol,
            "MD5": usmHMACMD5AuthProtocol,
            "SHA": usmHMACSHAAuthProtocol,
        }.get(config.auth_protocol.upper(), usmHMACSHAAuthProtocol)
        priv_protocol = {
            "NONE": usmNoPrivProtocol,
            "DES": usmDESPrivProtocol,
            "AES": usmAesCfb128Protocol,
        }.get(config.priv_protocol.upper(), usmAesCfb128Protocol)
        return UsmUserData(
            config.username,
            authKey=config.auth_key or None,
            privKey=config.priv_key or None,
            authProtocol=auth_protocol,
            privProtocol=priv_protocol,
        )
    return CommunityData(config.community, mpModel=1)


async def _target(config: SnmpSeedConfig) -> UdpTransportTarget:
    return await UdpTransportTarget.create((config.host, config.port), timeout=2, retries=1)


async def _get_system(config: SnmpSeedConfig) -> dict[str, str]:
    error_indication, error_status, error_index, var_binds = await get_cmd(
        SnmpEngine(),
        _auth_data(config),
        await _target(config),
        ContextData(),
        *(ObjectType(ObjectIdentity(oid)) for oid in SYSTEM_OIDS.values()),
    )
    if error_indication:
        raise RuntimeError(str(error_indication))
    if error_status:
        problem = var_binds[int(error_index) - 1][0] if error_index else "unknown OID"
        raise RuntimeError(f"{error_status.prettyPrint()} at {problem}")
    return {key: _text(var_binds[index][1]) for index, key in enumerate(SYSTEM_OIDS)}


async def _walk_table(config: SnmpSeedConfig, base_oid: str) -> dict[str, Any]:
    rows: dict[str, Any] = {}
    async for error_indication, error_status, error_index, var_binds in bulk_walk_cmd(
        SnmpEngine(),
        _auth_data(config),
        await _target(config),
        ContextData(),
        0,
        25,
        ObjectType(ObjectIdentity(base_oid)),
        lexicographicMode=False,
    ):
        if error_indication:
            raise RuntimeError(str(error_indication))
        if error_status:
            problem = var_binds[int(error_index) - 1][0] if error_index else "unknown OID"
            raise RuntimeError(f"{error_status.prettyPrint()} at {problem}")
        for oid, value in var_binds:
            index = _suffix(oid, base_oid)
            if index is not None:
                rows[index] = value
    return rows


async def _walk_many(config: SnmpSeedConfig, tables: dict[str, str]) -> dict[str, dict[str, Any]]:
    results: dict[str, dict[str, Any]] = {}
    for name, oid in tables.items():
        results[name] = await _walk_table(config, oid)
    return results


def _status(table: dict[str, Any], index: str, mapping: dict[int, str]) -> str:
    return mapping.get(_int(table.get(index)), "unknown")


def _device_id(host: str, sys_name: str, sys_object_id: str) -> str:
    seed = f"{host}|{sys_name}|{sys_object_id}"
    return f"live-{uuid5(NAMESPACE_DNS, seed).hex[:12]}"


def _candidate_id(seed_device_id: str, index: str, name: str) -> str:
    seed = f"{seed_device_id}|{index}|{name}"
    return f"candidate-{uuid5(NAMESPACE_DNS, seed).hex[:12]}"


async def discover_seed(config: SnmpSeedConfig) -> dict[str, Any]:
    system = await _get_system(config)
    tables = await _walk_many(config, TABLE_OIDS)
    lldp = await _walk_many(config, LLDP_OIDS)

    sys_name = system.get("sys_name") or config.host
    sys_descr = system.get("sys_descr") or "SNMP device"
    sys_object_id = system.get("sys_object_id") or "unknown"
    device_id = _device_id(config.host, sys_name, sys_object_id)

    indexes = sorted(
        set(tables["if_descr"])
        | set(tables["if_name"])
        | set(tables["if_admin_status"])
        | set(tables["if_oper_status"]),
        key=lambda item: [int(part) if part.isdigit() else part for part in item.split(".")],
    )
    interfaces = []
    for index in indexes:
        name = _text(tables["if_name"].get(index)) or _text(tables["if_descr"].get(index)) or f"if{index}"
        interfaces.append(
            {
                "id": f"{device_id}-if-{index}",
                "name": name,
                "if_index": index,
                "if_alias": _text(tables["if_alias"].get(index)),
                "if_descr": _text(tables["if_descr"].get(index)),
                "if_phys_address": _text(tables["if_phys_address"].get(index)),
                "if_high_speed": _int(tables["if_high_speed"].get(index)),
                "admin_status": _status(tables["if_admin_status"], index, ADMIN_STATUS),
                "oper_status": _status(tables["if_oper_status"], index, OPER_STATUS),
                "in_bps": None,
                "out_bps": None,
                "in_octets": _int(tables["if_hc_in_octets"].get(index)),
                "out_octets": _int(tables["if_hc_out_octets"].get(index)),
                "in_errors": _int(tables["if_in_errors"].get(index)),
                "out_errors": _int(tables["if_out_errors"].get(index)),
                "in_discards": _int(tables["if_in_discards"].get(index)),
                "out_discards": _int(tables["if_out_discards"].get(index)),
                "alerting_enabled": True,
            }
        )

    candidates = []
    for index, raw_name in sorted(lldp["remote_sys_name"].items()):
        remote_name = _text(raw_name).strip()
        if not remote_name:
            continue
        candidate_id = _candidate_id(device_id, index, remote_name)
        candidates.append(
            {
                "id": candidate_id,
                "name": remote_name,
                "ip": "unknown",
                "vendor": "unknown",
                "model": "LLDP candidate",
                "status": "pending",
                "fingerprint": _text(lldp["remote_chassis_id"].get(index)) or f"lldp-{index}",
                "alerting_enabled": False,
                "layout": {"x": 780, "y": 160 + len(candidates) * 110, "locked": False, "source": "auto"},
                "interfaces": [
                    {
                        "id": f"{candidate_id}-remote",
                        "name": _text(lldp["remote_port_id"].get(index)) or _text(lldp["remote_port_desc"].get(index)) or "remote",
                        "if_alias": _text(lldp["remote_port_desc"].get(index)),
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
            }
        )

    device = {
        "id": device_id,
        "name": sys_name,
        "ip": config.host,
        "vendor": "FS" if "FS" in sys_descr.upper() or "FIBERSTORE" in sys_descr.upper() else "unknown",
        "model": sys_descr.splitlines()[0][:80],
        "status": "up",
        "fingerprint": f"uuid+{sys_object_id}+{sys_name}",
        "alerting_enabled": True,
        "layout": {"x": 240, "y": 180, "locked": True, "source": "manual"},
        "interfaces": interfaces,
    }
    links = [
        {
            "id": f"live-link-{device_id}-{candidate['id']}",
            "from": device_id,
            "to": candidate["id"],
            "status": "pending",
            "evidence": "LLDP one side from seed",
        }
        for candidate in candidates
    ]
    return {
        "device": device,
        "candidates": candidates,
        "links": links,
        "system": system,
        "counts": {
            "interfaces": len(interfaces),
            "lldp_candidates": len(candidates),
            "if_descr_rows": len(tables["if_descr"]),
            "if_name_rows": len(tables["if_name"]),
            "if_oper_status_rows": len(tables["if_oper_status"]),
            "lldp_remote_sys_name_rows": len(lldp["remote_sys_name"]),
        },
    }
