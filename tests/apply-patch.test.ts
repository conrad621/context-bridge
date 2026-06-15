import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFileState,
  patchForDelete,
  patchForEdit,
  patchForMove,
  patchForMultiEdit,
  patchForWrite,
  stripCatN,
  toRelative,
} from "../src/adapters/codex/apply-patch.js";
import { parseApplyPatch } from "../src/adapters/codex/apply-patch-parser.js";
import type { Moment } from "../src/canonical/schema.js";

test("stripCatN removes cat -n prefixes", () => {
  assert.equal(stripCatN("   1\thello\n   2\tworld\n"), "hello\nworld\n");
});

test("toRelative computes cwd-relative path", () => {
  assert.equal(toRelative("/repo/src/foo.py", "/repo"), "src/foo.py");
});

test("patchForWrite emits add or delete+add", () => {
  const add = patchForWrite("hello.py", "import os\n", false);
  assert.match(add, /\*\*\* Add File: hello.py/);
  assert.match(add, /\+import os/);
  const overwrite = patchForWrite("hello.py", "new\n", true);
  assert.match(overwrite, /\*\*\* Delete File: hello.py/);
  assert.match(overwrite, /\*\*\* Add File: hello.py/);
});

test("patch edit, multi edit, delete and move", () => {
  assert.match(patchForEdit("foo.py", "old", "new", "a\nold\nz\n"), /-old\n\+new/);
  assert.equal((patchForMultiEdit("foo.py", [{ old: "AAA", new: "aaa" }, { old: "CCC", new: "ccc" }], "AAA\nBBB\nCCC\n").match(/@@/g) ?? []).length, 2);
  assert.match(patchForDelete("foo.py"), /\*\*\* Delete File: foo.py/);
  assert.match(patchForMove("old.py", "new.py"), /\*\*\* Move to: new.py/);
});

test("buildFileState tracks read then edit", () => {
  const moments: Moment[] = [
    { kind: "tool_call", ts: "2026-01-01T00:00:00.000Z", tool: "read_file", call_id: "r1", args: { path: "/p/foo.py" } },
    { kind: "tool_result", ts: "2026-01-01T00:00:01.000Z", call_id: "r1", output_text: "   1\tline a\n   2\tline b\n" },
    { kind: "tool_call", ts: "2026-01-01T00:00:02.000Z", tool: "edit_file", call_id: "e1", args: { path: "/p/foo.py", old: "line a", new: "LINE A" } },
  ];
  assert.equal(buildFileState(moments).e1.get("/p/foo.py"), "line a\nline b\n");
});

test("parseApplyPatch splits multi-op envelope", () => {
  const patch = "*** Begin Patch\n*** Add File: hello.py\n+hi\n*** Update File: app.py\n@@\n-old\n+new\n*** Delete File: stale.py\n*** End Patch\n";
  const ops = parseApplyPatch(patch);
  assert.deepEqual(ops.map((o) => o.kind), ["add", "update", "delete"]);
});

