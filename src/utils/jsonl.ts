import { readFileSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function readJsonl(path: string): Record<string, unknown>[] {
  const text = readFileSync(path, "utf8");
  const rows: Record<string, unknown>[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    rows.push(JSON.parse(line) as Record<string, unknown>);
  }
  return rows;
}

export function writeJsonl(path: string, rows: Record<string, unknown>[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
}

export function readJsonFile<T = unknown>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonFile(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2), "utf8");
}

