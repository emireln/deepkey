const { contextBridge, ipcRenderer } = require("electron");

const ALLOWED = new Set([
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
]);

contextBridge.exposeInMainWorld("deepkey", {
  invoke(channel, ...args) {
    if (!ALLOWED.has(channel)) {
      return Promise.reject(new Error("Blocked IPC channel."));
    }
    return ipcRenderer.invoke(channel, ...args);
  },
  on(channel, handler) {
    if (channel !== "lock" && channel !== "window:blur" && channel !== "window:focus" && channel !== "system:sleep" && channel !== "system:lock" && channel !== "system:resume") {
      return () => undefined;
    }
    const wrapped = (_event, ...args) => handler(...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
  platform: process.platform,
});
