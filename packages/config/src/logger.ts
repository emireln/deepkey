const SECRET_KEYS = /(password|passwd|secret|token|authorization|cookie|dek|kek|master|private.?key|api[_-]?key|ciphertext|nonce|session)/i;

export function redact(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    if (value.length > 12 && SECRET_KEYS.test(value)) return "[redacted]";
    return value;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEYS.test(key) ? "[redacted]" : redact(nested);
    }
    return out;
  }
  return value;
}

export function logInfo(message: string, extra?: Record<string, unknown>): void {
  if (extra) {
    console.info(message, redact(extra));
  } else {
    console.info(message);
  }
}

export function logError(message: string, extra?: Record<string, unknown>): void {
  if (extra) {
    console.error(message, redact(extra));
  } else {
    console.error(message);
  }
}

export function assertNotSecretLog(text: string): void {
  if (SECRET_KEYS.test(text) && /[=:]\s*\S{8,}/.test(text)) {
    throw new Error("Refusing to log a possible secret.");
  }
}
