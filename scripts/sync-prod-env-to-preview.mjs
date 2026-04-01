/**
 * Copy selected keys from a production env pull into Vercel **Development**
 * (`vercel dev`, etc.). Preview often requires a linked Git branch; use the dashboard
 * for Preview or connect the repository in Vercel.
 *
 * 1) npx vercel env pull .env.sync-from-prod --environment=production --yes
 * 2) node scripts/sync-prod-env-to-preview.mjs
 */
import { readFileSync, existsSync } from "fs";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(root, ".env.sync-from-prod");

const KEYS = new Set([
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NVIDIA_API_KEY",
  "NEXT_PUBLIC_APP_URL",
]);

/** Vercel environment name */
const TARGET = "development";

function parseEnv(content) {
  const out = {};
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v.replace(/\\n/g, "\n").replace(/\\"/g, '"');
  }
  return out;
}

if (!existsSync(envFile)) {
  console.error(
    "Missing .env.sync-from-prod — run: npx vercel env pull .env.sync-from-prod --environment=production --yes",
  );
  process.exit(1);
}

const all = parseEnv(readFileSync(envFile, "utf8"));

for (const key of KEYS) {
  const val = all[key];
  if (val === undefined || val === "") {
    console.log(`skip ${key} (missing or empty)`);
    continue;
  }
  const r = spawnSync(
    "npx",
    ["vercel", "env", "add", key, TARGET, "--yes", "--force", "--value", val],
    { cwd: root, shell: true, encoding: "utf-8" },
  );
  if (r.status !== 0) {
    console.error(`failed: ${key} → ${TARGET}`);
    console.error(r.stderr || r.stdout);
    process.exit(r.status ?? 1);
  }
  console.log(`ok: ${key} → ${TARGET}`);
}

console.log("done");
