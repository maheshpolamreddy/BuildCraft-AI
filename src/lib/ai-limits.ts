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
  /* Default 1200 keeps OpenRouter 402s rare; set AI_MAX_COMPLETION_TOKENS to raise. */
  if (typeof process === "undefined") return 1_200;
  const raw = process.env.AI_MAX_COMPLETION_TOKENS?.trim();
  if (!raw) return 1_200;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 256) return 1_200;
  return Math.min(128_000, Math.floor(n));
}

const ARCH_AND_PROMPTS_CAP = readArchitectureCompletionCap();

function capArchTokens(requested: number): number {
  return Math.min(requested, ARCH_AND_PROMPTS_CAP);
}

/** Per-phase: bounded by readArchitectureCompletionCap() to reduce 402s. */
export const MAX_TOKENS_ANALYZE_PHASE1 = capArchTokens(1_200);
export const MAX_TOKENS_ANALYZE_PHASE2 = capArchTokens(1_200);
/** Single-call merged path; two-phase in plan-orchestration when JSON fails. */
export const MAX_TOKENS_ANALYZE_MERGED = capArchTokens(1_200);

export const MAX_TOKENS_GENERATE_PROMPTS = capArchTokens(1_200);

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
export const MAX_PROJECT_DESCRIPTION_CHARS = 8_000;

/** Stitch: keep idea short so the LLM finishes within serverless time limits. */
export const MAX_STITCH_IDEA_CHARS = 1_200;

// ── Input estimation + dynamic max_tokens clamp (orchestrator) ─────────────────

function readEnvInt(name: string, fallback: number): number {
  if (typeof process === "undefined") return fallback;
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

/** ~4 chars per token for Latin/JSON. */
export function estimateTokensFromText(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

type ChatMsg = { role?: string; content?: string | null };

export function estimateTokensFromMessages(messages: ChatMsg[]): number {
  let n = 0;
  for (const m of messages) {
    const c = typeof m.content === "string" ? m.content : "";
    n += estimateTokensFromText(c) + 4;
  }
  return n + 16;
}

/**
 * Hard ceiling for completion tokens (orchestrator clamp). Default 1024 (800–1200 band).
 * Override with AI_SAFE_MAX_OUTPUT_TOKENS; raise only if your provider budget allows.
 */
export function getSafeMaxOutputTokens(): number {
  const v = readEnvInt("AI_SAFE_MAX_OUTPUT_TOKENS", 1024);
  return Math.min(32_000, Math.max(256, v));
}

/** PRD, milestones, and similar structured JSON routes — requested max before dynamic clamp. */
export const MAX_TOKENS_STRUCTURED_JSON_ROUTE = 1_200;
export const MAX_TOKENS_STRUCTURED_JSON_RETRY = 800;

export function getAssumedContextWindowTokens(): number {
  const v = readEnvInt("AI_CONTEXT_WINDOW_TOKENS", 28_000);
  return Math.min(200_000, Math.max(4096, v));
}

const INPUT_RESERVE = 1024;

export function clampMaxOutputTokens(inputTokenEstimate: number, requestedMax: number): number {
  const safe = getSafeMaxOutputTokens();
  const ctx = getAssumedContextWindowTokens();
  const room = ctx - inputTokenEstimate - INPUT_RESERVE;
  const budget = Math.max(256, Math.min(safe, room));
  const req = Number.isFinite(requestedMax) ? Math.floor(requestedMax) : 1024;
  return Math.max(256, Math.min(req, budget));
}
