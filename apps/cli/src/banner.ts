import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { animated, clear, ink, line, sleep, write } from "./term.js";

const FALLBACK = `░███████   ░██████████ ░██████████ ░█████████  ░██     ░██ ░██████████ ░██     ░██
░██   ░██  ░██         ░██         ░██     ░██ ░██    ░██  ░██          ░██   ░██
░██    ░██ ░██         ░██         ░██     ░██ ░██   ░██   ░██           ░██ ░██
░██    ░██ ░█████████  ░█████████  ░█████████  ░███████    ░█████████     ░████
░██    ░██ ░██         ░██         ░██         ░██   ░██   ░██             ░██
░██   ░██  ░██         ░██         ░██         ░██    ░██  ░██             ░██
░███████   ░██████████ ░██████████ ░██         ░██     ░██ ░██████████     ░██`;

const NOISE = "░▒▓█";

export function loadBanner(): string {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "../cli.txt");
  try {
    if (fs.existsSync(file)) {
      const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").trimEnd();
      if (text.trim()) return text;
    }
  } catch {
    /* use fallback */
  }
  return FALLBACK;
}

function paint(lines: string[]): void {
  write("\x1b[H");
  for (const row of lines) line(ink.white(row));
}

export async function playBoot(subtitle: string): Promise<void> {
  const source = loadBanner().split("\n");
  clear();
  if (!animated) {
    for (const row of source) line(ink.white(row));
    line();
    line(ink.dim(subtitle));
    line();
    return;
  }
  write("\x1b[?25l");
  const frames = 14;
  for (let frame = 0; frame <= frames; frame++) {
    const shown = source.map((row) =>
      [...row]
        .map((ch, i) => {
          if (ch === " ") return " ";
          const open = i / Math.max(row.length, 1) <= frame / frames;
          if (open) return ch;
          return NOISE[(i + frame) % NOISE.length]!;
        })
        .join(""),
    );
    paint(shown);
    await sleep(42);
  }
  paint(source);
  line();
  let built = "";
  for (const ch of subtitle) {
    built += ch;
    write(`\r${ink.dim(built)}`);
    await sleep(18);
  }
  write("\n\n\x1b[?25h");
}

export async function playLock(): Promise<void> {
  const source = loadBanner().split("\n");
  if (!animated) return;
  write("\x1b[?25l");
  clear();
  for (let frame = 0; frame <= 10; frame++) {
    const shown = source.map((row) =>
      [...row]
        .map((ch, i) => {
          if (ch === " ") return " ";
          const gone = i / Math.max(row.length, 1) <= frame / 10;
          return gone ? NOISE[(i + frame) % NOISE.length]! : ch;
        })
        .join(""),
    );
    paint(shown);
    await sleep(36);
  }
  clear();
  write("\x1b[?25h");
}

export function printBanner(): void {
  for (const row of loadBanner().split("\n")) line(ink.white(row));
}
