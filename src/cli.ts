#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { copySession, translate } from "./translator.js";
import { isAgentBridgeCc, isAgentBridgeCodex, syncOnce } from "./sync.js";
import { serve } from "./mcp-server.js";
import { cleanGenerated, dedupeGenerated, displayPrompt, findSession, listSessions, sourceDisplay } from "./session-index.js";
import { syncTitles } from "./title-sync.js";

const COMMANDS = ["translate", "copy", "export", "import", "inspect", "list", "smoke", "sync", "watch", "clean", "dedupe", "install-hook", "mcp"];
const HOOK_MARKERS = ["context_bridge.cli sync"];
const HELP_TEXT = `context-bridge: cross-agent session translator

Usage:
  context-bridge <command> [options]
  node dist/src/cli.js <command> [options]

Commands:
  translate   Translate one session JSONL file between harnesses.
              Usage: translate [--from <claude-code|codex>] [--to <claude-code|codex>] [--target-dir <dir>] [--allow-generated] <session-id|session.jsonl>
              Example: translate <session-id>

  copy        One-shot copy into the opposite harness as a new independent session.
              Usage: copy [--from <claude-code|codex>] [--to <claude-code|codex>] [--target-dir <dir>] <session-id|session.jsonl>
              Example: copy <session-id>

  export      Alias for translate. Use when exporting from the source harness.
              Usage: export [--from <claude-code|codex>] [--to <claude-code|codex>] <session.jsonl>

  import      Alias for translate. Use when importing into the target harness.
              Usage: import [--from <claude-code|codex>] [--to <claude-code|codex>] <session.jsonl>

  inspect     Print one indexed session summary as JSON.
              Usage: inspect <session-id>

  list        List recent sessions in a table.
              Usage: list [--harness <claude-code|codex|both>] [--source <all|native|claude|codex>] [--days <n>] [-n <n>|--limit <n>]
              Example: list --harness codex --days 7 -n 10

  smoke       Translate one session and print the resume command without live model execution.
              Usage: smoke [--from <claude-code|codex>] [--to <claude-code|codex>] [--target-dir <dir>] [--prompt <text>] [--allow-generated] <session-id|session.jsonl>
              Example: smoke <session-id>

  sync        Batch-sync recent sessions.
              Usage: sync [--direction <both|cc-to-codex|codex-to-cc>] [--days <n>] [--force] [--include-active]
              Example: sync --direction both --days 365

  watch       Re-run sync on an interval, or once through the watch path.
              Usage: watch [--once] [--direction <both|cc-to-codex|codex-to-cc>] [--days <n>] [-i <sec>|--interval <sec>] [--force] [--include-active]
              Example: watch --direction both --days 1 -i 30

  clean       Remove generated translated sessions. Use --dry-run first to preview.
              Usage: clean [--dry-run]

  dedupe      Remove duplicate generated translated sessions. Use --dry-run first to preview.
              Usage: dedupe [--dry-run]

  install-hook
              Install automatic sync hooks for Claude Code or Codex.
              Usage: install-hook [--target <claude-code|codex>] [--direction <cc-to-codex|codex-to-cc|both>]
              Example: install-hook --target codex

  mcp         Run the stdio MCP server or print an MCP host config snippet.
              Usage: mcp serve
              Usage: mcp config-snippet

Common harnesses:
  claude-code, codex

Generated files:
  Claude Code: ~/.claude/projects/.../*.jsonl
  Codex:       ~/.codex/sessions/.../*.jsonl`;

export function main(argv = process.argv.slice(2)): number {
  const cmd = argv[0];
  if (!cmd || cmd === "--help" || cmd === "-h") {
    console.log(HELP_TEXT);
    return 0;
  }
  try {
    if (cmd === "translate" || cmd === "export" || cmd === "import") return translateCmd(argv.slice(1));
    if (cmd === "copy") return copyCmd(argv.slice(1));
    if (cmd === "list") return listCmd(argv.slice(1));
    if (cmd === "inspect") return inspectCmd(argv.slice(1));
    if (cmd === "smoke") return smokeCmd(argv.slice(1));
    if (cmd === "sync") return syncCmd(argv.slice(1));
    if (cmd === "watch") return watchCmd(argv.slice(1));
    if (cmd === "clean") return cleanCmd(argv.slice(1));
    if (cmd === "dedupe") return dedupeCmd(argv.slice(1));
    if (cmd === "install-hook") return installHookCmd(argv.slice(1));
    if (cmd === "mcp" && argv[1] === "serve") { serve(); return 0; }
    if (cmd === "mcp" && argv[1] === "config-snippet") {
      console.log(JSON.stringify({ mcpServers: { "context-bridge": { command: "context-bridge", args: ["mcp", "serve"] } } }, null, 2));
      return 0;
    }
    console.error(`unknown command: ${cmd}`);
    return 2;
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

function option(args: string[], name: string, fallback?: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}

function has(args: string[], name: string): boolean {
  return args.includes(name);
}

function positional(args: string[]): string | undefined {
  const optionsWithValue = new Set(["--from", "--to", "--target-dir", "--harness", "--source", "--days", "--limit", "-n", "-i", "--interval", "--direction", "--prompt", "--target"]);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (optionsWithValue.has(arg)) {
      i++;
      continue;
    }
    if (!arg.startsWith("-")) return arg;
  }
  return undefined;
}

function numberOption(args: string[], name: string, fallback: number): number {
  const value = option(args, name);
  return value == null ? fallback : Number(value);
}

function translateCmd(args: string[]): number {
  const input = positional(args);
  if (!input) throw new Error("session id or source path required");
  const resolved = resolveSessionInput(input);
  assertNotGeneratedSource(resolved.path, args);
  const from = option(args, "--from") ?? resolved.harness ?? inferHarnessFromSessionPath(resolved.path);
  const to = option(args, "--to", from === "codex" ? "claude-code" : "codex")!;
  const res = translate({
    source_path: resolved.path,
    source_harness: from,
    target_harness: to,
    target_dir: option(args, "--target-dir"),
  });
  console.log(`session_id: ${res.session_id}`);
  console.log(`output:     ${res.primary_path}`);
  console.log("\nResume command:");
  console.log(`  ${res.resume_command}`);
  return 0;
}

function copyCmd(args: string[]): number {
  const input = positional(args);
  if (!input) throw new Error("session id or source path required");
  const resolved = resolveSessionInput(input);
  const from = option(args, "--from") ?? resolved.harness ?? inferHarnessFromSessionPath(resolved.path);
  const to = option(args, "--to", from === "codex" ? "claude-code" : "codex")!;
  const res = copySession({
    source_path: resolved.path,
    source_harness: from,
    target_harness: to,
    target_dir: option(args, "--target-dir"),
  });
  console.log(`session_id: ${res.session_id}`);
  console.log(`output:     ${res.primary_path}`);
  console.log("\nResume command:");
  console.log(`  ${res.resume_command}`);
  return 0;
}

function listCmd(args: string[]): number {
  const rows = listSessions({
    harness: option(args, "--harness", option(args, "--from", "claude-code")),
    source: option(args, "--source", "all"),
    days: numberOption(args, "--days", 365),
    limit: numberOption(args, "-n", numberOption(args, "--limit", 20)),
    include_translated: has(args, "--include-translated"),
  });
  console.log(formatSessionTable(rows));
  return 0;
}

function formatSessionTable(rows: ReturnType<typeof listSessions>): string {
  if (!rows.length) return "no sessions found";
  type TableRow = {
    modified: string;
    harness: string;
    session: string;
    size: string;
    source: string;
    cwd: string;
    prompt: string;
  };
  type TableColumn = { key: keyof TableRow; label: string; align?: "right" };
  const tableRows = rows.map((s) => ({
    modified: formatLocalTimestamp(s.mtime_iso),
    harness: s.harness,
    session: shortenMiddle(s.session_id, 36),
    size: formatBytes(s.size_bytes),
    source: sourceDisplay(s.source_harness),
    cwd: shortenMiddle(s.cwd, 72),
    prompt: truncate((displayPrompt(s) ?? "").replace(/\s+/g, " ").trim(), 120),
  }));
  const columns: TableColumn[] = [
    { key: "modified", label: "Modified" },
    { key: "harness", label: "Harness" },
    { key: "session", label: "Session" },
    { key: "size", label: "Size", align: "right" },
    { key: "source", label: "Source" },
    { key: "cwd", label: "CWD" },
    { key: "prompt", label: "Display Prompt" },
  ];
  const widths = columns.map((col) => Math.max(col.label.length, ...tableRows.map((row) => row[col.key].length)));
  const header = columns.map((col, i) => pad(col.label, widths[i], col.align)).join("  ");
  const divider = widths.map((w) => "-".repeat(w)).join("  ");
  const body = tableRows.map((row) => columns.map((col, i) => pad(row[col.key], widths[i], col.align)).join("  "));
  return [header, divider, ...body].join("\n");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatLocalTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

function pad(value: string, width: number, align?: "right"): string {
  return align === "right" ? value.padStart(width) : value.padEnd(width);
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

function shortenMiddle(value: string, max: number): string {
  if (value.length <= max) return value;
  if (max <= 1) return "…";
  const left = Math.ceil((max - 1) / 2);
  const right = Math.floor((max - 1) / 2);
  return `${value.slice(0, left)}…${value.slice(value.length - right)}`;
}

function inspectCmd(args: string[]): number {
  const id = positional(args);
  if (!id) throw new Error("session id required");
  const found = findSession(id);
  if (!found) throw new Error(`session not found: ${id}`);
  console.log(JSON.stringify(found, null, 2));
  return 0;
}

function smokeCmd(args: string[]): number {
  const input = positional(args);
  if (!input) throw new Error("session id or source path required");
  const resolved = resolveSessionInput(input);
  assertNotGeneratedSource(resolved.path, args);
  const from = option(args, "--from") ?? resolved.harness ?? inferHarnessFromSessionPath(resolved.path);
  const to = option(args, "--to", from === "codex" ? "claude-code" : "codex")!;
  const res = translate({ source_path: resolved.path, source_harness: from, target_harness: to, target_dir: option(args, "--target-dir") });
  console.log(`translated: ${res.primary_path}`);
  console.log(`resume:     ${res.resume_command}`);
  const prompt = option(args, "--prompt");
  if (prompt) console.log("live resume execution is intentionally not run by smoke in this build; run the printed resume command with the prompt manually.");
  return 0;
}

function assertNotGeneratedSource(sourcePath: string, args: string[]): void {
  if (has(args, "--allow-generated")) return;
  const harness = inferHarnessFromSessionPath(sourcePath);
  const generated = harness === "codex" ? isAgentBridgeCodex(sourcePath) : isAgentBridgeCc(sourcePath);
  if (generated) throw new Error("refusing to translate a generated context-bridge session; pass --allow-generated to override");
}

function resolveSessionInput(input: string): { path: string; harness?: "claude-code" | "codex" } {
  const found = findSession(input);
  if (found) return { path: found.path, harness: found.harness };
  if (existsSync(input)) return { path: input };
  throw new Error(`session not found: ${input}`);
}

function inferHarnessFromSessionPath(file: string): "claude-code" | "codex" {
  const normalized = path.normalize(file);
  if (normalized.includes(`${path.sep}.codex${path.sep}sessions${path.sep}`) || path.basename(file).startsWith("rollout-")) return "codex";
  if (normalized.includes(`${path.sep}.claude${path.sep}projects${path.sep}`)) return "claude-code";
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      const row = JSON.parse(line) as Record<string, unknown>;
      if (row.type === "session_meta" || row.type === "turn_context" || row.type === "response_item") return "codex";
      if (row.sessionId || row.type === "user" || row.type === "assistant" || row.type === "custom-title") return "claude-code";
    }
  } catch {}
  return "claude-code";
}

function syncCmd(args: string[]): number {
  const titles = syncTitles();
  const stats = syncOnce({
    direction: option(args, "--direction", "both"),
    days: Number(option(args, "--days", "365")),
    force: has(args, "--force"),
    include_active: has(args, "--include-active"),
  });
  console.log(`summary: +${stats.translated} translated, ${stats.skipped_existing} unchanged, ${stats.skipped_conflict} conflicts (skipped), ${stats.skipped_active} active (skipped), ${stats.skipped_too_big} too-big (skipped), ${stats.skipped_empty} empty (skipped), ${stats.failed} failed, titles ${titles.updated_claude_code + titles.updated_codex} updated`);
  return stats.failed ? 1 : 0;
}

function watchCmd(args: string[]): number {
  const once = has(args, "--once");
  const intervalSec = numberOption(args, "-i", numberOption(args, "--interval", 30));
  const run = () => {
    const stats = syncOnce({ direction: option(args, "--direction", "both"), days: numberOption(args, "--days", 365), force: has(args, "--force"), include_active: has(args, "--include-active") });
    console.log(`${new Date().toISOString()} summary: +${stats.translated} translated, ${stats.skipped_existing} unchanged, ${stats.skipped_conflict} conflicts (skipped), ${stats.failed} failed`);
    return stats.failed ? 1 : 0;
  };
  const code = run();
  if (once) return code;
  setInterval(run, Math.max(1, intervalSec) * 1000);
  return 0;
}

function cleanCmd(args: string[]): number {
  const dryRun = has(args, "--dry-run");
  const result = cleanGenerated({ dry_run: dryRun });
  for (const p of result.removed) console.log(`${dryRun ? "would remove" : "removed"} ${p}`);
  for (const p of result.skipped) console.log(`skipped ${p}`);
  console.log(`summary: ${result.removed.length} ${dryRun ? "matched" : "removed"}, ${result.skipped.length} skipped`);
  return result.skipped.length ? 1 : 0;
}

function dedupeCmd(args: string[]): number {
  const dryRun = has(args, "--dry-run");
  const result = dedupeGenerated({ dry_run: dryRun });
  for (const p of result.removed) console.log(`${dryRun ? "would remove duplicate" : "removed duplicate"} ${p}`);
  for (const p of result.skipped) console.log(`skipped ${p}`);
  console.log(`summary: ${result.removed.length} duplicates ${dryRun ? "matched" : "removed"}, ${result.skipped.length} skipped`);
  return result.skipped.length ? 1 : 0;
}

function installHookCmd(args: string[]): number {
  const target = option(args, "--target", "claude-code")!;
  const direction = option(args, "--direction", target === "claude-code" ? "cc-to-codex" : "codex-to-cc")!;
  let cmdStr = `node ${path.resolve(fileURLToPath(import.meta.url))} sync --direction ${direction} --days 1`;
  cmdStr += " # context_bridge.cli sync";
  if (target === "claude-code" && ["cc-to-codex", "both"].includes(direction)) cmdStr += " --include-active";
  cmdStr += " >/dev/null 2>&1";
  if (target === "claude-code") return installCcHook(cmdStr);
  if (target === "codex") return installCodexNotify(cmdStr);
  throw new Error(`unknown target: ${target}`);
}

function installCcHook(cmdStr: string): number {
  const settingsPath = path.join(homedir(), ".claude", "settings.json");
  mkdirSync(path.dirname(settingsPath), { recursive: true });
  const settings = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, "utf8") || "{}") : {};
  settings.hooks ??= {};
  settings.hooks.Stop ??= [];
  let group = settings.hooks.Stop.find((g: Record<string, unknown>) => g.matcher === "*" || g.matcher == null);
  if (!group) { group = { matcher: "*", hooks: [] }; settings.hooks.Stop.push(group); }
  group.hooks ??= [];
  const existing = group.hooks.find((h: Record<string, unknown>) => typeof h.command === "string" && HOOK_MARKERS.some((marker) => String(h.command).includes(marker)));
  if (existing) {
    if (existing.command === cmdStr) { console.log("CC Stop hook already installed; nothing to do."); return 0; }
    existing.command = cmdStr;
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
    console.log(`updated Stop hook in ${settingsPath}`);
    return 0;
  }
  group.hooks.push({ type: "command", command: cmdStr });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
  console.log(`added Stop hook to ${settingsPath}`);
  return 0;
}

function installCodexNotify(cmdStr: string): number {
  const configPath = path.join(homedir(), ".codex", "config.toml");
  if (!existsSync(configPath)) throw new Error(`${configPath} does not exist`);
  const raw = readFileSync(configPath, "utf8");
  const existingMatch = raw.match(/^notify\s*=\s*(.*)$/m);
  let inner = cmdStr;
  if (existingMatch) {
    const current = existingMatch[1];
    if (HOOK_MARKERS.some((marker) => current.includes(marker))) { console.log("Codex notify hook already chains our sync; nothing to do."); return 0; }
    const shMatch = current.match(/^\["sh",\s*"-c",\s*"([\s\S]*)"\]$/);
    inner = `${shMatch ? JSON.parse(`"${shMatch[1]}"`) : current}; ${cmdStr}`;
  }
  const line = `notify = ${JSON.stringify(["sh", "-c", inner])}`;
  const next = existingMatch ? raw.replace(/^notify\s*=.*$/m, line) : `${line}\n${raw}`;
  copyFileSync(configPath, `${configPath}.bak`);
  writeFileSync(configPath, next, "utf8");
  console.log(`updated ${configPath}`);
  return 0;
}

function isDirectCliExecution(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url));
  }
}

if (isDirectCliExecution()) {
  const code = main();
  if (!(process.argv[2] === "mcp" && process.argv[3] === "serve")) {
    process.exit(code);
  }
}
