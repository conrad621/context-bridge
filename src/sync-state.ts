import path from "node:path";
import { homedir } from "node:os";
import { existsSync, statSync, unlinkSync } from "node:fs";
import { readJsonFile, writeJsonFile } from "./utils/jsonl.js";

export let STATE_PATH = path.join(homedir(), ".cache", "context-bridge", "sync-state.json");
export function setStatePath(p: string): void { STATE_PATH = p; }

export function isUnchanged(source: string, directionKey: string, fingerprint = ""): boolean {
  const rec = readJsonFile<Record<string, Record<string, unknown>>>(STATE_PATH, {})[`${directionKey}|${source}`];
  if (!rec || !existsSync(source)) return false;
  const st = statSync(source);
  return st.size === rec.size && Math.abs(st.mtimeMs / 1000 - Number(rec.mtime ?? 0)) < 1 && (rec.fingerprint ?? "") === fingerprint;
}

export function targetChanged(source: string, directionKey: string, targetPath: string, targetFingerprint = ""): boolean {
  const rec = readJsonFile<Record<string, Record<string, unknown>>>(STATE_PATH, {})[`${directionKey}|${source}`];
  if (!rec || !existsSync(targetPath)) return false;
  return Boolean(rec.target_path) &&
    rec.target_path === targetPath &&
    Boolean(rec.target_fingerprint) &&
    rec.target_fingerprint !== targetFingerprint;
}

export function markTranslated(source: string, directionKey: string, fingerprint = "", targetPath?: string, targetFingerprint = ""): void {
  if (!existsSync(source)) return;
  const st = statSync(source);
  const data = readJsonFile<Record<string, Record<string, unknown>>>(STATE_PATH, {});
  data[`${directionKey}|${source}`] = { size: st.size, mtime: st.mtimeMs / 1000, fingerprint, target_path: targetPath, target_fingerprint: targetFingerprint };
  writeJsonFile(STATE_PATH, data);
}

export function clear(): void {
  if (existsSync(STATE_PATH)) unlinkSync(STATE_PATH);
}
