import type { GeneratorOptions } from "@deepkey/types";

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const NUM = "0123456789";
const SYM = "!@#$%^&*()-_=+[]{};:,.<>?";
const AMBIGUOUS = new Set(["O", "0", "I", "l", "1", "|"]);

function randomInt(max: number): number {
  if (max <= 0) throw new Error("Invalid range.");
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / max) * max;
  let x = 0;
  do {
    crypto.getRandomValues(buf);
    x = buf[0]!;
  } while (x >= limit);
  return x % max;
}

function pick(chars: string): string {
  return chars[randomInt(chars.length)]!;
}

function shuffle(values: string[]): string[] {
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    const tmp = values[i]!;
    values[i] = values[j]!;
    values[j] = tmp;
  }
  return values;
}

function filterAmbiguous(chars: string, avoid: boolean): string {
  if (!avoid) return chars;
  return [...chars].filter((c) => !AMBIGUOUS.has(c)).join("");
}

export function generateSecret(options: GeneratorOptions): string {
  if (options.kind === "uuid") {
    return crypto.randomUUID();
  }
  const length = Math.min(256, Math.max(8, options.length));
  if (options.kind === "hex") {
    const bytes = new Uint8Array(Math.ceil(length / 2));
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, length);
  }
  if (options.kind === "base64") {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "").slice(0, length);
  }

  if (options.kind === "token") {
    const alphabet = filterAmbiguous(UPPER + LOWER + NUM, options.avoidAmbiguous);
    return Array.from({ length }, () => pick(alphabet)).join("");
  }

  let alphabet = "";
  const required: string[] = [];
  if (options.uppercase) {
    const set = filterAmbiguous(UPPER, options.avoidAmbiguous);
    alphabet += set;
    required.push(pick(set));
  }
  if (options.lowercase) {
    const set = filterAmbiguous(LOWER, options.avoidAmbiguous);
    alphabet += set;
    required.push(pick(set));
  }
  if (options.numbers) {
    const set = filterAmbiguous(NUM, options.avoidAmbiguous);
    alphabet += set;
    required.push(pick(set));
  }
  if (options.symbols) {
    const set = filterAmbiguous(SYM, options.avoidAmbiguous);
    alphabet += set;
    required.push(pick(set));
  }
  if (!alphabet) {
    throw new Error("Select at least one character set.");
  }
  const chars = [...required];
  while (chars.length < length) chars.push(pick(alphabet));
  return shuffle(chars).join("").slice(0, length);
}

export const DEFAULT_GENERATOR: GeneratorOptions = {
  kind: "password",
  length: 24,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
  avoidAmbiguous: true,
};
