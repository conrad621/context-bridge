export interface HunkLine {
  op: " " | "+" | "-";
  text: string;
}

export interface Hunk {
  header?: string;
  lines: HunkLine[];
}

export interface FileOp {
  kind: "add" | "delete" | "update";
  path: string;
  move_to?: string;
  add_lines?: string[];
  hunks?: Hunk[];
}

export class ApplyPatchParseError extends Error {}

export function parseApplyPatch(patchText: string): FileOp[] {
  const lines = patchText.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === "*** Begin Patch");
  const end = lines.findIndex((l) => l.trim() === "*** End Patch");
  if (start < 0 || end < 0) throw new ApplyPatchParseError("missing *** Begin Patch / *** End Patch envelope");
  const body = lines.slice(start + 1, end);
  const ops: FileOp[] = [];
  let i = 0;
  while (i < body.length) {
    const line = body[i];
    if (line.startsWith("*** Add File: ")) {
      const filePath = line.slice("*** Add File: ".length);
      const add_lines: string[] = [];
      i++;
      while (i < body.length && !body[i].startsWith("*** ")) {
        if (body[i].startsWith("+")) add_lines.push(body[i].slice(1));
        i++;
      }
      ops.push({ kind: "add", path: filePath, add_lines });
    } else if (line.startsWith("*** Delete File: ")) {
      ops.push({ kind: "delete", path: line.slice("*** Delete File: ".length) });
      i++;
    } else if (line.startsWith("*** Update File: ")) {
      const filePath = line.slice("*** Update File: ".length);
      let move_to: string | undefined;
      i++;
      if (i < body.length && body[i].startsWith("*** Move to: ")) {
        move_to = body[i].slice("*** Move to: ".length);
        i++;
      }
      const hunks: Hunk[] = [];
      let cur: Hunk | undefined;
      while (i < body.length && !body[i].startsWith("*** ")) {
        const l = body[i];
        if (l.startsWith("@@")) {
          if (cur) hunks.push(cur);
          cur = { header: l.slice(2).trim() || undefined, lines: [] };
        } else if (l && [" ", "+", "-"].includes(l[0])) {
          cur ??= { lines: [] };
          cur.lines.push({ op: l[0] as " " | "+" | "-", text: l.slice(1) });
        }
        i++;
      }
      if (cur) hunks.push(cur);
      ops.push({ kind: "update", path: filePath, move_to, hunks });
    } else {
      i++;
    }
  }
  return ops;
}

