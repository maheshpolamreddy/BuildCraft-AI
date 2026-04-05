import { isTimeoutLikeError } from "@/lib/ai-retry";
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

/** HTTP status for AI route failures (timeouts vs connection vs generic). */
export function httpStatusForAiFailure(err: unknown): number {
  if (err instanceof Error && err.message === "NO_AI_CLIENT") return 503;
  if (err instanceof Error && err.message === NIM_KEY_ERROR) return 503;
  if (isTimeoutLikeError(err)) return 504;
  if (isConnectionLike(err)) return 503;
  return 500;
}

/**
 * Maps OpenAI SDK / network errors to safe, actionable messages (no raw "Connection error").
 */
export function messageForAiRouteFailure(err: unknown): string {
  if (!(err instanceof Error)) {
    return "Something went wrong. Please try again.";
  }
  const m = err.message;
  const name = err.name;

  if (m === "NO_AI_CLIENT") {
    return AI_ORCHESTRATION_CONFIG_ERROR;
  }

  if (isConnectionLike(err)) {
    return "Could not reach the AI service. Check your internet connection, confirm your AI API key in .env.local, and try again.";
  }

  if (name === "APIConnectionTimeoutError" || /timed?\s*out|timeout|ETIMEDOUT|AbortError/i.test(m)) {
    return "The AI request timed out. Try again in a moment, or use a shorter description.";
  }

  return m;
}
