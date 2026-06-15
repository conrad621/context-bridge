export const CC_TO_CANONICAL: Record<string, string> = {
  Bash: "shell",
  Read: "read_file",
  Write: "write_file",
  Edit: "edit_file",
  MultiEdit: "multi_edit_file",
  Delete: "delete_file",
  Move: "move_file",
  Glob: "find_files",
  Grep: "search_text",
  WebSearch: "web_search",
  Task: "subagent_dispatch",
  TodoWrite: "update_plan",
};

export function ccToolToCanonical(name: string): string {
  return CC_TO_CANONICAL[name] ?? name;
}

export function translateArgs(canonicalName: string, ccInput: Record<string, unknown>): Record<string, unknown> {
  switch (canonicalName) {
    case "shell":
      return { command: ccInput.command ?? "" };
    case "read_file":
      return { path: ccInput.file_path ?? ccInput.path ?? "" };
    case "write_file":
      return { path: ccInput.file_path ?? ccInput.path ?? "", content: ccInput.content ?? "" };
    case "edit_file":
      return {
        path: ccInput.file_path ?? ccInput.path ?? "",
        old: ccInput.old_string ?? ccInput.old ?? "",
        new: ccInput.new_string ?? ccInput.new ?? "",
        replace_all: ccInput.replace_all ?? false,
      };
    case "multi_edit_file":
      return { path: ccInput.file_path ?? ccInput.path ?? "", edits: ccInput.edits ?? [] };
    case "delete_file":
      return { path: ccInput.file_path ?? ccInput.path ?? "" };
    case "move_file":
      return { source: ccInput.source ?? ccInput.old_path ?? "", destination: ccInput.destination ?? ccInput.new_path ?? "" };
    case "find_files":
      return { pattern: ccInput.pattern ?? "*", path: ccInput.path ?? "." };
    case "search_text":
      return { pattern: ccInput.pattern ?? "", path: ccInput.path ?? "." };
    case "web_search":
      return { query: ccInput.query ?? "" };
    case "subagent_dispatch":
      return { agent_type: ccInput.subagent_type ?? "general-purpose", task: ccInput.description ?? "", prompt: ccInput.prompt ?? "" };
    case "update_plan":
      return { items: ccInput.todos ?? [] };
    default:
      return { ...ccInput };
  }
}

