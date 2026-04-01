import { NextRequest, NextResponse } from "next/server";
import { getNimClient, NIM_KEY_ERROR } from "@/lib/nim-client";
import { orchestrateChatCompletion } from "@/lib/ai-orchestrator";
import { readJsonBody } from "@/lib/read-json-body";
import { MAX_TOKENS_GENERATE_CODE } from "@/lib/ai-limits";
import { httpStatusForAiFailure, messageForAiRouteFailure } from "@/lib/map-ai-route-error";

export const maxDuration = 180;

const SYSTEM_PROMPT = `You are an elite React/Next.js UI engineer and UX designer.

Generate one focused, production-ready React component using:
- React 18+ with TypeScript
- Tailwind CSS v3 for all styling (no separate CSS files)
- Lucide React icons (import from "lucide-react")
- Framer Motion for animations where appropriate (import from "framer-motion")
- Dark background design (#0a0a0a / black base) with glass-morphism panels
- Clean, modern, enterprise-grade aesthetics

STRICT RULES:
1. Return ONLY the full TypeScript component code — no markdown fences, no explanation
2. The file must be a self-contained .tsx component
3. Start with "use client"; directive
4. Include all necessary imports at the top
5. Export a single default function component
6. Use realistic placeholder data (not "Lorem ipsum")
7. Make it fully responsive (mobile-first)
8. The design should feel premium and polished
9. Keep the file lean: avoid duplicate sections, huge mock datasets, or extra demo routes — one screen, ~120–220 lines typical unless the template truly needs more
10. Do NOT include any text outside the component code`;

export interface GenerateCodeRequest {
  projectIdea: string;
  projectName: string;
  componentType: string;
  componentDesc: string;
}

export async function POST(req: NextRequest) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  try {
    const { projectIdea, projectName, componentType, componentDesc } =
      parsed.body as GenerateCodeRequest;

    if (!componentType || !projectIdea) {
      return NextResponse.json(
        { error: "Missing componentType or projectIdea" },
        { status: 400 }
      );
    }

    if (!getNimClient()) {
      return NextResponse.json({ error: NIM_KEY_ERROR }, { status: 503 });
    }

    const userPrompt = `Generate a ${componentType} component for a "${projectName}" application.

Project context: ${projectIdea}

Component requirements: ${componentDesc}

Use realistic data specific to this project type. Make the UI premium, clean, and production-ready.
Return ONLY the complete .tsx component code — no explanations, no markdown.`;

    const raw = await orchestrateChatCompletion(
      "code_generation",
      {
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.35,
        max_tokens: MAX_TOKENS_GENERATE_CODE,
        top_p: 0.92,
      },
      { minContentLength: 50 },
    );

    // Strip markdown fences if the model added them anyway
    const cleaned = raw
      .replace(/^```(?:tsx?|jsx?|typescript|javascript)?\n?/i, "")
      .replace(/\n?```$/i, "")
      .trim();

    if (!cleaned || cleaned.length < 50) {
      return NextResponse.json(
        { error: "AI returned empty code. Please try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({ code: cleaned });
  } catch (err) {
    console.error("[generate-code] AI service error:", err);
    return NextResponse.json(
      { error: messageForAiRouteFailure(err) },
      { status: httpStatusForAiFailure(err) },
    );
  }
}
