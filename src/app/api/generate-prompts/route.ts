import { NextRequest, NextResponse } from "next/server";
import { getNimClient, NIM_KEY_ERROR } from "@/lib/nim-client";
import { orchestrateChatCompletion } from "@/lib/ai-orchestrator";
import { readJsonBody } from "@/lib/read-json-body";
import { MAX_TOKENS_GENERATE_PROMPTS } from "@/lib/ai-limits";
import { httpStatusForAiFailure, messageForAiRouteFailure } from "@/lib/map-ai-route-error";

/** One model call (was two) — avoids chained timeouts. */
export const maxDuration = 300;

interface ProjectBlueprint {
  pages: string[];
  features: string[];
  userRoles: string[];
  dataModels: string[];
  primaryAction: string;
  brandTone: string;
  colorHint: string;
}

const DEFAULT_BLUEPRINT: ProjectBlueprint = {
  pages: ["Landing Page", "Dashboard", "Profile", "Settings"],
  features: ["User authentication", "Core functionality", "Settings management"],
  userRoles: ["User", "Admin"],
  dataModels: ["User", "Profile", "Settings"],
  primaryAction: "Get started",
  brandTone: "professional",
  colorHint: "indigo",
};

const COMBINED_SYSTEM = `You are a senior product manager and full-stack developer.

Return ONLY valid JSON — no markdown, no text outside the JSON — ONE object with exactly two keys: "blueprint" and "prompts".

Shape:
{
  "blueprint": {
    "pages": ["page names this website needs"],
    "features": ["specific features"],
    "userRoles": ["user types"],
    "dataModels": ["main entities"],
    "primaryAction": "most important user action",
    "brandTone": "one adjective",
    "colorHint": "one word colour direction"
  },
  "prompts": [
    {
      "phase": "string",
      "title": "string",
      "icon": "emoji or short string",
      "color": "indigo" | "blue" | "emerald" | "yellow" | "pink" | "orange",
      "target": "Cursor" | "Cursor / AI assistant" | "AI assistant" | "Cursor / Supabase" | "Vercel / GitHub Actions",
      "desc": "short description",
      "prompt": "build brief: 120-200 words each — dense and actionable, not verbose"
    }
  ]
}

RULES:
1. blueprint: infer only from the project text; do not invent unrelated pages.
2. prompts: EXACTLY 6 objects. Assign "color" in order: indigo, blue, emerald, yellow, pink, orange.
3. The 6 prompts must cover, in order:
   (1) Foundation & Design System
   (2) Landing Page & Public Pages
   (3) Authentication & User Onboarding
   (4) Core Feature Pages (unique to this product)
   (5) Dashboard & User Account
   (6) Backend, API & Deployment
4. Each "prompt" field: bullet-style clarity, named components, stack hints — prioritize signal over length.
5. USE THE PROJECT NAME in every prompt body.`;

function extractJsonObject(raw: string): string {
  const cleaned = raw.replace(/^```[\w]*\n?/gm, "").replace(/\n?```$/gm, "").trim();
  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error("No JSON object found in model response");
  }
  return cleaned.slice(jsonStart, jsonEnd + 1);
}

function normalizeBlueprint(p: Partial<ProjectBlueprint> | undefined): ProjectBlueprint {
  if (!p || typeof p !== "object") return { ...DEFAULT_BLUEPRINT };
  return {
    pages: Array.isArray(p.pages) ? p.pages : DEFAULT_BLUEPRINT.pages,
    features: Array.isArray(p.features) ? p.features : DEFAULT_BLUEPRINT.features,
    userRoles: Array.isArray(p.userRoles) ? p.userRoles : DEFAULT_BLUEPRINT.userRoles,
    dataModels: Array.isArray(p.dataModels) ? p.dataModels : DEFAULT_BLUEPRINT.dataModels,
    primaryAction: typeof p.primaryAction === "string" ? p.primaryAction : DEFAULT_BLUEPRINT.primaryAction,
    brandTone: typeof p.brandTone === "string" ? p.brandTone : DEFAULT_BLUEPRINT.brandTone,
    colorHint: typeof p.colorHint === "string" ? p.colorHint : DEFAULT_BLUEPRINT.colorHint,
  };
}

export async function POST(req: NextRequest) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  if (!getNimClient()) {
    return NextResponse.json({ error: NIM_KEY_ERROR }, { status: 503 });
  }

  const b = parsed.body as Record<string, unknown>;
  const projectName = b.projectName;
  const projectIdea = b.projectIdea;
  const tools = b.tools;

  const name = (typeof projectName === "string" ? projectName : "My App").trim();
  const idea = (typeof projectIdea === "string" ? projectIdea : "").trim();
  const toolStack = Array.isArray(tools)
    ? (tools as string[]).join(", ")
    : (typeof tools === "string" ? tools : "") || "Next.js, Supabase, Tailwind CSS, TypeScript";

  const userMsg = `Project name: "${name}"
Description: ${idea || `A web application called ${name}`}
Tech stack context: ${toolStack}

Return ONE JSON object with "blueprint" and "prompts" (6 items) as specified.`;

  try {
    const raw = (
      await orchestrateChatCompletion(
        "prompt_generation",
        {
          messages: [
            { role: "system", content: COMBINED_SYSTEM },
            { role: "user", content: userMsg },
          ],
          temperature: 0.4,
          max_tokens: MAX_TOKENS_GENERATE_PROMPTS,
        },
        { minContentLength: 200 },
      )
    ).trim();
    let root: { blueprint?: Partial<ProjectBlueprint>; prompts?: unknown[] };
    try {
      root = JSON.parse(extractJsonObject(raw)) as typeof root;
    } catch {
      return NextResponse.json({ error: "AI returned unexpected format. Please try again." }, { status: 503 });
    }

    const blueprint = normalizeBlueprint(root.blueprint);
    const promptsRaw = root.prompts;
    if (!Array.isArray(promptsRaw) || promptsRaw.length === 0) {
      return NextResponse.json({ error: "AI returned an empty response. Please try again." }, { status: 503 });
    }

    const COLORS = ["indigo", "blue", "emerald", "yellow", "pink", "orange"];
    const validated = (promptsRaw as Record<string, unknown>[]).slice(0, 6).map((p, i) => ({
      phase: String(p.phase ?? `Step ${i + 1}`),
      title: String(p.title ?? ""),
      icon: String(p.icon ?? "⚡"),
      color: COLORS[i],
      target: String(p.target ?? "Cursor / AI assistant"),
      desc: String(p.desc ?? ""),
      prompt: String(p.prompt ?? ""),
    }));

    return NextResponse.json({ prompts: validated, blueprint });
  } catch (err) {
    console.error("[generate-prompts]", err);
    return NextResponse.json(
      { error: messageForAiRouteFailure(err) },
      { status: httpStatusForAiFailure(err) },
    );
  }
}
