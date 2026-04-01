/**
 * Safe JSON parsing for fetch() responses — avoids crashes when the server
 * returns HTML or plain text (e.g. proxy errors, 502 pages).
 */

export type ParsedJsonResponse = {
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
};

export async function parseJsonResponse(res: Response): Promise<ParsedJsonResponse> {
  const text = await res.text();
  if (!text.trim()) {
    return { ok: res.ok, status: res.status, data: {} };
  }
  try {
    const data = JSON.parse(text) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return {
      ok: false,
      status: res.status,
      data: {
        error:
          res.ok
            ? "The server returned invalid data. Please try again."
            : `Request failed (${res.status}). Please try again.`,
      },
    };
  }
}

/** Use when HTTP 2xx is required; throws Error with a user-safe message otherwise. */
export async function parseApiJson<T extends Record<string, unknown>>(res: Response): Promise<T> {
  const { ok, status, data } = await parseJsonResponse(res);
  if (!ok) {
    const msg =
      typeof data.error === "string" ? data.error : `Request failed (${status}). Please try again.`;
    throw new Error(msg);
  }
  return data as T;
}
