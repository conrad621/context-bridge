import path from "node:path";
import { homedir } from "node:os";
import { existsSync, statSync, unlinkSync } from "node:fs";
import { readJsonFile, writeJsonFile } from "../../utils/jsonl.js";

export let MANIFEST_PATH = path.join(homedir(), ".cache", "context-bridge", "codex-write-manifest.json");
export function setManifestPath(p: string): void { MANIFEST_PATH = p; }

export function recordWrite(rolloutPath: string, codexId: string): void {
  if (!existsSync(rolloutPath)) return;
  const st = statSync(rolloutPath);
  const data = readJsonFile<Record<string, unknown>>(MANIFEST_PATH, {});
  data[codexId] = { path: rolloutPath, size: st.size, mtime: st.mtimeMs / 1000 };
  writeJsonFile(MANIFEST_PATH, data);
}

export function get(codexId: string): Record<string, unknown> | undefined {
  return readJsonFile<Record<string, Record<string, unknown>>>(MANIFEST_PATH, {})[codexId];
}

export function clear(): void {
  if (existsSync(MANIFEST_PATH)) unlinkSync(MANIFEST_PATH);
}

