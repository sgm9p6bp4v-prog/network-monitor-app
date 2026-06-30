from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
import tarfile
import tempfile
from typing import Iterable

from .security import default_master_key_path
from .storage import default_database_url


BACKUP_FORMAT_VERSION = 1


def create_backup(root_dir: Path, output_dir: Path | None = None) -> Path:
    root_dir = root_dir.resolve()
    output_dir = (output_dir or root_dir / "data" / "backups").resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    archive_path = output_dir / f"netwatch-light-backup-{timestamp}.tar.gz"
    database_url = default_database_url(root_dir)
    db_path = _sqlite_path(database_url)
    key_path = default_master_key_path(database_url)

    metadata = {
        "format": "netwatch-light-backup",
        "format_version": BACKUP_FORMAT_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "includes": [],
    }

    with tempfile.TemporaryDirectory(prefix="netwatch-backup-") as tmp:
        staging = Path(tmp) / "netwatch-backup"
        staging.mkdir()
        _copy_if_exists(db_path, staging / "data" / db_path.name, metadata)
        _copy_if_exists(key_path, staging / "data" / key_path.name, metadata)
        for config_file in sorted((root_dir / "config").glob("*.yaml")):
            _copy_if_exists(config_file, staging / "config" / config_file.name, metadata)
        (staging / "backup-metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")

        with tarfile.open(archive_path, "w:gz") as archive:
            for path in sorted(staging.rglob("*")):
                archive.add(path, arcname=path.relative_to(staging))

    return archive_path


def restore_backup(root_dir: Path, archive_path: Path, force: bool = False) -> list[Path]:
    root_dir = root_dir.resolve()
    archive_path = archive_path.resolve()
    if not archive_path.exists():
        raise FileNotFoundError(archive_path)
    restored: list[Path] = []
    with tempfile.TemporaryDirectory(prefix="netwatch-restore-") as tmp:
        staging = Path(tmp) / "restore"
        staging.mkdir()
        with tarfile.open(archive_path, "r:gz") as archive:
            _safe_extract(archive, staging)

        metadata_path = staging / "backup-metadata.json"
        if not metadata_path.exists():
            raise ValueError("Backup archive is missing backup-metadata.json")
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        if metadata.get("format") != "netwatch-light-backup":
            raise ValueError("Backup archive has an unsupported format")

        for relative in _restore_candidates(staging):
            source = staging / relative
            target = root_dir / relative
            if target.exists() and not force:
                raise FileExistsError(f"{target} exists; use --force to restore over it")
            if target.exists():
                _backup_existing_file(target)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            restored.append(target)

    return restored


def main() -> None:
    parser = argparse.ArgumentParser(description="Backup and restore NetWatch Light local data")
    subparsers = parser.add_subparsers(dest="command", required=True)

    backup_parser = subparsers.add_parser("create", help="Create a backup archive")
    backup_parser.add_argument("--root", default=".", help="Application root directory")
    backup_parser.add_argument("--output", default="", help="Output backup directory")

    restore_parser = subparsers.add_parser("restore", help="Restore a backup archive")
    restore_parser.add_argument("archive", help="Backup archive path")
    restore_parser.add_argument("--root", default=".", help="Application root directory")
    restore_parser.add_argument("--force", action="store_true", help="Overwrite current local data")

    args = parser.parse_args()
    if args.command == "create":
        output = Path(args.output) if args.output else None
        archive = create_backup(Path(args.root), output)
        print(archive)
        return
    if args.command == "restore":
        restored = restore_backup(Path(args.root), Path(args.archive), force=args.force)
        for path in restored:
            print(path)


def _copy_if_exists(source: Path, target: Path, metadata: dict[str, object]) -> None:
    if not source.exists():
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    includes = metadata.setdefault("includes", [])
    if isinstance(includes, list):
        includes.append(str(target))


def _sqlite_path(database_url: str) -> Path:
    if not database_url.startswith("sqlite:///"):
        raise ValueError("The light backup command currently supports local SQLite DATABASE_URL only")
    return Path(database_url[len("sqlite:///") :]).resolve()


def _restore_candidates(staging: Path) -> Iterable[Path]:
    for relative in (
        Path("data/netwatch.db"),
        Path("data/netwatch_master.key"),
    ):
        if (staging / relative).exists():
            yield relative
    config_dir = staging / "config"
    if config_dir.exists():
        for path in sorted(config_dir.glob("*.yaml")):
            yield path.relative_to(staging)


def _safe_extract(archive: tarfile.TarFile, target_dir: Path) -> None:
    target_dir = target_dir.resolve()
    for member in archive.getmembers():
        member_path = target_dir / member.name
        resolved = member_path.resolve()
        if target_dir not in resolved.parents and resolved != target_dir:
            raise ValueError(f"Unsafe path in backup archive: {member.name}")
    archive.extractall(target_dir, filter="data")


def _backup_existing_file(path: Path) -> None:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_path = path.with_name(f"{path.name}.pre-restore-{timestamp}")
    shutil.copy2(path, backup_path)


if __name__ == "__main__":
    main()
