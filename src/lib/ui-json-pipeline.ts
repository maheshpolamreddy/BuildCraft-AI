/**
 * Multi-model UI JSON pipeline: Gemini → Groq → OpenAI-compatible → HF → Cloudflare,
 * validation + normalization, optional enhancement pass, template fallback.
 */

import type { UIScreenJson } from "@/lib/ui-json-schema";
import {
  UI_COMPONENT_TYPES,
  extractJsonObjectFromModel,
} from "@/lib/ui-json-schema";
import { completeChatMultiModel } from "@/lib/multi-model-completion";
import { normalizeValidateAndFix, normalizeRawJsonToUIScreenShape } from "@/lib/ui-json-normalize";
import { pickTemplateByKeywords, getTemplateByKind } from "@/lib/ui-templates";
import { enhanceUIScreenJson } from "@/lib/ui-quality-enhancer";
import { MAX_TOKENS_GENERATE_UI_JSON } from "@/lib/ai-limits";
import { LANDING_SECTION_TYPES } from "@/lib/ui-json-normalize";
import { isCompactServerlessAiChain } from "@/lib/vercel-ai";

export const SYSTEM_UI_JSON = `You are a senior product designer for BuildCraft. Convert the user's request into structured UI JSON only. The UI will render as a premium dark glassmorphism interface with gradients — think Stripe / Vercel / Linear quality.

OUTPUT RULES (strict):
- Return ONLY valid JSON — no markdown fences, no explanation, no text before or after the JSON object.
- Prefer this standard landing shape (sections are normalized server-side):
{
  "page": "Short page title",
  "layout": "landing",
  "sections": [
    { "type": "hero", "headline": "...", "subhead": "...", "primaryCta": "...", "brand": "...", "navLinks": [{ "label": "Product", "href": "#" }] },
    { "type": "features", "title": "...", "items": [{ "title": "...", "desc": "..." }] },
    { "type": "pricing", "title": "...", "tiers": [{ "name": "...", "price": "...", "blurb": "..." }] },
    { "type": "cta", "title": "...", "buttonText": "..." },
    { "type": "footer", "title": "...", "links": ["Privacy", "Terms"] }
  ]
}

Alternatively you may emit the legacy shape (also valid):
{
  "page": "Short page title",
  "layout": "stack" | "grid" | "split" | "landing" (optional),
  "components": [ ... ]
}

SECTION TYPES (for "sections"): ${LANDING_SECTION_TYPES.join(", ")}

COMPONENT TYPES (for "components" — use only these "type" values): ${UI_COMPONENT_TYPES.map((t) => `"${t}"`).join(", ")}

Per-type fields (components):
- input: label?, placeholder?, name?, inputType? ("text"|"email"|"password"|"number"|"tel"|"url")
- button: text (required), action? ("submit"|"button"|"reset"), variant? ("primary"|"outline"|"ghost")
- card: title?, content?, children? (nested components)
- navbar: title?, logo?, links? ([{ "label", "href" }])
- list: items (required) — strings OR { "title", "desc"? }
- form: title?, children?

QUALITY BAR (CRITICAL):
- Strong Visual Hierarchy: Use clear headings, varied font weights, and ample whitespace (the renderer handles the glass effect).
- Premium Microcopy: Avoid generic text. Use compelling, benefit-driven headlines and clear CTAs.
- Component Density: Aim for 6–14 high-quality components/sections for a professional feel.
- Nested Layouts: Use cards, grids, and split layouts to organize information logically.
- Contextual Relevance: Tailor every piece of text to the project name and idea provided.`;

export function buildUserMessageUiJson(prompt: string, projectName: string, projectIdea: string): string {
  return `User request (UI to generate):\n${prompt.trim()}\n\nProject name: ${projectName}\nContext: ${projectIdea.slice(0, 2_000)}`;
}

export type UiJsonPipelineMeta = {
  provider: string;
  enhanced: boolean;
  enhancementProvider?: string;
  templateFallback?: "saas" | "startup" | "portfolio";
};

export async function runUiJsonPipeline(input: {
  prompt: string;
  projectName: string;
  projectIdea: string;
}): Promise<{ ui: UIScreenJson; meta: UiJsonPipelineMeta }> {
  const userMsg = buildUserMessageUiJson(input.prompt, input.projectName, input.projectIdea);
  const compact = isCompactServerlessAiChain();
  const maxTokUi = compact ? 1_200 : MAX_TOKENS_GENERATE_UI_JSON;

  const genOnce = async (): Promise<{ text: string; provider: string }> => {
    return completeChatMultiModel(
      [
        { role: "system", content: compact ? `${SYSTEM_UI_JSON}\n\nCONCISE MODE: Return a high-impact but minimal JSON. Limit to 4-7 primary sections/components to ensure fast response.` : SYSTEM_UI_JSON },
        { role: "user", content: userMsg },
      ],
      { max_tokens: maxTokUi, temperature: 0.25 },
    );
  };

  let provider = "unknown";
  let rawText: string;

  try {
    const first = await genOnce();
    rawText = first.text;
    provider = first.provider;
  } catch (err) {
    if (err instanceof Error && err.message === "NO_AI_CLIENT") {
      const kind = pickTemplateByKeywords(input.projectName, input.projectIdea);
      const ui = getTemplateByKind(kind, input.projectName);
      return {
        ui,
        meta: {
          provider: "template",
          enhanced: false,
          templateFallback: kind,
        },
      };
    }
    throw err;
  }

  const parseAndValidate = (text: string) => {
    const jsonStr = extractJsonObjectFromModel(text);
    const parsed: unknown = JSON.parse(jsonStr);
    const normalized = normalizeRawJsonToUIScreenShape(parsed);
    return normalizeValidateAndFix(normalized);
  };

  let validated = (() => {
    try {
      return parseAndValidate(rawText);
    } catch {
      return { ok: false as const, errors: ["parse"] };
    }
  })();

  if (!validated.ok) {
    if (compact) {
      validated = { ok: false as const, errors: ["compact_skip_retry"] };
    } else {
      const fixMsg = `Your previous output failed validation. Fix and return ONLY corrected JSON.
Errors:
${"errors" in validated ? validated.errors.join("\n") : "Unparseable JSON"}

Original request:
${userMsg}`;

      try {
        const second = await completeChatMultiModel(
          [
            { role: "system", content: SYSTEM_UI_JSON },
            { role: "user", content: fixMsg },
          ],
          { max_tokens: MAX_TOKENS_GENERATE_UI_JSON, temperature: 0.2 },
        );
        rawText = second.text;
        provider = second.provider;
        try {
          validated = parseAndValidate(rawText);
        } catch {
          validated = { ok: false as const, errors: ["parse"] };
        }
      } catch {
        validated = { ok: false as const, errors: ["retry_failed"] };
      }
    }
  }

  if (!validated.ok) {
    const kind = pickTemplateByKeywords(input.projectName, input.projectIdea);
    const ui = getTemplateByKind(kind, input.projectName);
    return {
      ui,
      meta: {
        provider: "template",
        enhanced: false,
        templateFallback: kind,
      },
    };
  }

  let ui: UIScreenJson = validated.data;
  const { ui: enhancedUi, provider: enhancementProvider } = await enhanceUIScreenJson(
    ui,
    userMsg,
  );
  ui = enhancedUi;

  return {
    ui,
    meta: {
      provider,
      enhanced: enhancementProvider !== undefined,
      enhancementProvider,
    },
  };
}
