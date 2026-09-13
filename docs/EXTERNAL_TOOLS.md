# Strumenti/repo esterni valutati

Decisioni su componenti open source di terze parti da integrare o studiare
per l'Home Entertainment Hub, in aggiunta a Jellyfin/Immich (vedi
`SPEC_V1.md`).

## yt-dlp/yt-dlp — DECISIONE: INTEGRARE

- Motore per il download di video/audio dal web (moltissimi siti supportati).
- Verrà usato internamente dal **Download Manager** (Fase 6) come backend
  per i download "da URL", accanto al supporto torrent.
- Non esposto direttamente al frontend: resta dietro l'API centrale, come
  ogni altro backend (§2).

## Sonarr/Sonarr — DECISIONE: STUDIARE COME RIFERIMENTO, NON INTEGRARE

- Utile come riferimento architetturale per: automazione libreria, ricerca,
  rinomina, gestione qualità, orchestrazione dei download.
- Non verrà adottato come componente centrale né in V1 né in V2: l'Hub
  mantiene un Download/Library Manager proprietario, ispirato ai pattern
  di Sonarr ma integrato nativamente nell'API centrale.
