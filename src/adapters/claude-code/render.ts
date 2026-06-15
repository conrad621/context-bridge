import { existsSync, mkdirSync, readFileSync, statSync, utimesSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { uuid4Str } from "../../canonical/ids.js";
import type { Moment, RenderResult, Session, ToolCall } from "../../canonical/schema.js";
import { writeJsonl } from "../../utils/jsonl.js";

export let CC_PROJECTS = path.join(homedir(), ".claude", "projects");
export function setCcProjects(p: string): void { CC_PROJECTS = p; }

export function encodeCwd(cwd: string): string {
  let resolved = path.resolve(cwd).normalize("NFC");
  return resolved.replace(/\//g, "-");
}

export function render(session: Session, opts: { target_dir?: string; session_id?: string; title_prefix?: string; cc_version?: string; copy_mode?: boolean } = {}): RenderResult {
  const sessId = opts.session_id ?? uuid4Str();
  const root = opts.target_dir ?? CC_PROJECTS;
  const outDir = path.join(root, encodeCwd(session.cwd));
  const outPath = path.join(outDir, `${sessId}.jsonl`);
  if (existsSync(outPath) && !isAgentBridgeCc(outPath)) throw new Error(`Refusing to overwrite real Claude Code session: ${outPath}`);
  const lines: Record<string, unknown>[] = [];
  if (!opts.copy_mode) lines.push({ type: "context-bridge-meta", sessionId: sessId, source_harness: session.source_harness, originator: "context-bridge" });
  const title = makeTitle(session, opts.title_prefix);
  if (title) lines.push({ type: "custom-title", customTitle: title, sessionId: sessId });
  let parent: string | null = null;
  for (const moment of session.moments) {
    for (const row of renderMoment(moment, session, sessId, parent, opts.cc_version ?? "2.1.107")) {
      lines.push(row);
      parent = String(row.uuid ?? parent);
    }
  }
  mkdirSync(outDir, { recursive: true });
  writeJsonl(outPath, lines);
  backdateMtime(outPath, session.ended_at ?? session.started_at);
  return { session_id: sessId, primary_path: outPath, resume_command: `claude --resume ${sessId} -p "<your prompt>"`, warnings: [] };
}

function renderMoment(moment: Moment, session: Session, sessId: string, parent: string | null, version: string): Record<string, unknown>[] {
  const base = { parentUuid: parent, isSidechain: false, uuid: uuid4Str(), timestamp: moment.ts, userType: "external", entrypoint: "cli", cwd: session.cwd, sessionId: sessId, version, gitBranch: session.git?.branch ?? "HEAD" };
  if (moment.kind === "user_text") return [{ ...base, type: "user", message: { role: "user", content: moment.text } }];
  if (moment.kind === "assistant_text") return [{ ...base, type: "assistant", message: { content: [{ text: moment.text, type: "text" }], id: `msg_${uuid4Str().replaceAll("-", "").slice(0, 32)}`, role: "assistant", stop_reason: "end_turn", type: "message" } }];
  if (moment.kind === "tool_call") {
    const [name, input] = canonicalToCcTool(moment);
    return [{ ...base, type: "assistant", message: { content: [{ id: moment.call_id, input, name, type: "tool_use" }], id: `msg_${uuid4Str().replaceAll("-", "").slice(0, 32)}`, role: "assistant", stop_reason: "tool_use", type: "message" } }];
  }
  if (moment.kind === "tool_result") return [{ ...base, type: "user", message: { role: "user", content: [{ tool_use_id: moment.call_id, type: "tool_result", content: moment.output_text ?? "", is_error: moment.is_error ?? false }] } }];
  if (moment.kind === "attachment") return [{ ...base, type: "attachment", attachment: { type: moment.subtype, ...(moment.data ?? {}) } }];
  return [];
}

function canonicalToCcTool(call: ToolCall): [string, Record<string, unknown>] {
  const args = call.args ?? {};
  if (call.wire_native?.harness === "claude-code") return [String(call.wire_native.name), (call.wire_native.input as Record<string, unknown>) ?? args];
  if (call.tool === "shell") return ["Bash", { command: args.command ?? "" }];
  if (call.tool === "read_file") return ["Read", { file_path: args.path ?? "" }];
  if (call.tool === "write_file") return ["Write", { file_path: args.path ?? "", content: args.content ?? "" }];
  if (call.tool === "edit_file") return ["Edit", { file_path: args.path ?? "", old_string: args.old ?? "", new_string: args.new ?? "", replace_all: args.replace_all ?? false }];
  if (call.tool === "multi_edit_file") return ["MultiEdit", { file_path: args.path ?? "", edits: args.edits ?? [] }];
  if (call.tool === "delete_file") return ["Delete", { file_path: args.path ?? "" }];
  if (call.tool === "move_file") return ["Move", { source: args.source ?? args.from ?? "", destination: args.destination ?? args.to ?? "" }];
  if (call.tool === "search_text") return ["Grep", { pattern: args.pattern ?? "", path: args.path ?? "." }];
  if (call.tool === "find_files") return ["Glob", { pattern: args.pattern ?? "*", path: args.path ?? "." }];
  return ["Bash", { command: `echo '(translated unknown tool: ${call.tool})'` }];
}

function makeTitle(session: Session, prefix?: string): string | null {
  const custom = (session.source_metadata?.codex as Record<string, unknown> | undefined)?.thread_name;
  const body = typeof custom === "string" && custom ? custom : session.moments.find((m) => m.kind === "user_text")?.text.slice(0, 80);
  return body ? `${prefix ?? ""}${body}` : null;
}

function isAgentBridgeCc(p: string): boolean {
  try {
    const head = readFileSync(p, "utf8").slice(0, 4096);
    return head.includes('"customTitle":"[from ') || head.includes('"customTitle": "[from ');
  } catch { return false; }
}

function backdateMtime(p: string, iso: string): void {
  const d = new Date(iso);
  if (!Number.isNaN(d.getTime())) utimesSync(p, d, d);
}
