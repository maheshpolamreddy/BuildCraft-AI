import { NextRequest, NextResponse } from "next/server";
import { readJsonBody } from "@/lib/read-json-body";
import {
  runAnalyzeProjectCore,
  type ArchLayer,
  type AiTool,
  type AiRisk,
  type ProjectAnalysis,
} from "@/lib/plan-orchestration";
import { httpStatusForAiFailure, messageForAiRouteFailure } from "@/lib/map-ai-route-error";
import {
  getAiGenerationFirestore,
  hashAiInputs,
  setAiGenerationFirestore,
} from "@/lib/ai-generation-cache";

/**
 * Two phases: smaller outputs per request finish faster and fail less often than one huge JSON.
 * Retries each phase once on timeout-style errors.
 */
export const maxDuration = 300;

export type { ArchLayer, AiTool, AiRisk, ProjectAnalysis };

export async function POST(req: NextRequest) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const b = parsed.body as Record<string, unknown>;
  const name = (typeof b.projectName === "string" ? b.projectName : "My App").trim();
  const idea = (typeof b.projectIdea === "string" ? b.projectIdea : "").trim();
  const projectId =
    typeof b.projectId === "string" && b.projectId.trim() ? b.projectId.trim() : undefined;

  try {
    const inputHash = await hashAiInputs("architecture", name, idea);
    if (projectId) {
      const cached = await getAiGenerationFirestore<ProjectAnalysis>(projectId, "architecture", inputHash);
      if (cached?.overview?.summary) {
        return NextResponse.json(cached);
      }
    }

    const analysis = await runAnalyzeProjectCore(name, idea);
    if (projectId) {
      await setAiGenerationFirestore(projectId, "architecture", inputHash, analysis);
    }
    return NextResponse.json(analysis);
  } catch (err) {
    console.error("[analyze-project] error:", err);
    return NextResponse.json(
      { error: messageForAiRouteFailure(err) },
      { status: httpStatusForAiFailure(err) },
    );
  }
}
