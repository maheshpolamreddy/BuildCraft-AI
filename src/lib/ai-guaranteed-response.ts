import type { AiResponseSource, AiSuccessEnvelope } from "@/lib/ai-response-envelope";

/**
 * Ensures API handlers always have a non-null, schema-valid value (never "empty" AI output).
 */
export function ensureValidAiResponse<T>(result: T | null | undefined, fallback: T, isValid?: (v: T) => boolean): T {
  if (result == null) return fallback;
  if (isValid && !isValid(result)) return fallback;
  return result;
}

export function isMissingOrInvalid<T>(result: T | null | undefined, isValid: (v: T) => boolean): boolean {
  if (result == null) return true;
  return !isValid(result);
}

/**
 * Wraps validated payload in the standard success envelope. `data` is never null and always matches the validator when possible.
 */
export function ensureStrictAiEnvelope<T>(
  result: T | null | undefined,
  fallback: T,
  source: AiResponseSource,
  isValid?: (v: T) => boolean,
): AiSuccessEnvelope<T> {
  const data = ensureValidAiResponse(result, fallback, isValid);
  return { success: true, data, source };
}
