/** Max size before we reject (keeps browser + API payloads reasonable). */
export const MAX_PROJECT_UPLOAD_BYTES = 512 * 1024;

/** Truncate very long extracts so the model stays within practical context. */
export const MAX_EXTRACTED_TEXT_CHARS = 40_000;

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".csv",
  ".xml",
  ".html",
  ".htm",
  ".yaml",
  ".yml",
  ".toml",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".scss",
  ".less",
  ".env",
  ".env.local",
  ".log",
  ".rst",
  ".adoc",
  ".svg",
]);

function looksTextBased(file: File): boolean {
  const lower = file.name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot) : "";
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (file.type.startsWith("text/")) return true;
  if (file.type === "application/json" || file.type === "application/xml") return true;
  return false;
}

function truncateExtract(text: string): string {
  const t = text.trim();
  if (t.length <= MAX_EXTRACTED_TEXT_CHARS) return t;
  return `${t.slice(0, MAX_EXTRACTED_TEXT_CHARS)}\n\n[truncated after ${MAX_EXTRACTED_TEXT_CHARS} characters]`;
}

/** Reject obvious binary garbage from mislabeled uploads. */
function hasSuspiciousBinaryNoise(text: string): boolean {
  if (text.length < 80) return false;
  let bad = 0;
  for (let i = 0; i < Math.min(text.length, 8000); i++) {
    const c = text.charCodeAt(i);
    if (c === 0xfffd) bad += 3;
    if (c === 0) bad += 2;
  }
  return bad / Math.min(text.length, 8000) > 0.02;
}

export type ReadUploadedProjectFileResult = {
  text: string;
  name: string;
};

/**
 * Read a user-selected file as UTF-8 text for project analysis.
 * PDF/Word are not parsed - user should export to text or paste content.
 */
export function readUploadedProjectFile(file: File): Promise<ReadUploadedProjectFileResult> {
  if (!looksTextBased(file)) {
    return Promise.reject(
      new Error(
        "This file type is not supported for auto-extract. Use a text file (.txt, .md, .json, code) or paste the content.",
      ),
    );
  }
  if (file.size > MAX_PROJECT_UPLOAD_BYTES) {
    return Promise.reject(new Error(`File is too large (max ${Math.round(MAX_PROJECT_UPLOAD_BYTES / 1024)} KB).`));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === "string" ? reader.result : "";
      if (!raw.trim()) {
        reject(new Error("File appears empty."));
        return;
      }
      if (hasSuspiciousBinaryNoise(raw)) {
        reject(
          new Error(
            "Could not read usable text from this file. It may be binary (e.g. PDF/DOCX). Export as .txt or paste the text.",
          ),
        );
        return;
      }
      resolve({ text: truncateExtract(raw), name: file.name });
    };
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsText(file, "UTF-8");
  });
}
