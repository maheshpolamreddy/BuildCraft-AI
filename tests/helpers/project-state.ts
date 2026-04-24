import fs from "fs";
import path from "path";

const STATE_DIR = path.join(__dirname, "..", ".state");

export function writeLastProjectId(projectId: string): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(path.join(STATE_DIR, "last-project-id.txt"), projectId.trim(), "utf8");
}

export function readLastProjectId(): string | null {
  const p = path.join(STATE_DIR, "last-project-id.txt");
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8").trim() || null;
}

/** Firebase Auth uid for E2E_DEVELOPER_EMAIL (written by global-setup). */
export function readE2EDeveloperUid(): string | null {
  const p = path.join(STATE_DIR, "e2e-developer-uid.txt");
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8").trim() || null;
}

export function readSavedProjectIdFromZustandLocalStorage(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { state?: { savedProjectId?: string | null } };
    const id = parsed.state?.savedProjectId;
    return typeof id === "string" && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}
