# Specifiche — stato di implementazione

Documento vivo. Aggiornato ad ogni fase completata o decisione non
banale. Le specifiche originali (`SPEC_V1.md`, `SPEC_V2.md`) restano la
fonte di verità per COSA va costruito e non vengono modificate; questo
file traccia COSA È STATO FATTO, quali decisioni/aggiunte sono state
prese lungo il percorso, e quali proposte restano aperte.

Ultimo aggiornamento: dopo Fase 8 (Storage e Backup — dischi/SMART,
backup automatico/manuale, ripristino base), prima di Fase 9 (Rete e
accesso remoto).

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
🟡 Fatto: rilevamento dischi (§29) sui mount point configurati
(HUB_DATA_ROOT/HUB_BACKUP_ROOT + eventuali extra via
HUB_EXTRA_DISKS_JSON) con capacità/spazio libero/soglia critica 10%,
stato connesso/non disponibile; SMART via `smartctl -H -j` risalendo dal
mount point al device con `findmnt`, degrado esplicito a "non
disponibile" quando gli strumenti mancano (§31). Backup automatico
(intervallo configurabile, scheduler lazy via `setInterval` — stesso
pattern già in uso per cestino/download) e manuale ("Backup Now"),
comprende dati personali (Files/, Photos/, Games/.saves/), database
(snapshot consistente via `VACUUM INTO` + verifica `PRAGMA quick_check`)
e configurazioni Hub/Docker (`apps/api/.env`, `infra/.env`,
`infra/docker-compose.yml`, `infra/systemd/home-hub-api.service`).
Copia con limite di banda (§32), scrittura atomica (file temporaneo +
rename), verifica di integrità per hash ad ogni copia (§5), confronto
dimensione/mtime per saltare i file invariati (ripresa incrementale
naturale dopo un'interruzione, nessun bookkeeping separato necessario),
file modificato durante la copia scartato e rimandato al run successivo.
Storico dei run in DB (`backup_runs`), run rimasti "running" dopo un
riavvio marcati "interrotto" all'avvio. Guardia riutilizzabile
`hasRecentValidBackup()` per operazioni rischiose (§5) — non ancora
collegata a un'operazione specifica, nessuna esiste ancora in V1 che lo
richieda. Ripristino base (§35, passo "ripristino automatico") che
ricopia dati + database dal disco di backup al disco dati, dietro
conferma esplicita. Validato per davvero su filesystem reale: backup
completo, run incrementale con skip dei file invariati, ricopia di un
file modificato, cancellazione + ripristino con verifica del contenuto
recuperato, tutto via curl; pagina Storage verificata in browser reale
(Playwright) inclusi dischi/SMART/backup/modale di conferma ripristino.
⬜ Non fatto: libreria virtuale multi-disco con distribuzione automatica
dei nuovi file tra più dischi (§4) — File Manager/Games/Downloads
assumono ancora un unico disco dati; wizard di recovery guidato completo
su hardware nuovo (richiede hardware reale, fuori portata di questo
ambiente); riscrittura automatica delle configurazioni Hub/Docker dal
backup su un sistema live (le config vengono salvate nel backup come
riferimento, non riapplicate automaticamente: toccare file di sistema
live in modo automatico è stato giudicato troppo rischioso per V1);
priorità dinamica del backup legata all'attività di streaming reale
(stessa semplificazione già adottata per i download — limite di banda
statico configurabile, vedi proposte aperte §3).

### Fase 9 — Rete e accesso remoto
🟡 Fatto (primo blocco — discovery locale, §21): annuncio mDNS/DNS-SD
(`<hostname>.local`, default `home-hub.local`) via `bonjour-service`,
nessun `avahi-daemon` richiesto — verificato per davvero con un client
mDNS separato sullo stesso loopback (risoluzione dell'hostname e SRV
record con la porta corretta della Web App, non quella interna dell'Hub
API). Endpoint pubblico `/api/network/info` (IP locali, hostname/URL
`.local`) mostrato con QR code nella schermata di selezione profilo
(pre-login, per farsi scoprire da un secondo dispositivo) e nella pagina
Sistema. Gestione Wi-Fi (scan/connect) via `nmcli`/NetworkManager,
riservata agli admin, con degrado esplicito a "non disponibile" quando
`nmcli` manca (verificato: questo ambiente non ha NetworkManager). WPS
gestito lato UX (pulsante sul router + rilevamento stato) invece di uno
specifico comando `nmcli`, la cui sintassi WPS non è standardizzata —
vedi decisione in §2.
🟡 Fatto (secondo blocco — wizard di primo avvio, §28): quando non esiste
ancora nessun utente, la Web App mostra un wizard in 5 passi (rete,
utenti, storage, librerie, impostazioni principali) invece della
schermata di selezione profilo. Sostituisce il precedente seed
automatico di due utenti placeholder (`owner`/`utente` senza password) —
rimosso da `db/index.ts`. Passo "utenti": crea l'account admin (password
obbligatoria) e opzionalmente un secondo utente (password facoltativa,
adatto a un familiare che userà solo l'accesso LAN). Passo "storage":
mostra spazio libero sul disco dati (riusa `lib/storage/disks.ts`) e crea
la struttura di cartelle attesa se mancante. Passo "librerie": stato di
raggiungibilità di Jellyfin/Immich, puramente informativo (la
configurazione vera e propria resta nei rispettivi pannelli/nei file
`.env`, fuori scope). Passo "impostazioni": nome dell'Hub, salvato nella
tabella `settings` e mostrato nella sidebar al posto del testo fisso
"Home Hub". Gli endpoint `/api/setup/*` sono deliberatamente senza
autenticazione (nessun utente esiste ancora quando servono) ma si
rifiutano permanentemente non appena il wizard è completato
(`isSetupCompleted()`), indipendentemente da login — verificato con curl
(tentativo di ricreare un admin dopo il completamento → 409). Flusso
completo end-to-end verificato in un browser reale (Playwright): dischi
vuoti → wizard → creazione admin reale → login con quell'utente → nome
Hub personalizzato visibile in sidebar.
⬜ Da fare: accesso remoto HTTPS + DDNS/tunnel, sessioni/revoca, recupero
password (il backend supporta già login remoto via password — manca
l'infrastruttura di rete/HTTPS/DDNS attorno) — **poi, per ultimo**, il
VPN server personale (WireGuard, aggiunto allo scope su richiesta
esplicita, vedi §2): è la
parte più delicata dal punto di vista della sicurezza fatta finora,
costruita a valle del resto della fase.

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
- **Backup — dati "personali" esclude le librerie multimediali**: §5
  dice "dati personali", senza elencarli esplicitamente. Interpretato
  come Files/ (File Manager), Photos/ (Immich) e Games/.saves/
  (salvataggi) — non Media/Movies/Series/Music. Motivazione: sono
  librerie multimediali sostituibili (rippate/scaricate di nuovo), non
  dati unici dell'utente, e backuppare l'intera libreria video
  renderebbe il backup enorme/lento senza il beneficio "dati che non si
  possono recuperare altrove" che giustifica un backup dedicato.
- **Backup — niente manifest separato per la ripresa incrementale**:
  invece di un file di stato dedicato (es. JSON con hash/mtime per ogni
  file già copiato), la ripresa/skip si basa sul confronto
  dimensione+mtime tra sorgente e file già presente a destinazione
  (stesso principio di `rsync`, con `fs.utimes` per allineare l'mtime del
  file copiato a quello sorgente). Più semplice, nessuno stato da tenere
  sincronizzato, e un run interrotto a metà lascia solo file `.part`
  (mai un file finale corrotto, grazie a copia-poi-rename atomico) che
  vengono ignorati/sovrascritti al run successivo.
- **Backup del database — `VACUUM INTO` invece di fermare l'Hub**:
  verificato che `node:sqlite` supporta `VACUUM INTO ?` con parametro
  bindato (test empirico in questa sessione) — produce uno snapshot
  consistente del DB live senza dover interrompere il servizio, poi
  verificato con `PRAGMA quick_check` sul file risultante.
- **Ripristino — le configurazioni Hub/Docker non vengono riapplicate
  automaticamente**: il backup include `apps/api/.env`, `infra/.env`,
  `infra/docker-compose.yml` e l'unit systemd come riferimento, ma il
  ripristino (`POST /api/backup/restore`) li lascia dentro
  `<backupRoot>/hub-config/` senza sovrascrivere i file live —
  riapplicarli in automatico su un sistema in esecuzione (in particolare
  l'unit systemd) è stato giudicato troppo rischioso per un'operazione
  self-service in V1; vanno ricopiati a mano durante il recovery guidato
  (§35).
- **Fase 9 — WPS senza un comando `nmcli` dedicato**: `nmcli` non ha una
  sintassi WPS standardizzata/affidabile tra versioni, e non è comunque
  verificabile in questo ambiente (nessun hardware Wi-Fi). Invece di
  scriptare un comando incerto, il WPS è gestito lato UX: l'utente preme
  il pulsante fisico sul router (che fa la sua parte via il sistema
  operativo/NetworkManager in autonomia) e la Web App si limita a
  rilevare la connessione risultante via `getWifiStatus`, già necessario
  per mostrare lo stato Wi-Fi corrente.
- **Fase 9 — mDNS senza avahi-daemon**: `bonjour-service` (libreria Node
  pura) invece di shellare `avahi-publish-service`, perché avahi non è
  presente di default né sul Wyse né in questo ambiente di sviluppo —
  vedi `docs/EXTERNAL_TOOLS.md`.
- **Fase 9 — il wizard sostituisce il seed automatico di utenti**: dallo
  scaffold iniziale, `db/index.ts` creava sempre due utenti placeholder
  (`owner`/admin, `utente`/user, nessuna password) al primo avvio, solo
  per rendere subito usabile la selezione profilo durante lo sviluppo.
  Con il wizard questo non serve più ed è stato rimosso: un DB vuoto
  significa "nessun utente", che ora è esattamente la condizione che fa
  scattare il wizard lato frontend (`GET /api/setup/status`).
- **Fase 9 — endpoint del wizard senza autenticazione, ma a tempo**: gli
  endpoint `/api/setup/*` non possono richiedere una sessione (nessun
  utente esiste ancora quando servono), quindi la sicurezza non viene da
  `requireAuth`/`requireAdmin` ma da un'unica guardia (`isSetupCompleted()`)
  applicata a ognuno: una volta completato il wizard, si rifiutano per
  sempre con 409, a prescindere da chi chiama. Stesso principio già usato
  altrove nel progetto (una guardia esplicita invece di dedurre lo stato
  da altri segnali) — verificato che il rifiuto persiste anche dopo il
  completamento.
- **Fase 9 — aggiunto un VPN server personale (WireGuard), ultima
  funzione della fase**: richiesta esplicita dell'utente, non presente
  in SPEC_V1/V2. Obiettivo: potersi connettere da remoto e uscire su
  Internet con l'IP di casa (es. per usare servizi italiani in
  geo-restrizione dall'estero — l'utente ha usato DAZN come esempio, non
  un requisito specifico). Concettualmente diverso dall'"Accesso
  remoto" già previsto dalla spec (§22-24: accesso alla sola Web
  App/Hub, autenticato per singolo utente, superficie limitata alle API
  dell'Hub — è quanto usa un familiare per guardare un film da remoto,
  **senza bisogno di VPN**): un VPN server espone invece accesso di rete
  generico, va trattato come la funzionalità più sensibile in termini di
  sicurezza costruita finora e **va costruita per ultima all'interno
  della Fase 9**, dopo discovery locale/wizard/accesso remoto
  HTTPS/DDNS/sessioni — decisione esplicita dell'utente per dare
  priorità al resto della fase.
  Punti di design chiusi con l'utente prima di iniziare il codice (da
  applicare quando si arriverà a questa parte):
  - **Due profili WireGuard per la stessa persona**: uno "solo casa"
    (split-tunnel, `AllowedIPs` limitato a Hub/rete di casa, default per
    l'uso quotidiano) e uno "tunnel completo" (`AllowedIPs 0.0.0.0/0`,
    generato solo quando serve l'uso "esco con l'IP di casa") — evita di
    tenere sempre acceso il consumo di banda upload del tunnel completo.
  - **Isolamento**: anche in tunnel completo, il peer VPN raggiunge solo
    l'Hub + uscita Internet, mai il resto della rete/altri dispositivi
    di casa (least privilege, §26) — un allargamento futuro andrà
    deciso esplicitamente, non di default.
  - **Gestione chiavi**: keypair generata lato client (mai dal server);
    l'Hub riceve/mostra solo la chiave pubblica via una sezione
    admin-only della Web App (QR/config), non gestisce/persiste chiavi
    private. Revoca = rimozione immediata del peer.
  - **Dove gira**: direttamente sull'host via systemd (come l'Hub API),
    orchestrato dall'Hub API che invoca i comandi `wg` — a differenza
    degli emulatori non serve accesso a schermo/controller, solo
    `NET_ADMIN` per l'interfaccia di rete, quindi niente del dilemma
    "Docker vs host" già affrontato per il Gaming.
  - **Limiti di verifica in questo ambiente**: nessun router/linea
    Internet domestica reali disponibili — il traffico WireGuard e il
    collegamento end-to-end "da fuori" resteranno non validati fino al
    deploy sul Wyse (stesso trattamento già riservato a Jellyfin/Immich
    reali).

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
- **Priorità risorse dinamica per il backup**: stessa limitazione già
  nota per i download (§32) — `HUB_BACKUP_MAX_RATE_KBPS` è un limite di
  banda statico, non legato in tempo reale a una sessione di streaming
  Jellyfin attiva. Andrebbe risolta insieme alla proposta analoga sui
  download, con la stessa fonte di verità (endpoint `/Sessions` di
  Jellyfin).
- **Libreria virtuale multi-disco**: §4 descrive una singola libreria
  virtuale che distribuisce automaticamente i nuovi file tra più dischi
  quando disponibili. Fase 8 implementa solo la *visibilità* di più
  dischi (capacità, SMART, stato) — File Manager, Gaming e Download
  Manager continuano ad assumere un unico disco dati
  (`HUB_DATA_ROOT`). Estendere la scrittura a più dischi è un refactor
  più ampio, volutamente rimandato: richiede una strategia di
  distribuzione (per spazio libero? per categoria?) su cui serve
  allinearsi con l'utente prima di implementarla.

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
- SMART (`lib/storage/smart.ts`) verificato solo nel percorso di
  degrado: né `smartctl` né un accesso privilegiato a un device reale
  sono disponibili in questo ambiente sandbox, quindi il percorso "letto
  con successo" (parsing del JSON di `smartctl -H -j`) non è stato
  esercitato contro un output reale — solo contro la logica di
  parsing/gestione errori. Da verificare sul Wyse con `smartmontools`
  installato.
- Backup: verificato a fondo su filesystem reale in questo ambiente
  (copia con limite di banda, verifica di integrità, skip incrementale,
  gestione file modificato a metà copia, snapshot DB via `VACUUM INTO`,
  ripristino con recupero effettivo del contenuto) — non verificato lo
  scenario reale "secondo disco USB/SATA che si scollega a metà backup"
  (in questo ambiente ogni percorso è sullo stesso filesystem), né il
  recovery completo su hardware nuovo end-to-end.
