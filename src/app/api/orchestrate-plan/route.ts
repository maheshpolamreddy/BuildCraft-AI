import { after } from "next/server";
import { NextRequest } from "next/server";
import { readJsonBody } from "@/lib/read-json-body";
import { buildFailsafeProjectAnalysis, buildFailsafePromptPack } from "@/lib/ai-failsafe";
import { ensureValidAiResponse } from "@/lib/ai-guaranteed-response";
import { scheduleBackgroundRecovery } from "@/lib/ai-recovery-probe";
import {
  runFullPlanOrchestration,
  type ProjectAnalysis,
  type ProjectBlueprint,
  type GeneratedPromptRow,
} from "@/lib/plan-orchestration";
import { aiSuccessJson } from "@/lib/ai-response-envelope";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const b = parsed.body as Record<string, unknown>;
  const name = (typeof b.projectName === "string" ? b.projectName : "My App").trim();
  const idea = (typeof b.projectIdea === "string" ? b.projectIdea : "").trim();
  const projectId =
    typeof b.projectId === "string" && b.projectId.trim() ? b.projectId.trim() : undefined;

  const ppF = buildFailsafePromptPack(name);
  const failPack = {
    analysis: buildFailsafeProjectAnalysis(name, idea),
    prompts: ppF.prompts,
    blueprint: ppF.blueprint,
  };

  try {
    const { analysis, prompts, blueprint } = await runFullPlanOrchestration(name, idea);
    const out = {
      analysis: ensureValidAiResponse<ProjectAnalysis>(
        analysis,
        failPack.analysis,
        (a) => Boolean(a?.overview?.summary) && Array.isArray(a?.tools) && a.tools.length > 0,
      ),
      prompts: ensureValidAiResponse<GeneratedPromptRow[]>(prompts, failPack.prompts, (p) => Array.isArray(p) && p.length > 0),
      blueprint: ensureValidAiResponse<ProjectBlueprint>(blueprint, failPack.blueprint, (bl) => Array.isArray(bl?.pages) && bl.pages.length > 0),
    };
    scheduleBackgroundRecovery(after, { name, idea, projectId });
    return aiSuccessJson(out, "ai");
  } catch {
    console.error("[orchestrate-plan] fallback path");
    scheduleBackgroundRecovery(after, { name, idea, projectId });
    return aiSuccessJson(
      {
        analysis: buildFailsafeProjectAnalysis(name, idea),
        prompts: buildFailsafePromptPack(name).prompts,
        blueprint: buildFailsafePromptPack(name).blueprint,
      },
      "fallback",
    );
  }
}
