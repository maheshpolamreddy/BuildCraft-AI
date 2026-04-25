/** Strip common markdown fences, then return first {...} JSON object slice, or null. */
export function extractJsonObjectString(raw: string): string | null {
  const t = raw
    .replace(/^```[\w]*\n?/gm, "")
    .replace(/\n?```$/gm, "")
    .trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return t.slice(start, end + 1);
}

export function tryParseJsonObject(raw: string): unknown | null {
  const s = extractJsonObjectString(raw);
  if (!s) return null;
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return null;
  }
}