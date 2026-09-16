import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, nativeTheme, powerMonitor, safeStorage, session, shell, Tray } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sqliteVaultStore } from "@deepkey/database";
import { storedAttachmentSchema, storedRecordSchema, vaultHeaderSchema } from "@deepkey/validation";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
nativeTheme.themeSource = "dark";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let store: ReturnType<typeof sqliteVaultStore>;
let quitting = false;

const CHANNELS = [
  "vault:getHeader",
  "vault:setHeader",
  "vault:listRecords",
  "vault:putRecord",
  "vault:deleteRecord",
  "vault:listAttachments",
  "vault:putAttachment",
  "vault:getAttachment",
  "vault:deleteAttachment",
  "vault:replaceAll",
  "vault:wipe",
  "vault:dbPath",
  "prefs:get",
  "prefs:set",
  "clipboard:write",
  "clipboard:read",
  "clipboard:clearIfUnchanged",
  "files:open",
  "files:save",
  "window:minimize",
  "window:maximize",
  "window:close",
  "window:isMaximized",
  "window:setContentProtection",
  "osUnlock:available",
  "osUnlock:store",
  "osUnlock:load",
  "osUnlock:clear",
  "desktop:setLaunchAtStartup",
  "desktop:setTray",
  "app:openExternal",
] as const;

function brandIconPath(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, "icons", "icon.png");
  return path.join(__dirname, "../../assets/icon.png");
}

function trayIconPath(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, "icons", "tray.png");
  const trayPng = path.join(__dirname, "../../assets/tray.png");
  if (fs.existsSync(trayPng)) return trayPng;
  return brandIconPath();
}

function loadBrandImage(): Electron.NativeImage | null {
  const file = brandIconPath();
  if (!fs.existsSync(file)) return null;
  const image = nativeImage.createFromPath(file);
  return image.isEmpty() ? null : image;
}

function setTrayEnabled(enabled: boolean): void {
  if (!enabled) {
    tray?.destroy();
    tray = null;
    return;
  }
  if (tray) return;
  const file = trayIconPath();
  if (!fs.existsSync(file)) return;
  const image = nativeImage.createFromPath(file);
  if (image.isEmpty()) return;
  tray = new Tray(image);
  tray.setToolTip("DeepKey");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open DeepKey", click: () => showMainWindow() },
      { label: "Lock Vault", click: () => mainWindow?.webContents.send("lock") },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ]),
  );
  tray.on("click", () => showMainWindow());
}

function showMainWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function settingsWantTray(): boolean {
  try {
    const raw = store?.getKv("settings");
    if (!raw) return true;
    return JSON.parse(raw)?.ui?.trayEnabled !== false;
  } catch {
    return true;
  }
}

function userData(...parts: string[]): string {
  return path.join(app.getPath("userData"), ...parts);
}

function dbFile(): string {
  const custom = store?.getKv("vaultPath");
  if (custom && path.isAbsolute(custom) && !custom.includes("\0")) return custom;
  return userData("vault", "deepkey.sqlite");
}

function windowStatePath(): string {
  return userData("window.json");
}

function loadWindowState(): { x?: number; y?: number; width: number; height: number; maximized: boolean } {
  try {
    return { width: 1280, height: 800, maximized: false, ...JSON.parse(fs.readFileSync(windowStatePath(), "utf8")) };
  } catch {
    return { width: 1280, height: 800, maximized: false };
  }
}

function saveWindowState(win: BrowserWindow): void {
  const bounds = win.getBounds();
  fs.mkdirSync(path.dirname(windowStatePath()), { recursive: true });
  fs.writeFileSync(
    windowStatePath(),
    JSON.stringify({ ...bounds, maximized: win.isMaximized() }),
  );
}

function assertId(id: unknown): string {
  if (typeof id !== "string" || !/^[A-Za-z0-9._-]+$/.test(id) || id.length > 80) {
    throw new Error("Invalid id.");
  }
  return id;
}

function createWindow(): void {
  const state = loadWindowState();
  const preload = path.join(__dirname, "preload.cjs");
  const icon = loadBrandImage();
  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 880,
    minHeight: 640,
    backgroundColor: "#141516",
    show: false,
    icon: icon ?? undefined,
    frame: process.platform === "darwin",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    trafficLightPosition: { x: 14, y: 12 },
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      navigateOnDragAndDrop: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (state.maximized) mainWindow?.maximize();
    mainWindow?.show();
  });
  mainWindow.on("close", (event) => {
    if (mainWindow) saveWindowState(mainWindow);
    if (!quitting && settingsWantTray() && tray) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
  mainWindow.on("blur", () => mainWindow?.webContents.send("window:blur"));
  mainWindow.on("focus", () => mainWindow?.webContents.send("window:focus"));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const allowed = isDev ? process.env.VITE_DEV_SERVER_URL : "file://";
    if (!url.startsWith(allowed || "file://") && !url.startsWith("file://")) {
      event.preventDefault();
    }
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

function registerIpc(): void {
  ipcMain.handle("vault:getHeader", () => store.getHeader());
  ipcMain.handle("vault:setHeader", (_e, header) => store.setHeader(vaultHeaderSchema.parse(header)));
  ipcMain.handle("vault:listRecords", () => store.listRecords());
  ipcMain.handle("vault:putRecord", (_e, record) => store.putRecord(storedRecordSchema.parse(record)));
  ipcMain.handle("vault:deleteRecord", (_e, id) => store.deleteRecord(assertId(id)));
  ipcMain.handle("vault:listAttachments", () => store.listAttachments());
  ipcMain.handle("vault:putAttachment", (_e, attachment) => store.putAttachment(storedAttachmentSchema.parse(attachment)));
  ipcMain.handle("vault:getAttachment", (_e, id) => store.getAttachment(assertId(id)));
  ipcMain.handle("vault:deleteAttachment", (_e, id) => store.deleteAttachment(assertId(id)));
  ipcMain.handle("vault:replaceAll", (_e, payload) =>
    store.replaceAll(
      vaultHeaderSchema.parse(payload.header),
      storedRecordSchema.array().parse(payload.records),
      storedAttachmentSchema.array().parse(payload.attachments),
    ),
  );
  ipcMain.handle("vault:wipe", () => store.wipe());
  ipcMain.handle("vault:dbPath", () => dbFile());
  ipcMain.handle("prefs:get", (_e, key) => {
    assertId(key);
    return store.getKv(key);
  });
  ipcMain.handle("prefs:set", (_e, key, value) => {
    assertId(key);
    if (typeof value !== "string" || value.length > 1_000_000) throw new Error("Invalid pref.");
    store.setKv(key, value);
  });
  ipcMain.handle("clipboard:write", (_e, text) => {
    if (typeof text !== "string") throw new Error("Invalid clipboard payload.");
    clipboard.writeText(text);
  });
  ipcMain.handle("clipboard:read", () => clipboard.readText());
  ipcMain.handle("clipboard:clearIfUnchanged", (_e, expected) => {
    if (typeof expected !== "string") return false;
    if (clipboard.readText() === expected) {
      clipboard.clear();
      return true;
    }
    return false;
  });
  ipcMain.handle("files:open", async (_e, filters) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ["openFile"],
      filters: Array.isArray(filters) ? filters : undefined,
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    const bytes = fs.readFileSync(filePath);
    return { name: path.basename(filePath), mime: "application/octet-stream", bytes };
  });
  ipcMain.handle("files:save", async (_e, filename, bytes, _mime) => {
    if (typeof filename !== "string" || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      throw new Error("Invalid filename.");
    }
    const result = await dialog.showSaveDialog(mainWindow!, { defaultPath: filename });
    if (result.canceled || !result.filePath) return false;
    const data = bytes instanceof Uint8Array ? bytes : Buffer.from(bytes);
    fs.writeFileSync(result.filePath, data);
    return true;
  });
  ipcMain.handle("window:minimize", () => mainWindow?.minimize());
  ipcMain.handle("window:maximize", () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.handle("window:close", () => mainWindow?.close());
  ipcMain.handle("window:isMaximized", () => Boolean(mainWindow?.isMaximized()));
  ipcMain.handle("window:setContentProtection", (_e, enabled) => {
    mainWindow?.setContentProtection(Boolean(enabled));
  });
  ipcMain.handle("osUnlock:available", () => safeStorage.isEncryptionAvailable());
  ipcMain.handle("osUnlock:store", (_e, b64) => {
    if (typeof b64 !== "string" || b64.length > 2048) throw new Error("Invalid payload.");
    const enc = safeStorage.encryptString(b64);
    fs.writeFileSync(userData("os-unlock.bin"), enc);
  });
  ipcMain.handle("osUnlock:load", () => {
    const file = userData("os-unlock.bin");
    if (!fs.existsSync(file) || !safeStorage.isEncryptionAvailable()) return null;
    try {
      return safeStorage.decryptString(fs.readFileSync(file));
    } catch {
      return null;
    }
  });
  ipcMain.handle("osUnlock:clear", () => {
    const file = userData("os-unlock.bin");
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });
  ipcMain.handle("desktop:setLaunchAtStartup", (_e, enabled) => {
    app.setLoginItemSettings({ openAtLogin: Boolean(enabled) });
  });
  ipcMain.handle("desktop:setTray", (_e, enabled) => {
    setTrayEnabled(Boolean(enabled));
  });
  ipcMain.handle("app:openExternal", (_e, url) => {
    if (typeof url !== "string" || !url.startsWith("https://")) throw new Error("Blocked URL.");
    return shell.openExternal(url);
  });
}

void CHANNELS;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  app.whenReady().then(() => {
    store = sqliteVaultStore(userData("vault", "deepkey.sqlite"));
    session.defaultSession.setPermissionRequestHandler((_w, _p, cb) => cb(false));
    registerIpc();
    setTrayEnabled(settingsWantTray());
    createWindow();
    powerMonitor.on("suspend", () => mainWindow?.webContents.send("system:sleep"));
    powerMonitor.on("lock-screen", () => mainWindow?.webContents.send("system:lock"));
    powerMonitor.on("resume", () => mainWindow?.webContents.send("system:resume"));
  });
}

app.on("before-quit", () => {
  quitting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
