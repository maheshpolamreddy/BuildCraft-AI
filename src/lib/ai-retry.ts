import type OpenAI from "openai";
import { useCompactServerlessAiChain } from "@/lib/vercel-ai";

export function isTimeoutLikeError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    /timed?\s*out|timeout|ETIMEDOUT|AbortError|ECONNRESET/i.test(err.message) ||
    err.name === "APIConnectionTimeoutError"
  );
}

function isConnectionLikeError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === "APIConnectionError" ||
    /connection error|econnrefused|econnreset|fetch failed|socket hang up/i.test(err.message)
  );
}

/** True for errors worth one automatic retry (timeout or flaky connection). */
export function isTransientChatError(err: unknown): boolean {
  return isTimeoutLikeError(err) || isConnectionLikeError(err);
}

/**
 * True when trying an alternate model or secondary API provider may help —
 * rate limits, overload, upstream 5xx, or transient network issues.
 */
export function isRetryableWithFallback(err: unknown): boolean {
  if (isTransientChatError(err)) return true;
  if (!(err instanceof Error)) return false;
  const any = err as Error & { status?: number; code?: string };
  const st = any.status;
  if (st === 429 || st === 502 || st === 503) return true;
  const code = String(any.code || "").toLowerCase();
  if (/rate_limit|overloaded|insufficient_quota|server_error|model_not_found/i.test(code)) return true;
  const m = err.message.toLowerCase();
  if (
    /rate limit|too many requests|overloaded|capacity|unavailable|503|502|429|try again later/i.test(m)
  ) {
    return true;
  }
  return false;
}

/** One retry after a short delay — helps transient timeouts and connection blips. */
export async function runChatWithRetry(
  nim: OpenAI,
  params: Parameters<OpenAI["chat"]["completions"]["create"]>[0],
): Promise<string> {
  const exec = async () => {
    const c = await nim.chat.completions.create({ ...params, stream: false });
    return c.choices[0]?.message?.content ?? "";
  };
  try {
    return await exec();
  } catch (err) {
    if (useCompactServerlessAiChain()) {
      throw err;
    }
    if (isTransientChatError(err)) {
      await new Promise((r) => setTimeout(r, 700));
      return await exec();
    }
    throw err;
  }
}
