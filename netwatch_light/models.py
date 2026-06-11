from __future__ import annotations

from pydantic import BaseModel, Field


class SnmpSeedRequest(BaseModel):
    host: str = Field(min_length=1, max_length=255)
    port: int = Field(default=161, ge=1, le=65535)
    version: str = Field(default="2c", pattern="^(2c|3)$")
    community: str = ""
    username: str = ""
    auth_key: str = ""
    priv_key: str = ""
    auth_protocol: str = "SHA"
    priv_protocol: str = "AES"


class PollingRequest(BaseModel):
    enabled: bool
    interval_seconds: int = Field(default=30, ge=5, le=3600)


class TopologyLayoutPoint(BaseModel):
    x: float
    y: float
    locked: bool = False


class TopologyLayoutRequest(BaseModel):
    layouts: dict[str, TopologyLayoutPoint]
