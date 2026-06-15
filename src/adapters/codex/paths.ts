import path from "node:path";
import { homedir } from "node:os";

export let CODEX_HOME = path.join(homedir(), ".codex");
export function setCodexHome(p: string): void { CODEX_HOME = p; }

export function codexPath(uuid: string, tsIso: string, codexHome?: string): string {
  const home = codexHome ?? CODEX_HOME;
  const d = new Date(tsIso);
  const yyyy = String(d.getUTCFullYear()).padStart(4, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return path.join(home, "sessions", yyyy, mm, dd, `rollout-${yyyy}-${mm}-${dd}T${hh}-${mi}-${ss}-${uuid}.jsonl`);
}

