import { isPaymentOrQuotaError } from "@/lib/ai-retry";
import { AI_ORCHESTRATION_CONFIG_ERROR } from "@/lib/ai-provider-registry";
import { NIM_KEY_ERROR } from "@/lib/nim-client";

function isConnectionLike(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === "APIConnectionError" ||
    /connection error|^fetch failed|failed to fetch|econnrefused|econnreset|enotfound|socket|network|getaddrinfo|tls|ssl|certificate/i.test(
      err.message,
    )
  );
}

/**
 * AI routes return HTTP 200 with valid structured payloads; callers use fallbacks, not 5xx, for model issues.
 * (Still used when an optional `{ error: string }` must be sent without breaking clients — always 200.)
 */
export function httpStatusForAiFailure(_err: unknown): number {
  return 200;
}

const NEUTRAL = "Generating optimized results…";

/**
 * Maps OpenAI SDK / network errors to safe, non-raw messages (no token/credit/provider text).
 */
export function messageForAiRouteFailure(err: unknown): string {
  if (!(err instanceof Error)) {
    return NEUTRAL;
  }
  const m = err.message;
  const name = err.name;

  if (m === "NO_AI_CLIENT") {
    return AI_ORCHESTRATION_CONFIG_ERROR;
  }

  if (m === "AI_ORCHESTRATION_SKIPPED_SAFE_MODE") {
    return NEUTRAL;
  }

  if (isConnectionLike(err) || isPaymentOrQuotaError(err)) {
    return NEUTRAL;
  }

  if (name === "APIConnectionTimeoutError" || /timed?\s*out|timeout|ETIMEDOUT|AbortError/i.test(m)) {
    return NEUTRAL;
  }

  if (m === "ANALYSIS_PHASE_JSON" || m === "PROMPTS_JSON_RETRY_FAIL" || m === "AI_INPUT_CONTEXT_EXCEEDED") {
    return NEUTRAL;
  }
  if (/invalid JSON|Analysis step|missing overview|No JSON|unexpected format/i.test(m)) {
    return NEUTRAL;
  }

  return NEUTRAL;
}
