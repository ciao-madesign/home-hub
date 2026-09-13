import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { NAV_ITEMS } from "../nav";
import { IconChevronsLeft, IconChevronsRight } from "./icons";

const COLLAPSE_KEY = "hub.sidebarCollapsed";

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <aside
      style={{
        width: collapsed ? "var(--sidebar-width-collapsed)" : "var(--sidebar-width)",
        transition: "width 160ms ease",
        borderRight: "1px solid var(--border)",
        background: "var(--bg-elevated)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        height: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "18px 16px",
          fontWeight: 700,
          fontSize: 16,
          letterSpacing: 0.2,
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: "linear-gradient(135deg, var(--accent), var(--accent-strong))",
            flexShrink: 0,
          }}
        />
        {!collapsed && <span>Home Hub</span>}
      </div>

      <nav
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          padding: "8px 10px",
          flex: 1,
        }}
      >
        {NAV_ITEMS.map(({ to, label, icon: ItemIcon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 12px",
              borderRadius: "var(--radius-sm)",
              color: isActive ? "var(--text)" : "var(--text-muted)",
              background: isActive ? "var(--bg-hover)" : "transparent",
              fontSize: 14,
              fontWeight: isActive ? 600 : 500,
              whiteSpace: "nowrap",
              overflow: "hidden",
            })}
            title={collapsed ? label : undefined}
          >
            <ItemIcon style={{ flexShrink: 0 }} />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      <button
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? "Espandi sidebar" : "Comprimi sidebar"}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          margin: 10,
          padding: "10px 12px",
          borderRadius: "var(--radius-sm)",
          background: "transparent",
          border: "1px solid var(--border)",
          color: "var(--text-muted)",
          cursor: "pointer",
        }}
      >
        {collapsed ? <IconChevronsRight /> : <IconChevronsLeft />}
        {!collapsed && <span style={{ fontSize: 13 }}>Comprimi</span>}
      </button>
    </aside>
  );
}
