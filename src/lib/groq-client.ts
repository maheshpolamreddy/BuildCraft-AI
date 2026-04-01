import OpenAI from "openai";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

function groqTimeoutMs(): number {
  const raw = Number(process.env.GROQ_UPSTREAM_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw >= 15_000 && raw <= 120_000) return Math.floor(raw);
  return 90_000;
}

/**
 * Groq OpenAI-compatible client (fast fallback for UI JSON and Stitch HTML).
 */
export function getGroqClient(): OpenAI | null {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return null;
  return new OpenAI({
    apiKey: key,
    baseURL: GROQ_BASE_URL,
    timeout: groqTimeoutMs(),
    maxRetries: 1,
  });
}

export function getGroqModelId(): string {
  return process.env.GROQ_MODEL_ID?.trim() || "llama-3.3-70b-versatile";
}
