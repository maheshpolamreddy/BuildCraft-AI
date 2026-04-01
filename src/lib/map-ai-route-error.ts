import { isTimeoutLikeError } from "@/lib/ai-retry";

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

  if (isConnectionLike(err)) {
    return "Could not reach the AI service. Check your internet connection, confirm your AI API key in .env.local, and try again.";
  }

  if (name === "APIConnectionTimeoutError" || /timed?\s*out|timeout|ETIMEDOUT|AbortError/i.test(m)) {
    return "The AI request timed out. Try again in a moment, or use a shorter description.";
  }

  return m;
}
