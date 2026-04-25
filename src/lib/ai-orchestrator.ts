/**
 * Centralized AI Orchestration:
 * - Adaptive mode: normal / low_cost (budget + smaller max_tokens) / safe (skip LLM, callers use cache or failsafes)
 * - Layer 1: runChatWithRetry (smaller max_tokens on 402) → Layer 2: AI_FALLBACK_MODEL_ID / fast tier
 *   → Layer 3: secondary provider / Cloudflare → Layer 4: recovery model list
 * - Routes must check Redis/Firestore before calling here; plan-orchestration enforces cache-first for heavy flows
 */

import type OpenAI from "openai";
import type { ChatCompletion } from "openai/resources/chat/completions";
import {
  getNimClient,
  getSecondaryNimClient,
  getAiChatModelId,
  getAiFallbackModelId,
  getAiBudgetModelId,
  getAiFastModelId,
  getSecondaryChatModelId,
  getStitchModelId,
  getAiArchitectureModelId,
  getAiPromptGenerationModelId,
  getAiStructuredJsonModelId,
  getAiCodeGenerationModelId,
} from "@/lib/nim-client";
import { clampMaxOutputTokens, estimateTokensFromMessages } from "@/lib/ai-limits";
import {
  getAdaptiveAiMode,
  getAdaptiveModeTokenScale,
  logAdaptiveModeIfChanged,
  makeSafeModeSkipError,
  shouldSkipLlmCalls,
  trackAdaptiveAfterOrchestration,
} from "@/lib/ai-global-mode";
import {
  type ChatMsgLike,
  assertSafeContextOrThrow,
  normalizeOpenAiChatParams,
  trimMessagesForContext,
} from "@/lib/ai-input-normalize";
import {
  isLowCostModeActive,
  lowCostMaxTokenFactor,
  recordAiCompletionOutcome,
  shouldPreferBudgetModelPath,
} from "@/lib/ai-cost-guard";
import { recordAiSample, shouldAutoSafeMode } from "@/lib/ai-prod-metrics";
import {
  isRetryableWithFallback,
  runChatWithRetry,
  completionMaxTokensRetrySequence,
  isPaymentOrQuotaError,
} from "@/lib/ai-retry";
import { cloudflareWorkersAiChat } from "@/lib/cloudflare-workers-ai";
import { isCompactServerlessAiChain } from "@/lib/vercel-ai";

function logAiTokenBudget(payload: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "test") return;
  try {
    console.log(
      JSON.stringify({ tag: "ai-monitor", ts: new Date().toISOString(), event: "token_budget", ...payload }),
    );
  } catch {
    /* ignore */
  }
}

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
  /**
   * Safe-mode bypass for a minimal liveness probe only (background recovery).
   */
  recoveryProbe?: boolean;
};

type ChatParams = Omit<Parameters<OpenAI["chat"]["completions"]["create"]>[0], "model" | "stream"> & {
  stream?: false;
};

function applyDynamicMaxTokens(params: ChatParams): ChatParams {
  const est = estimateTokensFromMessages(
    (params.messages ?? []) as { role?: string; content?: string | null }[],
  );
  const req0 = typeof params.max_tokens === "number" ? params.max_tokens : 1024;
  const mode = getAdaptiveAiMode();
  let budgetReq = Math.floor(req0 * lowCostMaxTokenFactor() * getAdaptiveModeTokenScale());
  if (shouldAutoSafeMode() && mode !== "safe_mode") {
    budgetReq = Math.max(256, Math.floor(budgetReq * 0.88));
  }
  const max_tokens = clampMaxOutputTokens(est, budgetReq);
  logAdaptiveModeIfChanged();
  logAiTokenBudget({
    inputEst: est,
    requested: req0,
    applied: max_tokens,
    lowCost: isLowCostModeActive(),
    adaptiveMode: mode,
    task: "orchestrate",
  });
  return { ...params, max_tokens };
}

/**
 * Picks the best default model per task: fast models for routing/JSON throughput,
 * primary chat for architecture/code quality, dedicated env overrides per workload.
 */
function resolvePrimaryModel(task: OrchestrationTask): string {
  const budget = getAiBudgetModelId();
  if (budget && getAdaptiveAiMode() === "low_cost") {
    return budget;
  }
  if (budget && shouldPreferBudgetModelPath()) {
    if (task === "architecture_deep" || task === "prompt_generation" || task === "structured_json") {
      return budget;
    }
  }
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
  if (shouldSkipLlmCalls() && !opts?.recoveryProbe) {
    logAdaptiveModeIfChanged();
    throw makeSafeModeSkipError();
  }

  let work: ChatParams = { ...params };
  if (work.messages?.length) {
    const norm = normalizeOpenAiChatParams({ messages: work.messages as ChatMsgLike[] });
    const trimmed = trimMessagesForContext((norm.messages ?? []) as ChatMsgLike[]);
    work = { ...work, messages: trimmed as ChatParams["messages"] };
    try {
      assertSafeContextOrThrow((work.messages ?? []) as ChatMsgLike[]);
    } catch {
      const err = new Error("AI_INPUT_CONTEXT_EXCEEDED");
      recordAiCompletionOutcome(false, err);
      throw err;
    }
  }

  const run = async (): Promise<string> => {
  const modelPrimary = resolvePrimaryModel(task);
  const fallbackId = getAiFallbackModelId();
  const secondary = getSecondaryNimClient();
  const secondaryModel = getSecondaryChatModelId();
  const minLen = opts?.minContentLength;
  const compact = isCompactServerlessAiChain();
  const effectivePrimaryOnly = opts?.primaryOnly || compact;

  const paramsBudgeted = applyDynamicMaxTokens({ ...work });

  const runWith = (client: OpenAI, model: string) =>
    runChatWithRetry(client, { ...paramsBudgeted, stream: false, model });

  if (effectivePrimaryOnly) {
    const runPrimary = async (max_tokens?: number) => {
      const base = { ...paramsBudgeted, model: modelPrimary, stream: false as const };
      const p = max_tokens !== undefined ? { ...base, max_tokens } : base;
      const c = (await primary.chat.completions.create(p)) as ChatCompletion;
      return (c.choices[0]?.message?.content ?? "").trim();
    };
    const requested0 =
      typeof paramsBudgeted.max_tokens === "number" ? paramsBudgeted.max_tokens : 2048;
    try {
      return await runPrimary();
    } catch (err) {
      if (!isPaymentOrQuotaError(err)) throw err;
      for (const cap of completionMaxTokensRetrySequence(requested0)) {
        try {
          return await runPrimary(cap);
        } catch (e2) {
          if (!isPaymentOrQuotaError(e2)) throw e2;
        }
      }
      const budgetId = getAiBudgetModelId();
      if (budgetId && budgetId !== modelPrimary) {
        try {
          logAiTokenBudget({ action: "budget_model", model: budgetId, max: Math.min(1024, requested0) });
          const c = (await primary.chat.completions.create({
            ...paramsBudgeted,
            model: budgetId,
            stream: false,
            max_tokens: Math.min(1024, requested0, paramsBudgeted.max_tokens ?? 1024),
          })) as ChatCompletion;
          return (c.choices[0]?.message?.content ?? "").trim();
        } catch (e3) {
          logAiTokenBudget({ action: "budget_model_error", message: (e3 as Error).message });
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
      const cf = await cloudflareWorkersAiChat(work);
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
        await new Promise((r) => setTimeout(r, 450));
        const fb = await runWith(primary, fallbackId);
        return await improveContent(fb);
      } catch (e2) {
        if (!isRetryableWithFallback(e2) && !secondary) throw e2;
      }
    }

    if (secondary) {
      try {
        await new Promise((r) => setTimeout(r, 450));
        return await runWith(secondary, secondaryModel);
      } catch (e3) {
        const cf = await cloudflareWorkersAiChat(work);
        if (cf !== null && cf.trim()) return cf;
        throw e3;
      }
    }

    const cf = await cloudflareWorkersAiChat(work);
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
  };

  try {
    const text = await run();
    recordAiCompletionOutcome(true);
    trackAdaptiveAfterOrchestration(true, { tag: "orchestrate" });
    return text;
  } catch (e) {
    if ((e as Error).message === "AI_ORCHESTRATION_SKIPPED_SAFE_MODE") {
      throw e;
    }
    if (opts?.recoveryProbe) {
      trackAdaptiveAfterOrchestration(false, { tag: "recovery_probe" });
    } else {
      recordAiCompletionOutcome(false, e);
      recordAiSample(false, "orchestrate_fail");
      trackAdaptiveAfterOrchestration(false, { tag: "orchestrate" });
    }
    throw e;
  }
}
