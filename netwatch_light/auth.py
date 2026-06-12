from __future__ import annotations

import hmac
import secrets
import time
from typing import Any

from fastapi import Cookie, Header, HTTPException, Response

from .config import get_settings

WRITE_SESSION_COOKIE = "netwatch_write_session"
WRITE_SESSION_TTL_SECONDS = 3600
_write_sessions: dict[str, tuple[str, float]] = {}


def _cleanup_expired_sessions(now: float | None = None) -> None:
    current = now or time.time()
    for session_id, (_, expires_at) in list(_write_sessions.items()):
        if expires_at <= current:
            _write_sessions.pop(session_id, None)


def _has_valid_setup_token(expected_token: str, provided_token: str | None) -> bool:
    return provided_token is not None and hmac.compare_digest(provided_token, expected_token)


def _has_valid_write_session(session_id: str | None, csrf_token: str | None) -> bool:
    if not session_id or not csrf_token:
        return False
    _cleanup_expired_sessions()
    record = _write_sessions.get(session_id)
    if record is None:
        return False
    expected_csrf, expires_at = record
    if expires_at <= time.time():
        _write_sessions.pop(session_id, None)
        return False
    return hmac.compare_digest(csrf_token, expected_csrf)


async def create_write_session(
    response: Response,
    x_setup_token: str | None = Header(default=None, alias="X-Setup-Token"),
) -> dict[str, Any]:
    settings = get_settings()
    expected_token = settings.SETUP_TOKEN
    if expected_token == "":
        if settings.LAN_TRUSTED:
            return {"mode": "lan_trusted", "csrf_token": "", "expires_in_seconds": 0}
        raise HTTPException(
            status_code=503,
            detail="write session disabled: set NETWATCH_SETUP_TOKEN or NETWATCH_LAN_TRUSTED=1",
        )
    if not _has_valid_setup_token(expected_token, x_setup_token):
        raise HTTPException(status_code=401, detail="invalid or missing setup token")

    session_id = secrets.token_urlsafe(32)
    csrf_token = secrets.token_urlsafe(32)
    expires_at = time.time() + WRITE_SESSION_TTL_SECONDS
    _cleanup_expired_sessions()
    _write_sessions[session_id] = (csrf_token, expires_at)
    response.set_cookie(
        key=WRITE_SESSION_COOKIE,
        value=session_id,
        max_age=WRITE_SESSION_TTL_SECONDS,
        httponly=True,
        samesite="strict",
    )
    return {"mode": "session", "csrf_token": csrf_token, "expires_in_seconds": WRITE_SESSION_TTL_SECONDS}


async def require_setup_token(
    x_setup_token: str | None = Header(default=None, alias="X-Setup-Token"),
    x_csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
    write_session: str | None = Cookie(default=None, alias=WRITE_SESSION_COOKIE),
) -> None:
    settings = get_settings()
    expected_token = settings.SETUP_TOKEN
    if expected_token == "":
        if settings.LAN_TRUSTED:
            return
        raise HTTPException(
            status_code=503,
            detail="mutating API disabled: set NETWATCH_SETUP_TOKEN or NETWATCH_LAN_TRUSTED=1",
        )
    if _has_valid_setup_token(expected_token, x_setup_token):
        return
    if _has_valid_write_session(write_session, x_csrf_token):
        return
    raise HTTPException(status_code=401, detail="invalid or missing write authorization")
