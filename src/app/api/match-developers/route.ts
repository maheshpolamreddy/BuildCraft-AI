import { NextRequest, NextResponse } from "next/server";
import { readJsonBody } from "@/lib/read-json-body";
import { messageForAiRouteFailure } from "@/lib/map-ai-route-error";
import { normalizeSkillsFromFirestore } from "@/lib/developerProfile";
import {
  explainDeveloperMatch,
  rankDevelopersForProject,
  type RankableDeveloper,
} from "@/lib/ml-matching/rank-developers";

export const maxDuration = 30;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DevCandidate {
  userId: string;
  fullName: string;
  email: string;
  photoURL: string;
  primaryRole: string;
  yearsExp: number;
  skills: string[];
  tools: string[];
  githubUrl: string;
  portfolioUrl: string;
  verificationStatus: string;
  availability: string;
  payMin: number;
  payMax: number;
  payCurrency: string;
  profileStatus: string;
}

export interface MatchedDeveloper extends DevCandidate {
  matchScore: number;
  confidenceBand: "Excellent" | "Strong" | "Good" | "Fair";
  skillOverlap: string[];
  missingSkills: string[];
  matchReasons: string[];
  strengthsNote: string;
  caution: string | null;
  rank: number;
}

/** Coerce Firestore / client payloads so scoring never throws on missing arrays. */
function toDevCandidate(raw: unknown): DevCandidate | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const userId = String(o.userId ?? "").trim();
  if (!userId) return null;
  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x)) : [];
  const skillsNorm = normalizeSkillsFromFirestore(
    o.skills ?? (o as { skillList?: unknown }).skillList ?? (o as { techStack?: unknown }).techStack,
  );
  const toStr = (v: unknown) => (v == null ? "" : String(v));
  const toNum = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    userId,
    fullName: toStr(o.fullName || (o as { name?: unknown }).name || (o as { displayName?: unknown }).displayName),
    email: toStr(o.email).trim().toLowerCase(),
    photoURL: toStr(o.photoURL),
    primaryRole: toStr(o.primaryRole) || "fullstack",
    yearsExp: toNum(o.yearsExp),
    skills: skillsNorm.length > 0 ? skillsNorm : strArr(o.skills),
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

function band(score: number): MatchedDeveloper["confidenceBand"] {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Strong";
  if (score >= 55) return "Good";
  return "Fair";
}

function toRankable(dev: DevCandidate): RankableDeveloper {
  return {
    userId: dev.userId,
    fullName: dev.fullName,
    primaryRole: dev.primaryRole,
    yearsExp: dev.yearsExp,
    skills: dev.skills,
    tools: dev.tools,
    githubUrl: dev.githubUrl,
    portfolioUrl: dev.portfolioUrl,
    verificationStatus: dev.verificationStatus,
    availability: dev.availability,
    profileStatus: dev.profileStatus,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  try {
    const body = parsed.body as Record<string, unknown>;
    const projectName = typeof body.projectName === "string" ? body.projectName : "My Project";
    const projectIdea = typeof body.projectIdea === "string" ? body.projectIdea : "";
    const requiredSkills = Array.isArray(body.requiredSkills)
      ? body.requiredSkills.map((s) => String(s))
      : [];
    const candidates = Array.isArray(body.candidates) ? body.candidates : [];

    const normalized = (candidates as unknown[])
      .map(toDevCandidate)
      .filter((c: DevCandidate | null): c is DevCandidate => c !== null);

    if (!normalized.length) {
      return NextResponse.json({ developers: [] });
    }

    const skillsList = requiredSkills.map((s) => String(s));

    const ranked = rankDevelopersForProject(
      normalized.map(toRankable),
      projectName,
      projectIdea,
      skillsList,
    );

    const seenIds = new Set<string>();
    const bucketSeen = new Set<string>();
    const topCandidates: (typeof ranked)[number][] = [];
    for (const c of ranked) {
      if (topCandidates.length >= 6) break;
      const bucket = `${c.dev.primaryRole}-${Math.floor(c.dev.yearsExp / 3)}`;
      if (bucketSeen.has(bucket)) continue;
      bucketSeen.add(bucket);
      seenIds.add(c.dev.userId);
      topCandidates.push(c);
    }
    for (const c of ranked) {
      if (topCandidates.length >= 6) break;
      if (seenIds.has(c.dev.userId)) continue;
      seenIds.add(c.dev.userId);
      topCandidates.push(c);
    }

    const developers: MatchedDeveloper[] = topCandidates.map((c, i) => {
      const full = normalized.find((d) => d.userId === c.dev.userId);
      if (!full) throw new Error("Candidate mapping lost");
      const { matchReasons, strengthsNote, caution } = explainDeveloperMatch(
        c.dev,
        c.overlap,
        c.missing,
        c.features,
      );
      return {
        ...full,
        matchScore: c.score,
        confidenceBand: band(c.score),
        skillOverlap: c.overlap,
        missingSkills: c.missing.slice(0, 2),
        matchReasons,
        strengthsNote,
        caution,
        rank: i + 1,
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
