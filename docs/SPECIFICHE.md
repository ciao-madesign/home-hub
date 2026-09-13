# Specifiche — stato di implementazione

Documento vivo. Aggiornato ad ogni fase completata o decisione non
banale. Le specifiche originali (`SPEC_V1.md`, `SPEC_V2.md`) restano la
fonte di verità per COSA va costruito e non vengono modificate; questo
file traccia COSA È STATO FATTO, quali decisioni/aggiunte sono state
prese lungo il percorso, e quali proposte restano aperte.

Ultimo aggiornamento: dopo Fase 6 (File Manager + Download Manager),
prima di iniziare Fase 7 (Gaming).

---

## 1. Checklist di implementazione (per fase, da SPEC_V1.md §38)

Legenda: ✅ fatto e verificato · 🟡 parziale · ⬜ non iniziato

### Fase 1 — Preparazione hardware
⬜ Non applicabile a questo lavoro (attività fisica: RAM, SSD, case,
Wi-Fi, installazione Linux sul Dell Wyse). Nessuna azione possibile da
remoto.

### Fase 2 — Base software
🟡 Struttura directory e volumi persistenti definiti
(`infra/docker-compose.yml`, `infra/data/`), avvio automatico dei
container via `restart: unless-stopped`. Non verificato: installazione
Linux reale, Docker Engine reale sul Wyse, backup della configurazione
iniziale, sistema di logging dedicato (oltre al logger di Fastify).

### Fase 3 — Hub Core
✅ Repository, API centrale (Fastify), database SQLite (`node:sqlite`),
modello dati iniziale, autenticazione/profili (locale LAN + remoto
password), gestione configurazione (env vars, `.env.example`), health
check dei servizi (§30), gestione stato sistema (NORMAL/ATTENTION/
PROBLEM).

### Fase 4 — Web App
✅ React Web App, layout principale, sidebar collassabile, Home,
ricerca globale (UI presente, backend non ancora unificato — vedi §5),
Area Sistema, gestione profilo, responsive desktop/mobile, dark theme,
focus visibile per D-pad/TV. Non verificato su una TV/telecomando reale.

### Fase 5 — Media
✅ Jellyfin (Film/Serie): catalogo, dettaglio con stagioni/episodi,
Direct Play con supporto Range/seek, salvataggio punto di visione,
"Continua a guardare", marcatura come guardato, prompt "Prossimo
episodio". Selezione traccia audio delegata al player nativo del
browser (nessuna UI dedicata — vedi proposte aperte).
✅ Immich (Foto/Video personali): timeline con filtro video, album,
lightbox full screen, slideshow a intervallo configurabile.
🟡 Validato contro server di test che replicano le API REST (Jellyfin e
Immich reali non raggiungibili in questo ambiente — registry Docker
bloccato). Da validare contro istanze vere prima del deploy.

### Fase 6 — File e Download
✅ File Manager: cartelle, upload/download, rinomina, spostamento
(= cambio privacy shared/private), cestino 7gg con ripristino,
eliminazione definitiva (cestino o diretta con conferma), rilevamento
duplicati per hash, ricerca per nome. Validato su filesystem reale.
✅ Download Manager: coda unica download URL (yt-dlp) + torrent
(WebTorrent embedded), pausa/ripresa/annulla reali per entrambi i
motori, priorità minima via limite di banda globale, nessuno storico
permanente per i completati. Validato con yt-dlp reale e un vero scambio
BitTorrent peer-to-peer locale.
⬜ Gestione spazio (dischi multipli, distribuzione automatica) — non
ancora affrontata, fa parte concettualmente della Fase 8.

### Fase 7 — Gaming
⬜ Non iniziata. Prossimo passo.

### Fase 8 — Storage e Backup
⬜ Non iniziata. Il monitoraggio storage di base (spazio libero, soglia
critica 10%) esiste nella pagina Sistema (§30) ma manca: SMART,
libreria virtuale multi-disco, rilevamento dischi, gestione disco
scollegato, backup automatico/manuale, ripristino incrementale, backup
di database/configurazione, recovery su nuovo hardware.

### Fase 9 — Rete e accesso remoto
⬜ Non iniziata. Discovery locale, `.local`, QR, setup Wi-Fi, DDNS,
HTTPS automatico, port forwarding, tunnel, autenticazione remota
(il backend supporta già login remoto via password — manca l'infrastruttura
di rete/HTTPS/DDNS attorno), sessioni/revoca, recupero password.

### Fase 10 — Sistema
🟡 Fatto: monitoraggio CPU/RAM/temperatura/storage/servizi, indicatore
NORMAL/ATTENTION/PROBLEM. Mancante: stato Internet dedicato, riavvio
automatico dei servizi falliti, priorità risorse dinamica (oggi il
limite di banda dei download è statico, non reagisce a streaming/backup
attivi in tempo reale), standby/wake, aggiornamenti autorizzati.

### Fase 11 — Test V1
⬜ Richiede hardware reale (Dell Wyse) e servizi reali (Jellyfin/Immich
non stub). Non eseguibile in questo ambiente.

---

## 2. Decisioni e aggiunte rispetto alla specifica originale

Scelte tecniche prese durante l'implementazione che concretizzano o
integrano la spec (che è a livello di prodotto, non di implementazione):

- **`node:sqlite` invece di `better-sqlite3`**: nativo in Node 22, zero
  compilazione, più semplice da deployare sul Wyse. Sperimentale ma
  stabile per l'uso che ne facciamo.
- **npm workspaces monorepo** (`apps/api`, `apps/web`) invece di repo
  separati: un solo repo da clonare/deployare, coerente con "singola Web
  App proprietaria".
- **File Manager — privacy come posizione fisica**: "privato" e
  "condiviso" sono due alberi di cartelle separati
  (`Files/shared/`, `Files/private/<userId>/`), non un flag per-file. Il
  vantaggio: semplice da ragionare, nessun rischio di flag dimenticato;
  spostare un file tra i due È il modo per cambiarne la visibilità.
- **File Manager — cestino senza scheduler**: la scadenza a 7 giorni è
  applicata in modo lazy (purge ad ogni lettura della lista), non con un
  cron dedicato — coerente con "non è prevista una modalità manutenzione
  dedicata" (§31) e con la scala ridotta del progetto.
- **Download Manager — WebTorrent embedded**: invece di un servizio
  Docker separato (Transmission/qBittorrent) con la propria UI/API da
  integrare, la libreria gira nello stesso processo Node dell'Hub API.
  Un componente in meno da orchestrare/tenere in vita su hardware con
  8 GB di RAM. Vedi `docs/EXTERNAL_TOOLS.md` per i dettagli, incluso un
  comportamento di `pause()` di WebTorrent diverso da quanto documentato
  (non ferma i peer già connessi) scoperto e aggirato durante
  l'implementazione.
- **Stato di riproduzione nel DB Hub, non in Jellyfin**: "Continua a
  guardare" e il punto di ripresa sono responsabilità dell'Hub (tabella
  `playback_progress`), non di Jellyfin. Evita di dover provisionare un
  account Jellyfin per utente Hub solo per lo stato di visione personale
  — coerente con "Jellyfin non deve determinare la struttura della Web
  App" (§1).
- **Auth via query-token per contenuti binari**: `<img>`/`<video src>`
  non possono impostare header `Authorization`; il token di sessione è
  accettato anche via query string per quei soli endpoint (proxy
  immagini/stream Jellyfin e Immich, download File Manager). Stesso
  compromesso di Jellyfin/Plex.
- **Utenti/dispositivi estendibili fin da subito**: come richiesto
  dall'Appendice della spec V1, la tabella `users` non ha un vincolo
  rigido a 2 record e `devices` è una tabella separata — pronta per N
  utenti futuri senza modifiche strutturali.

## 3. Proposte aperte / da decidere con l'utente

Idee emerse durante l'implementazione, non ancora richieste esplicitamente
dalla spec né decise — da validare con l'utente prima di implementarle:

- **Priorità risorse dinamica per i download**: oggi il limite di banda
  del Download Manager è statico (un valore configurato una volta). La
  spec (§32) implica una riduzione dinamica quando streaming/backup sono
  attivi. Implementarla richiede che l'Hub sappia quando una sessione di
  streaming Jellyfin è attiva (Jellyfin espone un endpoint `/Sessions`)
  e/o quando un backup è in corso, e riduca il limite di banda di
  conseguenza in tempo reale.
- **Selezione traccia audio multipla nel player**: §7 richiede che
  l'utente scelga la traccia se ce ne sono più di una. Oggi il player
  usa il tag `<video>` nativo del browser, che con Direct Play espone
  solo la traccia di default del contenitore. Serve un player più
  evoluto (o normalizzazione lato Jellyfin) per una selezione esplicita.
- **Ricerca globale unificata**: la sidebar ha una barra di ricerca (§16)
  ma oggi ogni sezione (Film, Serie, Foto, File) ha la propria ricerca
  indipendente. Serve un endpoint aggregatore lato Hub API che interroghi
  tutte le sorgenti e restituisca risultati unificati.
- **Provisioning automatico account Jellyfin/Immich per utente Hub**: se
  in futuro serve stato nativo per-utente lato Jellyfin/Immich (oltre al
  "Continua a guardare" già gestito lato Hub), andrebbe creato un account
  Jellyfin/Immich per ogni utente Hub alla creazione del profilo.

## 4. Limitazioni note (da verificare prima del deploy reale)

- Integrazioni Jellyfin e Immich validate contro server di test che
  replicano le API REST documentate, non contro istanze reali (registry
  Docker non raggiungibile in questo ambiente di sviluppo).
- Nessun test su hardware Dell Wyse reale, TV/telecomando reale, o
  connessione Internet domestica reale.
- Vulnerabilità nota accettata in una dipendenza transitiva di
  WebTorrent (SSRF advisory in `ip` via `bittorrent-tracker`) — dettagli
  in `docs/EXTERNAL_TOOLS.md`.
