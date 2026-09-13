# HOME ENTERTAINMENT HUB — SPECIFICA V1 CONSOLIDATA

Stato: DEFINITA — BASELINE DI SVILUPPO

---

## 1. OBIETTIVO

Realizzare un Home Entertainment Hub personale basato su mini-PC/SBC,
con una singola Web App proprietaria che aggrega:

- Film
- Serie TV
- Foto
- Video personali
- Musica
- Giochi
- File/documenti
- Download
- Backup
- Gestione del sistema

L'utente interagisce principalmente con la Web App proprietaria.
I software open source utilizzati (es. Jellyfin, Immich) sono backend
interni e non devono determinare direttamente la struttura o l'esperienza
della Web App.

Principio architetturale:

```
Dispositivo utente
        ↓
   React Web App
        ↓
Hub API / Orchestrator
        ↓
Backend / servizi interni
        ↓
   SSD / dischi dati
```

## 2. ARCHITETTURA GENERALE

**Frontend:**
- React
- Web App responsive
- unica interfaccia per tutte le funzioni

**Backend:**
- API centrale proprietaria
- Orchestrator responsabile del coordinamento dei servizi

**Backend multimediali iniziali:**
- Jellyfin → Film e Serie
- Immich → Foto e Video personali

**Altri servizi:**
- File Manager proprietario
- Download Manager
- Gaming Manager
- Backup Manager
- System Manager

Il frontend NON deve dipendere direttamente da: Jellyfin, Immich, database,
filesystem, altri backend interni.

Il frontend comunica esclusivamente con l'API centrale.

## 3. HARDWARE V1

Hardware di partenza ufficiale:
- Dell Wyse 5070
- CPU Intel J4105
- RAM: 8 GB DDR4 SODIMM
- SSD sistema: M.2 SATA 2280, 128 GB
- SSD dati principale: SSD esterno 500 GB
- secondo disco di backup: previsto successivamente
- UPS: non previsto in V1

Caratteristiche richieste: funzionamento 24/7, basso consumo, funzionamento
silenzioso/passivo quando possibile, Linux, Docker + Docker Compose,
hardware video acceleration, Direct Play prioritario, transcoding hardware
come fallback, espandibilità tramite USB.

Case: custom, pulsante di accensione originale, nessun LED/status
indicator aggiuntivo, vano interno per SSD dati, eventuali dischi
aggiuntivi collegati tramite USB.

Rete V1: Wi-Fi, Ethernet non necessaria per V1.

## 4. STORAGE

Struttura logica iniziale:

```
SSD/
├── Media/
│   ├── Movies/
│   ├── Series/
│   └── Music/
├── Photos/
├── Games/
├── Files/
└── Downloads/
```

Principi: SSD sistema separato dai dati, SSD dati principale iniziale da
500 GB, architettura pronta per più dischi, filesystem e posizione fisica
dei dati normalmente nascosti all'utente, libreria virtuale unificata.

Con più dischi: l'utente vede una sola libreria virtuale; i nuovi file
vengono distribuiti automaticamente tra i dischi disponibili in base allo
spazio.

Se un disco viene scollegato: i suoi contenuti vengono nascosti
automaticamente, il resto dell'Hub continua a funzionare, il disco viene
mostrato come non disponibile, al ricollegamento i contenuti tornano
disponibili, nuovi download/importazioni vengono bloccati finché il disco
dati necessario non torna disponibile.

Spazio libero: soglia critica 10%, sotto la soglia viene mostrato un avviso
critico, nessun blocco automatico di download/importazioni.

## 5. BACKUP

```
Main Data
    ↓
Automatic Backup
    ↓
Backup Disk
```

Secondo disco di backup: non acquistato/configurato inizialmente, previsto
come espansione.

Il backup comprende: dati personali, database SQLite, configurazioni Hub,
configurazioni Docker, informazioni necessarie alla ricostruzione del
sistema.

Backup: automatico, manuale tramite "Backup Now".

Priorità: streaming/Web App → massima, backup → media, download → minima.
Durante streaming o altre attività prioritarie il backup viene
automaticamente limitato nelle risorse disponibili.

"Backup Now": parte immediatamente, applica comunque la gestione
automatica delle priorità.

File modificati durante un backup: non vengono modificati nel backup già
in corso, vengono inclusi automaticamente nel backup successivo.

Interruzione del backup per perdita di alimentazione: al successivo avvio
viene verificato il backup parziale, vengono recuperati solo dati mancanti
o corrotti.

Integrità: verificata durante la creazione del backup, nessuna verifica
periodica successiva in V1.

Backup non disponibile: l'Hub continua a funzionare normalmente, viene
mostrato un avviso.

Operazioni rischiose: prima di aggiornamenti importanti, ripristini o
modifiche allo storage viene verificata l'esistenza di un backup recente e
valido; se non disponibile, l'operazione viene bloccata.

## 6. OS E CONTAINER

Sistema: Linux, distribuzione scelta in funzione del Dell Wyse 5070 e del
supporto Docker/hardware video.

Container: Docker, Docker Compose.

Obiettivi: installazione riproducibile, servizi isolati, avvio automatico,
possibilità di trasferire il sistema su hardware compatibile.

Installazione V1: immagine preconfigurata, minimo lavoro manuale,
architettura predisposta per futuro installer automatico.

Avvio: Linux → Docker → servizi → Web App, tutto automaticamente. Dopo un
riavvio intenzionale: stesso avvio automatico, nessuna conferma richiesta.
Dopo perdita di alimentazione: il sistema rimane spento, non deve
riaccendersi automaticamente.

## 7. VIDEO — FILM E SERIE

Backend iniziale: Jellyfin.

Funzioni: librerie, metadata, copertine, stagioni, episodi, sottotitoli,
tracce audio, Direct Play, transcoding hardware.

Streaming: massimo obiettivo V1: 1 stream video simultaneo.

Priorità: Direct Play prima scelta, transcoding hardware come fallback.

Riproduzione: salvataggio automatico del punto di visione, Home →
"Continua a guardare". Contenuto completato: marcato automaticamente come
guardato al raggiungimento della soglia finale.

Serie: al termine di un episodio viene proposto "Prossimo episodio",
l'utente deve confermare prima dell'avvio.

Audio: se sono presenti più tracce, l'utente sceglie quale utilizzare,
nessuna selezione automatica obbligatoria.

Sottotitoli: download automatico quando disponibili, italiano come lingua
predefinita, altre lingue configurabili.

## 8. FOTO E VIDEO PERSONALI

Backend iniziale: Immich.

Foto: timeline, album, ricerca, visualizzazione full screen, slideshow.
Slideshow: intervallo configurabile, nessuna configurazione avanzata
obbligatoria V1.

Video personali: integrati nella timeline insieme alle foto, filtro per
visualizzare solo i video, riproduzione dalla Web App.

## 9. MUSICA

Backend/gestione integrata nell'Hub.

Funzioni: album, cartelle, riproduzione singola, player persistente. Il
player continua a funzionare mentre l'utente naviga nelle altre sezioni
della Web App.

Playlist: non previste in V1.

## 10. GAMING

L'Hub dispone di un catalogo giochi centralizzato. Per ogni gioco può
conoscere: titolo, copertina, piattaforma, stato, installazione, macchina
di esecuzione.

Tipi di esecuzione: giochi retro → mini-PC/Hub quando compatibili, giochi
PC → gaming PC esterno.

Architettura predisposta per più macchine di esecuzione.

Avvio: l'Hub seleziona automaticamente la macchina adatta, l'utente può
modificare manualmente la scelta.

Gaming PC: l'Hub gestisce catalogazione e avvio, NON gestisce remote
play/streaming del gioco PC verso altri dispositivi (gestito invece
dall'appendice Remote Gaming).

Giochi: caricamento manuale, importazione da cartelle monitorate, download
diretto dall'Hub.

Sorgenti: store/piattaforme ufficiali, sorgenti configurabili dall'utente,
utilizzo nel rispetto delle licenze applicabili.

Salvataggi: ogni macchina mantiene il proprio salvataggio attivo, l'Hub
mantiene un backup centralizzato dei salvataggi.

Controller: Bluetooth, USB, priorità Bluetooth quando disponibile.

Formati: supporto ai formati compatibili con gli emulatori utilizzati,
nessun vincolo artificiale a un singolo formato.

## 11. FILE MANAGER

Funzioni: cartelle, upload, download, rinomina, spostamento, eliminazione,
contenuti condivisi, contenuti privati.

Cestino: durata 7 giorni, ripristino disponibile, eliminazione definitiva
manuale, eliminazione definitiva immediata possibile con conferma
aggiuntiva.

Duplicati: rilevamento automatico, proposta all'utente, mostrare
informazioni utili per scegliere quale mantenere/eliminare, nessuna
eliminazione automatica.

Formati: mantenere formato originale, nessuna compressione automatica.

## 12. DOWNLOAD

Download Manager separato. Supporto: download normali, torrent, coda,
pausa, ripresa, destinazione SSD, stato.

Priorità: minima rispetto a streaming/Web App e backup. Quando sono
necessarie più risorse il download viene automaticamente limitato, non
viene necessariamente interrotto.

Download completati: non vengono mantenuti in uno storico permanente, la
sezione mostra principalmente download attivi/in coda.

Notifiche: nessuna notifica al completamento.

## 13. IMPORTAZIONE CONTENUTI

Metodi: caricamento manuale, upload smartphone, cartelle monitorate,
download manager.

Riconoscimento: automatico. Organizzazione: automatica con conferma
dell'utente.

Esempio: "Il sistema ha identificato questo contenuto come Film X. Vuoi
aggiungerlo alla libreria Film?"

Il sistema non deve modificare arbitrariamente i file.

Offline: il contenuto viene importato immediatamente, vengono usati i dati
disponibili localmente, i metadati online vengono completati quando
Internet torna disponibile.

## 14. DATABASE

V1: SQLite. Motivazioni: locale, semplice, leggero, massimo 2 utenti
(estendibile, vedi Appendice utenti/dispositivi).

Frontend: MAI accesso diretto al database. API: unico punto di accesso ai
dati.

Possibile evoluzione: PostgreSQL in futuro.

## 15. WEB APP

Tecnologia: React. Unica Web App responsive.

Dispositivi target: PC, Mac, smartphone, tablet, Smart TV, Android TV,
Google TV, browser moderni.

V1: nessuna app nativa.

## 16. NAVIGAZIONE

Sidebar: Home, Film, Serie, Foto, Musica, Giochi, File, Download, Sistema.

Sidebar: icona + testo, collassabile, modalità ridotta con sole icone.

Ricerca: ricerca globale unica su Film, Serie, Foto, Musica, Giochi, File.

File: ricerca solo per nome, cartella e metadati, nessuna ricerca
full-text nei documenti.

Offline: ricerca globale funzionante sui contenuti/metadati locali.

## 17. HOME

Dashboard dinamica. Priorità visiva: Film, Serie, Foto, Giochi, Musica,
File, Download, Sistema.

La Home può contenere: categorie, contenuti recenti, "Continua a
guardare", stato sistema, altri widget.

Personalizzazione: aggiunta/rimozione widget, riordinamento, possibilità
di nascondere sezioni, alcune preferenze visuali modificabili.

NON presenti: sistema di raccomandazioni automatiche basato sulla
cronologia.

## 18. DESIGN

Stile: minimal, moderno, premium, media center, cinematico per i contenuti
multimediali.

V1: dark-only.

Sezioni tecniche: più funzionali, comunque coerenti con il design
generale, evitare estetica da classico server panel.

Animazioni: moderate, adattive all'hardware, ridotte su dispositivi
deboli, rispetto di `prefers-reduced-motion`.

Temi multipli: futuri.

## 19. TV

Stessa Web App. Layout: stessa struttura generale, ottimizzazione
specifica per TV.

Controlli: telecomando, D-pad, frecce, OK/Enter, Back, controller
compatibile.

UI: griglia classica, focus sempre visibile, navigazione prevedibile. NON
deve diventare una UI da console.

## 20. UTENTI

Vedi anche Appendice — Gestione utenti e dispositivi (estensione).

Profili: Owner/Admin, Secondo utente personale (baseline V1, architettura
estendibile a N utenti).

Admin: sistema, utenti, storage, backup, rete, aggiornamenti, servizi.

Secondo utente: contenuti autorizzati, nessuna gestione amministrativa.

Profili V1: principalmente condivisi, poche personalizzazioni individuali.

Contenuti privati: ogni utente può decidere se un contenuto è privato o
condiviso.

## 21. ACCESSO LOCALE

LAN: nessuna autenticazione richiesta. Qualsiasi dispositivo collegato
alla LAN è considerato autorizzato.

All'accesso: selezione del profilo.

Metodi: discovery automatico, QR code, hostname `.local`, IP disponibile
nelle impostazioni tecniche.

DHCP: comportamento normale. IP statico: funzione avanzata.

## 22. ACCESSO REMOTO

Massimo obiettivo: 2 dispositivi remoti contemporaneamente (V1); vedi
Appendice per il requisito V2 di almeno 3 dispositivi connessi
contemporaneamente.

Accesso: Internet, HTTPS, username/password.

Stessa Web App: locale, remota. Indicatore: distinzione discreta
locale/remoto.

Qualità streaming remoto: adattiva automaticamente in base alla
connessione.

Entrambi gli utenti possono accedere da remoto.

## 23. DOMINIO / DDNS / TUNNEL

Supporto: DDNS gratuito integrato, dominio personale configurabile.

Port forwarding: configurazione automatica quando supportata dal router,
fallback con procedura guidata.

Se il router non supporta il port forwarding: utilizzare un
tunnel/accesso remoto alternativo.

Tunnel: provider gratuito come default quando possibile, provider
alternativi configurabili dall'utente.

Vercel: NON costituisce il componente principale dell'accesso remoto, può
eventualmente essere utilizzato per DNS/dominio, ma la Web App principale
rimane ospitata sull'Hub.

## 24. HTTPS E AUTENTICAZIONE REMOTA

HTTPS: certificato gestito automaticamente, rinnovo automatico.

Autenticazione: obbligatoria da remoto, username/password.

Password: ogni utente può modificare la propria, admin può reimpostare le
password.

Sessione: persistente, durata fissa breve.

Sicurezza: possibilità di revocare immediatamente tutte le sessioni
remote.

## 25. RECUPERO PASSWORD

Metodi: e-mail, procedura locale sull'Hub.

E-mail: SMTP configurabile, eventuale servizio esterno preconfigurato.

## 26. SICUREZZA

Principi: SSD mai direttamente esposto a Internet, API come unico punto di
accesso, autenticazione remota, HTTPS remoto, firewall, isolamento
container, least privilege, rate limiting, protezione brute-force,
logging, aggiornamenti controllati, nessuna memorizzazione di credenziali
di altri dispositivi, hardening automatico.

V1: nessuna VLAN obbligatoria, SSD non cifrati.

## 27. OFFLINE-FIRST

Funzioni disponibili senza Internet: Film, Serie, Foto, Video personali,
Musica, File, giochi retro, Web App, configurazioni locali, ricerca
locale.

Funzioni temporaneamente non disponibili: download/torrent che richiedono
Internet, metadati online, aggiornamenti, accesso remoto, funzioni cloud.

UI: rileva automaticamente lo stato offline, nasconde/disabilita le
funzioni non disponibili quando necessario.

Il primo setup deve poter essere completato completamente offline.

## 28. RETE E SETUP INIZIALE

Wi-Fi: configurazione automatica/WPS quando possibile, procedura guidata
da smartphone se necessario.

Primo avvio: wizard unico. Wizard: 1) rete, 2) utenti, 3) storage, 4)
librerie, 5) impostazioni principali.

Obiettivo: minimo lavoro manuale, configurazione comprensibile anche a
utenti non tecnici.

## 29. GESTIONE DISCHI

Nuovo disco: rilevamento automatico, capacità, stato, configurazione
guidata, assegnazione alle librerie.

Disco scollegato: contenuti nascosti, sistema operativo e altri servizi
continuano, stato "non disponibile".

SMART: controllo automatico salute disco, avviso in caso di problemi.

## 30. SISTEMA E MONITORAGGIO

Indicatore sempre disponibile: NORMAL / ATTENTION / PROBLEM.

Informazioni: CPU, RAM, temperatura, storage, stato SSD, Internet,
servizi, backup, download.

Notifiche: solo eventi critici.

Temperatura: solo segnalazione di surriscaldamento, nessuna riduzione
automatica delle prestazioni, nessuno spegnimento automatico per
temperatura.

Spazio: soglia critica 10%, solo avviso.

## 31. GESTIONE SERVIZI

Se un servizio interno non è disponibile: la relativa sezione rimane
visibile, viene indicato chiaramente che il servizio è temporaneamente
indisponibile.

L'Hub tenta automaticamente il riavvio del servizio. Se il servizio
continua a fallire: numero limitato di tentativi, successiva segnalazione
critica.

Non è prevista una modalità manutenzione dedicata.

## 32. PRIORITÀ RISORSE

Ordine: 1) Streaming/Web App, 2) Backup, 3) Download.

Il sistema adatta automaticamente le risorse. Streaming/Web App: sempre
priorità massima. Backup: ridotto quando necessario. Download: limitato
quando necessario.

Obiettivo: evitare che attività di background compromettano l'esperienza
utente.

## 33. AGGIORNAMENTI

L'Hub controlla periodicamente la disponibilità di aggiornamenti,
notifica l'utente, mostra cosa verrà aggiornato, attende autorizzazione,
installa, segnala eventuali errori.

NON: aggiornamenti automatici senza autorizzazione, nemmeno aggiornamenti
di sicurezza senza autorizzazione.

Dopo un aggiornamento: riavvio automatico se non ci sono attività in
corso, altrimenti richiesta di conferma.

## 34. POWER MANAGEMENT

Accensione: Linux → Docker → servizi → Web App automaticamente.

Pulsante: shutdown Linux sicuro.

Spegnimento: manuale, Web App o pulsante fisico. NON: spegnimento
programmato.

Dopo blackout: Hub rimane spento.

Standby: automatico, configurabile, comportamento adattivo in base alle
attività.

Wake: pulsante, rete quando tecnicamente supportato.

## 35. RECOVERY / FACTORY RESET

Factory reset: disponibile dalla Web App, preserva obbligatoriamente i
dati personali.

Recovery nuovo hardware: 1) installazione base, 2) collegamento backup, 3)
wizard di ripristino, 4) ripristino automatico.

Obiettivo: sostituzione hardware compatibile senza riprogettare la Web
App.

## 36. LIMITI V1

V1 non richiede ancora: PostgreSQL, app native, VLAN, cifratura SSD, RAID,
UPS, remote play PC (gestito in appendice separata), playlist musicali,
raccomandazioni AI, ricerca full-text documenti, temi multipli, riavvii
programmati, spegnimenti programmati, modalità manutenzione dedicata,
backup automatici dei dispositivi personali, complessi sistemi di
permessi filesystem, ruoli avanzati oltre ai 2 profili base.

## 37. STATO DEL PROGETTO

SPECIFICA V1: COMPLETA. Decisioni di prodotto: DEFINITE. Hardware
iniziale: DELL WYSE 5070 J4105. Prossima fase: IMPLEMENTAZIONE.

## 38. NEXT STEPS

**FASE 1 — Preparazione hardware**
1. Verificare definitivamente la configurazione del Dell Wyse 5070.
2. Acquistare/configurare: RAM 8 GB, M.2 SATA 2280 128 GB, SSD dati
   esterno 500 GB.
3. Definire collegamento e alimentazione dell'SSD dati interno al case
   custom.
4. Preparare il case custom.
5. Verificare Wi-Fi e gestione alimentazione.
6. Installare Linux.

**FASE 2 — Base software**
1. Installazione Linux. 2. Aggiornamenti iniziali. 3. Docker Engine.
4. Docker Compose. 5. Struttura directory del progetto. 6. Volumi
persistenti. 7. Backup della configurazione iniziale. 8. Avvio automatico
dei container. 9. Primo sistema di logging.

**FASE 3 — Hub Core**
1. Creare repository del progetto. 2. Creare API centrale. 3. Creare
database SQLite. 4. Definire modello dati iniziale. 5. Creare
autenticazione/profili. 6. Creare gestione configurazione. 7. Creare
health check dei servizi. 8. Creare gestione stato sistema.

**FASE 4 — Web App**
1. Creare React Web App. 2. Layout principale. 3. Sidebar. 4. Home.
5. Ricerca globale. 6. Area Sistema. 7. Gestione profilo. 8. Responsive
desktop/mobile. 9. UI TV/D-pad. 10. Dark theme.

**FASE 5 — Media**
1. Integrare Jellyfin tramite API centrale. 2. Integrare Film.
3. Integrare Serie. 4. Riproduzione. 5. Continua a guardare. 6. Metadati.
7. Sottotitoli. 8. Audio. 9. Direct Play. 10. Hardware transcoding.
Successivamente: 11. Integrare Immich. 12. Foto. 13. Video personali.
14. Timeline. 15. Slideshow.

**FASE 6 — File e download**
1. File Manager. 2. Upload/download. 3. Cartelle. 4. Cestino. 5. Contenuti
privati/condivisi. 6. Duplicati. 7. Download Manager. 8. Torrent. 9. Code
e priorità. 10. Gestione spazio.

**FASE 7 — Gaming**
1. Catalogo giochi. 2. Importazione. 3. Emulatori retro. 4. Controller
Bluetooth/USB. 5. Avvio giochi. 6. Gestione macchine. 7. Gaming PC
esterno. 8. Backup dei salvataggi.

**FASE 8 — Storage e backup**
1. Gestione SSD dati. 2. SMART. 3. Libreria virtuale multi-disco.
4. Rilevamento dischi. 5. Gestione disco scollegato. 6. Backup automatico.
7. Backup manuale. 8. Ripristino incrementale dopo interruzione. 9. Backup
database/configurazione. 10. Recovery su nuovo hardware.

**FASE 9 — Rete e accesso remoto**
1. Discovery locale. 2. `.local`. 3. QR. 4. Setup Wi-Fi. 5. DDNS.
6. HTTPS automatico. 7. Port forwarding automatico quando possibile.
8. Tunnel fallback. 9. Autenticazione remota. 10. Sessioni. 11. Revoca
sessioni. 12. Recupero password.

**FASE 10 — Sistema**
1. Monitoraggio CPU/RAM/temperatura. 2. Storage. 3. Internet. 4. Servizi.
5. Backup. 6. Download. 7. Stato Normal/Attention/Problem. 8. Riavvio
automatico servizi. 9. Gestione errori. 10. Priorità risorse. 11.
Standby/wake. 12. Aggiornamenti autorizzati.

**FASE 11 — Test V1**
Testare almeno: boot automatico, shutdown sicuro, blackout, standby,
wake, Wi-Fi, accesso locale, accesso remoto, 2 utenti, contenuti privati,
Film, Serie, sottotitoli, audio multiplo, 1 stream, hardware transcoding,
Foto, Video, Musica, File, Download, torrent, giochi retro, controller,
gaming PC, backup, recovery, disco scollegato, disco pieno, servizio
bloccato, aggiornamento, assenza Internet.

## 39. PRINCIPIO DI SVILUPPO

NON sviluppare tutto contemporaneamente.

```
Hardware funzionante
      ↓
Linux + Docker
      ↓
Hub Core + SQLite
      ↓
React Web App
      ↓
Jellyfin
      ↓
Prima versione realmente utilizzabile
      ↓
Immich
      ↓
File / Download
      ↓
Gaming
      ↓
Backup / Recovery avanzati
      ↓
Remote Access
      ↓
Ottimizzazione e rifinitura
```

Obiettivo del primo milestone:

> UN UTENTE DEVE POTER ACCENDERE IL WYSE, APRIRE LA WEB APP, VEDERE LA
> HOME, ACCEDERE ALLE LIBRERIE, RIPRODURRE UN FILM, E GESTIRE I PROPRI
> FILE.

Solo dopo si aggiungono progressivamente le funzioni secondarie.

---

## Appendice — Gestione utenti e dispositivi

La V1 deve prevedere fin dalla prima versione un sistema di gestione
utenti estendibile, senza un limite rigido di due account. L'utente
Owner/Admin può creare, modificare e gestire nuovi utenti e relativi
permessi.

Il sistema deve mantenere distinta la gestione degli utenti/account da
quella dei dispositivi connessi: uno stesso utente può utilizzare più
dispositivi contemporaneamente e più dispositivi possono essere associati
allo stesso account.

L'architettura deve quindi essere progettata fin dalla V1 per supportare
l'aumento futuro del numero di utenti senza modifiche strutturali
sostanziali.

Per la V2 è previsto inoltre un requisito minimo di 3 dispositivi
connessi contemporaneamente, indipendentemente dal numero di utenti
effettivamente presenti.

## Appendice — Remote Gaming e PC remoto

**Obiettivo**

L'HUB deve poter utilizzare un PC remoto come execution node per
applicazioni ad alto carico, in particolare videogiochi, mentre il Dell
Wyse rimane il centro di controllo e può fungere da client di gioco
collegato alla TV.

**Architettura**

```
PC remoto                         Dell Wyse
┌──────────────┐                 ┌──────────────┐
│ Gioco        │                 │ HUB          │
│ Sunshine     │◄─── LAN ──────►│ Moonlight    │
└──────────────┘                 └──────┬───────┘
                                        │ HDMI
                                        ▼
                                    TV TCL
                                        │
                                    Controller
```

**Requisiti — PC remoto**
- esegue giochi e applicazioni;
- esegue Sunshine;
- mantiene autonomamente OS, account, giochi e storage;
- deve disporre di hardware sufficiente per l'applicazione.

**Requisiti — Dell Wyse**
- rimane il nodo HUB;
- esegue Moonlight;
- riceve e decodifica lo streaming;
- trasmette l'input del controller;
- può essere collegato direttamente alla TV tramite HDMI;
- gestisce il PC remoto tramite rete.

**Gestione del PC remoto**

L'HUB deve prevedere: Wake-on-LAN, verifica dello stato del PC, avvio
della sessione gaming, eventuale avvio del gioco, chiusura della sessione,
spegnimento remoto sicuro.

**Caso d'uso di riferimento**

Red Dead Redemption 2 viene eseguito sul PC remoto e visualizzato sulla TV
attraverso: PC remoto → Sunshine → rete → Wyse/Moonlight → HDMI → TV. Il
Wyse non deve eseguire direttamente il gioco.

**Principio architetturale**

Il PC remoto deve rimanere un execution node sostituibile. In futuro
potranno essere aggiunti altri PC o nodi con maggiore potenza senza
modificare l'architettura dell'HUB.

Estensione futura: supporto a emulatori come RPCS3 per giochi PS3,
subordinatamente alle capacità del PC remoto.
