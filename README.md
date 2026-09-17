# Home Entertainment Hub

Home Entertainment Hub personale per Dell Wyse 5070: un'unica Web App
proprietaria (React) che aggrega Film, Serie, Foto, Giochi, File,
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
  episodio". **Selezione traccia audio multipla** (§7): un selettore
  dedicato — il tag `<video>` nativo non basta, Chromium non implementa
  `HTMLMediaElement.audioTracks` (verificato con un file reale
  multi-traccia); la selezione passa `AudioStreamIndex` a Jellyfin, che
  remuxa solo quella traccia, mentre la traccia di default resta Direct
  Play a costo zero.
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
  esplicita. **Libreria virtuale multi-disco** (§4): File Manager,
  Gaming e Download Manager distribuiscono i nuovi contenuti sul disco
  dati con più spazio libero tra quelli configurati (`role: "data"`,
  `HUB_EXTRA_DISKS_JSON`) invece di assumere sempre un unico disco.
  **Non implementato**: wizard di recovery guidato su hardware nuovo,
  riapplicazione automatica delle configurazioni Hub/Docker ripristinate
  su un sistema live.
- **Rete — discovery locale** (§21, prima parte della Fase 9): l'Hub si
  annuncia sulla LAN come `home-hub.local` via mDNS (`bonjour-service`,
  nessun `avahi-daemon` richiesto), mostrato con QR code sia nella
  schermata di selezione profilo (per farsi scoprire da un secondo
  dispositivo, prima del login) sia nella pagina Sistema. Gestione Wi-Fi
  (scansione/connessione) per gli admin, via NetworkManager, con
  degrado esplicito se non disponibile.
- **Rete — wizard di primo avvio** (§28, seconda parte della Fase 9): al
  primo avvio (nessun utente ancora creato) l'Hub mostra un wizard guidato
  in 5 passi — rete (Wi-Fi opzionale), creazione dell'account
  amministratore (+ un secondo utente facoltativo), verifica del disco
  dati e creazione della struttura cartelle, stato di Jellyfin/Immich,
  nome dell'Hub. Sostituisce il precedente seed automatico di due utenti
  finti. Gli endpoint del wizard (`/api/setup/*`, senza autenticazione:
  a quel punto non esiste ancora nessun utente) si disattivano in modo
  permanente non appena il wizard viene completato, indipendentemente da
  login — verificato.
- **Rete — accesso remoto** (§22/§23/§24/§25, terza parte della Fase 9):
  indicatore Locale/Remoto in alto a destra. Gestione sessioni: elenco
  con revoca singola, vista admin di tutte le sessioni di tutti gli
  utenti, pulsante di emergenza "disconnetti tutte le sessioni remote".
  Cambio password self-service e reset da parte di un admin per un altro
  utente (copre il recupero password via procedura locale, §25). DDNS
  (provider DuckDNS) con aggiornamento periodico dell'IP pubblico. HTTPS
  automatico via un servizio Caddy opzionale (Let's Encrypt), che non
  tocca l'accesso LAN esistente. **Tunnel di fallback gratuito**
  (Cloudflare Tunnel) per chi non può aprire porte sul router (es.
  CGNAT): nessuna porta da inoltrare, la connessione parte dall'Hub
  verso Cloudflare — stessa protezione degli endpoint LAN-only del
  Caddy per HTTPS, vedi "Deploy" sotto. **Non implementato**: port
  forwarding automatico (va aperto a mano sul router).
- **Rete — VPN personale WireGuard** (§2, quarta e ultima parte della
  Fase 9, disattivata di default): ogni utente gestisce i propri
  dispositivi in self-service (un profilo "solo Hub" split-tunnel e uno
  "tunnel completo" per uscire su Internet con l'IP di casa), un admin
  vede/revoca anche quelli altrui. La chiave privata del client non
  transita mai dall'Hub: si genera nel proprio client WireGuard, l'Hub
  riceve solo la pubblica e restituisce i parametri restanti da
  incollare nel client. Isolamento server-side via iptables: il tunnel
  raggiunge solo l'Hub e l'uscita Internet, mai il resto della rete di
  casa, per entrambi i profili. Vedi "Deploy" sotto per l'attivazione.
- **Sistema — monitoraggio completo** (§30/§31/§34, Fase 10): oltre a
  CPU/RAM/temperatura/storage/servizi, ora anche stato Internet (non
  influenza l'indicatore generale: offline è un modo d'uso supportato,
  §27), riepilogo backup/download. Riavvio automatico di Jellyfin/Immich
  quando non rispondono (`docker restart`, tentativi limitati, poi una
  notifica critica visibile in Sistema — §31). Spegnimento sicuro da Web
  App per gli admin (§34), con permesso sudo mirato a un solo comando.
  **Aggiornamenti autorizzati dalla Web App** (§33): controllo e
  applicazione di nuovi commit (git pull fast-forward, build, riavvio),
  vedi "Deploy" → "Aggiornamenti" sotto. **Non implementato**: standby/
  wake automatico.
- **Priorità di banda dinamica** (§32): Download Manager e Backup si
  riducono automaticamente quando c'è una riproduzione Jellyfin attiva
  (e, per i download, anche quando un backup è in corso) — streaming >
  backup > download.
- **Ricerca globale unificata** (§16): un endpoint aggregatore interroga
  Film/Serie, Foto (match per nome file), Giochi e File in parallelo e
  mostra i risultati raggruppati per tipo dalla barra di ricerca in alto.
- **Web** (fuori roadmap, richiesta esplicita): sezione con collegamenti
  rapidi a siti esterni (es. La7 streaming) gestiti dagli admin, aperti
  nel browser reale del dispositivo — mai incorporati nell'Hub, perché
  la maggior parte dei siti di streaming blocca l'incorporamento via
  iframe (vedi `docs/SPECIFICHE.md` per il confronto con l'alternativa
  di un browser incorporato, scartata).
- **AdGuard Home** (fuori roadmap, richiesta esplicita): blocco
  pubblicità/tracker a livello DNS per tutta la rete di casa, servizio
  Docker indipendente (non parla con l'Hub API, stesso isolamento di
  Jellyfin/Immich). Vedi "Deploy" sotto per l'attivazione.
- **Condivisione schermo** (fuori roadmap, richiesta esplicita): l'Hub fa
  da relay WebRTC vero e proprio — il video passa fisicamente attraverso
  l'Hub (non solo segnalazione peer-to-peer), scelta deliberata per via
  del probabile CGNAT dell'ISP dell'utente (§3): chi guarda da fuori casa
  passa dagli stessi percorsi già risolti per l'accesso remoto
  (VPN/tunnel), un collegamento diretto rischierebbe di non stabilirsi
  mai. Chi condivide resta al massimo una sessione attiva, chiunque altro
  sia collegato all'Hub può guardarla quando vuole. Richiede un contesto
  sicuro (HTTPS) per condividere il proprio schermo (limite del browser,
  non dell'Hub) — guardare non ha questo vincolo.
- **Riproduzione su TV non Smart** (fuori roadmap, richiesta esplicita):
  il Wyse, collegato via HDMI a una TV non Smart, riproduce davvero
  (mpv, pilotato dall'Hub API) — un secondo dispositivo (iPhone o
  browser) sceglie il contenuto e resta poi un telecomando
  (`/telecomando`: play/pausa, seek, volume, audio/sottotitoli, stop),
  mai il dispositivo che riproduce. Il progresso si integra con
  "Continua a guardare" come qualunque altra riproduzione.

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
NetworkManager/hardware Wi-Fi in questo ambiente). DDNS verificato
contro uno stub fedele all'API DuckDNS, non contro il servizio reale.
Caddy/HTTPS automatico non verificabile affatto in questo ambiente
(serve un dominio pubblico reale e la porta 443 aperta su un router
reale). Riavvio automatico dei servizi verificato per davvero contro
comandi `docker`/`sudo` fittizi (forma esatta dell'invocazione confermata:
`docker restart <container>`, `sudo /sbin/shutdown -h now`), non contro
un demone Docker/sistema reale (nessuno dei due presente in questo
ambiente sandbox). VPN personale WireGuard: nessun modulo kernel
WireGuard disponibile in questo ambiente, quindi l'interfaccia non è mai
realmente attiva qui (degrado esplicito verificato) — verificato per
davvero tutto ciò che non lo richiede (chiavi del server, gestione peer
con chiavi WireGuard reali, allocazione IP, revoca, sia via API sia in
un browser reale); da verificare sul Wyse l'interfaccia realmente attiva,
le regole di isolamento/NAT contro traffico vero e un handshake genuino.
Aggiornamenti dalla Web App: la sequenza `git fetch` → confronto commit →
`merge --ff-only` verificata per davvero contro una coppia di repository
git veri creati apposta (fast-forward riuscito quando possibile, rifiuto
sicuro — nessuna corruzione — quando la storia locale è divergente); il
riavvio del servizio via sudo e la ricostruzione dei container Docker non
sono verificabili in questo ambiente (nessun systemd/demone Docker
reale). Tunnel di fallback (Cloudflare Tunnel): il blocco di sicurezza
di `Caddyfile.tunnel` (`/api/profiles*`, `/api/setup/*`) verificato per
davvero con un'istanza Caddy reale contro un backend fittizio (403 sui
percorsi bloccati, proxy funzionante su tutto il resto) — non
verificabile in questo ambiente un tunnel Cloudflare reale (serve un
account/dominio Cloudflare) né `cloudflared` stesso. AdGuard Home:
configurazione Docker validata, ma nessuna rete/router reale disponibile
qui per impostarlo come DNS di un dispositivo e osservare il blocco
pubblicità in pratica. Condivisione schermo: il relay WebRTC verificato
per davvero end-to-end (handshake completo e pacchetti RTP relayati
correttamente attraverso l'Hub) usando due client WebRTC reali al posto
di due browser; la UI del browser (stesso protocollo) verificata
renderizzare senza errori, ma non la cattura schermo reale — questo
ambiente sandbox non ha un display da cui Chromium headless possa
catturare. Riproduzione su TV non Smart: mpv installato e pilotato per
davvero via il suo IPC JSON (comandi play/pausa/seek/volume confermati
via round-trip, posizione osservata realmente in avanzamento, tracce
audio/sottotitoli rilevate correttamente, progresso persistito nel DB
reale) in modalità headless (`--vo=null --ao=null`) contro un file video
reale — non verificato l'output video/audio su un display fisico
(nessun display, nemmeno virtuale, in questo ambiente) né il flusso
completo con un'istanza Jellyfin reale.

Non ancora implementato: standby/wake automatico, port forwarding
automatico, avvio sessioni Sunshine/Moonlight. Musica
rimossa dallo scope su richiesta dell'utente. Vedi la roadmap completa e la
checklist dettagliata in `docs/SPEC_V1.md` §38-39 e `docs/SPECIFICHE.md`.

## Sviluppo locale

Richiede Node.js ≥ 20. Per il Download Manager (§12) serve anche `yt-dlp`
nel PATH (`pip install yt-dlp`) — senza, i soli download da URL falliscono
con un errore, il resto dell'Hub non è impattato (§31). Per la
Riproduzione su TV non Smart serve `mpv` nel PATH (`apt install mpv`) —
senza, solo "Riproduci sulla TV" fallisce con un errore (503), il resto
dell'Hub non è impattato.

```bash
npm install

# Terminale 1 — Hub API su http://localhost:4000
npm run dev:api

# Terminale 2 — Web App su http://localhost:5173 (proxy /api → :4000)
npm run dev:web
```

Al primo avvio l'API crea `apps/api/data/hub.sqlite` vuoto: la Web App
mostra automaticamente il wizard guidato (§28) per creare il primo
account (admin), impostare Wi-Fi/storage/nome dell'Hub. Da lì in poi la
schermata normale di selezione profilo mostra gli utenti creati.

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
sudo apt install mpv   # Riproduzione su TV non Smart (fuori roadmap) — senza, solo "Riproduci sulla TV" fallisce
# HUB_BACKUP_ROOT: imposta al mount point del disco di backup quando
# disponibile (§5); senza, il backup resta "non disponibile" e l'Hub
# continua a funzionare normalmente con un avviso.

sudo useradd --system --home /opt/home-hub --shell /usr/sbin/nologin homehub
sudo chown -R homehub:homehub /opt/home-hub

# Riavvio automatico di Jellyfin/Immich quando non rispondono (§31):
# l'Hub API deve poter parlare col demone Docker.
sudo usermod -aG docker homehub

# Spegnimento sicuro da Web App (§34): permesso sudo mirato a un solo
# comando, non un sudo generico (§26, least privilege).
sudo cp /opt/home-hub/infra/systemd/homehub-shutdown-sudoers /etc/sudoers.d/homehub-shutdown
sudo chmod 440 /etc/sudoers.d/homehub-shutdown
sudo visudo -c

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

Lo stesso `docker compose up -d` avvia anche **AdGuard Home** (blocco
pubblicità/tracker a livello DNS, fuori roadmap): il pannello di
amministrazione è su `http://<host>:3001`, dove un wizard guidato al
primo accesso crea l'utente admin. Da lì:

1. Imposta come DNS dei tuoi dispositivi (PC, telefono, o direttamente
   nel router per tutta la rete) l'IP del Wyse — AdGuard Home blocca
   pubblicità/tracker per chiunque lo usi come DNS, offline o online.
2. **Prima del primo avvio**, verifica che la porta 53 sia libera sul
   Wyse (`sudo ss -tulpn | grep :53`): su Ubuntu è spesso occupata da
   `systemd-resolved`. Se lo è, disabilita solo il suo stub listener
   (non systemd-resolved intero, serve ancora per la risoluzione DNS
   locale del sistema):
   ```bash
   sudo sed -i 's/#DNSStubListener=yes/DNSStubListener=no/' /etc/systemd/resolved.conf
   sudo systemctl restart systemd-resolved
   ```

### 3. Accesso remoto (opzionale, §22-24)

Per accedere all'Hub da fuori casa serve, in questo ordine:

1. **DDNS**, se il tuo IP pubblico cambia nel tempo (quasi sempre, con un
   contratto residenziale): crea un account gratuito su
   [duckdns.org](https://www.duckdns.org), un dominio (es.
   `mio-hub.duckdns.org`) e prendi nota del token. Imposta
   `HUB_DDNS_DOMAIN`/`HUB_DDNS_TOKEN` in `apps/api/.env` e riavvia
   (`sudo systemctl restart home-hub-api`): l'Hub aggiorna da solo l'IP
   ogni `HUB_DDNS_INTERVAL_MINUTES` minuti.
2. **Port forwarding sul router** (manuale in V1, non automatizzato):
   inoltra **solo** la porta 443 del router verso l'IP del Wyse sulla
   LAN, porta 443. La procedura cambia da router a router (di solito
   "Port Forwarding"/"Virtual Server" nelle impostazioni).
   **Non inoltrare mai la porta 80/`HUB_WEB_PORT`**: quella è la porta
   di nginx, pensata solo per la LAN, e alcuni endpoint (selezione
   profilo, wizard di primo avvio) non richiedono password apposta
   perché presuppongono un accesso locale (§21) — esposti su Internet
   permetterebbero un accesso admin completo senza password (bug reale
   trovato in revisione di sicurezza, corretto bloccando quei percorsi
   nel Caddyfile — ma solo per chi passa da Caddy sulla 443; se la 80
   finisse comunque esposta quel blocco non la protegge).
3. **HTTPS**: avvia il servizio Caddy opzionale, che ottiene da solo un
   certificato Let's Encrypt per il dominio DDNS:
   ```bash
   cd /opt/home-hub/infra
   # aggiungi HUB_PUBLIC_DOMAIN (lo stesso dominio DDNS) e HUB_ACME_EMAIL a .env
   docker compose --profile remote-https up -d
   ```
   Da quel momento `https://<il-tuo-dominio>` è raggiungibile da
   Internet; l'accesso LAN su `HUB_WEB_PORT` non cambia.

**Se il punto 2 (port forwarding) non è un'opzione** — router che non lo
permette, o **CGNAT** (probabile con provider FWA come EOLO, vedi
`docs/SPECIFICHE.md` §3: verifica confrontando l'IP pubblico mostrato dal
router con quello visto da un dispositivo su rete mobile — se diversi,
CGNAT confermato) — salta i punti 2-3 e usa invece il **tunnel gratuito**:

1. Crea un account gratuito su [Cloudflare](https://dash.cloudflare.com)
   (non serve un dominio a pagamento: Cloudflare ne offre uno gratuito
   per il tunnel, o puoi collegarne uno tuo se ne hai già uno gestito lì).
2. Vai su [one.dash.cloudflare.com](https://one.dash.cloudflare.com) →
   Networks → Tunnels → "Create a tunnel" → tipo "Cloudflared". Dagli un
   nome (es. "home-hub") e copia il **token** mostrato nel passo
   "Install and run a connector".
3. Nello stesso tunnel, aggiungi un **Public Hostname**: il sottodominio
   che vuoi usare, servizio "HTTP", indirizzo `caddy-tunnel:8080` (non
   `web:80` — vedi il commento di sicurezza in `infra/docker-compose.yml`
   per il perché).
4. Imposta `HUB_CLOUDFLARE_TUNNEL_TOKEN` in `infra/.env` con il token del
   passo 2, poi:
   ```bash
   cd /opt/home-hub/infra
   docker compose --profile remote-tunnel up -d
   ```
   Da quel momento l'hostname scelto al punto 3 è raggiungibile da
   Internet — **nessuna porta da aprire sul router**, perché la
   connessione parte dall'Hub verso Cloudflare, non il contrario.
   Sempre gratuito per questo uso.

### 4. VPN personale WireGuard (opzionale, §2 in docs/SPECIFICHE.md)

Da attivare solo dopo aver verificato che l'accesso remoto sopra
funziona: la VPN serve per un caso diverso e più sensibile (uscire su
Internet con l'IP di casa, es. per servizi italiani in geo-restrizione
dall'estero), non per il normale accesso alla Web App da remoto.

1. Installa `wireguard-tools` sul Wyse: `sudo apt install wireguard-tools`.
2. Concedi al processo dell'Hub API i soli permessi di rete necessari
   (mai un sudo generico, vedi il commento in
   `infra/systemd/home-hub-api.service`): decommenta la riga
   `AmbientCapabilities=CAP_NET_ADMIN CAP_NET_RAW` nel file, poi
   `sudo systemctl daemon-reload && sudo systemctl restart home-hub-api`.
3. Imposta in `apps/api/.env`: `HUB_VPN_ENABLED=true`,
   `HUB_VPN_WAN_INTERFACE` (verifica il nome reale con `ip route` — non
   sempre `eth0`), e se non hai già DDNS configurato anche
   `HUB_VPN_ENDPOINT_HOST` (il dominio o IP pubblico a cui i client si
   collegheranno). Riavvia il servizio.
4. Apri sul router la porta **UDP** `HUB_VPN_LISTEN_PORT` (default
   51820) verso il Wyse — stessa avvertenza di sicurezza del punto 2
   sopra: inoltra solo questa, mai altre porte.
5. Da Sistema → VPN personale, ogni utente crea i propri dispositivi
   (self-service): nel client WireGuard scelto (app ufficiale su
   telefono/desktop, o `wg-quick` da riga di comando) crea un nuovo
   tunnel vuoto — genera da solo una coppia di chiavi — copia la chiave
   pubblica mostrata nella Web App, scegli il profilo ("solo Hub" per
   l'uso quotidiano, "tunnel completo" per uscire con l'IP di casa) e
   incolla nel client i parametri che l'Hub restituisce.

**Se il tuo ISP usa CGNAT** (probabile con provider FWA come EOLO, vedi
`docs/SPECIFICHE.md` §3): il port forwarding al punto 4 non funzionerà,
serve un tunnel verso un servizio esterno (non ancora implementato).

Guida passo passo per chi deve solo *usare* la VPN (non configurarla),
da linkare o stampare per gli utenti finali: `docs/GUIDA_VPN.md`.
Guida per spostare l'intero Hub (dati compresi) su un altro dispositivo:
`docs/GUIDA_MIGRAZIONE.md`.

### Aggiornamenti

**Dalla Web App (§33, admin)**: Sistema → Aggiornamenti → "Controlla
aggiornamenti" mostra i commit non ancora applicati, "Aggiorna e
riavvia" fa da solo `git pull` (fast-forward, si rifiuta se la copia
locale è divergente — mai un merge/rebase automatico su modifiche
locali), `npm install && npm run build`, ricostruzione dei container
Docker e riavvio del servizio. Richiede il permesso sudo mirato in
`infra/systemd/homehub-update-sudoers`:
```bash
sudo cp infra/systemd/homehub-update-sudoers /etc/sudoers.d/homehub-update
sudo chmod 440 /etc/sudoers.d/homehub-update
sudo visudo -c
```

**Da riga di comando** (alternativa manuale, sempre disponibile):
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
