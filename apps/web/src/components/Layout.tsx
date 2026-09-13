import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function Layout() {
  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <TopBar />
        <main className="scrollbar-thin" style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
