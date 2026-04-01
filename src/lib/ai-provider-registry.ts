/**
 * Whether any LLM path is configured for UI / landing generation
 * (Gemini, Groq, OpenAI-compatible primary/secondary, Hugging Face, or Cloudflare Workers AI).
 */

import { getCloudflareWorkersAiConfig } from "@/lib/cloudflare-workers-ai";
import { getNimClient, getSecondaryNimClient } from "@/lib/nim-client";
import { getGroqClient } from "@/lib/groq-client";
import { getGeminiApiKey } from "@/lib/gemini-generate";
import { getHuggingFaceConfig } from "@/lib/huggingface-generate";

/** Shown when no provider keys are set (no vendor names required in UI). */
export const AI_ORCHESTRATION_CONFIG_ERROR =
  "AI features are not configured on this deployment. Add at least one of: GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY (or AI_PRIMARY_*), NVIDIA_API_KEY, DEEPSEEK_API_KEY, AI_SECONDARY_*, HUGGINGFACE_API_TOKEN, or Cloudflare Workers AI env vars — in Vercel → Project → Environment Variables (Production), then redeploy. For local dev, use .env.local.";

export function hasAnyUiGenerationProvider(): boolean {
  if (getGeminiApiKey()) return true;
  if (getGroqClient()) return true;
  if (getNimClient()) return true;
  if (getSecondaryNimClient()) return true;
  if (getHuggingFaceConfig()) return true;
  if (getCloudflareWorkersAiConfig()) return true;
  return false;
}
