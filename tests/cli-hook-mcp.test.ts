import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const cli = path.resolve(import.meta.dirname, "..", "src", "cli.js");

function run(args: string[], home?: string) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", env: { ...process.env, HOME: home ?? process.env.HOME } });
}

test("context-bridge help exposes major command groups", () => {
  const res = run(["--help"]);
  assert.equal(res.status, 0);
  for (const word of ["copy", "export", "import", "inspect", "list", "smoke", "sync", "watch", "clean", "dedupe", "install-hook", "mcp"]) assert.match(res.stdout, new RegExp(word));
});

test("CLI list, smoke, watch once and clean operate on real sessions", () => {
  const home = mkdtempSync(path.join(tmpdir(), "context-bridge-home-"));
  const ccDir = path.join(home, ".claude", "projects", "-tmp-project");
  mkdirSync(ccDir, { recursive: true });
  const session = path.join(ccDir, "cc-cli-1.jsonl");
  const commandOnlySession = path.join(ccDir, "cc-command-only.jsonl");
  const cwd = "/tmp/project/with/a/longer/path/that/should/remain/visible";
  const firstPrompt = "<command-message>gantry-change</command-message> <command-name>/gantry-change</command-name>";
  const localCommandPrompt = "<local-command-stdout>Set model to Sonnet and saved as your default for new sessions</local-command-stdout>";
  const displayPrompt = "cli prompt with enough detail to verify the wider first prompt column keeps more text visible";
  const laterPrompt = "later user prompt should not be used by display prompt";
  writeFileSync(session, [
    JSON.stringify({ type: "user", sessionId: "cc-cli-1", uuid: "u1", parentUuid: null, cwd, timestamp: "2026-05-13T01:00:00.000Z", userType: "external", entrypoint: "cli", version: "2.1.107", gitBranch: "main", message: { role: "user", content: firstPrompt } }),
    JSON.stringify({ type: "user", sessionId: "cc-cli-1", uuid: "u-local", parentUuid: "u1", cwd, timestamp: "2026-05-13T01:00:01.000Z", userType: "external", entrypoint: "cli", version: "2.1.107", gitBranch: "main", message: { role: "user", content: localCommandPrompt } }),
    JSON.stringify({ type: "user", sessionId: "cc-cli-1", uuid: "u-real", parentUuid: "u-local", cwd, timestamp: "2026-05-13T01:00:02.000Z", userType: "external", entrypoint: "cli", version: "2.1.107", gitBranch: "main", message: { role: "user", content: displayPrompt } }),
    JSON.stringify({ type: "assistant", sessionId: "cc-cli-1", uuid: "a1", parentUuid: "u-real", cwd, timestamp: "2026-05-13T01:00:03.000Z", userType: "external", entrypoint: "cli", version: "2.1.107", gitBranch: "main", message: { role: "assistant", content: [{ type: "text", text: "cli answer" }] } }),
    JSON.stringify({ type: "user", sessionId: "cc-cli-1", uuid: "u2", parentUuid: "a1", cwd, timestamp: "2026-05-13T01:00:04.000Z", userType: "external", entrypoint: "cli", version: "2.1.107", gitBranch: "main", message: { role: "user", content: laterPrompt } }),
  ].join("\n") + "\n");
  writeFileSync(commandOnlySession, JSON.stringify({ type: "user", sessionId: "cc-command-only", uuid: "u1", cwd, timestamp: "2026-05-13T01:01:00.000Z", userType: "external", entrypoint: "cli", version: "2.1.107", gitBranch: "main", message: { role: "user", content: localCommandPrompt } }) + "\n");
  const list = run(["list", "--days", "365"], home);
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /Modified\s+Harness\s+Session\s+Size\s+Source\s+CWD\s+Display Prompt/);
  assert.match(list.stdout, /-{2,}\s+-{2,}\s+-{2,}\s+-{2,}\s+-{2,}\s+-{2,}\s+-{2,}/);
  assert.match(list.stdout, /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
  assert.match(list.stdout, /cc-cli-1/);
  assert.match(list.stdout, /cc-command-only/);
  assert.doesNotMatch(list.stdout, /native/);
  assert.match(list.stdout, /\/tmp\/project\/with\/a\/longer\/path\/that\/should\/remain\/visible/);
  assert.match(list.stdout, /cli prompt with enough detail to verify the wider first prompt column keeps more text visible/);
  assert.doesNotMatch(list.stdout, /gantry-change/);
  assert.doesNotMatch(list.stdout, /local-command-stdout/);
  assert.doesNotMatch(list.stdout, /Set model to Sonnet/);
  assert.doesNotMatch(list.stdout, /later user prompt should not be used by display prompt/);

  const nativeOnly = run(["list", "--days", "365", "--source", "native"], home);
  assert.equal(nativeOnly.status, 0, nativeOnly.stderr);
  assert.match(nativeOnly.stdout, /cc-cli-1/);

  const inspect = run(["inspect", "cc-cli-1"], home);
  assert.equal(inspect.status, 0, inspect.stderr);
  const summary = JSON.parse(inspect.stdout);
  assert.equal(summary.first_prompt, firstPrompt);
  assert.equal(summary.display_prompt, displayPrompt);
  assert.equal("last_prompt" in summary, false);
  assert.equal(summary.session_title, null);
  assert.equal(summary.source_harness, null);
  assert.equal("source" in summary, false);
  assert.equal("origin" in summary, false);
  assert.equal(summary.start_command, `cd '${cwd}' && claude`);
  assert.equal(summary.resume_command, `cd '${cwd}' && claude --resume 'cc-cli-1' -p "<your prompt>"`);
  assert.equal(summary.launch_context.executable, "claude");
  assert.equal(summary.launch_context.entrypoint, "cli");

  const smoke = run(["smoke", "cc-cli-1", "--target-dir", path.join(home, ".codex")], home);
  assert.equal(smoke.status, 0, smoke.stderr);
  assert.match(smoke.stdout, /translated:/);
  const generatedCodexId = smoke.stdout.match(/rollout-[^\n]*-([0-9a-f-]{36})\.jsonl/)?.[1];
  assert.ok(generatedCodexId);
  const translateById = run(["translate", "cc-cli-1", "--target-dir", path.join(home, ".codex")], home);
  assert.equal(translateById.status, 0, translateById.stderr);
  assert.match(translateById.stdout, /session_id:/);
  const copyById = run(["copy", "cc-cli-1", "--target-dir", path.join(home, ".codex")], home);
  assert.equal(copyById.status, 0, copyById.stderr);
  assert.match(copyById.stdout, /session_id:/);
  const copiedCodexId = copyById.stdout.match(/session_id: ([0-9a-f-]{36})/)?.[1];
  assert.ok(copiedCodexId);
  const copied = run(["inspect", copiedCodexId], home);
  assert.equal(copied.status, 0, copied.stderr);
  const copiedSummary = JSON.parse(copied.stdout);
  assert.equal(copiedSummary.source_harness, null);
  assert.equal(copiedSummary.translated, false);
  assert.notEqual(copiedCodexId, generatedCodexId);
  const generatedSmoke = run(["smoke", generatedCodexId, "--target-dir", path.join(home, ".claude", "projects")], home);
  assert.equal(generatedSmoke.status, 1);
  assert.match(generatedSmoke.stderr, /refusing to translate a generated context-bridge session/);
  const generatedTranslate = run(["translate", generatedCodexId, "--target-dir", path.join(home, ".claude", "projects")], home);
  assert.equal(generatedTranslate.status, 1);
  assert.match(generatedTranslate.stderr, /refusing to translate a generated context-bridge session/);
  const allowedGeneratedSmoke = run(["smoke", generatedCodexId, "--allow-generated", "--target-dir", path.join(home, ".claude", "projects")], home);
  assert.equal(allowedGeneratedSmoke.status, 0, allowedGeneratedSmoke.stderr);

  const codexSession = path.join(home, ".codex", "sessions", "2026", "05", "13", "rollout-2026-05-13T01-00-00-codex-cli-1.jsonl");
  mkdirSync(path.dirname(codexSession), { recursive: true });
  writeFileSync(codexSession, [
    JSON.stringify({ type: "session_meta", payload: { id: "codex-cli-1", cwd } }),
    JSON.stringify({ type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "codex prompt" }] } }),
  ].join("\n") + "\n");
  const codexSmoke = run(["smoke", "codex-cli-1", "--target-dir", path.join(home, ".claude", "projects")], home);
  assert.equal(codexSmoke.status, 0, codexSmoke.stderr);
  assert.match(codexSmoke.stdout, /claude --resume/);

  const codexCopy = run(["copy", "codex-cli-1", "--target-dir", path.join(home, ".claude", "projects")], home);
  assert.equal(codexCopy.status, 0, codexCopy.stderr);
  const copiedCcPath = codexCopy.stdout.match(/output:\s+(.+\.jsonl)/)?.[1];
  assert.ok(copiedCcPath);
  const copiedCcText = readFileSync(copiedCcPath, "utf8");
  assert.doesNotMatch(copiedCcText, /context-bridge-meta/);
  assert.doesNotMatch(copiedCcText, /\[from codex\]/);

  const pathSmoke = run(["smoke", codexSession, "--target-dir", path.join(home, ".claude", "projects")], home);
  assert.equal(pathSmoke.status, 0, pathSmoke.stderr);
  assert.match(pathSmoke.stdout, /claude --resume/);

  const watch = run(["watch", "--once", "--direction", "cc-to-codex", "--days", "365"], home);
  assert.equal(watch.status, 0, watch.stderr);
  assert.match(watch.stdout, /summary:/);

  const clean = run(["clean", "--dry-run"], home);
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, /summary:/);
});

test("install-hook claude-code appends and is idempotent", () => {
  const home = mkdtempSync(path.join(tmpdir(), "context-bridge-home-"));
  const dir = path.join(home, ".claude");
  mkdirSync(dir, { recursive: true });
  const settings = path.join(dir, "settings.json");
  writeFileSync(settings, JSON.stringify({ hooks: { Stop: [{ matcher: "*", hooks: [{ type: "command", command: "afplay /tmp/x.aiff" }] }] } }));
  assert.equal(run(["install-hook", "--target", "claude-code"], home).status, 0);
  assert.equal(run(["install-hook", "--target", "claude-code"], home).status, 0);
  const data = JSON.parse(readFileSync(settings, "utf8"));
  const cmds = data.hooks.Stop[0].hooks.map((h: Record<string, string>) => h.command);
  assert.equal(cmds.filter((c: string) => c.includes("context_bridge.cli sync")).length, 1);
  assert.match(cmds.find((c: string) => c.includes("context_bridge.cli sync")), /--include-active/);
});

test("install-hook codex preserves existing notify and creates backup", () => {
  const home = mkdtempSync(path.join(tmpdir(), "context-bridge-home-"));
  const dir = path.join(home, ".codex");
  mkdirSync(dir, { recursive: true });
  const cfg = path.join(dir, "config.toml");
  writeFileSync(cfg, 'notify = ["sh", "-c", "afplay /tmp/x.aiff >/dev/null 2>&1"]\nmodel = "gpt-5.5"\n');
  const res = run(["install-hook", "--target", "codex"], home);
  assert.equal(res.status, 0, res.stderr);
  const text = readFileSync(cfg, "utf8");
  assert.match(text, /afplay \/tmp\/x\.aiff/);
  assert.match(text, /context_bridge\.cli sync/);
  assert.match(text, /model = "gpt-5.5"/);
  assert.ok(readFileSync(`${cfg}.bak`, "utf8").includes("afplay"));
});

test("MCP server initialize and tools/list over stdio", () => {
  const proc = spawnSync(process.execPath, [cli, "mcp", "serve"], {
    input: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) + "\n" +
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n",
    encoding: "utf8",
    timeout: 1000,
  });
  const lines = proc.stdout.trim().split(/\r?\n/).map((l) => JSON.parse(l));
  const names = lines[1].result.tools.map((t: Record<string, string>) => t.name);
  assert.deepEqual(new Set(names), new Set(["list_sessions", "translate_session", "sync_now", "find_session", "prepare_resume", "resume_with_prompt"]));
});

test("MCP list_sessions returns real sessions", () => {
  const home = mkdtempSync(path.join(tmpdir(), "context-bridge-home-"));
  const ccDir = path.join(home, ".claude", "projects", "-tmp-project");
  mkdirSync(ccDir, { recursive: true });
  writeFileSync(path.join(ccDir, "cc-mcp-1.jsonl"), JSON.stringify({ type: "user", sessionId: "cc-mcp-1", uuid: "u1", cwd: "/tmp/project", timestamp: "2026-05-13T01:00:00.000Z", message: { role: "user", content: "mcp prompt" } }) + "\n");
  const proc = spawnSync(process.execPath, [cli, "mcp", "serve"], {
    input: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_sessions", arguments: { harness: "claude-code", days: 365 } } }) + "\n",
    encoding: "utf8",
    env: { ...process.env, HOME: home },
    timeout: 1000,
  });
  const response = JSON.parse(proc.stdout.trim());
  const payload = JSON.parse(response.result.content[0].text);
  assert.equal(payload.count, 1);
  assert.equal(payload.sessions[0].session_id, "cc-mcp-1");
});
