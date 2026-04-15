/**
 * Ensures Past Projects / Firestore always get a non-empty display name.
 * The AI may return name: "" for file-heavy specs; `?? "Custom App"` does not catch "".
 */
export function resolveProjectDisplayName(aiName: unknown, fileName: string | undefined): string {
  let raw = "";
  if (typeof aiName === "string") raw = aiName.trim();
  else if (typeof aiName === "number" && Number.isFinite(aiName)) raw = String(aiName).trim();

  if (raw.length > 0) return raw.slice(0, 120);

  if (fileName) {
    const base = fileName.split(/[/\\]/).pop() ?? fileName;
    const noExt = base.replace(/\.[^.]+$/u, "");
    const label = noExt.replace(/[-_]+/g, " ").trim();
    if (label.length > 0) return label.slice(0, 120);
  }

  return "Custom App";
}

/** Matches the merge line written in Discovery when a file is attached: `--- From file: name ---` */
const FROM_FILE_LINE = /---\s*From file:\s*([^\n\r]+?)\s*---/i;

export function extractUploadedFileNameFromIdea(idea: string | undefined): string | undefined {
  if (!idea || typeof idea !== "string") return undefined;
  const m = idea.match(FROM_FILE_LINE);
  const s = m?.[1]?.trim();
  return s && s.length > 0 ? s : undefined;
}

/**
 * Title shown in Past Projects lists. Handles missing/empty `name`, legacy Firestore rows,
 * and file uploads where the filename only appears inside `idea`.
 */
export function pastProjectDisplayTitle(project: { name?: string; idea?: string }): string {
  const idea = typeof project.idea === "string" ? project.idea : "";
  const fileFromIdea = extractUploadedFileNameFromIdea(idea);
  const primary = resolveProjectDisplayName(project.name, fileFromIdea);

  if (primary !== "Custom App") return primary;

  const afterMarker = idea.replace(FROM_FILE_LINE, "").trim();
  const body = afterMarker.length > 0 ? afterMarker : idea.trim();
  const words = body
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 12)
    .join(" ");
  if (words.length > 0) return words.length > 80 ? `${words.slice(0, 77)}...` : words;

  return "Untitled project";
}
