from __future__ import annotations

import sqlite3

from netwatch_light.backup import create_backup, restore_backup
from netwatch_light.state import NetWatchState
from netwatch_light.storage import default_database_url


def test_backup_and_restore_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setenv("NETWATCH_MASTER_KEY", "backup-test-key")
    root = tmp_path / "app"
    root.mkdir()
    (root / "config").mkdir()
    (root / "config" / "metric_catalog.yaml").write_text("version: 1\nmetrics: []\n", encoding="utf-8")

    db_url = default_database_url(root)
    state = NetWatchState(root / "data" / "netwatch_state.json", db_url)
    state.events = [{"id": "event-1", "time": "12:00:00", "text": "backup fixture"}]
    state.persist()

    archive = create_backup(root, root / "backups")
    assert archive.exists()

    db_path = root / "data" / "netwatch.db"
    db_path.unlink()
    restored = restore_backup(root, archive, force=True)

    assert db_path in restored
    conn = sqlite3.connect(db_path)
    payload = conn.execute("select payload from app_state where key = 'snapshot'").fetchone()[0]
    assert "backup fixture" in payload


def test_restore_rejects_overwrite_without_force(tmp_path, monkeypatch):
    monkeypatch.setenv("NETWATCH_MASTER_KEY", "backup-test-key")
    root = tmp_path / "app"
    root.mkdir()
    state = NetWatchState(root / "data" / "netwatch_state.json", default_database_url(root))
    state.persist()
    archive = create_backup(root, root / "backups")

    try:
        restore_backup(root, archive, force=False)
    except FileExistsError:
        pass
    else:
        raise AssertionError("Restore should require --force when local data exists")
