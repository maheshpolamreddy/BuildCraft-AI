import { NextRequest, NextResponse } from "next/server";
import { getNimClient, NIM_KEY_ERROR } from "@/lib/nim-client";
import { orchestrateChatCompletion } from "@/lib/ai-orchestrator";
import { readJsonBody } from "@/lib/read-json-body";
import { messageForAiRouteFailure } from "@/lib/map-ai-route-error";
import {
  getAiGenerationFirestore,
  getRedisAiCache,
  hashAiInputs,
  setAiGenerationFirestore,
  setRedisAiCache,
} from "@/lib/ai-generation-cache";

export const maxDuration = 180;

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

export async function POST(req: NextRequest) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const b = parsed.body as Record<string, unknown>;
  const name = (typeof b.projectName === "string" ? b.projectName : "My App").trim();
  const idea = (typeof b.projectIdea === "string" ? b.projectIdea : "").trim();
  const projectId =
    typeof b.projectId === "string" && b.projectId.trim() ? b.projectId.trim() : undefined;

  try {
    if (!getNimClient()) {
      return NextResponse.json({ error: NIM_KEY_ERROR }, { status: 503 });
    }

    const inputHash = await hashAiInputs("milestones", name, idea);
    if (projectId) {
      const fsHit = await getAiGenerationFirestore<Record<string, unknown>>(projectId, "milestones", inputHash);
      if (fsHit && Array.isArray((fsHit as { milestones?: unknown }).milestones)) {
        const m = (fsHit as { milestones: unknown[] }).milestones;
        if (m.length > 0) return NextResponse.json(fsHit);
      }
    }
    const redisHit = await getRedisAiCache<Record<string, unknown>>("milestones", [name, idea]);
    if (redisHit && Array.isArray((redisHit as { milestones?: unknown }).milestones)) {
      const m = (redisHit as { milestones: unknown[] }).milestones;
      if (m.length > 0) {
        if (projectId) await setAiGenerationFirestore(projectId, "milestones", inputHash, redisHit);
        return NextResponse.json(redisHit);
      }
    }

    let raw = await orchestrateChatCompletion(
      "structured_json",
      {
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `Project: "${name}"\nDescription: ${idea || `A modern web application called ${name}`}\n\nGenerate the full development milestone plan. Return only JSON.`,
          },
        ],
        temperature: 0.4,
        max_tokens: 4096,
      },
      { minContentLength: 80 },
    );
    raw = raw.replace(/^```[\w]*\n?/gm, "").replace(/\n?```$/gm, "").trim();
    const start = raw.indexOf("{");
    const end   = raw.lastIndexOf("}");
    if (start === -1) throw new Error("No JSON found");
    let data: unknown;
    try {
      data = JSON.parse(raw.slice(start, end + 1));
    } catch {
      throw new Error("Model returned invalid JSON");
    }
    const payload = data as Record<string, unknown>;
    await setRedisAiCache("milestones", [name, idea], payload);
    if (projectId) {
      await setAiGenerationFirestore(projectId, "milestones", inputHash, payload);
    }
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json({ error: messageForAiRouteFailure(err) }, { status: 500 });
  }
}
