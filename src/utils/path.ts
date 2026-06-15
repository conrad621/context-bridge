import { homedir } from "node:os";
import { resolve } from "node:path";

export function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return resolve(homedir(), path.slice(2));
  return path;
}

export function envPath(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

