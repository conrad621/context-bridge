import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const files = args.length
  ? args.map((arg) => arg.replace(/^tests\//, "dist/tests/").replace(/\.ts$/, ".js"))
  : ["dist/tests/*.test.js"];

const result = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit",
  shell: files.some((f) => f.includes("*")),
});

process.exit(result.status ?? 1);

