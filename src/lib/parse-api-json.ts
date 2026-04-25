/**
 * Safe JSON parsing for fetch() responses — avoids crashes when the server
 * returns HTML or plain text (e.g. proxy errors, 502 pages).
 *
 * When the body uses the AI success envelope `{ success: true, data, source }`, the returned
 * `data` field is the **inner** payload so existing callers keep reading the same shape.
 */
import { isAiSuccessEnvelope } from "@/lib/ai-response-envelope";

export type ParsedJsonResponse = {
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
};

function unwrapAiEnvelopeIfPresent(raw: unknown): Record<string, unknown> {
  if (isAiSuccessEnvelope(raw)) {
    const inner = raw.data;
    if (inner !== null && typeof inner === "object" && !Array.isArray(inner)) {
      return inner as Record<string, unknown>;
    }
    return { _data: inner } as Record<string, unknown>;
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

export async function parseJsonResponse(res: Response): Promise<ParsedJsonResponse> {
  const text = await res.text();
  if (!text.trim()) {
    return { ok: res.ok, status: res.status, data: {} };
  }
  try {
    const parsed: unknown = JSON.parse(text);
    const data = unwrapAiEnvelopeIfPresent(parsed);
    return { ok: res.ok, status: res.status, data };
  } catch {
    return {
      ok: false,
      status: res.status,
      data: { parseFailed: true },
    };
  }
}

/** Use when HTTP 2xx is required; throws Error with a user-safe message otherwise. */
export async function parseApiJson<T extends Record<string, unknown>>(res: Response): Promise<T> {
  const { ok, status, data } = await parseJsonResponse(res);
  if (!ok) {
    throw new Error(`Request failed (${status}).`);
  }
  return data as T;
}
