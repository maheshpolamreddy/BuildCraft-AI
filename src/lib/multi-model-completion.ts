/**
 * Multi-model orchestration: Gemini → Groq → primary OpenAI-compatible → secondary → Hugging Face → Cloudflare.
 * On Vercel (unless VERCEL_AI_FULL_CHAIN=1), uses a compact chain to avoid 504 Gateway Timeouts.
 */

import OpenAI from "openai";
import { geminiGenerateText, getGeminiApiKey } from "@/lib/gemini-generate";
import { getGroqClient, getGroqModelId } from "@/lib/groq-client";
import {
  getNimClient,
  getNimClientForStitch,
  getNimClientForServerlessCompact,
  getSecondaryNimClient,
  getAiChatModelId,
  getSecondaryChatModelId,
  getStitchModelId,
} from "@/lib/nim-client";
import { runChatWithRetry } from "@/lib/ai-retry";
import { huggingfaceGenerateText } from "@/lib/huggingface-generate";
import { cloudflareWorkersAiChat } from "@/lib/cloudflare-workers-ai";
import {
  compactChainBudgetMs,
  compactGeminiMaxMs,
  compactOpenAiTimeoutMs,
  useCompactServerlessAiChain,
} from "@/lib/vercel-ai";

export type ChatMessage = { role: "system" | "user"; content: string };

export type MultiModelCompletionResult = {
  text: string;
  provider: "gemini" | "groq" | "primary" | "secondary" | "huggingface" | "cloudflare";
};

function splitSystemUser(messages: ChatMessage[]): { system: string; user: string } {
  const sys: string[] = [];
  const usr: string[] = [];
  for (const m of messages) {
    if (m.role === "system") sys.push(m.content);
    else usr.push(m.content);
  }
  return { system: sys.join("\n\n").trim() || "You are a helpful assistant.", user: usr.join("\n\n").trim() };
}

function toOpenAiMessages(messages: ChatMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

type ChatCreateParamsNoModel = Omit<Parameters<OpenAI["chat"]["completions"]["create"]>[0], "model" | "stream"> & {
  stream?: false;
};

async function tryPrimary(client: OpenAI, model: string, params: ChatCreateParamsNoModel): Promise<string> {
  return (await runChatWithRetry(client, { ...params, stream: false, model })).trim();
}

async function tryOpenAiOnce(client: OpenAI, model: string, params: ChatCreateParamsNoModel): Promise<string> {
  const c = await client.chat.completions.create({ ...params, stream: false, model });
  return (c.choices[0]?.message?.content ?? "").trim();
}

async function tryGemini(
  messages: ChatMessage[],
  maxMs: number | undefined,
  compactOutput?: boolean,
): Promise<string | null> {
  if (!getGeminiApiKey()) return null;
  const { system, user } = splitSystemUser(messages);
  const gen = geminiGenerateText(system, user, compactOutput ? { maxOutputTokens: 2_048 } : undefined);
  if (!maxMs) {
    try {
      const t = await gen;
      return t.trim() || null;
    } catch {
      return null;
    }
  }
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), maxMs));
  try {
    const out = await Promise.race([
      gen
        .then((t) => t.trim() || null)
        .catch(() => null),
      timeout,
    ]);
    return out;
  } catch {
    return null;
  }
}

export type CompleteChatMultiModelOpts = {
  max_tokens: number;
  temperature: number;
  /** Use stitch-tuned model id when calling the OpenAI-compatible primary. */
  stitchPrimaryModel?: boolean;
  /** Use short-timeout primary client (Stitch landing / Vercel ~60s budget). */
  useStitchPrimaryClient?: boolean;
  /** Cap Gemini wait (ms); full-chain only — compact mode uses a fixed short cap. */
  maxGeminiMs?: number;
};

/**
 * Fast path for Vercel: Groq → primary (short timeout, no SDK retry) → Gemini (capped) → HF → Cloudflare.
 * Uses a shared wall-clock budget aligned with `maxDuration` / VERCEL_AI_COMPACT_BUDGET_MS.
 */
async function completeChatMultiModelCompact(
  messages: ChatMessage[],
  opts: CompleteChatMultiModelOpts,
): Promise<MultiModelCompletionResult> {
  const budget = compactChainBudgetMs();
  const started = Date.now();
  const maxTok = Math.min(opts.max_tokens, 2_800);

  const openAiParams: ChatCreateParamsNoModel = {
    messages: toOpenAiMessages(messages),
    temperature: opts.temperature,
    max_tokens: maxTok,
    stream: false,
  };

  const msLeft = () => Math.max(0, budget - (Date.now() - started));
  const slot = () => Math.max(2_000, Math.min(compactOpenAiTimeoutMs(), msLeft() - 250));

  const groq = getGroqClient({ timeoutMs: slot(), maxRetries: 0 });
  if (groq && msLeft() > 1_200) {
    try {
      const text = await tryOpenAiOnce(groq, getGroqModelId(), openAiParams);
      if (text) return { text, provider: "groq" };
    } catch {
      /* next */
    }
  }

  const primaryCompact = getNimClientForServerlessCompact(slot(), 0);
  const primaryModel = opts.stitchPrimaryModel ? getStitchModelId() : getAiChatModelId();
  if (primaryCompact && msLeft() > 1_200) {
    try {
      const text = await tryOpenAiOnce(primaryCompact, primaryModel, openAiParams);
      if (text) return { text, provider: "primary" };
    } catch {
      /* next */
    }
  }

  const gemCap = Math.min(compactGeminiMaxMs(), Math.max(1_800, msLeft() - 400));
  if (msLeft() > 900) {
    const geminiText = await tryGemini(messages, gemCap, true);
    if (geminiText) return { text: geminiText, provider: "gemini" };
  }

  const { system, user } = splitSystemUser(messages);
  const hfPrompt = `### System\n${system}\n\n### User\n${user}\n\n### Assistant\n`;
  const hfCap = Math.max(8_000, Math.min(45_000, msLeft() - 500));
  if (msLeft() > 2_500) {
    const hfRace = huggingfaceGenerateText(hfPrompt, Math.min(maxTok, 2_048));
    const hf = await Promise.race([
      hfRace,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), hfCap)),
    ]);
    if (hf?.trim()) return { text: hf.trim(), provider: "huggingface" };
  }

  if (msLeft() > 1_200) {
    const cf = await cloudflareWorkersAiChat(openAiParams);
    if (cf !== null && cf.trim()) return { text: cf.trim(), provider: "cloudflare" };
  }

  throw new Error("NO_AI_CLIENT");
}

/**
 * Full fallback chain. Throws if no provider returns non-empty text.
 */
export async function completeChatMultiModel(
  messages: ChatMessage[],
  opts: CompleteChatMultiModelOpts,
): Promise<MultiModelCompletionResult> {
  if (useCompactServerlessAiChain()) {
    return completeChatMultiModelCompact(messages, opts);
  }

  const openAiParams: ChatCreateParamsNoModel = {
    messages: toOpenAiMessages(messages),
    temperature: opts.temperature,
    max_tokens: opts.max_tokens,
    stream: false,
  };

  const geminiText = await tryGemini(messages, opts.maxGeminiMs, false);
  if (geminiText) return { text: geminiText, provider: "gemini" };

  const groq = getGroqClient();
  if (groq) {
    try {
      const text = await tryPrimary(groq, getGroqModelId(), openAiParams);
      if (text) return { text, provider: "groq" };
    } catch {
      /* continue */
    }
  }

  const primary = opts.useStitchPrimaryClient ? getNimClientForStitch() : getNimClient();
  const primaryModel = opts.stitchPrimaryModel ? getStitchModelId() : getAiChatModelId();
  if (primary) {
    try {
      const text = await tryPrimary(primary, primaryModel, openAiParams);
      if (text) return { text, provider: "primary" };
    } catch {
      /* continue */
    }
  }

  const secondary = getSecondaryNimClient();
  if (secondary) {
    try {
      const text = await tryPrimary(secondary, getSecondaryChatModelId(), openAiParams);
      if (text) return { text, provider: "secondary" };
    } catch {
      /* continue */
    }
  }

  const { system, user } = splitSystemUser(messages);
  const hfPrompt = `### System\n${system}\n\n### User\n${user}\n\n### Assistant\n`;
  const hf = await huggingfaceGenerateText(hfPrompt, opts.max_tokens);
  if (hf?.trim()) return { text: hf.trim(), provider: "huggingface" };

  const cf = await cloudflareWorkersAiChat(openAiParams);
  if (cf !== null && cf.trim()) return { text: cf.trim(), provider: "cloudflare" };

  throw new Error("NO_AI_CLIENT");
}
