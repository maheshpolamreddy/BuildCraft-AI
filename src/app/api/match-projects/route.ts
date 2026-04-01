import { NextRequest, NextResponse } from "next/server";
import { getNimClient, NIM_KEY_ERROR } from "@/lib/nim-client";
import { orchestrateChatCompletion } from "@/lib/ai-orchestrator";
import { readJsonBody } from "@/lib/read-json-body";
import { messageForAiRouteFailure } from "@/lib/map-ai-route-error";

export const maxDuration = 180;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MatchedProject {
  id:           string;
  title:        string;
  description:  string;
  category:     string;
  techStack:    string[];
  budget:       string;
  duration:     string;
  postedBy:     string;
  matchScore:   number;          // 0–100
  matchReasons: string[];        // 2-3 specific reasons why this dev fits
  skillOverlap: string[];        // skills from dev that match this project
  missingSkills: string[];       // skills dev is missing (keep count low)
  urgency:      "urgent" | "normal" | "flexible";
  remote:       boolean;
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM = `You are a highly intelligent developer-to-project matching engine for BuildCraft AI.

Given a developer's profile (skills, role, experience, preferred project types), generate a list of EXACTLY 5 real, diverse, non-duplicate project opportunities that are a strong fit for this developer.

Return ONLY a single valid JSON object — no markdown, no explanation, no code fences.

Rules:
- Each project must be UNIQUE — different industry, different tech emphasis, different scale
- Deduplicate: no two projects should need the same core tech stack
- Match score must be computed honestly: (skill_overlap / required_skills) × 40 + experience_bonus × 20 + role_alignment × 25 + portfolio_bonus × 15
- matchReasons must be specific — name the developer's ACTUAL skills that make them a fit
- skillOverlap must list the developer's skills that directly match project needs
- missingSkills must be honest but minimal — only list real gaps, max 2 per project
- Projects must reflect real-world demand in 2025: SaaS, AI tools, FinTech, DevOps platforms, etc.
- urgency: "urgent" if project timeline < 2 months, "flexible" if > 4 months, else "normal"

Return this exact structure:
{
  "projects": [
    {
      "id": "p1",
      "title": "Specific project title",
      "description": "2-sentence description of what needs to be built and for whom",
      "category": "SaaS | FinTech | HealthTech | EdTech | AI Tool | E-Commerce | DevOps | Social | Data",
      "techStack": ["Tech1", "Tech2", "Tech3", "Tech4"],
      "budget": "$X,000–$Y,000",
      "duration": "X weeks",
      "postedBy": "Company or Startup name",
      "matchScore": 0–100,
      "matchReasons": ["Specific reason 1 using dev's actual skill", "Specific reason 2", "Specific reason 3"],
      "skillOverlap": ["Skill1", "Skill2"],
      "missingSkills": ["MissingSkill1"],
      "urgency": "urgent|normal|flexible",
      "remote": true|false
    }
  ]
}`;

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

  const userMsg = `Generate 5 unique, deduplicated project opportunities for this developer:

Developer Profile:
- Primary Role: ${primaryRole}
- Years of Experience: ${yearsExp}
- Verified Skills: ${skills.slice(0, 20).join(", ") || "JavaScript, React"}
- Tools: ${tools.slice(0, 10).join(", ") || "VS Code, GitHub"}
- Preferred Project Types: ${preferredTypes.join(", ") || "SaaS, Web Apps"}
- Currently Working On: ${currentProjectName ? `"${currentProjectName}" — ${currentProjectIdea}` : "Not specified"}

IMPORTANT:
- Exclude any project too similar to "${currentProjectName}" — that is already assigned
- Make each project distinct in domain (FinTech ≠ HealthTech ≠ EdTech, etc.)
- Compute matchScore honestly based on actual skill overlap
- List exactly the developer's skills that match each project in skillOverlap
- Return only the JSON object`;

  try {
    if (!getNimClient()) {
      return NextResponse.json({ error: NIM_KEY_ERROR }, { status: 503 });
    }

    let raw = await orchestrateChatCompletion(
      "matching",
      {
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userMsg },
        ],
        temperature: 0.55,
        max_tokens: 2500,
      },
      { minContentLength: 100 },
    );
    raw = raw.replace(/^```[\w]*\n?/gm, "").replace(/\n?```$/gm, "").trim();

    const jsonStart = raw.indexOf("{");
    const jsonEnd   = raw.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) throw new Error("No JSON in response");

    let data: { projects?: MatchedProject[] };
    try {
      data = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as { projects?: MatchedProject[] };
    } catch {
      throw new Error("Model returned invalid JSON");
    }
    const projects: MatchedProject[] = (data.projects ?? []).map((p: MatchedProject, i: number) => ({
      ...p,
      id: p.id ?? `p${i + 1}`,
      matchScore: Math.max(0, Math.min(100, Number(p.matchScore) || 50)),
    }));

    // Server-side deduplication: remove near-duplicate tech stacks
    const seenFingerprints = new Set<string>();
    const deduped = projects.filter(p => {
      const sorted = [...(p.techStack ?? [])].sort().slice(0, 3).join(",").toLowerCase();
      if (seenFingerprints.has(sorted)) return false;
      seenFingerprints.add(sorted);
      return true;
    });

    // Sort by match score descending
    deduped.sort((a, b) => b.matchScore - a.matchScore);

    return NextResponse.json({ projects: deduped });
  } catch (err) {
    console.error("[match-projects] error:", err);
    return NextResponse.json({ error: messageForAiRouteFailure(err) }, { status: 500 });
  }
}
