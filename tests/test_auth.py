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
    get_settings.cache_clear()
    yield
    monkeypatch.delenv("NETWATCH_SETUP_TOKEN", raising=False)
    get_settings.cache_clear()


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


def test_read_only_snapshot_stays_public_with_setup_token(isolated_app_state, setup_token):
    with TestClient(m.app) as client:
        response = client.get("/api/snapshot")

    assert response.status_code == 200


def test_lan_mode_allows_poll_without_token(monkeypatch, isolated_app_state):
    monkeypatch.delenv("NETWATCH_SETUP_TOKEN", raising=False)
    get_settings.cache_clear()

    with TestClient(m.app) as client:
        response = client.post("/api/poll")

    assert response.status_code == 200
    get_settings.cache_clear()
