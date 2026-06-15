import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { isoNowZ, uuid7Str } from "../../canonical/ids.js";
import { createSession, type Moment, type Session } from "../../canonical/schema.js";
import { readJsonl } from "../../utils/jsonl.js";
import { CODEX_HOME } from "./paths.js";
import { parseApplyPatch } from "./apply-patch-parser.js";

const SKIP_TYPES = new Set(["session_meta", "turn_context"]);
const EVENT_DUPES = new Set(["user_message", "agent_message", "exec_command_end", "patch_apply_end", "web_search_end", "task_started", "task_complete", "turn_started", "turn_complete", "token_count", "thread_name_updated", "thread_rolled_back", "turn_aborted", "view_image_tool_call", "context_compacted"]);

export function ingest(jsonlPath: string): Session {
  const rows = readJsonl(jsonlPath);
  if (!rows.length) throw new Error(`Empty or unreadable Codex session: ${jsonlPath}`);
  const metaLine = rows.find((r) => r.type === "session_meta") ?? rows[0];
  const meta = (metaLine.payload as Record<string, unknown> | undefined) ?? {};
  const turn = ((rows.find((r) => r.type === "turn_context")?.payload ?? {}) as Record<string, unknown>);
  const cwd = String(meta.cwd ?? path.dirname(jsonlPath));
  const moments = rows.flatMap((row) => translateLine(row, jsonlPath, cwd)).sort((a, b) => a.ts.localeCompare(b.ts));
  return createSession({
    id: uuid7Str(),
    source_harness: "codex",
    source_session_id: String(meta.id ?? path.basename(jsonlPath, ".jsonl")),
    source_session_path: jsonlPath,
    cwd,
    git: {
      branch: ((meta.git as Record<string, unknown> | undefined)?.branch as string | undefined) ?? null,
      commit: ((meta.git as Record<string, unknown> | undefined)?.commit_hash as string | undefined) ?? null,
      repo_url: ((meta.git as Record<string, unknown> | undefined)?.repository_url as string | undefined) ?? null,
    },
    model_hint: { provider: "openai", name: turn.model as string | undefined, reasoning_effort: turn.effort as string | undefined },
    started_at: String(meta.timestamp ?? isoNowZ()),
    ended_at: rows.at(-1)?.timestamp ? String(rows.at(-1)?.timestamp) : null,
    permissions: { approval: turn.approval_policy as string | undefined, sandbox: (turn.sandbox_policy as Record<string, unknown> | undefined)?.type as string | undefined },
    moments,
    source_metadata: { codex: { originator: meta.originator, cli_version: meta.cli_version, source: meta.source, model_provider: meta.model_provider, thread_name: readCodexThreadName(meta.id ? String(meta.id) : null) } },
  });
}

export function readCodexThreadName(sessionId: string | null): string | null {
  if (!sessionId) return null;
  const idx = path.join(CODEX_HOME, "session_index.jsonl");
  if (!existsSync(idx)) return null;
  let found: string | null = null;
  for (const line of readFileSync(idx, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const ev = JSON.parse(line);
      const name = String(ev.thread_name ?? "");
      if (ev.id === sessionId && name && !name.startsWith("[from ")) found = name;
    } catch {}
  }
  return found;
}

function translateLine(row: Record<string, unknown>, srcFile: string, cwd: string): Moment[] {
  if (SKIP_TYPES.has(String(row.type))) return [];
  const ts = String(row.timestamp ?? isoNowZ());
  const payload = (row.payload as Record<string, unknown> | undefined) ?? {};
  const source_ref = { file: srcFile };
  if (row.type === "event_msg") {
    const sub = payload.type;
    if (EVENT_DUPES.has(String(sub))) return [];
    if (sub === "error") return [{ kind: "error", ts, source_ref, message: String(payload.message ?? "") }];
    return [];
  }
  if (row.type === "compacted") return [{ kind: "summary_compaction", ts, source_ref, summary_text: "(codex remote compaction; encrypted_content not portable)", lossy: true, lossy_reason: "pre-compaction history not preserved across harnesses" }];
  if (row.type !== "response_item") return [];
  return translateResponseItem(payload, ts, source_ref, cwd);
}

function translateResponseItem(payload: Record<string, unknown>, ts: string, source_ref: Record<string, unknown>, cwd: string): Moment[] {
  if (payload.type === "message") return translateMessage(payload, ts, source_ref);
  if (payload.type === "reasoning") {
    const text = ((payload.summary as Record<string, unknown>[] | undefined) ?? []).map((s) => s.text).filter(Boolean).join("\n");
    return text ? [{ kind: "thinking", ts, source_ref, text, format: "summary", lossy: true, lossy_reason: "harness-specific signature/encrypted_content not portable" }] : [];
  }
  if (payload.type === "function_call") {
    const raw = payload.arguments;
    let args: Record<string, unknown> = {};
    try { args = typeof raw === "string" ? JSON.parse(raw) : (raw as Record<string, unknown>) ?? {}; } catch { args = { _raw: raw }; }
    const [tool, mapped] = codexFnToCanonical(String(payload.name ?? ""), args, cwd, payload.namespace ? String(payload.namespace) : undefined);
    return [{ kind: "tool_call", ts, source_ref, tool, call_id: String(payload.call_id ?? ""), args: mapped, wire_native: { harness: "codex", name: payload.name, namespace: payload.namespace, input: args } }];
  }
  if (payload.type === "function_call_output" || payload.type === "custom_tool_call_output") return [{ kind: "tool_result", ts, source_ref, call_id: String(payload.call_id ?? ""), output_text: normalizeOutput(payload.output) }];
  if (payload.type === "custom_tool_call") return translateCustomToolCall(payload, ts, source_ref);
  if (payload.type === "web_search_call") return [{ kind: "tool_call", ts, source_ref, tool: "web_search", call_id: String(payload.call_id ?? `ws_${ts}`), args: { query: ((payload.action as Record<string, unknown> | undefined)?.query ?? "") }, wire_native: { harness: "codex", name: "web_search", input: payload } }];
  return [];
}

function translateMessage(payload: Record<string, unknown>, ts: string, source_ref: Record<string, unknown>): Moment[] {
  const text = ((payload.content as Record<string, unknown>[] | undefined) ?? []).filter((c) => c.type === "input_text" || c.type === "output_text").map((c) => String(c.text ?? "")).join("\n");
  if (payload.role === "user") return [{ kind: "user_text", ts, source_ref, text }];
  if (payload.role === "assistant") return [{ kind: "assistant_text", ts, source_ref, text, phase: (payload.phase as "commentary" | "final_answer" | undefined) ?? null }];
  return [{ kind: "attachment", ts, source_ref, subtype: `${String(payload.role ?? "unknown")}_note`, data: { text } }];
}

function codexFnToCanonical(name: string, args: Record<string, unknown>, cwd: string, namespace?: string): [string, Record<string, unknown>] {
  if (namespace) return ["mcp_call", { server: namespace, tool: name, args }];
  if (["exec_command", "shell", "shell_command", "local_shell"].includes(name)) return classifyShellCmd(String(args.cmd ?? args.command ?? ""), args, cwd);
  if (name === "update_plan") return ["update_plan", { items: ((args.plan as Record<string, unknown>[] | undefined) ?? []).map((p) => ({ title: p.step ?? "", status: p.status ?? "pending" })) }];
  if (name === "view_image") return ["view_image", { path: args.path ?? "" }];
  return ["shell", { command: `echo '(codex tool ${name} args: ${JSON.stringify(args)})'` }];
}

function classifyShellCmd(cmd: string, args: Record<string, unknown>, cwd: string): [string, Record<string, unknown>] {
  const s = cmd.trim();
  if (s.startsWith("rg --files")) return ["find_files", { pattern: "*", path: "." }];
  if (s.startsWith("rg ")) return ["search_text", { pattern: s.split(/\s+/)[1] ?? "", path: "." }];
  if (s.startsWith("cat ")) return ["read_file", { path: s.split(/\s+/).at(-1) ?? "" }];
  return ["shell", { command: cmd, workdir: args.workdir ?? cwd }];
}

function translateCustomToolCall(payload: Record<string, unknown>, ts: string, source_ref: Record<string, unknown>): Moment[] {
  if (payload.name !== "apply_patch") return [{ kind: "tool_call", ts, source_ref, tool: "shell", call_id: String(payload.call_id ?? ""), args: { command: `echo '(custom tool ${payload.name})'` } }];
  const out: Moment[] = [];
  const ops = parseApplyPatch(String(payload.input ?? ""));
  ops.forEach((op, idx) => {
    const call_id = `${String(payload.call_id ?? "call_p")}__${idx}`;
    if (op.kind === "add") out.push({ kind: "tool_call", ts, source_ref, tool: "write_file", call_id, args: { path: op.path, content: (op.add_lines ?? []).join("\n") + ((op.add_lines?.length ?? 0) ? "\n" : "") } });
    if (op.kind === "delete") out.push({ kind: "tool_call", ts, source_ref, tool: "delete_file", call_id, args: { path: op.path } });
    if (op.kind === "update" && op.move_to) out.push({ kind: "tool_call", ts, source_ref, tool: "move_file", call_id, args: { from: op.path, to: op.move_to } });
    else if (op.kind === "update") {
      const hunks = op.hunks ?? [];
      if (hunks.length > 1) out.push({ kind: "tool_call", ts, source_ref, tool: "multi_edit_file", call_id, args: { path: op.path, edits: hunks.map((h) => ({ old: h.lines.filter((l) => l.op === "-").map((l) => l.text).join("\n"), new: h.lines.filter((l) => l.op === "+").map((l) => l.text).join("\n") })) } });
      else out.push({ kind: "tool_call", ts, source_ref, tool: "edit_file", call_id, args: { path: op.path, old: hunks[0]?.lines.filter((l) => l.op === "-").map((l) => l.text).join("\n") ?? "", new: hunks[0]?.lines.filter((l) => l.op === "+").map((l) => l.text).join("\n") ?? "" } });
    }
  });
  return out;
}

function normalizeOutput(v: unknown): string {
  if (typeof v !== "string") return JSON.stringify(v ?? "");
  try {
    const parsed = JSON.parse(v);
    if (typeof parsed === "object" && parsed && "output" in parsed) return String((parsed as Record<string, unknown>).output ?? "");
  } catch {}
  return v;
}

