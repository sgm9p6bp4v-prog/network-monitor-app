from __future__ import annotations

import base64
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet, InvalidToken


SENSITIVE_CREDENTIAL_FIELDS = {
    "community",
    "username",
    "auth_key",
    "priv_key",
    "auth_protocol",
    "priv_protocol",
}


class CredentialEncryptionError(RuntimeError):
    pass


@dataclass(frozen=True)
class CredentialSecurityInfo:
    enabled: bool
    key_source: str
    key_id: str
    algorithm: str = "fernet"


class CredentialCipher:
    def __init__(self, database_url: str) -> None:
        key_material, key_source = _load_key_material(database_url)
        fernet_key = _fernet_key(key_material)
        self._fernet = Fernet(fernet_key)
        self.info = CredentialSecurityInfo(
            enabled=True,
            key_source=key_source,
            key_id=hashlib.sha256(fernet_key).hexdigest()[:16],
        )

    def encrypt_record(self, record: dict[str, Any]) -> dict[str, Any]:
        raw = json.dumps(record, sort_keys=True, separators=(",", ":")).encode("utf-8")
        token = self._fernet.encrypt(raw).decode("ascii")
        return {
            "encrypted": True,
            "algorithm": self.info.algorithm,
            "key_id": self.info.key_id,
            "ciphertext": token,
        }

    def decrypt_record(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not payload.get("encrypted"):
            return dict(payload)
        if payload.get("algorithm") not in {"", None, self.info.algorithm}:
            raise CredentialEncryptionError(f"Unsupported credential algorithm: {payload.get('algorithm')}")
        ciphertext = str(payload.get("ciphertext") or "")
        if not ciphertext:
            raise CredentialEncryptionError("Encrypted credential payload is missing ciphertext")
        try:
            raw = self._fernet.decrypt(ciphertext.encode("ascii"))
        except (InvalidToken, ValueError) as exc:
            raise CredentialEncryptionError("Credential decryption failed; check the master key") from exc
        decoded = json.loads(raw.decode("utf-8"))
        if not isinstance(decoded, dict):
            raise CredentialEncryptionError("Credential payload did not decode to an object")
        return decoded


def sanitize_seed_credential(record: dict[str, Any]) -> dict[str, Any]:
    sanitized = {
        key: value
        for key, value in record.items()
        if key not in SENSITIVE_CREDENTIAL_FIELDS
    }
    sanitized["encrypted"] = True
    sanitized["credential_ref"] = record.get("key")
    return sanitized


def security_settings(cipher: CredentialCipher | None = None) -> dict[str, str]:
    info = cipher.info if cipher else None
    return {
        "credential_storage": "encrypted local database",
        "credential_cipher": info.algorithm if info else "unavailable",
        "master_key": "configured" if info else "not configured",
        "master_key_source": info.key_source if info else "none",
        "credential_key_id": info.key_id if info else "",
        "write_session": "not implemented",
    }


def default_master_key_path(database_url: str) -> Path:
    if database_url.startswith("sqlite:///"):
        db_path = Path(database_url[len("sqlite:///") :])
        return db_path.parent / "netwatch_master.key"
    return Path("data/netwatch_master.key")


def _load_key_material(database_url: str) -> tuple[bytes, str]:
    env_key = os.getenv("NETWATCH_MASTER_KEY", "").strip()
    if env_key:
        return env_key.encode("utf-8"), "env:NETWATCH_MASTER_KEY"

    env_file = os.getenv("NETWATCH_MASTER_KEY_FILE", "").strip()
    if env_file:
        path = Path(env_file).expanduser()
        try:
            return path.read_bytes().strip(), f"file:{path}"
        except OSError as exc:
            raise CredentialEncryptionError(f"Unable to read NETWATCH_MASTER_KEY_FILE: {path}") from exc

    path = default_master_key_path(database_url)
    if path.exists():
        return path.read_bytes().strip(), f"file:{path}"

    path.parent.mkdir(parents=True, exist_ok=True)
    generated = Fernet.generate_key()
    path.write_bytes(generated + b"\n")
    try:
        path.chmod(0o600)
    except OSError:
        pass
    return generated, f"generated-file:{path}"


def _fernet_key(material: bytes) -> bytes:
    stripped = material.strip()
    try:
        decoded = base64.urlsafe_b64decode(stripped)
        if len(decoded) == 32:
            return stripped
    except (ValueError, TypeError):
        pass
    return base64.urlsafe_b64encode(hashlib.sha256(stripped).digest())
