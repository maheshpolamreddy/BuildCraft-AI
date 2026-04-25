import { NextResponse } from "next/server";

export type AiResponseSource = "ai" | "cache" | "fallback";

export type AiSuccessEnvelope<T> = {
  success: true;
  data: T;
  source: AiResponseSource;
};

export function isAiSuccessEnvelope(raw: unknown): raw is AiSuccessEnvelope<unknown> {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return (
    o.success === true &&
    "data" in o &&
    typeof o.source === "string" &&
    (o.source === "ai" || o.source === "cache" || o.source === "fallback")
  );
}

export function aiSuccessJson<T>(data: T, source: AiResponseSource, init?: ResponseInit): NextResponse {
  const body: AiSuccessEnvelope<T> = { success: true, data, source };
  return NextResponse.json(body, { status: 200, ...init });
}