import { AUTO_LOCK_OPTIONS, CLIPBOARD_TIMEOUTS, DATABASE_SCHEMA_VERSION, CRYPTO_FORMAT_VERSION, VAULT_FORMAT_VERSION, TRASH_RETENTION } from "@deepkey/config";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "@deepkey/types";
import { inspectBackup } from "@deepkey/vault-core";
import { scorePassword } from "@deepkey/validation";
import { useEffect, useState } from "react";
import { Button, Checkbox, Field, Input, Select } from "../components/controls.js";
import { SupportButton } from "../components/SupportButton.js";
import { Dialog, useToast } from "../components/feedback.js";
import { t } from "../i18n/index.js";
import { formatDate, initials } from "../lib/format.js";
import { usePlatform } from "../platform/context.js";
import { useVault } from "../state/vault.js";

type Category =
  | "general"
  | "appearance"
  | "security"
  | "clipboard"
  | "vault"
  | "backup"
  | "web"
  | "desktop"
  | "advanced"
  | "about"
  | "shortcuts";

export function SettingsScreen({ initial = "general" }: { initial?: Category }) {
  const { settings, saveSettings, engine, lock } = useVault();
  const platform = usePlatform();
  const toast = useToast();
  const [cat, setCat] = useState<Category>(initial);
  const [dbPath, setDbPath] = useState("");
  const [currentPw, setCurrentPw] = useState("");
  const [nextPw, setNextPw] = useState("");
  const [loginCurrent, setLoginCurrent] = useState("");
  const [loginNext, setLoginNext] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmPw, setConfirmPw] = useState("");

  useEffect(() => {
    platform.storage.getDbPath().then(setDbPath);
  }, [platform]);

  const cats: { id: Category; label: string; hide?: boolean }[] = [
    { id: "general", label: t("general") },
    { id: "appearance", label: t("appearance") },
    { id: "security", label: t("security") },
    { id: "clipboard", label: t("clipboard") },
    { id: "vault", label: t("vault") },
    { id: "backup", label: t("backup") },
    { id: "web", label: t("webAccount"), hide: platform.kind !== "web" },
    { id: "desktop", label: t("desktop"), hide: platform.kind !== "desktop" },
    { id: "advanced", label: t("advanced") },
    { id: "shortcuts", label: t("shortcuts") },
    { id: "about", label: t("about") },
  ];

  function patch(next: AppSettings) {
    return saveSettings(next);
  }

  return (
    <div>
      <h1 className="page-title">{t("settings")}</h1>
      <div className="settings-layout" style={{ marginTop: 24 }}>
        <nav className="settings-nav">
          {cats
            .filter((c) => !c.hide)
            .map((c) => (
              <button key={c.id} type="button" className={cat === c.id ? "active" : ""} onClick={() => setCat(c.id)}>
                {c.label}
              </button>
            ))}
        </nav>
        <div>
          {cat === "general" ? (
            <>
              <Field label={t("language")}>
                <Select
                  value={settings.ui.locale}
                  onChange={(e) => patch({ ...settings, ui: { ...settings.ui, locale: e.target.value as "en" | "pt-BR" } })}
                >
                  <option value="en">English</option>
                  <option value="pt-BR">Português (Brasil)</option>
                </Select>
              </Field>
              <Field label={t("defaultProject")}>
                <Select
                  value={settings.ui.defaultProjectId ?? ""}
                  onChange={(e) => patch({ ...settings, ui: { ...settings.ui, defaultProjectId: e.target.value || null } })}
                >
                  <option value="">{t("none")}</option>
                  {engine.projects().map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("defaultEnvironment")}>
                <Select
                  value={settings.ui.defaultEnvironmentId ?? ""}
                  onChange={(e) => patch({ ...settings, ui: { ...settings.ui, defaultEnvironmentId: e.target.value || null } })}
                >
                  <option value="">{t("none")}</option>
                  {engine.environments(settings.ui.defaultProjectId ?? undefined).map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          ) : null}

          {cat === "appearance" ? (
            <>
              <Field label={t("theme")}>
                <Select value={settings.ui.theme} onChange={(e) => patch({ ...settings, ui: { ...settings.ui, theme: e.target.value as "dark" | "light" } })}>
                  <option value="dark">{t("dark")}</option>
                  <option value="light">{t("light")}</option>
                </Select>
              </Field>
              <Field label={t("density")}>
                <Select
                  value={settings.ui.density}
                  onChange={(e) => patch({ ...settings, ui: { ...settings.ui, density: e.target.value as "comfortable" | "compact" } })}
                >
                  <option value="comfortable">{t("comfortable")}</option>
                  <option value="compact">{t("compact")}</option>
                </Select>
              </Field>
              <Field label={t("sidebar")}>
                <Select
                  value={settings.ui.sidebar}
                  onChange={(e) => patch({ ...settings, ui: { ...settings.ui, sidebar: e.target.value as "expanded" | "collapsed" } })}
                >
                  <option value="expanded">{t("expanded")}</option>
                  <option value="collapsed">{t("collapsed")}</option>
                </Select>
              </Field>
              <Checkbox
                checked={settings.ui.rememberSidebar}
                onChange={(v) => patch({ ...settings, ui: { ...settings.ui, rememberSidebar: v } })}
                label={t("remember")}
              />
            </>
          ) : null}

          {cat === "security" ? (
            <>
              <Field label={t("autoLock")}>
                <Select
                  value={String(settings.security.autoLockMs)}
                  onChange={(e) => patch({ ...settings, security: { ...settings.security, autoLockMs: Number(e.target.value) } })}
                >
                  {AUTO_LOCK_OPTIONS.map((o) => (
                    <option key={o.id} value={o.ms}>
                      {o.id === "never" ? t("never") : o.id === "immediate" ? t("immediately") : o.id}
                    </option>
                  ))}
                </Select>
              </Field>
              <Checkbox checked={settings.security.lockOnSleep} onChange={(v) => patch({ ...settings, security: { ...settings.security, lockOnSleep: v } })} label={t("lockOnSleep")} />
              <Checkbox checked={settings.security.lockOnDesktopLock} onChange={(v) => patch({ ...settings, security: { ...settings.security, lockOnDesktopLock: v } })} label="Lock when the desktop locks" />
              <Checkbox checked={settings.security.lockOnExit} onChange={(v) => patch({ ...settings, security: { ...settings.security, lockOnExit: v } })} label="Lock when DeepKey exits" />
              <Checkbox checked={settings.security.lockOnBackground} onChange={(v) => patch({ ...settings, security: { ...settings.security, lockOnBackground: v } })} label={t("lockOnBackground")} />
              <Checkbox checked={settings.security.privacyMode} onChange={(v) => patch({ ...settings, security: { ...settings.security, privacyMode: v } })} label={t("privacyMode")} />
              {platform.kind === "desktop" ? (
                <Checkbox checked={settings.security.contentProtection} onChange={(v) => patch({ ...settings, security: { ...settings.security, contentProtection: v } })} label={t("contentProtection")} />
              ) : null}
              <Checkbox checked={settings.security.requirePasswordForExport} onChange={(v) => patch({ ...settings, security: { ...settings.security, requirePasswordForExport: v } })} label={t("requirePassword")} />
              <Checkbox checked={settings.security.notifyExpiring} onChange={(v) => patch({ ...settings, security: { ...settings.security, notifyExpiring: v } })} label={t("notifyExpiring")} />
              {settings.security.notifyExpiring ? (
                <Checkbox
                  checked={settings.security.allowSecretNamesInNotifications}
                  onChange={(v) => patch({ ...settings, security: { ...settings.security, allowSecretNamesInNotifications: v } })}
                  label={t("allowNamesInNotifications")}
                />
              ) : null}
              {platform.osUnlock ? (
                <Checkbox
                  checked={settings.security.osUnlockEnabled}
                  onChange={async (v) => {
                    await patch({ ...settings, security: { ...settings.security, osUnlockEnabled: v } });
                    if (!v) await platform.osUnlock?.clear();
                  }}
                  label={t("osUnlock")}
                />
              ) : null}
              <Field label={t("revealTimeout")}>
                <Select
                  value={String(settings.security.revealMs)}
                  onChange={(e) => patch({ ...settings, security: { ...settings.security, revealMs: Number(e.target.value) } })}
                >
                  <option value="5000">5s</option>
                  <option value="15000">15s</option>
                  <option value="30000">30s</option>
                  <option value="60000">60s</option>
                </Select>
              </Field>
              <p className="hint">{t("privacyNote")}</p>
            </>
          ) : null}

          {cat === "clipboard" ? (
            <>
              <Field label={t("clipboardClear")}>
                <Select
                  value={String(settings.security.clipboardTimeoutMs)}
                  onChange={(e) => patch({ ...settings, security: { ...settings.security, clipboardTimeoutMs: Number(e.target.value) } })}
                >
                  {CLIPBOARD_TIMEOUTS.map((o) => (
                    <option key={o.id} value={o.ms}>
                      {o.id === "never" ? t("never") : o.id}
                    </option>
                  ))}
                </Select>
              </Field>
              {!platform.clipboard.supportsClear ? <p className="hint">{t("clipboardWebNote")}</p> : null}
            </>
          ) : null}

          {cat === "vault" ? (
            <>
              <Field label={t("historyLimit")}>
                <Select
                  value={String(settings.security.historyLimit)}
                  onChange={(e) => patch({ ...settings, security: { ...settings.security, historyLimit: Number(e.target.value) } })}
                >
                  <option value="25">25</option>
                  <option value="50">50</option>
                </Select>
              </Field>
              <Field label={t("trashRetention")}>
                <Select
                  value={String(settings.security.trashRetentionDays)}
                  onChange={(e) => patch({ ...settings, security: { ...settings.security, trashRetentionDays: Number(e.target.value) } })}
                >
                  {TRASH_RETENTION.map((o) => (
                    <option key={o.id} value={o.days}>
                      {o.id === "never" ? t("never") : o.id}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("maxAttachment")}>
                <Select
                  value={String(settings.security.maxAttachmentBytes)}
                  onChange={(e) => patch({ ...settings, security: { ...settings.security, maxAttachmentBytes: Number(e.target.value) } })}
                >
                  <option value={1048576}>1 MB</option>
                  <option value={5242880}>5 MB</option>
                  <option value={10485760}>10 MB</option>
                </Select>
              </Field>
              <h2 className="section-title">{t("changeMaster")}</h2>
              <Field label={t("currentPassword")}>
                <Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
              </Field>
              <Field label={t("newPassword")}>
                <Input type="password" value={nextPw} onChange={(e) => setNextPw(e.target.value)} />
              </Field>
              <p className="hint">{scorePassword(nextPw).label}</p>
              <Button
                disabled={currentPw.length < 12 || nextPw.length < 12}
                onClick={async () => {
                  await engine.changeMasterPassword(currentPw, nextPw);
                  setCurrentPw("");
                  setNextPw("");
                  toast(t("saved"));
                }}
              >
                {t("changeMaster")}
              </Button>
            </>
          ) : null}

          {cat === "backup" ? (
            <>
              <Checkbox
                checked={settings.backup.autoBackup}
                onChange={(v) => patch({ ...settings, backup: { ...settings.backup, autoBackup: v } })}
                label={t("autoBackup")}
              />
              {settings.backup.autoBackup ? (
                <Field label={t("autoBackupHours")}>
                  <Select
                    value={String(settings.backup.autoBackupHours)}
                    onChange={(e) => patch({ ...settings, backup: { ...settings.backup, autoBackupHours: Number(e.target.value) } })}
                  >
                    <option value="6">{t("hours6")}</option>
                    <option value="12">{t("hours12")}</option>
                    <option value="24">{t("hours24")}</option>
                    <option value="48">{t("hours48")}</option>
                    <option value="168">{t("hoursWeekly")}</option>
                  </Select>
                </Field>
              ) : null}
              {platform.kind === "desktop" && platform.desktop?.pickBackupDir ? (
                <Field label={t("autoBackupFolder")}>
                  <Input readOnly value={settings.backup.autoBackupDir ?? ""} placeholder={t("chooseFolder")} />
                  <div className="split" style={{ marginTop: 8 }}>
                    <Button
                      onClick={async () => {
                        const dir = await platform.desktop?.pickBackupDir?.();
                        if (dir) await patch({ ...settings, backup: { ...settings.backup, autoBackupDir: dir } });
                      }}
                    >
                      {t("chooseFolder")}
                    </Button>
                  </div>
                </Field>
              ) : null}
              <p className="hint">
                {t("lastBackup")}: {settings.backup.lastBackupAt ? formatDate(settings.backup.lastBackupAt) : t("neverBackedUp")}
              </p>
              <div className="split" style={{ marginTop: 16 }}>
                <Button
                  variant="primary"
                  onClick={async () => {
                    const backup = await engine.exportBackup();
                    const bytes = new TextEncoder().encode(JSON.stringify(backup));
                    await platform.files.save("vault.deepkeyvault", bytes, "application/json");
                    await patch({ ...settings, backup: { ...settings.backup, lastBackupAt: Date.now() } });
                    toast(t("backupCreated"));
                  }}
                >
                  {t("exportBackup")}
                </Button>
                <Button
                  onClick={async () => {
                    const file = await platform.files.open([{ name: "DeepKey vault", extensions: ["deepkeyvault", "json"] }]);
                    if (!file) return;
                    const json = JSON.parse(new TextDecoder().decode(file.bytes));
                    await engine.importBackup(json);
                    toast(t("imported"));
                    lock();
                  }}
                >
                  {t("importBackup")}
                </Button>
                <Button
                  onClick={async () => {
                    const file = await platform.files.open([{ name: "DeepKey vault", extensions: ["deepkeyvault", "json"] }]);
                    if (!file) return;
                    try {
                      inspectBackup(JSON.parse(new TextDecoder().decode(file.bytes)));
                      toast(t("backupValid"));
                    } catch {
                      toast(t("backupInvalid"));
                    }
                  }}
                >
                  {t("verifyBackup")}
                </Button>
              </div>
              <p className="hint" style={{ marginTop: 12 }}>
                {t("noRecovery")}
              </p>
            </>
          ) : null}

          {cat === "web" && platform.kind === "web" ? (
            <>
              <p className="hint">{t("authSub")}</p>
              {platform.auth?.changePassword ? (
                <>
                  <h2 className="section-title">{t("changeLoginPassword")}</h2>
                  <Field label={t("currentLoginPassword")}>
                    <Input type="password" value={loginCurrent} onChange={(e) => setLoginCurrent(e.target.value)} />
                  </Field>
                  <Field label={t("newLoginPassword")}>
                    <Input type="password" value={loginNext} onChange={(e) => setLoginNext(e.target.value)} />
                  </Field>
                  <Button
                    disabled={loginCurrent.length < 10 || loginNext.length < 10}
                    onClick={async () => {
                      try {
                        await platform.auth?.changePassword?.(loginCurrent, loginNext);
                        setLoginCurrent("");
                        setLoginNext("");
                        toast(t("loginPasswordChanged"));
                      } catch {
                        toast(t("wrongLoginPassword"));
                      }
                    }}
                  >
                    {t("changeLoginPassword")}
                  </Button>
                </>
              ) : null}
              <Button
                style={{ marginTop: 16 }}
                onClick={async () => {
                  await platform.auth?.logout();
                  window.location.reload();
                }}
              >
                {t("signOut")}
              </Button>
            </>
          ) : null}

          {cat === "desktop" && platform.kind === "desktop" ? (
            <>
              <Checkbox checked={settings.ui.launchAtStartup} onChange={(v) => patch({ ...settings, ui: { ...settings.ui, launchAtStartup: v } })} label={t("launchAtStartup")} />
              <Checkbox checked={settings.ui.trayEnabled} onChange={(v) => patch({ ...settings, ui: { ...settings.ui, trayEnabled: v } })} label={t("tray")} />
              <Checkbox
                checked={settings.ui.globalShortcutEnabled}
                onChange={(v) => patch({ ...settings, ui: { ...settings.ui, globalShortcutEnabled: v } })}
                label={t("globalShortcut")}
              />
              <p className="hint">{t("globalShortcutHint")}</p>
            </>
          ) : null}

          {cat === "advanced" ? (
            <>
              <Field label={t("databaseLocation")}>
                <Input readOnly value={dbPath} />
              </Field>
              <p className="hint">
                {t("diagnostics")}: format {VAULT_FORMAT_VERSION} · crypto {CRYPTO_FORMAT_VERSION} · db {DATABASE_SCHEMA_VERSION}
              </p>
              <Button
                onClick={async () => {
                  await patch(DEFAULT_APP_SETTINGS);
                  toast(t("saved"));
                }}
              >
                {t("resetUi")}
              </Button>
              <div className="danger-zone" style={{ marginTop: 28 }}>
                <h2 className="section-title">{t("dangerZone")}</h2>
                <p className="hint">{t("deleteVaultSub")}</p>
                <Button variant="danger" onClick={() => setDeleteOpen(true)}>
                  {t("deleteVault")}
                </Button>
              </div>
            </>
          ) : null}

          {cat === "shortcuts" ? (
            <div className="list">
              {[
                ["Ctrl/Cmd + K", t("search")],
                [t("shortcutGlobal"), t("globalShortcut")],
                ["Ctrl/Cmd + N", t("newSecret")],
                ["Ctrl/Cmd + Shift + N", t("newProject")],
                ["Ctrl/Cmd + L", t("lockVault")],
                ["Ctrl/Cmd + ,", t("settings")],
                [t("shortcutCopy"), t("copyValue")],
                ["Esc", t("close")],
              ].map(([k, v]) => (
                <div key={k} className="list-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <span>{k}</span>
                  <span className="cell-muted">{v}</span>
                </div>
              ))}
            </div>
          ) : null}

          {cat === "about" ? <AboutBody /> : null}
        </div>
      </div>
      {deleteOpen ? (
        <div className="dialog-backdrop">
          <div className="dialog">
            <h2>{t("deleteVault")}</h2>
            <p>{t("deleteVaultSub")}</p>
            <Field label={t("masterPassword")}>
              <Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
            </Field>
            <div className="dialog-actions">
              <Button onClick={() => setDeleteOpen(false)}>{t("cancel")}</Button>
              <button
                type="button"
                className="btn danger-solid"
                onClick={async () => {
                  await engine.wipe(confirmPw);
                  window.location.reload();
                }}
              >
                {t("deleteVault")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AboutBody() {
  const platform = usePlatform();
  return (
    <div>
      <h2 className="section-title brand-word">deepkey</h2>
      <p className="hint">
        {t("version")} {platform.appVersion}
        <br />
        {t("formatVersion")} {VAULT_FORMAT_VERSION}
        <br />
        {t("cryptoVersion")} {CRYPTO_FORMAT_VERSION}
        <br />
        {t("dbVersion")} {DATABASE_SCHEMA_VERSION}
        <br />
        {t("platform")} {platform.kind} / {platform.os}
      </p>
      <p className="hint" style={{ marginTop: 16 }}>
        {t("threatNote")}
      </p>
      <p className="hint">{t("noRecovery")}</p>
      <p className="hint">{t("licensesBody")}</p>
      {platform.kind === "desktop" ? <p className="hint">{t("checkUpdates")}</p> : null}
      <div style={{ marginTop: 20 }}>
        <SupportButton variant="about" />
      </div>
    </div>
  );
}

export function AboutScreen() {
  return (
    <div>
      <h1 className="page-title">{t("about")}</h1>
      <div style={{ marginTop: 24 }}>
        <AboutBody />
      </div>
    </div>
  );
}

export function ProfileScreen() {
  const { engine, refresh, tick } = useVault();
  void tick;
  const profile = engine.profile();
  const [name, setName] = useState(profile?.displayName ?? "");
  const toast = useToast();
  const platform = usePlatform();
  if (!profile) return null;
  return (
    <div style={{ maxWidth: 480 }}>
      <h1 className="page-title">{t("profile")}</h1>
      <div className="avatar" style={{ width: 64, height: 64, margin: "20px 0", fontSize: 20 }}>
        {profile.avatarDataUrl ? <img src={profile.avatarDataUrl} alt="" /> : initials(name || "DK")}
      </div>
      <Button
        onClick={async () => {
          const file = await platform.files.open([{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }]);
          if (!file) return;
          const b64 = btoa(String.fromCharCode(...file.bytes.slice(0, 200_000)));
          const mime = file.mime || "image/png";
          await engine.saveProfile({ ...profile, avatarDataUrl: `data:${mime};base64,${b64}` });
          refresh();
        }}
      >
        Avatar
      </Button>
      <Field label={t("displayName")}>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t("language")}>
        <Select
          value={profile.locale}
          onChange={async (e) => {
            await engine.saveProfile({ ...profile, locale: e.target.value as "en" | "pt-BR" });
            refresh();
          }}
        >
          <option value="en">English</option>
          <option value="pt-BR">Português (Brasil)</option>
        </Select>
      </Field>
      <Button
        variant="primary"
        onClick={async () => {
          await engine.saveProfile({ ...profile, displayName: name.trim() });
          refresh();
          toast(t("saved"));
        }}
      >
        {t("save")}
      </Button>
    </div>
  );
}

export function SecurityScreen() {
  const { settings } = useVault();
  return (
    <div>
      <h1 className="page-title">{t("security")}</h1>
      <div className="cards" style={{ marginTop: 24 }}>
        <div className="card">
          <div className="card-label">{t("autoLock")}</div>
          <div className="card-value" style={{ fontSize: 22 }}>
            {settings.security.autoLockMs < 0 ? t("never") : settings.security.autoLockMs === 0 ? t("immediately") : `${settings.security.autoLockMs / 60000}m`}
          </div>
        </div>
        <div className="card">
          <div className="card-label">{t("privacyMode")}</div>
          <div className="card-value" style={{ fontSize: 22 }}>
            {settings.security.privacyMode ? "On" : "Off"}
          </div>
        </div>
        <div className="card">
          <div className="card-label">{t("clipboardClear")}</div>
          <div className="card-value" style={{ fontSize: 22 }}>
            {settings.security.clipboardTimeoutMs ? `${settings.security.clipboardTimeoutMs / 1000}s` : t("never")}
          </div>
        </div>
      </div>
      <p className="hint">{t("threatNote")}</p>
    </div>
  );
}

void Dialog;
