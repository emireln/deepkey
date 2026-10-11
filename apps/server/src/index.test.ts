import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { app } from "./index.js";

const OWN_CLIENT = { "x-deepkey-request": "1", "content-type": "application/json" };
const TOKEN_FILE = path.resolve("tmp-test-data", "setup.token");

describe("server security", () => {
  it("health is public", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("needs the setup token before the first account can be created", async () => {
    const needed = await app.request("/api/auth/setup-needed");
    expect(await needed.json()).toEqual({ needed: true });
    const payload = (setupToken?: string) =>
      JSON.stringify({ username: "owner", password: "correct-horse-battery", ...(setupToken ? { setupToken } : {}) });

    const missing = await app.request("/api/auth/setup", { method: "POST", headers: OWN_CLIENT, body: payload() });
    expect(missing.status).toBe(403);
    const wrong = await app.request("/api/auth/setup", { method: "POST", headers: OWN_CLIENT, body: payload("not-the-token") });
    expect(wrong.status).toBe(403);
    expect(fs.existsSync(TOKEN_FILE)).toBe(true);

    const token = fs.readFileSync(TOKEN_FILE, "utf8").trim();
    const created = await app.request("/api/auth/setup", { method: "POST", headers: OWN_CLIENT, body: payload(token) });
    expect(created.status).toBe(200);
    expect(fs.existsSync(TOKEN_FILE)).toBe(false);
  });

  it("rejects unauthenticated vault access", async () => {
    const res = await app.request("/api/vault/header");
    expect(res.status).toBe(401);
  });

  it("rejects unauthenticated password change", async () => {
    const res = await app.request("/api/auth/password", { method: "POST", headers: OWN_CLIENT, body: "{}" });
    expect(res.status).toBe(401);
  });

  it("rejects path-like pref keys", async () => {
    const res = await app.request("/api/prefs/../secret", { method: "GET" });
    expect([400, 401, 404]).toContain(res.status);
  });

  it("rejects unauthenticated vault deletes even with junk ids", async () => {
    const res = await app.request("/api/vault/records/../x", { method: "DELETE", headers: OWN_CLIENT });
    expect(res.status).toBe(401);
  });

  it("sets security headers", async () => {
    const res = await app.request("/health");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy") || "").toContain("default-src");
  });

  it("rejects invalid origin on mutations", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { origin: "https://evil.example", host: "localhost:8787", "content-type": "application/json", "x-deepkey-request": "1" },
      body: JSON.stringify({ username: "a", password: "bbbbbbbbbb" }),
    });
    expect(res.status).toBe(403);
  });

  it("rejects mutations that lack the request header, even from a localhost origin", async () => {
    const res = await app.request("/api/vault/wipe", {
      method: "POST",
      headers: { origin: "http://localhost:3000", host: "localhost:8787" },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "request_header_missing" });
  });

  it("caps the size of unauthenticated bodies", async () => {
    const body = JSON.stringify({ username: "a", password: "x".repeat(20 * 1024) });
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { ...OWN_CLIENT, "content-length": String(body.length) },
      body,
    });
    expect(res.status).toBe(413);
  });

  it("marks API responses as not cacheable", async () => {
    const res = await app.request("/api/auth/me");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("does not let a rotating X-Forwarded-For reset the login limit", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const res = await app.request("/api/auth/login", {
        method: "POST",
        headers: { ...OWN_CLIENT, "x-forwarded-for": `203.0.113.${i}` },
        body: JSON.stringify({ username: "nobody-here", password: "wrong-password-xx" }),
      });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
  });
});
