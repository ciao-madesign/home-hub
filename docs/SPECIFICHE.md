# Specifiche — stato di implementazione

Documento vivo. Aggiornato ad ogni fase completata o decisione non
banale. Le specifiche originali (`SPEC_V1.md`, `SPEC_V2.md`) restano la
fonte di verità per COSA va costruito e non vengono modificate; questo
file traccia COSA È STATO FATTO, quali decisioni/aggiunte sono state
prese lungo il percorso, e quali proposte restano aperte.

Ultimo aggiornamento: **primo deploy reale sul Dell Wyse 5070 il
24/09/2026** (§5 per il resoconto completo) — Ubuntu Server 24.04, Hub
API su systemd, Web App/Jellyfin/Immich via Docker Compose, storage su
disco USB esterno, Wi-Fi con IP statico, tutto verificato sopravvivere
a un riavvio reale. Scoperta rilevante: lo storage interno del Wyse è
un eMMC da 16GB (non un SSD M.2 256GB come ipotizzato in SPEC_V1) — un
disco dati esterno è quindi necessario fin dal primo avvio, non solo in
futuro. Corretti nel percorso: un bug di build (migrazioni SQL non
copiate in `dist/`) e due bug di permessi (Wi-Fi e spegnimento dalla Web
App, utente di sistema `homehub` senza privilegi sufficienti). Musica
resta rimossa dallo scope (deciso in una sessione precedente).

Prima di questo, l'ultimo blocco di lavoro concluso era: AdGuard Home,
Condivisione schermo (relay WebRTC) e Riproduzione su TV non Smart (mpv
pilotato dall'Hub API), tutte e tre fuori roadmap su richiesta esplicita
dell'utente, più un blocco precedente di 6 funzionalità (priorità di
banda dinamica §32, ricerca globale su Foto §16, selezione automatica
della macchina in Gaming §10, libreria virtuale multi-disco per il File
Manager §4, aggiornamenti Hub dalla Web App §33, tunnel di fallback
gratuito Cloudflare §23). Prossimi passi concreti: vedi §5.

---

## 1. Checklist di implementazione (per fase, da SPEC_V1.md §38)

Legenda: ✅ fatto e verificato · 🟡 parziale · ⬜ non iniziato

### Fase 1 — Preparazione hardware
✅ Fatta per davvero sul Dell Wyse 5070 reale (24-25/09/2026, sessione
remota via SSH guidata passo passo — vedi §5 per il resoconto completo).
Hardware verificato in BIOS prima di installare: Intel Celeron J4105, 8GB
RAM, Wi-Fi/Bluetooth presente e abilitato. **Storage interno: eMMC da
16GB (non un SSD M.2 come ipotizzato in SPEC_V1)** — scoperta importante,
vedi §5.

### Fase 2 — Base software
✅ Ubuntu Server 24.04 LTS installato per davvero (USB via Rufus/Etcher,
UEFI), Docker Engine reale, Node.js 22, repository clonato in
`/opt/home-hub`. Struttura directory e volumi persistenti
(`infra/docker-compose.yml`, `infra/data/`) verificati funzionanti,
avvio automatico dei container via `restart: unless-stopped` confermato
anche dopo un riavvio reale della macchina. Non ancora fatto: backup
della configurazione iniziale, sistema di logging dedicato (oltre al
logger di Fastify).

### Fase 3 — Hub Core
✅ Repository, API centrale (Fastify), database SQLite (`node:sqlite`),
modello dati iniziale, autenticazione/profili (locale LAN + remoto
password), gestione configurazione (env vars, `.env.example`), health
check dei servizi (§30), gestione stato sistema (NORMAL/ATTENTION/
PROBLEM).

### Fase 4 — Web App
✅ React Web App, layout principale, sidebar collassabile, Home,
**ricerca globale unificata** (§16): un endpoint aggregatore
(`GET /api/search`) interroga in parallelo Film/Serie (Jellyfin,
`SearchTerm`), Foto (Immich, match per nome file — `originalFileName` su
`/api/search/metadata`, decisione dell'utente di accontentarsi invece
della ricerca "smart"/ML, disattivata di default per l'hardware
iniziale §3, chiude la proposta aperta), Giochi e File (shared+private
dell'utente corrente) e raggruppa i risultati per tipo. Ogni fonte è
indipendente — se una non risponde, la ricerca continua comunque sulle
altre (§31).
Area Sistema, gestione profilo, responsive desktop/mobile, dark theme,
focus visibile per D-pad/TV. Non verificato su una TV/telecomando reale.

### Fase 5 — Media
✅ Jellyfin (Film/Serie): catalogo, dettaglio con stagioni/episodi,
Direct Play con supporto Range/seek, salvataggio punto di visione,
"Continua a guardare", marcatura come guardato, prompt "Prossimo
episodio". **Selezione traccia audio multipla** (§7): un selettore
dedicato nel player, non il tag `<video>` nativo del browser — scoperto
(verificato con un file reale multi-traccia via Chromium headless) che
`HTMLMediaElement.audioTracks` non è implementato da Chromium (solo da
Safari), quindi la selezione va fatta lato Jellyfin passando
`AudioStreamIndex` allo stream endpoint invece di `static=true` — vedi
decisione in §2.
✅ Immich (Foto/Video personali): timeline con filtro video, album,
lightbox full screen, slideshow a intervallo configurabile.
🟡 Validato contro server di test che replicano le API REST (Jellyfin e
Immich reali non raggiungibili in questo ambiente — registry Docker
bloccato). Da validare contro istanze vere prima del deploy.

**Musica: rimossa dallo scope su richiesta esplicita dell'utente.** Era
tracciata come stub in attesa di implementazione (album, cartelle,
player persistente, §SPEC_V1). Rimossi la pagina, la voce di sidebar/
navigazione, l'icona dedicata e i riferimenti nella ricerca globale
(§16) e in TopBar — nessun contenuto era mai stato costruito, solo un
placeholder. `SPEC_V1.md` resta invariata come da convenzione (fonte di
verità originale, non riflette lo stato di implementazione); questa è
la sede in cui si registra la decisione di non costruirla.

### Fase 6 — File e Download
✅ File Manager: cartelle, upload/download, rinomina, spostamento
(= cambio privacy shared/private), cestino 7gg con ripristino,
eliminazione definitiva (cestino o diretta con conferma), rilevamento
duplicati per hash, ricerca per nome. Validato su filesystem reale.
**Libreria virtuale multi-disco (§4)**: chiude la proposta aperta —
union filesystem in user space (`lib/storage/library.ts`) sui dischi
con `role: "data"` (`HUB_EXTRA_DISKS_JSON`, opt-in). Scritture: il disco
con più spazio libero in quel momento. Letture (elenco/ricerca/
duplicati/download): unite su tutti i dischi raggiungibili come
un'unica cartella. Un move/rename resta sempre sul disco fisico di
origine (§4 riguarda la scelta per i nuovi file, non gli spostamenti);
il cestino segue lo stesso principio (nuova colonna `disk_id`,
migrazione 0011). Copre `Files/` (File Manager), `Games/` (Gaming) e
`Downloads/` (Download Manager) — Photos non partecipa, vedi Fase 7/
nota sotto e `lib/storage/disks.ts`. Verificato per davvero con due
cartelle come due dischi distinti: upload, file piazzato manualmente
sul secondo disco visibile nell'elenco/ricerca/duplicati (anche
cross-disco), rename/move/trash/restore/download risolti sul disco
giusto, conflitto di nome tra dischi rilevato alla creazione.
✅ Download Manager: coda unica download URL (yt-dlp) + torrent
(WebTorrent embedded), pausa/ripresa/annulla reali per entrambi i
motori, nessuno storico permanente per i completati. **Priorità di banda
dinamica (§32)**: chiude la proposta aperta — il limite si riduce
quando c'è streaming Jellyfin attivo o un backup in corso (poll lazy su
`GET /Sessions`, `lib/priority.ts`); WebTorrent si aggiorna a caldo
(`throttleDownload()`, verificato che `-1` disattiva il limite), yt-dlp
resta fisso al lancio del processo (nessun modo di cambiarlo a caldo,
limitazione nota). Validato con yt-dlp reale, un vero scambio BitTorrent
peer-to-peer locale, e `isStreamingActive()` contro uno stub HTTP fedele
a `GET /Sessions` di Jellyfin. **Estensione della libreria multi-disco
(§4)**: ogni download avviato sceglie il disco dati con più spazio
libero in quel momento (`pickWriteDisk()`, stesso meccanismo del File
Manager) invece di assumere sempre `HUB_DATA_ROOT` — verificato per
davvero: un torrent reale (magnet pubblico) crea la cartella
`Downloads/` sul disco scelto, annullato subito dopo (non serve
completare il download per verificare la scelta del disco).

### Fase 7 — Gaming
🟡 Fatto: catalogo giochi (titolo, piattaforma, copertina, stato),
importazione da cartelle monitorate con conferma (§13), esecuzione locale
di emulatori retro (spawn del processo, un'esecuzione alla volta per
gioco, stop), gestione macchine (locale + PC remoti), Wake-on-LAN
(pacchetto magico verificato byte per byte), probe di stato online/
offline, backup centralizzato dei salvataggi. **Selezione automatica
della macchina (§10)**: chiude la proposta aperta — quando un gioco non
ha una macchina assegnata esplicitamente (che vince comunque sempre),
piattaforma emulabile localmente (mappa emulatori) → locale;
altrimenti la prima macchina remota configurata online al probe TCP, o
comunque la prima (svegliata via Wake-on-LAN dal flusso esistente);
nessuna remota configurata → locale, come prima (`lib/gaming/
autoSelect.ts`). La risposta di `/api/games/:id/launch` include ora
`machineId`/`machineName` per trasparenza. Verificato per davvero via
curl: gioco NES → locale; gioco PC senza remote → ricade su locale
(stesso errore "nessuna ROM" della locale); stesso gioco PC dopo aver
aggiunto una remota → la sceglie, prova il probe (fallisce, host
irraggiungibile qui) e invia Wake-on-LAN. **Estensione della libreria
multi-disco (§4)**: scansione ROM (`scanForNewGames`), copertine, avvio
locale e backup salvataggi risolvono `Games/` su tutti i dischi dati
configurati (`lib/storage/library.ts`, stesso meccanismo del File
Manager) invece di assumere sempre `HUB_DATA_ROOT` — `rom_path`/
`cover_path`/`save_path` restano percorsi relativi portabili, risolti al
bisogno. Verificato per davvero con due cartelle come due dischi
distinti: ROM piazzata manualmente sul secondo disco trovata dalla
scansione e poi correttamente risolta all'avvio, backup del salvataggio
creato sul disco con più spazio libero e verificato byte per byte.
**Integrazione reale con l'API di Sunshine (§10)**: chiude la proposta
aperta — dal solo Wake-on-LAN + probe TCP al vero pairing GameStream
(`lib/gaming/sunshine/`): PIN + certificato TLS client generato
dall'Hub (RSA-2048/SHA-256 self-signed, `node-forge` — vedi
`docs/EXTERNAL_TOOLS.md`), 5 fasi di pairing verificate leggendo il
sorgente reale di Sunshine (`nvhttp.cpp`) e dei client Moonlight
ufficiali, non documentazione di terze parti. Una volta accoppiata, una
macchina remota online con un'app Sunshine associata al gioco
(`games.sunshine_app_id`, scoperta via `GET /applist`) fa avviare/
fermare DAVVERO l'app da `POST /api/games/:id/launch`/`/stop` — non
solo risveglio. L'Hub resta deliberatamente fuori dal ruolo di client
Moonlight/streaming: lancia l'app ma non apre mai la sessione RTSP
video/audio (si scarta da sola lato host dopo 10s se nessuno la
consuma, verificato nel sorgente — nessuna pulizia necessaria).
Certificato client persistito su disco (mai nel DB), stesso principio
già seguito per la chiave privata del server VPN; il certificato
dell'host viene invece pinnato nel DB dopo il pairing riuscito e non è
mai esposto in una DTO.

Verificato per davvero: le 5 fasi del pairing contro uno stub HTTP/
HTTPS che reimplementa esattamente la logica server-side di Sunshine
(non risposte pre-cucite) — pairing riuscito con PIN corretto
(certificato host ricevuto, conferma mTLS in fase 5 con lo stesso
certificato registrato), PIN errato rilevato correttamente lato client
senza mai completare un falso pairing. API post-pairing (elenco app,
avvio, arresto, stato) verificata contro un secondo stub fedele alle
risposte XML reali documentate nel sorgente Sunshine: parametri di
lancio corretti (`rikey` a 16 byte, `sops=0` per non toccare la
risoluzione dell'host, `corever=1` per evitare il rifiuto quando la
cifratura RTSP è obbligatoria), rifiuto corretto di un secondo lancio a
host occupato, stato coerente dopo l'arresto. UI di pairing (PIN
mostrato, polling di stato, selezione app) verificata in Chromium reale
(Playwright) contro il backend vero.

Self-review (`/simplify`, 4 agenti in parallelo) dopo la prima stesura:
la decisione "quale percorso di avvio/arresto usare" (locale, remoto con
Sunshine, remoto solo risveglio) è stata estratta da `routes/gaming.ts`
in `lib/gaming/launch.ts` — era rimasta l'unica logica di questa fase
scritta direttamente nella route invece che in un modulo `lib/gaming/*`
dedicato, come già fanno `autoSelect.ts`/`wol.ts`/`machineStatus.ts`; la
porta HTTPS di Sunshine ("base-5", convenzione fissa del protocollo) e
la risoluzione porta-configurata-o-default erano reimplementate sia in
`pairing.ts` sia in `client.ts`, unificate in `transport.ts`; la mappa
delle sessioni di pairing in memoria non veniva mai ripulita (innocua —
al più una entry per macchina, mai per tentativo — ma un'orfana restava
per sempre se la macchina veniva rimossa), ora rimossa esplicitamente
alla cancellazione della macchina e comunque dopo un breve periodo di
grazia una volta raggiunto uno stato finale. Ri-verificato per davvero
dopo il refactor: stesso esito (pairing riuscito/PIN errato/API
post-pairing) contro gli stessi due stub.

⬜ Non fatto: pairing/lancio verificati contro un'host Sunshine reale
(nessuno raggiungibile in questo ambiente sandbox), spegnimento remoto
sicuro (implementato ma richiede un agente HTTP sul PC remoto non
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
🟡 Fatto (terzo blocco — accesso remoto, §22/§23/§24/§25): indicatore
Locale/Remoto discreto in TopBar (§22), basato sull'`origin` della
sessione già tracciato dal backend. Gestione sessioni: elenco delle
proprie sessioni attive con revoca singola, vista admin di tutte le
sessioni di tutti gli utenti, pulsante di emergenza "disconnetti tutte le
sessioni remote" (§24) — verificato che il pulsante revoca anche la
sessione remota che lo ha invocato. Password: cambio self-service
(richiede quella attuale se già impostata) e reset da parte di un admin
per un altro utente (che inoltre disconnette tutte le sue sessioni) —
copre il "recupero password" via procedura locale (§25): chi dimentica
la password per l'accesso remoto entra comunque in LAN senza password
(§21) e la cambia da lì, o se l'ha perso l'accesso se la fa reimpostare
da un admin. Recupero via e-mail non implementato (richiederebbe
configurare SMTP, non ancora deciso con l'utente — proposta aperta,
§3). DDNS (§23): provider DuckDNS, aggiornamento periodico (scheduler
lazy) dell'IP pubblico, endpoint di stato/aggiornamento manuale —
verificato per davvero contro uno stub HTTP che replica l'API DuckDNS
(risposta OK/KO), non contro il servizio reale. HTTPS automatico (§24):
servizio Caddy opzionale (`docker compose --profile remote-https`),
reverse proxy con certificato Let's Encrypt automatico verso la Web App
esistente, senza toccare l'accesso LAN — non verificabile end-to-end in
questo ambiente (nessun dominio pubblico/router reale).

🔴 **Bug di sicurezza trovato e corretto (revisione dedicata, vedi
sotto)**: appena Caddy veniva acceso, l'intero `/api/` di nginx restava
raggiungibile da Internet senza alcuna distinzione LAN/remoto — inclusi
`GET /api/profiles` (elenco utenti, chi è admin) e
`POST /api/profiles/:id/select` (crea una sessione con pieni permessi
**senza password**, per design corretto solo per la LAN, §21). Chiunque
scoprisse il dominio pubblico poteva ottenere accesso admin completo
senza mai fornire una password. Stesso problema per `/api/setup/*`
prima che il wizard fosse completato (corsa a crearsi un proprio account
admin). Corretto in `infra/Caddyfile`: i percorsi `/api/profiles*` e
`/api/setup/*` rispondono 403 prima del `reverse_proxy`, l'unico varco
verso l'esterno per il traffico remoto. Non è una difesa in profondità
completa: protegge solo la via ufficiale (Caddy sulla 443) — se la
porta 80/`HUB_WEB_PORT` finisse comunque esposta su Internet (contro le
istruzioni di deploy, mai aggiornate ad automatizzare questo controllo)
il blocco verrebbe aggirato, perché nginx stesso non distingue
LAN da remoto. Non è stato aggiunto un blocco anche lato nginx/Hub API:
un filtro per IP in nginx sarebbe fragile (il traffico che arriva da
Caddy attraversa comunque la rete Docker interna, anch'essa a indirizzi
privati, indistinguibile in modo affidabile dalla vera LAN di casa senza
assunzioni sulla subnet) — la barriera corretta, coerente con l'intero
disegno del deploy (porta 80 mai esposta, solo la 443 verso Caddy), resta
quella a livello di Caddy. Vedi anche l'avviso rafforzato in
`infra/docker-compose.yml` e nel README "Deploy" §3.
🟡 Fatto (quarto blocco — VPN personale WireGuard, §2, ultima funzione
della fase): ogni utente gestisce i propri "peer" (dispositivi) in
self-service, un profilo per uso ("solo Hub", split-tunnel, o "tunnel
completo", esce su Internet con l'IP di casa), un admin vede/revoca
anche quelli altrui — stesso modello delle sessioni (§24). La chiave
privata del client non è mai vista dall'Hub: si genera nel proprio
client WireGuard (che lo fa già in automatico creando un nuovo tunnel
vuoto), l'Hub riceve solo la pubblica e restituisce i parametri restanti
(indirizzo assegnato, chiave pubblica del server, endpoint, AllowedIPs)
da incollare nel client insieme alla chiave privata già generata lì.
Isolamento (§2, vale per entrambi i profili): regole iptables in
PostUp/PostDown dell'interfaccia bloccano ogni inoltro dal VPN verso
qualunque interfaccia diversa da quella WAN configurata (mai il resto
della rete di casa), permettendo solo il traffico verso l'host stesso
(chain INPUT, mai bloccata) e l'uscita a Internet via NAT. Ogni modifica
ai peer riscrive `wg0.conf` e riapplica l'interfaccia con un semplice
down+up (mai un `wg syncconf` a caldo: più complesso da testare per un
guadagno marginale con pochi peer e modifiche rare — coerente con la
filosofia "lazy" già seguita altrove, es. purge cestino/download).
Disattivato di default (`HUB_VPN_ENABLED=false`); richiede
`wireguard-tools`, il modulo kernel WireGuard e `CAP_NET_ADMIN`/
`CAP_NET_RAW` concessi al processo dell'Hub API via systemd
(`AmbientCapabilities`, mai un sudo generico su `wg-quick`: il file di
configurazione è scritto dall'Hub stesso, un sudo lì equivarrebbe a
un'escalation a root se l'Hub fosse mai compromesso — vedi commento in
`infra/systemd/home-hub-api.service`). Degrado esplicito (§31) quando
`wg`/`wg-quick` mancano o l'interfaccia non può essere creata: i peer
restano gestibili da DB/API, l'interfaccia resta "non attiva" finché non
si applicano le condizioni reali (kernel + capability) sul Wyse.
Verificato per davvero in questo ambiente (nessun modulo kernel
WireGuard disponibile, quindi solo fino al limite del testabile senza
di esso — stesso trattamento già riservato a Jellyfin/Immich reali):
generazione della coppia di chiavi del server con `wg genkey`/`wg
pubkey` veri, scrittura di `wg0.conf` con permessi 0600/0700 corretti,
creazione di peer con chiavi pubbliche reali generate da `wg genkey |
wg pubkey`, allocazione IP sequenziale nella subnet dedicata, rifiuto di
chiavi duplicate/malformate, revoca con riscrittura del file di
configurazione, vista admin di tutti i peer — tutto via curl. Flusso
completo verificato anche in un browser reale (Playwright): pannello
VPN nella pagina Sistema, creazione di un dispositivo, modale con i
parametri di connessione (incluso l'Endpoint dedotto dal DDNS/variabile
d'ambiente) generati correttamente.
⬜ Non verificato in questo ambiente (nessun modulo kernel WireGuard,
nessun router/linea reale): `wg-quick up` che porta davvero su
l'interfaccia, le regole iptables di isolamento/NAT applicate a un
traffico reale, un handshake WireGuard genuino da un client esterno,
l'intero percorso "da fuori casa con l'IP di casa" — tutto da verificare
al deploy sul Wyse, insieme a port forwarding automatico (UPnP/NAT-PMP,
per ora manuale, vedi README "Deploy").

**Tunnel di fallback gratuito (§23, per chi non può fare port
forwarding — es. CGNAT, probabile con EOLO)**: chiude la proposta
aperta, costruito subito invece di aspettare l'hardware perché non
richiede nulla di specifico del Wyse. Due servizi Docker opzionali
(profilo `remote-tunnel`): `cloudflared` (Cloudflare Tunnel — connessione
in uscita dall'Hub, nessuna porta da aprire, sempre gratuito per questo
uso) e un secondo Caddy minimale (`Caddyfile.tunnel`, senza TLS —
Cloudflare lo termina già al proprio edge — con la stessa barriera di
sicurezza già nel Caddyfile principale per `/api/profiles*`/
`/api/setup/*`, indispensabile anche qui per lo stesso motivo). Bug
preesistente trovato e corretto nello stesso file: `${HUB_PUBLIC_DOMAIN:?
messaggio}` nel servizio `caddy` rompeva l'intero `docker-compose.yml`
(quindi anche jellyfin/immich/web) per chi non aveva configurato
l'accesso remoto HTTPS, perché valutato per l'intero file a prescindere
dai profili attivi — corretto con un default vuoto, applicato
preventivamente anche al nuovo `cloudflared`. Verificato per davvero:
`Caddyfile.tunnel` validato con `caddy validate` ed eseguito con
un'istanza Caddy reale (403 sui percorsi bloccati, proxy funzionante sul
resto); `docker-compose.yml` validato con `docker compose config` in
tutti gli scenari di profilo/variabili. Non verificabile qui: un
account/tunnel Cloudflare reale, `cloudflared` stesso.

### Fase 10 — Sistema
🟡 Fatto: monitoraggio CPU/RAM/temperatura/storage/servizi, indicatore
NORMAL/ATTENTION/PROBLEM. **Stato Internet** (§30): endpoint leggero tipo
"generate_204", deliberatamente escluso dal calcolo dell'indicatore
generale — l'assenza di Internet è un modo d'uso pienamente supportato
(§27, offline-first), non "un problema" da segnalare come tale; resta
visibile come campo a sé nella pagina Sistema. **Riepilogo backup/
download** (§30) nello stato di sistema: un backup configurato che
fallisce davvero (non semplicemente "non configurato", che è una scelta
legittima §5) alza l'indicatore ad ATTENTION. **Riavvio automatico dei
servizi** (§31): Jellyfin/Immich girano in Docker separati dall'Hub API
(§2/§3) — un watchdog interno (`lib/serviceWatchdog.ts`, poll periodico
lazy) tenta `docker restart <container>` dopo N controlli falliti
consecutivi, fino a un numero massimo di tentativi; esauriti quelli,
registra un evento **critico** invece di continuare a riprovare
all'infinito, e si azzera da solo se il servizio torna raggiungibile —
verificato per davvero: sequenza di tentativi (1/N, 2/N…) fino
all'evento critico finale, con un `docker` fittizio che registra
l'invocazione esatta (`docker restart jellyfin`). **Notifiche** (§30,
"solo eventi critici"): tabella `system_events`, mostrate nella pagina
Sistema solo quando `level='critical'`. **Spegnimento sicuro da Web App**
(§34): endpoint admin-only con conferma esplicita, esegue
`sudo /sbin/shutdown -h now` — l'utente di sistema dell'Hub API (non
root, §26) riceve un permesso sudo mirato a questo unico comando
(`infra/systemd/homehub-shutdown-sudoers`), non un sudo generico;
verificato per davvero l'invocazione esatta con un `sudo` fittizio.
**Aggiornamenti dell'Hub autorizzati dalla Web App (§33)**: chiude la
proposta aperta — Sistema → Aggiornamenti (admin) mostra i commit non
ancora applicati rispetto a `origin/<branch>` e li applica dietro
conferma: `git fetch` reale + `merge --ff-only` (mai un merge/rebase
automatico su una copia locale divergente, §26 — fallisce in modo sicuro
invece di combinare storie diverse), `npm install && npm run build`,
poi riavvio del servizio (permesso sudo mirato a un solo comando fisso,
`infra/systemd/homehub-update-sudoers`, stesso principio dello
spegnimento) e ricostruzione dei container Docker (riusa la capacità già
richiesta per il watchdog dei servizi). Il riavvio non viene atteso
dalla richiesta HTTP che lo ha innescato (il processo verrà terminato da
systemd a metà della stessa chiamata). Verificato per davvero: stato
contro il repository git reale di questo progetto; la sequenza fetch →
confronto commit → `merge --ff-only` contro una coppia di repository git
creati apposta, sia nel caso fast-forward riuscito sia nel rifiuto
sicuro su storia divergente. Non verificabile qui: riavvio via sudo e
ricostruzione container (nessun systemd/demone Docker reale).

⬜ Non fatto: standby/wake automatico (richiede test su hardware reale
con supporto ACPI/Wake-on-LAN, rimandato).

### Fase 11 — Test V1
⬜ Richiede hardware reale (Dell Wyse) e servizi reali (Jellyfin/Immich
non stub). Non eseguibile in questo ambiente.

### Extra — Web (collegamenti rapidi), fuori roadmap
✅ Richiesta esplicita dell'utente, non presente in SPEC_V1/V2 — vedi §2
per il ragionamento. Sezione "Web" in sidebar: griglia di collegamenti
(titolo, URL, colore) gestiti dagli admin, aperti da chiunque nel
browser reale del dispositivo (nuova scheda), mai incorporati nell'Hub.
Validazione server-side dello schema URL (solo http/https). Verificato
per davvero: creazione/validazione via curl (uno schema `javascript:`
viene rifiutato con 400), e in un browser reale che il collegamento
generato ha `href` esatto, `target="_blank"` e
`rel="noopener noreferrer"`.

### Extra — AdGuard Home, fuori roadmap
✅ Richiesta esplicita dell'utente. Blocco pubblicità/tracker a livello
DNS per tutta la rete di casa: nuovo servizio Docker indipendente
(`infra/docker-compose.yml`), non parla con l'Hub API — stesso
isolamento di Jellyfin/Immich (§2). Scelto invece di Pi-hole (decisione
dell'utente tra le due alternative) per interfaccia più moderna e filtro
DNS-over-HTTPS/TLS integrato — vedi `docs/EXTERNAL_TOOLS.md`. Sempre
attivo (nessun profilo Docker): non fa nulla finché nessun dispositivo
lo usa come DNS. Verificato: sintassi `docker-compose.yml` validata con
`docker compose config` (default e con tutti i profili). Non
verificabile qui: nessuna rete/router reale per impostarlo come DNS e
osservare il blocco in pratica.

### Extra — Condivisione schermo, fuori roadmap
✅ Richiesta esplicita dell'utente. L'Hub fa da **relay WebRTC vero e
proprio** (il video passa fisicamente attraverso l'Hub), non solo da
segnalazione peer-to-peer — decisione presa con l'utente proprio per il
probabile CGNAT del suo ISP (§3): un collegamento diretto tra chi
condivide (a casa, dietro CGNAT) e chi guarda da fuori rischierebbe di
non stabilirsi mai, mentre passando dall'Hub si riusano gli stessi
percorsi già risolti per l'accesso remoto (VPN §2, tunnel §23). Un
utente ha al più una sessione di condivisione attiva alla volta; ogni
altro utente autenticato può collegarsi e scollegarsi quando vuole
(`GET /api/screenshare/sessions` per scoprire le sessioni attive). Stato
solo in memoria (mai nel database, non ha senso sopravvivere a un
riavvio — stesso principio degli `activeHandles`/`runningProcesses` di
Download/Gaming). Libreria `werift` (WebRTC puro TypeScript, nessuna
compilazione nativa — vedi `docs/EXTERNAL_TOOLS.md` per il confronto con
le alternative). Solo STUN, nessun TURN: chi guarda da fuori casa senza
passare dalla VPN dell'Hub può non riuscire a collegarsi, stesso limite
già noto per l'accesso remoto diretto — un TURN è un passo successivo
non affrontato qui. Condividere il proprio schermo richiede un contesto
sicuro (HTTPS, limite del browser stesso per `getDisplayMedia`) —
guardare no.

Verificato per davvero: due client WebRTC reali (istanze `werift`, non
browser) connessi al vero endpoint WebSocket dell'Hub — handshake
completo (offer/answer/ICE) per entrambi, sessione visibile
nell'endpoint di stato, pacchetti RTP scritti dal client "host" ricevuti
correttamente dal client "viewer" **attraverso il relay dell'Hub**
(payload verificato byte per byte), pulizia della sessione alla
disconnessione dell'host, rifiuto corretto di un viewer senza sessione
attiva. La UI del browser (stesso protocollo) verificata renderizzare
senza errori in Chromium reale (Playwright) — non verificata la cattura
schermo reale: questo ambiente sandbox non ha un display (nemmeno
virtuale) da cui Chromium headless possa catturare ("Could not start
video source", limite dell'ambiente non del codice).

### Extra — Riproduzione su TV non Smart, fuori roadmap
✅ Richiesta esplicita dell'utente. Il Wyse, collegato via HDMI a una TV
non Smart, riproduce davvero (mpv, `lib/tvPlayer/`, gira come processo
figlio dell'Hub API sul Wyse — stesso pattern degli emulatori Gaming);
un secondo dispositivo (iPhone o browser) sceglie il contenuto e resta
poi un telecomando (`/telecomando`), mai il dispositivo che riproduce —
differenza architetturale chiave rispetto a `VideoPlayer.tsx`, che
riproduce nel browser di chi guarda. `POST /api/tv/play` avvia mpv
sull'endpoint `/api/media/:id/stream` già usato dal player nel browser
(mai reinventare l'integrazione Jellyfin), raggiunto in loopback con una
**sessione Hub dedicata creata al volo** (`lib/sessions.ts:createSession`,
stesso meccanismo del login), mai il token personale dell'utente che ha
premuto "Riproduci sulla TV" — decisione presa dopo un self-review
(`/simplify`): il token personale finirebbe in chiaro nell'argv del
processo mpv (leggibile da chiunque sulla macchina con `ps`/`/proc/<pid>/
cmdline` per tutta la durata della riproduzione) e la sua scadenza
seguirebbe la sessione del browser di chi ha avviato la riproduzione, non
la riproduzione stessa. La sessione dedicata viene invece revocata da
`lib/tvPlayer/session.ts` non appena la riproduzione finisce, qualunque
sia la causa (stop esplicito, mpv che crolla, connessione IPC mai
riuscita — un'unica funzione di cleanup condivisa da tutte e tre le vie
d'uscita). A differenza del browser, mpv seleziona nativamente le tracce
audio/sottotitoli del file in direct play (`track-list`) — non serve il
workaround `AudioStreamIndex` usato per Chromium (§7). Stato in tempo
reale (posizione, pausa, volume, tracce) trasmesso ai dispositivi di
controllo via WebSocket (`GET /api/tv/ws`, stesso protocollo di auth
`?token=` di Condivisione schermo); il progresso viene salvato
periodicamente in `playback_progress`, integrandosi con "Continua a
guardare" (§7) come qualunque altra riproduzione. Un solo slot di
riproduzione (una TV): avviarne una nuova sostituisce quella corrente,
stesso principio di Condivisione schermo — a differenza degli altri "at
most one active X" del progetto (screenshare/gaming/downloads), qui il
claim dello slot attraversa più `await` (avvio processo, connessione
IPC), quindi `start()`/`stop()` passano da una coda interna che le
serializza, evitando che due richieste concorrenti si litighino lo
stesso socket IPC. Stato solo in memoria, mai nel database — il processo
mpv non sopravvive comunque a un riavvio dell'Hub API.

Verificato per davvero: mpv installato e pilotato in questo ambiente in
modalità headless (`--vo=null --ao=null`, nessun display) contro un file
video reale — connessione IPC su socket Unix reale, comandi
play/pausa/seek/volume confermati via round-trip IPC, posizione in
avanzamento osservata realmente (evento `property-change` su
`time-pos`), `track-list` osservata e mappata correttamente (traccia
audio rilevata su un file di test), progresso persistito nel DB SQLite
reale sia durante la riproduzione sia allo stop. UI (`/telecomando`,
pulsante "Riproduci sulla TV" in Film/Episodi) verificata renderizzare
correttamente in Chromium reale (Playwright): voce di navigazione
presente, stato vuoto mostrato correttamente quando non c'è una
riproduzione attiva. **Non verificato**: output video/audio reale su un
display fisico (nessun display, nemmeno virtuale, in questo ambiente —
stessa categoria di limitazione già nota per la cattura schermo di
Condivisione schermo) e il flusso completo con Jellyfin reale (nessuna
istanza Jellyfin raggiungibile in questo ambiente, stessa limitazione
nota per Film/Serie in generale).

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
  - **Chiarimento in fase di implementazione — AllowedIPs del profilo
    "solo casa"**: la frase concordata "limitato a Hub/rete di casa"
    poteva leggersi in due modi, in tensione con la regola di isolamento
    sopra ("il peer raggiunge solo l'Hub... mai il resto della
    rete/altri dispositivi di casa"). Risolto a favore dell'isolamento:
    l'`AllowedIPs` del profilo "solo casa" è l'IP dell'Hub stesso (`/32`,
    dedotto da `getLocalNetworkInfo()`), non l'intera subnet LAN — "rete
    di casa" nella frase originale va letto come "l'Hub, che vive sulla
    rete di casa", non "l'intera rete di casa". Le regole iptables lato
    server bloccano comunque ogni altro inoltro anche per il profilo
    "tunnel completo", indipendentemente da cosa dichiara il client.
- **Fase 10 — Internet e backup "non configurato" non alzano
  l'indicatore generale**: `getSystemStatus()` calcola NORMAL/ATTENTION/
  PROBLEM da CPU/RAM/temperatura/storage/servizi come prima, ma
  volutamente NON considera "problema" l'assenza di Internet (§27:
  l'Hub è pienamente utilizzabile offline, trattarlo come un'anomalia
  del sistema sarebbe fuorviante) né un backup semplicemente non
  configurato (§5: è un'espansione futura legittima, non un difetto).
  Solo un backup configurato che fallisce davvero alza l'indicatore.
  Entrambi i segnali restano comunque visibili come campi a sé nella
  risposta e nella pagina Sistema — solo l'indicatore aggregato li
  ignora.
- **Fase 10 — watchdog dei servizi separato dal polling dello stato**:
  `GET /api/system/status` calcola lo stato "al volo" ad ogni chiamata
  (comportamento invariato dalle fasi precedenti), ma il riavvio
  automatico non può dipendere da quante volte il frontend interroga
  quell'endpoint — serve un controllo indipendente e continuo anche a
  browser chiuso. Per questo il watchdog (`lib/serviceWatchdog.ts`) ha
  un proprio `setInterval` interno (stesso pattern lazy-scheduler già
  usato per backup/DDNS/mDNS), con uno stato in memoria per contare
  fallimenti consecutivi e tentativi di riavvio per servizio.
- **Extra — "Web" apre nel browser reale, non incorporato**: richiesta
  esplicita dell'utente (esempio concreto: guardare La7 in streaming
  dall'Hub sulla TV). Valutate due strade: (1) incorporare il sito
  dentro l'Hub via iframe, (2) aprirlo nel browser reale del dispositivo
  in una nuova scheda. Scelta la (2), perché la (1) nella pratica non
  funzionerebbe quasi mai: la maggior parte dei siti di streaming
  imposta header (`X-Frame-Options`/CSP) che bloccano esplicitamente
  l'incorporamento in un iframe altrui, proprio per evitare questo uso.
  L'alternativa per aggirarlo — un browser vero renderizzato sul Wyse e
  trasmesso all'Hub, tipo desktop remoto solo per il browser — è stata
  scartata: progetto tecnico a sé (paragonabile per complessità a tutto
  il modulo Gaming), pesante per l'hardware iniziale (Intel J4105, 8 GB
  RAM, §3), e comunque non garantirebbe la riproduzione su siti con
  protezioni anti-pirateria che rilevano browser non standard.
- **Fase 5 — selezione audio lato Jellyfin, non lato browser**: ipotesi
  iniziale (mai verificata finché non serviva davvero): con Direct Play
  il tag `<video>` nativo avrebbe esposto le tracce multiple del
  contenitore via `HTMLMediaElement.audioTracks`, lasciando all'utente
  la scelta senza coinvolgere il server. Verificato empiricamente
  **falso**: creato un file reale con due tracce audio (ffmpeg, sia
  H.264/AAC sia VP9/Opus per escludere problemi di codec) e testato in
  Chromium headless — la proprietà `audioTracks` non esiste affatto
  sull'elemento (`'audioTracks' in video` → `false`). È un'API
  implementata solo da Safari/WebKit, mai da Chromium — che è il motore
  della stragrande maggioranza dei dispositivi reali (TV, Android,
  Chrome desktop). Corretto quindi delegare la selezione a Jellyfin: lo
  stream endpoint riceve `AudioStreamIndex` (invece di `static=true`) e
  Jellyfin remuxa/trasmette solo quella traccia — stesso meccanismo
  usato dai client Jellyfin ufficiali. Effetto collaterale positivo:
  finché l'utente non tocca il selettore, resta tutto invariato (Direct
  Play "static", zero elaborazione) — il costo del remux si paga solo
  quando si sceglie davvero una traccia diversa da quella di default.
- **Fase 4 — ricerca globale, risultati Giochi/File senza deep-link**: i
  risultati Film/Serie aprono direttamente il dettaglio (`/film/:id`,
  `/serie/:id`, già supportato dalle rispettive pagine); Giochi e File
  aprono invece la sezione generica (`/giochi`, `/file`), perché quelle
  pagine non supportano ancora l'apertura diretta di un elemento via
  URL — il titolo/percorso mostrato nel risultato basta comunque per
  ritrovarlo. Estendere Games/Files con un parametro di deep-link è
  rimandabile a quando servirà davvero.

## 3. Proposte aperte / da decidere con l'utente

Idee emerse durante l'implementazione, non ancora richieste esplicitamente
dalla spec né decise — da validare con l'utente prima di implementarle.
Ordinate per priorità: prima quelle risolvibili interamente in questo
ambiente (nessun hardware reale necessario), poi quelle bloccate
sull'hardware (Wyse/router/connessione dell'utente) — decisione presa
con l'utente il 2026-09-17.

### Risolvibili senza hardware reale — priorità

1. **Estensione "dispositivo di riproduzione" per più TV**: la
   Riproduzione su TV (Extra, sopra) oggi assume un solo output (il Wyse
   via HDMI). **Chiesto esplicitamente all'utente se esiste già un
   secondo dispositivo reale in mente (2026-09-17): confermato che è
   ipotetico** — nessun lavoro fatto, deliberatamente. Non è comunque
   una semplice estensione dell'astrazione `machines` del Gaming come
   ipotizzato in origine: se il secondo dispositivo ha un browser
   proprio (es. una Smart TV), non serve alcun lavoro backend — basta
   aprire la Web App direttamente lì e riusare `VideoPlayer.tsx`, che
   già funziona ovunque. Il lavoro vero servirebbe solo per controllare
   quella seconda TV *da remoto* (telecomando da un altro dispositivo),
   e richiederebbe un meccanismo diverso da mpv/IPC (un browser di una
   Smart TV non è un processo che l'Hub può pilotare) — più vicino al
   pattern WebSocket già usato da Condivisione schermo che a quello di
   Riproduzione su TV. Da riprendere solo quando esiste un dispositivo
   reale su cui progettare e verificare quel meccanismo.
2. **Provisioning automatico account Jellyfin/Immich per utente Hub**: se
   in futuro serve stato nativo per-utente lato Jellyfin/Immich (oltre al
   "Continua a guardare" già gestito lato Hub), andrebbe creato un
   account Jellyfin/Immich per ogni utente Hub alla creazione del
   profilo. Verificabile contro gli stessi stub HTTP già usati per le
   altre integrazioni Jellyfin/Immich. **Chiesto esplicitamente
   all'utente se esiste già un uso concreto in mente (2026-09-17):
   confermato che è ipotetica anche questa** — nessun lavoro fatto,
   deliberatamente (oggi nessuna funzionalità dell'Hub userebbe davvero
   quello stato nativo). Da riprendere solo quando emerge uno scopo
   specifico.
3. **Livello AI (orchestratore multi-modello), fuori roadmap**: proposta
   dell'utente, non richiesta da SPEC_V1/V2. Idea: un "AI Orchestrator"
   come ulteriore livello dell'Hub API che riceve richieste in linguaggio
   naturale, le instrada a uno o più modelli locali (es. un modello
   generale, uno per reasoning, uno agentico con tool calling) e concede
   loro accesso solo a strumenti controllati (`search_movies`,
   `start_download`, ecc.), mai diretto a filesystem/Docker/DB — stesso
   principio già seguito ovunque nell'Hub (l'AI diventerebbe un
   chiamante dell'API interna, non un bypass). Azioni distruttive
   richiederebbero conferma esplicita lato Hub, non lato modello.
   Il Wyse 5070 (Intel J4105, 8 GB RAM) non è in grado di eseguire
   modelli locali in modo utilizzabile — soluzione discussa: eseguire
   Ollama/i modelli su un PC remoto già in rete (lo stesso eventualmente
   usato per il Gaming, §10) e farli raggiungere dall'Hub API via HTTP,
   stesso pattern di Jellyfin/Immich (client HTTP dietro l'API, 503 non
   fatale se il PC è spento o irraggiungibile). Il client HTTP verso
   Ollama e l'orchestrazione sono costruibili/verificabili qui contro uno
   stub (l'API di Ollama è documentata pubblicamente); resta ultima in
   priorità perché è la proposta più ampia in scope e non ancora decisa
   nel dettaglio con l'utente (quale/i modelli, quali strumenti concedere
   per primi). Se approvata, partire con un solo modello e pochi
   strumenti ben definiti prima di valutare l'orchestrazione
   multi-modello.

### Bloccate sull'hardware reale

- **L'utente è su EOLO (FWA) — probabile CGNAT, port forwarding a
  rischio**: informazione raccolta in conversazione, da verificare
  concretamente quando router e Wyse saranno disponibili (confronto tra
  l'IP pubblico mostrato dal router e quello visto da un dispositivo su
  rete mobile — se diversi, CGNAT confermato). **Chiusa lato codice**: se
  confermato, il port forwarding manuale non funzionerà, ma il tunnel di
  fallback (Cloudflare Tunnel, gratuito, nessuna porta da aprire) è ora
  implementato — vedi Fase 9 e README "Deploy". Resta da fare solo la
  verifica del CGNAT stesso quando l'hardware sarà disponibile — nessun
  lavoro di codice ulteriore possibile prima di allora.

### Decisioni già chiuse (riferimento)

- **Hub API fuori da Docker, sull'host**: l'Hub API lancia gli emulatori
  come processo figlio (`child_process.spawn`) del proprio processo
  Node, e quel processo deve avere accesso diretto allo schermo/
  controller del Wyse — cosa che un container Docker normalmente non ha
  (servirebbe passthrough X11/Wayland + `/dev/dri`, configurazione non
  banale per un'app interattiva). La stessa logica vale per Moonlight
  (Remote Gaming, V2): la spec lo vuole come app di sistema sul Wyse,
  non containerizzata.
  Valutate due strade — (1) far girare l'Hub API sull'host con accesso
  diretto al display, oppure (2) tenerla in Docker e delegare l'avvio a
  un piccolo agente locale sull'host — **è stata scelta la (1)**: l'Hub
  API gira come servizio **systemd** direttamente sul Wyse (vedi
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

(**Selezione automatica della macchina di esecuzione**, **priorità
risorse dinamica per download/backup**, **libreria virtuale multi-disco
per Games/Downloads**, **integrazione reale con l'API di Sunshine**,
**Riproduzione su TV non Smart** e **rimozione di Musica dallo scope**:
proposte/decisioni chiuse, vedi rispettivamente Fase 7 (due volte), Fase
6/10, Fase 6/7, "Extra — Riproduzione su TV non Smart" e Fase 5, sopra.)

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
- SMART (`lib/storage/smart.ts`) ✅ verificato per davvero sul Wyse
  reale il 24/09/2026 (§5): tre bug corretti (timeout mancante — si
  bloccava indefinitamente senza `-d sat` invece di fallire, device
  della partizione invece del disco base, `CAP_SYS_RAWIO` non concesso
  dal solo gruppo `disk` — permesso sudo mirato aggiunto). Stato letto
  con successo su un SSD reale (PNY CS900 120GB, `SSD_Life_Left` 100%).
- Backup: verificato a fondo su filesystem reale in questo ambiente
  (copia con limite di banda, verifica di integrità, skip incrementale,
  gestione file modificato a metà copia, snapshot DB via `VACUUM INTO`,
  ripristino con recupero effettivo del contenuto) — non verificato lo
  scenario reale "secondo disco USB/SATA che si scollega a metà backup"
  (in questo ambiente ogni percorso è sullo stesso filesystem), né il
  recovery completo su hardware nuovo end-to-end.
- DDNS (`lib/network/ddns.ts`) verificato contro uno stub HTTP fedele
  all'API DuckDNS, non contro il servizio reale (nessun account/dominio
  DuckDNS disponibile in questo ambiente). Caddy/HTTPS automatico
  (`infra/Caddyfile`, servizio `caddy` opzionale) non verificabile affatto
  in questo ambiente: richiede un dominio pubblico reale, DNS che punta
  a un IP raggiungibile da Internet e la porta 443 aperta sul router —
  nessuno di questi disponibile qui. Port forwarding automatico
  (UPnP/NAT-PMP) non implementato: in V1 va aperto manualmente sul router
  (documentato in README "Deploy").
- Riavvio automatico dei servizi (`lib/serviceWatchdog.ts`) e spegnimento
  sicuro (`lib/power.ts`) verificati contro `docker`/`sudo` fittizi che
  registrano l'invocazione esatta ricevuta — confermato che i comandi
  costruiti sono quelli giusti (`docker restart <container>`,
  `sudo /sbin/shutdown -h now`), non contro un demone Docker reale né un
  sistema con systemd/sudoers reali (questo ambiente sandbox non ha
  nessuno dei due, vedi l'inizio di questo documento). Da verificare sul
  Wyse: che l'utente `homehub` sia effettivamente nel gruppo `docker` e
  che il file sudoers installato funzioni come previsto.
- VPN personale WireGuard (`lib/network/vpn.ts`): nessun modulo kernel
  WireGuard disponibile in questo ambiente sandbox, quindi `wg-quick up`
  fallisce sempre qui (degrado esplicito verificato, §31) — verificato
  per davvero solo quanto non richiede l'interfaccia realmente attiva:
  generazione delle chiavi del server, scrittura/permessi di `wg0.conf`,
  gestione peer (creazione con chiavi reali generate da `wg genkey | wg
  pubkey`, allocazione IP, unicità, revoca) via API e in un browser
  reale. Da verificare sul Wyse: `wg-quick up` che porta su l'interfaccia
  per davvero, le regole iptables di isolamento/NAT contro traffico
  reale, un handshake genuino da un client esterno, che
  `AmbientCapabilities=CAP_NET_ADMIN CAP_NET_RAW` nel service systemd sia
  sufficiente senza root (vedi `infra/systemd/home-hub-api.service`).
- Priorità di banda dinamica (`lib/priority.ts`): `isStreamingActive()`
  verificato per davvero contro uno stub HTTP fedele a `GET /Sessions`
  di Jellyfin (tutti i casi: vuoto, in riproduzione, in pausa, senza
  `NowPlayingItem`); non verificato contro un'istanza Jellyfin reale con
  una riproduzione vera in corso.
- Libreria virtuale multi-disco (`lib/storage/library.ts`): verificata a
  fondo su filesystem reale con due cartelle come due dischi distinti in
  questo ambiente (stesso filesystem sottostante, quindi spazio libero
  sempre identico) — la scelta "più spazio libero" non è mai stata
  esercitata con dischi che hanno davvero spazio diverso; da verificare
  sul Wyse con dischi reali di capacità diverse.
- Selezione automatica della macchina in Gaming
  (`lib/gaming/autoSelect.ts`): verificata via curl con un probe TCP che
  fallisce (host di test irraggiungibile in questo ambiente) — il ramo
  "macchina remota online" (probe riuscito) non è stato esercitato
  contro un vero PC remoto raggiungibile.
- Aggiornamenti Hub (`lib/updates.ts`): la sequenza git (fetch, confronto
  commit, `merge --ff-only`) verificata per davvero contro repository
  git creati apposta, sia nel caso fast-forward sia nel rifiuto su
  storia divergente; il riavvio via sudo e la ricostruzione dei
  container Docker non sono verificabili in questo ambiente (nessun
  systemd/demone Docker reale).
- Tunnel di fallback gratuito (`infra/Caddyfile.tunnel`): il blocco di
  sicurezza verificato per davvero con un'istanza Caddy reale contro un
  backend fittizio; nessun account/tunnel Cloudflare reale disponibile
  in questo ambiente per verificare `cloudflared` stesso o il percorso
  end-to-end da Internet.

---

## 5. Log deploy su hardware reale (Dell Wyse 5070) — 24/09/2026

Prima sessione di deploy reale, condotta da remoto via SSH con l'utente
che eseguiva i comandi sul Wyse fisico e riportava gli output. Percorso
completo: download/preparazione USB → boot e verifica hardware in BIOS
→ installazione Ubuntu Server 24.04 LTS → Docker/Node.js/repo → primo
avvio di Hub API + Web App/Jellyfin/Immich → Wi-Fi e IP statico →
verifica di persistenza dopo un riavvio reale → spegnimento sicuro.

### Scoperte impreviste e correzioni

- **Storage interno reale: eMMC 16GB, non un SSD M.2 256GB.** Ipotesi
  della spec originale rivelata sbagliata all'accensione (controllato
  in BIOS/`lsblk` prima di installare, come da procedura). Cambia
  l'architettura di fatto: il disco interno può ospitare solo il sistema
  operativo + Docker, **mai** dati (Film/Serie/Foto/Giochi/Download) —
  serve un disco esterno fin dal primo avvio, non solo "quando i dati
  crescono" come ipotizzato in origine. Vedi anche la nota sotto sulla
  saturazione dell'eMMC.
- **Bug reale di build**: `tsc` non copiava i file `.sql` delle
  migrazioni in `dist/` (mai emerso prima perché `npm run dev` legge
  sempre da `src/`) — l'avvio in produzione (`npm run build && npm
  start`, quello usato dal servizio systemd) non era mai stato eseguito
  per davvero fino a questo deploy. Corretto in
  `apps/api/package.json` (`build` ora copia anche le migrazioni).
- **eMMC saturata dalle immagini Docker** (Jellyfin/Immich/Postgres/
  Redis, diversi GB) più, in un secondo momento, da un **ambiente
  desktop completo installato per errore** (GNOME, Firefox, snap-store —
  probabile selezione sbagliata nello step "applicazioni" dell'installer
  Ubuntu Server, mai confermata con certezza). Risolto: rimossi i
  pacchetti desktop via `apt purge`/`autoremove`; disco USB da 120GB
  riformattato in ext4 (era NTFS, poco adatto a operazioni POSIX come le
  copie atomiche del backup) e montato in modo permanente
  (`/etc/fstab`, `UUID=...`, opzione `nofail`) su `/mnt/data`; sia
  `infra/data` (collegamento simbolico) sia lo storage interno di Docker
  (`/etc/docker/daemon.json`, `data-root`) spostati lì. **Ordine di
  montaggio al boot**: aggiunta una dipendenza esplicita
  (`RequiresMountsFor=/mnt/data`, drop-in systemd su `docker.service` e
  `home-hub-api.service`, non nel file di unit versionato perché
  specifico di questo deploy) per evitare che Docker/Hub API partano
  prima che il disco USB sia montato e ricreino le cartelle dati
  sull'eMMC — verificato con un riavvio reale della macchina dopo il
  fix.
- **Due bug reali di permessi, stesso pattern**: sia la connessione
  Wi-Fi (`connectWifi` in `lib/network/wifi.ts`) sia lo spegnimento da
  Web App fallivano perché l'utente di sistema `homehub` (senza sessione
  di login, §26 least privilege) non ha i permessi che NetworkManager/
  systemd richiedono per queste operazioni — a differenza della sola
  scansione Wi-Fi, che funziona per qualunque utente. Il Wi-Fi era un
  bug di codice reale (mai passava da `sudo`), corretto con un permesso
  sudo mirato dedicato (`infra/systemd/homehub-wifi-sudoers`, stesso
  principio di `homehub-shutdown-sudoers`). Lo spegnimento aveva invece
  già il codice giusto: il file sudoers esisteva nel repository ma non
  era mai stato installato sul Wyse durante questo deploy — promemoria
  operativo, non un bug.
- **`git pull` come root rifiutato** dopo aver reso `/opt/home-hub` di
  proprietà dell'utente di sistema `homehub` ("dubious ownership",
  protezione recente di Git) — richiesto `sudo git config --global --add
  safe.directory /opt/home-hub`.
- Rimosso un riferimento residuo a `Media/Music` nel bind mount di
  Jellyfin in `infra/docker-compose.yml`, dimenticato quando Musica è
  stata tolta dallo scope del progetto in una sessione precedente.

### Cosa funziona, verificato sul Wyse reale

Hub API su systemd (riavvio automatico, sopravvive al reboot), Web App/
Jellyfin/Immich via Docker Compose, storage su disco USB esterno
(120GB ext4), Wi-Fi con IP statico (si riconnette da solo al boot,
verificato con un riavvio reale), spegnimento sicuro da Web App,
wizard di primo avvio completato con un utente admin reale.

### Continuazione 24/09/2026 — Jellyfin, Immich, SMART

Seconda sessione sullo stesso hardware. Confermata la persistenza del
setup: Wi-Fi, Docker e Hub API ripartiti da soli dopo due riavvii reali
in più (uno programmato, uno per un blocco durante l'installazione di
`smartmontools` — vedi sotto).

- **Bug reale, stessa famiglia di ieri**: `containerd` (il motore sotto
  Docker) ha una propria cartella dati (`/var/lib/containerd`),
  **separata** da quella di Docker (`/var/lib/docker`, già spostata
  ieri) — non l'avevamo spostata, quindi l'eMMC si è di nuovo riempita
  (immagine Postgres di Immich, ~7GB) fino a bloccare anche
  l'installazione di un pacchetto da 643KB. Risolto: dati spostati su
  `/mnt/data/containerd`, `root` impostato in `/etc/containerd/
  config.toml`, stessa protezione d'ordine al boot
  (`RequiresMountsFor=/mnt/data`) già usata per `docker.service` e
  `home-hub-api.service`.
- **Bug reale**: l'immagine Postgres di Immich
  (`tensorchord/pgvecto-rs:pg14-v0.2.0`) non è più compatibile con le
  versioni recenti del server Immich (richiedono l'estensione "vchord"
  o "vector", non più fornita sotto quel nome) — immich-server andava in
  crash loop con "No vector extension found". Corretta con l'immagine
  Postgres ufficiale del progetto Immich
  (`ghcr.io/immich-app/postgres:14-vectorchord0.4.3-pgvectors0.2.0`).
- **Tre bug reali in cascata su SMART** (`lib/storage/smart.ts`),
  scoperti nell'ordine impersonando l'utente `homehub` sul Wyse reale:
  1. `smartctl` senza `-d sat` **si blocca indefinitamente** (non
     fallisce) su un SSD dietro un bridge USB-SATA — aggiunto un timeout
     esplicito (5s) a ogni chiamata esterna, mai presente per default in
     `execFile` di Node.
  2. `findmnt` restituisce il device della partizione montata
     (`/dev/sda1`), ma il passthrough SAT funziona solo sul disco
     intero (`/dev/sda`) — aggiunta la normalizzazione partizione→disco
     base.
  3. Anche con l'utente nel gruppo `disk`, i comandi ATA PASS-THROUGH di
     `-d sat` restano bloccati da `CAP_SYS_RAWIO` (limite del kernel, non
     di permessi sul file) — aggiunto un permesso sudo mirato dedicato
     (`infra/systemd/homehub-smart-sudoers`, sola lettura), stesso
     principio di spegnimento/aggiornamenti/Wi-Fi. Infine invertito
     l'ordine dei tentativi (`-d sat` prima, non dopo il timeout
     dell'auto-rilevamento) per evitare 5s di attesa inutile a ogni
     controllo — la Web App restava "in caricamento" per questo.
- Jellyfin e Immich collegati per davvero: API key create e configurate
  in `apps/api/.env`, librerie Film/Serie aggiunte in Jellyfin, foto
  reali caricate su Immich dall'app del telefono, secondo utente Immich
  creato per un familiare.
- SMART verificato funzionante sul disco dati esterno reale (PNY CS900
  120GB): stato "OK", `SSD_Life_Left` 100%.

### Prossimi passi (prossima sessione)

1. ~~Jellyfin~~ ✅ fatto (24/09).
2. ~~Immich~~ ✅ fatto (24/09) — secondo utente creato per un familiare.
3. **Backup**: rimandato in attesa di un secondo SSD dedicato (in arrivo,
   stessa taglia dell'attuale disco dati) — impostare `HUB_BACKUP_ROOT`
   quando disponibile e verificare backup manuale + ripristino per
   davvero.
4. ~~SMART~~ ✅ fatto (24/09) — tre bug reali corretti, vedi sopra.
5. **yt-dlp**: `pip install yt-dlp` (o `pip install --user`, attenzione
   al PATH di systemd — vedi commento in `apps/api/.env.example`) per
   attivare il Download Manager da URL.
6. **Multi-disco reale**: quando arriva il secondo SSD (punto 3),
   verificare per la prima volta la scelta "disco con più spazio
   libero" (`lib/storage/library.ts`) con capacità realmente diverse.
7. **Test da TV/dispositivo reale**: navigazione D-pad, sezioni Film/
   Serie/Foto/File/Download, controller USB/Bluetooth per il Gaming
   (SPEC_V1 Fase 11).
8. **Verifica watchdog Docker reale** (`lib/serviceWatchdog.ts`): finora
   verificato solo contro comandi `docker` fittizi (vedi §4) — ora che
   Docker reale gira sul Wyse, confermare che il riavvio automatico di
   Jellyfin/Immich in caso di blocco funzioni davvero (`homehub` è già
   nel gruppo `docker`, verificato in questa sessione).
9. Valutare se serve ancora AdGuard Home (fuori roadmap, per ora fermo
   per il conflitto sulla porta 53 con `systemd-resolved` — vedi §31 in
   SPEC_V1 e commento in `infra/docker-compose.yml`).
10. Popolare `infra/data/Media/{Movies,Series}` con contenuti reali per
    un test end-to-end completo di riproduzione da Jellyfin.
