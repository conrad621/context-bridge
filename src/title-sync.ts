import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { CODEX_HOME } from "./adapters/codex/paths.js";
import { CC_PROJECTS } from "./adapters/claude-code/render.js";
import { read as readPairMap } from "./pair-map.js";
import { findSession } from "./session-index.js";

export function syncTitles(): { updated_codex: number; updated_claude_code: number } {
  let updated_codex = 0;
  let updated_claude_code = 0;
  const pairs = readPairMap();
  for (const [ccId, codexId] of Object.entries(pairs.cc_to_codex)) {
    const cc = findSession(ccId);
    const codex = findSession(codexId);
    if (!cc && !codex) continue;
    const ccTitle = cc ? readClaudeTitle(cc.path) ?? cc.session_title ?? cc.first_prompt : null;
    const codexTitle = codex ? readCodexTitle(codexId) ?? codex.session_title ?? codex.first_prompt : null;
    if (ccTitle && codex && codexTitle !== ccTitle) {
      appendCodexTitle(codexId, ccTitle);
      updated_codex++;
    }
    if (codexTitle && cc && ccTitle !== codexTitle && cc.translated) {
      appendClaudeTitle(cc.path, ccId, codexTitle);
      updated_claude_code++;
    }
  }
  return { updated_codex, updated_claude_code };
}

function readClaudeTitle(file: string): string | null {
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      const row = JSON.parse(line);
      if (row.type === "custom-title" && typeof row.customTitle === "string") return row.customTitle.replace(/^\[from [^\]]+\]\s*/, "");
      if (row.type !== "custom-title") break;
    }
  } catch {}
  return null;
}

function appendClaudeTitle(file: string, sessionId: string, title: string): void {
  appendFileSync(file, JSON.stringify({ type: "custom-title", customTitle: title, sessionId }) + "\n", "utf8");
}

function readCodexTitle(id: string): string | null {
  const p = path.join(CODEX_HOME, "session_index.jsonl");
  if (!existsSync(p)) return null;
  let found: string | null = null;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row.id === id && typeof row.thread_name === "string") found = row.thread_name.replace(/^\[from [^\]]+\]\s*/, "");
    } catch {}
  }
  return found;
}

function appendCodexTitle(id: string, title: string): void {
  const p = path.join(CODEX_HOME, "session_index.jsonl");
  mkdirSync(path.dirname(p), { recursive: true });
  appendFileSync(p, JSON.stringify({ id, thread_name: title, updated_at: new Date().toISOString() }) + "\n", "utf8");
}
