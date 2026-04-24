/**
 * Validates post-auth `return` query values so we never open-redirect to external origins
 * or odd schemes. Returns a safe in-app path + optional query/hash.
 */

const SAFE_PATH_PREFIXES = [
  "/auth",
  "/discovery",
  "/architecture",
  "/project-room",
  "/employee-dashboard",
  "/developer",
  "/workspace",
  "/creator",
  "/invite",
  "/privacy",
  "/terms",
] as const;

function pathOnly(url: string): string {
  const q = url.indexOf("?");
  const h = url.indexOf("#");
  const cut = Math.min(q === -1 ? url.length : q, h === -1 ? url.length : h);
  return url.slice(0, cut);
}

export function sanitizeInternalReturnPath(raw: string | null | undefined, fallback: string): string {
  if (raw == null || typeof raw !== "string") return fallback;
  const s = raw.trim();
  if (!s.startsWith("/") || s.startsWith("//")) return fallback;
  if (s.includes("\\") || s.includes("\n") || s.includes("\r")) return fallback;
  const base = pathOnly(s);
  if (base.includes(":")) return fallback;
  if (base === "/") return s.length <= 2048 ? s : "/";
  const ok = SAFE_PATH_PREFIXES.some((p) => base === p || base.startsWith(`${p}/`));
  if (!ok) return fallback;
  return s.length <= 2048 ? s : fallback;
}