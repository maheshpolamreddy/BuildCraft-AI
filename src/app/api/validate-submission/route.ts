import { NextRequest, NextResponse } from "next/server";
import { getNimClient, NIM_KEY_ERROR } from "@/lib/nim-client";
import { orchestrateChatCompletion } from "@/lib/ai-orchestrator";
import { readJsonBody } from "@/lib/read-json-body";
import { messageForAiRouteFailure } from "@/lib/map-ai-route-error";

export const maxDuration = 180;

const SYSTEM = `You are a strict senior code reviewer and QA engineer. A developer has submitted work for a task. Validate it for correctness, completeness, security, and quality.

Return ONLY valid JSON — no markdown, no explanation:
{
  "passed": true | false,
  "score": 0-100,
  "summary": "1-2 sentence overall assessment",
  "checks": [
    { "label": "Check name", "passed": true | false, "note": "Brief explanation" }
  ],
  "issues": ["issue 1", "issue 2"],
  "suggestions": ["suggestion 1", "suggestion 2"]
}

Be strict but fair. Score 80+ to pass. Check for: completeness, correctness, security issues, best practices, TypeScript types, error handling.`;

export async function POST(req: NextRequest) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const b = parsed.body as Record<string, unknown>;
  const taskTitle = typeof b.taskTitle === "string" ? b.taskTitle : "";
  const taskDescription = typeof b.taskDescription === "string" ? b.taskDescription : "";
  const submission =
    b.submission == null ? "" : typeof b.submission === "string" ? b.submission : String(b.submission);

  if (!submission.trim()) {
    return NextResponse.json({
      passed: false, score: 0,
      summary: "No submission provided.",
      checks: [], issues: ["Empty submission"], suggestions: ["Submit your code or implementation"],
    });
  }

  try {
    if (!getNimClient()) {
      return NextResponse.json({ error: NIM_KEY_ERROR }, { status: 503 });
    }

    let raw = await orchestrateChatCompletion("validation", {
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Task: "${taskTitle}"\nRequirements: ${taskDescription}\n\nSubmission:\n${submission.slice(0, 3000)}\n\nValidate this submission. Return only JSON.`,
        },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    });
    raw = raw.replace(/^```[\w]*\n?/gm, "").replace(/\n?```$/gm, "").trim();
    const start = raw.indexOf("{");
    const end   = raw.lastIndexOf("}");
    if (start === -1) throw new Error("No JSON found");
    let result: unknown;
    try {
      result = JSON.parse(raw.slice(start, end + 1));
    } catch {
      throw new Error("Model returned invalid JSON");
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: messageForAiRouteFailure(err) }, { status: 500 });
  }
}
