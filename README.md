# Home Entertainment Hub

Home Entertainment Hub personale per Dell Wyse 5070: un'unica Web App
proprietaria (React) che aggrega Film, Serie, Foto, Musica, Giochi, File,
Download, Backup e gestione del sistema, parlando esclusivamente con
un'API centrale (Hub Orchestrator) e mai direttamente con i backend interni
(Jellyfin, Immich, filesystem, database).

Le specifiche complete sono in [`docs/SPEC_V1.md`](docs/SPEC_V1.md) e
[`docs/SPEC_V2.md`](docs/SPEC_V2.md); le decisioni su strumenti esterni in
[`docs/EXTERNAL_TOOLS.md`](docs/EXTERNAL_TOOLS.md).

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
- Musica/Giochi/Download restano stub (fasi successive).

**Limitazione nota**: le integrazioni Jellyfin e Immich sono state
validate contro server di test che replicano le rispettive API REST
(nessuna istanza reale era raggiungibile nell'ambiente di sviluppo — il
registry Docker non era accessibile dalla policy di rete). Da validare
contro istanze vere prima di considerarle definitive. Il File Manager,
essendo codice proprietario, è stato invece validato direttamente contro
un filesystem reale.

Non ancora implementato: Download Manager, Gaming, Backup, accesso
remoto/DDNS/HTTPS, wizard di primo avvio, selezione traccia audio
multipla, ricerca globale full-text. Vedi la roadmap completa in
`docs/SPEC_V1.md` §38-39.

## Sviluppo locale

Richiede Node.js ≥ 20.

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

## Deploy (Docker Compose)

```bash
cd infra
cp .env.example .env   # adatta HUB_WEB_PORT / HUB_CORS_ORIGINS se necessario
docker compose up -d --build
```

Dopo il primo avvio, completa il setup guidato di Jellyfin su
`http://<host>:8096` e di Immich su `http://<host>:2283`, poi crea una
API key in ciascuno (Jellyfin: Dashboard → API Keys; Immich: Account
Settings → API Keys), impostale come `HUB_JELLYFIN_API_KEY` e
`HUB_IMMICH_API_KEY` in `infra/.env` e riavvia con `docker compose up -d`
perché l'Hub API possa mostrare Film/Serie/Foto.

Questo avvia `api`, `web` (nginx, reverse proxy `/api` verso `api`),
`jellyfin` e lo stack Immich (`immich-server` + `immich-redis` +
`immich-db`; il container di machine learning è disabilitato di default,
vedi commento nel compose — pesante per l'hardware iniziale). I dati
vivono in `infra/data/` secondo la struttura descritta in
`docs/SPEC_V1.md` §4:

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
