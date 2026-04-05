import OpenAI from "openai";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";

/**
 * Per-request timeout (ms) for the OpenAI-compatible client.
 * Local default ~270s; on Vercel (without VERCEL_AI_FULL_CHAIN) defaults to 8s to avoid 504s — override with AI_UPSTREAM_TIMEOUT_MS.
 */
/**
 * OpenRouter requires a real site URL in HTTP-Referer. On Vercel, NEXT_PUBLIC_APP_URL is often unset
 * in Production — VERCEL_URL is always set (e.g. project-xxx.vercel.app) so we use https://VERCEL_URL.
 */
function openRouterHttpReferer(): string {
  const explicit = process.env.OPENROUTER_HTTP_REFERER?.trim();
  if (explicit) return explicit;
  const app = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (app) return app.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//i, "");
    return `https://${host}`;
  }
  return "http://localhost:3000";
}

/**
 * On Vercel (unless VERCEL_AI_FULL_CHAIN=1), default upstream timeout stays below route maxDuration
 * (see vercel.json / route `maxDuration`). Older 8s default caused SDK aborts while the model was still
 * generating — surfaced as "timed out". Override with AI_UPSTREAM_TIMEOUT_MS. Hobby plans still cap
 * execution at ~10s at the platform; use a fast model or VERCEL_AI_FULL_CHAIN on Pro+ for heavy tasks.
 */
function getDefaultUpstreamTimeoutMs(): number {
  const fromEnv = Number(process.env.AI_UPSTREAM_TIMEOUT_MS);
  if (Number.isFinite(fromEnv) && fromEnv >= 4_000) {
    return Math.min(285_000, fromEnv);
  }
  if (process.env.VERCEL === "1" && process.env.VERCEL_AI_FULL_CHAIN !== "1") {
    return 52_000;
  }
  return Math.min(285_000, Math.max(45_000, 270_000));
}

function openAiMaxRetries(): number {
  if (process.env.VERCEL === "1" && process.env.VERCEL_AI_FULL_CHAIN !== "1") {
    const n = Number(process.env.AI_OPENAI_MAX_RETRIES);
    if (Number.isFinite(n) && n >= 0 && n <= 4) return Math.floor(n);
    return 0;
  }
  const n = Number(process.env.AI_OPENAI_MAX_RETRIES);
  if (Number.isFinite(n) && n >= 0 && n <= 4) return Math.floor(n);
  return 2;
}

type OpenAIClientOpts = {
  /** Override default AI_UPSTREAM_TIMEOUT_MS (e.g. Stitch must finish before Vercel ~60s). */
  timeoutMs?: number;
  maxRetries?: number;
};

function makeOpenAIClient(
  apiKey: string,
  baseURL: string,
  defaultHeaders?: Record<string, string>,
  opts?: OpenAIClientOpts,
): OpenAI {
  const timeout = opts?.timeoutMs ?? getDefaultUpstreamTimeoutMs();
  const maxRetries = opts?.maxRetries ?? openAiMaxRetries();
  return new OpenAI({
    apiKey,
    baseURL,
    timeout,
    maxRetries,
    defaultHeaders,
  });
}

/**
 * Primary LLM client (OpenAI-compatible API). Resolution order:
 * 1. `AI_PRIMARY_API_URL` + `AI_PRIMARY_API_KEY` (any provider)
 * 2. `OPENROUTER_API_KEY` (checked before NVIDIA so orchestration can prefer OpenRouter)
 * 3. `NVIDIA_API_KEY` (NVIDIA NIM)
 * 4. `DEEPSEEK_API_KEY`
 */
function makeNimClientFromEnv(opts?: OpenAIClientOpts): OpenAI | null {
  const url = process.env.AI_PRIMARY_API_URL?.trim().replace(/\/$/, "");
  const key = process.env.AI_PRIMARY_API_KEY?.trim();
  if (url && key) {
    return makeOpenAIClient(key, url, undefined, opts);
  }

  const openRouter = process.env.OPENROUTER_API_KEY?.trim();
  if (openRouter) {
    return makeOpenAIClient(
      openRouter,
      OPENROUTER_BASE_URL,
      {
        "HTTP-Referer": openRouterHttpReferer(),
        "X-Title": "BuildCraft",
      },
      opts,
    );
  }

  const nvidia = process.env.NVIDIA_API_KEY?.trim();
  if (nvidia) {
    return makeOpenAIClient(nvidia, NVIDIA_BASE_URL, undefined, opts);
  }

  const deepseek = process.env.DEEPSEEK_API_KEY?.trim();
  if (deepseek) {
    return makeOpenAIClient(deepseek, DEEPSEEK_BASE_URL, undefined, opts);
  }

  return null;
}

export function getNimClient(): OpenAI | null {
  return makeNimClientFromEnv();
}

/**
 * Stitch landing: short upstream timeout + no SDK retries so the route returns JSON before
 * Vercel Hobby kills the invocation (~60s) with an empty 504.
 */
export function getNimClientForStitch(): OpenAI | null {
  const raw = Number(process.env.STITCH_UPSTREAM_TIMEOUT_MS);
  const t = Number.isFinite(raw) && raw >= 20_000 && raw <= 58_000 ? raw : 52_000;
  return makeNimClientFromEnv({ timeoutMs: t, maxRetries: 0 });
}

/**
 * Short-timeout primary client for Vercel compact AI chain (avoids 504 when Hobby ~10s cap applies).
 */
export function getNimClientForServerlessCompact(timeoutMs: number, maxRetries = 0): OpenAI | null {
  const t = Number.isFinite(timeoutMs) && timeoutMs >= 4_000 && timeoutMs <= 30_000 ? timeoutMs : 9_000;
  return makeNimClientFromEnv({ timeoutMs: t, maxRetries });
}

/**
 * Optional secondary provider (different base URL + key) for orchestration fallbacks.
 * Set `AI_SECONDARY_API_URL` + `AI_SECONDARY_API_KEY` (server-side only).
 */
export function getSecondaryNimClient(): OpenAI | null {
  const url = process.env.AI_SECONDARY_API_URL?.trim().replace(/\/$/, "");
  const key = process.env.AI_SECONDARY_API_KEY?.trim();
  if (!url || !key) return null;
  return makeOpenAIClient(key, url, undefined);
}

/** Shown to users when AI routes cannot run — no vendor or model names. */
export const NIM_KEY_ERROR =
  "AI features are not configured on this deployment. Add the same API keys you use locally to Vercel → Project → Settings → Environment Variables (Production), then redeploy. For local dev, use .env.local.";

function inferDefaultChatModel(): string {
  if (process.env.AI_MODEL_ID?.trim()) {
    return process.env.AI_MODEL_ID.trim();
  }
  if (process.env.OPENROUTER_API_KEY?.trim()) {
    return "openai/gpt-4o-mini";
  }
  if (process.env.NVIDIA_API_KEY?.trim()) {
    return "meta/llama-3.3-70b-instruct";
  }
  if (process.env.DEEPSEEK_API_KEY?.trim()) {
    return "deepseek-chat";
  }
  return "meta/llama-3.3-70b-instruct";
}

/**
 * Chat completion model id (OpenAI-compatible).
 * Set `AI_MODEL_ID` explicitly; otherwise defaults depend on which provider is configured.
 */
export function getAiChatModelId(): string {
  return process.env.AI_MODEL_ID?.trim() || inferDefaultChatModel();
}

/** Optional alternate model on the same primary endpoint (orchestrator uses on failure / empty output). */
export function getAiFallbackModelId(): string | undefined {
  const id = process.env.AI_FALLBACK_MODEL_ID?.trim();
  return id || undefined;
}

/**
 * Lower-latency model for routing, validation, and lightweight JSON tasks.
 * Defaults to primary model if `AI_FAST_MODEL_ID` is unset.
 */
export function getAiFastModelId(): string {
  return process.env.AI_FAST_MODEL_ID?.trim() || getAiChatModelId();
}

/** Model id when calling the secondary API (defaults to primary-style id if unset). */
export function getSecondaryChatModelId(): string {
  return process.env.AI_SECONDARY_MODEL_ID?.trim() || getAiChatModelId();
}

/** Model for Stitch landing only (fast; OpenRouter default: gpt-4o-mini). Override via AI_STITCH_MODEL_ID. */
export function getStitchModelId(): string {
  const stitch = process.env.AI_STITCH_MODEL_ID?.trim();
  if (stitch) return stitch;
  const fast = process.env.AI_FAST_MODEL_ID?.trim();
  if (fast) return fast;
  if (process.env.OPENROUTER_API_KEY?.trim()) return "openai/gpt-4o-mini";
  return getAiFastModelId();
}

/**
 * Task-specific models (OpenAI-compatible ids) — use different models per workload for speed vs quality.
 * All fall back to sensible defaults so a single `AI_MODEL_ID` still works.
 *
 * - `AI_MODEL_ARCHITECTURE_ID` — deep architecture JSON (layers, tools, risks). Defaults to primary chat model.
 * - `AI_MODEL_PROMPTS_ID` — long blueprint + 6 build prompts. Defaults to primary chat model.
 * - `AI_MODEL_STRUCTURED_JSON_ID` — milestones, PRD, analyze JSON, etc. Defaults to fast model (lower latency).
 * - `AI_MODEL_CODE_ID` — React/HTML component generation. Defaults to primary chat model.
 */
export function getAiArchitectureModelId(): string {
  return process.env.AI_MODEL_ARCHITECTURE_ID?.trim() || getAiChatModelId();
}

export function getAiPromptGenerationModelId(): string {
  return process.env.AI_MODEL_PROMPTS_ID?.trim() || getAiChatModelId();
}

export function getAiStructuredJsonModelId(): string {
  return process.env.AI_MODEL_STRUCTURED_JSON_ID?.trim() || getAiFastModelId();
}

export function getAiCodeGenerationModelId(): string {
  return process.env.AI_MODEL_CODE_ID?.trim() || getAiChatModelId();
}
