# Guida — Spostare l'Hub su un altro dispositivo

Per il giorno in cui vorrai spostare tutto (dati compresi) dal Dell Wyse
a un altro PC/mini-PC. Non è un'operazione a rischio se segui l'ordine:
il vecchio dispositivo resta intatto finché non hai verificato che il
nuovo funziona.

**Prima di iniziare**: fai un backup dal vecchio Hub (Storage → "Backup
Now", o aspetta quello automatico) e assicurati che sia "recente e
valido" nella pagina Storage. È il modo più sicuro per portarsi dietro i
dati personali, oltre che un paracadute se qualcosa va storto.

---

## Cosa si sposta facilmente, cosa no

| | |
|---|---|
| **Facile** | Web App, Jellyfin, Immich: già in Docker, `docker compose up` sulla macchina nuova li fa ripartire identici. |
| **Facile** | Dati personali (Files, Foto, Giochi, Download, database Hub): tutti sotto un'unica cartella (`infra/data/`) — è lo stesso formato che il Backup usa già. |
| **Da rifare a mano** | L'Hub API gira **fuori** da Docker, direttamente sul sistema operativo (scelta voluta per il Gaming, vedi `docs/SPECIFICHE.md` §2) — va reinstallata come servizio, non basta un `docker pull`. |
| **Da rifare a mano** | Permessi sudo mirati (spegnimento, aggiornamenti) — file di configurazione di sistema, non dati che si "copiano". |
| **Da ricollegare** | Dispositivi VPN: la chiave del server non si porta dietro, ogni dispositivo va ri-aggiunto (5 minuti a testa, vedi `docs/GUIDA_VPN.md`). |
| **Da aggiornare** | Se l'IP locale del nuovo dispositivo cambia: eventuale porta inoltrata sul router, IP statico/DHCP reservation. |
| **Facoltativo** | Cronologia visioni/riconoscimento volti dentro Jellyfin/Immich stessi (non quella dell'Hub, che è già nel database sopra) — si può portare dietro copiando anche le cartelle dati di quei container, vedi passo 4b sotto. Senza, quei due partono "puliti" e si ri-indicizzano da soli guardando i file. |

---

## Passo 1 — Prepara il nuovo dispositivo

Stessi requisiti del Wyse:

```bash
# Node.js ≥ 20 e Docker (con il plugin "compose")
sudo apt update
sudo apt install -y nodejs npm docker.io docker-compose-plugin git
```

## Passo 2 — Ferma il vecchio Hub in sicurezza

Dal vecchio dispositivo:

```bash
sudo systemctl stop home-hub-api
cd /opt/home-hub/infra && docker compose down
```

(I dati restano tutti su disco, questo comando spegne solo i processi.)

## Passo 3 — Copia il codice e i dati sul nuovo dispositivo

Il codice, da GitHub (più pulito che copiare la cartella intera):

```bash
git clone https://github.com/ciao-madesign/home-hub /opt/home-hub
```

I dati, dal vecchio dispositivo al nuovo (via rete locale — adatta
l'indirizzo IP):

```bash
# Dal NUOVO dispositivo, tira i dati dal vecchio:
rsync -avP --progress vecchio-hub:/opt/home-hub/infra/data/ /opt/home-hub/infra/data/
```

Se preferisci un disco USB invece della rete, va bene lo stesso:
`infra/data/` è una cartella normale, copiala con qualunque metodo.

**In alternativa**, se hai già un backup recente su un secondo disco
(quello prodotto da Storage → "Backup Now"): collega quel disco al
nuovo dispositivo, installa l'Hub seguendo il passo 5 sotto, poi da
Storage → "Ripristina da backup" invece di copiare `infra/data/` a
mano. Copre Files/Foto/Salvataggi giochi/database — non le librerie
Jellyfin (Film/Serie/Musica, considerate rimpiazzabili, vedi §5) e non
le cartelle dati dei container (passo 4b).

## Passo 4 — Configurazione (file `.env`)

Copia anche questi due file dal vecchio dispositivo (contengono le tue
impostazioni: password del DB Immich, eventuali chiavi API Jellyfin/
Immich, dominio DDNS, ecc. — più semplice copiarli che ricompilarli da
zero):

```bash
scp vecchio-hub:/opt/home-hub/apps/api/.env /opt/home-hub/apps/api/.env
scp vecchio-hub:/opt/home-hub/infra/.env /opt/home-hub/infra/.env
```

Controlla che `HUB_DATA_ROOT` e `HUB_DB_PATH` in `apps/api/.env` puntino
a percorsi assoluti dentro `/opt/home-hub/infra/data` (se il vecchio
dispositivo usava lo stesso percorso `/opt/home-hub`, non serve toccare
nulla).

### 4b — Facoltativo: portarsi dietro anche Jellyfin/Immich "com'erano"

Se vuoi evitare che Jellyfin/Immich re-indicizzino tutto da zero
(cronologia di Jellyfin, riconoscimento volti/album di Immich), copia
anche queste due cartelle insieme a `infra/data/` al passo 3:

```bash
infra/data/jellyfin/     # config + cache di Jellyfin
infra/data/immich/       # database Postgres di Immich
```

Senza, non perdi nulla di **tuo** (i file restano, e l'Hub ha comunque
il proprio "Continua a guardare" nel suo database) — solo Jellyfin e
Immich dovranno ri-scansionare le librerie e ri-analizzare le foto la
prima volta, che richiede tempo mano a mano che accedi ai contenuti.

## Passo 5 — Installa l'Hub API sul nuovo dispositivo

Stessa procedura di un'installazione da zero (README "Deploy" §1):

```bash
cd /opt/home-hub
npm install
npm run build -w apps/api

pip install --user yt-dlp
sudo apt install -y smartmontools   # opzionale

sudo useradd --system --home /opt/home-hub --shell /usr/sbin/nologin homehub
sudo chown -R homehub:homehub /opt/home-hub
sudo usermod -aG docker homehub

sudo cp infra/systemd/homehub-shutdown-sudoers /etc/sudoers.d/homehub-shutdown
sudo cp infra/systemd/homehub-update-sudoers /etc/sudoers.d/homehub-update
sudo chmod 440 /etc/sudoers.d/homehub-shutdown /etc/sudoers.d/homehub-update
sudo visudo -c

sudo cp infra/systemd/home-hub-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now home-hub-api
```

Se userai anche la VPN sul nuovo dispositivo, decommenta anche
`AmbientCapabilities` nel file di servizio prima di copiarlo (vedi
`docs/GUIDA_VPN.md`/README "Deploy" §4) — non riesce a portarsi dietro
la vecchia interfaccia comunque, i dispositivi VPN vanno ri-aggiunti.

## Passo 6 — Avvia Web App, Jellyfin, Immich

```bash
cd /opt/home-hub/infra
docker compose up -d --build
```

## Passo 7 — Verifica

- [ ] `http://<ip-nuovo-dispositivo>` mostra la Web App e la schermata
      profili con gli utenti che avevi prima
- [ ] Film/Serie/Foto compaiono (se hai copiato `infra/data/Media` e
      `infra/data/Photos`)
- [ ] Sistema → stato NORMAL, dischi visibili in Storage
- [ ] Storage → "Backup recente e valido" (se avevi un backup configurato)
- [ ] Se usi l'accesso remoto: aggiorna il DDNS/DNS se l'IP pubblico è
      cambiato, e se il router inoltrava porte verso il vecchio
      dispositivo, ripuntale al nuovo
- [ ] Se usi la VPN: ri-aggiungi ogni dispositivo (`docs/GUIDA_VPN.md`)

Solo dopo aver verificato tutto, spegni definitivamente il vecchio
dispositivo (o riusalo per altro) — fino a quel momento i suoi dati
sono ancora lì, intatti, come rete di sicurezza.
