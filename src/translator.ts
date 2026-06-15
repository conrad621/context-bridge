import * as claudeCode from "./adapters/claude-code/index.js";
import * as codex from "./adapters/codex/index.js";

export function translate(opts: { source_path: string; source_harness: string; target_harness: string; target_dir?: string; [k: string]: unknown }) {
  if (opts.source_harness === "claude-code" && opts.target_harness === "codex") {
    const session = claudeCode.ingest(opts.source_path, { follow_subagents: opts.follow_subagents as boolean | undefined });
    return codex.render(session, { target_dir: opts.target_dir, session_id: opts.session_id as string | undefined });
  }
  if (opts.source_harness === "codex" && opts.target_harness === "claude-code") {
    const session = codex.ingest(opts.source_path);
    return claudeCode.render(session, { target_dir: opts.target_dir, session_id: opts.session_id as string | undefined, title_prefix: (opts.title_prefix as string | undefined) ?? `[from ${opts.source_harness}] ` });
  }
  throw new Error(`Direction not implemented: ${opts.source_harness} -> ${opts.target_harness}`);
}

export function copySession(opts: { source_path: string; source_harness: string; target_harness: string; target_dir?: string; [k: string]: unknown }) {
  if (opts.source_harness === "claude-code" && opts.target_harness === "codex") {
    const session = claudeCode.ingest(opts.source_path, { follow_subagents: opts.follow_subagents as boolean | undefined });
    return codex.render(session, { target_dir: opts.target_dir, copy_mode: true });
  }
  if (opts.source_harness === "codex" && opts.target_harness === "claude-code") {
    const session = codex.ingest(opts.source_path);
    return claudeCode.render(session, { target_dir: opts.target_dir, copy_mode: true });
  }
  throw new Error(`Direction not implemented: ${opts.source_harness} -> ${opts.target_harness}`);
}
