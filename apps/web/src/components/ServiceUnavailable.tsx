export function ServiceUnavailable({ service }: { service: string }) {
  return (
    <div
      style={{
        padding: "40px 24px",
        borderRadius: "var(--radius-lg)",
        border: "1px dashed var(--status-attention)",
        background: "var(--bg-card)",
        textAlign: "center",
        color: "var(--text-muted)",
      }}
    >
      <p style={{ margin: 0, fontSize: 14 }}>
        Servizio <strong style={{ textTransform: "capitalize" }}>{service}</strong> temporaneamente
        non disponibile. Il resto dell'Hub continua a funzionare normalmente.
      </p>
    </div>
  );
}
