Ecco un piano di lavoro completo.




NetWatch — Piano di lavoro completo

1. Stack tecnologico
Server (gira sulla macchina centrale)
Il backend è scritto in Python con FastAPI, che offre performance elevate, documentazione API automatica e supporto nativo a WebSocket. Lo scheduler dei polling gira con APScheduler, integrato direttamente nel processo.
Database
Si usa PostgreSQL con l'estensione TimescaleDB: è una time-series database costruita sopra Postgres, ideale per dati metrici a intervalli regolari (traffico, latenza, carico CPU degli switch). Per la cache dei dati in tempo reale si aggiunge Redis, che permette di servire rapidamente la dashboard senza rileggere il DB ad ogni richiesta.
Frontend
React con TypeScript, servito in produzione da Nginx che fa anche da reverse proxy verso FastAPI. Per la network map si usa la libreria React Flow (o Cytoscape.js per layout più sofisticati), che permette di disegnare nodi e connessioni drag-and-drop con stato persistito. I grafici di metrica usano Recharts o Apache ECharts, entrambi pensati per dati time-series.
Comunicazione real-time
FastAPI apre una connessione WebSocket verso ogni client collegato. Ogni volta che il poller raccoglie dati nuovi, li invia via WebSocket senza che il browser debba fare polling attivo. Questo tiene la dashboard aggiornata al secondo senza caricare il server con centinaia di richieste HTTP.

2. Raccolta dati
SNMP è il protocollo principale e copre la grande maggioranza degli apparati gestiti (switch, router, access point enterprise). La libreria Python usata è pysnmp oppure easysnmp (wrapper C, molto più veloce). Si supportano SNMP v1, v2c e v3 (con autenticazione e cifratura).
Per rispondere alla tua domanda specifica: sì, via SNMP è possibile distinguere porte access da trunk. L'OID rilevante è nella MIB Q-BRIDGE-MIB, in particolare dot1qPortVlanTable e dot1qVlanStaticTable. Una porta trunk mostra membership in più VLAN; una porta access appartiene a una sola VLAN untagged. Alcuni vendor (Cisco, HP/Aruba) espongono queste informazioni anche in MIB proprietarie più leggibili.
Per apparati senza SNMP (piccoli switch unmanaged, dispositivi IoT, endpoint Windows/Linux), si usano protocolli alternativi:
ICMP ping per latenza e raggiungibilità
SSH con Paramiko per eseguire comandi su dispositivi Linux/Unix e leggere output (ip link, ifconfig, metriche di sistema)
WMI / Windows Remote Management per endpoint Windows (tramite impacket o pywinrm)
REST API vendor-specific per access point moderni (es. Ubiquiti UniFi, Cisco Meraki, Aruba Central)
sFlow / NetFlow (con il daemon sflowtool o nfcapd) per traffic analysis granulare sugli switch che lo supportano

3. Funzionalità del sistema
Dashboard principale
Vista generale con KPI in tempo reale: numero host UP/DOWN, latenza media di rete, utilizzo banda aggregato, alert attivi. I valori si aggiornano via WebSocket senza refresh. Ogni KPI è cliccabile e porta al dettaglio dello specifico host o interfaccia.
Network map interattiva
Canvas drag-and-drop dove ogni nodo rappresenta un host. I link tra nodi mostrano lo stato del collegamento (colore verde/giallo/rosso in base a latenza e perdita pacchetti), la banda utilizzata in tempo reale sovrapposta al link, e il tipo di connessione (trunk/access per le porte switch). L'utente può spostare i nodi, raggrupparli per posizione fisica o VLAN, e salvare il layout. La topologia viene suggerita automaticamente dall'analisi LLDP/CDP (protocolli di discovery layer 2 che gli switch gestiti annunciano via SNMP).
Gestione host e porte
Form per aggiungere un host specificando IP, tipo di apparato, credenziali SNMP (community string v2c o auth/priv per v3), e quali interfacce monitorare. Per ogni interfaccia è possibile impostare soglie personalizzate (es. "allerta se utilizzo supera 80% per più di 5 minuti"). Il sistema mostra automaticamente le interfacce rilevate via SNMP, distinguendo porte fisiche, VLAN SVI, tunnel, loopback.
Storico e grafici
Per ogni metrica (latenza, traffico in/out, errori, discards, stato operativo) viene mostrato un grafico time-series con intervalli selezionabili: 1 ora, 6 ore, 24 ore, 7 giorni, 30 giorni. TimescaleDB gestisce la retention e la compressione automatica dei dati storici. I grafici supportano zoom e pan.
Sistema di alerting
Regole configurabili con soglie statiche ("latenza > 100ms") e soglie dinamiche basate su baseline calcolata (es. "traffico superiore al 200% della media delle ultime 2 settimane alla stessa ora"). Gli alert hanno severity (info, warning, critical), possono essere silenziati (maintenance window) e richiedono acknowledgment con nota. Le notifiche vengono inviate via email (SMTP) o webhook (Slack, Teams, o qualunque endpoint HTTP).

4. Funzionalità aggiuntive consigliate
Queste non erano nella tua descrizione ma si integrano naturalmente e aggiungono valore reale.
Autodiscovery della rete — partendo da un range IP o da un seed host, il sistema scansiona la subnet con ping sweep, poi tenta SNMP su ogni host raggiungibile, e usa LLDP/CDP per mappare automaticamente i collegamenti fisici tra switch. Il risultato è una bozza di mappa che l'utente può rifinire manualmente.
VLAN inventory — una vista dedicata che mostra tutte le VLAN presenti nella rete (rilevate via SNMP), quali porte ci appartengono, e quali host sono in ogni VLAN. Utile per audit di sicurezza e troubleshooting.
Bandwidth heatmap — una vista calendare che mostra il consumo di banda ora per ora nella settimana. Permette di identificare pattern di utilizzo (backup notturni, picchi ricorrenti) senza guardare grafici uno per uno.
Log degli eventi di rete — ogni cambio di stato (porta che va down, host irraggiungibile, flap di link) viene registrato con timestamp in un log strutturato navigabile e filtrabile. I flap (link che cambia stato ripetutamente in breve tempo) vengono rilevati e segnalati separatamente dagli outage semplici.
Report schedulati — generazione automatica di PDF/HTML con statistiche settimanali o mensili: uptime per host, top consumer di banda, riepilogo alert. Inviati via email agli amministratori.
Gestione maintenance windows — possibilità di definire finestre temporali in cui gli alert per uno o più host vengono sospesi (es. durante aggiornamenti firmware pianificati).
Autenticazione e multi-utente — login con username/password, sessioni JWT, ruoli differenziati (admin che configura, viewer che consulta). In un'infrastruttura airgapped l'autenticazione è locale, senza dipendenze esterne.
Config backup via SNMP/SSH — per i dispositivi che lo permettono, il sistema può scaricare periodicamente la running config (via SSH/SCP o TFTP) e conservarne uno storico con diff visuale tra versioni.

5. Schema del database
Le tabelle principali sono: hosts (inventario apparati), interfaces (porte monitorate per host), metrics (time-series dati metrici, gestita da TimescaleDB come hypertable partizionata per tempo), alerts (alert generati con stato e ack), events (log cambi di stato), topology_links (connessioni tra host/interfacce per la mappa), vlan_definitions e vlan_memberships, users e roles.





6. Struttura del progetto e deployment


netwatch/
├── backend/
│   ├── api/          # Route FastAPI (hosts, metrics, alerts, topology)
│   ├── collectors/   # Moduli SNMP, ICMP, SSH, API vendor
│   ├── scheduler/    # APScheduler jobs, logica polling
│   ├── models/       # SQLAlchemy ORM
│   └── core/         # Config, websocket manager, alerting
├── frontend/
│   ├── src/
│   │   ├── pages/    # Dashboard, Map, Alerts, Hosts, Reports
│   │   ├── components/
│   │   └── hooks/    # WebSocket, API calls
│   └── public/
├── docker-compose.yml  # PostgreSQL + TimescaleDB + Redis + Backend + Frontend
└── nginx.conf
Il deployment completo si fa con Docker Compose: un singolo docker-compose up avvia tutti i servizi. L'unico requisito sul server è Docker. I client della LAN aprono il browser e puntano all'IP del server sulla porta 80 (o 443 se si vuole HTTPS con certificato self-signed).

7. Fasi di sviluppo suggerite
La progressione logica è: prima il backend con SNMP poller e DB (si vede che i dati arrivano), poi la dashboard base con grafici, poi la network map interattiva (la parte più complessa), poi alerting e notifiche, infine le funzionalità avanzate (autodiscovery, report, backup config). Un MVP funzionante con polling SNMP, grafici di latenza/traffico e mappa manuale è raggiungibile in 6-8 settimane di sviluppo dedicato.