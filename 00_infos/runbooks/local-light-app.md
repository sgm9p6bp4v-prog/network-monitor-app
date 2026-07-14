# NetWatch Light lokal betreiben

## Start

Voraussetzung ist eine bereits freigegebene und eingerichtete Python-Umgebung.

```bash
.venv/bin/python -m uvicorn netwatch_light.main:app \
  --host 127.0.0.1 --port 5173
```

`scripts/run_light_app.sh` installiert fehlende Dependencies und darf deshalb
nur nach Install-/Download-Freigabe verwendet werden.

## Verifikation

```bash
curl -sf http://127.0.0.1:5173/api/health
curl -sf http://127.0.0.1:5173/api/snapshot >/dev/null
```

Danach die UI unter `http://127.0.0.1:5173/` oeffnen und einen manuellen Poll
ausloesen.

## State und Security

- Persistenz: `data/netwatch_state.json`.
- Die Datei ist nicht Teil von Git.
- Der Light-Build speichert SNMP-Credentials dort im Klartext.
- Kein Internet-Expose, kein Multi-User-Betrieb, keine produktiven Secrets.
- Vor Weitergabe oder Reset die Datei sicher entfernen bzw. getrennt sichern.

## Fehlerbehebung

- Health nicht erreichbar: Uvicorn-Prozess und Port 5173 pruefen.
- SNMP-Seed fehlschlaegt: Erreichbarkeit, read-only SNMP und LLDP am Switch
  pruefen; Secrets nicht in Logs oder Tickets kopieren.
- Persistierter Fehlerzustand: Prozess stoppen, `data/netwatch_state.json`
  separat sichern und nur bewusst zuruecksetzen.
