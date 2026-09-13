# HUB — Specifica V2

## 1. HUB centrale
- Dell Wyse come hardware di riferimento.
- Linux + Docker.
- Interfaccia web locale.
- Gestione servizi, utenti e dispositivi.
- Avvio automatico e gestione dei servizi.

## 2. Storage
- SSD per sistema e applicazioni.
- Storage esterno USB per dati.
- Libreria multimediale.
- Backup e sincronizzazione.

## 3. PC remoto / Execution Node

Il PC remoto mantiene il proprio OS, account e storage. L'HUB deve
supportare:
- Wake-on-LAN;
- verifica stato;
- avvio/gestione applicazioni e giochi;
- spegnimento remoto sicuro;
- utilizzo del PC come nodo computazionale aggiuntivo.

## 4. Remote Gaming
- Sunshine sul PC remoto.
- Moonlight sul Wyse.
- Wyse collegato alla TV tramite HDMI.
- Controller collegato al Wyse via USB/Bluetooth.
- Streaming dei giochi dal PC remoto alla TV.
- Caso d'uso di riferimento: Red Dead Redemption 2.
- Possibile successiva integrazione di RPCS3 per emulazione PS3 sul PC
  remoto.

## 5. Home Entertainment
- Media server.
- Streaming locale.
- Gestione libreria giochi.
- Supporto a emulatori.
- Interfaccia utilizzabile da TV, PC e smartphone.

## 6. Domotica / servizi aggiuntivi

Architettura predisposta per aggiungere successivamente: Home Assistant,
Zigbee/Bluetooth, sensori, telecamere, automazioni, altri servizi Docker.

## 7. Architettura modulare

```
                    ┌───────────────┐
                    │   SMARTPHONE  │
                    └───────┬───────┘
                            │
                     ┌──────▼──────┐
                     │  HUB WYSE   │
                     │             │
                     │ Server      │
                     │ Storage     │
                     │ Moonlight   │
                     │ Controller  │
                     └──┬───────┬──┘
                        │       │
                   HDMI │       │ LAN
                        │       │
                   ┌────▼───┐ ┌─▼────────────┐
                   │   TV   │ │ PC REMOTO    │
                   └────────┘ │ Sunshine     │
                              │ Gaming/Compute│
                              └───────────────┘
```

Principio V2: il Wyse è il centro di controllo e accesso, mentre potenza
computazionale e storage possono essere distribuiti su nodi esterni
sostituibili.
