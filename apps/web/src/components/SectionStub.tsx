export function SectionStub({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 8px" }}>{title}</h1>
      <p style={{ color: "var(--text-muted)", maxWidth: 560, lineHeight: 1.5 }}>{description}</p>
      <div
        style={{
          marginTop: 24,
          padding: "40px 24px",
          borderRadius: "var(--radius-lg)",
          border: "1px dashed var(--border)",
          background: "var(--bg-card)",
          textAlign: "center",
          color: "var(--text-faint)",
        }}
      >
        <p style={{ margin: 0, fontSize: 14 }}>
          Sezione non ancora integrata — prevista in <strong>{phase}</strong>.
        </p>
      </div>
    </div>
  );
}
