import { NextRequest, NextResponse } from "next/server";
import { readJsonBody } from "@/lib/read-json-body";
import { httpStatusForAiFailure, messageForAiRouteFailure } from "@/lib/map-ai-route-error";
import { hasAnyUiGenerationProvider, AI_ORCHESTRATION_CONFIG_ERROR } from "@/lib/ai-provider-registry";
import { runUiJsonPipeline } from "@/lib/ui-json-pipeline";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const b = parsed.body as Record<string, unknown>;
  const prompt = typeof b.prompt === "string" ? b.prompt.trim() : "";
  const projectName = typeof b.projectName === "string" ? b.projectName.trim() : "My App";
  const projectIdea = typeof b.projectIdea === "string" ? b.projectIdea : "";

  if (prompt.length < 3) {
    return NextResponse.json({ error: "Please enter a UI description (at least 3 characters)." }, { status: 400 });
  }

  if (!hasAnyUiGenerationProvider()) {
    return NextResponse.json({ error: AI_ORCHESTRATION_CONFIG_ERROR }, { status: 503 });
  }

  try {
    const { ui, meta } = await runUiJsonPipeline({
      prompt,
      projectName,
      projectIdea: projectIdea || `Application: ${projectName}`,
    });
    return NextResponse.json({ ok: true, ui, meta });
  } catch (err) {
    console.error("[generate-ui-json]", err);
    return NextResponse.json(
      { error: messageForAiRouteFailure(err) },
      { status: httpStatusForAiFailure(err) },
    );
  }
}
