from __future__ import annotations

import asyncio
from contextlib import suppress
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .snmp_live import SnmpSeedConfig, discover_seed
from .state import NetWatchState


ROOT_DIR = Path(__file__).resolve().parent.parent
WEB_DIR = ROOT_DIR / "web"
STATE_PATH = ROOT_DIR / "data" / "netwatch_state.json"

app = FastAPI(title="NetWatch Light", version="0.1.0")
state = NetWatchState(STATE_PATH)
subscribers: set[asyncio.Queue[dict[str, Any]]] = set()
seed_configs: dict[str, SnmpSeedConfig] = {}
poll_lock = asyncio.Lock()
scheduler_task: asyncio.Task[None] | None = None


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


def seed_key(config: SnmpSeedConfig) -> str:
    return f"{config.host}:{config.port}"


def seed_metadata(config: SnmpSeedConfig, discovery: dict[str, Any], status: str = "up") -> dict[str, Any]:
    key = seed_key(config)
    system = discovery.get("system", {})
    return {
        "key": key,
        "host": config.host,
        "port": config.port,
        "version": config.version,
        "sys_name": system.get("sys_name") or config.host,
        "sys_object_id": system.get("sys_object_id") or "unknown",
        "status": status,
        "last_error": "",
        "last_counts": discovery.get("counts", {}),
    }


def seed_credentials_record(config: SnmpSeedConfig) -> dict[str, Any]:
    return {
        "key": seed_key(config),
        "host": config.host,
        "port": config.port,
        "version": config.version,
        "community": config.community,
        "username": config.username,
        "auth_key": config.auth_key,
        "priv_key": config.priv_key,
        "auth_protocol": config.auth_protocol,
        "priv_protocol": config.priv_protocol,
    }


def seed_config_from_record(record: dict[str, Any]) -> SnmpSeedConfig:
    host = str(record.get("host") or "").strip()
    if not host:
        raise ValueError("seed credential record is missing host")
    return SnmpSeedConfig(
        host=host,
        port=int(record.get("port") or 161),
        version=str(record.get("version") or "2c"),
        community=str(record.get("community") or ""),
        username=str(record.get("username") or ""),
        auth_key=str(record.get("auth_key") or ""),
        priv_key=str(record.get("priv_key") or ""),
        auth_protocol=str(record.get("auth_protocol") or "SHA"),
        priv_protocol=str(record.get("priv_protocol") or "AES"),
    )


def load_persisted_seed_configs() -> int:
    loaded = 0
    for record in state.seed_credentials:
        try:
            config = seed_config_from_record(record)
        except (TypeError, ValueError):
            continue
        seed_configs[seed_key(config)] = config
        loaded += 1
    return loaded


async def poll_live_seeds(source: str) -> dict[str, Any]:
    if not seed_configs and state.seed_credentials:
        load_persisted_seed_configs()
    if not seed_configs:
        result = state.run_poll()
        await publish({"type": "poll.skipped", "event": result["event"]})
        return result

    successes = 0
    failures = 0
    last_result: dict[str, Any] | None = None
    async with poll_lock:
        for key, config in list(seed_configs.items()):
            try:
                discovery = await discover_seed(config)
            except Exception as exc:
                failures += 1
                last_result = state.mark_live_poll_failed(str(exc), key)
                await publish({"type": "poll.failed", "event": last_result["event"], "seed": key})
                continue
            successes += 1
            state.register_live_seed(seed_metadata(config, discovery))
            last_result = state.import_live_discovery(discovery, key)
            await publish({"type": "poll.completed", "event": last_result["event"], "seed": key})

    if len(seed_configs) > 1:
        event = state.add_event(f"Live {source} finished: {successes} seed(s) ok, {failures} failed")
        last_result = {"event": event, "snapshot": state.snapshot(), "successes": successes, "failures": failures}

    return last_result or {"event": state.add_event("Live poll skipped: no seeds configured"), "snapshot": state.snapshot()}


def scheduler_interval_seconds() -> int:
    polling = state.settings.get("polling", {})
    return int(polling.get("backend_interval_seconds", 30) or 30)


async def scheduler_loop() -> None:
    while True:
        await asyncio.sleep(scheduler_interval_seconds())
        if state.mode == "live" and seed_configs:
            await poll_live_seeds("scheduled poll")


def start_scheduler() -> None:
    global scheduler_task
    if scheduler_task and not scheduler_task.done():
        return
    scheduler_task = asyncio.create_task(scheduler_loop())
    state.settings.setdefault("polling", {})["backend_status"] = "running"
    state.persist()


async def stop_scheduler() -> None:
    global scheduler_task
    if scheduler_task and not scheduler_task.done():
        scheduler_task.cancel()
        with suppress(asyncio.CancelledError):
            await scheduler_task
    scheduler_task = None
    state.settings.setdefault("polling", {})["backend_status"] = "stopped"
    state.persist()


@app.on_event("startup")
async def startup() -> None:
    load_persisted_seed_configs()
    if state.settings.get("polling", {}).get("backend_auto_poll"):
        start_scheduler()


@app.on_event("shutdown")
async def shutdown() -> None:
    await stop_scheduler()


@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {"status": "ok", "service": "netwatch-light"}


@app.get("/api/snapshot")
async def snapshot(response: Response) -> dict[str, Any]:
    response.headers["Cache-Control"] = "no-store"
    data = state.snapshot()
    data["runtime"] = {
        "seed_credentials_loaded": len(seed_configs),
        "seed_credentials_saved": len(state.seed_credentials),
        "scheduler_running": scheduler_task is not None and not scheduler_task.done(),
    }
    return data


@app.post("/api/poll")
async def run_poll() -> dict[str, Any]:
    if state.mode == "live":
        return await poll_live_seeds("manual poll")
    result = state.run_poll()
    await publish({"type": "poll.completed", "event": result["event"]})
    return result


@app.post("/api/discovery")
async def run_discovery() -> dict[str, Any]:
    if state.mode == "live":
        return await poll_live_seeds("LLDP discovery")
    result = state.run_discovery()
    await publish({"type": "discovery.completed", "event": result["event"]})
    return result


@app.post("/api/polling")
async def update_polling(payload: PollingRequest) -> dict[str, Any]:
    result = state.set_backend_polling(payload.enabled, payload.interval_seconds)
    if payload.enabled:
        start_scheduler()
    else:
        await stop_scheduler()
    await publish({"type": "polling.updated", "event": result["event"]})
    return result


@app.post("/api/topology/layout")
async def save_topology_layout(payload: TopologyLayoutRequest) -> dict[str, Any]:
    result = state.update_device_layouts(
        {device_id: point.model_dump() for device_id, point in payload.layouts.items()}
    )
    await publish({"type": "topology.layout.saved", "event": result["event"]})
    return result


@app.post("/api/live/clear")
async def clear_live_inventory() -> dict[str, Any]:
    seed_configs.clear()
    result = state.clear_live_inventory()
    await publish({"type": "live.cleared", "event": result["event"]})
    return result


@app.post("/api/live/seed")
async def add_live_seed(seed: SnmpSeedRequest) -> dict[str, Any]:
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
    key = seed_key(config)
    seed_configs[key] = config
    state.register_seed_credentials(seed_credentials_record(config))
    state.register_live_seed(seed_metadata(config, discovery))
    result = state.import_live_discovery(discovery, key)
    if state.settings.get("polling", {}).get("backend_auto_poll"):
        start_scheduler()
    await publish({"type": "live.seed.imported", "event": result["event"]})
    return {
        "seed": state.seeds,
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
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    finally:
        subscribers.discard(queue)


app.mount("/assets", StaticFiles(directory=WEB_DIR), name="assets")


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(WEB_DIR / "index.html")
