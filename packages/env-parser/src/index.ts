import type { EnvEntry, EnvParseResult } from "@deepkey/types";

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.]*$/;

function unescapeDouble(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function parseQuoted(source: string, quote: "'" | '"', start: number): { value: string; end: number; error?: string } {
  let i = start + 1;
  let value = "";
  while (i < source.length) {
    const ch = source[i];
    if (quote === "'" && ch === "'") {
      return { value, end: i + 1 };
    }
    if (quote === '"' && ch === "\\") {
      const next = source[i + 1];
      if (next === undefined) {
        return { value, end: i, error: "Unterminated escape." };
      }
      if (next === "n") value += "\n";
      else if (next === "r") value += "\r";
      else if (next === "t") value += "\t";
      else if (next === '"') value += '"';
      else if (next === "\\") value += "\\";
      else value += next;
      i += 2;
      continue;
    }
    if (quote === '"' && ch === '"') {
      return { value, end: i + 1 };
    }
    if (ch === "\n" && quote === "'") {
      return { value, end: i, error: "Unterminated single-quoted value." };
    }
    value += ch;
    i += 1;
  }
  return { value, end: i, error: "Unterminated quoted value." };
}

export function parseEnv(source: string): EnvParseResult {
  const entries: EnvEntry[] = [];
  const comments: { line: number; text: string }[] = [];
  const errors: { line: number; message: string }[] = [];
  const seen = new Map<string, number>();
  const duplicates: string[] = [];

  const lines = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const lineNumber = i + 1;
    const raw = lines[i] ?? "";
    const trimmed = raw.trim();
    if (!trimmed) {
      i += 1;
      continue;
    }
    if (trimmed.startsWith("#")) {
      comments.push({ line: lineNumber, text: trimmed.slice(1).trim() });
      i += 1;
      continue;
    }

    let body = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const eq = body.indexOf("=");
    if (eq <= 0) {
      errors.push({ line: lineNumber, message: "Missing KEY=value assignment." });
      i += 1;
      continue;
    }

    const key = body.slice(0, eq).trim();
    if (!KEY_RE.test(key)) {
      errors.push({ line: lineNumber, message: `Invalid key "${key}".` });
      i += 1;
      continue;
    }

    let rest = body.slice(eq + 1);
    let comment: string | null = null;
    let value = "";

    const first = rest.trimStart();
    if (first.startsWith('"') || first.startsWith("'")) {
      const quote = first[0] as "'" | '"';
      const startInLine = raw.indexOf(quote);
      if (quote === '"') {
        let assembled = raw.slice(startInLine);
        let consumed = i;
        let parsed = parseQuoted(assembled, '"', 0);
        while (parsed.error === "Unterminated quoted value." && consumed + 1 < lines.length) {
          consumed += 1;
          assembled += `\n${lines[consumed]}`;
          parsed = parseQuoted(assembled, '"', 0);
        }
        if (parsed.error) {
          errors.push({ line: lineNumber, message: parsed.error });
          i += 1;
          continue;
        }
        value = parsed.value;
        const after = assembled.slice(parsed.end).trim();
        if (after.startsWith("#")) comment = after.slice(1).trim();
        i = consumed + 1;
      } else {
        const parsed = parseQuoted(first, "'", 0);
        if (parsed.error) {
          errors.push({ line: lineNumber, message: parsed.error });
          i += 1;
          continue;
        }
        value = parsed.value;
        const after = first.slice(parsed.end).trim();
        if (after.startsWith("#")) comment = after.slice(1).trim();
        i += 1;
      }
    } else {
      const hash = rest.indexOf(" #");
      if (hash >= 0) {
        comment = rest.slice(hash + 2).trim();
        rest = rest.slice(0, hash);
      }
      value = rest.trim();
      if (
        (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
        (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
      ) {
        const q = value[0];
        value = q === '"' ? unescapeDouble(value.slice(1, -1)) : value.slice(1, -1);
      }
      i += 1;
    }

    if (seen.has(key) && !duplicates.includes(key)) duplicates.push(key);
    seen.set(key, (seen.get(key) ?? 0) + 1);
    entries.push({
      key,
      value,
      comment,
      enabled: true,
      line: lineNumber,
    });
  }

  return { entries, comments, duplicates, errors };
}

export function needsQuotes(value: string): boolean {
  if (value === "") return true;
  return /[\s#'"`$\\]/.test(value) || value.includes("\n") || value.startsWith("export ");
}

export function serializeValue(value: string): string {
  if (value.includes("\n") || value.includes("\r") || value.includes('"') || value.includes("\\")) {
    const escaped = value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r");
    return `"${escaped}"`;
  }
  if (needsQuotes(value)) {
    return `"${value}"`;
  }
  return value;
}

export function serializeEnv(entries: EnvEntry[]): string {
  const lines: string[] = [];
  for (const entry of entries) {
    if (!entry.enabled) continue;
    const assignment = `${entry.key}=${serializeValue(entry.value)}`;
    if (entry.comment) {
      lines.push(`${assignment} # ${entry.comment}`);
    } else {
      lines.push(assignment);
    }
  }
  return lines.join("\n") + (lines.length ? "\n" : "");
}

export function envEntriesToMap(entries: EnvEntry[]): Map<string, EnvEntry> {
  const map = new Map<string, EnvEntry>();
  for (const entry of entries) {
    map.set(entry.key, entry);
  }
  return map;
}
