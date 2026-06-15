import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { deterministicUuid4, deterministicUuid7 } from "./canonical/ids.js";
import { translate } from "./translator.js";
import { encodeCwd, setCcProjects, CC_PROJECTS } from "./adapters/claude-code/render.js";
import { CODEX_HOME, codexPath, setCodexHome } from "./adapters/codex/paths.js";
import * as syncState from "./sync-state.js";
import * as pairMap from "./pair-map.js";
import * as claudeCode from "./adapters/claude-code/index.js";
import * as codex from "./adapters/codex/index.js";

export interface SyncStats {
  translated: number;
  skipped_existing: number;
  skipped_active: number;
  skipped_too_big: number;
  skipped_empty: number;
  skipped_conflict: number;
  failed: number;
  failures: Array<[string, string]>;
}

export function makeStats(): SyncStats {
  return { translated: 0, skipped_existing: 0, skipped_active: 0, skipped_too_big: 0, skipped_empty: 0, skipped_conflict: 0, failed: 0, failures: [] };
}

export function syncOnce(opts: { direction?: string; days?: number; max_bytes?: number; include_active?: boolean; force?: boolean; log?: (...args: unknown[]) => void } = {}): SyncStats {
  const direction = opts.direction ?? "both";
  const cutoff = Date.now() - (opts.days ?? 365) * 86400_000;
  const stats = makeStats();
  if (direction === "cc-to-codex" || direction === "both") for (const p of listCcSessions(cutoff)) tryTranslateOne(p, "claude-code", "codex", opts.max_bytes ?? 100 * 1024 * 1024, stats, opts.force ?? false, opts.log ?? (() => {}));
  if (direction === "codex-to-cc" || direction === "both") for (const p of listCodexSessions(cutoff)) tryTranslateOne(p, "codex", "claude-code", opts.max_bytes ?? 100 * 1024 * 1024, stats, opts.force ?? false, opts.log ?? (() => {}));
  return stats;
}

function tryTranslateOne(source: string, src: string, tgt: string, maxBytes: number, stats: SyncStats, force: boolean, log: (...args: unknown[]) => void): void {
  try {
    const st = statSync(source);
    if (st.size > maxBytes) { stats.skipped_too_big++; return; }
    const [targetPath, targetId] = expectedTarget(source, src, tgt);
    const key = `${src}-to-${tgt}`;
    const fingerprint = fileFingerprint(source);
    const targetFingerprint = existsSync(targetPath) ? fileFingerprint(targetPath) : "";
    if (!force && existsSync(targetPath) && syncState.isUnchanged(source, key, fingerprint)) { stats.skipped_existing++; return; }
    if (!force && existsSync(targetPath) && syncState.targetChanged(source, key, targetPath, targetFingerprint)) {
      stats.skipped_conflict++;
      log(`! ${src}->${tgt}: target modified, skipped ${targetPath}`);
      return;
    }
    const session = src === "claude-code" ? claudeCode.ingest(source) : codex.ingest(source);
    if (!session.moments.length) {
      stats.skipped_empty++;
      if (existsSync(targetPath) && (tgt === "claude-code" ? isAgentBridgeCc(targetPath) : isAgentBridgeCodex(targetPath))) unlinkSync(targetPath);
      return;
    }
    translate({ source_path: source, source_harness: src, target_harness: tgt, session_id: targetId, target_dir: tgt === "claude-code" ? CC_PROJECTS : CODEX_HOME, title_prefix: tgt === "claude-code" ? `[from ${src}] ` : undefined });
    if (src === "claude-code" && tgt === "codex") pairMap.record({ cc_id: path.basename(source, ".jsonl"), codex_id: targetId });
    if (src === "codex" && tgt === "claude-code") pairMap.record({ cc_id: targetId, codex_id: codexSourceId(readHead(source), source) });
    syncState.markTranslated(source, key, fingerprint, targetPath, fileFingerprint(targetPath));
    stats.translated++;
    log(`✓ ${src}->${tgt}: ${path.basename(source)} -> ${targetId}`);
  } catch (e) {
    stats.failed++;
    stats.failures.push([source, e instanceof Error ? e.message : String(e)]);
  }
}

export function expectedTarget(source: string, src: string, tgt: string): [string, string] {
  const head = readHead(source);
  if (src === "claude-code" && tgt === "codex") {
    const started = firstTimestamp(head);
    const id = deterministicUuid7(`cc:${path.basename(source, ".jsonl")}`, started);
    return [codexPath(id, started), id];
  }
  if (src === "codex" && tgt === "claude-code") {
    const cwd = firstCwdCodex(head) ?? homedir();
    const id = deterministicUuid4(`codex:${codexSourceId(head, source)}`);
    return [path.join(CC_PROJECTS, encodeCwd(cwd), `${id}.jsonl`), id];
  }
  throw new Error(`${src}->${tgt} not supported`);
}

function readHead(p: string): Record<string, unknown>[] {
  return readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean).slice(0, 10).map((l) => { try { return JSON.parse(l); } catch { return {}; } });
}

function firstTimestamp(rows: Record<string, unknown>[]): string {
  return String(rows.find((r) => r.timestamp)?.timestamp ?? "2026-01-01T00:00:00.000Z");
}

function firstCwdCodex(rows: Record<string, unknown>[]): string | null {
  for (const r of rows) if (r.type === "session_meta") return String(((r.payload as Record<string, unknown> | undefined)?.cwd) ?? "");
  return null;
}

function codexSourceId(rows: Record<string, unknown>[], p: string): string {
  for (const r of rows) if (r.type === "session_meta" && (r.payload as Record<string, unknown> | undefined)?.id) return String((r.payload as Record<string, unknown>).id);
  return path.basename(p, ".jsonl").split("-").slice(-5).join("-");
}

function listCcSessions(cutoffMs: number): string[] {
  const out: string[] = [];
  if (!existsSync(CC_PROJECTS)) return out;
  for (const proj of childDirs(CC_PROJECTS)) for (const full of childJsonl(proj)) {
    if (statSync(full).mtimeMs >= cutoffMs && !isAgentBridgeCc(full)) out.push(full);
  }
  return out.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
}

function listCodexSessions(cutoffMs: number): string[] {
  const root = path.join(CODEX_HOME, "sessions");
  const out: string[] = [];
  walk(root, out);
  return out.filter((p) => path.basename(p).startsWith("rollout-") && p.endsWith(".jsonl") && statSync(p).mtimeMs >= cutoffMs && !isAgentBridgeCodex(p));
}

function childDirs(dir: string): string[] {
  try { return readdirSync(dir).map((f) => path.join(dir, f)).filter((p) => statSync(p).isDirectory()); } catch { return []; }
}

function childJsonl(dir: string): string[] {
  try { return readdirSync(dir).map((f) => path.join(dir, f)).filter((p) => p.endsWith(".jsonl")); } catch { return []; }
}

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const item of readdirSync(dir)) {
    const full = path.join(dir, item);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
}

export function isAgentBridgeCc(p: string): boolean {
  try {
    const head = readFileSync(p, "utf8").slice(0, 4096);
    return head.includes('"type":"context-bridge-meta"') ||
      head.includes('"type": "context-bridge-meta"') ||
      head.includes("[from ");
  } catch { return false; }
}

export function isAgentBridgeCodex(p: string): boolean {
  try {
    const first = JSON.parse(readFileSync(p, "utf8").split(/\r?\n/)[0]);
    return first.type === "session_meta" && (first.payload?.originator === "context-bridge" || first.payload?.originator === "agent-session-transfer");
  } catch { return false; }
}

export { setCcProjects, setCodexHome };

function fileFingerprint(source: string): string {
  return createHash("sha256").update(readFileSync(source)).digest("hex");
}
