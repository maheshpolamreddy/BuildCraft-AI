/**
 * Optional last-resort completion via Cloudflare Workers AI REST API
 * (not OpenAI-SDK compatible — uses account id in the URL).
 */

import type OpenAI from "openai";

type ChatParams = Omit<Parameters<OpenAI["chat"]["completions"]["create"]>[0], "model" | "stream"> & {
  stream?: false;
};

export function getCloudflareWorkersAiConfig(): { accountId: string; token: string; model: string } | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_AI_API_TOKEN?.trim();
  const model =
    process.env.CLOUDFLARE_AI_MODEL?.trim() || "@cf/meta/llama-3.1-8b-instruct";
  if (!accountId || !token) return null;
  return { accountId, token, model };
}

/** Returns null if not configured or request fails (caller may ignore). */
export async function cloudflareWorkersAiChat(params: ChatParams): Promise<string | null> {
  const cfg = getCloudflareWorkersAiConfig();
  if (!cfg) return null;

  // Model id includes slashes (e.g. @cf/meta/llama-3.1-8b-instruct); must stay as path segments — not full encodeURIComponent.
  const url = `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/ai/run/${cfg.model}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: params.messages,
        max_tokens: params.max_tokens,
        temperature: params.temperature,
        top_p: params.top_p,
      }),
    });

    const data = (await res.json()) as {
      success?: boolean;
      errors?: { message?: string }[];
      result?: { response?: string } | string;
    };

    if (!res.ok) {
      const msg = data.errors?.[0]?.message ?? `HTTP ${res.status}`;
      console.error("[cloudflare-workers-ai]", msg);
      return null;
    }

    const r = data.result;
    if (typeof r === "string") return r;
    if (r && typeof r === "object" && typeof r.response === "string") return r.response;
    return null;
  } catch (e) {
    console.error("[cloudflare-workers-ai]", e);
    return null;
  }
}
