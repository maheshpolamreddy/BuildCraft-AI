import { after } from "next/server";
import { NextRequest } from "next/server";
import { readJsonBody } from "@/lib/read-json-body";
import { getNimClient } from "@/lib/nim-client";
import { ensureValidAiResponse } from "@/lib/ai-guaranteed-response";
import { scheduleBackgroundRecovery } from "@/lib/ai-recovery-probe";
import { shouldSkipLlmCalls } from "@/lib/ai-global-mode";
import { runFullPrdBuild, type PrdApiResponse, type PrdBuildArgs } from "@/lib/prd-api-build";
import { setPrdOnRequest } from "@/lib/hireRequests";
import {
  getAiGenerationFirestore,
  getRedisAiCache,
  hashAiInputs,
  setAiGenerationFirestore,
} from "@/lib/ai-generation-cache";
import { normalizeAnalyzeTextInputs } from "@/lib/ai-input-normalize";
import { withInflightDedup } from "@/lib/ai-inflight-guard";
import {
  canRunDeferredJobs,
  createDeferredJobId,
  setDeferredJobComplete,
  setDeferredJobPending,
} from "@/lib/ai-deferred-jobs";
import { aiSuccessJson } from "@/lib/ai-response-envelope";
import type { AiResponseSource } from "@/lib/ai-response-envelope";

export const maxDuration = 180;

function deferred202(jobId: string) {
  return Response.json(
    { success: true as const, data: { jobId, status: "pending" as const }, source: "ai" as const },
    { status: 202 },
  );
}

export async function POST(req: NextRequest) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  let prdBuildArgs: PrdBuildArgs | null = null;
  let savedProjectIdForRecovery: string | undefined;
  try {
    const body = parsed.body as Record<string, unknown> & { savedProjectId?: string; deferred?: boolean };
    const {
      projectName: projectNameRaw, projectIdea: projectIdeaRaw, projectSummary: projectSummaryRaw, techStack,
      creatorUid, developerUid, hireToken: hireTokenRaw,
    } = body;

    const hireToken = String(hireTokenRaw ?? "");
    const savedProjectId = typeof body.savedProjectId === "string" ? body.savedProjectId.trim() : "";
    savedProjectIdForRecovery = savedProjectId || undefined;

    const stack = Array.isArray(techStack) ? (techStack as string[]) : [];
    const { name: nameNorm, idea: ideaNorm } = normalizeAnalyzeTextInputs(
      String(projectNameRaw ?? "Project"),
      String(projectIdeaRaw ?? ""),
    );
    const summaryRaw = String(projectSummaryRaw ?? "").trim();
    const idea = ideaNorm;
    const summary = summaryRaw.length > 8_000 ? `${summaryRaw.slice(0, 7_800)}\n\n[truncated]` : summaryRaw;
    const projectName = nameNorm;
    const scopeId = savedProjectId || hireToken.trim() || String(creatorUid ?? "anon");
    const stackSig = [...stack].map((s) => String(s).trim().toLowerCase()).sort().join(",");
    const inputHash = await hashAiInputs(
      "prd",
      String(projectName ?? ""),
      idea,
      summary,
      stackSig,
      hireToken,
      String(creatorUid ?? ""),
    );

    const prdCacheKey: [string, string, string, string] = [String(projectName ?? ""), idea, summary, stackSig];

    const projectBrief =
      [summary && `Summary (from creator):\n${summary}`, idea && `Project idea (from creator):\n${idea}`]
        .filter(Boolean)
        .join("\n\n---\n\n") || "(No additional description from creator.)";

    const prompt = `You are a senior software architect. Generate a detailed Project Requirement Document (PRD) for the following project.

Project Name: ${projectName}

GROUND TRUTH — what the project creator actually submitted (preserve this meaning in overview and scope; do not invent a different product):
${projectBrief}

Tech Stack Approved: ${stack.join(", ") || "To be determined"}

Return ONLY valid JSON with this exact structure:
{
  "overview": "2-3 sentence project overview",
  "scope": "Clear scope statement",
  "features": ["feature 1", "feature 2", "feature 3", "feature 4", "feature 5"],
  "techStack": ["tech1", "tech2", "tech3"],
  "milestones": [
    { "phase": "Phase 1", "title": "Foundation", "duration": "2 weeks", "deliverables": ["deliverable 1", "deliverable 2"] },
    { "phase": "Phase 2", "title": "Core Features", "duration": "4 weeks", "deliverables": ["deliverable 1", "deliverable 2"] },
    { "phase": "Phase 3", "title": "Testing & Deployment", "duration": "2 weeks", "deliverables": ["deliverable 1", "deliverable 2"] }
  ],
  "risks": ["risk 1", "risk 2", "risk 3"]
}`;

    prdBuildArgs = {
      projectName: String(projectName),
      idea,
      summary,
      stack,
      stackSig,
      scopeId,
      inputHash,
      prdCacheKey,
      hireToken,
      creatorUid: String(creatorUid ?? ""),
      developerUid: String(developerUid ?? ""),
      projectBrief,
      prompt,
    };

    if (body.deferred === true && canRunDeferredJobs() && prdBuildArgs) {
      const jobId = await createDeferredJobId();
      const args = prdBuildArgs;
      await setDeferredJobPending(jobId);
      after(async () => {
        try {
          const out = await runFullPrdBuild(args);
          await setDeferredJobComplete(jobId, out);
        } catch {
          const fb = await runFullPrdBuild(args);
          await setDeferredJobComplete(jobId, fb);
        }
      });
      return deferred202(jobId);
    }

    return await withInflightDedup(`prd_ai:${inputHash}`, async () => {
    if (!prdBuildArgs) throw new Error("prd_build_args");
    const a = prdBuildArgs;
    const fsCached = await getAiGenerationFirestore<PrdApiResponse>(scopeId, "prd", inputHash);
    if (fsCached?.success && fsCached.prdId && fsCached.prd) {
      if (hireToken.trim()) {
        await setPrdOnRequest(hireToken, fsCached.prdId).catch(() => {});
      }
      const out = ensureValidAiResponse(fsCached, await runFullPrdBuild(a), (r) => Boolean(r?.prd?.overview));
      scheduleBackgroundRecovery(after, { name: a.projectName, idea: a.idea, projectId: savedProjectIdForRecovery });
      return aiSuccessJson(out, "cache");
    }

    const redisPrd = await getRedisAiCache<PrdApiResponse>("prd", prdCacheKey);
    if (redisPrd?.success && redisPrd.prdId && redisPrd.prd) {
      await setAiGenerationFirestore(scopeId, "prd", inputHash, redisPrd).catch(() => {});
      if (hireToken.trim()) {
        await setPrdOnRequest(hireToken, redisPrd.prdId).catch(() => {});
      }
      const out = ensureValidAiResponse(redisPrd, await runFullPrdBuild(a), (r) => Boolean(r?.prd?.overview));
      scheduleBackgroundRecovery(after, { name: a.projectName, idea: a.idea, projectId: savedProjectIdForRecovery });
      return aiSuccessJson(out, "cache");
    }

    const responseBody = await runFullPrdBuild(a);
    const out = ensureValidAiResponse(responseBody, responseBody, (r) => Boolean(r?.prd?.overview));
    scheduleBackgroundRecovery(after, { name: a.projectName, idea: a.idea, projectId: savedProjectIdForRecovery });
    const source: AiResponseSource =
      getNimClient() && !shouldSkipLlmCalls() ? "ai" : "fallback";
    return aiSuccessJson(out, source);
    });
  } catch (err) {
    console.error("[generate-prd]", err);
    if (prdBuildArgs) {
      const fb = await runFullPrdBuild(prdBuildArgs);
      const out = ensureValidAiResponse(fb, fb, (r) => Boolean(r?.prd?.overview));
      scheduleBackgroundRecovery(after, {
        name: prdBuildArgs.projectName,
        idea: prdBuildArgs.idea,
        projectId: savedProjectIdForRecovery,
      });
      return aiSuccessJson(out, "fallback");
    }
    const a: PrdBuildArgs = {
      projectName: "Project",
      idea: "",
      summary: "",
      stack: [] as string[],
      stackSig: "",
      scopeId: "anon",
      inputHash: "fallback",
      prdCacheKey: ["Project", "", "", ""] as [string, string, string, string],
      hireToken: "",
      creatorUid: "",
      developerUid: "",
      projectBrief: "(No additional description from creator.)",
      prompt: "Return minimal valid PRD json.",
    };
    const fb2 = await runFullPrdBuild(a);
    return aiSuccessJson(ensureValidAiResponse(fb2, fb2, (r) => Boolean(r?.prd?.overview)), "fallback");
  }
}
