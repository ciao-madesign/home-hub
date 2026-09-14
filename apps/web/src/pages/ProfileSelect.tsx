import { useEffect, useState } from "react";
import { api, ApiError, type LocalNetworkInfo, type Profile } from "../api/client";
import { useProfile } from "../context/ProfileContext";
import { QrCode } from "../components/QrCode";

export function ProfileSelect() {
  const { selectProfile, login } = useProfile();
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [remoteMode, setRemoteMode] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [networkInfo, setNetworkInfo] = useState<LocalNetworkInfo | null>(null);
  const [showDiscovery, setShowDiscovery] = useState(false);

  useEffect(() => {
    api
      .listProfiles()
      .then((res) => setProfiles(res.profiles))
      .catch(() => setError("Impossibile contattare l'Hub API. Verifica la connessione locale."));
    // Endpoint pubblico (§21): mostra IP/.local/QR anche prima del login,
    // per farsi scoprire da un secondo dispositivo sulla stessa LAN.
    api.getNetworkInfo().then(setNetworkInfo).catch(() => {});
  }, []);

  async function onSelect(id: string) {
    setPendingId(id);
    setError(null);
    try {
      await selectProfile(id);
    } catch {
      setError("Selezione profilo non riuscita.");
    } finally {
      setPendingId(null);
    }
  }

  async function onRemoteLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "Credenziali non valide." : "Accesso non riuscito.");
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        padding: 24,
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          aria-hidden
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            margin: "0 auto 16px",
            background: "linear-gradient(135deg, var(--accent), var(--accent-strong))",
          }}
        />
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>Home Hub</h1>
        <p style={{ color: "var(--text-muted)", margin: 0, fontSize: 14 }}>
          {remoteMode ? "Accesso remoto" : "Seleziona il tuo profilo"}
        </p>
      </div>

      {error && <p style={{ color: "var(--status-problem)", fontSize: 13 }}>{error}</p>}

      {!remoteMode && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
          {profiles === null && !error && (
            <p style={{ color: "var(--text-faint)" }}>Caricamento profili…</p>
          )}
          {profiles?.map((profile) => (
            <button
              key={profile.id}
              onClick={() => onSelect(profile.id)}
              disabled={pendingId !== null}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                opacity: pendingId && pendingId !== profile.id ? 0.5 : 1,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  background: profile.avatarColor,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 26,
                  fontWeight: 700,
                  color: "#0a0b0d",
                }}
              >
                {profile.displayName.slice(0, 1).toUpperCase()}
              </span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{profile.displayName}</span>
              {profile.role === "admin" && (
                <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Admin</span>
              )}
            </button>
          ))}
        </div>
      )}

      {remoteMode && (
        <form
          onSubmit={onRemoteLogin}
          style={{ display: "flex", flexDirection: "column", gap: 10, width: 280 }}
        >
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Nome utente"
            style={inputStyle}
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="Password"
            style={inputStyle}
          />
          <button type="submit" style={submitStyle}>
            Accedi
          </button>
        </form>
      )}

      {!remoteMode && networkInfo?.primaryUrl && (
        <>
          <button
            onClick={() => setShowDiscovery((v) => !v)}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-faint)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {showDiscovery ? "Nascondi" : "Connetti da un altro dispositivo"}
          </button>
          {showDiscovery && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <QrCode value={networkInfo.primaryUrl} size={160} />
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)", textAlign: "center" }}>
                Inquadra il QR o apri
                <br />
                <strong>{networkInfo.primaryUrl}</strong>
                {networkInfo.ips.length > 0 && (
                  <>
                    <br />
                    <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
                      IP: {networkInfo.ips.join(", ")}
                    </span>
                  </>
                )}
              </p>
            </div>
          )}
        </>
      )}

      <button
        onClick={() => setRemoteMode((v) => !v)}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--text-faint)",
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        {remoteMode ? "Torna alla selezione profilo (LAN)" : "Accedi da remoto con password"}
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
  color: "var(--text)",
  fontSize: 14,
};

const submitStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: "var(--radius-sm)",
  border: "none",
  background: "var(--accent)",
  color: "white",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
