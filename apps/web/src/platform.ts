import type { PlatformAdapter } from "@deepkey/ui";
import type { StoredAttachment, StoredRecord, VaultHeader } from "@deepkey/types";
import { APP_VERSION } from "@deepkey/config";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error || "Request failed.");
  }
  return res.json() as Promise<T>;
}

export function createWebPlatform(): PlatformAdapter {
  return {
    kind: "web",
    os: "web",
    appVersion: APP_VERSION,
    storage: {
      async getHeader() {
        const data = await api<{ header: VaultHeader | null }>("/api/vault/header");
        return data.header;
      },
      async setHeader(header) {
        await api("/api/vault/header", { method: "PUT", body: JSON.stringify({ header }) });
      },
      async listRecords() {
        const data = await api<{ records: StoredRecord[] }>("/api/vault/records");
        return data.records;
      },
      async putRecord(record) {
        await api(`/api/vault/records/${record.id}`, { method: "PUT", body: JSON.stringify(record) });
      },
      async deleteRecord(id) {
        await api(`/api/vault/records/${id}`, { method: "DELETE" });
      },
      async listAttachments() {
        const data = await api<{ attachments: StoredAttachment[] }>("/api/vault/attachments");
        return data.attachments;
      },
      async putAttachment(attachment) {
        await api(`/api/vault/attachments/${attachment.id}`, { method: "PUT", body: JSON.stringify(attachment) });
      },
      async getAttachment(id) {
        const data = await api<{ attachment: StoredAttachment }>(`/api/vault/attachments/${id}`);
        return data.attachment;
      },
      async deleteAttachment(id) {
        await api(`/api/vault/attachments/${id}`, { method: "DELETE" });
      },
      async replaceAll(header, records, attachments) {
        await api("/api/vault/replace", { method: "PUT", body: JSON.stringify({ header, records, attachments }) });
      },
      async wipe() {
        await api("/api/vault/wipe", { method: "POST" });
      },
      async getDbPath() {
        const data = await api<{ path: string }>("/api/meta/db-path");
        return data.path;
      },
    },
    prefs: {
      async get(key) {
        const data = await api<{ value: string | null }>(`/api/prefs/${key}`);
        return data.value;
      },
      async set(key, value) {
        await api(`/api/prefs/${key}`, { method: "PUT", body: JSON.stringify({ value }) });
      },
    },
    auth: {
      async needsSetup() {
        const data = await fetch("/api/auth/setup-needed", { credentials: "same-origin" }).then((r) => r.json());
        return Boolean(data.needed);
      },
      async setup(username, password) {
        await api("/api/auth/setup", { method: "POST", body: JSON.stringify({ username, password }) });
      },
      async login(username, password) {
        await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
      },
      async logout() {
        await api("/api/auth/logout", { method: "POST" });
      },
      async me() {
        try {
          const data = await api<{ user: { username: string } | null }>("/api/auth/me");
          return data.user;
        } catch {
          return null;
        }
      },
      async changePassword(current, next) {
        await api("/api/auth/password", { method: "POST", body: JSON.stringify({ current, next }) });
      },
    },
    clipboard: {
      async write(text) {
        await navigator.clipboard.writeText(text);
      },
      async read() {
        return navigator.clipboard.readText();
      },
      async clearIfUnchanged() {
        return false;
      },
      supportsClear: false,
    },
    files: {
      async open() {
        return new Promise((resolve) => {
          const input = document.createElement("input");
          input.type = "file";
          input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return resolve(null);
            const buf = new Uint8Array(await file.arrayBuffer());
            resolve({ name: file.name, mime: file.type, bytes: buf });
          };
          input.click();
        });
      },
      async save(filename, bytes, mime) {
        const blob = new Blob([bytes.slice()], { type: mime || "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        return true;
      },
    },
    openExternal(url) {
      window.open(url, "_blank", "noopener,noreferrer");
    },
    notifications: {
      show(title, body) {
        void (async () => {
          if (!("Notification" in window)) return;
          if (Notification.permission === "default") await Notification.requestPermission();
          if (Notification.permission === "granted") new Notification(title, { body, silent: true });
        })();
      },
    },
  };
}
