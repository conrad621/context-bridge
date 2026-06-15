import test from "node:test";
import assert from "node:assert/strict";
import { deterministicUuid4, deterministicUuid7, uuid7Str } from "../src/canonical/ids.js";
import { createSession, isToolCall } from "../src/canonical/schema.js";
import { ccToolToCanonical, translateArgs } from "../src/adapters/claude-code/tool-map.js";

test("uuid7 helpers produce v7 ids", () => {
  const id = uuid7Str();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(deterministicUuid7("seed", "2026-01-01T00:00:00.000Z"), deterministicUuid7("seed", "2026-01-01T00:00:00.000Z"));
  assert.equal(deterministicUuid4("seed"), deterministicUuid4("seed"));
});

test("createSession fills canonical defaults", () => {
  const session = createSession({
    id: "s",
    source_harness: "codex",
    source_session_id: "src",
    cwd: "/tmp",
    started_at: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(session.schema_version, "1.0.0");
  assert.deepEqual(session.moments, []);
});

test("Claude Code tool names and args map to canonical", () => {
  const canonical = ccToolToCanonical("Read");
  assert.equal(canonical, "read_file");
  const args = translateArgs(canonical, { file_path: "/tmp/a.txt" });
  assert.deepEqual(args, { path: "/tmp/a.txt" });
});

test("moment type guards identify tool calls", () => {
  assert.equal(isToolCall({ kind: "tool_call", ts: "t", tool: "read_file", call_id: "c" }), true);
});

