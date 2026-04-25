import type OpenAI from "openai";
import { isCompactServerlessAiChain } from "@/lib/vercel-ai";

export function isTimeoutLikeError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    /timed?\s*out|timeout|ETIMEDOUT|AbortError|ECONNRESET/i.test(err.message) ||
    err.name === "APIConnectionTimeoutError"
  );
}

/** OpenRouter HTTP 402 / affordability strings — used for automatic max_tokens backoff. */
export function isPaymentOrQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const any = err as Error & { status?: number };
  if (any.status === 402) return true;
  const m = err.message;
  if (/payment required|more credits|fewer max_tokens|can only afford/i.test(m)) return true;
  if (/^402\s/.test(m)) return true;
  return /\b402\b/.test(m);
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
  if (isPaymentOrQuotaError(err)) return true;
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

/**
 * When OpenRouter (or similar) returns 402, retry with smaller max_tokens caps until one succeeds.
 */
export function completionMaxTokensRetrySequence(requested: number): number[] {
  const tiers = [16_384, 8192, 6144, 4096, 3072, 2048, 1536, 1024, 768, 512, 400, 256];
  const r = Math.floor(requested);
  if (!Number.isFinite(r) || r <= 256) return [];
  return tiers.filter((t) => t < r);
}

/** One retry after a short delay — helps transient timeouts and connection blips. */
export async function runChatWithRetry(
  nim: OpenAI,
  params: Parameters<OpenAI["chat"]["completions"]["create"]>[0],
): Promise<string> {
  const exec = async (max_tokens?: number) => {
    const p = max_tokens !== undefined ? { ...params, max_tokens } : params;
    const c = await nim.chat.completions.create({ ...p, stream: false });
    return c.choices[0]?.message?.content ?? "";
  };

  const tryPaymentBackoff = async (firstErr: unknown): Promise<string> => {
    if (!isPaymentOrQuotaError(firstErr)) throw firstErr;
    const requested = typeof params.max_tokens === "number" ? params.max_tokens : 2048;
    let i = 0;
    for (const cap of completionMaxTokensRetrySequence(requested)) {
      if (i++ > 0) {
        await new Promise((r) => setTimeout(r, 600));
      }
      try {
        return await exec(cap);
      } catch (e2) {
        if (!isPaymentOrQuotaError(e2)) throw e2;
      }
    }
    throw firstErr;
  };

  try {
    return await exec();
  } catch (err) {
    if (isPaymentOrQuotaError(err)) {
      return tryPaymentBackoff(err);
    }
    if (isCompactServerlessAiChain()) {
      throw err;
    }
    if (isTransientChatError(err)) {
      await new Promise((r) => setTimeout(r, 600));
      try {
        return await exec();
      } catch (err2) {
        if (isPaymentOrQuotaError(err2)) return tryPaymentBackoff(err2);
        if (isTransientChatError(err2)) {
          await new Promise((r) => setTimeout(r, 900));
          try {
            return await exec();
          } catch (err3) {
            if (isPaymentOrQuotaError(err3)) return tryPaymentBackoff(err3);
            throw err3;
          }
        }
        throw err2;
      }
    }
    throw err;
  }
}
