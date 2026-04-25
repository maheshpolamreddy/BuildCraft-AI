import { after } from "next/server";
import { NextRequest } from "next/server";
import { readJsonBody } from "@/lib/read-json-body";
import { buildFailsafePromptPack } from "@/lib/ai-failsafe";
import { ensureValidAiResponse } from "@/lib/ai-guaranteed-response";
import { scheduleBackgroundRecovery } from "@/lib/ai-recovery-probe";
import { runGeneratePromptsCore, type GeneratedPromptRow, type ProjectBlueprint } from "@/lib/plan-orchestration";
import {
  getAiGenerationFirestore,
  hashAiInputs,
  setAiGenerationFirestore,
} from "@/lib/ai-generation-cache";
import { rateLimitAiRoute } from "@/lib/cache";
import { aiSuccessJson } from "@/lib/ai-response-envelope";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const b = parsed.body as Record<string, unknown>;
  const projectName = b.projectName;
  const projectIdea = b.projectIdea;
  const tools = b.tools;

  const name = (typeof projectName === "string" ? projectName : "My App").trim();
  const idea = (typeof projectIdea === "string" ? projectIdea : "").trim();
  const toolInput: string[] | string =
    Array.isArray(tools) && tools.length > 0
      ? (tools as string[])
      : typeof tools === "string" && tools.trim()
        ? tools
        : "Next.js, Supabase, Tailwind CSS, TypeScript";

  const projectId =
    typeof b.projectId === "string" && b.projectId.trim() ? b.projectId.trim() : undefined;
  const toolsKey = Array.isArray(toolInput)
    ? [...toolInput].map((t) => String(t).trim().toLowerCase()).sort().join(",")
    : String(toolInput).trim().toLowerCase();

  const limited = await rateLimitAiRoute(req, "generate-prompts");
  if (limited) return limited;

  const fb = buildFailsafePromptPack(name);
  const fallPayload = { prompts: fb.prompts, blueprint: fb.blueprint };

  try {
    const inputHash = await hashAiInputs("prompts", name, idea, toolsKey);
    if (projectId) {
      const cached = await getAiGenerationFirestore<{ prompts: GeneratedPromptRow[]; blueprint: ProjectBlueprint }>(
        projectId,
        "prompts",
        inputHash,
      );
      if (cached?.prompts?.length) {
        scheduleBackgroundRecovery(after, { name, idea, projectId });
        return aiSuccessJson(
          { prompts: cached.prompts, blueprint: cached.blueprint },
          "cache",
        );
      }
    }

    const { prompts, blueprint } = await runGeneratePromptsCore(name, idea, toolInput);
    const outP = ensureValidAiResponse<GeneratedPromptRow[]>(prompts, fb.prompts, (p) => Array.isArray(p) && p.length > 0);
    const outB = ensureValidAiResponse<ProjectBlueprint>(blueprint, fb.blueprint, (bl) => Array.isArray(bl?.pages) && bl.pages.length > 0);
    if (projectId) {
      await setAiGenerationFirestore(projectId, "prompts", inputHash, { prompts: outP, blueprint: outB });
    }
    const payload = { prompts: outP, blueprint: outB };
    scheduleBackgroundRecovery(after, { name, idea, projectId });
    return aiSuccessJson(payload, "ai");
  } catch (err) {
    console.error("[generate-prompts]", err);
    const inputHash = await hashAiInputs("prompts", name, idea, toolsKey);
    if (projectId) {
      await setAiGenerationFirestore(projectId, "prompts", inputHash, { prompts: fallPayload.prompts, blueprint: fallPayload.blueprint }).catch(
        () => {},
      );
    }
    scheduleBackgroundRecovery(after, { name, idea, projectId });
    return aiSuccessJson(fallPayload, "fallback");
  }
}
