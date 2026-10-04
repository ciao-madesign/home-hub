# Guida rapida — Uso quotidiano dell'Hub

Per chi usa l'Hub tutti i giorni (non per chi lo configura/sviluppa).
Niente terminale richiesto per le operazioni di routine qui sotto, a
parte dove esplicitamente indicato.

---

## Come raggiungere l'Hub

- **Normalmente**: `http://192.168.1.8` — indirizzo fisso, assegnato al
  Wyse quando è collegato via **cavo Ethernet** (il collegamento
  normale/consigliato).
- **Da PC/Mac** puoi anche usare `http://home-hub.local`: si aggiorna da
  solo anche se l'IP cambiasse, ma su alcuni dispositivi (es. alcune
  Google TV) non funziona — in quel caso usa sempre l'IP numerico.
- **Se il cavo Ethernet si scollega per sbaglio**: il Wyse passa in
  automatico al Wi-Fi di casa come backup, ma con un IP diverso da
  `.8` (assegnato dal router). In quel caso:
  - da PC/Mac, `home-hub.local` continua a funzionare senza modifiche;
  - dalla TV o altri dispositivi che non risolvono `.local`, devi
    trovare il nuovo IP (via router, o via SSH con `hostname -I`) finché
    non ricolleghi il cavo.
- **Hub irraggiungibile da nessun dispositivo**: controlla prima che il
  Wyse sia fisicamente acceso e che il cavo Ethernet sia ben collegato —
  è la causa più comune.

---

## Aggiungere episodi a una serie TV **già esistente**

Es: escono nuovi episodi di una serie che hai già in libreria.

1. Scarica l'episodio (dal Download Manager dell'Hub, o da torrent/altra
   fonte).
2. Sposta il file nella cartella giusta **senza terminale**, collegandoti
   alla condivisione di rete `Media`:
   - **Mac**: Finder → Vai → Connetti al server (⌘K) →
     `smb://192.168.1.8/Media`
   - **Windows**: Esplora file → barra indirizzo → `\\192.168.1.8\Media`
   - Credenziali: utente Samba (michele) + password impostata.
   - Trascina il file dentro `Series/<Nome Serie>/Season NN/`.
3. Apri Jellyfin (`http://192.168.1.8:8096`) → **Libreria → Scansiona
   tutte le librerie** (o aspetta la scansione automatica periodica).
4. L'episodio compare nella serie già esistente, nell'ordine corretto.

Non serve creare/ricreare nessuna libreria per questo caso.

---

## Aggiungere una serie TV **mai vista prima**

Es: inizi a seguire una serie nuova, mai scaricata finora.

1. Scarica i primi episodi e spostali (come sopra) dentro una **nuova
   sottocartella** con il nome della serie, es.
   `Media/Series/Nome Serie/Season 01/`.
2. Su Jellyfin → pannello admin → **Librerie → Aggiungi libreria
   multimediale**:
   - Tipo di contenuto: **Programmi TV**
   - Nome: il nome della serie
   - Cartelle: aggiungi il percorso della sottocartella appena creata
     (es. `/media/series/Nome Serie`)
   - Salva e avvia la scansione
3. Dopo la scansione, la serie compare come libreria a sé.

**Perché una libreria per serie e non una sola libreria "Serie TV"
generica**: è la struttura già in uso in questo Hub (vedi `Chernobyl`,
`True Detective`, `House of the Dragon`, `X Factor Italia` come librerie
separate) — se una cartella non è inclusa in **nessuna** libreria
esistente, Jellyfin non la vede affatto, anche se i file sono lì sul
disco.

**Aggiungere film**: non serve creare una libreria nuova — basta
spostare il file dentro `Media/Movies/`, Jellyfin lo trova da solo alla
prossima scansione (la libreria "Film" copre già tutta quella cartella).

---

## Scaricare con il Download Manager e spostare i file

1. Avvia il download dalla pagina **Download** della Web App dell'Hub
   (URL diretto o file torrent).
2. Il file compare nella cartella condivisa `Downloads` (anche mentre è
   ancora in corso):
   - **Mac**: `smb://192.168.1.8/Downloads`
   - **Windows**: `\\192.168.1.8\Downloads`
3. A download completato, **sposta il file manualmente** dentro
   `Media/Movies/` o `Media/Series/...` seguendo le istruzioni sopra —
   il Download Manager e la libreria Jellyfin sono due aree separate, lo
   spostamento non è automatico.
4. La voce scompare dalla pagina Download dell'Hub pochi minuti dopo il
   completamento (comportamento normale, non significa che il file sia
   stato cancellato dal disco).

---

## Problemi comuni

**"Jellyfin non disponibile" durante la riproduzione**: riprova dopo
qualche secondo — più spesso è un disservizio temporaneo del Wi-Fi di
casa che un problema dell'Hub.

**Immich mostra "Sincronizzazione non riuscita"**: controlla
"Visualizza Dettagli" — se la lista è vuota (0 elementi in coda) è un
errore isolato già superato, basta disattivare/riattivare "Abilita
backup" nell'app per pulire lo stato.

**Una cartella appena creata non compare da nessuna parte in Jellyfin**:
quasi sempre significa che nessuna libreria include quel percorso — vedi
"Aggiungere una serie TV mai vista prima" sopra.
