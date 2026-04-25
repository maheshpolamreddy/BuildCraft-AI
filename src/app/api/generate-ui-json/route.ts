import { NextRequest } from "next/server";
import { readJsonBody } from "@/lib/read-json-body";
import { hasAnyUiGenerationProvider } from "@/lib/ai-provider-registry";
import { runUiJsonPipeline } from "@/lib/ui-json-pipeline";
import type { UIScreenJson } from "@/lib/ui-json-schema";
import { aiSuccessJson } from "@/lib/ai-response-envelope";

export const maxDuration = 120;

const EMPTY_UI: UIScreenJson = { page: "Home", layout: "grid", components: [] };

export async function POST(req: NextRequest) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const b = parsed.body as Record<string, unknown>;
  const prompt = typeof b.prompt === "string" ? b.prompt.trim() : "";
  const projectName = typeof b.projectName === "string" ? b.projectName.trim() : "My App";
  const projectIdea = typeof b.projectIdea === "string" ? b.projectIdea : "";

  if (prompt.length < 3) {
    return aiSuccessJson({ ok: true, ui: EMPTY_UI, meta: { reason: "short_prompt" } }, "fallback");
  }

  if (!hasAnyUiGenerationProvider()) {
    return aiSuccessJson({ ok: true, ui: EMPTY_UI, meta: { reason: "no_provider" } }, "fallback");
  }

  try {
    const { ui, meta } = await runUiJsonPipeline({
      prompt,
      projectName,
      projectIdea: projectIdea || `Application: ${projectName}`,
    });
    return aiSuccessJson({ ok: true, ui, meta }, "ai");
  } catch (err) {
    console.error("[generate-ui-json]", err);
    return aiSuccessJson({ ok: true, ui: EMPTY_UI, meta: {} }, "fallback");
  }
}
