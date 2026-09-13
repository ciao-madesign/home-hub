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

## Sonarr/Sonarr — DECISIONE: STUDIARE COME RIFERIMENTO, NON INTEGRARE

- Utile come riferimento architetturale per: automazione libreria, ricerca,
  rinomina, gestione qualità, orchestrazione dei download.
- Non verrà adottato come componente centrale né in V1 né in V2: l'Hub
  mantiene un Download/Library Manager proprietario, ispirato ai pattern
  di Sonarr ma integrato nativamente nell'API centrale.
