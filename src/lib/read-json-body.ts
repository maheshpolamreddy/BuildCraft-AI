import { NextRequest, NextResponse } from "next/server";

/** Parse JSON body; return 400 if body is missing or not valid JSON. */
export async function readJsonBody(req: NextRequest): Promise<
  { ok: true; body: unknown } | { ok: false; response: NextResponse }
> {
  try {
    const text = await req.text();
    if (!text.trim()) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Request body is required" }, { status: 400 }),
      };
    }
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 }),
    };
  }
}
