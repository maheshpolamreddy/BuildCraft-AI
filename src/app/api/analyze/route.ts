import { NextRequest, NextResponse } from "next/server";
import { getNimClient, NIM_KEY_ERROR } from "@/lib/nim-client";
import { orchestrateChatCompletion } from "@/lib/ai-orchestrator";
import { readJsonBody } from "@/lib/read-json-body";
import { httpStatusForAiFailure, messageForAiRouteFailure } from "@/lib/map-ai-route-error";
import { resolveProjectDisplayName } from "@/lib/projectName";

/** Seconds — Vercel/serverless limit; prevents 504 on slow LLM responses. */
export const maxDuration = 180;

const SYSTEM_PROMPT = `You are an expert AI project analyst for BuildCraft, an enterprise platform that helps turn software ideas into detailed technical plans.

Your job is to analyze a project idea and extract structured technical requirements, realistic assumptions, a confidence score, and uncertainty flags.

RESPONSE FORMAT: Respond with ONLY valid JSON — no markdown fences, no explanation text, just raw JSON.

JSON structure to return:
{
  "name": "Short project name (2-4 words, e.g. 'Finance Platform', 'Social Network App')",
  "confidence": <integer 40-95>,
  "requirements": [
    { "id": "r1", "title": "Short title", "description": "Precise technical description in 1-2 sentences", "type": "feature" },
    { "id": "r2", "title": "Short title", "description": "Precise technical description", "type": "security" },
    { "id": "r3", "title": "Short title", "description": "Precise technical description", "type": "performance" },
    { "id": "r4", "title": "Short title", "description": "Precise technical description", "type": "compliance" }
  ],
  "assumptions": [
    { "id": "a1", "text": "We assume...", "accepted": false },
    { "id": "a2", "text": "We assume...", "accepted": false },
    { "id": "a3", "text": "We assume...", "accepted": false }
  ],
  "uncertainties": [
    "Specific uncertain aspect #1",
    "Specific uncertain aspect #2"
  ]
}

Rules:
- "name" must always be a non-empty 2–6 word title. If the input is a spec or document, infer a title from its content (or say what the product/initiative is); never return an empty string for "name".
- Generate exactly 4 requirements: one per type (feature, security, performance, compliance)
- Generate exactly 3 assumptions starting with "We assume..."
- Generate exactly 2 uncertainty strings describing what is ambiguous
- "type" must be exactly one of: "feature", "security", "performance", "compliance"
- confidence scoring: 40-55 = vague/few words, 56-70 = some detail, 71-85 = good detail, 86-95 = very detailed idea
- Be specific, technical, and accurate — reference real technologies where appropriate
- Do NOT output anything except the JSON object`;

export interface AnalyzeResponse {
  name: string;
  confidence: number;
  requirements: {
    id: string;
    title: string;
    description: string;
    type: "feature" | "security" | "performance" | "compliance";
  }[];
  assumptions: {
    id: string;
    text: string;
    accepted: boolean;
  }[];
  uncertainties: string[];
  version: string;
  locked: boolean;
  idea: string;
}

const MAX_IDEA_CHARS = 100_000;

export async function POST(req: NextRequest) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  try {
    const body = parsed.body as Record<string, unknown>;
    const idea = body.idea;
    const fileNameRaw = body.fileName;
    const fileName =
      typeof fileNameRaw === "string" && fileNameRaw.trim().length > 0
        ? fileNameRaw.trim().slice(0, 240)
        : undefined;

    if (!idea || typeof idea !== "string" || idea.trim().length < 5) {
      return NextResponse.json({ error: "Please provide a project idea (at least 5 characters)." }, { status: 400 });
    }

    const trimmed = idea.trim();
    if (trimmed.length > MAX_IDEA_CHARS) {
      return NextResponse.json(
        { error: `Project description is too long (max ${MAX_IDEA_CHARS.toLocaleString()} characters).` },
        { status: 400 },
      );
    }

    if (!getNimClient()) {
      return NextResponse.json({ error: NIM_KEY_ERROR }, { status: 503 });
    }

    const userContent = fileName
      ? `Analyze the following project context. It was uploaded from a file named "${fileName}". Extract requirements that match this document.\n\n---\n${trimmed}\n---`
      : `Analyze this project idea and return only JSON.\n\n---\n${trimmed}\n---`;

    const raw = await orchestrateChatCompletion("structured_json", {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      temperature: 0.4,
      max_tokens: 1200,
      top_p: 0.9,
    });

    // Extract JSON even if the model wraps it in markdown fences
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[analyze] AI response did not contain JSON:", raw);
      return NextResponse.json({ error: "AI returned an unexpected format. Please try again." }, { status: 502 });
    }

    let aiParsed: Record<string, unknown>;
    try {
      aiParsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "AI returned invalid JSON. Please try again." }, { status: 502 });
    }

    // Validate and enforce required fields
    const result: AnalyzeResponse = {
      idea: trimmed,
      name: resolveProjectDisplayName(aiParsed.name, fileName),
      confidence: Math.min(95, Math.max(40, Number(aiParsed.confidence ?? 60))),
      requirements: Array.isArray(aiParsed.requirements) ? aiParsed.requirements.slice(0, 6) : [],
      assumptions: Array.isArray(aiParsed.assumptions)
        ? aiParsed.assumptions.map((a: { id?: string; text?: string }) => ({
            id: String(a?.id ?? ""),
            text: String(a?.text ?? ""),
            accepted: false,
          }))
        : [],
      uncertainties: Array.isArray(aiParsed.uncertainties) ? aiParsed.uncertainties.slice(0, 3) : [],
      version: "v1.0",
      locked: false,
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error("[analyze] AI service error:", err);
    return NextResponse.json(
      { error: messageForAiRouteFailure(err) },
      { status: httpStatusForAiFailure(err) },
    );
  }
}
