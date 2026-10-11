/** True only when a reverse proxy you control sits in front of DeepKey. Mirrors `.env.example`. */
export function trustProxyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return /^(1|true|yes)$/i.test(env.DEEPKEY_TRUST_PROXY ?? "");
}

/**
 * Address used to rate-limit login attempts. X-Forwarded-For is only read behind a trusted proxy;
 * otherwise a client could pick a new value per request and never hit the limit.
 */
export function clientAddress(
  input: { forwardedFor?: string | undefined; remoteAddress?: string | undefined },
  trustProxy: boolean,
): string {
  if (trustProxy) {
    const first = input.forwardedFor?.split(",")[0]?.trim();
    if (first) return first;
  }
  return input.remoteAddress || "local";
}

export function isHttpsRequest(input: { forwardedProto?: string | undefined; url: string }, trustProxy: boolean): boolean {
  if (trustProxy && input.forwardedProto?.split(",")[0]?.trim() === "https") return true;
  return new URL(input.url).protocol === "https:";
}
