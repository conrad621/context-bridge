import { stdin, stdout } from "node:process";
import { syncOnce } from "./sync.js";
import { translate } from "./translator.js";
import { findSession, listSessions, resumeCommand } from "./session-index.js";
import { syncTitles } from "./title-sync.js";

const tools = [
  "list_sessions",
  "translate_session",
  "sync_now",
  "find_session",
  "prepare_resume",
  "resume_with_prompt",
];

export function serve(): void {
  let buffer = "";
  stdin.setEncoding("utf8");
  stdin.on("data", (chunk) => {
    buffer += chunk;
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) handleLine(line);
    }
  });
}

function handleLine(line: string): void {
  let req: Record<string, unknown>;
  try { req = JSON.parse(line); } catch { return; }
  const id = req.id;
  const method = String(req.method ?? "");
  if (method === "initialize") return respond(id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "context-bridge", version: "0.6.0" } });
  if (method === "tools/list") return respond(id, { tools: tools.map((name) => ({ name, description: `${name} tool`, inputSchema: { type: "object" } })) });
  if (method === "tools/call") {
    const params = req.params as Record<string, unknown>;
    const name = String(params.name);
    const args = (params.arguments as Record<string, unknown> | undefined) ?? {};
    let result: unknown;
    if (name === "sync_now") result = { title_sync: syncTitles(), ...syncOnce({ direction: String(args.direction ?? "both"), days: Number(args.days ?? 365), max_bytes: Number(args.max_bytes ?? 100 * 1024 * 1024) }) };
    else if (name === "list_sessions") {
      const sessions = listSessions({ harness: String(args.harness ?? "claude-code"), source: String(args.source ?? "all"), days: Number(args.days ?? 365), limit: Number(args.limit ?? 20), include_translated: Boolean(args.include_translated) });
      result = { harness: args.harness ?? "claude-code", count: sessions.length, sessions };
    } else if (name === "find_session") {
      result = findSession(String(args.session_id ?? ""));
    } else if (name === "translate_session") {
      const out = translate({ source_path: String(args.source_path ?? ""), source_harness: String(args.from_harness ?? args.from ?? "claude-code"), target_harness: String(args.to_harness ?? args.to ?? "codex") });
      result = { target_session_id: out.session_id, target_path: out.primary_path, resume_command: out.resume_command, warnings: out.warnings };
    } else if (name === "prepare_resume") {
      const found = findSession(String(args.session_id ?? ""));
      result = found ? { target_session_id: found.session_id, target_path: found.path, harness: found.harness, source_harness: found.source_harness, resume_command: found.resume_command, start_command: found.start_command, launch_context: found.launch_context, cwd: found.cwd, translated: found.translated } : null;
    } else if (name === "resume_with_prompt") {
      const found = findSession(String(args.session_id ?? ""));
      result = found ? { output: "", exit_code: null, target_session_id: found.session_id, command: `${resumeCommand(found.harness, found.session_id, found.cwd)} ${JSON.stringify(String(args.prompt ?? ""))}`, translated: found.translated } : null;
    } else result = { ok: false, error: `unknown tool: ${name}` };
    return respond(id, { content: [{ type: "text", text: JSON.stringify(result) }] });
  }
}

function respond(id: unknown, result: unknown): void {
  stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}
