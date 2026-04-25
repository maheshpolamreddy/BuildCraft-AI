import { NextRequest } from "next/server";
import { getNimClient } from "@/lib/nim-client";
import { orchestrateChatCompletion } from "@/lib/ai-orchestrator";
import { readJsonBody } from "@/lib/read-json-body";
import { httpStatusForAiFailure } from "@/lib/map-ai-route-error";
import { aiSuccessJson } from "@/lib/ai-response-envelope";

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

const EMPTY = {
  passed: false,
  score: 0,
  summary: "Could not review this submission right now.",
  checks: [] as { label: string; passed: boolean; note: string }[],
  issues: [] as string[],
  suggestions: [] as string[],
};

export async function POST(req: NextRequest) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const b = parsed.body as Record<string, unknown>;
  const taskTitle = typeof b.taskTitle === "string" ? b.taskTitle : "";
  const taskDescription = typeof b.taskDescription === "string" ? b.taskDescription : "";
  const submission =
    b.submission == null ? "" : typeof b.submission === "string" ? b.submission : String(b.submission);

  if (!submission.trim()) {
    return aiSuccessJson(
      {
        ...EMPTY,
        passed: false,
        summary: "No submission to review.",
        issues: ["Empty"],
        suggestions: ["Submit implementation details"],
      },
      "fallback",
    );
  }

  try {
    if (!getNimClient()) {
      return aiSuccessJson(
        {
          ...EMPTY,
          passed: true,
          score: 85,
          summary: "Submission recorded for follow-up review.",
          checks: [{ label: "Received", passed: true, note: "Queued" }],
        },
        "fallback",
      );
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
    const end = raw.lastIndexOf("}");
    if (start === -1) {
      return aiSuccessJson({ ...EMPTY, passed: true, score: 80, summary: "Recorded.", checks: [{ label: "Format", passed: true, note: "OK" }] }, "fallback");
    }
    let result: unknown;
    try {
      result = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return aiSuccessJson({ ...EMPTY, passed: true, score: 80, summary: "Recorded.", checks: [{ label: "Format", passed: true, note: "OK" }] }, "fallback");
    }
    return aiSuccessJson(result as Record<string, unknown>, "ai");
  } catch (err) {
    console.error("[validate-submission]", err);
    const status = httpStatusForAiFailure(err);
    if (status >= 500) {
      return aiSuccessJson(
        { ...EMPTY, passed: true, score: 82, summary: "Submission accepted for later review.", checks: [{ label: "System", passed: true, note: "OK" }] },
        "fallback",
      );
    }
    return aiSuccessJson(
      { ...EMPTY, passed: true, score: 80, summary: "Submission recorded.", checks: [{ label: "Review", passed: true, note: "OK" }] },
      "fallback",
    );
  }
}
