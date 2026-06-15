import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { translate, copySession } from "../src/translator.js";
import { ingest as ingestCodex } from "../src/adapters/codex/ingest.js";
import { ingest as ingestCc } from "../src/adapters/claude-code/ingest.js";

function writeCcFixture(dir: string): string {
  const fixture = path.join(dir, "cc-input.jsonl");
  const rows = [
    { type: "user", sessionId: "cc-e2e-1", uuid: "u1", parentUuid: null, cwd: "/tmp/project", timestamp: "2026-05-13T01:00:00.000Z", userType: "external", entrypoint: "cli", version: "2.1.107", gitBranch: "main", message: { role: "user", content: "first prompt" } },
    { type: "assistant", sessionId: "cc-e2e-1", uuid: "a1", parentUuid: "u1", cwd: "/tmp/project", timestamp: "2026-05-13T01:00:01.000Z", userType: "external", entrypoint: "cli", version: "2.1.107", gitBranch: "main", message: { role: "assistant", content: [{ type: "text", text: "first answer" }] } },
    { type: "assistant", sessionId: "cc-e2e-1", uuid: "a2", parentUuid: "a1", cwd: "/tmp/project", timestamp: "2026-05-13T01:00:02.000Z", userType: "external", entrypoint: "cli", version: "2.1.107", gitBranch: "main", message: { role: "assistant", content: [{ type: "tool_use", id: "tool-1", name: "Read", input: { file_path: "/tmp/project/src/index.ts" } }], stop_reason: "tool_use" } },
    { type: "user", sessionId: "cc-e2e-1", uuid: "u2", parentUuid: "a2", cwd: "/tmp/project", timestamp: "2026-05-13T01:00:03.000Z", userType: "external", entrypoint: "cli", version: "2.1.107", gitBranch: "main", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tool-1", content: "   1\tconsole.log('hi')\n", is_error: false }] } },
  ];
  writeFileSync(fixture, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return fixture;
}

function readJsonl(p: string): Record<string, unknown>[] {
  return readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
}

test("translate Claude Code to Codex emits tracked target shape", () => {
  const root = mkdtempSync(path.join(tmpdir(), "context-bridge-e2e-"));
  const fixture = writeCcFixture(root);
  const res = translate({ source_path: fixture, source_harness: "claude-code", target_harness: "codex", target_dir: path.join(root, "codex") });
  const out = readJsonl(res.primary_path);

  assert.equal(out[0].type, "session_meta");
  assert.equal((out[0].payload as Record<string, unknown>).originator, "context-bridge");
  assert.equal((out[0].payload as Record<string, unknown>).source_harness, "claude-code");
  const turn = out.find((l) => l.type === "turn_context")?.payload as Record<string, unknown> | undefined;
  assert.equal(turn && "model" in turn, false);
  assert.ok(out.some((l) => l.type === "response_item" && (l.payload as Record<string, unknown>).type === "function_call"));
  const userResponses = out.filter((l) => l.type === "response_item" && (l.payload as Record<string, unknown>).type === "message" && (l.payload as Record<string, unknown>).role === "user").length;
  const userEvents = out.filter((l) => l.type === "event_msg" && (l.payload as Record<string, unknown>).type === "user_message").length;
  assert.equal(userResponses, userEvents);
  assert.match(readFileSync(path.join(root, "codex", "session_index.jsonl"), "utf8"), /\[from claude-code\] first prompt/);
});

test("copy Claude Code to Codex omits tracking metadata but writes Codex title index", () => {
  const root = mkdtempSync(path.join(tmpdir(), "context-bridge-e2e-"));
  const fixture = writeCcFixture(root);
  const res = copySession({ source_path: fixture, source_harness: "claude-code", target_harness: "codex", target_dir: path.join(root, "codex") });
  const out = readJsonl(res.primary_path);
  const meta = out[0].payload as Record<string, unknown>;

  assert.equal(out[0].type, "session_meta");
  assert.equal("originator" in meta, false);
  assert.equal("source_harness" in meta, false);
  assert.match(readFileSync(path.join(root, "codex", "session_index.jsonl"), "utf8"), /"thread_name":"first prompt"/);
  assert.doesNotMatch(readFileSync(path.join(root, "codex", "session_index.jsonl"), "utf8"), /\[from claude-code\]/);
});

test("round trip preserves text and tool-call essentials", () => {
  const root = mkdtempSync(path.join(tmpdir(), "context-bridge-e2e-"));
  const fixture = writeCcFixture(root);
  const res1 = translate({ source_path: fixture, source_harness: "claude-code", target_harness: "codex", target_dir: path.join(root, "codex") });
  const canonical1 = ingestCodex(res1.primary_path);
  const res2 = translate({ source_path: res1.primary_path, source_harness: "codex", target_harness: "claude-code", target_dir: path.join(root, "claude") });
  const ccRows = readJsonl(res2.primary_path);

  assert.equal(ccRows[0].type, "context-bridge-meta");
  assert.equal(ccRows[0].source_harness, "codex");
  const ccAssistant = ccRows.find((row) => row.type === "assistant")?.message as Record<string, unknown> | undefined;
  assert.equal(ccAssistant && "model" in ccAssistant, false);
  const canonical2 = ingestCc(res2.primary_path, { follow_subagents: false });
  assert.ok(canonical2.moments.filter((m) => m.kind === "user_text").length >= canonical1.moments.filter((m) => m.kind === "user_text").length);
  assert.equal(canonical2.moments.filter((m) => m.kind === "tool_call").length, canonical1.moments.filter((m) => m.kind === "tool_call").length);
});

test("copy Codex to Claude Code creates independent native-looking session", () => {
  const root = mkdtempSync(path.join(tmpdir(), "context-bridge-e2e-"));
  const codexSource = path.join(root, "codex-source.jsonl");
  writeFileSync(codexSource, [
    JSON.stringify({ timestamp: "2026-05-13T01:00:00.000Z", type: "session_meta", payload: { id: "codex-copy-source", cwd: "/tmp/project" } }),
    JSON.stringify({ timestamp: "2026-05-13T01:00:01.000Z", type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "codex prompt" }] } }),
  ].join("\n") + "\n");

  const res = copySession({ source_path: codexSource, source_harness: "codex", target_harness: "claude-code", target_dir: path.join(root, "claude") });
  const text = readFileSync(res.primary_path, "utf8");
  assert.equal(existsSync(res.primary_path), true);
  assert.doesNotMatch(text, /context-bridge-meta/);
  assert.doesNotMatch(text, /\[from codex\]/);
  assert.match(text, /"customTitle":"codex prompt"/);
});
