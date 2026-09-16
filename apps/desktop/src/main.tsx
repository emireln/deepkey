import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DeepKeyApp, type PlatformAdapter } from "@deepkey/ui";
import type { StoredAttachment, StoredRecord, VaultHeader } from "@deepkey/types";
import { APP_VERSION } from "@deepkey/config";

declare global {
  interface Window {
    deepkey: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
      on: (channel: string, handler: (...args: unknown[]) => void) => () => void;
      platform: NodeJS.Platform;
    };
  }
}

const os = window.deepkey.platform === "darwin" ? "mac" : window.deepkey.platform === "win32" ? "win" : "linux";

function createDesktopPlatform(): PlatformAdapter {
  const invoke = window.deepkey.invoke;
  return {
    kind: "desktop",
    os,
    appVersion: APP_VERSION,
    storage: {
      getHeader: () => invoke("vault:getHeader") as Promise<VaultHeader | null>,
      setHeader: (header) => invoke("vault:setHeader", header) as Promise<void>,
      listRecords: () => invoke("vault:listRecords") as Promise<StoredRecord[]>,
      putRecord: (record) => invoke("vault:putRecord", record) as Promise<void>,
      deleteRecord: (id) => invoke("vault:deleteRecord", id) as Promise<void>,
      listAttachments: () => invoke("vault:listAttachments") as Promise<StoredAttachment[]>,
      putAttachment: (attachment) => invoke("vault:putAttachment", attachment) as Promise<void>,
      getAttachment: (id) => invoke("vault:getAttachment", id) as Promise<StoredAttachment | null>,
      deleteAttachment: (id) => invoke("vault:deleteAttachment", id) as Promise<void>,
      replaceAll: (header, records, attachments) => invoke("vault:replaceAll", { header, records, attachments }) as Promise<void>,
      wipe: () => invoke("vault:wipe") as Promise<void>,
      getDbPath: () => invoke("vault:dbPath") as Promise<string>,
    },
    prefs: {
      get: (key) => invoke("prefs:get", key) as Promise<string | null>,
      set: (key, value) => invoke("prefs:set", key, value) as Promise<void>,
    },
    clipboard: {
      write: (text) => invoke("clipboard:write", text) as Promise<void>,
      read: () => invoke("clipboard:read") as Promise<string>,
      clearIfUnchanged: (expected) => invoke("clipboard:clearIfUnchanged", expected) as Promise<boolean>,
      supportsClear: true,
    },
    files: {
      open: (filters) => invoke("files:open", filters) as Promise<{ name: string; mime: string; bytes: Uint8Array } | null>,
      save: (filename, bytes, mime) => invoke("files:save", filename, bytes, mime) as Promise<boolean>,
    },
    window: {
      minimize: () => void invoke("window:minimize"),
      maximize: () => void invoke("window:maximize"),
      close: () => void invoke("window:close"),
      isMaximized: () => invoke("window:isMaximized") as Promise<boolean>,
      setContentProtection: (enabled) => invoke("window:setContentProtection", enabled) as Promise<void>,
      onBlur: (cb) => window.deepkey.on("window:blur", cb),
      onFocus: (cb) => window.deepkey.on("window:focus", cb),
      onSleep: (cb) => window.deepkey.on("system:sleep", cb),
      onLock: (cb) => window.deepkey.on("system:lock", cb),
      onResume: (cb) => window.deepkey.on("system:resume", cb),
    },
    osUnlock: {
      available: () => invoke("osUnlock:available") as Promise<boolean>,
      async storeDek(bytes) {
        let binary = "";
        for (const b of bytes) binary += String.fromCharCode(b);
        await invoke("osUnlock:store", btoa(binary));
      },
      async loadDek() {
        const b64 = (await invoke("osUnlock:load")) as string | null;
        if (!b64) return null;
        const binary = atob(b64);
        const out = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
        return out;
      },
      clear: () => invoke("osUnlock:clear") as Promise<void>,
    },
    desktop: {
      setLaunchAtStartup: (enabled) => invoke("desktop:setLaunchAtStartup", enabled) as Promise<void>,
      setTray: (enabled) => invoke("desktop:setTray", enabled) as Promise<void>,
    },
    openExternal(url) {
      void invoke("app:openExternal", url);
    },
  };
}

const platform = createDesktopPlatform();
window.deepkey.on("lock", () => {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "l", ctrlKey: true }));
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DeepKeyApp platform={platform} />
  </StrictMode>,
);
