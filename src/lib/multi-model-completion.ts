/**
 * Multi-model orchestration: Gemini → Groq → primary OpenAI-compatible → secondary → Hugging Face → Cloudflare.
 * Shared by `/api/generate-ui-json` and `/api/generate-stitch-ui`.
 */

import OpenAI from "openai";
import { geminiGenerateText, getGeminiApiKey } from "@/lib/gemini-generate";
import { getGroqClient, getGroqModelId } from "@/lib/groq-client";
import {
  getNimClient,
  getNimClientForStitch,
  getSecondaryNimClient,
  getAiChatModelId,
  getSecondaryChatModelId,
  getStitchModelId,
} from "@/lib/nim-client";
import { runChatWithRetry } from "@/lib/ai-retry";
import { huggingfaceGenerateText } from "@/lib/huggingface-generate";
import { cloudflareWorkersAiChat } from "@/lib/cloudflare-workers-ai";

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

async function tryGemini(messages: ChatMessage[], maxMs: number | undefined): Promise<string | null> {
  if (!getGeminiApiKey()) return null;
  const { system, user } = splitSystemUser(messages);
  const gen = geminiGenerateText(system, user);
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
  /** Cap Gemini wait (ms); recommended for Stitch route so fallbacks can run. */
  maxGeminiMs?: number;
};

/**
 * Full fallback chain. Throws if no provider returns non-empty text.
 */
export async function completeChatMultiModel(
  messages: ChatMessage[],
  opts: CompleteChatMultiModelOpts,
): Promise<MultiModelCompletionResult> {
  const openAiParams = {
    messages: toOpenAiMessages(messages),
    temperature: opts.temperature,
    max_tokens: opts.max_tokens,
    stream: false as const,
  };

  const geminiText = await tryGemini(messages, opts.maxGeminiMs);
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

  const primary =
    opts.useStitchPrimaryClient ? getNimClientForStitch() : getNimClient();
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
