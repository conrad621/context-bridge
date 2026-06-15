import path from "node:path";
import type { Moment, ToolCall, ToolResult } from "../../canonical/schema.js";

export class FileStateCache {
  contents = new Map<string, string>();

  get(filePath: string): string | undefined {
    return this.contents.get(filePath);
  }

  set(filePath: string, content: string): void {
    this.contents.set(filePath, content);
  }

  drop(filePath: string): void {
    this.contents.delete(filePath);
  }

  rename(oldPath: string, newPath: string): void {
    if (this.contents.has(oldPath)) {
      this.contents.set(newPath, this.contents.get(oldPath) ?? "");
      this.contents.delete(oldPath);
    }
  }

  clone(): FileStateCache {
    const c = new FileStateCache();
    c.contents = new Map(this.contents);
    return c;
  }
}

export function stripCatN(text: string): string {
  const suffix = text.endsWith("\n") ? "\n" : "";
  return text
    .split(/\r?\n/)
    .filter((_, i, arr) => !(i === arr.length - 1 && arr[i] === ""))
    .map((line) => line.replace(/^\s*\d+\t/, ""))
    .join("\n") + suffix;
}

export function buildFileState(moments: Moment[]): Record<string, FileStateCache> {
  const snapshots: Record<string, FileStateCache> = {};
  const cache = new FileStateCache();
  const pendingReads = new Map<string, string>();
  for (const m of moments) {
    if (m.kind === "tool_call") {
      const args = m.args ?? {};
      if (m.tool === "read_file") pendingReads.set(m.call_id, String(args.path ?? ""));
      if (["write_file", "edit_file", "multi_edit_file", "delete_file", "move_file"].includes(m.tool)) {
        snapshots[m.call_id] = cache.clone();
        applyEditToCache(cache, m);
      }
    } else if (m.kind === "tool_result" && pendingReads.has(m.call_id)) {
      cache.set(pendingReads.get(m.call_id) ?? "", stripCatN(m.output_text ?? ""));
      pendingReads.delete(m.call_id);
    }
  }
  return snapshots;
}

function applyEditToCache(cache: FileStateCache, call: ToolCall): void {
  const args = call.args ?? {};
  const filePath = String(args.path ?? "");
  if (!filePath) return;
  if (call.tool === "write_file") cache.set(filePath, String(args.content ?? ""));
  if (call.tool === "edit_file") {
    const cur = cache.get(filePath);
    const oldText = String(args.old ?? "");
    const newText = String(args.new ?? "");
    if (cur !== undefined && oldText) {
      cache.set(filePath, args.replace_all ? cur.split(oldText).join(newText) : cur.replace(oldText, newText));
    }
  }
  if (call.tool === "multi_edit_file") {
    let cur = cache.get(filePath);
    if (cur !== undefined) {
      for (const ed of (args.edits as Record<string, unknown>[] | undefined) ?? []) {
        cur = cur.replace(String(ed.old ?? ed.old_string ?? ""), String(ed.new ?? ed.new_string ?? ""));
      }
      cache.set(filePath, cur);
    }
  }
  if (call.tool === "delete_file") cache.drop(filePath);
  if (call.tool === "move_file") cache.rename(String(args.from ?? args.source ?? filePath), String(args.to ?? args.destination ?? filePath));
}

export function toRelative(absPath: string, cwd: string): string {
  const rel = path.relative(path.resolve(cwd), path.resolve(absPath));
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? rel : absPath;
}

export function composePatchEnvelope(body: string): string {
  return `*** Begin Patch\n${body.endsWith("\n") ? body : `${body}\n`}*** End Patch\n`;
}

function composeAddFile(relPath: string, content: string): string {
  const body = content.split(/\r?\n/).filter((line, i, arr) => !(i === arr.length - 1 && line === "")).map((line) => `+${line}`).join("\n");
  return `*** Add File: ${relPath}\n${body}${body ? "\n" : ""}`;
}

function composeDeleteFile(relPath: string): string {
  return `*** Delete File: ${relPath}\n`;
}

function composeUpdateFile(relPath: string, hunks: Array<[string[], string[], string[]]>, moveTo?: string): string {
  const lines = [`*** Update File: ${relPath}`];
  if (moveTo) lines.push(`*** Move to: ${moveTo}`);
  for (const [ctx, removed, added] of hunks) {
    lines.push("@@");
    for (const c of ctx.slice(-3)) lines.push(` ${c}`);
    for (const r of removed) lines.push(`-${r}`);
    for (const a of added) lines.push(`+${a}`);
  }
  return `${lines.join("\n")}\n`;
}

export function patchForWrite(relPath: string, content: string, fileExisted: boolean): string {
  return composePatchEnvelope(fileExisted ? composeDeleteFile(relPath) + composeAddFile(relPath, content) : composeAddFile(relPath, content));
}

export function patchForEdit(relPath: string, oldText: string, newText: string, fileContent?: string, replaceAll = false): string {
  const hunks: Array<[string[], string[], string[]]> = [];
  if (fileContent === undefined) {
    hunks.push([[], oldText.split(/\r?\n/), newText.split(/\r?\n/)]);
  } else {
    const positions: number[] = [];
    if (replaceAll) {
      let start = 0;
      while (oldText) {
        const idx = fileContent.indexOf(oldText, start);
        if (idx < 0) break;
        positions.push(idx);
        start = idx + oldText.length;
      }
    } else {
      const idx = fileContent.indexOf(oldText);
      if (idx >= 0) positions.push(idx);
    }
    if (!positions.length) positions.push(-1);
    for (const idx of positions) {
      hunks.push([idx >= 0 ? fileContent.slice(0, idx).split(/\r?\n/) : [], oldText.split(/\r?\n/), newText.split(/\r?\n/)]);
    }
  }
  return composePatchEnvelope(composeUpdateFile(relPath, hunks));
}

export function patchForMultiEdit(relPath: string, edits: Record<string, unknown>[], fileContent?: string): string {
  const hunks: Array<[string[], string[], string[]]> = [];
  let cur = fileContent;
  for (const ed of edits) {
    const oldText = String(ed.old ?? ed.old_string ?? "");
    const newText = String(ed.new ?? ed.new_string ?? "");
    const idx = cur?.indexOf(oldText) ?? -1;
    hunks.push([cur !== undefined && idx >= 0 ? cur.slice(0, idx).split(/\r?\n/) : [], oldText.split(/\r?\n/), newText.split(/\r?\n/)]);
    if (cur !== undefined && idx >= 0) cur = cur.slice(0, idx) + newText + cur.slice(idx + oldText.length);
  }
  return composePatchEnvelope(composeUpdateFile(relPath, hunks));
}

export function patchForDelete(relPath: string): string {
  return composePatchEnvelope(composeDeleteFile(relPath));
}

export function patchForMove(oldRel: string, newRel: string): string {
  return composePatchEnvelope(composeUpdateFile(oldRel, [], newRel));
}

