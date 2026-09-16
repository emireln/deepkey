import { List } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Navigate, Outlet, useNavigate } from "react-router-dom";
import { CommandPalette } from "../components/CommandPalette.js";
import { Sidebar } from "../components/Sidebar.js";
import { Titlebar } from "../components/Titlebar.js";
import { t } from "../i18n/index.js";
import { useVault } from "../state/vault.js";

export function AppShell() {
  const { settings, saveSettings, blurSensitive, unlocked } = useVault();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(settings.ui.sidebar === "collapsed");
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    setCollapsed(settings.ui.sidebar === "collapsed");
  }, [settings.ui.sidebar]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(true);
      }
      if (meta && e.key.toLowerCase() === "n" && !e.shiftKey) {
        e.preventDefault();
        navigate("/new");
      }
      if (meta && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        navigate("/projects?new=1");
      }
      if (meta && e.key === ",") {
        e.preventDefault();
        navigate("/settings");
      }
      if (e.key === "Escape") setPalette(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  if (!unlocked) return <Navigate to="/lock" replace />;

  return (
    <div className={`shell${settings.security.privacyMode ? " is-private" : ""}${blurSensitive ? " is-blurred" : ""}`}>
      <Titlebar />
      <div className="mobile-bar">
        <button type="button" className="btn icon" aria-label="Menu" onClick={() => setDrawer(true)}>
          <List size={20} />
        </button>
        <strong className="brand-word">{t("app")}</strong>
        <span />
      </div>
      <div className="shell-body">
        <Sidebar
          collapsed={collapsed}
          open={drawer}
          onClose={() => setDrawer(false)}
          onToggle={() => {
            if (window.matchMedia("(max-width: 860px)").matches) return;
            const next = !collapsed;
            setCollapsed(next);
            if (settings.ui.rememberSidebar) {
              saveSettings({ ...settings, ui: { ...settings.ui, sidebar: next ? "collapsed" : "expanded" } });
            }
          }}
        />
        <main className="content">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}
