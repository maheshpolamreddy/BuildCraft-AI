/**
 * Centralized AI Orchestration Layer (“Orchestration Brain”):
 * task-based model selection, resilient retries, and fallback to alternate models / providers.
 */

import type OpenAI from "openai";
import type { ChatCompletion } from "openai/resources/chat/completions";
import {
  getNimClient,
  getSecondaryNimClient,
  getAiChatModelId,
  getAiFallbackModelId,
  getAiFastModelId,
  getSecondaryChatModelId,
  getStitchModelId,
  getAiArchitectureModelId,
  getAiPromptGenerationModelId,
  getAiStructuredJsonModelId,
  getAiCodeGenerationModelId,
} from "@/lib/nim-client";
import {
  isRetryableWithFallback,
  runChatWithRetry,
  completionMaxTokensRetrySequence,
  isPaymentOrQuotaError,
} from "@/lib/ai-retry";
import { cloudflareWorkersAiChat } from "@/lib/cloudflare-workers-ai";
import { isCompactServerlessAiChain } from "@/lib/vercel-ai";

export type OrchestrationTask =
  | "architecture_deep"
  | "structured_json"
  | "ui_json"
  | "code_generation"
  | "stitch_landing"
  | "matching"
  | "prompt_generation"
  | "validation";

export type OrchestrateChatOptions = {
  /**
   * If the model returns fewer than this many characters (after trim),
   * the orchestrator tries fallback model / secondary provider when configured.
   */
  minContentLength?: number;
  /**
   * Single primary completion only — no short-output fallbacks, no alternate providers.
   * Required for Vercel Hobby (~60s): the full orchestration chain can exceed the limit.
   */
  primaryOnly?: boolean;
};

type ChatParams = Omit<Parameters<OpenAI["chat"]["completions"]["create"]>[0], "model" | "stream"> & {
  stream?: false;
};

/**
 * Picks the best default model per task: fast models for routing/JSON throughput,
 * primary chat for architecture/code quality, dedicated env overrides per workload.
 */
function resolvePrimaryModel(task: OrchestrationTask): string {
  switch (task) {
    case "matching":
    case "validation":
      return getAiFastModelId();
    case "stitch_landing":
      return getStitchModelId();
    case "architecture_deep":
      return getAiArchitectureModelId();
    case "prompt_generation":
      return getAiPromptGenerationModelId();
    case "structured_json":
    case "ui_json":
      return getAiStructuredJsonModelId();
    case "code_generation":
      return getAiCodeGenerationModelId();
    default:
      return getAiChatModelId();
  }
}

/**
 * Models to try after global fallback + secondary + Cloudflare — excludes primary and
 * `AI_FALLBACK_MODEL_ID` (already attempted in the catch path) to avoid duplicate calls.
 */
function recoveryModelIds(modelPrimary: string, fallbackId: string | undefined): string[] {
  const seen = new Set<string>([modelPrimary]);
  if (fallbackId) seen.add(fallbackId);
  const out: string[] = [];
  const push = (id: string) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };
  push(getAiFastModelId());
  push(getAiChatModelId());
  push(getAiStructuredJsonModelId());
  return out;
}

function needsMoreContent(content: string, minLen: number | undefined): boolean {
  const t = content.trim();
  if (!t) return true;
  if (minLen !== undefined && t.length < minLen) return true;
  return false;
}

/**
 * Runs a non-streaming chat completion with:
 * - Task-appropriate primary model (fast vs full)
 * - Same-provider retry (via `runChatWithRetry`)
 * - Optional `AI_FALLBACK_MODEL_ID` on empty/short output or retryable errors
 * - Optional secondary API (`AI_SECONDARY_*`) when primary path fails or output is still unusable
 */
export async function orchestrateChatCompletion(
  task: OrchestrationTask,
  params: ChatParams,
  opts?: OrchestrateChatOptions,
): Promise<string> {
  const primary = getNimClient();
  if (!primary) {
    throw new Error("NO_AI_CLIENT");
  }

  const modelPrimary = resolvePrimaryModel(task);
  const fallbackId = getAiFallbackModelId();
  const secondary = getSecondaryNimClient();
  const secondaryModel = getSecondaryChatModelId();
  const minLen = opts?.minContentLength;
  const compact = isCompactServerlessAiChain();
  const effectivePrimaryOnly = opts?.primaryOnly || compact;

  const runWith = (client: OpenAI, model: string) =>
    runChatWithRetry(client, { ...params, stream: false, model });

  if (effectivePrimaryOnly) {
    const runPrimary = async (max_tokens?: number) => {
      const base = { ...params, model: modelPrimary, stream: false as const };
      const p = max_tokens !== undefined ? { ...base, max_tokens } : base;
      const c = (await primary.chat.completions.create(p)) as ChatCompletion;
      return (c.choices[0]?.message?.content ?? "").trim();
    };
    try {
      return await runPrimary();
    } catch (err) {
      if (!isPaymentOrQuotaError(err)) throw err;
      const requested = typeof params.max_tokens === "number" ? params.max_tokens : 2048;
      for (const cap of completionMaxTokensRetrySequence(requested)) {
        try {
          return await runPrimary(cap);
        } catch (e2) {
          if (!isPaymentOrQuotaError(e2)) throw e2;
        }
      }
      throw err;
    }
  }

  const improveContent = async (content: string): Promise<string> => {
    let out = content;
    if (!needsMoreContent(out, minLen)) return out;

    if (fallbackId && fallbackId !== modelPrimary) {
      try {
        const alt = await runWith(primary, fallbackId);
        if (!needsMoreContent(alt, minLen)) return alt;
        if (alt.trim()) out = alt;
      } catch {
        /* continue */
      }
    }

    // If no global fallback (or same as primary), try fast tier for short/empty completions.
    if (needsMoreContent(out, minLen)) {
      const fast = getAiFastModelId();
      if (fast !== modelPrimary && fast !== fallbackId) {
        try {
          const alt = await runWith(primary, fast);
          if (!needsMoreContent(alt, minLen)) return alt;
          if (alt.trim()) out = alt;
        } catch {
          /* continue */
        }
      }
    }

    if (needsMoreContent(out, minLen) && secondary) {
      try {
        out = await runWith(secondary, secondaryModel);
      } catch {
        /* try Cloudflare */
      }
    }

    if (needsMoreContent(out, minLen)) {
      const cf = await cloudflareWorkersAiChat(params);
      if (cf !== null && cf.trim()) {
        if (!needsMoreContent(cf, minLen)) return cf;
        out = cf;
      }
    }
    return out;
  };

  try {
    const first = await runWith(primary, modelPrimary);
    return await improveContent(first);
  } catch (err) {
    if (!isRetryableWithFallback(err)) throw err;

    if (fallbackId && fallbackId !== modelPrimary) {
      try {
        const fb = await runWith(primary, fallbackId);
        return await improveContent(fb);
      } catch (e2) {
        if (!isRetryableWithFallback(e2) && !secondary) throw e2;
      }
    }

    if (secondary) {
      try {
        return await runWith(secondary, secondaryModel);
      } catch (e3) {
        const cf = await cloudflareWorkersAiChat(params);
        if (cf !== null && cf.trim()) return cf;
        throw e3;
      }
    }

    const cf = await cloudflareWorkersAiChat(params);
    if (cf !== null && cf.trim()) return cf;

    // Last resort: same provider, alternate models (fast / chat / structured defaults) — reduces single-model failures.
    for (const mid of recoveryModelIds(modelPrimary, fallbackId)) {
      try {
        const recovered = await runWith(primary, mid);
        return await improveContent(recovered);
      } catch {
        /* try next */
      }
    }

    throw err;
  }
}
