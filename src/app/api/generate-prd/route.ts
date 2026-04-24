import { NextRequest, NextResponse } from "next/server";
import { getNimClient } from "@/lib/nim-client";
import { orchestrateChatCompletion } from "@/lib/ai-orchestrator";
import { readJsonBody } from "@/lib/read-json-body";
import { httpStatusForAiFailure, messageForAiRouteFailure } from "@/lib/map-ai-route-error";
import { savePRD, type PRDMilestone } from "@/lib/prd";
import { setPrdOnRequest } from "@/lib/hireRequests";
import { getAiGenerationFirestore, hashAiInputs, setAiGenerationFirestore } from "@/lib/ai-generation-cache";

export const maxDuration = 180;

type PrdApiResponse = {
  success: true;
  prdId: string;
  prd: {
    overview: string;
    scope: string;
    features: string[];
    techStack: string[];
    milestones: PRDMilestone[];
    risks: string[];
    id: string;
    version: string;
  };
};

export async function POST(req: NextRequest) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  try {
    const body = parsed.body as Record<string, unknown>;
    const {
      projectName, projectIdea, projectSummary, techStack,
      creatorUid, developerUid, hireToken: hireTokenRaw,
    } = body;

    const hireToken = String(hireTokenRaw ?? "");
    const savedProjectId = typeof body.savedProjectId === "string" ? body.savedProjectId.trim() : "";

    const stack = Array.isArray(techStack) ? (techStack as string[]) : [];
    const idea = String(projectIdea ?? "").trim();
    const summary = String(projectSummary ?? "").trim();
    const scopeId = savedProjectId || hireToken.trim() || String(creatorUid ?? "anon");
    const stackSig = [...stack].map((s) => String(s).trim().toLowerCase()).sort().join(",");
    const inputHash = await hashAiInputs(
      "prd",
      String(projectName ?? ""),
      idea,
      summary,
      stackSig,
      hireToken,
      String(creatorUid ?? ""),
    );

    const cached = await getAiGenerationFirestore<PrdApiResponse>(scopeId, "prd", inputHash);
    if (cached?.success && cached.prdId && cached.prd) {
      if (hireToken.trim()) {
        await setPrdOnRequest(hireToken, cached.prdId).catch(() => {});
      }
      return NextResponse.json(cached);
    }

    const projectBrief =
      [summary && `Summary (from creator):\n${summary}`, idea && `Project idea (from creator):\n${idea}`]
        .filter(Boolean)
        .join("\n\n---\n\n") || "(No additional description from creator.)";

    const prompt = `You are a senior software architect. Generate a detailed Project Requirement Document (PRD) for the following project.

Project Name: ${projectName}

GROUND TRUTH — what the project creator actually submitted (preserve this meaning in overview and scope; do not invent a different product):
${projectBrief}

Tech Stack Approved: ${stack.join(", ") || "To be determined"}

Return ONLY valid JSON with this exact structure:
{
  "overview": "2-3 sentence project overview",
  "scope": "Clear scope statement",
  "features": ["feature 1", "feature 2", "feature 3", "feature 4", "feature 5"],
  "techStack": ["tech1", "tech2", "tech3"],
  "milestones": [
    { "phase": "Phase 1", "title": "Foundation", "duration": "2 weeks", "deliverables": ["deliverable 1", "deliverable 2"] },
    { "phase": "Phase 2", "title": "Core Features", "duration": "4 weeks", "deliverables": ["deliverable 1", "deliverable 2"] },
    { "phase": "Phase 3", "title": "Testing & Deployment", "duration": "2 weeks", "deliverables": ["deliverable 1", "deliverable 2"] }
  ],
  "risks": ["risk 1", "risk 2", "risk 3"]
}`;

    let prdData: Record<string, unknown> | null = null;

    if (getNimClient()) {
      try {
        const raw = await orchestrateChatCompletion("structured_json", {
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          max_tokens: 1500,
        });
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            prdData = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
          } catch {
            prdData = null;
          }
        }
      } catch {
        prdData = null;
      }
    }

    // Fallback PRD if AI fails or key missing
    if (!prdData) {
      prdData = {
        overview:   `${projectName} is a modern application built to solve real user problems efficiently.`,
        scope:      `Build a full-stack application with user authentication, core business logic, and deployment infrastructure.`,
        features:   ["User authentication & authorization", "Core business logic implementation", "Real-time data updates", "Responsive UI across all devices", "Performance monitoring & logging"],
        techStack:  stack.length ? stack : ["Next.js", "TypeScript", "Tailwind CSS", "Firebase"],
        milestones: [
          { phase: "Phase 1", title: "Foundation & Setup",   duration: "2 weeks", deliverables: ["Project scaffolding", "Authentication flow", "Database schema"] },
          { phase: "Phase 2", title: "Core Features",        duration: "4 weeks", deliverables: ["Primary API routes", "Dashboard UI", "Data models"] },
          { phase: "Phase 3", title: "Testing & Deployment", duration: "2 weeks", deliverables: ["Test coverage", "CI/CD pipeline", "Production launch"] },
        ],
        risks: ["Scope creep — keep feature set focused", "Third-party API rate limits", "Browser compatibility across older devices"],
      };
    }

    const overview = String(prdData.overview ?? "");
    const scope = String(prdData.scope ?? "");
    const features = Array.isArray(prdData.features)
      ? prdData.features.map((x: unknown) => String(x))
      : [];
    const techStackOut = Array.isArray(prdData.techStack)
      ? (prdData.techStack as unknown[]).map(x => String(x))
      : stack;
    const milestones = Array.isArray(prdData.milestones) ? prdData.milestones : [];
    const risks = Array.isArray(prdData.risks) ? (prdData.risks as unknown[]).map(x => String(x)) : [];

    // Save to Firestore
    const prdId = await savePRD({
      id:           "",
      version:      "v1.0",
      projectName:   String(projectName ?? ""),
      creatorUid:    String(creatorUid ?? ""),
      developerUid:  String(developerUid ?? ""),
      hireToken,
      projectBrief,
      overview,
      scope,
      features,
      techStack:    techStackOut,
      milestones:   milestones as PRDMilestone[],
      risks,
    });

    // Link PRD id back to the hire request
    if (hireToken.trim()) {
      await setPrdOnRequest(hireToken, prdId);
    }

    const responseBody: PrdApiResponse = {
      success: true,
      prdId,
      prd: {
        overview,
        scope,
        features,
        techStack: techStackOut,
        milestones: milestones as PRDMilestone[],
        risks,
        id: prdId,
        version: "v1.0",
      },
    };
    await setAiGenerationFirestore(scopeId, "prd", inputHash, responseBody);
    return NextResponse.json(responseBody);
  } catch (err) {
    console.error("[generate-prd]", err);
    return NextResponse.json(
      { error: messageForAiRouteFailure(err) },
      { status: httpStatusForAiFailure(err) },
    );
  }
}
