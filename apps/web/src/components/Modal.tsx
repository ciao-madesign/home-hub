import type { ReactNode } from "react";

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(5, 6, 8, 0.7)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          padding: 20,
        }}
      >
        <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export const modalInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
  color: "var(--text)",
  fontSize: 14,
  boxSizing: "border-box",
};

export const modalButtonRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  marginTop: 18,
};

export const modalSecondaryButtonStyle: React.CSSProperties = {
  padding: "9px 16px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text-muted)",
  fontSize: 14,
  cursor: "pointer",
};

export const modalPrimaryButtonStyle: React.CSSProperties = {
  padding: "9px 18px",
  borderRadius: "var(--radius-sm)",
  border: "none",
  background: "var(--accent)",
  color: "white",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
};

export const modalDangerButtonStyle: React.CSSProperties = {
  ...modalPrimaryButtonStyle,
  background: "var(--status-problem)",
};
