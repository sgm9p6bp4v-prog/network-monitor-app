# NetWatch - Audit tecnico severo e decisioni architetturali

Data: 2026-06-04

## 1. Fonti analizzate

- `claude.md`: piano funzionale e tecnico iniziale.
- `network_monitor_architecture.svg`: diagramma applicativo a tre layer.
- Documentazione ufficiale FS consultata per validare il realismo di SNMP/LLDP su switch FS:
  - https://resource.fs.com/mall/file/user_manual/n-series-switches-fsos-configuration-guide.pdf
  - https://resource.fs.com/mall/resource/s3150-8t2f-switch-configuration-guide.pdf

## 2. Verdetto esecutivo

Il piano originale è una buona visione prodotto, ma non è ancora un piano tecnico implementabile. Mescola MVP, funzionalità enterprise, discovery, alerting avanzato, flow analytics, backup configurazioni, multiutente e real-time continuo senza definire confini, failure mode, modello dati, sicurezza dei segreti e operatività.

La decisione corretta è restringere il progetto a un MVP SNMP-only robusto, con worker separato, TimescaleDB, Redis, discovery LLDP controllata e dashboard operativa. Ogni funzionalità non essenziale deve restare fuori dal primo rilascio.

Principio guida: prima costruire un monitor affidabile, poi un prodotto ricco.

## 3. Decisioni finali consolidate

### 3.1 Scope MVP

- Scala target: 25-250 dispositivi.
- Protocollo di raccolta: SNMP only.
- ICMP: escluso dall'MVP.
- SSH/WinRM/API vendor/sFlow/NetFlow: esclusi dall'MVP.
- Vendor principale: FS.
- Compatibilità: MIB standard come base, profilo FS opzionale e configurabile.
- Config backup: rimandato fino a stabilizzazione dell'MVP SNMP.

### 3.2 Backend e worker

- API: FastAPI.
- API design: REST per CRUD/query, WebSocket solo per eventi.
- Worker polling: processo separato basato su `arq` + Redis.
- Scheduler dentro FastAPI: vietato per produzione.
- Redis: queue `arq`, cache dashboard, pub/sub WebSocket.
- WebSocket: alert e stato host/interfacce, non streaming continuo delle metriche.

### 3.3 Polling SNMP

- Libreria: adapter astratto, MVP con `pysnmp`.
- SNMP version: v2c + v3.
- Retry: 2 tentativi con timeout 2s.
- Concorrenza: limite globale + limite per device.
- Default concorrenza: 50 task globali, max 2 per device.
- `GETBULK`: adattivo, parte da `max-repetitions=25` e scende in caso di timeout/errori.
- Stato interfacce: ogni 30s.
- Traffico/errori/discards: ogni 60s.
- Inventario completo interfacce/topologia: ogni 15m.

### 3.4 Discovery e topologia

- Discovery: seed-based SNMP/LLDP.
- Nessuno scan subnet nell'MVP.
- L'utente aggiunge manualmente uno o più seed SNMP.
- Il worker legge LLDP-MIB, IF-MIB, BRIDGE-MIB, Q-BRIDGE-MIB e propone device/link.
- Link LLDP visto da entrambi i lati: confermato automaticamente.
- Link LLDP visto da un solo lato: `pending`.
- Pending link: resta finché approvato o rifiutato.
- Link manuale: sempre marcato `manual`.
- Layout topologia: globale, salvato nel DB.
- Ogni posizione layout deve avere almeno `x`, `y`, `locked`, `updated_at`, `source`.

### 3.5 Identità device e interfacce

- Device identity: UUID interno + fingerprint SNMP.
- Collisione fingerprint: blocca import e richiede merge manuale.
- IP address: attributo modificabile, non identità primaria.
- Interfacce: UUID interno + fingerprint da `ifName`, `ifAlias`, `ifDescr`, `ifPhysAddress`, `ifHighSpeed`.
- `ifIndex`: mai considerato stabile.
- Reboot, stack change e firmware update possono cambiare `ifIndex`.

### 3.6 Sicurezza

- Lettura UI: nessun login per MVP, rete LAN trusted.
- API mutative: protette da setup token.
- Setup token: Docker secret separato.
- Sessione mutativa: token scambiato per sessione temporanea di 1 ora.
- Protezione write API: cookie `HttpOnly`, `SameSite=Strict`, CSRF token.
- Credenziali SNMP: salvate in DB cifrate.
- Master key: Docker secret montato come file nel container.
- Cifratura credenziali: master key + data encryption key per ogni credenziale.
- Nessun segreto in log, response API, error traceback o audit event.

### 3.7 Database e metriche

- Database: PostgreSQL + TimescaleDB.
- Migrations: Alembic obbligatorio da subito.
- Schema metriche: tabella generica `metrics(time, target, name, value, labels)`.
- Guardrail obbligatori:
  - `metric_catalog` versionato.
  - nomi metriche validati.
  - target tipizzati.
  - label allowlist.
  - cardinalità controllata.
  - indici progettati prima dell'ingestion massiva.
- Metric catalog: YAML versionato nel repo.
- Profili FS/OID extra: YAML versionati nel repo, importabili e validati.
- Retention: raw 30 giorni.
- Rollup: 5 minuti per 6 mesi, 1 ora dopo.

### 3.8 Metriche MVP

Metriche minime:

- `ifAdminStatus`
- `ifOperStatus`
- traffico in/out tramite contatori high-capacity dove disponibili.
- errori in/out.
- discards in/out.

CPU, memoria, temperatura, alimentatori, ventole e sensori restano fuori dall'MVP salvo disponibilità standard e costo tecnico nullo.

### 3.9 Alerting

- Alert lifecycle: `active`, `acknowledged`, `resolved`.
- Alert iniziali:
  - interfaccia `admin up` + `oper down`.
  - error/discard rate sopra soglia.
- `admin down`: non genera alert.
- Threshold scope MVP: soglie globali.
- Eccezioni alert: alerting on/off per device e interfaccia.
- Error/discard alert: soglia su rate calcolato tra polling, non su contatore assoluto.
- Soglie dinamiche/baseline: fuori MVP.
- Notifiche esterne: fuori MVP iniziale, salvo struttura DB/API pronta per aggiungerle.

### 3.10 Frontend MVP

Pagine MVP:

- Dashboard
- Devices
- Device detail
- Alerts
- Settings
- Topology

Dashboard home:

- solo stato corrente.
- nessun trend 24h.
- nessuna top interface nel primo taglio.

Topology:

- React Flow consigliato per MVP.
- layout globale DB.
- link auto/pending/manual distinguibili.
- nodi pending separati da nodi confermati.

Grafici:

- introdurre grafici storici solo su device detail/interfaccia quando il backend metriche è stabile.
- Apache ECharts consigliato rispetto a Recharts se servono dataset time-series più grandi.

### 3.11 Backup e restore

- Deployment: Docker Compose con backup/update/restore documentati.
- Backup DB: job/container schedulato giornaliero.
- Retention backup: 7 giornalieri + 4 settimanali.
- Restore script: ripristina DB + profili YAML + config app.
- Redis: non autoritativo, escluso dal restore.
- Restore testabile localmente.
- Perdere master key significa perdere accesso alle credenziali cifrate: deve essere documentato in modo esplicito.

### 3.12 Deletion e audit

- Device deletion: soft delete sempre.
- Audit logging: tabella eventi per modifiche config/import/discovery.
- Non serve audit di ogni read API nell'MVP.

### 3.13 Test

- Unit test: fixture statiche di SNMP walk.
- Integration test: container `snmpsim` con dati FS-like.
- Migrazioni: test Alembic forward.
- Restore: script testabile localmente.
- WebSocket: test reconnect/session/event delivery.
- Encryption: test no-secret-in-logs e roundtrip credenziali.

## 4. Findings severi

### P0-01 - Scheduler dentro FastAPI crea duplicazione e perdita di controllo

Problema: il piano originale mette APScheduler nel processo FastAPI. Questo fallisce appena si usano più worker, reload, replica container o restart parziali.

Rischio futuro:

- polling duplicato.
- metriche duplicate.
- alert duplicati.
- SNMP load incontrollato sugli switch.
- impossibilità di fare backpressure.

Decisione: worker separato `arq` + Redis. FastAPI non esegue polling.

### P0-02 - Gestione segreti non era progettata

Problema: SNMP v2c/v3 richiede credenziali persistenti se il sistema deve ripartire da solo. Il piano originale cita community string e SNMPv3, ma non definisce storage sicuro.

Rischio futuro:

- segreti in chiaro nel DB.
- leak nei log.
- backup contenenti credenziali leggibili.
- impossibilità di restore se la master key non è gestita.

Decisione: master key Docker secret + DEK per credenziale + DB cifrato a livello applicativo.

### P0-03 - Metriche generiche senza catalogo diventano ingest incontrollabile

Problema: la tabella generica `metrics` è flessibile, ma pericolosa. Labels libere o metric names non validati distruggono performance e governabilità.

Rischio futuro:

- cardinalità esplosiva.
- query lente.
- retention ingestibile.
- dashboard non affidabile.
- metriche duplicate con nomi diversi.

Decisione: metric catalog YAML obbligatorio, labels allowlist, target tipizzati, validazione in ingestion.

### P0-04 - `ifIndex` non è identità

Problema: SNMP espone `ifIndex`, ma non è stabile su reboot, firmware update, stack change o cambio moduli.

Rischio futuro:

- metriche associate alla porta sbagliata.
- alert su interfacce errate.
- topologia corrotta.
- storico inutilizzabile dopo manutenzione.

Decisione: UUID interno + fingerprint interfaccia. `ifIndex` resta solo puntatore runtime.

### P0-05 - API mutative senza login non significa API senza protezione

Problema: il piano assume LAN trusted. Questo può andare bene per lettura, ma non per scritture.

Rischio futuro:

- modifica configurazione via CSRF.
- import discovery malevolo.
- cancellazione/disabilitazione device.
- cambio soglie o segreti.

Decisione: setup token come Docker secret, sessione temporanea 1 ora, cookie sicuri e CSRF.

### P0-06 - Backup senza restore testato è placebo operativo

Problema: Docker Compose non basta. Senza restore testabile, il backup è solo una speranza.

Rischio futuro:

- backup inutilizzabili.
- mancato restore dopo perdita DB.
- credenziali cifrate non recuperabili per master key mancante.

Decisione: job giornaliero + retention + script restore locale + documentazione master key.

### P1-01 - SNMP-only è giusto, ma config backup deve restare fuori

Problema: config backup realistico su switch FS probabilmente richiede SSH/SCP/TFTP/API o procedure vendor-specific. Questo contraddice SNMP-only.

Decisione: config backup rimandato. Quando arriverà, sarà modulo separato e opt-in, non parte del collector SNMP.

### P1-02 - LLDP non è sempre verità autoritativa

Problema: LLDP può essere disabilitato, monodirezionale, filtrato o incompleto.

Rischio futuro:

- link mancanti.
- link duplicati.
- topologia errata.

Decisione: auto-confirm solo se il link è visto da entrambi i lati. Visto da un lato solo resta pending.

### P1-03 - Access/trunk via SNMP è inferenza, non certezza assoluta

Problema: Q-BRIDGE-MIB aiuta con VLAN membership, ma native VLAN, voice VLAN, hybrid ports, LAG, QinQ e vendor behavior complicano la classificazione.

Decisione:

- classificazione access/trunk con confidence score.
- mostrare fonte e motivo della classificazione.
- permettere override manuale futuro, fuori MVP se non necessario.

### P1-04 - Polling 25-250 device richiede budget esplicito

Problema: 250 device con molte interfacce possono generare migliaia di OID per minuto.

Decisione:

- limiti globali/per-device.
- GETBULK adattivo.
- inventory ogni 15m, non a ogni ciclo.
- traffico/status separati.
- rate/error telemetry del poller.

### P1-05 - WebSocket per metriche continue crea rumore

Problema: inviare ogni metrica live a ogni browser crea backpressure e complessità.

Decisione: WebSocket solo per eventi di stato/alert. Metriche via REST/query.

### P1-06 - FS profile non deve diventare codice hardcoded

Problema: profili vendor nel codice generano release continue per aggiungere OID.

Decisione: YAML versionati, validati, importabili. Backend espone solo un motore di profili.

### P2-01 - Docker Compose deve essere trattato come appliance, non come demo

Requisiti minimi:

- healthcheck.
- volumi nominati.
- backup job.
- restore script.
- migrazioni esplicite.
- secret file permissions.
- upgrade path documentato.
- log rotation.

### P2-02 - Dashboard senza trend è accettabile solo se il dettaglio device è utile

Decisione: home page solo stato corrente. Le analisi storiche possono vivere nelle pagine device/interfaccia dopo stabilizzazione metriche.

### P2-03 - Soglie globali riducono complessità ma aumentano rumore

Decisione: mantenere soglie globali, ma aggiungere alerting on/off per device/interfaccia.

## 5. Architettura raccomandata

### 5.1 Servizi Docker Compose

- `nginx`: reverse proxy per frontend, API e WebSocket.
- `frontend`: React + TypeScript build statico.
- `api`: FastAPI, REST, WebSocket eventi, sessioni setup.
- `worker`: arq worker per polling SNMP, discovery, rollup orchestration.
- `redis`: queue, cache, pub/sub.
- `postgres`: PostgreSQL + TimescaleDB.
- `backup`: job schedulato per `pg_dump`.
- `snmpsim` solo nei profili di test/dev.

### 5.2 Flusso dati

1. Admin inserisce seed device tramite API mutativa protetta.
2. API cifra credenziali con DEK e salva metadati.
3. Worker prende job da Redis.
4. Worker decifra credenziali runtime, esegue SNMP walk/bulk.
5. Worker aggiorna inventory, status e metrics.
6. Worker pubblica eventi host/interface/alert su Redis pub/sub.
7. API inoltra eventi via WebSocket ai client.
8. Frontend legge snapshot dashboard da API/Redis cache.
9. Metriche storiche vengono queryate via REST.

## 6. Schema dati minimo consigliato

Tabelle core:

- `devices`
- `device_credentials`
- `interfaces`
- `metrics`
- `metric_catalog_entries`
- `alerts`
- `events`
- `topology_links`
- `topology_node_layouts`
- `discovery_runs`
- `discovery_candidates`
- `vendor_profiles`
- `backup_runs`
- `setup_sessions`

### 6.1 `devices`

Campi minimi:

- `id uuid primary key`
- `display_name`
- `management_ip`
- `snmp_fingerprint`
- `sys_name`
- `sys_object_id`
- `sys_descr`
- `vendor`
- `model`
- `status`
- `consecutive_failures`
- `alerting_enabled`
- `deleted_at`
- `created_at`
- `updated_at`

### 6.2 `interfaces`

Campi minimi:

- `id uuid primary key`
- `device_id`
- `current_if_index`
- `fingerprint`
- `if_name`
- `if_alias`
- `if_descr`
- `if_phys_address`
- `if_high_speed`
- `admin_status`
- `oper_status`
- `alerting_enabled`
- `last_seen_at`
- `deleted_at`

### 6.3 `metrics`

Campi minimi:

- `time timestamptz not null`
- `target_type`
- `target_id uuid not null`
- `name`
- `value_double`
- `labels jsonb`

Regole:

- `name` deve esistere nel catalogo.
- `target_type` deve essere uno tra valori noti.
- `labels` accetta solo chiavi allowlisted.
- Timescale hypertable su `time`.
- Indici per `(target_id, name, time desc)`.

## 7. Metric catalog iniziale

Metriche MVP:

- `interface.admin_status`
- `interface.oper_status`
- `interface.in_octets`
- `interface.out_octets`
- `interface.in_bps`
- `interface.out_bps`
- `interface.in_errors`
- `interface.out_errors`
- `interface.in_discards`
- `interface.out_discards`
- `interface.in_error_rate`
- `interface.out_error_rate`
- `interface.in_discard_rate`
- `interface.out_discard_rate`

Nota: i contatori raw vanno salvati solo se servono per audit/debug. Per alert e grafici operativi servono soprattutto rate calcolati.

## 8. Profilo FS iniziale

Base standard:

- `SNMPv2-MIB`: system identity.
- `IF-MIB`: inventory e status interfacce.
- `IF-MIB::ifXTable`: high-capacity counters e velocità.
- `LLDP-MIB`: neighbor discovery.
- `BRIDGE-MIB`: bridge port mapping.
- `Q-BRIDGE-MIB`: VLAN membership/PVID dove disponibile.

Profilo FS:

- YAML separato.
- OID extra solo se validati su hardware reale FS.
- Nessun parser CLI/SSH nell'MVP.
- Nessun OID proprietario hardcoded nel backend.

## 9. Roadmap raccomandata

### Milestone 0 - Fondamenta repository

- scaffold backend/frontend/compose.
- lint/test/format.
- Alembic iniziale.
- profili YAML.
- fixture SNMP.

### Milestone 1 - Security e storage

- Postgres/Timescale.
- Redis.
- master key Docker secret.
- cifratura credenziali.
- setup token session + CSRF.
- audit events mutativi.

### Milestone 2 - SNMP worker

- adapter `pysnmp`.
- GETBULK adattivo.
- concurrency limit.
- retry/timeout.
- ingestion device/interface.
- snmpsim integration test.

### Milestone 3 - Metriche e alert

- metric catalog.
- hypertable.
- rate calculation.
- alert statici.
- lifecycle alert.
- snapshot dashboard Redis.

### Milestone 4 - API e frontend MVP

- Dashboard stato corrente.
- Devices.
- Device detail.
- Alerts.
- Settings.
- Topology.
- WebSocket eventi.

### Milestone 5 - Discovery LLDP

- seed discovery.
- candidates pending.
- auto-confirm bidirezionale.
- layout globale.
- merge collision manuale.

### Milestone 6 - Operatività

- backup job.
- restore script.
- documentazione update/restore.
- healthcheck.
- log rotation.
- test restore locale.

## 10. Fuori scope fino a nuovo ordine

- ICMP ping.
- SSH metric collection.
- WinRM.
- REST API vendor.
- sFlow/NetFlow.
- baseline dinamiche.
- notifiche Slack/Teams/email.
- report PDF.
- RBAC/multiutente.
- scan subnet.
- config backup.
- parser CLI FS.
- alta disponibilità.
- Kubernetes.

## 11. Criteri di accettazione MVP

Il progetto può considerarsi MVP solo se:

- un dispositivo FS seed può essere aggiunto via UI/API protetta.
- le credenziali SNMP sono cifrate in DB.
- il worker raccoglie inventory e status via SNMP.
- un reboot del container non perde configurazione.
- `ifIndex` change non corrompe lo storico.
- metriche interfaccia sono salvate e queryabili.
- dashboard mostra stato corrente corretto.
- alert `admin up + oper down` funziona.
- error/discard rate alert funziona.
- LLDP bidirezionale crea link confermato.
- LLDP monodirezionale crea candidate pending.
- backup giornaliero viene prodotto.
- restore script ripristina un backup in locale.
- fixture e `snmpsim` coprono almeno un device FS-like.

## 12. Rischi residui accettati

- LAN trusted senza login completo: accettato per MVP, mitigato sulle write API.
- Docker Compose secrets non equivalgono a un secret manager enterprise.
- MIB FS possono variare tra serie e firmware.
- SNMP v2c resta intrinsecamente debole; SNMPv3 va supportato subito.
- Soglie globali genereranno rumore su reti eterogenee.
- Discovery LLDP non vede apparati che non annunciano LLDP.

## 13. Decisione finale

Non implementare il piano originale alla lettera.

Implementare invece il sottoinsieme definito in questo audit. Ogni nuova funzionalità deve dimostrare di non violare i vincoli qui fissati: SNMP-only, worker separato, sicurezza credenziali, metric catalog, discovery controllata, backup/restore e operatività verificabile.
