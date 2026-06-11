from __future__ import annotations

import hmac

from fastapi import Header, HTTPException

from .config import get_settings


async def require_setup_token(x_setup_token: str | None = Header(default=None, alias="X-Setup-Token")) -> None:
    expected_token = get_settings().SETUP_TOKEN
    if expected_token == "":
        return
    if x_setup_token is None or not hmac.compare_digest(x_setup_token, expected_token):
        raise HTTPException(status_code=401, detail="invalid or missing setup token")
