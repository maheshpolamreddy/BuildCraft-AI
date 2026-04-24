/**
 * Output token ceilings — tune in one place.
 * Default path: one merged analysis call (faster, fewer round-trips); two-phase kept as fallback.
 */

/**
 * OpenRouter returns HTTP 402 when `max_tokens` exceeds what the account can afford for that call.
 * Architecture + prompt-pack calls used 3k–7.2k tokens and often tripped "can only afford ~2.3k".
 * This cap applies only to those routes so other features keep their original limits.
 *
 * Raise for longer outputs: AI_MAX_COMPLETION_TOKENS=8192 (or set AI_ANALYZE_TWO_PHASE=1 and a higher cap).
 */
function readArchitectureCompletionCap(): number {
  if (typeof process === "undefined") return 2_048;
  const raw = process.env.AI_MAX_COMPLETION_TOKENS?.trim();
  if (!raw) return 2_048;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 256) return 2_048;
  return Math.min(128_000, Math.floor(n));
}

const ARCH_AND_PROMPTS_CAP = readArchitectureCompletionCap();

function capArchTokens(requested: number): number {
  return Math.min(requested, ARCH_AND_PROMPTS_CAP);
}

export const MAX_TOKENS_ANALYZE_PHASE1 = capArchTokens(3_000);
export const MAX_TOKENS_ANALYZE_PHASE2 = capArchTokens(3_800);
export const MAX_TOKENS_ANALYZE_MERGED = capArchTokens(7_200);

export const MAX_TOKENS_GENERATE_PROMPTS = capArchTokens(5_500);

export const MAX_TOKENS_GENERATE_CODE = 2_800;
export const MAX_TOKENS_GENERATE_PREVIEW = 2_600;
/**
 * Body-only HTML from the model; full CSS is injected server-side. Kept low so Hobby (~60s) completes.
 */
export const MAX_TOKENS_GENERATE_STITCH_UI = 1_800;

/** Structured UI JSON for dynamic React renderer (rich cards + nested children). */
export const MAX_TOKENS_GENERATE_UI_JSON = 3_400;

/** Second-pass polish on validated UI JSON (spacing hierarchy, responsive layout choice, copy). */
export const MAX_TOKENS_UI_JSON_ENHANCE = 2_400;

/** Max chars sent to the model for project description (keeps prompts fast and stable). */
export const MAX_PROJECT_DESCRIPTION_CHARS = 14_000;

/** Stitch: keep idea short so the LLM finishes within serverless time limits. */
export const MAX_STITCH_IDEA_CHARS = 1_200;
