from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .snmp_live import SnmpSeedConfig, discover_seed
from .state import NetWatchState


ROOT_DIR = Path(__file__).resolve().parent.parent
WEB_DIR = ROOT_DIR / "web"

app = FastAPI(title="NetWatch Light", version="0.1.0")
state = NetWatchState()
subscribers: set[asyncio.Queue[dict[str, Any]]] = set()
last_seed_config: SnmpSeedConfig | None = None


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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def publish(message: dict[str, Any]) -> None:
    stale: list[asyncio.Queue[dict[str, Any]]] = []
    for queue in subscribers:
        try:
            queue.put_nowait(message)
        except asyncio.QueueFull:
            stale.append(queue)
    for queue in stale:
        subscribers.discard(queue)


@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {"status": "ok", "service": "netwatch-light"}


@app.get("/api/snapshot")
async def snapshot() -> dict[str, Any]:
    return state.snapshot()


@app.post("/api/poll")
async def run_poll() -> dict[str, Any]:
    if state.mode == "live" and last_seed_config is not None:
        try:
            discovery = await discover_seed(last_seed_config)
        except Exception as exc:
            result = state.mark_live_poll_failed(str(exc))
            await publish({"type": "poll.failed", "event": result["event"]})
            return result
        result = state.import_live_discovery(discovery)
        await publish({"type": "poll.completed", "event": result["event"]})
        return result
    result = state.run_poll()
    await publish({"type": "poll.completed", "event": result["event"]})
    return result


@app.post("/api/discovery")
async def run_discovery() -> dict[str, Any]:
    result = state.run_discovery()
    await publish({"type": "discovery.completed", "event": result["event"]})
    return result


@app.post("/api/live/clear")
async def clear_live_inventory() -> dict[str, Any]:
    global last_seed_config
    last_seed_config = None
    result = state.clear_live_inventory()
    await publish({"type": "live.cleared", "event": result["event"]})
    return result


@app.post("/api/live/seed")
async def add_live_seed(seed: SnmpSeedRequest) -> dict[str, Any]:
    global last_seed_config
    if seed.version == "2c" and not seed.community:
        raise HTTPException(status_code=400, detail="SNMPv2c community is required")
    if seed.version == "3" and not seed.username:
        raise HTTPException(status_code=400, detail="SNMPv3 username is required")
    config = SnmpSeedConfig(
        host=seed.host.strip(),
        port=seed.port,
        version=seed.version,
        community=seed.community,
        username=seed.username,
        auth_key=seed.auth_key,
        priv_key=seed.priv_key,
        auth_protocol=seed.auth_protocol,
        priv_protocol=seed.priv_protocol,
    )
    try:
        discovery = await discover_seed(config)
    except Exception as exc:
        event = state.add_event(f"Live seed failed for {seed.host}: {exc}")
        await publish({"type": "live.seed.failed", "event": event})
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    last_seed_config = config
    result = state.import_live_discovery(discovery)
    await publish({"type": "live.seed.imported", "event": result["event"]})
    return {
        "system": discovery["system"],
        "counts": discovery["counts"],
        "snapshot": result["snapshot"],
        "event": result["event"],
    }


@app.post("/api/alerts/{alert_id}/ack")
async def acknowledge_alert(alert_id: str) -> dict[str, Any]:
    result = state.update_alert(alert_id, "ack")
    if result is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    await publish({"type": "alert.updated", "event": result["event"], "alert": result["alert"]})
    return result


@app.post("/api/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: str) -> dict[str, Any]:
    result = state.update_alert(alert_id, "resolve")
    if result is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    await publish({"type": "alert.updated", "event": result["event"], "alert": result["alert"]})
    return result


@app.websocket("/ws/events")
async def events_socket(websocket: WebSocket) -> None:
    await websocket.accept()
    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=20)
    subscribers.add(queue)
    await websocket.send_json({"type": "connected", "event": {"text": "WebSocket event stream connected"}})
    try:
        while True:
            message = await queue.get()
            await websocket.send_json(message)
    except WebSocketDisconnect:
        subscribers.discard(queue)


app.mount("/assets", StaticFiles(directory=WEB_DIR), name="assets")


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(WEB_DIR / "index.html")
