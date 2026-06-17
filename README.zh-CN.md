# Context Bridge

**语言：** [English](https://github.com/conrad621/context-bridge/blob/master/README.md) | 简体中文

**项目网站：** https://conrad621.github.io/context-bridge
**项目地址：** https://github.com/conrad621/context-bridge

Context Bridge 是一个本地优先的编码代理会话互操作层。它通过统一的 canonical intermediate representation，在 Claude Code、Codex 和支持 MCP 的自动化工具之间迁移 JSONL 会话历史，并尽量保留跨 agent 恢复工作所需的操作上下文。

它适合同时使用多个 CLI agent 的开发者：你可以迁移 session、一次性复制 session、批量同步最近 session，也可以让 MCP host 用结构化工具读取和准备恢复命令。

## 为什么需要它

现代编码代理的 session 不只是聊天记录，还包含 user turn、assistant output、tool call、文件操作、shell 命令、工作目录、时间戳和标题等执行轨迹。但这些轨迹通常被锁在各自 harness 的 JSONL 格式里。

Context Bridge 提供一个轻量转换边界：

- **Canonical IR**：把不同 agent 的事件规范化成统一 `Session` 模型。
- **双向 adapter**：Claude Code 和 Codex 各自负责 ingest/render。
- **来源感知同步**：生成 session 可识别、可清理、可去重，并避免再次作为同步源。
- **独立复制模式**：可以复制到另一个 agent，但不建立后续同步关系。
- **本地 MCP surface**：让 MCP host 能列出 session、触发转换并准备恢复命令。

## 能力概览

| 能力 | 说明 |
| --- | --- |
| Session translation | Claude Code JSONL 与 Codex JSONL 双向转换。 |
| Session copy | 生成新的独立目标 session，不写追踪元数据。 |
| Session index | 跨 agent 列出和查看本地 session，并展示可读提示词。 |
| Batch sync | 扫描最近原生 session，生成确定性目标 session。 |
| Divergence protection | 目标 session 分叉后默认跳过，除非使用 `--force`。 |
| Loop prevention | 避免生成 session 再被同步成新的生成链。 |
| Hook integration | 安装 Claude Code Stop hook 或 Codex notify hook，轻量自动同步。 |
| MCP server | 通过 stdio 向 MCP host 暴露 session 工具。 |

## 安装

要求：

- Node.js `>=20`

从当前项目安装：

```bash
npm install
npm run build
npm install -g .
context-bridge --help
```

发布后从 npm 安装：

```bash
npm install -g @mmmjk/context-bridge
context-bridge --help
ctxb --help
```

本地开发可直接运行：

```bash
node dist/src/cli.js --help
```

主命令名是 `context-bridge`，同时会安装更短的别名 `ctxb`。

## 快速开始

找到 session，验证转换，再正式迁移：

```bash
context-bridge list --harness both --days 30 -n 20
context-bridge inspect <session-id>
context-bridge smoke <session-id>
context-bridge translate <session-id>
```

同样可以使用短别名：

```bash
ctxb list --harness both --days 30 -n 20
ctxb translate <session-id>
```

执行 `translate` 输出的 resume 命令，并替换 `<your prompt>`。

如果只想一次性复制到另一个 agent：

```bash
context-bridge copy <session-id>
```

## 心智模型

核心有三条路径：

| 路径 | 适用场景 | 结果 |
| --- | --- | --- |
| `translate` | 需要生成可识别的迁移产物。 | 带来源元数据的目标 session。 |
| `copy` | 需要独立、原生观感的目标 session。 | 无同步追踪的新目标 session。 |
| `sync` / `watch` | 需要自动镜像最近原生 session。 | 带 fingerprint 状态的确定性目标 session。 |

`translate` 和 `sync` 是 provenance-aware 的：生成物后续可识别、可清理、可去重，并会被跳过以避免链式迁移。

`copy` 是刻意不追踪的：它复用同一套 canonical 转换管线，但不写 `source_harness`、`originator: "context-bridge"`、`context-bridge-meta` 和 `[from ...]` 标题前缀。

## 命令参考

| 命令 | 作用 | 示例 |
| --- | --- | --- |
| `list` | 用紧凑表格列出本地 session。 | `context-bridge list --harness both --days 7 -n 20` |
| `inspect` | 用 JSON 输出单个 session 摘要。 | `context-bridge inspect <session-id>` |
| `smoke` | 验证转换并输出恢复命令，不执行真实模型。 | `context-bridge smoke <session-id>` |
| `translate` | 在目标 harness 生成可追踪迁移 session。 | `context-bridge translate <session-id>` |
| `copy` | 生成无同步追踪的独立目标 session。 | `context-bridge copy <session-id>` |
| `sync` | 批量同步最近原生 session。 | `context-bridge sync --direction both --days 365` |
| `watch` | 按间隔重复同步，或用 `--once` 只跑一次。 | `context-bridge watch --direction both --days 1 -i 30` |
| `clean` | 删除生成的迁移 session。 | `context-bridge clean --dry-run` |
| `dedupe` | 删除重复的生成 session。 | `context-bridge dedupe --dry-run` |
| `install-hook` | 安装自动同步 hook。 | `context-bridge install-hook --target codex` |
| `mcp serve` | 启动 stdio MCP server。 | `context-bridge mcp serve` |
| `mcp config-snippet` | 输出 MCP host 配置片段。 | `context-bridge mcp config-snippet` |

常用参数：

- `--from <claude-code|codex>` 和 `--to <claude-code|codex>`：覆盖自动推断方向。
- `--target-dir <dir>`：指定目标写入目录。
- `--allow-generated`：允许 `translate` 或 `smoke` 读取生成 session。
- `--source <all|native|claude|codex>`：按来源筛选 `list`。
- `--force`：让 `sync` 重新生成被追踪目标。
- `--include-active`：让 `sync` 包含当前活跃 Claude Code session。

## 常见工作流

### 迁移单个 Session

```bash
context-bridge list --harness both --days 14 -n 20
context-bridge smoke <session-id>
context-bridge translate <session-id>
```

这会生成一个目标 session，并输出恢复命令。适合希望迁移产物保持可识别、可清理、可同步的场景。

### 无来源复制

```bash
context-bridge copy <session-id>
```

每次都会创建新的目标 session id。在 `list` 和 `inspect` 中，复制结果表现为原生 session：`Source` 为空，`source_harness` 为 `null`，清理命令不会把它当成生成物。

### 同步最近 Session

```bash
context-bridge sync --direction both --days 365
```

支持方向：

- `both`
- `cc-to-codex`
- `codex-to-cc`

`sync` 会在 `~/.cache/context-bridge/` 记录源和目标 fingerprint。如果源和目标之后都发生变化，目标会被视为分叉并跳过。

### 安装轻量 Hook

```bash
context-bridge install-hook --target claude-code
context-bridge install-hook --target codex
```

Hook 是幂等的，并带有 `context_bridge.cli sync` 标记。

## 会话列表

`list` 用于快速扫描和选择：

- `Modified`：本地时区 `yyyy-mm-dd hh:mm:ss`。
- `Harness`：当前 session 所在 agent。
- `Source`：原生/copy session 为空；生成 session 显示 `claude` 或 `codex`。
- `CWD`：工作目录。
- `Display Prompt`：过滤启动噪声后的可读标题或提示词。

`inspect` 输出机器可读字段，包括 `first_prompt`、`display_prompt`、`session_title`、`source_harness`、`launch_context`、`start_command` 和 `resume_command`。

## MCP Tools

启动服务：

```bash
context-bridge mcp serve
```

可用工具：

- `list_sessions`
- `translate_session`
- `sync_now`
- `find_session`
- `prepare_resume`
- `resume_with_prompt`

`resume_with_prompt` 只返回可执行命令，不启动真实模型进程。

## 转移语义

### 完全可转移

| 数据 | 说明 |
| --- | --- |
| 用户和助手文本 | 普通文本回合会保留。 |
| Shell 命令 | 常见 shell tool call 会跨 harness 映射。 |
| 文件读写编辑删除移动 | Claude Code 文件工具和 Codex `apply_patch` 会映射为统一文件操作。 |
| 搜索/glob 操作 | 常见 grep/glob 模式会保留。 |
| Tool 结果 | 文本输出、call id 和错误标记在存在时会保留。 |
| Session 标题、cwd、时间戳、id | 保留或重新生成为目标原生元数据。 |

### 部分可转移

| 数据 | 限制 |
| --- | --- |
| 目标 agent 没有等价能力的 tool call | 会保守渲染，不等价于原生 tool replay。 |
| Web search 和 MCP call | 会保留为 canonical event；目标原生行为取决于可用工具。 |
| 附件和 developer note | 可能渲染为 JSON 文本或 developer note。 |
| Reasoning summary | 明文 summary 可转移；加密或签名 payload 不可转移。 |
| Git、模型、权限、启动元数据 | 存在时会捕获；缺失字段无法重建。目标 session 不强制指定模型。 |
| Subagent transcript 和 compaction 边界 | 作为可读历史或有损标记保留，不恢复运行态。 |

### 不可转移

| 数据 | 例子 |
| --- | --- |
| 加密或签名 reasoning payload | 隐藏 reasoning、签名、加密 compaction 内容。 |
| 启动 agent 的完整原始 shell 命令 | alias、wrapper、环境变量前缀、完整 argv。 |
| 转换过程中的实时模型执行 | `smoke` 和 MCP helper 只准备文件/命令。 |
| Codex SQLite picker cache | 会写 JSONL 和 `session_index.jsonl`，不修改 SQLite cache。 |
| 原生 plan/task UI 状态 | 有状态 checklist 和 UI-only 状态不会重建。 |
| 外部服务状态 | 浏览器登录态、云端 job、远端 tool cache、凭证。 |
| 未支持的 harness 格式 | 没有 adapter 的任何 session 格式。 |

## 文件布局

目标 session 目录：

- Claude Code：`~/.claude/projects/.../*.jsonl`
- Codex：`~/.codex/sessions/.../*.jsonl`

Codex 标题索引：

- `~/.codex/session_index.jsonl`

Context Bridge 同步状态：

```text
~/.cache/context-bridge/
```

## 设计原则

- **Local-first**：没有托管控制面，不上传远端 session。
- **Adapter isolation**：harness 特定解析逻辑只存在于对应 adapter。
- **Canonical-first translation**：所有转换都经过统一 `Session` 模型。
- **Conservative lossiness**：不支持的结构显式降级表示，而不是静默丢弃。
- **Destructive safety**：清理命令只处理可识别的生成 session。
- **Model neutrality**：目标 session 不强制沿用源模型，恢复时使用目标 agent 当前默认配置。

## 开发

```bash
npm run build
npm test
npm run pack:dry
```

发布记录见 `CHANGELOG.md`。发布步骤见 `RELEASE.md`。
