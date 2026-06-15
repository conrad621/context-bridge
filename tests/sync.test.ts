import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { encodeCwd, setCcProjects } from "../src/adapters/claude-code/render.js";
import { setCodexHome } from "../src/adapters/codex/paths.js";
import { setStatePath, markTranslated } from "../src/sync-state.js";
import { expectedTarget, syncOnce } from "../src/sync.js";
import { read as readPairMap, setPairMapPath } from "../src/pair-map.js";
import { displayPrompt, listSessions } from "../src/session-index.js";

function writeCcSession(file: string, sessionId = "cc-sync-1"): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const rows = [
    { type: "user", sessionId, uuid: "u1", parentUuid: null, cwd: "/tmp/project", timestamp: "2026-05-13T01:00:00.000Z", message: { role: "user", content: "first prompt" } },
    { type: "assistant", sessionId, uuid: "a1", parentUuid: "u1", cwd: "/tmp/project", timestamp: "2026-05-13T01:00:01.000Z", message: { role: "assistant", content: [{ type: "text", text: "first answer" }] } },
  ];
  writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

function writeCodexSession(file: string, sessionId = "codex-sync-1"): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, [
    JSON.stringify({ timestamp: "2026-05-13T01:00:00.000Z", type: "session_meta", payload: { id: sessionId, cwd: "/tmp/project" } }),
    JSON.stringify({ timestamp: "2026-05-13T01:00:01.000Z", type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "codex prompt" }] } }),
    JSON.stringify({ timestamp: "2026-05-13T01:00:02.000Z", type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "codex answer" }] } }),
  ].join("\n") + "\n");
}

test("sync rewrites missing target even when source marked unchanged", () => {
  const root = mkdtempSync(path.join(tmpdir(), "context-bridge-sync-"));
  const ccRoot = path.join(root, "home", ".claude", "projects");
  const codexHome = path.join(root, "home", ".codex");
  setCcProjects(ccRoot);
  setCodexHome(codexHome);
  setStatePath(path.join(root, "cache", "sync-state.json"));
  setPairMapPath(path.join(root, "cache", "pair-map.json"));
  const source = path.join(ccRoot, encodeCwd("/tmp/project"), "cc-sync-1.jsonl");
  writeCcSession(source);
  markTranslated(source, "claude-code-to-codex", "");
  const [target] = expectedTarget(source, "claude-code", "codex");
  const stats = syncOnce({ direction: "cc-to-codex", days: 365, log: () => {} });
  assert.equal(stats.translated, 1);
  assert.ok(statSync(target).isFile());
});

test("sync force rewrites existing short target", () => {
  const root = mkdtempSync(path.join(tmpdir(), "context-bridge-sync-"));
  const ccRoot = path.join(root, "home", ".claude", "projects");
  const codexHome = path.join(root, "home", ".codex");
  setCcProjects(ccRoot);
  setCodexHome(codexHome);
  setStatePath(path.join(root, "cache", "sync-state.json"));
  const source = path.join(ccRoot, encodeCwd("/tmp/project"), "cc-sync-1.jsonl");
  writeCcSession(source);
  assert.equal(syncOnce({ direction: "cc-to-codex", days: 365, log: () => {} }).translated, 1);
  const [target] = expectedTarget(source, "claude-code", "codex");
  const full = statSync(target).size;
  writeFileSync(target, readFileSync(target, "utf8").split(/\r?\n/)[0] + "\n");
  assert.equal(syncOnce({ direction: "cc-to-codex", days: 365, log: () => {} }).skipped_existing, 1);
  assert.ok(statSync(target).size < full);
  assert.equal(syncOnce({ direction: "cc-to-codex", days: 365, force: true, log: () => {} }).translated, 1);
  assert.equal(statSync(target).size, full);
});

test("sync detects source content changes and records pair map", () => {
  const root = mkdtempSync(path.join(tmpdir(), "context-bridge-sync-"));
  const ccRoot = path.join(root, "home", ".claude", "projects");
  const codexHome = path.join(root, "home", ".codex");
  setCcProjects(ccRoot);
  setCodexHome(codexHome);
  setStatePath(path.join(root, "cache", "sync-state.json"));
  setPairMapPath(path.join(root, "cache", "pair-map.json"));
  const source = path.join(ccRoot, encodeCwd("/tmp/project"), "cc-sync-1.jsonl");
  writeCcSession(source);
  assert.equal(syncOnce({ direction: "cc-to-codex", days: 365, log: () => {} }).translated, 1);
  assert.equal(syncOnce({ direction: "cc-to-codex", days: 365, log: () => {} }).skipped_existing, 1);
  writeFileSync(source, readFileSync(source, "utf8").replace("first answer", "updated answer"));
  assert.equal(syncOnce({ direction: "cc-to-codex", days: 365, log: () => {} }).translated, 1);
  const pairs = readPairMap();
  assert.ok(pairs.cc_to_codex["cc-sync-1"]);
});

test("sync skips dirty generated target unless forced", () => {
  const root = mkdtempSync(path.join(tmpdir(), "context-bridge-sync-"));
  const ccRoot = path.join(root, "home", ".claude", "projects");
  const codexHome = path.join(root, "home", ".codex");
  setCcProjects(ccRoot);
  setCodexHome(codexHome);
  setStatePath(path.join(root, "cache", "sync-state.json"));
  setPairMapPath(path.join(root, "cache", "pair-map.json"));
  const source = path.join(ccRoot, encodeCwd("/tmp/project"), "cc-sync-1.jsonl");
  writeCcSession(source);
  assert.equal(syncOnce({ direction: "cc-to-codex", days: 365, log: () => {} }).translated, 1);
  const [target] = expectedTarget(source, "claude-code", "codex");
  const dirty = `${readFileSync(target, "utf8")}${JSON.stringify({ type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "target-side work" }] } })}\n`;
  writeFileSync(target, dirty);
  writeFileSync(source, readFileSync(source, "utf8").replace("first answer", "source changed"));

  const skipped = syncOnce({ direction: "cc-to-codex", days: 365, log: () => {} });
  assert.equal(skipped.translated, 0);
  assert.equal(skipped.skipped_conflict, 1);
  assert.match(readFileSync(target, "utf8"), /target-side work/);

  const forced = syncOnce({ direction: "cc-to-codex", days: 365, force: true, log: () => {} });
  assert.equal(forced.translated, 1);
  assert.doesNotMatch(readFileSync(target, "utf8"), /target-side work/);
});

test("sync skips generated sessions to avoid translation loops", () => {
  const root = mkdtempSync(path.join(tmpdir(), "context-bridge-sync-"));
  const ccRoot = path.join(root, "home", ".claude", "projects");
  const codexHome = path.join(root, "home", ".codex");
  setCcProjects(ccRoot);
  setCodexHome(codexHome);
  setStatePath(path.join(root, "cache", "sync-state.json"));
  setPairMapPath(path.join(root, "cache", "pair-map.json"));
  const source = path.join(ccRoot, encodeCwd("/tmp/project"), "cc-sync-1.jsonl");
  writeCcSession(source);

  assert.equal(syncOnce({ direction: "cc-to-codex", days: 365, log: () => {} }).translated, 1);
  assert.equal(syncOnce({ direction: "both", days: 365, log: () => {} }).translated, 0);
});

test("sync skips generated Claude Code sessions using structured source metadata", () => {
  const root = mkdtempSync(path.join(tmpdir(), "context-bridge-sync-"));
  const ccRoot = path.join(root, "home", ".claude", "projects");
  const codexHome = path.join(root, "home", ".codex");
  setCcProjects(ccRoot);
  setCodexHome(codexHome);
  setStatePath(path.join(root, "cache", "sync-state.json"));
  setPairMapPath(path.join(root, "cache", "pair-map.json"));
  const source = path.join(codexHome, "sessions", "2026", "05", "13", "rollout-2026-05-13T01-00-00-codex-sync-1.jsonl");
  writeCodexSession(source);

  assert.equal(syncOnce({ direction: "codex-to-cc", days: 365, log: () => {} }).translated, 1);
  assert.equal(syncOnce({ direction: "cc-to-codex", days: 365, log: () => {} }).translated, 0);
});

test("codex list prompt prefers renamed session and otherwise first user message", () => {
  const root = mkdtempSync(path.join(tmpdir(), "context-bridge-list-"));
  const codexHome = path.join(root, "home", ".codex");
  setCodexHome(codexHome);
  const file = path.join(codexHome, "sessions", "2026", "05", "13", "rollout-2026-05-13T01-00-00-codex-list-1.jsonl");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, [
    JSON.stringify({ type: "session_meta", payload: { id: "codex-list-1", cwd: "/tmp/project" } }),
    JSON.stringify({ type: "event_msg", payload: { type: "user_message", message: "event mirror should not win" } }),
    JSON.stringify({ type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "assistant first" }] } }),
    JSON.stringify({ type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "# AGENTS.md instructions for /tmp/project\n\n<INSTRUCTIONS>bootstrap</INSTRUCTIONS>" }] } }),
    JSON.stringify({ type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "first user prompt" }] } }),
    JSON.stringify({ type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "last user prompt" }] } }),
  ].join("\n") + "\n");

  const [session] = listSessions({ harness: "codex", days: 365, include_translated: true, limit: 1 });
  assert.equal(session.first_prompt, "# AGENTS.md instructions for /tmp/project\n\n<INSTRUCTIONS>bootstrap</INSTRUCTIONS>");
  assert.equal(session.display_prompt, "first user prompt");
  assert.equal(displayPrompt(session), "first user prompt");
  assert.equal(session.session_title, null);
  assert.equal(session.source_harness, null);
  assert.equal("source" in session, false);
  assert.equal("origin" in session, false);

  writeFileSync(path.join(codexHome, "session_index.jsonl"), JSON.stringify({ id: "codex-list-1", thread_name: "[from claude-code] renamed session title" }) + "\n");
  const [renamed] = listSessions({ harness: "codex", days: 365, include_translated: true, limit: 1 });
  assert.equal(renamed.first_prompt, "# AGENTS.md instructions for /tmp/project\n\n<INSTRUCTIONS>bootstrap</INSTRUCTIONS>");
  assert.equal(renamed.display_prompt, "first user prompt");
  assert.equal(displayPrompt(renamed), "renamed session title");
  assert.equal(renamed.session_title, "renamed session title");
  assert.equal(renamed.source_harness, "claude-code");

  writeFileSync(path.join(codexHome, "session_index.jsonl"), JSON.stringify({ id: "codex-list-1", thread_name: "# AGENTS.md instructions for /tmp/project" }) + "\n");
  const [bootstrapTitle] = listSessions({ harness: "codex", days: 365, include_translated: true, limit: 1 });
  assert.equal(bootstrapTitle.session_title, "# AGENTS.md instructions for /tmp/project");
  assert.equal(displayPrompt(bootstrapTitle), "first user prompt");
});
