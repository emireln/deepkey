import { spawn } from "node:child_process";
import { stdin, stdout } from "node:process";

export class IdleLock extends Error {
  constructor() {
    super("Locked due to inactivity.");
    this.name = "IdleLock";
  }
}

let idleLimitMs = -1;
let lastActivity = Date.now();
let clipboardTimer: ReturnType<typeof setTimeout> | null = null;
let lastCopied: string | null = null;

export function setIdleLimit(ms: number): void {
  idleLimitMs = ms;
  lastActivity = Date.now();
}

const color = Boolean(stdout.isTTY) && !process.env.NO_COLOR;
export const animated = Boolean(stdout.isTTY && stdin.isTTY) && !process.env.CI && process.env.NO_ANIM !== "1";

export const esc = {
  hide: "\x1b[?25l",
  show: "\x1b[?25h",
  clear: "\x1b[2J\x1b[H",
  home: "\x1b[H",
  reset: "\x1b[0m",
};

function wrap(code: string, text: string): string {
  return color ? `\x1b[${code}m${text}\x1b[0m` : text;
}

export const ink = {
  dim: (text: string) => wrap("2", text),
  bold: (text: string) => wrap("1", text),
  white: (text: string) => wrap("97", text),
  gray: (text: string) => wrap("90", text),
  red: (text: string) => wrap("31", text),
  reverse: (text: string) => wrap("7;1", text),
};

export function write(text: string): void {
  stdout.write(text);
}

export function line(text = ""): void {
  stdout.write(`${text}\n`);
}

export function clear(): void {
  if (stdout.isTTY) write(esc.clear);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function restoreTerminal(): void {
  if (stdin.isTTY) {
    try {
      stdin.setRawMode(false);
    } catch {
      /* ignore */
    }
  }
  if (stdout.isTTY) write(esc.show + esc.reset);
}

export type Key =
  | { t: "up" | "down" | "left" | "right" | "enter" | "esc" | "backspace" | "tab" }
  | { t: "char"; v: string };

export async function readKey(): Promise<Key> {
  if (!stdin.isTTY) throw new Error("Need a terminal.");
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let buf = "";
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onData = (chunk: string) => {
      buf += chunk;
      if (buf === "\u0003") {
        cleanup();
        reject(new Error("Cancelled."));
        return;
      }
      if (buf === "\x1b") {
        timer = setTimeout(() => {
          cleanup();
          resolve({ t: "esc" });
        }, 30);
        return;
      }
      const idleFor = Date.now() - lastActivity;
      lastActivity = Date.now();
      cleanup();
      if (idleLimitMs >= 0) {
        const limit = idleLimitMs === 0 ? 250 : idleLimitMs;
        if (idleFor >= limit) {
          reject(new IdleLock());
          return;
        }
      }
      resolve(parseKey(buf));
    };
    function cleanup() {
      if (timer) clearTimeout(timer);
      stdin.off("data", onData);
      try {
        stdin.setRawMode(false);
      } catch {
        /* ignore */
      }
    }
    stdin.on("data", onData);
  });
}

function parseKey(chunk: string): Key {
  if (chunk === "\r" || chunk === "\n") return { t: "enter" };
  if (chunk === "\x1b") return { t: "esc" };
  if (chunk === "\x7f" || chunk === "\b") return { t: "backspace" };
  if (chunk === "\t") return { t: "tab" };
  if (chunk === "\x1b[A" || chunk === "\x1bOA") return { t: "up" };
  if (chunk === "\x1b[B" || chunk === "\x1bOB") return { t: "down" };
  if (chunk === "\x1b[C" || chunk === "\x1bOC") return { t: "right" };
  if (chunk === "\x1b[D" || chunk === "\x1bOD") return { t: "left" };
  return { t: "char", v: chunk };
}

export async function waitKey(): Promise<void> {
  await readKey();
}

export async function promptLine(label: string, hidden = false): Promise<string> {
  if (!stdin.isTTY) throw new Error("Need a terminal.");
  write(ink.bold(label));
  if (!hidden) {
    stdin.setRawMode(false);
    stdin.resume();
    stdin.setEncoding("utf8");
    return new Promise((resolve, reject) => {
      const onData = (chunk: string) => {
        stdin.off("data", onData);
        if (chunk === "\u0003") {
          reject(new Error("Cancelled."));
          return;
        }
        const idleFor = Date.now() - lastActivity;
        lastActivity = Date.now();
        if (idleLimitMs >= 0) {
          const limit = idleLimitMs === 0 ? 250 : idleLimitMs;
          if (idleFor >= limit) {
            reject(new IdleLock());
            return;
          }
        }
        resolve(chunk.replace(/\r?\n$/, ""));
      };
      stdin.on("data", onData);
    });
  }
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  let value = "";
  return new Promise((resolve, reject) => {
    const onData = (chunk: string) => {
      if (chunk === "\u0003") {
        cleanup();
        reject(new Error("Cancelled."));
        return;
      }
      if (chunk === "\r" || chunk === "\n") {
        cleanup();
        write("\n");
        const idleFor = Date.now() - lastActivity;
        lastActivity = Date.now();
        if (idleLimitMs >= 0) {
          const limit = idleLimitMs === 0 ? 250 : idleLimitMs;
          if (idleFor >= limit && !value) {
            reject(new IdleLock());
            return;
          }
        }
        resolve(value);
        return;
      }
      if (chunk === "\x7f" || chunk === "\b") {
        if (!value) return;
        value = value.slice(0, -1);
        lastActivity = Date.now();
        write("\b \b");
        return;
      }
      if (chunk.length === 1 && chunk >= " ") {
        value += chunk;
        lastActivity = Date.now();
        write(ink.dim("•"));
      }
    };
    function cleanup() {
      stdin.off("data", onData);
      try {
        stdin.setRawMode(false);
      } catch {
        /* ignore */
      }
    }
    stdin.on("data", onData);
  });
}

export async function pickList(title: string, labels: string[], hint = "↑↓ enter · esc back"): Promise<number | null> {
  if (!labels.length) {
    clear();
    line(ink.bold(title));
    line();
    line(ink.dim("Nothing here."));
    line();
    line(ink.dim("esc / any key to go back"));
    await waitKey();
    return null;
  }
  let index = 0;
  for (;;) {
    clear();
    line(ink.bold(title));
    line(ink.dim(hint));
    line();
    const start = Math.max(0, index - 10);
    const visible = labels.slice(start, start + 16);
    visible.forEach((label, i) => {
      const abs = start + i;
      const marker = abs === index ? "▸ " : "  ";
      const row = `${marker}${label}`;
      line(abs === index ? ink.reverse(` ${row} `) : ink.white(row));
    });
    const key = await readKey();
    if (key.t === "esc") return null;
    if (key.t === "enter") return index;
    if (key.t === "up") index = (index + labels.length - 1) % labels.length;
    if (key.t === "down") index = (index + 1) % labels.length;
    if (key.t === "char" && key.v >= "1" && key.v <= "9") {
      const n = Number(key.v) - 1;
      if (n < labels.length) return n;
    }
  }
}

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export async function withSpinner<T>(label: string, work: Promise<T>): Promise<T> {
  if (!animated) {
    write(ink.dim(`${label}\n`));
    return work;
  }
  write(esc.hide);
  let i = 0;
  const tick = setInterval(() => {
    write(`\r${ink.dim(FRAMES[i % FRAMES.length]!)} ${ink.white(label)}   `);
    i += 1;
  }, 80);
  try {
    return await work;
  } finally {
    clearInterval(tick);
    write(`\r${" ".repeat(label.length + 8)}\r`);
    write(esc.show);
  }
}

function writeClipboard(text: string): Promise<boolean> {
  const cmd = process.platform === "win32" ? "clip" : process.platform === "darwin" ? "pbcopy" : "xclip";
  const args = process.platform === "linux" ? ["-selection", "clipboard"] : [];
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"] });
      child.on("error", () => resolve(false));
      child.on("close", (code) => resolve(code === 0));
      child.stdin.end(text);
    } catch {
      resolve(false);
    }
  });
}

function readClipboard(): Promise<string | null> {
  const cmd =
    process.platform === "win32"
      ? "powershell"
      : process.platform === "darwin"
        ? "pbpaste"
        : "xclip";
  const args =
    process.platform === "win32"
      ? ["-NoProfile", "-Command", "Get-Clipboard -Raw"]
      : process.platform === "linux"
        ? ["-selection", "clipboard", "-o"]
        : [];
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "ignore"] });
      let out = "";
      const timer = setTimeout(() => {
        child.kill();
        resolve(null);
      }, 2000);
      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => {
        out += chunk;
      });
      child.on("error", () => {
        clearTimeout(timer);
        resolve(null);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve(code === 0 ? out : null);
      });
    } catch {
      resolve(null);
    }
  });
}

function sameClipboard(a: string, b: string): boolean {
  return a.replace(/\r\n/g, "\n").trimEnd() === b.replace(/\r\n/g, "\n").trimEnd();
}

export async function copyText(text: string): Promise<boolean> {
  return writeClipboard(text);
}

export async function copySecret(text: string, timeoutMs: number): Promise<boolean> {
  const ok = await writeClipboard(text);
  if (!ok) return false;
  lastCopied = text;
  if (clipboardTimer) clearTimeout(clipboardTimer);
  clipboardTimer = null;
  if (timeoutMs > 0) {
    clipboardTimer = setTimeout(() => {
      void (async () => {
        if (lastCopied !== text) return;
        const current = await readClipboard();
        if (current === null || !sameClipboard(current, text)) return;
        await writeClipboard("");
        if (lastCopied === text) lastCopied = null;
      })();
    }, timeoutMs);
  }
  return true;
}

export function cancelClipboardWatch(): void {
  if (clipboardTimer) clearTimeout(clipboardTimer);
  clipboardTimer = null;
  lastCopied = null;
}
