import { NextRequest, NextResponse } from "next/server";
import { getNimClient, NIM_KEY_ERROR } from "@/lib/nim-client";
import { orchestrateChatCompletion } from "@/lib/ai-orchestrator";
import { readJsonBody } from "@/lib/read-json-body";
import { messageForAiRouteFailure } from "@/lib/map-ai-route-error";

export const maxDuration = 180;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DevCandidate {
  userId:       string;
  fullName:     string;
  email:        string;
  photoURL:     string;
  primaryRole:  string;
  yearsExp:     number;
  skills:       string[];
  tools:        string[];
  githubUrl:    string;
  portfolioUrl: string;
  verificationStatus: string;
  availability: string;
  payMin:       number;
  payMax:       number;
  payCurrency:  string;
  profileStatus: string;
}

export interface MatchedDeveloper extends DevCandidate {
  matchScore:      number;   // 0–100
  confidenceBand:  "Excellent" | "Strong" | "Good" | "Fair";
  skillOverlap:    string[];
  missingSkills:   string[];
  matchReasons:    string[];
  strengthsNote:   string;
  caution:         string | null;
  rank:            number;
}

/** Coerce Firestore / client payloads so scoring never throws on missing arrays. */
function toDevCandidate(raw: unknown): DevCandidate | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const userId = String(o.userId ?? "").trim();
  if (!userId) return null;
  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map(x => String(x)) : [];
  const toStr = (v: unknown) => (v == null ? "" : String(v));
  const toNum = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    userId,
    fullName: toStr(o.fullName),
    email: toStr(o.email),
    photoURL: toStr(o.photoURL),
    primaryRole: toStr(o.primaryRole) || "fullstack",
    yearsExp: toNum(o.yearsExp),
    skills: strArr(o.skills),
    tools: strArr(o.tools),
    githubUrl: toStr(o.githubUrl),
    portfolioUrl: toStr(o.portfolioUrl),
    verificationStatus: toStr(o.verificationStatus) || "self-declared",
    availability: toStr(o.availability) || "full-time",
    payMin: toNum(o.payMin),
    payMax: toNum(o.payMax),
    payCurrency: toStr(o.payCurrency) || "USD",
    profileStatus: toStr(o.profileStatus) || "pending",
  };
}

// ── Scoring formula (deterministic baseline) ─────────────────────────────────
// Applied before AI enhancement so AI only needs to generate reasoning text

function scoreCandidate(
  dev: DevCandidate,
  requiredSkills: string[],
): { score: number; overlap: string[]; missing: string[] } {
  const devSkillsLower = dev.skills.map(s => s.toLowerCase());
  const requiredLower  = requiredSkills.map(s => s.toLowerCase());

  const overlap  = requiredSkills.filter(rs => devSkillsLower.some(ds => ds.includes(rs.toLowerCase()) || rs.toLowerCase().includes(ds)));
  const missing  = requiredSkills.filter(rs => !devSkillsLower.some(ds => ds.includes(rs.toLowerCase()) || rs.toLowerCase().includes(ds)));

  const overlapRatio  = requiredLower.length > 0 ? overlap.length / requiredLower.length : 0.5;
  const expScore      = Math.min(dev.yearsExp / 7, 1);
  const tierScore     = dev.verificationStatus === "project-verified" ? 1 : dev.verificationStatus === "assessment-passed" ? 0.65 : 0.35;
  const availScore    = dev.profileStatus === "active" ? 1 : 0.4;
  const portfolioScore = (dev.githubUrl || dev.portfolioUrl) ? 1 : 0.5;

  const raw = overlapRatio * 40 + expScore * 20 + tierScore * 20 + availScore * 10 + portfolioScore * 10;
  return { score: Math.min(100, Math.round(raw)), overlap, missing };
}

// ── Confidence band ───────────────────────────────────────────────────────────
function band(score: number): MatchedDeveloper["confidenceBand"] {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Strong";
  if (score >= 55) return "Good";
  return "Fair";
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM = `You are a senior technical recruiter and AI matching engine for BuildCraft AI.

Given a list of pre-scored developer candidates and a project description, generate AI reasoning for each candidate:
- matchReasons: 2–3 specific bullet points explaining WHY this developer fits this project (name their actual skills)
- strengthsNote: 1 sentence about their strongest signal (tier, specific skill, experience)
- caution: 1 short sentence about the biggest risk or gap, or null if no significant concern

Return ONLY a single valid JSON array — no markdown, no explanation.

Format:
[
  {
    "userId": "exact_user_id_from_input",
    "matchReasons": ["reason1 mentioning their skill", "reason2", "reason3"],
    "strengthsNote": "Their strongest signal is...",
    "caution": "One concern or null"
  }
]

CRITICAL: Return reasoning for EVERY candidate in the input, in the same order. userId must exactly match the input.`;

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  if (!getNimClient()) {
    return NextResponse.json({ error: NIM_KEY_ERROR, developers: [] }, { status: 503 });
  }

  try {
  const body = parsed.body as Record<string, unknown>;
  const projectName = typeof body.projectName === "string" ? body.projectName : "My Project";
  const projectIdea = typeof body.projectIdea === "string" ? body.projectIdea : "";
  const requiredSkills = Array.isArray(body.requiredSkills)
    ? body.requiredSkills.map(s => String(s))
    : [];
  const candidates = Array.isArray(body.candidates) ? body.candidates : [];

  const normalized = (candidates as unknown[])
    .map(toDevCandidate)
    .filter((c: DevCandidate | null): c is DevCandidate => c !== null);

  if (!normalized.length) {
    return NextResponse.json({ developers: [] });
  }

  const skillsList = Array.isArray(requiredSkills)
    ? requiredSkills.map(s => String(s))
    : [];

  // Step 1: Score all candidates deterministically
  type Scored = { dev: DevCandidate; score: number; overlap: string[]; missing: string[] };
  const scored: Scored[] = normalized.map((dev: DevCandidate) => {
    const { score, overlap, missing } = scoreCandidate(dev, skillsList);
    return { dev, score, overlap, missing };
  });

  // Step 2: Sort by score, deduplicate by role+experience bucket
  const sorted: Scored[] = scored.sort((a, b) => b.score - a.score);
  const seenRoleBuckets = new Set<string>();
  const topCandidates: Scored[] = sorted.filter(c => {
    const bucket = `${c.dev.primaryRole}-${Math.floor(c.dev.yearsExp / 3)}`;
    if (seenRoleBuckets.size >= 6) return false;
    seenRoleBuckets.add(bucket);
    return true;
  }).slice(0, 6);

  // Step 3: Ask AI to generate reasoning for each
  const candidateSummaries = topCandidates.map((c, i: number) => ({
    rank: i + 1,
    userId: c.dev.userId,
    name: c.dev.fullName || "Developer",
    role: c.dev.primaryRole,
    yearsExp: c.dev.yearsExp,
    skills: c.dev.skills.slice(0, 12).join(", "),
    tier: c.dev.verificationStatus,
    availability: c.dev.availability,
    hasPortfolio: !!(c.dev.githubUrl || c.dev.portfolioUrl),
    matchScore: c.score,
    skillOverlap: c.overlap.join(", "),
    missingSkills: c.missing.slice(0, 3).join(", "),
  }));

  const userMsg = `Project: "${projectName}"
Description: ${projectIdea || `A modern web application called ${projectName}`}
Required Skills: ${skillsList.join(", ") || "JavaScript, React, Node.js"}

Candidates (already scored — just write reasoning):
${JSON.stringify(candidateSummaries, null, 2)}

Write matchReasons, strengthsNote, and caution for each candidate. Return only the JSON array.`;

  let aiReasoning: { userId: string; matchReasons: string[]; strengthsNote: string; caution: string | null }[] = [];

  try {
    let raw = await orchestrateChatCompletion(
      "matching",
      {
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userMsg },
        ],
        temperature: 0.4,
        max_tokens: 1800,
      },
      { minContentLength: 60 },
    );
    raw = raw.replace(/^```[\w]*\n?/gm, "").replace(/\n?```$/gm, "").trim();

    const arrStart = raw.indexOf("[");
    const arrEnd   = raw.lastIndexOf("]");
    if (arrStart !== -1 && arrEnd !== -1) {
      aiReasoning = JSON.parse(raw.slice(arrStart, arrEnd + 1));
    }
  } catch {
    // Fallback: generate generic reasoning
    aiReasoning = topCandidates.map(c => ({
      userId: c.dev.userId,
      matchReasons: [`Strong skill overlap with ${c.overlap.slice(0, 2).join(" and ") || "listed skills"}`, `${c.dev.yearsExp} years of experience in ${c.dev.primaryRole} development`, `Available as ${c.dev.availability}`],
      strengthsNote:
        c.dev.verificationStatus === "project-verified"
          ? "Project-verified tier confirms real-world delivery capability."
          : c.dev.verificationStatus === "assessment-passed"
            ? "Assessment-passed tier with demonstrated technical knowledge."
            : "Self-declared profile; verify fit in interview.",
      caution: c.missing.length > 0 ? `May need to pick up ${c.missing[0]} during the project.` : null,
    }));
  }

  // Step 4: Merge deterministic scores with AI reasoning
  const reasoningMap = new Map(aiReasoning.map(r => [r.userId, r]));
  const developers: MatchedDeveloper[] = topCandidates.map((c, i: number) => {
    const reasoning = reasoningMap.get(c.dev.userId);
    return {
      ...c.dev,
      matchScore:     c.score,
      confidenceBand: band(c.score),
      skillOverlap:   c.overlap,
      missingSkills:  c.missing.slice(0, 2),
      matchReasons:   reasoning?.matchReasons ?? [`Matched ${c.overlap.length} required skills`],
      strengthsNote:  reasoning?.strengthsNote ?? "Strong technical profile.",
      caution:        reasoning?.caution ?? null,
      rank:           i + 1,
    };
  });

  return NextResponse.json({ developers });
  } catch (err) {
    console.error("[match-developers]", err);
    return NextResponse.json(
      { developers: [], error: messageForAiRouteFailure(err) },
      { status: 500 },
    );
  }
}
