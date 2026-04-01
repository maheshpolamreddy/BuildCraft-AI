import { NextRequest, NextResponse } from "next/server";
import { getNimClient, NIM_KEY_ERROR } from "@/lib/nim-client";
import { readJsonBody } from "@/lib/read-json-body";
import {
  MAX_TOKENS_ANALYZE_PHASE1,
  MAX_TOKENS_ANALYZE_PHASE2,
  MAX_PROJECT_DESCRIPTION_CHARS,
} from "@/lib/ai-limits";
import { orchestrateChatCompletion } from "@/lib/ai-orchestrator";
import { httpStatusForAiFailure, messageForAiRouteFailure } from "@/lib/map-ai-route-error";

/**
 * Two phases: smaller outputs per request finish faster and fail less often than one huge JSON.
 * Retries each phase once on timeout-style errors.
 */
export const maxDuration = 300;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ArchLayer {
  icon: "frontend" | "backend" | "database" | "ai" | "auth" | "storage" | "realtime" | "payment" | "email";
  color: "blue" | "purple" | "emerald" | "indigo" | "yellow" | "pink" | "orange" | "cyan";
  title: string;
  desc: string;
}

export interface AiTool {
  name: string;
  category: string;
  compliance?: string;
  complianceColor?: "green" | "blue" | "yellow" | "red";
  why: string;
  warning?: string;
  skillGap?: string;
  iconLabel: string;
}

export interface AiRisk {
  level: "High Risk" | "Medium Risk" | "Low Risk";
  color: "red" | "yellow" | "orange" | "white";
  title: string;
  body: string;
  fix: string;
}

export interface ProjectAnalysis {
  overview: {
    summary: string;
    architecture: ArchLayer[];
  };
  tools: AiTool[];
  risks: AiRisk[];
}

const SYSTEM_PHASE1 = `You are a senior software architect. Return ONLY valid JSON — no markdown, no backticks.

Produce ONLY the "overview" section. Be specific to THIS project; concise but not generic.

JSON shape:
{
  "overview": {
    "summary": "3-4 sentences: what the product is, primary users, core workflows, main technical challenge. Name the project.",
    "architecture": [
      {
        "icon": "frontend" | "backend" | "database" | "ai" | "auth" | "storage" | "realtime" | "payment" | "email",
        "color": "blue" | "purple" | "emerald" | "indigo" | "yellow" | "pink" | "orange" | "cyan",
        "title": "Layer title for THIS project",
        "desc": "2 sentences: responsibilities, named technologies, how this layer connects to others."
      }
    ]
  }
}

RULES:
- architecture: exactly 4 or 5 layers, tailored to the domain.
- Each "desc" names real technologies or patterns.
- If the product uses AI/LLM features, include one layer that describes a centralized orchestration layer (routing across models, validation, fallbacks, secure keys) — not generic "AI" fluff; tie it to how THIS app uses models.
- Do not invent company facts beyond the description.`;

const SYSTEM_PHASE2 = `You are a senior software architect. Phase 1 already defined the architecture overview — stay consistent with it.

Return ONLY valid JSON — no markdown, no backticks.

JSON shape:
{
  "tools": [
    {
      "name": "Concrete tool or stack",
      "category": "Short label",
      "compliance": "Optional: SOC 2, GDPR, HIPAA, PCI if relevant",
      "complianceColor": "green" | "blue" | "yellow" | "red" only if compliance is set",
      "why": "2-3 sentences: why it fits THIS project and ties to the architecture",
      "warning": "Optional short constraint",
      "skillGap": "Optional short line",
      "iconLabel": "2 letters or short emoji"
    }
  ],
  "risks": [
    {
      "level": "High Risk" | "Medium Risk" | "Low Risk",
      "color": "red" | "yellow" | "orange" | "white",
      "title": "Specific risk",
      "body": "2 sentences, domain-specific",
      "fix": "1-2 sentences: mitigation"
    }
  ]
}

RULES:
- tools: exactly 6 entries, diverse categories; each "why" references project specifics and the architecture below.
- risks: exactly 4 — one High, one or two Medium, one Low.
- Align with the architecture you were given; no contradictions.`;

function extractJsonObject(raw: string): string {
  const cleaned = raw.replace(/^```[\w]*\n?/gm, "").replace(/\n?```$/gm, "").trim();
  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error("No JSON object found in model response");
  }
  return cleaned.slice(jsonStart, jsonEnd + 1);
}

function clipDescription(text: string): string {
  if (text.length <= MAX_PROJECT_DESCRIPTION_CHARS) return text;
  return `${text.slice(0, MAX_PROJECT_DESCRIPTION_CHARS)}\n\n[Note: description was truncated for processing.]`;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const b = parsed.body as Record<string, unknown>;
  const name = (typeof b.projectName === "string" ? b.projectName : "My App").trim();
  const idea = (typeof b.projectIdea === "string" ? b.projectIdea : "").trim();
  const description = clipDescription(idea || `A modern web application called ${name}`);

  const userMsgPhase1 = `Project name: "${name}"
Description: ${description}

Produce the overview JSON only (summary + architecture layers).`;

  try {
    if (!getNimClient()) {
      return NextResponse.json({ error: NIM_KEY_ERROR }, { status: 503 });
    }

    const raw1 = await orchestrateChatCompletion(
      "architecture_deep",
      {
        messages: [
          { role: "system", content: SYSTEM_PHASE1 },
          { role: "user", content: userMsgPhase1 },
        ],
        temperature: 0.37,
        max_tokens: MAX_TOKENS_ANALYZE_PHASE1,
      },
      { minContentLength: 80 },
    );

    let phase1: { overview: ProjectAnalysis["overview"] };
    try {
      phase1 = JSON.parse(extractJsonObject(raw1)) as { overview: ProjectAnalysis["overview"] };
    } catch {
      throw new Error("Analysis step 1 returned invalid JSON. Please try again.");
    }
    if (!phase1.overview?.summary || !Array.isArray(phase1.overview.architecture)) {
      throw new Error("Analysis step 1 missing required fields. Please try again.");
    }

    const userMsgPhase2 = `Project name: "${name}"
Description: ${description}

Architecture from step 1 (do not contradict; extend with tools and risks):
${JSON.stringify(phase1.overview, null, 2)}

Produce ONLY the tools and risks JSON.`;

    const raw2 = await orchestrateChatCompletion(
      "architecture_deep",
      {
        messages: [
          { role: "system", content: SYSTEM_PHASE2 },
          { role: "user", content: userMsgPhase2 },
        ],
        temperature: 0.38,
        max_tokens: MAX_TOKENS_ANALYZE_PHASE2,
      },
      { minContentLength: 120 },
    );

    let phase2: { tools: AiTool[]; risks: AiRisk[] };
    try {
      phase2 = JSON.parse(extractJsonObject(raw2)) as { tools: AiTool[]; risks: AiRisk[] };
    } catch {
      throw new Error("Analysis step 2 returned invalid JSON. Please try again.");
    }

    const analysis: ProjectAnalysis = {
      overview: phase1.overview,
      tools: Array.isArray(phase2.tools) ? phase2.tools : [],
      risks: Array.isArray(phase2.risks) ? phase2.risks : [],
    };

    return NextResponse.json(analysis);
  } catch (err) {
    console.error("[analyze-project] error:", err);
    return NextResponse.json(
      { error: messageForAiRouteFailure(err) },
      { status: httpStatusForAiFailure(err) },
    );
  }
}
