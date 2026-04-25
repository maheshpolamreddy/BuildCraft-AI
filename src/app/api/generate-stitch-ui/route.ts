import { NextRequest } from "next/server";
import { readJsonBody } from "@/lib/read-json-body";
import { MAX_STITCH_IDEA_CHARS, MAX_TOKENS_GENERATE_STITCH_UI } from "@/lib/ai-limits";
import {
  buildFallbackStitchBodyContent,
  buildStitchSystemPrompt,
  buildStitchUserPrompt,
  deriveStitchVariant,
  finalizeStitchHtml,
} from "@/lib/stitch-landing-html";
import { completeChatMultiModel } from "@/lib/multi-model-completion";
import { hasAnyUiGenerationProvider } from "@/lib/ai-provider-registry";
import { isCompactServerlessAiChain } from "@/lib/vercel-ai";
import { aiSuccessJson } from "@/lib/ai-response-envelope";

/** Vercel Hobby caps serverless execution at ~60s; higher values only apply on Pro+. */
export const maxDuration = 60;

// ── Project-type colour palettes ─────────────────────────────────────────────
const PALETTES = {
  saas: { p: "#6366f1", p2: "#8b5cf6", glow: "99,102,241", name: "Indigo / Violet" },
  health: { p: "#10b981", p2: "#06b6d4", glow: "16,185,129", name: "Emerald / Cyan" },
  finance: { p: "#3b82f6", p2: "#0ea5e9", glow: "59,130,246", name: "Blue / Sky" },
  creative: { p: "#f43f5e", p2: "#f97316", glow: "244,63,94", name: "Rose / Orange" },
  ai: { p: "#06b6d4", p2: "#6366f1", glow: "6,182,212", name: "Cyan / Indigo" },
  education: { p: "#7c3aed", p2: "#2563eb", glow: "124,58,237", name: "Violet / Blue" },
  security: { p: "#0ea5e9", p2: "#475569", glow: "14,165,233", name: "Sky / Slate" },
  commerce: { p: "#f59e0b", p2: "#ef4444", glow: "245,158,11", name: "Amber / Red" },
  social: { p: "#ec4899", p2: "#a855f7", glow: "236,72,153", name: "Pink / Purple" },
  developer: { p: "#22c55e", p2: "#06b6d4", glow: "34,197,94", name: "Green / Cyan" },
};

function detectPalette(name: string, idea: string) {
  const t = (name + " " + idea).toLowerCase();
  if (/health|medical|wellness|fitness|care|clinic|hospital/.test(t)) return PALETTES.health;
  if (/financ|money|bank|payment|invest|fund|crypto|wallet|budget/.test(t)) return PALETTES.finance;
  if (/creat|design|art|photo|media|studio|visual|portfolio/.test(t)) return PALETTES.creative;
  if (/\bai\b|machine.learn|intelligence|bot|nlp|gpt|llm|model|predict/.test(t)) return PALETTES.ai;
  if (/educat|learn|course|school|teach|tutor|train|quiz|certif/.test(t)) return PALETTES.education;
  if (/secur|enterprise|compliance|audit|govern|protect|cyber/.test(t)) return PALETTES.security;
  if (/shop|store|ecommerce|market|sell|product|retail|order/.test(t)) return PALETTES.commerce;
  if (/social|community|connect|chat|friend|network|share|forum/.test(t)) return PALETTES.social;
  if (/developer|devtool|api|sdk|cli|code|deploy|devops|open.source/.test(t)) return PALETTES.developer;
  return PALETTES.saas;
}

function clipIdeaForStitch(idea: string, name: string): string {
  const base = idea.trim() || `A modern web application called ${name}`;
  if (base.length <= MAX_STITCH_IDEA_CHARS) return base;
  return `${base.slice(0, MAX_STITCH_IDEA_CHARS)}\n\n[Description truncated.]`;
}

export async function POST(req: NextRequest) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const b = parsed.body as Record<string, unknown>;
  const name = (typeof b.projectName === "string" ? b.projectName : "My App").trim();
  const ideaRaw = (typeof b.projectIdea === "string" ? b.projectIdea : "").trim();
  const idea = clipIdeaForStitch(ideaRaw, name);
  const palette = detectPalette(name, ideaRaw);

  const visualVariant = deriveStitchVariant(name + ideaRaw.slice(0, 80));
  const userPrompt = buildStitchUserPrompt(name, idea, palette, visualVariant);

  try {
    if (!hasAnyUiGenerationProvider()) {
      const raw = buildFallbackStitchBodyContent(name, ideaRaw);
      const htmlFb = finalizeStitchHtml(name, raw, palette, visualVariant);
      return aiSuccessJson(
        {
          html: htmlFb || `<!DOCTYPE html><html><body style="background:#09090b;color:#fff;font-family:system-ui;padding:24px">Stitch UI</body></html>`,
          palette: palette.name,
          visualVariant,
          orchestration: { provider: "fallback" as const },
        },
        "fallback",
      );
    }

    const compact = isCompactServerlessAiChain();
    const { text: raw, provider } = await completeChatMultiModel(
      [
        { role: "system", content: buildStitchSystemPrompt(palette, visualVariant) },
        { role: "user", content: userPrompt },
      ],
      {
        max_tokens: compact ? 1_200 : MAX_TOKENS_GENERATE_STITCH_UI,
        temperature: 0.4,
        stitchPrimaryModel: true,
        useStitchPrimaryClient: true,
        maxGeminiMs: compact ? 7_000 : 32_000,
      },
    );

    const html = finalizeStitchHtml(name, raw, palette, visualVariant);
    if (!html) {
      const rawFb = buildFallbackStitchBodyContent(name, ideaRaw);
      const h = finalizeStitchHtml(name, rawFb, palette, visualVariant);
      return aiSuccessJson(
        {
          html: h || `<!DOCTYPE html><html><body style="background:#09090b">Ready</body></html>`,
          palette: palette.name,
          visualVariant,
          orchestration: { provider: "fallback" as const },
        },
        "fallback",
      );
    }

    return aiSuccessJson(
      {
        html,
        palette: palette.name,
        visualVariant,
        orchestration: { provider },
      },
      "ai",
    );
  } catch (err) {
    console.error("[generate-stitch-ui]", err);
    if (err instanceof Error && err.message === "NO_AI_CLIENT") {
      const raw = buildFallbackStitchBodyContent(name, ideaRaw);
      const html = finalizeStitchHtml(name, raw, palette, visualVariant);
      if (html) {
        return aiSuccessJson(
          {
            html,
            palette: palette.name,
            visualVariant,
            orchestration: { provider: "fallback" as const },
          },
          "fallback",
        );
      }
    }
    const rawFallback = buildFallbackStitchBodyContent(name, ideaRaw);
    const htmlFallback = finalizeStitchHtml(name, rawFallback, palette, visualVariant);
    return aiSuccessJson(
      {
        html: htmlFallback || `<!DOCTYPE html><html><body style="background:#09090b">Ready</body></html>`,
        palette: palette.name,
        visualVariant,
        orchestration: { provider: "fallback" as const },
      },
      "fallback",
    );
  }
}
