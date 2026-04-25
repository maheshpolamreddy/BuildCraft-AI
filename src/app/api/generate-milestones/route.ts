import { after } from "next/server";
import { NextRequest } from "next/server";
import { readJsonBody } from "@/lib/read-json-body";
import { ensureValidAiResponse } from "@/lib/ai-guaranteed-response";
import { scheduleBackgroundRecovery } from "@/lib/ai-recovery-probe";
import { hashAiInputs, setAiGenerationFirestore, setRedisAiCache } from "@/lib/ai-generation-cache";
import { normalizeAnalyzeTextInputs } from "@/lib/ai-input-normalize";
import { withInflightDedup } from "@/lib/ai-inflight-guard";
import { buildFailsafeMilestonesPayload } from "@/lib/ai-milestone-failsafe";
import {
  canRunDeferredJobs,
  createDeferredJobId,
  setDeferredJobComplete,
  setDeferredJobPending,
} from "@/lib/ai-deferred-jobs";
import { buildMilestonesPayloadCore, isValidMilestonesPayload } from "@/lib/ai-milestones-build";
import { aiSuccessJson } from "@/lib/ai-response-envelope";
import type { AiResponseSource } from "@/lib/ai-response-envelope";
import { rateLimitAiRoute } from "@/lib/cache";

export const maxDuration = 180;

function deferredAcceptedJson(jobId: string) {
  return { success: true as const, data: { jobId, status: "pending" as const }, source: "ai" as const };
}

export async function POST(req: NextRequest) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const b = parsed.body as Record<string, unknown>;
  const rawName = (typeof b.projectName === "string" ? b.projectName : "My App").trim();
  const rawIdea = (typeof b.projectIdea === "string" ? b.projectIdea : "").trim();
  const { name, idea } = normalizeAnalyzeTextInputs(rawName, rawIdea);
  const projectId =
    typeof b.projectId === "string" && b.projectId.trim() ? b.projectId.trim() : undefined;
  const deferred = b.deferred === true;

  const limited = await rateLimitAiRoute(req, "generate-milestones");
  if (limited) return limited;

  const inputHash = await hashAiInputs("milestones", name, idea);
  const inflightKey = `milestone_ai:${inputHash}`;

  try {
    if (deferred && canRunDeferredJobs()) {
      const jobId = await createDeferredJobId();
      await setDeferredJobPending(jobId);
      after(async () => {
        try {
          const { payload } = await buildMilestonesPayloadCore({ name, idea, projectId, inputHash });
          await setDeferredJobComplete(jobId, payload);
        } catch {
          await setDeferredJobComplete(jobId, buildFailsafeMilestonesPayload(name, idea));
        }
      });
      return Response.json(deferredAcceptedJson(jobId), { status: 202 });
    }

    return await withInflightDedup(inflightKey, async () => {
      const { payload, source: buildSource } = await buildMilestonesPayloadCore({
        name,
        idea,
        projectId,
        inputHash,
      });
      const fall = buildFailsafeMilestonesPayload(name, idea) as unknown as Record<string, unknown>;
      const out = ensureValidAiResponse(payload, fall, (p) => isValidMilestonesPayload(p));
      const source: AiResponseSource = out === fall ? "fallback" : buildSource;
      scheduleBackgroundRecovery(after, { name, idea, projectId });
      return aiSuccessJson(out, source);
    });
  } catch (err) {
    const fall = buildFailsafeMilestonesPayload(name, idea) as unknown as Record<string, unknown>;
    await setRedisAiCache("milestones", [name, idea], fall).catch(() => {});
    if (projectId) await setAiGenerationFirestore(projectId, "milestones", inputHash, fall).catch(() => {});
    scheduleBackgroundRecovery(after, { name, idea, projectId });
    return aiSuccessJson(fall, "fallback");
  }
}
