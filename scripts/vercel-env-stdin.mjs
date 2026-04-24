import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const cwd = path.join(root, "..");
const [filePath, name, env, ...rest] = process.argv.slice(2);
const force = rest.includes("--force");
if (!filePath || !name || !env) {
  console.error("Usage: node scripts/vercel-env-stdin.mjs <filePath> <varName> <environment> [--force]");
  process.exit(1);
}
const value = readFileSync(filePath, "utf8").trim();
const args = ["vercel", "env", "add", name, env, "--yes"];
if (force) args.push("--force");
const r = spawnSync("npx", args, { cwd, shell: true, encoding: "utf8", input: value, maxBuffer: 20 * 1024 * 1024 });
process.stdout.write(r.stdout || "");
process.stderr.write(r.stderr || "");
process.exit(r.status === null ? 1 : r.status);