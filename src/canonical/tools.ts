export const CANONICAL_TOOLS: Record<string, { description: string }> = {
  shell: { description: "Run a shell command" },
  read_file: { description: "Read a file" },
  write_file: { description: "Write a file" },
  edit_file: { description: "Edit a file" },
  multi_edit_file: { description: "Apply multiple edits to a file" },
  delete_file: { description: "Delete a file" },
  move_file: { description: "Move or rename a file" },
  find_files: { description: "Find files by pattern" },
  search_text: { description: "Search text in files" },
  web_search: { description: "Search the web" },
  web_fetch: { description: "Fetch a web page" },
  update_plan: { description: "Update the task plan" },
  ask_user: { description: "Ask the user for input" },
  subagent_dispatch: { description: "Dispatch a subagent" },
  mcp_call: { description: "Call an MCP tool" },
  view_image: { description: "View a local image" },
};

export function isCanonicalTool(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(CANONICAL_TOOLS, name);
}

