import stat

import pytest

from netwatch_light.state import NetWatchState


def _interface(state: NetWatchState, device_id: str, interface_id: str) -> dict:
    device = next(device for device in state.devices if device["id"] == device_id)
    return next(interface for interface in device["interfaces"] if interface["id"] == interface_id)


def test_default_snapshot_counts(tmp_path):
    state = NetWatchState(tmp_path / "state.json")

    snapshot = state.snapshot()

    assert snapshot["mode"] == "mock"
    assert len(snapshot["devices"]) == 5
    assert len(snapshot["links"]) == 4
    assert len(snapshot["alerts"]) == 3


def test_run_poll_bumps_edge_interface_counters(tmp_path):
    state = NetWatchState(tmp_path / "state.json")
    before = _interface(state, "edge-01", "edge-01-eth1-24").copy()

    state.run_poll()

    after = _interface(state, "edge-01", "edge-01-eth1-24")
    assert after["in_discards"] == before["in_discards"] + 3
    assert after["in_errors"] == before["in_errors"] + 1


def test_alert_lifecycle(tmp_path):
    state = NetWatchState(tmp_path / "state.json")

    acknowledged = state.update_alert("alert-01", "ack")
    assert acknowledged is not None
    assert acknowledged["alert"]["state"] == "acknowledged"

    resolved = state.update_alert("alert-01", "resolve")
    assert resolved is not None
    assert resolved["alert"]["state"] == "resolved"

    assert state.update_alert("nope", "ack") is None


def test_clear_live_inventory_sets_live_empty_inventory(tmp_path):
    state = NetWatchState(tmp_path / "state.json")

    state.clear_live_inventory()

    assert state.mode == "live"
    assert state.devices == []
    assert state.links == []
    assert state.alerts == []
    assert state.seeds == []


def test_set_backend_polling(tmp_path):
    state = NetWatchState(tmp_path / "state.json")

    state.set_backend_polling(True, 45)

    polling = state.settings["polling"]
    assert polling["backend_auto_poll"] is True
    assert polling["backend_interval_seconds"] == 45


def test_persist_writes_secure_file_and_reloads_mode(tmp_path):
    state_path = tmp_path / "nested" / "state.json"
    state = NetWatchState(state_path)
    state.mode = "live"

    state.persist()

    assert state_path.exists()
    assert stat.S_IMODE(state_path.stat().st_mode) == 0o600
    assert stat.S_IMODE(state_path.parent.stat().st_mode) == 0o700

    reloaded = NetWatchState(state_path)
    assert reloaded.mode == "live"


def test_persist_refuses_existing_group_accessible_state_directory(tmp_path):
    state_dir = tmp_path / "shared"
    state_dir.mkdir()
    state_dir.chmod(0o755)
    state = NetWatchState(state_dir / "state.json")

    with pytest.raises(PermissionError):
        state.persist()

    assert stat.S_IMODE(state_dir.stat().st_mode) == 0o755


def test_seed_failures_are_tracked_per_seed(tmp_path):
    state = NetWatchState(tmp_path / "state.json")
    state.devices = [
        {"id": "a-dev", "seed_key": "a", "status": "up", "interfaces": [], "alerting_enabled": True, "name": "A"},
        {"id": "b-dev", "seed_key": "b", "status": "up", "interfaces": [], "alerting_enabled": True, "name": "B"},
    ]
    state.seeds = [{"key": "a", "status": "up", "last_error": ""}, {"key": "b", "status": "up", "last_error": ""}]

    state.mark_live_poll_failed("boom", "a")
    state.mark_live_poll_failed("boom", "a")
    state._reset_live_failures("b")
    state.mark_live_poll_failed("boom", "a")

    assert state.live_failures_by_seed["a"] == 3
    assert state.devices[0]["status"] == "down"
    assert state.seeds[0]["status"] == "down"
    assert state.devices[1]["status"] == "up"
