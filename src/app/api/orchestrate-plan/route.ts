import { NextRequest, NextResponse } from "next/server";
import { readJsonBody } from "@/lib/read-json-body";
import { runFullPlanOrchestration } from "@/lib/plan-orchestration";
import { httpStatusForAiFailure, messageForAiRouteFailure } from "@/lib/map-ai-route-error";

/**
 * Single server invocation: architecture analysis (2 LLM phases) + build prompts (1 LLM call).
 * Avoids chained client requests and cold starts between /analyze-project and /generate-prompts.
 */
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const b = parsed.body as Record<string, unknown>;
  const name = (typeof b.projectName === "string" ? b.projectName : "My App").trim();
  const idea = (typeof b.projectIdea === "string" ? b.projectIdea : "").trim();

  try {
    const { analysis, prompts, blueprint } = await runFullPlanOrchestration(name, idea);
    return NextResponse.json({
      analysis,
      prompts,
      blueprint,
    });
  } catch (err) {
    console.error("[orchestrate-plan]", err);
    return NextResponse.json(
      { error: messageForAiRouteFailure(err) },
      { status: httpStatusForAiFailure(err) },
    );
  }
}
