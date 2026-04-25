import { getNimClient } from "@/lib/nim-client";
import { orchestrateChatCompletion } from "@/lib/ai-orchestrator";
import { getAdaptiveAiMode, notifyRecoveryProbeSuccess } from "@/lib/ai-global-mode";
import { redis } from "@/lib/cache";
import { hashAiInputs, getAiGenerationFirestore } from "@/lib/ai-generation-cache";
import { normalizeAnalyzeTextInputs } from "@/lib/ai-input-normalize";
import type { PrdBuildArgs } from "@/lib/prd-api-build";

let recoveryRequestCount = 0;

export function bumpRecoveryRequestCounter(): void {
  recoveryRequestCount = (recoveryRequestCount + 1) % 1_000_000;
}

function shouldRunProbeThisRequest(): boolean {
  if (getAdaptiveAiMode() !== "safe_mode") return false;
  return recoveryRequestCount > 0 && recoveryRequestCount % 4 === 0;
}

export type RecoveryContext = {
  name: string;
  idea: string;
  /** When set, used to resolve name/idea from Firestore and to scope milestone/PRD cache warm. */
  projectId?: string;
};

/**
 * Resolves project title + idea; prefers explicit strings, then Firestore by projectId.
 */
async function resolveNameIdeaForWarmup(ctx: RecoveryContext): Promise<{ name: string; idea: string; projectId?: string }> {
  let name = (ctx.name || "").trim();
  let idea = (ctx.idea || "").trim();
  const projectId = ctx.projectId?.trim();

  if (projectId && (!name || name === "My App" || !idea)) {
    try {
      const { getProject } = await import("@/lib/firestore");
      const saved = await getProject(projectId);
      if (saved?.project) {
        if (!name || name === "My App") {
          const n = typeof saved.project.name === "string" ? saved.project.name.trim() : "";
          if (n) name = n;
        }
        if (!idea) {
          const i = typeof saved.project.idea === "string" ? saved.project.idea.trim() : "";
          if (i) idea = i;
        }
      }
    } catch (e) {
      console.warn("[ai-recovery-probe] getProject failed:", e);
    }
  }

  const nameF = name || "My App";
  const ideaF = idea || `A modern web application called ${nameF}`;
  return { ...normalizeAnalyzeTextInputs(nameF, ideaF), projectId };
}

/**
 * When adaptive mode is safe, periodically issue a tiny LLM call (bypassing safe skip) to detect recovery.
 * On success, temporarily forces `normal` mode and warms plan caches: analysis, prompts, milestones, PRD.
 */
export function scheduleBackgroundRecovery(
  after: (fn: () => void | Promise<void>) => void,
  context?: RecoveryContext,
): void {
  bumpRecoveryRequestCounter();
  if (!getNimClient() || !shouldRunProbeThisRequest()) return;
  after(async () => {
    const ok = await runLivenessRecoveryProbe();
    if (!ok) return;
    notifyRecoveryProbeSuccess();
    if (!context) return;
    const { name: n, idea: i, projectId } = await resolveNameIdeaForWarmup(context);
    if (!n.trim()) return;

    try {
      const { runFullPlanOrchestration } = await import("@/lib/plan-orchestration");
      const { generateCacheKey, setCachedOrchestration } = await import("@/lib/cache");
      const { analysis, prompts, blueprint } = await runFullPlanOrchestration(n, i);
      const aKey = await generateCacheKey("analysis", n, i);
      await setCachedOrchestration(aKey, analysis, 45 * 24 * 60 * 60);
      const toolStack = analysis.tools.map((t) => t.name).join(", ");
      const pKey = await generateCacheKey("prompts", n, i, toolStack);
      await setCachedOrchestration(pKey, { prompts, blueprint }, 45 * 24 * 60 * 60);
    } catch (e) {
      console.warn("[ai-recovery-probe] plan warm:", e);
    }

    try {
      const { buildMilestonesPayloadCore } = await import("@/lib/ai-milestones-build");
      const inputHashM = await hashAiInputs("milestones", n, i);
      await buildMilestonesPayloadCore({ name: n, idea: i, projectId, inputHash: inputHashM });
    } catch (e) {
      console.warn("[ai-recovery-probe] milestones warm:", e);
    }

    if (projectId) {
      const dedupeKey = `ai:recovery:prd_warm:${projectId}`;
      try {
        if (redis && (await redis.get(dedupeKey))) return;
        if (redis) await redis.set(dedupeKey, "1", { ex: 3600 });
      } catch {
        /* continue without dedupe */
      }
      try {
        const { runFullPrdBuild } = await import("@/lib/prd-api-build");
        const projectName = n;
        const ideaStr = i;
        const summary = "";
        const stack: string[] = [];
        const stackSig = "";
        const inputHash = await hashAiInputs("prd", projectName, ideaStr, summary, stackSig, "", "");
        const existing = await getAiGenerationFirestore<{ success?: boolean; prdId?: string }>(
          projectId,
          "prd",
          inputHash,
        );
        if (existing?.success && existing.prdId) return;
        const prdCacheKey: [string, string, string, string] = [projectName, ideaStr, summary, stackSig];
        const projectBrief =
          [ideaStr && `Project idea (from creator):\n${ideaStr}`].filter(Boolean).join("\n\n---\n\n") ||
          "(No additional description from creator.)";
        const prompt = `You are a senior software architect. Generate a detailed Project Requirement Document (PRD) for the following project.

Project Name: ${projectName}

GROUND TRUTH — what the project creator actually submitted (preserve this meaning in overview and scope; do not invent a different product):
${projectBrief}

Tech Stack Approved: To be determined

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
        const args: PrdBuildArgs = {
          projectName,
          idea: ideaStr,
          summary,
          stack,
          stackSig,
          scopeId: projectId,
          inputHash,
          prdCacheKey,
          hireToken: "",
          creatorUid: "recovery",
          developerUid: "recovery",
          projectBrief,
          prompt,
        };
        await runFullPrdBuild(args);
      } catch (e) {
        console.warn("[ai-recovery-probe] prd warm:", e);
      }
    }
  });
}

export async function runLivenessRecoveryProbe(): Promise<boolean> {
  if (!getNimClient()) return false;
  try {
    const out = await orchestrateChatCompletion(
      "validation",
      { messages: [{ role: "user", content: "ok" }], max_tokens: 12, temperature: 0 },
      { primaryOnly: true, recoveryProbe: true },
    );
    return (out?.trim().length ?? 0) > 0;
  } catch {
    return false;
  }
}
