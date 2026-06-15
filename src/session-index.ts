import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { CC_PROJECTS, encodeCwd } from "./adapters/claude-code/render.js";
import { CODEX_HOME } from "./adapters/codex/paths.js";
import { isAgentBridgeCc, isAgentBridgeCodex } from "./sync.js";

export interface SessionSummary {
  harness: "claude-code" | "codex";
  session_id: string;
  path: string;
  cwd: string;
  source_harness: "claude-code" | "codex" | null;
  first_prompt: string | null;
  display_prompt: string | null;
  session_title: string | null;
  start_command: string;
  resume_command: string;
  launch_context: Record<string, unknown>;
  size_bytes: number;
  mtime_iso: string;
  translated: boolean;
}

export function listSessions(opts: { harness?: string; days?: number; limit?: number; include_translated?: boolean; source?: string } = {}): SessionSummary[] {
  const harness = opts.harness ?? "claude-code";
  const cutoff = Date.now() - (opts.days ?? 365) * 86400_000;
  let out: SessionSummary[] = [];
  if (harness === "claude-code" || harness === "both") out.push(...listClaudeCode(cutoff));
  if (harness === "codex" || harness === "both") out.push(...listCodex(cutoff));
  const source = opts.source ?? "all";
  if (source !== "all") out = out.filter((s) => sourceMatches(s.source_harness, source));
  out.sort((a, b) => Date.parse(b.mtime_iso) - Date.parse(a.mtime_iso));
  return out.slice(0, opts.limit ?? 20);
}

export function findSession(sessionId: string): SessionSummary | null {
  return listSessions({ harness: "both", include_translated: true, limit: Number.MAX_SAFE_INTEGER }).find((s) => s.session_id === sessionId) ?? null;
}

export function cleanGenerated(opts: { dry_run?: boolean } = {}): { removed: string[]; skipped: string[] } {
  const removed: string[] = [];
  const skipped: string[] = [];
  for (const s of listSessions({ harness: "both", include_translated: true, limit: Number.MAX_SAFE_INTEGER })) {
    if (!s.translated) continue;
    try {
      if (!opts.dry_run) unlinkSync(s.path);
      removed.push(s.path);
    } catch {
      skipped.push(s.path);
    }
  }
  return { removed, skipped };
}

export function dedupeGenerated(opts: { dry_run?: boolean } = {}): { removed: string[]; skipped: string[] } {
  const seen = new Map<string, SessionSummary>();
  const removed: string[] = [];
  const skipped: string[] = [];
  for (const s of listSessions({ harness: "both", include_translated: true, limit: Number.MAX_SAFE_INTEGER })) {
    if (!s.translated) continue;
    const key = `${s.harness}|${s.cwd}|${displayPrompt(s) ?? ""}`;
    const prev = seen.get(key);
    if (!prev) {
      seen.set(key, s);
      continue;
    }
    const loser = Date.parse(s.mtime_iso) >= Date.parse(prev.mtime_iso) ? prev : s;
    if (loser === prev) seen.set(key, s);
    try {
      if (!opts.dry_run) unlinkSync(loser.path);
      removed.push(loser.path);
    } catch {
      skipped.push(loser.path);
    }
  }
  return { removed, skipped };
}

function listClaudeCode(cutoffMs: number): SessionSummary[] {
  const out: SessionSummary[] = [];
  if (!existsSync(CC_PROJECTS)) return out;
  for (const projectDir of childDirs(CC_PROJECTS)) {
    for (const file of childJsonl(projectDir)) {
      const st = statSync(file);
      if (st.mtimeMs < cutoffMs) continue;
      const rows = readRows(file);
      const first = rows.find((r) => r.cwd) ?? rows.find((r) => r.sessionId) ?? rows[0] ?? {};
      const sessionId = String(first.sessionId ?? path.basename(file, ".jsonl"));
      const cwd = String(first.cwd ?? decodeCwd(path.basename(projectDir)));
      const sourceHarness = bridgeSourceFromClaudeMeta(rows) ?? bridgeSourceFromTitle(rows) ?? null;
      out.push({
        harness: "claude-code",
        session_id: sessionId,
        path: file,
        cwd,
        source_harness: sourceHarness,
        first_prompt: firstClaudeUserPrompt(rows),
        display_prompt: firstMeaningfulClaudeUserPrompt(rows),
        session_title: claudeSessionTitle(rows),
        start_command: startCommand("claude-code", cwd),
        resume_command: resumeCommand("claude-code", sessionId, cwd),
        launch_context: claudeLaunchContext(rows),
        size_bytes: st.size,
        mtime_iso: new Date(st.mtimeMs).toISOString(),
        translated: isAgentBridgeCc(file),
      });
    }
  }
  return out;
}

function listCodex(cutoffMs: number): SessionSummary[] {
  const out: SessionSummary[] = [];
  const root = path.join(CODEX_HOME, "sessions");
  for (const file of walkJsonl(root)) {
    const st = statSync(file);
    if (st.mtimeMs < cutoffMs || !path.basename(file).startsWith("rollout-")) continue;
    const rows = readRows(file);
    const meta = rows.find((r) => r.type === "session_meta")?.payload as Record<string, unknown> | undefined;
    const turn = rows.find((r) => r.type === "turn_context")?.payload as Record<string, unknown> | undefined;
    const sessionId = String(meta?.id ?? codexIdFromFilename(file));
    const cwd = String(meta?.cwd ?? turn?.cwd ?? homedir());
    const rawTitle = readCodexThreadName(sessionId);
    const sourceHarness = bridgeSourceFromTitleString(rawTitle) ?? bridgeSourceFromMeta(meta) ?? null;
    const title = rawTitle ? stripBridgeTitlePrefix(rawTitle) : null;
    out.push({
      harness: "codex",
      session_id: sessionId,
      path: file,
      cwd,
      source_harness: sourceHarness,
      first_prompt: firstCodexUserPrompt(rows),
      display_prompt: firstMeaningfulCodexUserPrompt(rows),
      session_title: title,
      start_command: startCommand("codex", cwd),
      resume_command: resumeCommand("codex", sessionId, cwd),
      launch_context: codexLaunchContext(meta, turn),
      size_bytes: st.size,
      mtime_iso: new Date(st.mtimeMs).toISOString(),
      translated: isAgentBridgeCodex(file),
    });
  }
  return out;
}

export function displayPrompt(session: Pick<SessionSummary, "session_title" | "display_prompt" | "first_prompt">): string | null {
  return meaningfulText(session.session_title) ?? session.display_prompt ?? meaningfulText(session.first_prompt);
}

function claudeSessionTitle(rows: Record<string, unknown>[]): string | null {
  const title = rows.find((row) => row.type === "custom-title" && typeof row.customTitle === "string")?.customTitle;
  return typeof title === "string" && title.trim() ? stripBridgeTitlePrefix(title) : null;
}

function bridgeSourceFromTitle(rows: Record<string, unknown>[]): "claude-code" | "codex" | null {
  const title = rows.find((row) => row.type === "custom-title" && typeof row.customTitle === "string")?.customTitle;
  return typeof title === "string" ? bridgeSourceFromTitleString(title) : null;
}

function bridgeSourceFromClaudeMeta(rows: Record<string, unknown>[]): "claude-code" | "codex" | null {
  const meta = rows.find((row) => row.type === "context-bridge-meta");
  const source = meta?.source_harness ?? meta?.sourceHarness;
  return source === "claude-code" || source === "codex" ? source : null;
}

function bridgeSourceFromTitleString(value: string | null): "claude-code" | "codex" | null {
  const match = value?.match(/^\[from (claude-code|codex)\]\s*/);
  return (match?.[1] as "claude-code" | "codex" | undefined) ?? null;
}

function bridgeSourceFromMeta(meta?: Record<string, unknown>): "claude-code" | "codex" | null {
  if (meta?.originator !== "context-bridge" && meta?.originator !== "agent-session-transfer") return null;
  const source = meta.source_harness ?? meta.sourceHarness;
  return source === "claude-code" || source === "codex" ? source : null;
}

export function sourceDisplay(source: "claude-code" | "codex" | null): string {
  if (source === "claude-code") return "claude";
  if (source === "codex") return "codex";
  return "";
}

function sourceMatches(source: "claude-code" | "codex" | null, filter: string): boolean {
  if (filter === "native" || filter === "local") return source == null;
  if (filter === "claude" || filter === "claude-code") return source === "claude-code";
  if (filter === "codex") return source === "codex";
  return false;
}

function firstClaudeUserPrompt(rows: Record<string, unknown>[]): string | null {
  for (const row of rows) {
    if (row.type !== "user") continue;
    const prompt = claudeUserPrompt(row);
    if (prompt) return prompt;
  }
  return null;
}

function firstMeaningfulClaudeUserPrompt(rows: Record<string, unknown>[]): string | null {
  for (const row of rows) {
    if (row.type !== "user") continue;
    const prompt = claudeUserPrompt(row);
    if (prompt && !isBootstrapPrompt(prompt)) return prompt;
  }
  return null;
}

function claudeUserPrompt(row: Record<string, unknown>): string | null {
  const msg = row.message as Record<string, unknown> | undefined;
  if (typeof msg?.content === "string" && msg.content.trim()) return msg.content;
  if (Array.isArray(msg?.content)) {
    const text = msg.content.find((b) => typeof b === "object" && b && (b as Record<string, unknown>).type === "text") as Record<string, unknown> | undefined;
    if (typeof text?.text === "string" && text.text.trim()) return text.text;
  }
  return null;
}

function claudeLaunchContext(rows: Record<string, unknown>[]): Record<string, unknown> {
  const first = rows.find((r) => r.cwd || r.entrypoint || r.version || r.userType) ?? {};
  const model = rows.map((r) => (r.message as Record<string, unknown> | undefined)?.model).find((v) => typeof v === "string");
  return compactObject({
    executable: "claude",
    entrypoint: first.entrypoint,
    version: first.version,
    user_type: first.userType,
    model,
    git_branch: first.gitBranch,
    inferred: true,
    note: "Session files do not preserve the exact original shell argv; commands are reconstructed from session metadata.",
  });
}

function codexLaunchContext(meta?: Record<string, unknown>, turn?: Record<string, unknown>): Record<string, unknown> {
  const sandbox = turn?.sandbox_policy as Record<string, unknown> | undefined;
  return compactObject({
    executable: "codex",
    originator: meta?.originator,
    source: meta?.source,
    cli_version: meta?.cli_version,
    model_provider: meta?.model_provider,
    model: turn?.model,
    reasoning_effort: turn?.effort,
    approval_policy: turn?.approval_policy,
    sandbox: sandbox?.type,
    timezone: turn?.timezone,
    inferred: true,
    note: "Session files do not preserve the exact original shell argv; commands are reconstructed from session metadata.",
  });
}

export function startCommand(harness: "claude-code" | "codex" | string, cwd: string): string {
  const executable = harness === "codex" ? "codex" : "claude";
  return `cd ${shellQuote(cwd)} && ${executable}`;
}

export function resumeCommand(harness: "claude-code" | "codex" | string, sessionId: string, cwd?: string): string {
  const command = harness === "codex" ? `codex exec resume ${shellQuote(sessionId)} "<your prompt>"` : `claude --resume ${shellQuote(sessionId)} -p "<your prompt>"`;
  return cwd ? `cd ${shellQuote(cwd)} && ${command}` : command;
}

function compactObject(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value != null && value !== ""));
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function firstCodexUserPrompt(rows: Record<string, unknown>[]): string | null {
  for (const row of rows) {
    const prompt = codexUserPrompt(row);
    if (prompt) return prompt;
  }
  return null;
}

function firstMeaningfulCodexUserPrompt(rows: Record<string, unknown>[]): string | null {
  for (const row of rows) {
    const prompt = codexUserPrompt(row);
    if (prompt && !isBootstrapPrompt(prompt)) return prompt;
  }
  return null;
}

function codexUserPrompt(row: Record<string, unknown>): string | null {
    const payload = row.payload as Record<string, unknown> | undefined;
    if (row.type === "response_item" && payload?.type === "message" && payload.role === "user") {
      const content = payload.content as Record<string, unknown>[] | undefined;
      const text = content?.find((c) => c.type === "input_text");
      if (typeof text?.text === "string" && text.text.trim()) return text.text;
    }
  return null;
}

function isBootstrapPrompt(value: string): boolean {
  const text = value.trim();
  return text.startsWith("# AGENTS.md instructions for ") ||
    text.startsWith("<INSTRUCTIONS>") ||
    text.startsWith("<environment_context>") ||
    text.startsWith("<permissions instructions>") ||
    /^<(?:command-message|command-name|command-args)>[\s\S]*?<\/(?:command-message|command-name|command-args)>/.test(text) ||
    /^<local-command-[a-z-]+>/.test(text);
}

function meaningfulText(value: string | null): string | null {
  if (!value) return null;
  return isBootstrapPrompt(value) ? null : value;
}

function readCodexThreadName(sessionId: string): string | null {
  const idx = path.join(CODEX_HOME, "session_index.jsonl");
  if (!existsSync(idx)) return null;
  let found: string | null = null;
  for (const line of readFileSync(idx, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      const name = String(row.thread_name ?? "").trim();
      if (row.id === sessionId && name) found = name;
    } catch {}
  }
  return found;
}

function stripBridgeTitlePrefix(value: string): string {
  return value.replace(/^\[from [^\]]+\]\s*/, "").trim();
}

function childDirs(dir: string): string[] {
  try { return readdirSync(dir).map((f) => path.join(dir, f)).filter((p) => statSync(p).isDirectory()); } catch { return []; }
}

function childJsonl(dir: string): string[] {
  try { return readdirSync(dir).map((f) => path.join(dir, f)).filter((p) => p.endsWith(".jsonl")); } catch { return []; }
}

function walkJsonl(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const item of readdirSync(dir)) {
    const full = path.join(dir, item);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walkJsonl(full));
    else if (full.endsWith(".jsonl")) out.push(full);
  }
  return out;
}

function readRows(file: string): Record<string, unknown>[] {
  try {
    return readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { return {}; }
    });
  } catch {
    return [];
  }
}

function codexIdFromFilename(file: string): string {
  const name = path.basename(file, ".jsonl");
  return name.replace(/^rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-/, "");
}

function decodeCwd(encoded: string): string {
  return encoded.startsWith("-") ? encoded.replace(/-/g, "/") : encoded;
}

export function expectedClaudeCodePath(cwd: string, sessionId: string): string {
  return path.join(CC_PROJECTS, encodeCwd(cwd), `${sessionId}.jsonl`);
}
