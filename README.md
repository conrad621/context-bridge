# Context Bridge

**Language:** English | [简体中文](https://github.com/conrad621/context-bridge/blob/master/README.zh-CN.md)

**Website:** https://conrad621.github.io/context-bridge/  
**Repository:** https://github.com/conrad621/context-bridge

Context Bridge is a local-first session interoperability layer for coding agents. It moves JSONL session history between Claude Code, Codex, and MCP-aware automation surfaces through a canonical intermediate representation, preserving enough operational context to resume work across harness boundaries.

It is designed for developers who use more than one CLI agent and need controlled session migration, one-shot duplication, local sync, and machine-readable session discovery without relying on a hosted service.

## Why It Exists

Modern coding agents store rich execution traces: user turns, assistant output, tool calls, file operations, shell commands, working directories, timestamps, and display titles. Those traces are valuable, but they are usually locked inside harness-specific JSONL formats.

Context Bridge provides a small translation boundary:

- **Canonical IR**: harness-specific events are normalized into a shared `Session` model.
- **Bidirectional adapters**: Claude Code and Codex each own their ingest/render logic.
- **Provenance-aware sync**: generated sessions are marked, tracked, deduped, and skipped as future sources.
- **Independent copy mode**: sessions can be duplicated into another agent without creating a sync relationship.
- **Local MCP surface**: external MCP hosts can list, translate, and prepare resume commands.

## Capabilities

| Capability | Description |
| --- | --- |
| Session translation | Convert Claude Code JSONL to Codex JSONL, and Codex JSONL to Claude Code JSONL. |
| Session copy | Create a fresh target-agent session with no tracking metadata. |
| Session index | List and inspect local sessions across harnesses with readable display prompts. |
| Batch sync | Scan recent original sessions and generate deterministic tracked targets. |
| Divergence protection | Skip tracked targets that were modified after generation unless `--force` is used. |
| Loop prevention | Prevent generated sessions from being re-translated into new generated chains. |
| Hook integration | Install Claude Code Stop hooks or Codex notify hooks for lightweight auto-sync. |
| MCP server | Expose session operations to MCP-aware hosts through stdio. |

## Installation

Requirements:

- Node.js `>=20`

Install from this checkout:

```bash
npm install
npm run build
npm install -g .
context-bridge --help
```

Install from npm after publishing:

```bash
npm install -g @mmmjk/context-bridge
context-bridge --help
ctxb --help
```

For local development without global installation:

```bash
node dist/src/cli.js --help
```

The primary binary name is `context-bridge`. A shorter alias, `ctxb`, is also installed.

## Quick Start

Find a session, verify conversion, then translate it:

```bash
context-bridge list --harness both --days 30 -n 20
context-bridge inspect <session-id>
context-bridge smoke <session-id>
context-bridge translate <session-id>
```

The same commands can be run with the short alias:

```bash
ctxb list --harness both --days 30 -n 20
ctxb translate <session-id>
```

Run the resume command printed by `translate`, then replace `<your prompt>`.

Create a one-shot independent duplicate instead:

```bash
context-bridge copy <session-id>
```

## Mental Model

There are three primary flows:

| Flow | Use when | Result |
| --- | --- | --- |
| `translate` | You want a generated migration artifact. | A target session with source metadata. |
| `copy` | You want an independent native-looking target session. | A fresh target session with no sync tracking. |
| `sync` / `watch` | You want recent original sessions mirrored automatically. | Deterministic tracked targets with fingerprint state. |

`translate` and `sync` are provenance-aware. Their outputs can be identified later, cleaned, deduped, and protected from chain translation.

`copy` is deliberately untracked. It uses the same canonical conversion pipeline, but omits `source_harness`, `originator: "context-bridge"`, `context-bridge-meta`, and `[from ...]` title prefixes.

## Command Reference

| Command | Purpose | Example |
| --- | --- | --- |
| `list` | List local sessions in a compact table. | `context-bridge list --harness both --days 7 -n 20` |
| `inspect` | Print one indexed session summary as JSON. | `context-bridge inspect <session-id>` |
| `smoke` | Verify translation and print the resume command without live model execution. | `context-bridge smoke <session-id>` |
| `translate` | Create a tracked generated session in the target harness. | `context-bridge translate <session-id>` |
| `copy` | Create an independent target session without sync tracking. | `context-bridge copy <session-id>` |
| `sync` | Batch-sync recent original sessions. | `context-bridge sync --direction both --days 365` |
| `watch` | Re-run sync on an interval, or once with `--once`. | `context-bridge watch --direction both --days 1 -i 30` |
| `clean` | Remove generated translated sessions. | `context-bridge clean --dry-run` |
| `dedupe` | Remove duplicate generated sessions. | `context-bridge dedupe --dry-run` |
| `install-hook` | Install automatic sync hooks. | `context-bridge install-hook --target codex` |
| `mcp serve` | Start the stdio MCP server. | `context-bridge mcp serve` |
| `mcp config-snippet` | Print an MCP host config snippet. | `context-bridge mcp config-snippet` |

Common options:

- `--from <claude-code|codex>` and `--to <claude-code|codex>` override inferred direction.
- `--target-dir <dir>` writes generated files to a custom target root.
- `--allow-generated` lets `translate` or `smoke` read a generated session.
- `--source <all|native|claude|codex>` filters `list` by origin.
- `--force` lets `sync` regenerate tracked targets.
- `--include-active` lets `sync` include the active Claude Code session.

## Workflows

### Move One Session

```bash
context-bridge list --harness both --days 14 -n 20
context-bridge smoke <session-id>
context-bridge translate <session-id>
```

This creates a generated target session and prints the resume command. Use this when you want the migration to remain identifiable as a Context Bridge artifact.

### Copy Without Provenance

```bash
context-bridge copy <session-id>
```

This creates a new target session id every time. In `list` and `inspect`, the copied session appears native: `Source` is blank, `source_harness` is `null`, and cleanup commands will not treat it as generated.

### Sync Recent Sessions

```bash
context-bridge sync --direction both --days 365
```

Directions:

- `both`
- `cc-to-codex`
- `codex-to-cc`

`sync` records source and target fingerprints under `~/.cache/context-bridge/`. If both source and target change after generation, the target is considered divergent and is skipped as a conflict.

### Install Lightweight Hooks

```bash
context-bridge install-hook --target claude-code
context-bridge install-hook --target codex
```

Hooks are idempotent and marked with `context_bridge.cli sync`.

## Session Listing

`list` is optimized for scanning and selection:

- `Modified`: local timestamp in `yyyy-mm-dd hh:mm:ss`.
- `Harness`: current session store.
- `Source`: blank for native/copy sessions, `claude` or `codex` for generated sessions.
- `CWD`: working directory.
- `Display Prompt`: readable title or prompt with bootstrap noise filtered out.

`inspect` exposes raw machine-readable fields such as `first_prompt`, `display_prompt`, `session_title`, `source_harness`, `launch_context`, `start_command`, and `resume_command`.

## MCP Tools

Start the server:

```bash
context-bridge mcp serve
```

Available tools:

- `list_sessions`
- `translate_session`
- `sync_now`
- `find_session`
- `prepare_resume`
- `resume_with_prompt`

`resume_with_prompt` returns a command to run. It does not execute a live model process.

## Transfer Semantics

### Fully Transferable

| Data | Notes |
| --- | --- |
| User and assistant text | Plain text turns are preserved. |
| Shell commands | Common shell tool calls are mapped across harnesses. |
| File read/write/edit/delete/move | Claude Code file tools and Codex `apply_patch` are mapped to canonical file operations. |
| Search/glob operations | Common grep/glob patterns are preserved. |
| Tool results | Text output, call ids, and error flags are preserved when present. |
| Session title, cwd, timestamps, ids | Preserved or regenerated as target-native metadata. |

### Partially Transferable

| Data | Limitation |
| --- | --- |
| Tool calls without a target equivalent | Rendered conservatively instead of replayed as a native tool. |
| Web search and MCP calls | Preserved as canonical events; native behavior depends on target tool availability. |
| Attachments and developer notes | May render as JSON text or developer notes. |
| Reasoning summaries | Plain summaries can transfer; encrypted or signed payloads cannot. |
| Git, model, permissions, launch metadata | Captured when present; missing source fields cannot be reconstructed. Target sessions do not force a model override. |
| Subagent transcripts and compaction boundaries | Preserved as readable history or lossy markers, not as live runtime state. |

### Not Transferable

| Data | Examples |
| --- | --- |
| Encrypted or signed reasoning payloads | Hidden reasoning bodies, signatures, encrypted compaction content. |
| Exact original shell command used to launch the agent | Aliases, wrappers, env prefixes, complete argv. |
| Live model execution during transfer | `smoke` and MCP helpers prepare files/commands only. |
| Codex SQLite picker cache | JSONL and `session_index.jsonl` are written; SQLite cache is not mutated. |
| Native plan/task UI state | Stateful checklists and UI-only state are not reconstructed. |
| External service state | Browser sessions, cloud jobs, remote tool caches, credentials. |
| Unsupported harness formats | Any harness without an adapter. |

## Filesystem Layout

Target session stores:

- Claude Code: `~/.claude/projects/.../*.jsonl`
- Codex: `~/.codex/sessions/.../*.jsonl`

Codex title index:

- `~/.codex/session_index.jsonl`

Context Bridge sync state:

```text
~/.cache/context-bridge/
```

## Design Principles

- **Local-first**: no hosted control plane, no remote session upload.
- **Adapter isolation**: harness-specific parsing stays inside harness adapters.
- **Canonical-first translation**: all conversions pass through the shared `Session` model.
- **Conservative lossiness**: unsupported structures are represented explicitly instead of silently discarded.
- **Destructive safety**: cleanup only targets sessions that can be identified as generated.
- **Model neutrality**: target sessions do not force a source model; resumed agents use their current defaults.

## Development

```bash
npm run build
npm test
npm run pack:dry
```

Release notes are in `CHANGELOG.md`. Publishing steps are in `RELEASE.md`.
