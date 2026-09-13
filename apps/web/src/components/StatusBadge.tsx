import type { SystemStatus } from "../api/client";

const LABELS: Record<SystemStatus["level"], string> = {
  NORMAL: "Normale",
  ATTENTION: "Attenzione",
  PROBLEM: "Problema",
};

const COLORS: Record<SystemStatus["level"], string> = {
  NORMAL: "var(--status-normal)",
  ATTENTION: "var(--status-attention)",
  PROBLEM: "var(--status-problem)",
};

export function StatusBadge({ level }: { level: SystemStatus["level"] | null }) {
  const color = level ? COLORS[level] : "var(--text-faint)";
  const label = level ? LABELS[level] : "—";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        fontSize: 13,
        color: "var(--text-muted)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          boxShadow: level ? `0 0 8px ${color}` : "none",
        }}
      />
      {label}
    </span>
  );
}
