import {
  augmentIdfForQueryTerms,
  bm25Score,
  buildBm25Corpus,
  jaccardTokenBags,
  minMaxNorm,
  tokenBag,
  tokenize,
} from "./bm25";
import { skillOverlapAndMissing } from "./skill-overlap";

export type RankableDeveloper = {
  userId: string;
  fullName: string;
  primaryRole: string;
  yearsExp: number;
  skills: string[];
  tools: string[];
  githubUrl: string;
  portfolioUrl: string;
  verificationStatus: string;
  availability: string;
  profileStatus: string;
};

export type DeveloperFeatureBreakdown = {
  bm25Norm: number;
  jaccard: number;
  experience: number;
  verification: number;
  profileActive: number;
  portfolio: number;
  roleAlign: number;
};

const W = {
  bm25: 0.34,
  jaccard: 0.24,
  experience: 0.12,
  verification: 0.1,
  profileActive: 0.08,
  portfolio: 0.06,
  roleAlign: 0.06,
} as const;

function devDocument(d: RankableDeveloper): string {
  return [d.primaryRole, ...d.skills, ...d.tools, d.availability, `${d.yearsExp}y`].join(" ");
}

function verificationNorm(status: string): number {
  if (status === "project-verified") return 1;
  if (status === "assessment-passed") return 0.72;
  return 0.38;
}

function profileActiveNorm(status: string): number {
  return status === "active" ? 1 : 0.45;
}

function roleAlignScore(d: RankableDeveloper, queryTokens: string[]): number {
  const roleTok = tokenize(d.primaryRole.replace(/-/g, " "));
  if (!roleTok.length) return 0.55;
  let hits = 0;
  for (const r of roleTok) {
    if (queryTokens.some((q) => q.includes(r) || r.includes(q))) hits++;
  }
  return hits / roleTok.length;
}

function linearScore(f: DeveloperFeatureBreakdown): number {
  return (
    W.bm25 * f.bm25Norm +
    W.jaccard * f.jaccard +
    W.experience * f.experience +
    W.verification * f.verification +
    W.profileActive * f.profileActive +
    W.portfolio * f.portfolio +
    W.roleAlign * f.roleAlign
  );
}

function toMatchScore01(linear: number): number {
  const centered = (linear - 0.42) * 6;
  return 1 / (1 + Math.exp(-centered));
}

export type ScoredDeveloper = {
  dev: RankableDeveloper;
  score: number;
  overlap: string[];
  missing: string[];
  features: DeveloperFeatureBreakdown;
  linear: number;
};

export function rankDevelopersForProject(
  developers: RankableDeveloper[],
  projectName: string,
  projectIdea: string,
  requiredSkills: string[],
): ScoredDeveloper[] {
  const queryText = [projectName, projectIdea, requiredSkills.join(" ")].join(" ").trim();
  const qt = tokenize(queryText);
  const queryTokens = qt.length > 0 ? qt : tokenize("web application software developer");

  const documents = developers.map(devDocument);
  const corpus = buildBm25Corpus(documents);
  augmentIdfForQueryTerms(corpus, queryTokens);

  const rawBm25 = developers.map((_, i) => bm25Score(queryTokens, i, corpus));
  const bm25NormArr = minMaxNorm(rawBm25);

  const queryBags = tokenBag(queryText || "software development");

  const scored: ScoredDeveloper[] = developers.map((dev, i) => {
    const devSkillsLower = dev.skills.map((s) => s.toLowerCase());
    const { overlap, missing } = skillOverlapAndMissing(requiredSkills, devSkillsLower);

    const devBag = tokenBag(devDocument(dev));
    const jacc = jaccardTokenBags(queryBags, devBag);

    const f: DeveloperFeatureBreakdown = {
      bm25Norm: bm25NormArr[i] ?? 0,
      jaccard: jacc,
      experience: Math.min(dev.yearsExp / 10, 1),
      verification: verificationNorm(dev.verificationStatus),
      profileActive: profileActiveNorm(dev.profileStatus),
      portfolio: dev.githubUrl || dev.portfolioUrl ? 1 : 0.5,
      roleAlign: roleAlignScore(dev, queryTokens),
    };

    const linear = linearScore(f);
    const s01 = toMatchScore01(linear);
    let score = Math.max(0, Math.min(100, Math.round(s01 * 100)));
    if (dev.verificationStatus === "project-verified") {
      score = Math.min(100, Math.round(score * 1.2));
    }

    return { dev, score, overlap, missing, features: f, linear };
  });

  const tierRank = (s: string) =>
    s === "project-verified" ? 3 : s === "assessment-passed" ? 2 : 1;
  return scored.sort((a, b) => {
    const td = tierRank(b.dev.verificationStatus) - tierRank(a.dev.verificationStatus);
    if (td !== 0) return td;
    return b.score - a.score;
  });
}

export function explainDeveloperMatch(
  dev: RankableDeveloper,
  overlap: string[],
  missing: string[],
  features: DeveloperFeatureBreakdown,
): { matchReasons: string[]; strengthsNote: string; caution: string | null } {
  const reasons: { label: string; w: number }[] = [
    {
      label: `Text relevance (BM25 lexical match) is ${
        features.bm25Norm >= 0.65 ? "strong" : features.bm25Norm >= 0.35 ? "moderate" : "light"
      } for this project`,
      w: features.bm25Norm * W.bm25,
    },
    {
      label: `Token overlap between project needs and profile is ${Math.round(features.jaccard * 100)}% (Jaccard)`,
      w: features.jaccard * W.jaccard,
    },
    {
      label: `${dev.yearsExp} years experience as ${dev.primaryRole}`,
      w: features.experience * W.experience,
    },
  ];
  reasons.sort((a, b) => b.w - a.w);

  const matchReasons = [
    overlap.length
      ? `Skills aligned with request: ${overlap.slice(0, 3).join(", ")}`
      : "Profile matches project vocabulary via BM25 + token overlap.",
    reasons[0]?.label ?? "Ranked by calibrated retrieval score.",
    reasons[1]?.label ?? `Availability: ${dev.availability}`,
  ].filter(Boolean);

  let strengthsNote = "";
  if (features.verification >= 0.9) {
    strengthsNote = "Project-verified tier is the strongest trust signal in this model.";
  } else if (features.verification >= 0.65) {
    strengthsNote = "Assessment-passed tier adds confidence beyond self-reported skills.";
  } else {
    strengthsNote = "Strongest lift here comes from skill and text relevance; verify in interview.";
  }

  let caution: string | null = null;
  if (missing.length) {
    caution = `Gap to plan for: ${missing.slice(0, 2).join(", ")}.`;
  } else if (features.jaccard < 0.2 && overlap.length < 2) {
    caution = "Low direct token overlap; confirm domain fit in a short screen.";
  } else if (dev.profileStatus !== "active") {
    caution = "Profile is not marked active; confirm availability.";
  }

  return { matchReasons: matchReasons.slice(0, 3), strengthsNote, caution };
}
