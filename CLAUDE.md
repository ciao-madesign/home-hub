# CLAUDE.md

Guida per chi (umano o agente) lavora su questo repository. Per le
specifiche di prodotto vedi `docs/` (dettagli sotto) — questo file
riguarda com'è costruito il codice e come si lavora su di esso.

## Cos'è questo progetto

Home Entertainment Hub personale per Dell Wyse 5070: un'unica Web App
proprietaria (React) che aggrega Film, Serie, Foto, Musica, Giochi, File,
Download, Backup e gestione del sistema, parlando **esclusivamente** con
un'API centrale (Hub Orchestrator). I backend interni (Jellyfin, Immich,
yt-dlp, WebTorrent, filesystem, database) sono tutti dietro l'API: il
frontend non li conosce mai direttamente.

```
Dispositivo utente → React Web App → Hub API / Orchestrator → Backend interni → SSD / dischi dati
```

## Dove sono le specifiche

- `docs/SPEC_V1.md`, `docs/SPEC_V2.md` — specifica di prodotto originale
  dell'utente, consolidata. **Fonte di verità, non modificarla** per
  riflettere lo stato di implementazione: usa `docs/SPECIFICHE.md` per
  quello.
- `docs/SPECIFICHE.md` — documento vivo: checklist di implementazione per
  fase, decisioni/aggiunte prese durante lo sviluppo che integrano la
  specifica originale, proposte aperte non ancora decise. **Aggiornalo
  ogni volta che chiudi una fase o prendi una decisione architetturale non
  banale.**
- `docs/EXTERNAL_TOOLS.md` — decisioni su librerie/repo di terze parti
  (yt-dlp, WebTorrent, ecc.) e perché sono state scelte.
- `README.md` — stato attuale del progetto, istruzioni di sviluppo e
  deploy, limitazioni note.

## Stack tecnico

- **Monorepo npm workspaces**: `apps/api` (Hub API) + `apps/web` (Web App).
- **API**: Node.js + TypeScript + Fastify. Database SQLite via `node:sqlite`
  (nativo, sperimentale ma stabile — **non** `better-sqlite3`: niente
  compilazione nativa, più semplice da deployare sul Wyse).
- **Web**: React + Vite + TypeScript, nessuna libreria UI esterna (stile
  scritto a mano con CSS custom properties in `src/styles/theme.css`).
- **Backend multimediali**: Jellyfin (Film/Serie), Immich (Foto/Video) —
  servizi Docker esterni, integrati via client HTTP proprietari in
  `apps/api/src/lib/{jellyfin,immich}.ts`.
- **Download**: yt-dlp come processo esterno (`child_process`), WebTorrent
  come libreria embedded nel processo Node dell'Hub API (non un servizio
  Docker separato).

## Convenzioni stabilite (da rispettare in nuovo codice)

- **Mai esporre righe DB grezze dall'API**: ogni modulo ha un mapper verso
  un DTO camelCase (vedi `lib/downloads/store.ts:toDownloadDto`,
  `lib/sessions.ts:publicUser`, i vari `lib/jellyfin.ts`/`lib/immich.ts`).
  Il frontend non vede mai `snake_case` né campi interni.
- **Backend interno non raggiungibile → 503, mai un errore fatale**: vedi
  `lib/serviceError.ts` (`handleServiceError`) e il componente frontend
  `ServiceUnavailable.tsx`. La sezione resta visibile con un avviso invece
  di rompersi (§31 della spec).
- **Auth**: token Bearer via header per le chiamate JSON; per `<img>`/
  `<video src>` (che non possono impostare header) il token è accettato
  anche come query string `?token=` — vedi `plugins/auth.ts:extractToken`.
  Stesso compromesso usato da Jellyfin/Plex per i loro link firmati.
- **Path safety filesystem**: qualunque endpoint che accetta un percorso
  relativo da utente (File Manager, Gaming) deve rifiutare segmenti
  `.`/`..` esplicitamente (non fare solo `path.normalize` e sperare) —
  usa `lib/pathSafety.ts:assertSafeRelativePath`, condivisa tra i moduli.
- **Timestamp SQLite vs JS — attenzione**: `datetime('now')` di SQLite
  produce `"YYYY-MM-DD HH:MM:SS"` (UTC, senza `T`/`Z`). Confrontarlo in SQL
  con una stringa ISO8601 generata da `new Date().toISOString()` come
  semplice `WHERE colonna < ?` **non funziona correttamente** (confronto
  lessicografico rotto). Usare sempre `datetime(colonna) < datetime(?)` in
  SQL, e `lib/sqliteDate.ts:parseSqliteTimestamp` per parsare un timestamp
  SQLite in JS (altrimenti viene interpretato come ora locale, non UTC).
  Bug reale trovato e corretto sia nel cestino File Manager sia nel
  Download Manager — controllare questo pattern in ogni nuovo codice che
  fa retention/scadenze basate su timestamp DB.
- **Retention/purge senza scheduler dedicato**: per V1 non c'è un vero
  cron/scheduler. Le finestre di scadenza (cestino 7gg, download completati
  5 min) vengono applicate in modo *lazy*: si esegue una purge all'inizio
  di ogni lettura della lista (`listTrash`, `listDownloads`). Segui questo
  pattern per nuove funzionalità con retention, invece di introdurre un
  vero scheduler (non ancora giustificato dalla scala del progetto).
- **Motori di download**: `EngineHandle`/`EngineCallbacks` in
  `lib/downloads/types.ts` definiscono l'interfaccia comune tra yt-dlp e
  WebTorrent, orchestrata da `lib/downloads/manager.ts` (coda, priorità,
  pausa/ripresa/annulla, purge). Un nuovo motore di download deve
  implementare la stessa interfaccia.
- **Niente commenti superflui**: commenta solo il *perché* non ovvio
  (vincoli nascosti, workaround, comportamento sorprendente), mai il
  *cosa* (il codice ben nominato lo dice già). Guarda i commenti esistenti
  come esempio di tono/densità.
- **Zero dipendenze UI**: niente Tailwind/MUI/shadcn per la web app —
  stile inline + `theme.css` con custom properties, dark-only per V1.

## Comandi di sviluppo

```bash
npm install                 # alla radice, installa tutti i workspace

npm run dev:api              # Hub API su :4000
npm run dev:web              # Web App su :5173 (proxy /api → :4000)

npm run typecheck            # entrambi i workspace
npm run build                # entrambi i workspace
```

Richiede `yt-dlp` nel PATH per il Download Manager in locale
(`pip install yt-dlp`); senza, solo i download da URL falliscono, il
resto dell'Hub funziona normalmente (comportamento §31, verificato).

## Filosofia di test in questo ambiente

Questo repository viene sviluppato in un ambiente sandbox dove **il
registry Docker Hub non è raggiornabile** (bloccato dalla policy di rete),
quindi non è possibile avviare Jellyfin/Immich reali per testare
l'integrazione end-to-end. L'approccio adottato, da mantenere:

1. **Preferire sempre la verifica reale quando possibile.** PyPI, npm e
   `raw.githubusercontent.com` sono raggiungibili: yt-dlp e WebTorrent
   sono stati installati e testati per davvero (incluso uno scambio
   BitTorrent peer-to-peer reale via loopback). Il File Manager, essendo
   codice proprietario su filesystem reale, è sempre testato per davvero.
2. **Quando un backend esterno non è avviabile** (Jellyfin, Immich), si
   costruisce uno stub HTTP minimale che replica fedelmente le risposte
   documentate dell'API reale, e si verifica la nostra integrazione contro
   quello stub (autenticazione, mapping, proxy binari con supporto Range,
   gestione errori/degrado). Questo NON sostituisce una verifica contro
   l'istanza reale.
3. **Dichiarare sempre la limitazione esplicitamente** (in `README.md`,
   sezione "Limitazione nota") quando una parte del sistema non è stata
   validata contro un servizio reale, così l'utente sa cosa verificare
   prima del deploy sul Wyse.
4. **Attenzione ai processi zombie nei test manuali**: in questo ambiente
   `pkill -f "<pattern>"` può auto-colpire il wrapper di shell che sta
   eseguendo il comando stesso se il pattern compare nella sua command
   line, terminando lo script a metà senza errore visibile. Preferire
   `fuser -k <porta>/tcp` per liberare una porta, o `nohup ... & disown`
   per processi di test che devono sopravvivere a comandi successivi.

## Convenzioni di commit

Un commit per fase/funzionalità completata, corpo del messaggio in
italiano che spiega COSA e PERCHÉ (non un changelog riga per riga),
sezione finale con cosa è stato verificato e come. Vedi la cronologia git
per lo stile esatto.

## Prossimi passi

Vedi la checklist in `docs/SPECIFICHE.md` per lo stato aggiornato
fase per fase.
