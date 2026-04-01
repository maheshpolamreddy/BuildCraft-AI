/**
 * Optional Hugging Face Inference API (text generation) — last resort before templates.
 * Uses classic inference endpoint; prompt is a single string.
 */

export type HuggingFaceConfig = {
  token: string;
  model: string;
};

export function getHuggingFaceConfig(): HuggingFaceConfig | null {
  const token = process.env.HUGGINGFACE_API_TOKEN?.trim();
  const model =
    process.env.HUGGINGFACE_MODEL_ID?.trim() ||
    "mistralai/Mistral-7B-Instruct-v0.2";
  if (!token) return null;
  return { token, model };
}

function hfTimeoutMs(): number {
  const raw = Number(process.env.HUGGINGFACE_UPSTREAM_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw >= 20_000 && raw <= 120_000) return Math.floor(raw);
  return 60_000;
}

/**
 * Sends a single prompt string; returns generated continuation (model-dependent).
 */
export async function huggingfaceGenerateText(fullPrompt: string, maxNewTokens: number): Promise<string | null> {
  const cfg = getHuggingFaceConfig();
  if (!cfg) return null;

  const url = `https://api-inference.huggingface.co/models/${encodeURIComponent(cfg.model)}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), hfTimeoutMs());

  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: fullPrompt,
        parameters: {
          max_new_tokens: Math.min(4096, Math.max(256, maxNewTokens)),
          return_full_text: false,
        },
      }),
    });

    if (!res.ok) {
      console.error("[huggingface]", res.status, await res.text().catch(() => ""));
      return null;
    }

    const data = (await res.json()) as unknown;
    if (Array.isArray(data) && data[0] && typeof data[0] === "object") {
      const g = (data[0] as { generated_text?: string }).generated_text;
      if (typeof g === "string" && g.trim()) return g;
    }
    if (typeof data === "object" && data !== null && "generated_text" in data) {
      const g = (data as { generated_text?: string }).generated_text;
      if (typeof g === "string" && g.trim()) return g;
    }
    return null;
  } catch (e) {
    console.error("[huggingface]", e);
    return null;
  } finally {
    clearTimeout(t);
  }
}
