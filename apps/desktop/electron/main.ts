import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, Menu, nativeImage, nativeTheme, Notification, powerMonitor, safeStorage, session, shell, Tray } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sqliteVaultStore } from "@deepkey/database";
import { parseOpaqueId, PREF_VALUE_MAX, storedAttachmentSchema, storedRecordSchema, vaultHeaderSchema } from "@deepkey/validation";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
nativeTheme.themeSource = "dark";
if (process.platform === "win32") {
  app.setAppUserModelId("app.deepkey.desktop");
}

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
  "desktop:setGlobalShortcut",
  "backup:writeAuto",
  "backup:pickDir",
  "notifications:show",
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

function loadNativeImage(file: string, size?: number): Electron.NativeImage | null {
  if (!fs.existsSync(file)) return null;
  let image = nativeImage.createFromPath(file);
  if (image.isEmpty()) return null;
  if (size) {
    const { width } = image.getSize();
    if (width !== size) image = image.resize({ width: size, height: size, quality: "best" });
  }
  return image;
}

function loadBrandImage(): Electron.NativeImage | null {
  return loadNativeImage(brandIconPath());
}

function setTrayEnabled(enabled: boolean): void {
  if (!enabled) {
    tray?.destroy();
    tray = null;
    return;
  }
  if (tray) return;
  const image = loadNativeImage(trayIconPath(), 32) ?? loadNativeImage(brandIconPath(), 32);
  if (!image) return;
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
  mainWindow.setSkipTaskbar(false);
  mainWindow.show();
  mainWindow.focus();
}

function settingsWantShortcut(): boolean {
  try {
    const raw = store?.getKv("settings");
    if (!raw) return false;
    return JSON.parse(raw)?.ui?.globalShortcutEnabled === true;
  } catch {
    return false;
  }
}

const GLOBAL_SHORTCUT = "CommandOrControl+Shift+K";

function setGlobalShortcutEnabled(enabled: boolean): boolean {
  globalShortcut.unregisterAll();
  if (!enabled) return true;
  return globalShortcut.register(GLOBAL_SHORTCUT, () => {
    showMainWindow();
    mainWindow?.webContents.send("palette");
  });
}

function backupsDir(preferred?: string | null): string {
  if (preferred && path.isAbsolute(preferred) && !preferred.includes("\0")) return preferred;
  return userData("backups");
}

function pruneBackups(dir: string): void {
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".deepkeyvault"))
    .map((name) => ({ name, mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const extra of files.slice(14)) {
    fs.unlinkSync(path.join(dir, extra.name));
  }
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
  return parseOpaqueId(id);
}

function mimeFromFile(filePath: string, bytes: Buffer): string {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45) return "image/webp";
  if (bytes.length >= 3 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".json") return "application/json";
  if (ext === ".txt" || ext === ".env") return "text/plain";
  return "application/octet-stream";
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
      navigateOnDragDrop: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (state.maximized) mainWindow?.maximize();
    mainWindow?.show();
  });
  mainWindow.on("close", (event) => {
    const win = mainWindow;
    if (!win) return;
    saveWindowState(win);
    if (!quitting && settingsWantTray() && tray) {
      event.preventDefault();
      win.setSkipTaskbar(true);
      win.hide();
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
  ipcMain.handle("vault:wipe", async () => {
    await store.wipe();
    const file = userData("os-unlock.bin");
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });
  ipcMain.handle("vault:dbPath", () => dbFile());
  ipcMain.handle("prefs:get", (_e, key) => {
    assertId(key);
    return store.getKv(key);
  });
  ipcMain.handle("prefs:set", (_e, key, value) => {
    assertId(key);
    if (typeof value !== "string" || value.length > PREF_VALUE_MAX) throw new Error("Invalid pref.");
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
    return { name: path.basename(filePath), mime: mimeFromFile(filePath, bytes), bytes };
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
  ipcMain.handle("desktop:setGlobalShortcut", (_e, enabled) => {
    return setGlobalShortcutEnabled(Boolean(enabled));
  });
  ipcMain.handle("backup:pickDir", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, { properties: ["openDirectory", "createDirectory"] });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });
  ipcMain.handle("backup:writeAuto", (_e, bytes, dir) => {
    const folder = backupsDir(typeof dir === "string" ? dir : null);
    fs.mkdirSync(folder, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const file = path.join(folder, `deepkey-${stamp}.deepkeyvault`);
    const data = bytes instanceof Uint8Array ? bytes : Buffer.from(bytes);
    fs.writeFileSync(file, data);
    pruneBackups(folder);
    return file;
  });
  ipcMain.handle("notifications:show", (_e, title, body) => {
    if (typeof title !== "string" || typeof body !== "string") return;
    if (title.length > 120 || body.length > 280) return;
    new Notification({ title, body, silent: true }).show();
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
    setGlobalShortcutEnabled(settingsWantShortcut());
    createWindow();
    powerMonitor.on("suspend", () => mainWindow?.webContents.send("system:sleep"));
    powerMonitor.on("lock-screen", () => mainWindow?.webContents.send("system:lock"));
    powerMonitor.on("resume", () => mainWindow?.webContents.send("system:resume"));
  });
}

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("before-quit", () => {
  quitting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
