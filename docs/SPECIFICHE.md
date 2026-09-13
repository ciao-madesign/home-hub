# Specifiche — stato di implementazione

Documento vivo. Aggiornato ad ogni fase completata o decisione non
banale. Le specifiche originali (`SPEC_V1.md`, `SPEC_V2.md`) restano la
fonte di verità per COSA va costruito e non vengono modificate; questo
file traccia COSA È STATO FATTO, quali decisioni/aggiunte sono state
prese lungo il percorso, e quali proposte restano aperte.

Ultimo aggiornamento: dopo Fase 7 (Gaming, parte 1 — catalogo,
importazione, esecuzione locale, macchine remote), prima di Fase 8
(Storage e Backup).

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
🟡 Fatto: catalogo giochi (titolo, piattaforma, copertina, stato),
importazione da cartelle monitorate con conferma (§13), esecuzione locale
di emulatori retro (spawn del processo, un'esecuzione alla volta per
gioco, stop), gestione macchine (locale + PC remoti), Wake-on-LAN
(pacchetto magico verificato byte per byte), probe di stato online/
offline, backup centralizzato dei salvataggi. "L'Hub seleziona
automaticamente la macchina" è implementato in modo semplice: usa la
macchina assegnata al gioco (default locale), l'utente la cambia da un
menu — non c'è ancora un'euristica di selezione automatica basata su
compatibilità.
⬜ Non fatto: avvio effettivo di una sessione Sunshine/Moonlight (solo
Wake-on-LAN + verifica stato — vedi proposte aperte, §3), spegnimento
remoto sicuro (implementato ma richiede un agente HTTP sul PC remoto non
ancora specificato/fornito), controller Bluetooth/USB (nessuna
integrazione: è un livello OS/browser, non un backend da orchestrare),
supporto formati emulatore oltre alla mappa piattaforma→emulatore di
default (RetroArch, non verificata contro un'installazione reale).
Deciso: l'Hub API gira sull'host (systemd), non in Docker — vedi §2.

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
- **Gaming — privacy dei PC remoti (§26)**: l'Hub non memorizza
  credenziali (password/chiavi SSH) dei PC remoti. Wake-on-LAN non ne
  richiede (broadcast UDP). Per lo spegnimento remoto sicuro, che
  invece un'autorizzazione la richiede, la macchina remota espone un
  proprio "agente" HTTP locale (URL configurabile, `agent_url`) che
  gestisce la propria autorizzazione — l'Hub si limita a chiamarlo, non
  gestisce credenziali di terzi.
- **Gaming — backup salvataggi senza conoscere gli emulatori**: invece
  di integrare la logica di ogni emulatore, l'Hub copia semplicemente
  un percorso file/cartella configurato manualmente per ogni gioco
  (`save_path`) in `Games/.saves/<gameId>/<timestamp>/` — funziona con
  qualsiasi emulatore, a costo di dover impostare il percorso a mano.

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
- **Hub API fuori da Docker, sull'host (decisione presa dall'utente)**:
  l'Hub API lancia gli emulatori come processo figlio
  (`child_process.spawn`) del proprio processo Node, e quel processo deve
  avere accesso diretto allo schermo/controller del Wyse — cosa che un
  container Docker normalmente non ha (servirebbe passthrough X11/Wayland
  + `/dev/dri`, configurazione non banale per un'app interattiva). La
  stessa logica vale per Moonlight (Remote Gaming, V2): la spec lo vuole
  come app di sistema sul Wyse, non containerizzata.
  Valutate due strade — (1) far girare l'Hub API sull'host con accesso
  diretto al display, oppure (2) tenerla in Docker e delegare l'avvio a un
  piccolo agente locale sull'host — **è stata scelta la (1)**: l'Hub API
  gira come servizio **systemd** direttamente sul Wyse (vedi
  `infra/systemd/home-hub-api.service`), mentre Web App/Jellyfin/Immich
  restano containerizzati (`infra/docker-compose.yml`). Motivazione: per
  il gioco locale e il Remote Gaming la latenza durante il gioco dipende
  solo dal collegamento diretto Moonlight↔Sunshine, mai dall'Hub API —
  quindi la scelta non incide sulla fluidità del gioco; incide invece
  sulla semplicità, ed evitare la configurazione di passthrough
  grafico/dispositivi in un container è più semplice e affidabile.
  Effetto collaterale positivo: anche Wake-on-LAN (broadcast UDP) e la
  lettura di temperatura/CPU reali (§30) diventano più semplici senza
  dover concedere privilegi di rete/host estesi a un container.
- **Selezione automatica della macchina di esecuzione**: oggi "l'Hub
  seleziona automaticamente" è in realtà "usa la macchina assegnata al
  gioco, di default quella locale" — non c'è ancora un'euristica che
  guardi la piattaforma del gioco e la disponibilità delle macchine per
  scegliere automaticamente.
- **Integrazione reale con l'API di Sunshine**: l'avvio di una sessione
  di gioco su PC remoto oggi si ferma a Wake-on-LAN + verifica stato.
  Avviare davvero un'app/gioco via Sunshine richiede implementare il suo
  flusso di pairing (PIN + certificati TLS client) — scope non banale,
  volutamente rimandato.

## 4. Limitazioni note (da verificare prima del deploy reale)

- Integrazioni Jellyfin e Immich validate contro server di test che
  replicano le API REST documentate, non contro istanze reali (registry
  Docker non raggiungibile in questo ambiente di sviluppo).
- Nessun test su hardware Dell Wyse reale, TV/telecomando reale, o
  connessione Internet domestica reale.
- Vulnerabilità nota accettata in una dipendenza transitiva di
  WebTorrent (SSRF advisory in `ip` via `bittorrent-tracker`) — dettagli
  in `docs/EXTERNAL_TOOLS.md`.
- Mappa piattaforma→emulatore (`lib/gaming/emulator.ts`) non verificata
  contro un'installazione RetroArch reale (nessun emulatore disponibile
  in questo ambiente) — meccanismo di avvio/stop del processo verificato
  con un comando di test innocuo, i percorsi dei core libretro di
  default sono valori plausibili non testati. Wake-on-LAN verificato
  byte per byte sul formato del pacchetto e sull'invio broadcast, non
  contro un PC reale che si accende davvero (nessun target disponibile
  in questo ambiente). Vedi anche la nota architetturale al punto
  precedente su dove devono girare fisicamente gli emulatori.
