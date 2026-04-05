import { NextRequest, NextResponse } from "next/server";
import { readJsonBody } from "@/lib/read-json-body";
import { runGeneratePromptsCore } from "@/lib/plan-orchestration";
import { httpStatusForAiFailure, messageForAiRouteFailure } from "@/lib/map-ai-route-error";

/** One model call (was two) — avoids chained timeouts. */
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

  try {
    const { prompts, blueprint } = await runGeneratePromptsCore(name, idea, toolInput);
    return NextResponse.json({ prompts, blueprint });
  } catch (err) {
    console.error("[generate-prompts]", err);
    return NextResponse.json(
      { error: messageForAiRouteFailure(err) },
      { status: httpStatusForAiFailure(err) },
    );
  }
}
