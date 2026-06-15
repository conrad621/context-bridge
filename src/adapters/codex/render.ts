import { appendFileSync, existsSync, mkdirSync, utimesSync } from "node:fs";
import path from "node:path";
import type { Moment, RenderResult, Session } from "../../canonical/schema.js";
import { isoNowZ, uuid7Str } from "../../canonical/ids.js";
import { writeJsonl } from "../../utils/jsonl.js";
import { buildFileState, patchForDelete, patchForEdit, patchForMove, patchForMultiEdit, patchForWrite, toRelative } from "./apply-patch.js";
import { codexPath, CODEX_HOME } from "./paths.js";
import { recordWrite } from "./manifest.js";

export function render(session: Session, opts: { target_dir?: string; session_id?: string; model_provider?: string; timezone_name?: string; copy_mode?: boolean } = {}): RenderResult {
  const id = opts.session_id ?? uuid7Str();
  const home = opts.target_dir ?? CODEX_HOME;
  const outPath = codexPath(id, session.started_at, home);
  const rows: Record<string, unknown>[] = [];
  rows.push({ timestamp: session.started_at, type: "session_meta", payload: { id, timestamp: session.started_at, cwd: session.cwd, ...(opts.copy_mode ? {} : { originator: "context-bridge", source_harness: session.source_harness }), cli_version: "0.1.0", source: "cli", model_provider: opts.model_provider ?? "openai" } });
  rows.push({ timestamp: bumpMs(session.started_at, 1), type: "turn_context", payload: { turn_id: uuid7Str(), cwd: session.cwd, current_date: session.started_at.slice(0, 10), timezone: opts.timezone_name ?? "Asia/Shanghai", approval_policy: session.permissions?.approval ?? "never", sandbox_policy: { type: session.permissions?.sandbox ?? "danger-full-access" }, summary: "none" } });
  const snaps = buildFileState(session.moments);
  for (const m of session.moments) rows.push(...renderMoment(m, session, snaps[m.kind === "tool_call" ? m.call_id : ""]));
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeJsonl(outPath, rows);
  appendThreadName(home, id, makeThreadName(session, opts.copy_mode));
  backdateMtime(outPath, session.ended_at ?? session.started_at);
  recordWrite(outPath, id);
  return { session_id: id, primary_path: outPath, resume_command: `codex exec resume ${id} "<your prompt>" -o /tmp/context-bridge-resume.md`, warnings: [] };
}

function renderMoment(m: Moment, session: Session, fileState?: { get(path: string): string | undefined }): Record<string, unknown>[] {
  if (m.kind === "user_text") {
    const payload = { type: "message", role: "user", content: [{ type: "input_text", text: m.text }] };
    return [{ timestamp: m.ts, type: "response_item", payload }, { timestamp: bumpMs(m.ts, 1), type: "event_msg", payload: { type: "user_message", message: m.text } }];
  }
  if (m.kind === "assistant_text") {
    const payload = { type: "message", role: "assistant", content: [{ type: "output_text", text: m.text }], phase: m.phase ?? "final_answer" };
    return [{ timestamp: m.ts, type: "response_item", payload }, { timestamp: bumpMs(m.ts, 1), type: "event_msg", payload: { type: "agent_message", message: m.text } }];
  }
  if (m.kind === "attachment") {
    const text = m.subtype === "skill_listing" ? summarizeSkillListing(String(m.data?.content ?? "")) : JSON.stringify(m.data ?? {});
    return [{ timestamp: m.ts, type: "response_item", payload: { type: "message", role: "developer", content: [{ type: "input_text", text }] } }];
  }
  if (m.kind === "tool_call") return [{ timestamp: m.ts, type: "response_item", payload: renderToolCall(m, session.cwd, fileState) }];
  if (m.kind === "tool_result") return [{ timestamp: m.ts, type: "response_item", payload: { type: "function_call_output", call_id: m.call_id, output: m.output_text ?? "" } }];
  return [];
}

function renderToolCall(m: Extract<Moment, { kind: "tool_call" }>, cwd: string, fileState?: { get(path: string): string | undefined }): Record<string, unknown> {
  const args = m.args ?? {};
  if (m.tool === "shell") return { type: "function_call", name: "exec_command", arguments: JSON.stringify({ cmd: args.command ?? "", workdir: cwd, yield_time_ms: 1000 }), call_id: m.call_id };
  if (m.tool === "read_file") return { type: "function_call", name: "exec_command", arguments: JSON.stringify({ cmd: `cat -n ${args.path}`, workdir: cwd, yield_time_ms: 1000 }), call_id: m.call_id };
  if (["write_file", "edit_file", "multi_edit_file", "delete_file", "move_file"].includes(m.tool)) {
    const p = String(args.path ?? args.from ?? "");
    const rel = toRelative(p, cwd);
    let input = "";
    if (m.tool === "write_file") input = patchForWrite(rel, String(args.content ?? ""), fileState?.get(p) !== undefined);
    if (m.tool === "edit_file") input = patchForEdit(rel, String(args.old ?? ""), String(args.new ?? ""), fileState?.get(p), Boolean(args.replace_all));
    if (m.tool === "multi_edit_file") input = patchForMultiEdit(rel, (args.edits as Record<string, unknown>[] | undefined) ?? [], fileState?.get(p));
    if (m.tool === "delete_file") input = patchForDelete(rel);
    if (m.tool === "move_file") input = patchForMove(toRelative(String(args.from ?? args.source ?? ""), cwd), toRelative(String(args.to ?? args.destination ?? ""), cwd));
    return { type: "custom_tool_call", name: "apply_patch", call_id: m.call_id, input, status: "completed" };
  }
  return { type: "function_call", name: "exec_command", arguments: JSON.stringify({ cmd: `echo '(translated ${m.tool} call; canonical args: ${JSON.stringify(args)})'`, workdir: cwd }), call_id: m.call_id };
}

function summarizeSkillListing(content: string): string {
  const names = [...content.matchAll(/^- ([^:]+):/gm)].map((m) => `- ${m[1]}`);
  return `Available skills (translated from Claude Code skill_listing attachment):\n${names.join("\n") || content.slice(0, 2000)}`;
}

function makeThreadName(session: Session, copyMode = false): string {
  const custom = (session.source_metadata?.claude_code as Record<string, unknown> | undefined)?.custom_title;
  const body = typeof custom === "string" && custom ? custom : session.moments.find((m) => m.kind === "user_text")?.text.slice(0, 80) ?? session.source_session_id;
  return copyMode ? body : `[from ${session.source_harness}] ${body}`;
}

function appendThreadName(home: string, id: string, name: string): void {
  const p = path.join(home, "session_index.jsonl");
  mkdirSync(path.dirname(p), { recursive: true });
  appendFileSync(p, JSON.stringify({ id, thread_name: name, updated_at: new Date().toISOString() }) + "\n", "utf8");
}

function bumpMs(iso: string, ms: number): string {
  const d = new Date(iso);
  return new Date(d.getTime() + ms).toISOString();
}

function backdateMtime(p: string, iso: string): void {
  const d = new Date(iso);
  if (!Number.isNaN(d.getTime()) && existsSync(p)) utimesSync(p, d, d);
}
