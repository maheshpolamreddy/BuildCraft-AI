/**
 * Runs Playwright with Vercel Preview env vars (decrypted when available).
 * On Windows, shell:true is required so npx spawns correctly.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extra = process.argv.slice(2);
const args = [
  "vercel",
  "env",
  "run",
  "-e",
  "preview",
  "--",
  "npx",
  "playwright",
  "test",
  ...extra,
];

const shell = process.platform === "win32";
const r = spawnSync("npx", args, { stdio: "inherit", cwd: root, shell });
process.exit(r.status === null ? 1 : r.status);