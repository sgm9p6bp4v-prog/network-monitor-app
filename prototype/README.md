# NetWatch MVP prototype

This is a dependency-free working web prototype based on `TECHNICAL_AUDIT.md`.

Run it locally:

```bash
cd prototype
python3 -m http.server 5173
```

Open:

```text
http://127.0.0.1:5173/
```

The prototype uses mock FS-like SNMP inventory data. It does not implement real SNMP polling, credential encryption, Redis, TimescaleDB, or FastAPI yet.
