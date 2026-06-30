from __future__ import annotations

import json
import sqlite3

from netwatch_light.polling import seed_config_from_record
from netwatch_light.state import NetWatchState


def test_seed_credentials_are_encrypted_at_rest(tmp_path, monkeypatch):
    monkeypatch.setenv("NETWATCH_MASTER_KEY", "unit-test-master-key")
    db_url = f"sqlite:///{tmp_path / 'netwatch.db'}"
    state = NetWatchState(tmp_path / "state.json", db_url)
    state.seed_credentials = [
        {
            "key": "192.0.2.10:161",
            "host": "192.0.2.10",
            "port": 161,
            "version": "2c",
            "community": "super-secret-community",
            "username": "",
            "auth_key": "",
            "priv_key": "",
            "auth_protocol": "SHA",
            "priv_protocol": "AES",
        }
    ]
    state.persist()

    raw_db = (tmp_path / "netwatch.db").read_bytes()
    assert b"super-secret-community" not in raw_db

    conn = sqlite3.connect(tmp_path / "netwatch.db")
    app_payload = json.loads(conn.execute("select payload from app_state").fetchone()[0])
    credential_payload = json.loads(conn.execute("select payload from seed_credentials").fetchone()[0])

    assert app_payload["seed_credentials"][0]["encrypted"] is True
    assert "community" not in app_payload["seed_credentials"][0]
    assert credential_payload["encrypted"] is True
    assert "ciphertext" in credential_payload

    reloaded = NetWatchState(tmp_path / "state.json", db_url)
    assert reloaded.seed_credentials[0]["community"] == "super-secret-community"
    config = seed_config_from_record(reloaded.seed_credentials[0])
    assert config.community == "super-secret-community"


def test_wrong_master_key_cannot_decrypt_credentials(tmp_path, monkeypatch):
    monkeypatch.setenv("NETWATCH_MASTER_KEY", "correct-key")
    db_url = f"sqlite:///{tmp_path / 'netwatch.db'}"
    state = NetWatchState(tmp_path / "state.json", db_url)
    state.seed_credentials = [
        {
            "key": "192.0.2.11:161",
            "host": "192.0.2.11",
            "port": 161,
            "version": "2c",
            "community": "another-secret",
        }
    ]
    state.persist()

    monkeypatch.setenv("NETWATCH_MASTER_KEY", "wrong-key")
    try:
        NetWatchState(tmp_path / "state.json", db_url)
    except RuntimeError as exc:
        assert "Credential decryption failed" in str(exc)
    else:
        raise AssertionError("Expected credential decryption to fail with the wrong key")
