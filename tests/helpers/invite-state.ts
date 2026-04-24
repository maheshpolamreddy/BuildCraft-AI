import fs from "fs";
import path from "path";

export function readLastInviteToken(): string | null {
  const p = path.join(process.cwd(), "tests", ".state", "last-invite-token.txt");
  if (!fs.existsSync(p)) return null;
  const t = fs.readFileSync(p, "utf8").trim();
  return t || null;
}
