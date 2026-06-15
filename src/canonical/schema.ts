export type Harness = "claude-code" | "codex" | "hermes" | "other";

export interface GitInfo {
  branch?: string | null;
  commit?: string | null;
  repo_url?: string | null;
}

export interface ModelHint {
  provider?: string | null;
  name?: string | null;
  reasoning_effort?: string | null;
}

export interface Permissions {
  approval?: string | null;
  sandbox?: string | null;
  writable_roots?: string[];
  network_access?: boolean;
}

export interface MomentBase {
  ts: string;
  source_ref?: Record<string, unknown> | null;
  agent_scope?: string;
  lossy?: boolean;
  lossy_reason?: string | null;
}

export interface UserText extends MomentBase {
  kind: "user_text";
  text: string;
  prompt_id?: string | null;
  attachments?: Record<string, unknown>[];
}

export interface AssistantText extends MomentBase {
  kind: "assistant_text";
  text: string;
  phase?: "commentary" | "final_answer" | null;
}

export interface Thinking extends MomentBase {
  kind: "thinking";
  text: string;
  format?: "plaintext" | "summary" | "redacted";
  lossy: true;
  lossy_reason: string;
}

export interface ToolCall extends MomentBase {
  kind: "tool_call";
  tool: string;
  call_id: string;
  args?: Record<string, unknown>;
  wire_native?: Record<string, unknown> | null;
}

export interface ToolResult extends MomentBase {
  kind: "tool_result";
  call_id: string;
  output_text?: string;
  output_blocks?: Record<string, unknown>[];
  is_error?: boolean;
  exit_code?: number | null;
  duration_ms?: number | null;
  external_ref?: string | null;
}

export interface Attachment extends MomentBase {
  kind: "attachment";
  subtype: string;
  data?: Record<string, unknown>;
}

export interface ModeChange extends MomentBase {
  kind: "mode_change";
  from?: string | null;
  to: string;
  fields_changed?: Record<string, unknown>;
}

export interface PlanUpdate extends MomentBase {
  kind: "plan_update";
  items?: Record<string, unknown>[];
  diff?: Record<string, unknown> | null;
}

export interface ErrorMoment extends MomentBase {
  kind: "error";
  message: string;
  subtype?: string | null;
  retry_info?: Record<string, unknown> | null;
}

export interface Notification extends MomentBase {
  kind: "notification";
  subtype: string;
  content: string;
  ref?: string | null;
}

export interface SummaryCompaction extends MomentBase {
  kind: "summary_compaction";
  trigger?: "auto" | "manual";
  before_tokens?: number | null;
  after_tokens?: number | null;
  summary_text: string;
  lossy: true;
  lossy_reason: string;
}

export interface MetadataMoment extends MomentBase {
  kind: "metadata";
  subtype: string;
  data?: Record<string, unknown>;
}

export type Moment =
  | UserText
  | AssistantText
  | Thinking
  | ToolCall
  | ToolResult
  | Attachment
  | ModeChange
  | PlanUpdate
  | ErrorMoment
  | Notification
  | SummaryCompaction
  | MetadataMoment;

export interface Session {
  schema_version: string;
  id: string;
  source_harness: Harness;
  source_session_id: string;
  source_session_path?: string | null;
  cwd: string;
  git?: GitInfo;
  model_hint?: ModelHint;
  started_at: string;
  ended_at?: string | null;
  permissions?: Permissions;
  skills_inventory?: Record<string, unknown>[];
  mcp_servers?: Record<string, unknown>[];
  memory_files?: Record<string, unknown>[];
  moments: Moment[];
  subagent_transcripts?: Record<string, Moment[]>;
  artifacts?: Record<string, unknown>[];
  source_metadata?: Record<string, unknown>;
}

export interface RenderResult {
  session_id: string;
  primary_path: string;
  resume_command: string;
  warnings: string[];
}

export function createSession(input: Omit<Session, "schema_version" | "moments"> & Partial<Pick<Session, "schema_version" | "moments">>): Session {
  return {
    schema_version: input.schema_version ?? "1.0.0",
    git: {},
    model_hint: {},
    permissions: { writable_roots: [], network_access: false },
    skills_inventory: [],
    mcp_servers: [],
    memory_files: [],
    subagent_transcripts: {},
    artifacts: [],
    source_metadata: {},
    ...input,
    moments: input.moments ?? [],
  };
}

export function isUserText(m: Moment): m is UserText {
  return m.kind === "user_text";
}

export function isAssistantText(m: Moment): m is AssistantText {
  return m.kind === "assistant_text";
}

export function isToolCall(m: Moment): m is ToolCall {
  return m.kind === "tool_call";
}

export function isToolResult(m: Moment): m is ToolResult {
  return m.kind === "tool_result";
}

