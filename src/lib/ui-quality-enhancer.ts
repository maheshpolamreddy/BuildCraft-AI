/**
 * Second-pass polish: hierarchy, responsive layout choice, and microcopy — same JSON schema.
 */

import {
  UI_COMPONENT_TYPES,
  extractJsonObjectFromModel,
  type UIScreenJson,
} from "@/lib/ui-json-schema";
import { LANDING_SECTION_TYPES, normalizeValidateAndFix } from "@/lib/ui-json-normalize";
import { completeChatMultiModel } from "@/lib/multi-model-completion";
import { MAX_TOKENS_UI_JSON_ENHANCE } from "@/lib/ai-limits";
import { isCompactServerlessAiChain } from "@/lib/vercel-ai";

const ENHANCE_SYSTEM = `You are a senior product designer. Improve the given UI JSON for a premium dark glassmorphism React preview.

RULES:
- Return ONLY valid JSON — no markdown fences, no commentary.
- Keep the same root shape: "page" (string), "layout" ("stack"|"grid"|"split"|"landing"), "components" (array).
- You may also use "sections" with types: ${LANDING_SECTION_TYPES.join(", ")} — they will be normalized server-side.
- Component "type" must be one of: ${UI_COMPONENT_TYPES.join(", ")}.
- Improve: clearer hierarchy, stronger microcopy, better use of grid/split for responsive layouts, richer cards (6–14 top-level nodes when appropriate), nested children where it helps.
- Do not remove required fields (e.g. list.items, button.text).
- Preserve the product intent from the context.`;

export function isUiJsonEnhanceEnabled(): boolean {
  if (isCompactServerlessAiChain()) return false;
  return process.env.UI_JSON_ENHANCE?.trim() !== "0";
}

export async function enhanceUIScreenJson(
  ui: UIScreenJson,
  context: string,
): Promise<{ ui: UIScreenJson; provider?: string }> {
  if (!isUiJsonEnhanceEnabled()) {
    return { ui };
  }

  try {
    const user = `Context:\n${context.slice(0, 4_000)}\n\nUI JSON to improve:\n${JSON.stringify(ui)}`;
    const { text, provider } = await completeChatMultiModel(
      [
        { role: "system", content: ENHANCE_SYSTEM },
        { role: "user", content: user },
      ],
      { max_tokens: MAX_TOKENS_UI_JSON_ENHANCE, temperature: 0.2 },
    );
    const jsonStr = extractJsonObjectFromModel(text);
    const parsed: unknown = JSON.parse(jsonStr);
    const norm = normalizeValidateAndFix(parsed);
    if (norm.ok) {
      return { ui: norm.data, provider };
    }
  } catch {
    /* keep original */
  }
  return { ui };
}
