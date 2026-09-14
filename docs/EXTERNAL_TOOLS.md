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

## Sonarr/Sonarr — DECISIONE: STUDIARE COME RIFERIMENTO, NON INTEGRARE

- Utile come riferimento architetturale per: automazione libreria, ricerca,
  rinomina, gestione qualità, orchestrazione dei download.
- Non verrà adottato come componente centrale né in V1 né in V2: l'Hub
  mantiene un Download/Library Manager proprietario, ispirato ai pattern
  di Sonarr ma integrato nativamente nell'API centrale.
