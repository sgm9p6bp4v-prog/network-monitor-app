# NetWatch Light App

This is the first working lightweight version of NetWatch. It is intentionally smaller than the final architecture in `TECHNICAL_AUDIT.md`, but it already has a real FastAPI backend, REST endpoints, a WebSocket event stream and a browser UI.

## What works

- FastAPI backend.
- Static frontend served by the backend.
- Mock FS-like SNMP inventory.
- Live seed discovery against a real SNMP switch.
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
- Scheduled polling loops.

The live seed mode uses SNMP for the immediate request, imports the result into memory, and does not store the community or SNMPv3 secrets.

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
- `LLDP-MIB`: one-sided neighbor candidates.

Credentials are only used for that request in this light build.
