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
PC reale (nessun target disponibile in questo ambiente).

Non ancora implementato: Backup, accesso remoto/DDNS/HTTPS, wizard di
primo avvio, selezione traccia audio multipla, ricerca globale
full-text, priorità dinamica dei download basata sull'attività di
streaming in corso (attualmente un limite di banda statico), avvio
sessioni Sunshine/Moonlight. Vedi la roadmap completa e la checklist
dettagliata in `docs/SPEC_V1.md` §38-39 e `docs/SPECIFICHE.md`.

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
