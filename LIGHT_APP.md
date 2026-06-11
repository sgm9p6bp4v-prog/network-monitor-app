# NetWatch Light App

This is the first working lightweight version of NetWatch. It is intentionally smaller than the final architecture in `TECHNICAL_AUDIT.md`, but it already has a real FastAPI backend, REST endpoints, a WebSocket event stream and a browser UI.

## What works

- FastAPI backend (modular: `config`, `auth`, `models`, `fixtures`, `state`, `snmp_live`, `main`).
- Static frontend served by the backend.
- Mock FS-like SNMP inventory.
- Live seed discovery against a real SNMP switch.
- Local JSON persistence for inventory, links, alerts, events, settings and layout.
- Local JSON persistence for SNMP seed credentials in the light build (file mode `0600`).
- Multi-seed runtime polling with credentials reloaded after backend restart.
- Backend auto-poll scheduler with configurable interval.
- Device list and device detail.
- LLDP topology with confirmed and pending links.
- Alert lifecycle: active, acknowledged, resolved.
- Manual poll and discovery actions through real API calls.
- WebSocket event stream with auto-reconnect (exponential backoff) on the client.
- Optional setup-token auth on mutating endpoints.

## What is still mocked / not yet production

- Redis/arq worker (polling runs in-process, not in a separate worker).
- PostgreSQL/TimescaleDB.
- At-rest credential encryption (credentials are stored plaintext, file is `0600`).
- Docker secrets.
- Alembic migrations.

The light app persists runtime state in `data/netwatch_state.json` (git-ignored, written `0600`, parent dir `0700`). In this test build, SNMP communities and SNMPv3 secrets are stored there in plaintext so live polling can resume after a backend restart. This is acceptable for LAN testing, but it is **not** the final security model: production still needs encrypted credential storage and key management.

## Security model (light build)

- **Read-only is public.** `GET /api/health`, `GET /api/snapshot`, the static UI and the `/ws/events` WebSocket require no auth — the deployment assumption is a trusted LAN.
- **Mutating endpoints are token-gated (optional).** All `POST` endpoints (`/api/poll`, `/api/discovery`, `/api/polling`, `/api/topology/layout`, `/api/live/clear`, `/api/live/seed`, `/api/alerts/{id}/ack|resolve`) accept a setup token.
  - Set `NETWATCH_SETUP_TOKEN` on the backend to require the header `X-Setup-Token: <token>` on those calls.
  - If `NETWATCH_SETUP_TOKEN` is unset, the backend runs in LAN-trusted mode (mutations unauthenticated) and logs a startup warning.
  - In the UI, paste the token into **Settings → Security → Setup token**; it is kept in `sessionStorage` and sent automatically on mutating calls.
- **Output escaping.** Device/interface/alert/LLDP strings come from the monitored devices and are attacker-controllable, so the UI HTML-escapes them on render (defends against stored XSS via a malicious or spoofed `sysName`, `ifAlias`, LLDP neighbour name, etc.).

## Configuration (environment variables)

| Variable | Default | Purpose |
| --- | --- | --- |
| `NETWATCH_SETUP_TOKEN` | _(empty)_ | If set, required as `X-Setup-Token` on mutating POSTs. Empty = LAN-trusted. |
| `NETWATCH_STATE_PATH` | `data/netwatch_state.json` | Path of the persisted state file. |
| `NETWATCH_CORS_ORIGINS` | `http://127.0.0.1:5173,http://localhost:5173` | Comma-separated allowed CORS origins. |

## Run locally

Create the virtual environment and install dependencies:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

Start the app:

```bash
.venv/bin/python -m uvicorn netwatch_light.main:app --host 127.0.0.1 --port 5173 --reload
```

Open:

```text
http://127.0.0.1:5173/
```

To require a token for mutations:

```bash
NETWATCH_SETUP_TOKEN=change-me .venv/bin/python -m uvicorn netwatch_light.main:app --host 127.0.0.1 --port 5173
```

## Tests

```bash
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m pytest tests/ -q
```

## Live FS switch test

On the switch, enable SNMP read-only and LLDP. From the app:

1. Open `Settings`.
2. Use `Clear mock data`.
3. Enter the switch management IP.
4. Choose SNMP `v2c` or `v3`.
5. Enter the read-only community or SNMPv3 user details.
6. Click `Test and import seed`.

The app reads:

- `SNMPv2-MIB`: `sysName`, `sysDescr`, `sysObjectID`.
- `IF-MIB` and `ifXTable`: interfaces, admin/oper state, counters.
- `LLDP-MIB`: one-sided neighbor candidates plus local/remote port evidence when available.

Use the `SNMP Seed` button in the dashboard presentation UI for the same workflow without opening the old sidebar shell.
