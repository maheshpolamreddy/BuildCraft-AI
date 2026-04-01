/**
 * Centralized AI Orchestration Layer (“Orchestration Brain”):
 * task-based model selection, resilient retries, and fallback to alternate models / providers.
 */

import type OpenAI from "openai";
import {
  getNimClient,
  getSecondaryNimClient,
  getAiChatModelId,
  getAiFallbackModelId,
  getAiFastModelId,
  getSecondaryChatModelId,
  getStitchModelId,
} from "@/lib/nim-client";
import { isRetryableWithFallback, runChatWithRetry } from "@/lib/ai-retry";
import { cloudflareWorkersAiChat } from "@/lib/cloudflare-workers-ai";

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

function resolvePrimaryModel(task: OrchestrationTask): string {
  switch (task) {
    case "matching":
    case "validation":
      return getAiFastModelId();
    case "stitch_landing":
      return getStitchModelId();
    default:
      return getAiChatModelId();
  }
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

  const runWith = (client: OpenAI, model: string) =>
    runChatWithRetry(client, { ...params, stream: false, model });

  if (opts?.primaryOnly) {
    const c = await primary.chat.completions.create({
      ...params,
      stream: false,
      model: modelPrimary,
    });
    return (c.choices[0]?.message?.content ?? "").trim();
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

    throw err;
  }
}
