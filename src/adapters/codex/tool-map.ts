import type { ToolCall } from "../../canonical/schema.js";

export function renderToolResult(callId: string, outputText = "", isError = false): Record<string, unknown> {
  return {
    type: "function_call_output",
    call_id: callId,
    output: isError ? JSON.stringify({ output: outputText, metadata: { exit_code: 1 } }) : outputText,
  };
}

export function renderShellTool(call: ToolCall): Record<string, unknown> {
  const args = call.args ?? {};
  return {
    type: "function_call",
    name: "exec_command",
    arguments: JSON.stringify({ cmd: args.command ?? "", workdir: args.workdir }),
    call_id: call.call_id,
  };
}

