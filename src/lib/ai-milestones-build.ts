import { getNimClient } from "@/lib/nim-client";
import { orchestrateChatCompletion } from "@/lib/ai-orchestrator";
import {
  getAiGenerationFirestore,
  getRedisAiCache,
  setAiGenerationFirestore,
  setRedisAiCache,
} from "@/lib/ai-generation-cache";
import { MAX_TOKENS_STRUCTURED_JSON_RETRY, MAX_TOKENS_STRUCTURED_JSON_ROUTE } from "@/lib/ai-limits";
import { tryParseJsonObject } from "@/lib/ai-json-helpers";
import { buildFailsafeMilestonesPayload } from "@/lib/ai-milestone-failsafe";
import { shouldSkipLlmCalls } from "@/lib/ai-global-mode";
import type { AiResponseSource } from "@/lib/ai-response-envelope";

const SYSTEM = `You are a senior engineering project manager. Given a project name and description, generate a structured development plan broken into milestones and tasks.

Return ONLY valid JSON — no markdown, no explanation.

Format:
{
  "milestones": [
    {
      "id": "m1",
      "phase": "Phase 1",
      "title": "Foundation & Setup",
      "description": "2-sentence description",
      "estimatedDays": 7,
      "color": "blue",
      "tasks": [
        {
          "id": "t1",
          "title": "Short task title",
          "description": "What the developer needs to build",
          "type": "frontend" | "backend" | "database" | "auth" | "devops" | "testing",
          "estimatedHours": 4,
          "priority": "high" | "medium" | "low",
          "aiPrompt": "A detailed 200-300 word developer prompt starting with 'You are building [task] for [project]...' that describes exactly what to implement, which files to create, and what the output should be."
        }
      ]
    }
  ]
}

Rules:
- Generate exactly 4 milestones
- Each milestone has 3-4 tasks
- Tasks must be specific to the project name and description
- aiPrompt must be actionable and reference the project name
- Colors: m1=blue, m2=purple, m3=emerald, m4=orange
- Total tasks: 12-16`;

function isValidMilestonesPayload(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const m = (data as { milestones?: unknown }).milestones;
  if (!Array.isArray(m) || m.length < 1) return false;
  return true;
}

/**
 * Build (and cache) milestones payload: Firestore, Redis, or LLM. Shared by the API route and recovery warm-up.
 */
export async function buildMilestonesPayloadCore(args: {
  name: string;
  idea: string;
  projectId?: string;
  inputHash: string;
}): Promise<{ payload: Record<string, unknown>; source: AiResponseSource }> {
  const { name, idea, projectId, inputHash } = args;

  if (projectId) {
    const fsHit = await getAiGenerationFirestore<Record<string, unknown>>(projectId, "milestones", inputHash);
    if (fsHit && Array.isArray((fsHit as { milestones?: unknown }).milestones)) {
      const m = (fsHit as { milestones: unknown[] }).milestones;
      if (m.length > 0) return { payload: fsHit, source: "cache" };
    }
  }
  const redisHit = await getRedisAiCache<Record<string, unknown>>("milestones", [name, idea]);
  if (redisHit && Array.isArray((redisHit as { milestones?: unknown }).milestones)) {
    const m = (redisHit as { milestones: unknown[] }).milestones;
    if (m.length > 0) {
      if (projectId) await setAiGenerationFirestore(projectId, "milestones", inputHash, redisHit);
      return { payload: redisHit, source: "cache" };
    }
  }

  if (shouldSkipLlmCalls() || !getNimClient()) {
    const fb = buildFailsafeMilestonesPayload(name, idea) as unknown as Record<string, unknown>;
    await setRedisAiCache("milestones", [name, idea], fb);
    if (projectId) await setAiGenerationFirestore(projectId, "milestones", inputHash, fb);
    return { payload: fb, source: "fallback" };
  }

  const userLine = `Project: "${name}"\nDescription: ${idea || `A modern web application called ${name}`}\n\nGenerate the full development milestone plan. Return only JSON.`;

  let raw = "";
  try {
    raw = await orchestrateChatCompletion(
      "structured_json",
      {
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userLine },
        ],
        temperature: 0.4,
        max_tokens: MAX_TOKENS_STRUCTURED_JSON_ROUTE,
      },
      { minContentLength: 40 },
    );
  } catch {
    raw = "";
  }

  let data = tryParseJsonObject(raw);
  if (!isValidMilestonesPayload(data)) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const raw2 = await orchestrateChatCompletion(
        "structured_json",
        {
          messages: [
            { role: "system", content: `${SYSTEM}\n\nBe compact: short strings, no commentary outside JSON.` },
            {
              role: "user",
              content: `${userLine}\n\nIf the prior attempt was too long, respond with a smaller valid JSON object only (4 milestones, 3 tasks each, shorter aiPrompt fields).`,
            },
          ],
          temperature: 0.2,
          max_tokens: MAX_TOKENS_STRUCTURED_JSON_RETRY,
        },
        { minContentLength: 20 },
      );
      const try2 = tryParseJsonObject(raw2);
      if (isValidMilestonesPayload(try2)) data = try2;
    } catch {
      /* use failsafe below */
    }
  }

  let source: AiResponseSource = "ai";
  if (!isValidMilestonesPayload(data)) {
    data = buildFailsafeMilestonesPayload(name, idea) as unknown as Record<string, unknown>;
    source = "fallback";
  }

  const payload = data as Record<string, unknown>;
  await setRedisAiCache("milestones", [name, idea], payload);
  if (projectId) {
    await setAiGenerationFirestore(projectId, "milestones", inputHash, payload);
  }
  return { payload, source };
}

export { isValidMilestonesPayload };
