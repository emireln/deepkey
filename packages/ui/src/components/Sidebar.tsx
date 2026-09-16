import {
  CaretLeft,
  CaretRight,
  FileCode,
  Files,
  Folders,
  Gear,
  Info,
  Key,
  Note,
  Password,
  ShieldCheck,
  SquaresFour,
  Trash,
  Vault,
  X,
} from "@phosphor-icons/react";
import { NavLink, useNavigate } from "react-router-dom";
import { Logo } from "./Logo.js";
import { SupportButton } from "./SupportButton.js";
import { t } from "../i18n/index.js";
import { initials } from "../lib/format.js";
import { useVault } from "../state/vault.js";
import { usePlatform } from "../platform/context.js";
import { useEffect, useRef, useState } from "react";

const PRIMARY = [
  { to: "/overview", key: "overview", icon: SquaresFour },
  { to: "/vault", key: "vault", icon: Vault },
  { to: "/projects", key: "projects", icon: Folders },
  { to: "/env", key: "envFiles", icon: FileCode },
  { to: "/secrets", key: "secrets", icon: Key },
  { to: "/notes", key: "notes", icon: Note },
  { to: "/files", key: "files", icon: Files },
  { to: "/generator", key: "generator", icon: Password },
] as const;

const SECONDARY = [
  { to: "/trash", key: "trash", icon: Trash },
  { to: "/security", key: "security", icon: ShieldCheck },
  { to: "/settings", key: "settings", icon: Gear },
  { to: "/about", key: "about", icon: Info },
] as const;

export function Sidebar({
  collapsed,
  onToggle,
  open,
  onClose,
}: {
  collapsed: boolean;
  onToggle: () => void;
  open: boolean;
  onClose: () => void;
}) {
  const { engine, lock, tick } = useVault();
  void tick;
  const platform = usePlatform();
  const navigate = useNavigate();
  const profile = engine.profile();
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const name = profile?.displayName || engine.vaultHeader?.displayName || "DeepKey";

  return (
    <>
      {open ? <div className="drawer-backdrop" onClick={onClose} /> : null}
      <aside className={`sidebar ${collapsed ? "collapsed" : ""} ${open ? "open" : ""}`}>
        <div className="brand">
          <Logo />
          <span className="brand-word">{t("app")}</span>
          <button
            type="button"
            className="sidebar-toggle"
            aria-label={collapsed ? t("expandSidebar") : t("collapseSidebar")}
            onClick={onToggle}
          >
            {collapsed ? <CaretRight size={18} weight="bold" /> : <CaretLeft size={18} weight="bold" />}
          </button>
          <button type="button" className="sidebar-close" aria-label={t("closeSidebar")} onClick={onClose}>
            <X size={18} weight="bold" />
          </button>
        </div>
        <nav className="nav-group">
          {PRIMARY.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item${isActive ? " active" : ""}`} onClick={onClose} title={t(item.key)}>
              <item.icon className="nav-icon" size={20} weight="bold" />
              <span className="nav-label">{t(item.key)}</span>
            </NavLink>
          ))}
        </nav>
        <div className="nav-sep" />
        <nav className="nav-group">
          {SECONDARY.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item${isActive ? " active" : ""}`} onClick={onClose} title={t(item.key)}>
              <item.icon className="nav-icon" size={20} weight="bold" />
              <span className="nav-label">{t(item.key)}</span>
            </NavLink>
          ))}
        </nav>
        <SupportButton />
        <div className="sidebar-spacer" />
        <div ref={ref} style={{ position: "relative" }}>
          <button type="button" className="profile-btn" onClick={() => setMenu((v) => !v)}>
            <span className="avatar">
              {profile?.avatarDataUrl ? <img src={profile.avatarDataUrl} alt="" /> : initials(name)}
            </span>
            <span className="profile-meta">
              <span className="profile-name">{name}</span>
            </span>
          </button>
          {menu ? (
            <div className="menu" style={{ bottom: 52, left: 8, right: 8 }}>
              <button
                type="button"
                onClick={() => {
                  setMenu(false);
                  onClose();
                  navigate("/profile");
                }}
              >
                {t("profile")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenu(false);
                  onClose();
                  navigate("/settings");
                }}
              >
                {t("settings")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenu(false);
                  lock();
                }}
              >
                {t("lockVault")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenu(false);
                  onClose();
                  navigate("/about");
                }}
              >
                {t("about")}
              </button>
              {platform.kind === "web" && platform.auth ? (
                <button
                  type="button"
                  onClick={async () => {
                    setMenu(false);
                    await platform.auth?.logout();
                    window.location.reload();
                  }}
                >
                  {t("signOut")}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}
