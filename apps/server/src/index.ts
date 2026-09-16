import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { secureHeaders } from "hono/secure-headers";
import { APP_VERSION } from "@deepkey/config";
import {
  opaqueIdSchema,
  PREF_VALUE_MAX,
  storedAttachmentSchema,
  storedRecordSchema,
  vaultHeaderSchema,
} from "@deepkey/validation";
import {
  cookieOptions,
  createSession,
  createUser,
  changeUserPassword,
  dbPath,
  destroyOtherSessions,
  destroySession,
  logError,
  logInfo,
  rateLimited,
  recordAttempt,
  sessionUser,
  store,
  userCount,
  verifyUser,
} from "./auth.js";

const COOKIE = "deepkey_session";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function isSecure(c: { req: { url: string; header: (n: string) => string | undefined } }): boolean {
  if (process.env.DEEPKEY_PUBLIC_URL?.startsWith("https://")) return true;
  const proto = c.req.header("x-forwarded-proto");
  return proto === "https" || new URL(c.req.url).protocol === "https:";
}

function originAllowed(c: { req: { url: string; header: (n: string) => string | undefined } }): boolean {
  const origin = c.req.header("origin");
  if (!origin) return true;
  const publicUrl = process.env.DEEPKEY_PUBLIC_URL;
  if (publicUrl) {
    try {
      return new URL(origin).origin === new URL(publicUrl).origin;
    } catch {
      return false;
    }
  }
  try {
    const parsed = new URL(origin);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") return true;
    const host = c.req.header("host");
    return parsed.host === host;
  } catch {
    return false;
  }
}

const app = new Hono();

app.use(
  "*",
  secureHeaders({
    xFrameOptions: "DENY",
    xContentTypeOptions: "nosniff",
    referrerPolicy: "no-referrer",
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      objectSrc: ["'none'"],
    },
    permissionsPolicy: {
      camera: [],
      microphone: [],
      geolocation: [],
      payment: [],
    },
  }),
);

app.use("*", async (c, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method) && !originAllowed(c)) {
    return c.json({ error: "Invalid origin." }, 403);
  }
  await next();
});

app.get("/health", (c) => c.json({ ok: true, version: APP_VERSION }));

app.get("/api/auth/setup-needed", (c) => c.json({ needed: userCount() === 0 }));

app.post("/api/auth/setup", async (c) => {
  if (userCount() > 0) return c.json({ error: "Already set up." }, 400);
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) return c.json({ error: "Too many attempts." }, 429);
  try {
    const body = await c.req.json();
    createUser(String(body.username ?? ""), String(body.password ?? ""));
    const user = verifyUser(String(body.username), String(body.password));
    if (!user) return c.json({ error: "Could not create account." }, 400);
    const session = createSession(user);
    recordAttempt(ip, true);
    setCookie(c, COOKIE, session.token, cookieOptions(isSecure(c)));
    return c.json({ ok: true });
  } catch (err) {
    recordAttempt(ip, false);
    logError("setup failed");
    return c.json({ error: err instanceof Error ? err.message : "Setup failed." }, 400);
  }
});

app.post("/api/auth/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const username = String((body as { username?: string }).username ?? "");
  const ip = `${c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local"}:${username}`;
  if (rateLimited(ip)) return c.json({ error: "Too many attempts." }, 429);
  const user = verifyUser(username, String((body as { password?: string }).password ?? ""));
  if (!user) {
    recordAttempt(ip, false);
    return c.json({ error: "Invalid credentials." }, 401);
  }
  recordAttempt(ip, true);
  destroySession(getCookie(c, COOKIE));
  const session = createSession(user);
  setCookie(c, COOKIE, session.token, cookieOptions(isSecure(c)));
  return c.json({ ok: true });
});

app.post("/api/auth/logout", (c) => {
  destroySession(getCookie(c, COOKIE));
  deleteCookie(c, COOKIE, { path: "/" });
  return c.json({ ok: true });
});

app.get("/api/auth/me", (c) => {
  const user = sessionUser(getCookie(c, COOKIE));
  if (!user) return c.json({ user: null }, 401);
  return c.json({ user: { username: user.username } });
});

app.post("/api/auth/password", async (c) => {
  const user = sessionUser(getCookie(c, COOKIE));
  if (!user) return c.json({ error: "Unauthorized." }, 401);
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(`${ip}:pw`)) return c.json({ error: "Too many attempts." }, 429);
  const body = await c.req.json().catch(() => ({}));
  const current = String((body as { current?: string }).current ?? "");
  const next = String((body as { next?: string }).next ?? "");
  try {
    const ok = changeUserPassword(user.id, current, next);
    recordAttempt(`${ip}:pw`, ok);
    if (!ok) return c.json({ error: "Invalid credentials." }, 401);
    destroyOtherSessions(user.id, getCookie(c, COOKIE));
    return c.json({ ok: true });
  } catch (err) {
    recordAttempt(`${ip}:pw`, false);
    return c.json({ error: err instanceof Error ? err.message : "Could not change password." }, 400);
  }
});

app.use("/api/vault/*", async (c, next) => {
  const user = sessionUser(getCookie(c, COOKIE));
  if (!user) return c.json({ error: "Unauthorized." }, 401);
  await next();
});

app.use("/api/prefs/*", async (c, next) => {
  const user = sessionUser(getCookie(c, COOKIE));
  if (!user) return c.json({ error: "Unauthorized." }, 401);
  await next();
});

app.get("/api/vault/header", async (c) => {
  return c.json({ header: await store.getHeader() });
});

app.put("/api/vault/header", async (c) => {
  const body = await c.req.json();
  const header = vaultHeaderSchema.parse(body.header);
  await store.setHeader(header);
  return c.json({ ok: true });
});

app.get("/api/vault/records", async (c) => {
  return c.json({ records: await store.listRecords() });
});

app.put("/api/vault/records/:id", async (c) => {
  const record = storedRecordSchema.parse({ ...(await c.req.json()), id: c.req.param("id") });
  await store.putRecord(record);
  return c.json({ ok: true });
});

app.delete("/api/vault/records/:id", async (c) => {
  const id = opaqueIdSchema.safeParse(c.req.param("id"));
  if (!id.success) return c.json({ error: "Invalid id." }, 400);
  await store.deleteRecord(id.data);
  return c.json({ ok: true });
});

app.get("/api/vault/attachments", async (c) => {
  return c.json({ attachments: await store.listAttachments() });
});

app.get("/api/vault/attachments/:id", async (c) => {
  const id = opaqueIdSchema.safeParse(c.req.param("id"));
  if (!id.success) return c.json({ error: "Invalid id." }, 400);
  const attachment = await store.getAttachment(id.data);
  if (!attachment) return c.json({ error: "Not found." }, 404);
  return c.json({ attachment });
});

app.put("/api/vault/attachments/:id", async (c) => {
  const attachment = storedAttachmentSchema.parse({ ...(await c.req.json()), id: c.req.param("id") });
  await store.putAttachment(attachment);
  return c.json({ ok: true });
});

app.delete("/api/vault/attachments/:id", async (c) => {
  const id = opaqueIdSchema.safeParse(c.req.param("id"));
  if (!id.success) return c.json({ error: "Invalid id." }, 400);
  await store.deleteAttachment(id.data);
  return c.json({ ok: true });
});

app.put("/api/vault/replace", async (c) => {
  const body = await c.req.json();
  const header = vaultHeaderSchema.parse(body.header);
  const records = storedRecordSchema.array().parse(body.records);
  const attachments = storedAttachmentSchema.array().parse(body.attachments);
  await store.replaceAll(header, records, attachments);
  return c.json({ ok: true });
});

app.post("/api/vault/wipe", async (c) => {
  await store.wipe();
  return c.json({ ok: true });
});

app.get("/api/meta/db-path", (c) => {
  if (!sessionUser(getCookie(c, COOKIE))) return c.json({ error: "Unauthorized." }, 401);
  return c.json({ path: dbPath() });
});

app.get("/api/prefs/:key", (c) => {
  const key = opaqueIdSchema.safeParse(c.req.param("key"));
  if (!key.success) return c.json({ error: "Invalid key." }, 400);
  return c.json({ value: store.getKv(key.data) });
});

app.put("/api/prefs/:key", async (c) => {
  const key = opaqueIdSchema.safeParse(c.req.param("key"));
  if (!key.success) return c.json({ error: "Invalid key." }, 400);
  const body = await c.req.json();
  if (typeof body.value !== "string" || body.value.length > PREF_VALUE_MAX) {
    return c.json({ error: "Invalid pref." }, 400);
  }
  store.setKv(key.data, body.value);
  return c.json({ ok: true });
});

app.all("/api/*", (c) => c.json({ error: "Not found." }, 404));

const webDist = path.resolve(__dirname, "../../web/dist");
if (fs.existsSync(webDist)) {
  app.use("/*", serveStatic({ root: webDist }));
  app.get("/*", async (c) => {
    const index = path.join(webDist, "index.html");
    return c.html(fs.readFileSync(index, "utf8"));
  });
}

const port = Number(process.env.DEEPKEY_PORT || 8787);
const hostname = process.env.DEEPKEY_HOST || "127.0.0.1";

if (process.env.VITEST !== "true") {
  serve({ fetch: app.fetch, port, hostname }, () => {
    logInfo(`DeepKey listening on http://${hostname}:${port}`);
  });
}

export { app };
export default app;
