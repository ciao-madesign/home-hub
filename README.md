# Home Entertainment Hub

Home Entertainment Hub personale per Dell Wyse 5070: un'unica Web App
proprietaria (React) che aggrega Film, Serie, Foto, Musica, Giochi, File,
Download, Backup e gestione del sistema, parlando esclusivamente con
un'API centrale (Hub Orchestrator) e mai direttamente con i backend interni
(Jellyfin, Immich, filesystem, database).

Le specifiche complete sono in [`docs/SPEC_V1.md`](docs/SPEC_V1.md) e
[`docs/SPEC_V2.md`](docs/SPEC_V2.md); lo stato di implementazione,
checklist per fase e decisioni prese lungo il percorso sono in
[`docs/SPECIFICHE.md`](docs/SPECIFICHE.md); le decisioni su strumenti
esterni in [`docs/EXTERNAL_TOOLS.md`](docs/EXTERNAL_TOOLS.md). Per chi
sviluppa sul codice, vedi [`CLAUDE.md`](CLAUDE.md) (convenzioni,
architettura, comandi).

```
Dispositivo utente → React Web App → Hub API / Orchestrator → Backend interni → SSD / dischi dati
```

## Struttura repository

```
home-hub/
├── apps/
│   ├── api/     Hub API (Fastify + TypeScript + SQLite, node:sqlite)
│   └── web/     Web App (React + Vite + TypeScript)
├── infra/
│   └── docker-compose.yml   Orchestrazione servizi (api, web, jellyfin, …)
└── docs/        Specifiche di prodotto
```

## Stato attuale

Implementato, corrispondente alle Fasi 3-5 della roadmap (§38 in
`SPEC_V1.md`):

- **Hub API**: server Fastify, database SQLite (`node:sqlite`) con
  migrazioni, selezione profilo su LAN senza password, login remoto
  username/password, sessioni con token, health check, stato sistema
  (CPU/RAM/temperatura/storage/servizi) con indicatore
  NORMAL/ATTENTION/PROBLEM.
- **Web App**: layout con sidebar collassabile, ricerca globale (UI),
  Home dashboard con sezioni in ordine di priorità, pagina Sistema con
  metriche live, selezione profilo, dark theme, focus visibile per
  navigazione D-pad/TV, gestione stato offline.
- **Jellyfin (Film/Serie)**: integrato esclusivamente tramite l'Hub API
  (il frontend non conosce Jellyfin — §2). Cataloghi Film/Serie, dettaglio
  con stagioni/episodi, riproduzione Direct Play con supporto Range/seek,
  salvataggio automatico del punto di visione e "Continua a guardare" in
  Home (stato di riproduzione tenuto nel DB Hub, non in Jellyfin),
  marcatura come guardato oltre il 90%, prompt di conferma "Prossimo
  episodio".
- **Immich (Foto/Video personali)**: stesso pattern di isolamento.
  Timeline con filtro "solo video", album, visualizzazione full screen
  (lightbox con navigazione prev/next e riproduzione video), slideshow a
  intervallo configurabile (3/5/10s).
- Se Jellyfin o Immich non sono raggiungibili, la relativa sezione resta
  visibile con un avviso invece di rompersi (§31) — comportamento
  verificato per entrambi.
- **File Manager** (§11): proprietario, opera sul filesystem sotto
  `Files/{shared,private/<userId>}`. Cartelle, upload/download, rinomina,
  ricerca per nome, rilevamento duplicati (per hash, nessuna eliminazione
  automatica), cestino con scadenza 7 giorni e ripristino. Spostare un
  contenuto tra "Condivisi" e "Privati" è anche il modo per cambiarne la
  visibilità. Eliminazione definitiva sia dal cestino sia diretta
  (con conferma aggiuntiva).
- **Download Manager** (§12): coda unica per download "normali" (yt-dlp,
  invocato come processo esterno con pausa/ripresa reali via
  SIGSTOP/SIGCONT) e torrent (WebTorrent, libreria embedded nell'Hub API —
  nessun servizio Docker separato). Pausa/ripresa reali anche per i
  torrent (distruzione e riaggiunta del torrent, i byte già scaricati
  restano su disco e non vengono riscaricati). Limite di banda globale
  configurabile per dare priorità minima a streaming/backup (§32). Nessuno
  storico permanente per i completati (rimossi dopo una breve finestra).
  Vedi le decisioni in `docs/EXTERNAL_TOOLS.md`.
- **Gaming** (§10): catalogo (titolo, piattaforma, copertina), importazione
  da cartelle monitorate con conferma, esecuzione locale di emulatori
  retro (avvio/stop di processo), gestione macchine (locale + PC remoti),
  Wake-on-LAN (pacchetto magico verificato byte per byte), probe di stato
  online/offline, backup centralizzato dei salvataggi. **Non
  implementato**: avvio effettivo di sessioni Sunshine/Moonlight (solo
  risveglio + verifica stato), controller Bluetooth/USB. **Questione
  architetturale aperta**: gli emulatori vengono lanciati come processo
  figlio dell'Hub API — se l'Hub gira in Docker (come nel compose fornito)
  serve decidere se farli girare sull'host o tramite un agente locale
  dedicato, dato che serve accesso al display fisico. Vedi
  `docs/SPECIFICHE.md` §3.
- **Storage e Backup** (§4/§5/§29): pagina dedicata con visibilità dischi
  (capacità, spazio libero, soglia critica, SMART con degrado esplicito
  se `smartctl`/`findmnt` non disponibili) e backup automatico/manuale
  ("Backup Now") di dati personali (File Manager, Foto, salvataggi
  Giochi), database (snapshot consistente via `VACUUM INTO`) e
  configurazioni Hub/Docker. Copia con limite di banda, scrittura
  atomica e verifica di integrità per hash, skip dei file invariati
  (ripresa naturale dopo un'interruzione), storico dei run. Ripristino
  di base da disco di backup verso il disco dati, dietro conferma
  esplicita. **Non implementato**: libreria virtuale multi-disco con
  distribuzione automatica dei nuovi file (File Manager/Gaming/Download
  Manager assumono ancora un unico disco dati), wizard di recovery
  guidato su hardware nuovo, riapplicazione automatica delle
  configurazioni Hub/Docker ripristinate su un sistema live.
- **Rete — discovery locale** (§21, prima parte della Fase 9): l'Hub si
  annuncia sulla LAN come `home-hub.local` via mDNS (`bonjour-service`,
  nessun `avahi-daemon` richiesto), mostrato con QR code sia nella
  schermata di selezione profilo (per farsi scoprire da un secondo
  dispositivo, prima del login) sia nella pagina Sistema. Gestione Wi-Fi
  (scansione/connessione) per gli admin, via NetworkManager, con
  degrado esplicito se non disponibile. **Non implementato**: wizard di
  primo avvio, accesso remoto HTTPS/DDNS/tunnel, VPN personale — vedi
  `docs/SPECIFICHE.md`.
- Musica resta stub (fase successiva).

**Limitazione nota**: le integrazioni Jellyfin e Immich sono state
validate contro server di test che replicano le rispettive API REST
(nessuna istanza reale era raggiungibile nell'ambiente di sviluppo — il
registry Docker non era accessibile dalla policy di rete). Da validare
contro istanze vere prima di considerarle definitive. File Manager,
Download Manager e Gaming, essendo codice proprietario (oltre a yt-dlp e
WebTorrent, entrambi verificati direttamente), sono stati invece validati
contro un filesystem reale e, per i torrent, un vero scambio peer-to-peer
locale. Wake-on-LAN verificato sul formato del pacchetto, non contro un
PC reale (nessun target disponibile in questo ambiente). Storage/Backup
validato a fondo su filesystem reale (copia con verifica di integrità,
skip incrementale, ripristino con recupero effettivo del contenuto); SMART
verificato solo nel percorso di degrado (nessun device reale con
`smartctl` disponibile in questo ambiente). mDNS (`.local`/QR) verificato
per davvero con un client separato sullo stesso loopback; risoluzione da
parte di client reali (macOS/iOS/Android/Windows) su una LAN reale non
verificata. Wi-Fi verificato solo nel percorso di degrado (nessun
NetworkManager/hardware Wi-Fi in questo ambiente).

Non ancora implementato: wizard di primo avvio, accesso remoto/DDNS/
HTTPS, VPN personale, selezione traccia audio multipla, ricerca globale
full-text, priorità dinamica di download/backup basata sull'attività di
streaming in corso (attualmente un limite di banda statico per
entrambi), avvio sessioni Sunshine/Moonlight, libreria virtuale
multi-disco con distribuzione automatica dei nuovi file. Vedi la
roadmap completa e la checklist dettagliata in `docs/SPEC_V1.md` §38-39
e `docs/SPECIFICHE.md`.

## Sviluppo locale

Richiede Node.js ≥ 20. Per il Download Manager (§12) serve anche `yt-dlp`
nel PATH (`pip install yt-dlp`) — senza, i soli download da URL falliscono
con un errore, il resto dell'Hub non è impattato (§31).

```bash
npm install

# Terminale 1 — Hub API su http://localhost:4000
npm run dev:api

# Terminale 2 — Web App su http://localhost:5173 (proxy /api → :4000)
npm run dev:web
```

Al primo avvio l'API crea `apps/api/data/hub.sqlite` con due profili di
esempio (`Owner`/admin e `Utente`), sufficienti per usare la selezione
profilo. Il wizard di primo avvio guidato (§28) sostituirà questo seed.

Variabili d'ambiente disponibili in `apps/api/.env.example`.

### Verifica tipi e build

```bash
npm run typecheck
npm run build
```

## Deploy

Architettura mista, non "tutto in Docker": l'**Hub API gira direttamente
sull'host** (systemd), mentre **Web App, Jellyfin e Immich restano in
Docker**. Motivo: il modulo Gaming deve avviare emulatori/Moonlight con
accesso diretto a schermo e controller, cosa che un container non ha di
norma — vedi `docs/SPECIFICHE.md` §2/§3 per il ragionamento completo. Come
effetto collaterale utile, anche Wake-on-LAN e la lettura di temperatura/
CPU reali (§30) diventano più semplici.

### 1. Hub API (systemd, sull'host)

```bash
git clone <questo-repo> /opt/home-hub
cd /opt/home-hub
npm install
npm run build -w apps/api

cd apps/api
cp .env.example .env   # imposta almeno HUB_DATA_ROOT assoluto, vedi commenti nel file
pip install --user yt-dlp   # Download Manager, §12
sudo apt install smartmontools   # SMART, §29 — opzionale, senza: sezione "non disponibile"
# HUB_BACKUP_ROOT: imposta al mount point del disco di backup quando
# disponibile (§5); senza, il backup resta "non disponibile" e l'Hub
# continua a funzionare normalmente con un avviso.

sudo useradd --system --home /opt/home-hub --shell /usr/sbin/nologin homehub
sudo chown -R homehub:homehub /opt/home-hub

sudo cp /opt/home-hub/infra/systemd/home-hub-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now home-hub-api
```

### 2. Web App, Jellyfin, Immich (Docker Compose)

```bash
cd /opt/home-hub/infra
cp .env.example .env   # adatta HUB_WEB_PORT / HUB_CORS_ORIGINS se necessario
docker compose up -d --build
```

Dopo il primo avvio, completa il setup guidato di Jellyfin su
`http://<host>:8096` e di Immich su `http://<host>:2283`, poi crea una
API key in ciascuno (Jellyfin: Dashboard → API Keys; Immich: Account
Settings → API Keys), impostale come `HUB_JELLYFIN_API_KEY`/
`HUB_JELLYFIN_BASE_URL` e `HUB_IMMICH_API_KEY`/`HUB_IMMICH_BASE_URL` in
`apps/api/.env` (non `infra/.env`: quelle variabili le legge l'Hub API
sull'host) e riavvia con `sudo systemctl restart home-hub-api`.

Il compose avvia `web` (nginx, reverse proxy `/api` verso l'Hub API
sull'host tramite `host.docker.internal`), `jellyfin` e lo stack Immich
(`immich-server` + `immich-redis` + `immich-db`; il container di machine
learning è disabilitato di default, vedi commento nel compose — pesante
per l'hardware iniziale). I dati vivono in `infra/data/` secondo la
struttura descritta in `docs/SPEC_V1.md` §4:

```
infra/data/
├── Media/{Movies,Series,Music}/
├── Photos/
├── Games/
├── Files/
├── Downloads/
└── hub/hub.sqlite
```

`infra/data/` non è versionato (dati reali dell'utente).

### Aggiornamenti

```bash
cd /opt/home-hub && git pull
npm install && npm run build -w apps/api
sudo systemctl restart home-hub-api

cd infra && docker compose up -d --build
```

## Principio di sviluppo

Non si sviluppa tutto in parallelo. Ordine seguito (§39 in
`SPEC_V1.md`):

```
Hardware → Linux+Docker → Hub Core+SQLite → Web App → Jellyfin →
prima versione utilizzabile → Immich → File/Download → Gaming →
Backup/Recovery → Remote Access → rifinitura
```

Primo milestone: un utente accende il Wyse, apre la Web App, vede la
Home, accede alle librerie, riproduce un film e gestisce i propri file.
