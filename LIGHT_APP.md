# NetWatch Light App

This is the first working lightweight version of NetWatch. It is intentionally smaller than the final architecture in `TECHNICAL_AUDIT.md`, but it already has a real FastAPI backend, REST endpoints, a WebSocket event stream and a browser UI.

## What works

- FastAPI backend.
- Static frontend served by the backend.
- Mock FS-like SNMP inventory.
- Live seed discovery against a real SNMP switch.
- Local JSON persistence for inventory, links, alerts, events, settings and layout.
- Local JSON persistence for SNMP seed credentials in the light build.
- Multi-seed runtime polling with credentials reloaded after backend restart.
- Backend auto-poll scheduler with configurable interval.
- Device list and device detail.
- LLDP topology with confirmed and pending links.
- Alert lifecycle: active, acknowledged, resolved.
- Manual poll and discovery actions through real API calls.
- WebSocket event stream.

## What is still mocked

- Redis/arq worker.
- PostgreSQL/TimescaleDB.
- Credential encryption.
- Docker secrets.
- Alembic migrations.

The light app persists runtime state in `data/netwatch_state.json`. That file is ignored by git. In this test build, SNMP communities and SNMPv3 secrets are also stored there in plaintext so live polling can resume after a backend restart. This is useful for LAN testing, but it is not the final security model: production still needs encrypted credential storage and key management.

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
