/**
 * Vercel serverless has strict execution limits (often 10s on Hobby, up to 60s+ on Pro).
 * Long multi-model chains + enhancement + retries exceed the budget and surface as 504.
 */

/** Set to `1` on Vercel to use the full multi-provider chain + optional UI_JSON_ENHANCE (needs Pro-level maxDuration). */
export function vercelAiFullChain(): boolean {
  return process.env.VERCEL_AI_FULL_CHAIN?.trim() === "1";
}

/**
 * When true, use one fast path: Groq → short-timeout primary → capped Gemini; no HF/CF/secondary; no retries.
 * Enabled on all Vercel deployments unless VERCEL_AI_FULL_CHAIN=1.
 */
export function useCompactServerlessAiChain(): boolean {
  if (vercelAiFullChain()) return false;
  return process.env.VERCEL === "1";
}

/** OpenAI-compatible SDK timeout for compact chain (stay under serverless wall clock). */
export function compactOpenAiTimeoutMs(): number {
  const raw = Number(process.env.VERCEL_AI_UPSTREAM_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw >= 4_000 && raw <= 25_000) return Math.floor(raw);
  return 18_000;
}

/** Cap Gemini wait so fallbacks can still run within the same invocation. */
export function compactGeminiMaxMs(): number {
  const raw = Number(process.env.VERCEL_GEMINI_MAX_MS);
  if (Number.isFinite(raw) && raw >= 3_000 && raw <= 20_000) return Math.floor(raw);
  return 14_000;
}

/** Wall-clock budget for compact multi-provider chain (Groq → primary → Gemini → optional HF/CF). */
export function compactChainBudgetMs(): number {
  const raw = Number(process.env.VERCEL_AI_COMPACT_BUDGET_MS);
  if (Number.isFinite(raw) && raw >= 12_000 && raw <= 290_000) return Math.floor(raw);
  return 58_000;
}
