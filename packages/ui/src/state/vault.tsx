import { DEFAULT_APP_SETTINGS, type AppSettings, type VaultItem } from "@deepkey/types";
import { VaultEngine } from "@deepkey/vault-core";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { t } from "../i18n/index.js";
import { setLocale } from "../i18n/index.js";
import { usePlatform } from "../platform/context.js";
import { useToast } from "../components/feedback.js";

interface VaultContextValue {
  engine: VaultEngine;
  unlocked: boolean;
  busy: boolean;
  error: string | null;
  settings: AppSettings;
  hasVault: boolean;
  ready: boolean;
  blurSensitive: boolean;
  refresh: () => void;
  createVault: (password: string, name: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  unlockOs: () => Promise<boolean>;
  lock: () => void;
  saveSettings: (next: AppSettings) => Promise<void>;
  copySecret: (value: string) => Promise<void>;
  tick: number;
}

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const platform = usePlatform();
  const toast = useToast();
  const engineRef = useRef(new VaultEngine(platform.storage));
  const [ready, setReady] = useState(false);
  const [hasVault, setHasVault] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [blurSensitive, setBlurSensitive] = useState(false);
  const copiedRef = useRef<string | null>(null);
  const idleTimer = useRef<number | null>(null);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const raw = await platform.prefs.get("settings");
      if (raw) {
        try {
          const parsed = { ...DEFAULT_APP_SETTINGS, ...JSON.parse(raw) } as AppSettings;
          parsed.ui = { ...DEFAULT_APP_SETTINGS.ui, ...parsed.ui };
          parsed.security = { ...DEFAULT_APP_SETTINGS.security, ...parsed.security };
          parsed.backup = { ...DEFAULT_APP_SETTINGS.backup, ...parsed.backup };
          if (!cancelled) {
            setSettings(parsed);
            setLocale(parsed.ui.locale);
            document.documentElement.dataset.theme = parsed.ui.theme;
            document.documentElement.dataset.density = parsed.ui.density;
            if (platform.desktop) {
              void platform.desktop.setTray(parsed.ui.trayEnabled);
              void platform.desktop.setLaunchAtStartup(parsed.ui.launchAtStartup);
            }
          }
        } catch {
          /* keep defaults */
        }
      } else {
        document.documentElement.dataset.theme = "dark";
        if (platform.desktop) {
          void platform.desktop.setTray(DEFAULT_APP_SETTINGS.ui.trayEnabled);
        }
      }
      const exists = await engineRef.current.hasVault();
      if (!cancelled) {
        setHasVault(exists);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [platform]);

  const saveSettings = useCallback(
    async (next: AppSettings) => {
      setSettings(next);
      setLocale(next.ui.locale);
      document.documentElement.dataset.theme = next.ui.theme;
      document.documentElement.dataset.density = next.ui.density;
      await platform.prefs.set("settings", JSON.stringify(next));
      if (platform.window && next.security.contentProtection) {
        await platform.window.setContentProtection(true);
      } else if (platform.window) {
        await platform.window.setContentProtection(false);
      }
      if (platform.desktop) {
        await platform.desktop.setLaunchAtStartup(next.ui.launchAtStartup);
        await platform.desktop.setTray(next.ui.trayEnabled);
      }
    },
    [platform],
  );

  const lock = useCallback(() => {
    engineRef.current.lock();
    setUnlocked(false);
    setBlurSensitive(false);
    refresh();
  }, [refresh]);

  const createVault = useCallback(
    async (password: string, name: string) => {
      setBusy(true);
      setError(null);
      try {
        await engineRef.current.create(password, name);
        setHasVault(true);
        setUnlocked(true);
        if (settings.security.osUnlockEnabled && platform.osUnlock) {
          const dek = engineRef.current.copyDek();
          if (dek) await platform.osUnlock.storeDek(dek);
        }
        refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errorGeneric"));
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [platform, refresh, settings.security.osUnlockEnabled],
  );

  const unlock = useCallback(
    async (password: string) => {
      setBusy(true);
      setError(null);
      try {
        await engineRef.current.unlock(password);
        setUnlocked(true);
        if (settings.security.osUnlockEnabled && platform.osUnlock) {
          const dek = engineRef.current.copyDek();
          if (dek) await platform.osUnlock.storeDek(dek);
        }
        refresh();
      } catch {
        setError(t("wrongPassword"));
        throw new Error(t("wrongPassword"));
      } finally {
        setBusy(false);
      }
    },
    [platform, refresh, settings.security.osUnlockEnabled],
  );

  const unlockOs = useCallback(async () => {
    if (!platform.osUnlock) return false;
    const dek = await platform.osUnlock.loadDek();
    if (!dek) return false;
    await engineRef.current.unlockWithDek(dek);
    setUnlocked(true);
    refresh();
    return true;
  }, [platform, refresh]);

  const copySecret = useCallback(
    async (value: string) => {
      await platform.clipboard.write(value);
      copiedRef.current = value;
      toast(t("copied"));
      const timeout = settings.security.clipboardTimeoutMs;
      if (timeout > 0 && platform.clipboard.supportsClear) {
        window.setTimeout(async () => {
          if (copiedRef.current !== value) return;
          await platform.clipboard.clearIfUnchanged(value);
        }, timeout);
      }
    },
    [platform, settings.security.clipboardTimeoutMs, toast],
  );

  useEffect(() => {
    const resetIdle = () => {
      if (!unlocked) return;
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      if (settings.security.autoLockMs < 0) return;
      idleTimer.current = window.setTimeout(lock, settings.security.autoLockMs === 0 ? 250 : settings.security.autoLockMs);
    };
    resetIdle();
    const events = ["pointerdown", "keydown"];
    for (const event of events) window.addEventListener(event, resetIdle);
    return () => {
      for (const event of events) window.removeEventListener(event, resetIdle);
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
  }, [lock, settings.security.autoLockMs, unlocked]);

  useEffect(() => {
    if (!platform.window) return;
    const unsubs = [
      platform.window.onBlur(() => {
        if (settings.security.privacyMode) setBlurSensitive(true);
        if (settings.security.lockOnBackground && unlocked) {
          window.setTimeout(() => {
            if (document.hidden || !document.hasFocus()) lock();
          }, 30_000);
        }
      }),
      platform.window.onFocus(() => setBlurSensitive(false)),
      platform.window.onSleep(() => {
        if (settings.security.lockOnSleep) lock();
      }),
      platform.window.onLock(() => {
        if (settings.security.lockOnDesktopLock) lock();
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [lock, platform, settings, unlocked]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "l") {
        e.preventDefault();
        lock();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lock]);

  const value = useMemo<VaultContextValue>(
    () => ({
      engine: engineRef.current,
      unlocked,
      busy,
      error,
      settings,
      hasVault,
      ready,
      blurSensitive,
      refresh,
      createVault,
      unlock,
      unlockOs,
      lock,
      saveSettings,
      copySecret,
      tick,
    }),
    [unlocked, busy, error, settings, hasVault, ready, blurSensitive, refresh, createVault, unlock, unlockOs, lock, saveSettings, copySecret, tick],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault(): VaultContextValue {
  const value = useContext(VaultContext);
  if (!value) throw new Error("Vault context missing.");
  return value;
}

export function useItems(filter?: (item: VaultItem) => boolean): VaultItem[] {
  const { engine, tick } = useVault();
  void tick;
  const items = engine.items();
  return filter ? items.filter(filter) : items;
}
