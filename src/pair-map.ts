import path from "node:path";
import { homedir } from "node:os";
import { existsSync, unlinkSync } from "node:fs";
import { readJsonFile, writeJsonFile } from "./utils/jsonl.js";

export let PAIR_MAP_PATH = path.join(homedir(), ".cache", "context-bridge", "pair-map.json");
export function setPairMapPath(p: string): void { PAIR_MAP_PATH = p; }

export function read(): { cc_to_codex: Record<string, string>; codex_to_cc: Record<string, string> } {
  const data = readJsonFile<{ cc_to_codex?: Record<string, string>; codex_to_cc?: Record<string, string> }>(PAIR_MAP_PATH, {});
  return { cc_to_codex: data.cc_to_codex ?? {}, codex_to_cc: data.codex_to_cc ?? {} };
}

export function record(pair: { cc_id: string; codex_id: string }): void {
  const data = read();
  data.cc_to_codex[pair.cc_id] = pair.codex_id;
  data.codex_to_cc[pair.codex_id] = pair.cc_id;
  writeJsonFile(PAIR_MAP_PATH, data);
}

export function clear(): void {
  if (existsSync(PAIR_MAP_PATH)) unlinkSync(PAIR_MAP_PATH);
}
