import { useEffect, useState } from "react";
import {
  api,
  ApiError,
  type DiskInfo,
  type LocalNetworkInfo,
  type ServiceStatus,
  type SetupStorageResult,
  type WifiNetwork,
  type WifiStatus,
} from "../api/client";
import { formatBytes } from "../lib/format";

const STEP_LABELS = ["Rete", "Utenti", "Storage", "Librerie", "Impostazioni"];

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
  color: "var(--text)",
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 20px",
  borderRadius: "var(--radius-sm)",
  border: "none",
  background: "var(--accent)",
  color: "white",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 20px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text-muted)",
  fontSize: 14,
  cursor: "pointer",
};

function WizardCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: 480,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: 24,
      }}
    >
      {children}
    </div>
  );
}

function NetworkStep({ onNext }: { onNext: () => void }) {
  const [info, setInfo] = useState<LocalNetworkInfo | null>(null);
  const [wifiStatus, setWifiStatus] = useState<WifiStatus | null>(null);
  const [networks, setNetworks] = useState<WifiNetwork[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [selectedSsid, setSelectedSsid] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.getNetworkInfo().then(setInfo).catch(() => {});
    api.getSetupWifiStatus().then(setWifiStatus).catch(() => {});
  }, []);

  async function handleScan() {
    setScanning(true);
    try {
      const res = await api.scanSetupWifi();
      setNetworks(res.networks);
    } catch {
      setMessage("Scansione non riuscita.");
    } finally {
      setScanning(false);
    }
  }

  async function handleConnect(ssid: string) {
    setConnecting(true);
    try {
      await api.connectSetupWifi(ssid, password || null);
      setMessage(`Connesso a "${ssid}".`);
      api.getSetupWifiStatus().then(setWifiStatus).catch(() => {});
    } catch {
      setMessage("Connessione non riuscita.");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>Rete</h2>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 16px" }}>
        L'Hub è già raggiungibile se collegato via cavo Ethernet. Configura il Wi-Fi solo se necessario.
      </p>

      {info && info.ips.length > 0 && (
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 12px" }}>
          Connesso: IP {info.ips.join(", ")}
          {info.mdnsUrl && (
            <>
              {" "}
              — raggiungibile anche su <strong>{info.mdnsUrl}</strong>
            </>
          )}
        </p>
      )}

      {wifiStatus && !wifiStatus.available && (
        <p style={{ fontSize: 13, color: "var(--text-faint)", margin: "0 0 16px" }}>
          Gestione Wi-Fi non disponibile su questo sistema (richiede NetworkManager) — salta questo passaggio se sei
          già collegato via cavo.
        </p>
      )}

      {wifiStatus?.available && (
        <>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {wifiStatus.connectedSsid ? `Wi-Fi connesso: "${wifiStatus.connectedSsid}".` : "Wi-Fi non connesso."}
          </p>
          <button onClick={handleScan} disabled={scanning} style={{ ...secondaryButtonStyle, marginBottom: 10 }}>
            {scanning ? "Scansione…" : "Cerca reti Wi-Fi"}
          </button>
          {message && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{message}</p>}
          {networks?.map((n) => (
            <div key={n.ssid} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setSelectedSsid(selectedSsid === n.ssid ? null : n.ssid)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                <span>
                  {n.ssid} {n.secured ? "🔒" : ""}
                </span>
                <span style={{ color: "var(--text-faint)" }}>{n.signal}%</span>
              </div>
              {selectedSsid === n.ssid && (
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  {n.secured && (
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      style={inputStyle}
                    />
                  )}
                  <button onClick={() => handleConnect(n.ssid)} disabled={connecting} style={primaryButtonStyle}>
                    Connetti
                  </button>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
        <button onClick={onNext} style={primaryButtonStyle}>
          Avanti
        </button>
      </div>
    </div>
  );
}

function UsersStep({ onNext }: { onNext: () => void }) {
  const [adminCreated, setAdminCreated] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [addSecond, setAddSecond] = useState(false);
  const [username2, setUsername2] = useState("");
  const [displayName2, setDisplayName2] = useState("");

  async function handleCreateAdmin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("La password deve avere almeno 8 caratteri.");
    setBusy(true);
    try {
      await api.createSetupAdmin({ username, displayName: displayName || username, password });
      setAdminCreated(true);
    } catch (err) {
      setError(err instanceof ApiError ? "Creazione utente non riuscita (username già in uso?)." : "Errore imprevisto.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateSecondAndContinue() {
    setBusy(true);
    setError(null);
    try {
      if (addSecond && username2) {
        await api.createSetupUser({ username: username2, displayName: displayName2 || username2, password: null });
      }
      onNext();
    } catch {
      setError("Creazione del secondo utente non riuscita.");
    } finally {
      setBusy(false);
    }
  }

  if (!adminCreated) {
    return (
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>Crea il tuo account</h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 16px" }}>
          Questo account avrà i permessi di amministratore dell'Hub (es. avviare un backup, configurare il Wi-Fi).
        </p>
        <form onSubmit={handleCreateAdmin} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Nome utente (es. mario)"
            style={inputStyle}
          />
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Nome visualizzato (es. Mario)"
            style={inputStyle}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (almeno 8 caratteri)"
            style={inputStyle}
          />
          {error && <p style={{ color: "var(--status-problem)", fontSize: 13, margin: 0 }}>{error}</p>}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="submit" disabled={busy || !username || !password} style={primaryButtonStyle}>
              Crea account
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>Un secondo utente?</h2>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 16px" }}>
        Facoltativo — puoi aggiungerne altri in qualsiasi momento più avanti.
      </p>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 12 }}>
        <input type="checkbox" checked={addSecond} onChange={(e) => setAddSecond(e.target.checked)} />
        Aggiungi un secondo utente ora
      </label>

      {addSecond && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
          <input
            value={username2}
            onChange={(e) => setUsername2(e.target.value)}
            placeholder="Nome utente"
            style={inputStyle}
          />
          <input
            value={displayName2}
            onChange={(e) => setDisplayName2(e.target.value)}
            placeholder="Nome visualizzato"
            style={inputStyle}
          />
        </div>
      )}

      {error && <p style={{ color: "var(--status-problem)", fontSize: 13 }}>{error}</p>}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={handleCreateSecondAndContinue} disabled={busy} style={primaryButtonStyle}>
          Avanti
        </button>
      </div>
    </div>
  );
}

function StorageStep({ onNext }: { onNext: () => void }) {
  const [disks, setDisks] = useState<DiskInfo[] | null>(null);
  const [result, setResult] = useState<SetupStorageResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getSetupStorage().then((r) => setDisks(r.disks)).catch(() => {});
  }, []);

  async function handleInit() {
    setBusy(true);
    try {
      setResult(await api.initSetupStorage());
    } catch {
      // il disco dati potrebbe non essere ancora scrivibile: si può comunque proseguire,
      // la struttura verrà ricreata automaticamente al primo utilizzo
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>Storage</h2>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 16px" }}>
        Verifica del disco dati e creazione delle cartelle per Film/Serie, Foto, Giochi, File e Download.
      </p>

      {disks?.map((d) => (
        <div key={d.id} style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>
          {d.label}: {d.connected ? `${formatBytes(d.freeBytes)} liberi su ${formatBytes(d.totalBytes)}` : "non disponibile"}
        </div>
      ))}

      <button onClick={handleInit} disabled={busy} style={{ ...secondaryButtonStyle, marginTop: 8, marginBottom: 12 }}>
        {busy ? "Creazione…" : "Crea struttura cartelle"}
      </button>

      {result && (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {result.created.length > 0 && <>Create: {result.created.join(", ")}. </>}
          {result.alreadyExisted.length > 0 && <>Già presenti: {result.alreadyExisted.join(", ")}.</>}
        </p>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <button onClick={onNext} style={primaryButtonStyle}>
          Avanti
        </button>
      </div>
    </div>
  );
}

function LibrariesStep({ onNext }: { onNext: () => void }) {
  const [services, setServices] = useState<ServiceStatus[] | null>(null);

  useEffect(() => {
    api.getSetupLibraries().then((r) => setServices(r.services)).catch(() => {});
  }, []);

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>Librerie multimediali</h2>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 16px" }}>
        Film/Serie (Jellyfin) e Foto (Immich) sono servizi opzionali, configurabili anche in un secondo momento.
      </p>

      {services?.map((s) => (
        <div
          key={s.name}
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "10px 14px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
            fontSize: 13,
            marginBottom: 6,
            textTransform: "capitalize",
          }}
        >
          <span>{s.name}</span>
          <span style={{ color: "var(--text-muted)" }}>
            {!s.configured ? "Non configurato" : s.reachable ? "Raggiungibile" : "Non disponibile"}
          </span>
        </div>
      ))}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <button onClick={onNext} style={primaryButtonStyle}>
          Avanti
        </button>
      </div>
    </div>
  );
}

function SettingsStep({ onComplete }: { onComplete: () => void }) {
  const [hubName, setHubName] = useState("Home Hub");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleComplete() {
    setBusy(true);
    setError(null);
    try {
      await api.saveSetupSettings(hubName || "Home Hub");
      await api.completeSetup();
      onComplete();
    } catch {
      setError("Impossibile completare il setup. Riprova.");
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>Impostazioni principali</h2>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 16px" }}>
        Come vuoi chiamare il tuo Hub? Comparirà nella barra laterale della Web App.
      </p>
      <input value={hubName} onChange={(e) => setHubName(e.target.value)} placeholder="Home Hub" style={inputStyle} />

      {error && <p style={{ color: "var(--status-problem)", fontSize: 13, marginTop: 10 }}>{error}</p>}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
        <button onClick={handleComplete} disabled={busy} style={primaryButtonStyle}>
          {busy ? "Completamento…" : "Completa configurazione"}
        </button>
      </div>
    </div>
  );
}

export function SetupWizard({ onFinished }: { onFinished: () => void }) {
  const [step, setStep] = useState(0);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        padding: 24,
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>Benvenuto nel tuo Home Hub</h1>
        <p style={{ color: "var(--text-muted)", margin: 0, fontSize: 14 }}>
          Passo {step + 1} di {STEP_LABELS.length} — {STEP_LABELS[step]}
        </p>
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        {STEP_LABELS.map((label, i) => (
          <span
            key={label}
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: i <= step ? "var(--accent)" : "var(--border)",
            }}
          />
        ))}
      </div>

      <WizardCard>
        {step === 0 && <NetworkStep onNext={() => setStep(1)} />}
        {step === 1 && <UsersStep onNext={() => setStep(2)} />}
        {step === 2 && <StorageStep onNext={() => setStep(3)} />}
        {step === 3 && <LibrariesStep onNext={() => setStep(4)} />}
        {step === 4 && <SettingsStep onComplete={onFinished} />}
      </WizardCard>
    </div>
  );
}
