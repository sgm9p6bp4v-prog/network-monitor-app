import pytest
from fastapi.testclient import TestClient

import netwatch_light.main as m
from netwatch_light.config import get_settings
from netwatch_light.state import NetWatchState


@pytest.fixture()
def isolated_app_state(monkeypatch, tmp_path):
    # Routes close over netwatch_light.main.state, so swap the object itself to
    # keep TestClient POSTs and lifespan persistence away from the real data dir.
    monkeypatch.setattr(m, "state", NetWatchState(tmp_path / "s.json"))
    m.seed_configs.clear()
    yield
    m.seed_configs.clear()


@pytest.fixture()
def setup_token(monkeypatch):
    monkeypatch.setenv("NETWATCH_SETUP_TOKEN", "testtoken")
    monkeypatch.delenv("NETWATCH_LAN_TRUSTED", raising=False)
    get_settings.cache_clear()
    yield
    monkeypatch.delenv("NETWATCH_SETUP_TOKEN", raising=False)
    monkeypatch.delenv("NETWATCH_LAN_TRUSTED", raising=False)
    get_settings.cache_clear()


def _post(client: TestClient, path: str, payload: dict | None = None, headers: dict | None = None):
    if payload is None:
        return client.post(path, headers=headers or {})
    return client.post(path, json=payload, headers=headers or {})


MUTATING_ENDPOINTS = [
    ("/api/auth/session", None),
    ("/api/poll", None),
    ("/api/discovery", None),
    ("/api/polling", {"enabled": False, "interval_seconds": 30}),
    ("/api/topology/layout", {"layouts": {}}),
    ("/api/live/clear", None),
    ("/api/live/seed", {"host": "127.0.0.1", "community": "public"}),
    ("/api/alerts/alert-01/ack", None),
    ("/api/alerts/alert-01/resolve", None),
]


@pytest.mark.parametrize(("path", "payload"), MUTATING_ENDPOINTS)
def test_all_mutating_endpoints_require_setup_token(isolated_app_state, setup_token, path, payload):
    with TestClient(m.app) as client:
        response = _post(client, path, payload)

    assert response.status_code == 401


def test_setup_token_rejects_missing_or_wrong_token(isolated_app_state, setup_token):
    with TestClient(m.app) as client:
        missing = client.post("/api/poll")
        wrong = client.post("/api/poll", headers={"X-Setup-Token": "wrong"})

    assert missing.status_code == 401
    assert wrong.status_code == 401


def test_setup_token_accepts_correct_token(isolated_app_state, setup_token):
    with TestClient(m.app) as client:
        response = client.post("/api/poll", headers={"X-Setup-Token": "testtoken"})

    assert response.status_code == 200


def test_setup_token_can_be_exchanged_for_csrf_write_session(isolated_app_state, setup_token):
    with TestClient(m.app) as client:
        session = client.post("/api/auth/session", headers={"X-Setup-Token": "testtoken"})
        csrf_token = session.json()["csrf_token"]
        response = client.post("/api/poll", headers={"X-CSRF-Token": csrf_token})

    assert session.status_code == 200
    assert csrf_token
    assert "httponly" in session.headers["set-cookie"].lower()
    assert "samesite=strict" in session.headers["set-cookie"].lower()
    assert response.status_code == 200


def test_write_session_requires_csrf_header(isolated_app_state, setup_token):
    with TestClient(m.app) as client:
        session = client.post("/api/auth/session", headers={"X-Setup-Token": "testtoken"})
        response = client.post("/api/poll")

    assert session.status_code == 200
    assert response.status_code == 401


def test_read_only_snapshot_stays_public_with_setup_token(isolated_app_state, setup_token):
    with TestClient(m.app) as client:
        response = client.get("/api/snapshot")

    assert response.status_code == 200


def test_lan_mode_allows_poll_without_token(monkeypatch, isolated_app_state):
    monkeypatch.delenv("NETWATCH_SETUP_TOKEN", raising=False)
    monkeypatch.setenv("NETWATCH_LAN_TRUSTED", "1")
    get_settings.cache_clear()

    with TestClient(m.app) as client:
        response = client.post("/api/poll")

    assert response.status_code == 200
    get_settings.cache_clear()


def test_mutating_api_fails_closed_without_token_or_lan_mode(monkeypatch, isolated_app_state):
    monkeypatch.delenv("NETWATCH_SETUP_TOKEN", raising=False)
    monkeypatch.delenv("NETWATCH_LAN_TRUSTED", raising=False)
    get_settings.cache_clear()

    with TestClient(m.app) as client:
        response = client.post("/api/poll")

    assert response.status_code == 503
    assert "NETWATCH_SETUP_TOKEN" in response.json()["detail"]
    get_settings.cache_clear()
