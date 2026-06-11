import pytest
from fastapi.testclient import TestClient

import netwatch_light.main as m
from netwatch_light.state import NetWatchState


@pytest.fixture()
def client(monkeypatch, tmp_path):
    # main.app routes use the module-level state object; replace it so mutations
    # from TestClient lifespan shutdown and POST handlers persist only to tmp_path.
    monkeypatch.setattr(m, "state", NetWatchState(tmp_path / "s.json"))
    m.seed_configs.clear()
    with TestClient(m.app) as test_client:
        yield test_client
    m.seed_configs.clear()


def test_health(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_snapshot(client):
    response = client.get("/api/snapshot")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["devices"]) == 5
    assert "runtime" in payload


def test_poll_without_token_in_lan_mode(client):
    response = client.post("/api/poll")

    assert response.status_code == 200


def test_alert_ack_and_missing_alert(client):
    response = client.post("/api/alerts/alert-01/ack")
    missing = client.post("/api/alerts/does-not-exist/ack")

    assert response.status_code == 200
    assert response.json()["alert"]["state"] == "acknowledged"
    assert missing.status_code == 404


def test_index_serves_html(client):
    response = client.get("/")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "<html" in response.text.lower()
