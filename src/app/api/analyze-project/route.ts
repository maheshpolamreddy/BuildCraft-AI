import { after } from "next/server";
import { NextRequest } from "next/server";
import { readJsonBody } from "@/lib/read-json-body";
import {
  runAnalyzeProjectCore,
  type ArchLayer,
  type AiTool,
  type AiRisk,
  type ProjectAnalysis,
} from "@/lib/plan-orchestration";
import { buildFailsafeProjectAnalysis } from "@/lib/ai-failsafe";
import { ensureValidAiResponse } from "@/lib/ai-guaranteed-response";
import { scheduleBackgroundRecovery } from "@/lib/ai-recovery-probe";
import {
  getAiGenerationFirestore,
  hashAiInputs,
  setAiGenerationFirestore,
} from "@/lib/ai-generation-cache";
import { rateLimitAiRoute } from "@/lib/cache";
import {
  canRunDeferredJobs,
  createDeferredJobId,
  setDeferredJobComplete,
  setDeferredJobPending,
} from "@/lib/ai-deferred-jobs";
import { aiSuccessJson } from "@/lib/ai-response-envelope";

export const maxDuration = 300;

export type { ArchLayer, AiTool, AiRisk, ProjectAnalysis };

function deferred202(jobId: string) {
  return Response.json(
    { success: true as const, data: { jobId, status: "pending" as const }, source: "ai" as const },
    { status: 202 },
  );
}

export async function POST(req: NextRequest) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const b = parsed.body as Record<string, unknown>;
  const name = (typeof b.projectName === "string" ? b.projectName : "My App").trim();
  const idea = (typeof b.projectIdea === "string" ? b.projectIdea : "").trim();
  const projectId =
    typeof b.projectId === "string" && b.projectId.trim() ? b.projectId.trim() : undefined;
  const deferred = b.deferred === true;

  const limited = await rateLimitAiRoute(req, "analyze-project");
  if (limited) return limited;

  if (deferred && canRunDeferredJobs()) {
    const jobId = await createDeferredJobId();
    await setDeferredJobPending(jobId);
    after(async () => {
      try {
        const analysis = await runAnalyzeProjectCore(name, idea);
        if (projectId) {
          const inputHash = await hashAiInputs("architecture", name, idea);
          await setAiGenerationFirestore(projectId, "architecture", inputHash, analysis);
        }
        await setDeferredJobComplete(
          jobId,
          ensureValidAiResponse(analysis, buildFailsafeProjectAnalysis(name, idea), (a) =>
            Boolean(a?.overview?.summary),
          ),
        );
      } catch {
        const fb = buildFailsafeProjectAnalysis(name, idea);
        await setDeferredJobComplete(jobId, fb);
      }
    });
    return deferred202(jobId);
  }

  try {
    const inputHash = await hashAiInputs("architecture", name, idea);
    if (projectId) {
      const cached = await getAiGenerationFirestore<ProjectAnalysis>(projectId, "architecture", inputHash);
      if (cached?.overview?.summary) {
        scheduleBackgroundRecovery(after, { name, idea, projectId });
        const out = ensureValidAiResponse(
          cached,
          buildFailsafeProjectAnalysis(name, idea),
          (a) => Boolean(a?.overview?.summary),
        );
        return aiSuccessJson(out, "cache");
      }
    }

    const analysis = await runAnalyzeProjectCore(name, idea);
    const out = ensureValidAiResponse(
      analysis,
      buildFailsafeProjectAnalysis(name, idea),
      (a) => Boolean(a?.overview?.summary),
    );
    if (projectId) {
      await setAiGenerationFirestore(projectId, "architecture", inputHash, out);
    }
    scheduleBackgroundRecovery(after, { name, idea, projectId });
    return aiSuccessJson(out, "ai");
  } catch (err) {
    console.error("[analyze-project] error:", err);
    console.log(
      JSON.stringify({
        tag: "ai-monitor",
        event: "analyze_project_fail",
        message: err instanceof Error ? err.message : String(err),
        ts: new Date().toISOString(),
      }),
    );
    const inputHash = await hashAiInputs("architecture", name, idea);
    const fb = buildFailsafeProjectAnalysis(name, idea);
    if (projectId) {
      await setAiGenerationFirestore(projectId, "architecture", inputHash, fb).catch(() => {});
    }
    scheduleBackgroundRecovery(after, { name, idea, projectId });
    return aiSuccessJson(fb, "fallback");
  }
}
