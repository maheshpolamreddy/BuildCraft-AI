import { NextRequest, NextResponse } from "next/server";
import { readJsonBody } from "@/lib/read-json-body";
import { httpStatusForAiFailure, messageForAiRouteFailure } from "@/lib/map-ai-route-error";
import { rankProjectOpportunities } from "@/lib/ml-matching/project-opportunities";

export const maxDuration = 30;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MatchedProject {
  id: string;
  title: string;
  description: string;
  category: string;
  techStack: string[];
  budget: string;
  duration: string;
  postedBy: string;
  matchScore: number;
  matchReasons: string[];
  skillOverlap: string[];
  missingSkills: string[];
  urgency: "urgent" | "normal" | "flexible";
  remote: boolean;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const b = parsed.body as Record<string, unknown>;
  const skills = Array.isArray(b.skills) ? (b.skills as string[]) : [];
  const tools = Array.isArray(b.tools) ? (b.tools as string[]) : [];
  const preferredTypes = Array.isArray(b.preferredTypes) ? (b.preferredTypes as string[]) : [];
  const primaryRole = typeof b.primaryRole === "string" ? b.primaryRole : "fullstack";
  const yearsExp = Number.isFinite(Number(b.yearsExp)) ? Number(b.yearsExp) : 1;
  const currentProjectName = typeof b.currentProjectName === "string" ? b.currentProjectName : "";
  const currentProjectIdea = typeof b.currentProjectIdea === "string" ? b.currentProjectIdea : "";

  try {
    const ranked = rankProjectOpportunities({
      skills,
      tools,
      primaryRole,
      yearsExp,
      preferredTypes,
      currentProjectName,
      currentProjectIdea,
    });

    const projects: MatchedProject[] = ranked.map((row) => {
      const { keywords: _k, ...rest } = row;
      return rest;
    });

    return NextResponse.json({ projects });
  } catch (err) {
    console.error("[match-projects] error:", err);
    return NextResponse.json(
      { error: messageForAiRouteFailure(err) },
      { status: httpStatusForAiFailure(err) },
    );
  }
}
