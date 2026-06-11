from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import os
from pathlib import Path


DEFAULT_CORS_ORIGINS = ["http://127.0.0.1:5173", "http://localhost:5173"]


@dataclass(frozen=True)
class Settings:
    SETUP_TOKEN: str
    STATE_PATH: Path
    CORS_ORIGINS: list[str]


@lru_cache
def get_settings() -> Settings:
    package_dir = Path(__file__).resolve().parent
    repo_root = package_dir.parent
    cors_origins_raw = os.environ.get("NETWATCH_CORS_ORIGINS")
    state_path_raw = os.environ.get("NETWATCH_STATE_PATH")
    cors_origins = (
        [origin.strip() for origin in cors_origins_raw.split(",") if origin.strip()]
        if cors_origins_raw is not None
        else DEFAULT_CORS_ORIGINS
    )
    return Settings(
        SETUP_TOKEN=os.environ.get("NETWATCH_SETUP_TOKEN", ""),
        STATE_PATH=Path(state_path_raw) if state_path_raw is not None else repo_root / "data" / "netwatch_state.json",
        CORS_ORIGINS=cors_origins,
    )
