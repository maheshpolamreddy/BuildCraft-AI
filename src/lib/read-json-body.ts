import { NextRequest, NextResponse } from "next/server";

const invalid = (code: "body_required" | "invalid_json") =>
  NextResponse.json(
    { success: true as const, data: { code }, source: "fallback" as const },
    { status: 400 },
  );

/** Parse JSON body; return 400 if body is missing or not valid JSON (envelope, no `error` field). */
export async function readJsonBody(req: NextRequest): Promise<
  { ok: true; body: unknown } | { ok: false; response: NextResponse }
> {
  try {
    const text = await req.text();
    if (!text.trim()) {
      return { ok: false, response: invalid("body_required") };
    }
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, response: invalid("invalid_json") };
  }
}
