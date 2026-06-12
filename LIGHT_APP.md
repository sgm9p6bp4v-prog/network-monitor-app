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
- Setup-token auth on mutating endpoints, fail-closed unless LAN-trusted mode is explicitly enabled.

## What is still mocked / not yet production

- Redis/arq worker (polling runs in-process, not in a separate worker).
- PostgreSQL/TimescaleDB.
- At-rest credential encryption (credentials are stored plaintext, file is `0600`).
- Docker secrets.
- Alembic migrations.

The light app persists runtime state in `data/netwatch_state.json` (git-ignored, written `0600`, parent dir `0700`). In this test build, SNMP communities and SNMPv3 secrets are stored there in plaintext so live polling can resume after a backend restart. This is acceptable for LAN testing, but it is **not** the final security model: production still needs encrypted credential storage and key management.

## Security model (light build)

- **Read-only is public.** `GET /api/health`, `GET /api/snapshot`, the static UI and the `/ws/events` WebSocket require no auth — the deployment assumption is a trusted LAN.
- **Mutating endpoints are token-gated.** All `POST` endpoints (`/api/auth/session`, `/api/poll`, `/api/discovery`, `/api/polling`, `/api/topology/layout`, `/api/live/clear`, `/api/live/seed`, `/api/alerts/{id}/ack|resolve`) require write authorization by default.
  - Set `NETWATCH_SETUP_TOKEN` on the backend, then exchange it once via `POST /api/auth/session` with `X-Setup-Token: <token>`.
  - The backend returns a CSRF token and sets a 1-hour `HttpOnly`, `SameSite=Strict` write-session cookie. Mutating calls then send `X-CSRF-Token`.
  - Direct `X-Setup-Token` on mutating calls is still accepted for script/API clients.
  - If `NETWATCH_SETUP_TOKEN` is unset, mutating endpoints fail closed (`503`) unless `NETWATCH_LAN_TRUSTED=1` is explicitly set.
  - `NETWATCH_LAN_TRUSTED=1` is only for isolated LAN testing; it makes mutations unauthenticated and logs a startup warning.
  - In the UI, paste the token into **Settings → Security → Setup token**. The setup token is not stored; only the CSRF token is kept in `sessionStorage`.
- **Output escaping.** Device/interface/alert/LLDP strings come from the monitored devices and are attacker-controllable, so the UI HTML-escapes them on render (defends against stored XSS via a malicious or spoofed `sysName`, `ifAlias`, LLDP neighbour name, etc.).

## Configuration (environment variables)

| Variable | Default | Purpose |
| --- | --- | --- |
| `NETWATCH_SETUP_TOKEN` | _(empty)_ | Setup token used to create 1-hour write sessions. Empty disables writes unless `NETWATCH_LAN_TRUSTED=1`. |
| `NETWATCH_LAN_TRUSTED` | _(empty)_ | Set to `1` only for isolated LAN testing without write auth. |
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

Start with a setup token for mutations:

```bash
NETWATCH_SETUP_TOKEN=change-me .venv/bin/python -m uvicorn netwatch_light.main:app --host 127.0.0.1 --port 5173
```

For isolated LAN testing without write auth:

```bash
NETWATCH_LAN_TRUSTED=1 .venv/bin/python -m uvicorn netwatch_light.main:app --host 127.0.0.1 --port 5173
```

## Tests

Backend (pytest):

```bash
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m pytest tests/ -q --ignore=tests/frontend
```

Frontend escaping regression test (plain Node, no extra deps):

```bash
node --test "tests/frontend/*.mjs"
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
