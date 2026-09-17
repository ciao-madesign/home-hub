# Strumenti/repo esterni valutati

Decisioni su componenti open source di terze parti da integrare o studiare
per l'Home Entertainment Hub, in aggiunta a Jellyfin/Immich (vedi
`SPEC_V1.md`).

## yt-dlp/yt-dlp — DECISIONE: INTEGRATO

- Motore per il download di video/audio dal web (moltissimi siti supportati).
- Usato dal **Download Manager** (Fase 6) come backend per i download "da
  URL", invocato come processo esterno (`child_process`) dall'Hub API.
  Pausa/ripresa via SIGSTOP/SIGCONT sullo stesso processo — verificato.
- Non esposto direttamente al frontend: resta dietro l'API centrale, come
  ogni altro backend (§2).
- Immagine Docker: installato via pip in un venv dedicato (vedi
  `apps/api/Dockerfile`), insieme a ffmpeg (necessario per unire tracce
  audio/video).

## webtorrent/webtorrent — DECISIONE: INTEGRATO

- Motore per i download torrent (§12), come libreria **embedded**
  nell'Hub API (non un servizio Docker separato come Transmission/
  qBittorrent) — un solo processo Node in più da gestire, coerente con le
  risorse limitate dell'hardware iniziale (Intel J4105, 8 GB RAM, §3).
- `Torrent.pause()` di WebTorrent impedisce solo l'aggiunta di nuovi peer,
  non ferma quelli già connessi — verificato empiricamente. Pausa/ripresa
  reali sono quindi implementate distruggendo il torrent
  (`destroyStore: false`, i byte scaricati restano su disco) e
  riaggiungendolo alla ripresa: lo store a chunk su file verifica i pezzi
  già presenti e riparte da lì.
- Vulnerabilità nota (accettata): una dipendenza transitiva
  (`bittorrent-tracker` → `ip`) è affetta da un advisory SSRF
  (GHSA-2p57-rm9w-gvfp) relativo alla funzione `isPublic()`. Il rischio
  pratico per questo utilizzo è basso: un client torrent contatta per sua
  natura peer arbitrari su Internet, non usiamo `ip.isPublic()` per
  validare input utente prima di richieste server-side. Da monitorare per
  un aggiornamento upstream di `bittorrent-tracker`.

## watson-developer-cloud/bonjour-service — DECISIONE: INTEGRATO

- Pubblicazione mDNS/DNS-SD (`_http._tcp`, hostname `.local`) per il
  discovery locale (§21). Implementazione Node pura: invia/riceve
  direttamente pacchetti multicast DNS via socket UDP, **non richiede
  `avahi-daemon`** (assente sul Wyse per default e assente anche in
  questo ambiente sandbox) — a differenza della strada "shellare
  `avahi-publish-service`" scartata per questo motivo.
- Testato per davvero in questo ambiente: annuncio del servizio e
  interrogazione via un client `multicast-dns` separato sullo stesso
  loopback (stesso approccio già usato per verificare Local Service
  Discovery di WebTorrent) — pacchetto ricevuto e risolto correttamente.
  Non verificata la risoluzione `.local` da parte di client reali
  (macOS/iOS/Android/Windows) su una LAN reale.
- Nessuna vulnerabilità nota nella sua dipendenza diretta
  (`multicast-dns` → `dns-packet`); le vulnerabilità segnalate da
  `npm audit` in questo workspace sono quelle già note/accettate di
  WebTorrent (`ip` via `bittorrent-tracker`), non toccano questo pacchetto.

## soldair/node-qrcode — DECISIONE: INTEGRATO

- Generazione lato client (Web App) del QR code con l'URL locale
  dell'Hub, per il discovery da un secondo dispositivo (§21). Libreria
  pura JS, nessuna dipendenza nativa, genera direttamente una data URL
  PNG da un `<img>` — non è una libreria UI/di componenti (non in
  contrasto con "zero dipendenze UI" di `CLAUDE.md`, che riguarda
  framework di styling/componenti come Tailwind/MUI, non utility mirate
  come questa o come `webtorrent` lato API).

## DuckDNS — DECISIONE: INTEGRATO

- Provider DDNS di default (§23): gratuito, API pubblica minima (una GET,
  `https://www.duckdns.org/update?domains=...&token=...&ip=`, risposta
  testuale "OK"/"KO") — nessuna libreria di terze parti necessaria,
  implementato con `fetch` nativo. `ip=` vuoto lascia che sia DuckDNS a
  rilevare l'IP pubblico dalla richiesta stessa (giusto: l'Hub, dietro
  NAT, non conosce in modo affidabile il proprio IP pubblico).
- Base URL configurabile (`HUB_DDNS_BASE_URL`) apposta per poter puntare
  a uno stub HTTP nei test: verificato per davvero in questo ambiente
  contro un server di prova che replica il contratto dell'API (risposta
  OK con credenziali corrette, KO con credenziali sbagliate) — non contro
  il servizio DuckDNS reale (nessun account/dominio disponibile qui).
- Provider alternativo: la spec (§23) lo richiede configurabile — non
  ancora implementato un secondo provider, ma l'interfaccia (config →
  URL di update → parsing OK/KO) è abbastanza generica da poterne
  aggiungere altri senza cambiare la struttura.

## Caddy — DECISIONE: INTEGRATO (opzionale)

- Reverse proxy con HTTPS automatico (Let's Encrypt) per l'accesso
  remoto (§24: "certificato gestito automaticamente, rinnovo
  automatico"). Preferito a scrivere un client ACME proprietario: è
  esattamente il tipo di problema ("non reinventare la ruota") in cui
  usare uno strumento maturo e ampiamente testato è più sicuro che
  implementarne uno in casa.
- Servizio Docker separato e opzionale (`infra/docker-compose.yml`,
  profilo `remote-https`), non sostituisce nginx: instrada solo il
  traffico HTTPS pubblico verso il servizio `web` esistente, che
  continua a servire la LAN esattamente come prima. Pubblica solo la
  porta 443 (non la 80) per forzare la verifica TLS-ALPN-01 invece di
  HTTP-01, evitando di dover aprire due porte sul router per il solo
  rinnovo del certificato.
- **Non verificato in questo ambiente**: l'emissione/il rinnovo di un
  certificato reale richiede un dominio pubblico e una porta 443
  raggiungibile da Internet, nessuno dei due disponibili in questo
  sandbox — vedi limitazioni note in `docs/SPECIFICHE.md`.

## AdGuard Home — DECISIONE: INTEGRATO

- Blocco pubblicità/tracker a livello DNS per tutta la rete di casa
  (fuori roadmap SPEC_V1/V2, richiesta esplicita dell'utente). Preferito
  a scrivere qualcosa in casa per lo stesso motivo di Caddy: è un
  problema già risolto bene da uno strumento maturo — qui in particolare
  liste di blocco aggiornate costantemente, non banali da mantenere da
  soli.
- Preferito a Pi-hole (l'alternativa più nota, scelta dell'utente tra le
  due): interfaccia più moderna, filtro DNS-over-HTTPS/TLS opzionale
  integrato, container singolo senza dipendenze esterne (Pi-hole
  storicamente ne ha avute per l'interfaccia web).
- Servizio Docker indipendente (`infra/docker-compose.yml`), non parla
  con l'Hub API — stesso principio di isolamento di Jellyfin/Immich
  (§2): il frontend/l'API non lo conoscono, è un servizio a sé che un
  dispositivo qualsiasi sulla rete usa impostandolo come proprio DNS.
  Sempre attivo (nessun profilo Docker): a differenza dei servizi di
  accesso remoto non fa nulla finché nessuno lo usa, quindi non ha senso
  renderlo opt-in.
- **Non verificato in questo ambiente**: nessuna rete/router reale
  disponibile per impostare un dispositivo a usarlo come DNS, quindi il
  blocco pubblicità effettivo non è stato osservato in pratica — solo la
  configurazione Docker validata (`docker compose config`).

## shinyoshiaki/werift — DECISIONE: INTEGRATO

- Implementazione WebRTC per Node.js (RTCPeerConnection, ICE, DTLS-SRTP,
  RTP/RTCP) usata dal relay di Condivisione schermo (fuori roadmap,
  richiesta esplicita dell'utente — l'Hub fa davvero da ponte per il
  video, non solo da segnalazione, decisione presa con l'utente per il
  probabile CGNAT dell'ISP, §3, vedi docs/SPECIFICHE.md).
- Preferita a `mediasoup` (l'SFU più diffuso per Node) e a `node-webrtc`/
  `@roamhq/wrtc` (binding nativi di libwebrtc): è puro TypeScript, senza
  compilazione nativa — stesso principio già seguito scegliendo
  `node:sqlite` al posto di `better-sqlite3` e WebTorrent come libreria
  pura invece di un client torrent esterno, per restare semplici da
  installare sul Wyse.
- Verificato per davvero in questo ambiente: un client "host" e un
  client "viewer", entrambi istanze werift separate (non browser),
  connessi al vero endpoint WebSocket dell'Hub — handshake WebRTC
  completo (offer/answer/ICE) per entrambi, sessione visibile in
  `GET /api/screenshare/sessions`, e pacchetti RTP reali scritti dal
  client host ricevuti correttamente dal client viewer **attraverso il
  relay dell'Hub** (contenuto del payload verificato byte per byte).
  Verificata anche la pulizia della sessione alla disconnessione
  dell'host e il rifiuto di un viewer senza sessione attiva.
- **Non verificato**: cattura schermo reale da un browser vero — questo
  ambiente sandbox non ha un display (nemmeno virtuale) da cui Chromium
  headless possa catturare, fallisce con "Could not start video source"
  indipendentemente dal codice dell'Hub. La UI (stesso identico
  protocollo di segnalazione già validato lato server) è stata comunque
  verificata renderizzare senza errori in un browser reale.

## mpv/mpv — DECISIONE: INTEGRATO

- Player video per la Riproduzione su TV non Smart (fuori roadmap,
  richiesta esplicita dell'utente — vedi docs/SPECIFICHE.md): gira come
  processo figlio dell'Hub API **sul Wyse stesso** (`child_process.spawn`,
  stesso principio già seguito per gli emulatori Gaming), pilotato via il
  suo IPC JSON su socket Unix (`lib/tvPlayer/mpvIpc.ts`). A differenza del
  browser, seleziona nativamente le tracce audio/sottotitoli di un file in
  direct play (`track-list`) — non serve il workaround
  `AudioStreamIndex`/remux usato da `VideoPlayer.tsx` per Chromium.
- Preferito a VLC/omxplayer: IPC JSON documentato e semplice da
  scriptare (comandi con `request_id`, eventi `property-change` per lo
  stato in tempo reale — niente polling), pacchettizzato, nessuna
  dipendenza aggiuntiva oltre a ffmpeg (già presente per yt-dlp).
- **Verificato per davvero in questo ambiente**: mpv installato
  (`apt-get install mpv`) e pilotato in modalità headless
  (`--vo=null --ao=null`, nessun display in questa sandbox) contro un
  file video reale generato con ffmpeg — connessione IPC reale su socket
  Unix, comandi play/pausa/seek/volume confermati via round-trip
  (`get_property`/`set_property`), posizione osservata realmente in
  avanzamento via evento `property-change` su `time-pos`, `track-list`
  osservata e mappata correttamente (1 traccia audio rilevata su un file
  con una sola traccia), progresso persistito nel DB SQLite reale
  (integrazione con "Continua a guardare", §7) sia durante la
  riproduzione sia allo stop. Nota di ambiente: il path del socket IPC
  deve restare sotto il limite di ~108 byte di `sun_path` — irrilevante
  in produzione (`apps/api/data/tv-mpv.sock`), scoperto durante il test
  per via del path profondo dello scratchpad di questa sandbox.
- **Non verificato**: output video/audio reale su un display fisico
  (nessun display, nemmeno virtuale, in questo ambiente sandbox — stessa
  categoria di limitazione già documentata per la cattura schermo di
  Condivisione schermo).

## Sonarr/Sonarr — DECISIONE: STUDIARE COME RIFERIMENTO, NON INTEGRARE

- Utile come riferimento architetturale per: automazione libreria, ricerca,
  rinomina, gestione qualità, orchestrazione dei download.
- Non verrà adottato come componente centrale né in V1 né in V2: l'Hub
  mantiene un Download/Library Manager proprietario, ispirato ai pattern
  di Sonarr ma integrato nativamente nell'API centrale.
