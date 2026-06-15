import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { isoNowZ, uuid7Str } from "../../canonical/ids.js";
import { createSession, type Moment, type Session } from "../../canonical/schema.js";
import { ccToolToCanonical, translateArgs } from "./tool-map.js";
import { readJsonl } from "../../utils/jsonl.js";

const DROPPED_TYPES = new Set(["permission-mode", "file-history-snapshot", "last-prompt", "ai-title", "custom-title", "agent-name", "queue-operation"]);

export function ingest(jsonlPath: string, opts: { follow_subagents?: boolean } = {}): Session {
  const rows = readJsonl(jsonlPath);
  if (!rows.length) throw new Error(`Empty or unreadable CC session: ${jsonlPath}`);
  const header = extractHeader(rows);
  const moments = rows.flatMap((row) => translateLine(row, jsonlPath)).sort((a, b) => a.ts.localeCompare(b.ts));
  inferAssistantPhase(moments);
  const subagent_transcripts: Record<string, Moment[]> = {};
  const subagent_meta: Record<string, unknown> = {};
  if (opts.follow_subagents !== false) {
    const sessDir = path.join(path.dirname(jsonlPath), path.basename(jsonlPath, ".jsonl"), "subagents");
    if (existsSync(sessDir)) {
      for (const file of readdirSync(sessDir).filter((f) => f.startsWith("agent-") && f.endsWith(".jsonl"))) {
        const agentId = file.replace(/^agent-/, "").replace(/\.jsonl$/, "");
        const full = path.join(sessDir, file);
        const sub = readJsonl(full).flatMap((row) => translateLine(row, full).map((m) => ({ ...m, agent_scope: `subagent:${agentId}` }))).sort((a, b) => a.ts.localeCompare(b.ts));
        inferAssistantPhase(sub);
        subagent_transcripts[agentId] = sub;
        const metaPath = full.replace(/\.jsonl$/, ".meta.json");
        if (existsSync(metaPath)) {
          try { subagent_meta[agentId] = JSON.parse(readFileSync(metaPath, "utf8")); } catch { subagent_meta[agentId] = {}; }
        }
      }
    }
  }
  return createSession({
    id: uuid7Str(),
    source_harness: "claude-code",
    source_session_id: String(header.session_id ?? path.basename(jsonlPath, ".jsonl")),
    source_session_path: jsonlPath,
    cwd: String(header.cwd ?? process.cwd()),
    git: { branch: header.git_branch as string | undefined, commit: null, repo_url: null },
    model_hint: { provider: "anthropic", name: header.model as string | undefined, reasoning_effort: null },
    started_at: String(header.started_at),
    ended_at: header.ended_at ? String(header.ended_at) : null,
    moments,
    subagent_transcripts,
    source_metadata: { claude_code: { version: header.version, userType: header.user_type, entrypoint: header.entrypoint, custom_title: header.custom_title, agent_name: header.agent_name, subagent_meta } },
  });
}

function extractHeader(rows: Record<string, unknown>[]): Record<string, unknown> {
  const h: Record<string, unknown> = {};
  for (const row of rows) {
    if (row.sessionId && !h.session_id) h.session_id = row.sessionId;
    if (row.cwd && !h.cwd) h.cwd = row.cwd;
    if (row.gitBranch && !h.git_branch) h.git_branch = row.gitBranch;
    if (row.version && !h.version) h.version = row.version;
    if (row.userType && !h.user_type) h.user_type = row.userType;
    if (row.entrypoint && !h.entrypoint) h.entrypoint = row.entrypoint;
    if (row.type === "custom-title" && row.customTitle) h.custom_title = row.customTitle;
    if (row.type === "agent-name" && row.agentName) h.agent_name = row.agentName;
    const msg = row.message as Record<string, unknown> | undefined;
    if (msg?.model && !h.model) h.model = msg.model;
  }
  const timestamps = rows.map((r) => r.timestamp).filter(Boolean).map(String);
  h.started_at = timestamps.length ? timestamps.sort()[0] : isoNowZ();
  h.ended_at = timestamps.length ? timestamps.sort()[timestamps.length - 1] : null;
  return h;
}

function translateLine(row: Record<string, unknown>, srcFile: string): Moment[] {
  const type = row.type;
  if (DROPPED_TYPES.has(String(type))) return [];
  const ts = String(row.timestamp ?? isoNowZ());
  const source_ref = { file: srcFile, uuid: row.uuid };
  if (type === "user") return translateUser(row, ts, source_ref);
  if (type === "assistant") return translateAssistant(row, ts, source_ref);
  if (type === "attachment") return [{ kind: "attachment", ts, source_ref, subtype: String((row.attachment as Record<string, unknown> | undefined)?.type ?? "unknown"), data: row.attachment as Record<string, unknown> }];
  return [];
}

function translateUser(row: Record<string, unknown>, ts: string, source_ref: Record<string, unknown>): Moment[] {
  const msg = row.message as Record<string, unknown> | undefined;
  const content = msg?.content;
  const prompt_id = row.promptId ? String(row.promptId) : null;
  if (typeof content === "string") return [{ kind: "user_text", ts, source_ref, text: content, prompt_id }];
  if (Array.isArray(content)) {
    const out: Moment[] = [];
    for (const block of content as Record<string, unknown>[]) {
      if (block.type === "text") out.push({ kind: "user_text", ts, source_ref, text: String(block.text ?? ""), prompt_id });
      if (block.type === "tool_result") out.push({ kind: "tool_result", ts, source_ref, call_id: String(block.tool_use_id ?? ""), output_text: typeof block.content === "string" ? block.content : JSON.stringify(block.content ?? ""), is_error: Boolean(block.is_error) });
    }
    return out;
  }
  return [];
}

function translateAssistant(row: Record<string, unknown>, ts: string, source_ref: Record<string, unknown>): Moment[] {
  const msg = row.message as Record<string, unknown> | undefined;
  const content = msg?.content;
  const out: Moment[] = [];
  if (!Array.isArray(content)) return out;
  for (const block of content as Record<string, unknown>[]) {
    if (block.type === "text") out.push({ kind: "assistant_text", ts, source_ref, text: String(block.text ?? ""), phase: null });
    if (block.type === "tool_use") {
      const tool = ccToolToCanonical(String(block.name ?? ""));
      out.push({ kind: "tool_call", ts, source_ref, tool, call_id: String(block.id ?? ""), args: translateArgs(tool, (block.input as Record<string, unknown>) ?? {}), wire_native: { harness: "claude-code", name: block.name, input: block.input } });
    }
  }
  return out;
}

function inferAssistantPhase(moments: Moment[]): void {
  for (let i = 0; i < moments.length; i++) {
    const m = moments[i];
    if (m.kind !== "assistant_text") continue;
    let end = moments.length;
    for (let j = i + 1; j < moments.length; j++) if (moments[j].kind === "user_text") { end = j; break; }
    m.phase = moments.slice(i + 1, end).some((x) => x.kind === "tool_call") ? "commentary" : "final_answer";
  }
}

