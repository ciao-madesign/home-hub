# Guida rapida — Usare l'Hub come VPN per navigare con l'IP di casa

Per chi, per esempio, è all'estero e vuole vedere un sito italiano
(streaming, banca, ecc.) come se fosse collegato da casa.

Questa guida presuppone che l'Hub sia già configurato per la VPN da un
admin (vedi `README.md`, sezione "Deploy" → "VPN personale WireGuard").
Se non sai se è già stato fatto, chiedi all'admin dell'Hub.

Serve anche un'app gratuita sul telefono/computer: **WireGuard**
([wireguard.com/install](https://www.wireguard.com/install/)) — la
stessa che usa l'Hub, disponibile per iPhone, Android, Windows, Mac,
Linux.

---

## Parte 1 — Preparazione (da fare una volta sola, con calma, meglio da casa)

1. **Installa l'app WireGuard** sul telefono o computer che userai in
   viaggio.

2. **Apri l'app e crea un tunnel vuoto**:
   - iPhone/Android: tocca "+" → "Crea da zero" (o "Create from
     scratch").
   - Windows/Mac: "Aggiungi tunnel" → "Aggiungi tunnel vuoto".
   - L'app genera da sola una coppia di chiavi (una privata, che resta
     sul tuo dispositivo, e una pubblica). Non devi capire cosa
     significano: ti basta **copiare la chiave pubblica** mostrata a
     schermo.

3. **Apri la Web App dell'Hub** (da casa, sulla rete Wi-Fi, o già
   connesso in altro modo) → **Sistema → VPN personale**.

4. Nel modulo "Aggiungi un dispositivo":
   - **Incolla la chiave pubblica** copiata al passo 2.
   - Dai un nome al dispositivo (es. "Il mio telefono").
   - Scegli il profilo **"Tunnel completo (esci con l'IP di casa)"** —
     è quello che ti serve per navigare come se fossi a casa. (L'altro
     profilo, "Solo Hub", serve solo per raggiungere l'Hub stesso da
     remoto, non per navigare su Internet.)
   - Premi **Aggiungi**.

5. L'Hub ti mostra un riquadro di testo con dei parametri (indirizzo,
   chiave del server, endpoint, ecc.). **Copia tutto quel testo.**

6. Torna nell'app WireGuard, nel tunnel vuoto creato al passo 2, e
   **incolla quel testo** nella sezione di configurazione (di solito
   c'è un pulsante "Modifica" o un'icona a forma di matita sul tunnel).
   Salva.

Fatto — la preparazione è finita. Il tunnel ora compare nell'app
WireGuard con il nome che gli hai dato, spento.

---

## Parte 2 — Quando sei all'estero e vuoi vedere un sito italiano

1. Apri l'app **WireGuard** sul telefono/computer.
2. Trova il tunnel creato in precedenza e **attivalo** (interruttore
   ON).
3. Aspetta qualche secondo: l'app di solito mostra "connesso" e un
   contatore di dati che sale.
4. Apri il **browser normale** (Safari, Chrome, ecc.) e vai sul sito
   italiano che ti interessa. Da questo momento il sito vede l'IP di
   casa tua, non quello del paese in cui ti trovi.
5. **Quando hai finito**, torna nell'app WireGuard e **disattiva** il
   tunnel (interruttore OFF) — altrimenti tutto il traffico di
   quel dispositivo (non solo il browser) continua a passare da casa,
   consumando la tua banda di casa inutilmente.

Non serve rifare la Parte 1 ogni volta: una volta preparato, il tunnel
resta pronto nell'app — attivi/disattivi solo l'interruttore.

---

## Domande frequenti

**"Devo tenerlo acceso sempre?"**
No. Attivalo solo quando ti serve davvero (es. per guardare quel sito),
altrimenti lascialo spento: il traffico normale del telefono è più
veloce senza passare da casa.

**"Funziona se il Wyse di casa è spento?"**
No — l'Hub deve essere acceso e collegato a Internet perché la VPN
funzioni, esattamente come qualunque altro servizio dell'Hub.

**"Il tunnel non si connette, cosa controllo?"**
- Che a casa l'Hub sia acceso e raggiungibile da Internet (chiedi
  all'admin).
- Che tu abbia incollato per intero il testo del passo 5 della Parte 1,
  senza tagliarlo.
- Che la connessione dati/Wi-Fi del dispositivo funzioni (la VPN si
  appoggia comunque a una connessione Internet esistente, non la
  sostituisce).

**"Posso usarlo da più dispositivi contemporaneamente?"**
Sì, ognuno con il proprio tunnel creato separatamente (ripeti la Parte
1 su ogni dispositivo, con un nome diverso al passo 4).

**"Come faccio a revocare un dispositivo che non uso più (es. l'ho
perso o venduto)?"**
Da un altro dispositivo già collegato, o da casa: Sistema → VPN
personale → trova il dispositivo nell'elenco → **Revoca**. Da quel
momento quel dispositivo non potrà più connettersi.

**"Non funziona affatto, nemmeno da casa/con Wi-Fi normale"**
Probabile problema di configurazione lato router/ISP (es. CGNAT, comune
con operatori come EOLO) — è un problema che risolve l'admin dell'Hub,
non tu: contattalo.
