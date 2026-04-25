import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.join(projectRoot, "src");

const forbiddenMonitor = path.join(root, "lib", "ai-monitor.ts");
if (fs.existsSync(forbiddenMonitor)) {
  try {
    fs.unlinkSync(forbiddenMonitor);
    console.warn(
      "\n[predev/prebuild] Removed src/lib/ai-monitor.ts (forbidden: breaks Turbopack when UTF-16).",
      "\nLog helpers live in ai-orchestrator.ts and plan-orchestration.ts only.",
      "\nIf you see 'Cannot find module @/lib/ai-monitor', remove that import from those two files.\n",
    );
  } catch (err) {
    console.error("\n[build] Close the file in your editor, then delete src/lib/ai-monitor.ts manually.\n", err);
    process.exit(1);
  }
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}

const bad = [];
for (const file of walk(root)) {
  const buf = fs.readFileSync(file);
  if (buf.length >= 2) {
    const a = buf[0];
    const b = buf[1];
    if ((a === 0xfe && b === 0xff) || (a === 0xff && b === 0xfe)) {
      bad.push(path.relative(projectRoot, file));
      continue;
    }
  }
  const n = Math.min(buf.length, 400);
  if (n >= 40) {
    let nulls = 0;
    for (let i = 0; i < n; i++) if (buf[i] === 0) nulls++;
    if (nulls / n > 0.12) {
      bad.push(path.relative(projectRoot, file) + " (likely UTF-16; re-save as UTF-8)");
    }
  }
}

if (bad.length) {
  console.error(
    "\n[build] Fix encoding in:\n" + bad.map((f) => "  - " + f).join("\n"),
  );
  process.exit(1);
}