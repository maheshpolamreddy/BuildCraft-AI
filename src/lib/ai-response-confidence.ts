/**
 * Lightweight 0-1 quality heuristics (internal; no UI). Used to trigger one reprompt.
 */

type AnalysisLike = {
  overview?: { summary?: string; architecture?: { desc?: string }[] };
  tools?: { why?: string }[];
  risks?: unknown[];
};

export function scoreProjectAnalysisQuality(p: AnalysisLike | null | undefined): number {
  if (!p?.overview?.summary) return 0;
  const checks: number[] = [];
  const sum = p.overview.summary.trim().length;
  checks.push(Math.min(1, sum / 200));
  const arch = p.overview.architecture;
  if (Array.isArray(arch)) {
    checks.push(arch.length >= 4 && arch.length <= 6 ? 1 : 0.4);
    const layersOk = arch.every((a) => (a?.desc?.length ?? 0) > 30);
    checks.push(layersOk ? 1 : 0.5);
  } else {
    checks.push(0, 0);
  }
  if (Array.isArray(p.tools) && p.tools.length >= 6) {
    checks.push(1);
    const whys = p.tools.filter((t) => (t?.why?.length ?? 0) > 25).length;
    checks.push(Math.min(1, whys / 6));
  } else {
    checks.push(0, 0);
  }
  if (Array.isArray(p.risks) && p.risks.length >= 3) checks.push(1);
  else checks.push(0.4);
  const n = checks.length;
  return n ? checks.reduce((a, b) => a + b, 0) / n : 0;
}

type PromptRowLike = { prompt?: string };
type BpLike = { pages?: unknown[] };

export function scorePromptPackQuality(data: {
  prompts: PromptRowLike[];
  blueprint: BpLike;
} | null): number {
  if (!data || !Array.isArray(data.prompts) || data.prompts.length < 1) return 0;
  const prompts = data.prompts.slice(0, 6);
  const bodyScores = prompts.map((r) => {
    const t = (r?.prompt ?? "").trim().length;
    return Math.min(1, t / 180);
  });
  const bodyAvg = bodyScores.reduce((a, b) => a + b, 0) / Math.max(1, bodyScores.length);
  const bp = data.blueprint;
  const bpOk = bp && Array.isArray(bp.pages) && bp.pages.length > 0 ? 1 : 0.3;
  return (bodyAvg * 0.75 + bpOk * 0.25) * (prompts.length >= 6 ? 1 : 0.65);
}

export const MIN_ANALYSIS_CONFIDENCE = 0.42;
export const MIN_PROMPTS_CONFIDENCE = 0.4;
