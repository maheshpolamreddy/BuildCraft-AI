/**
 * Shared server logic for architecture analysis + build prompts (used by API routes
 * and the combined orchestrate-plan endpoint for deployment reliability).
 */

import { getNimClient, NIM_KEY_ERROR } from "@/lib/nim-client";
import { orchestrateChatCompletion } from "@/lib/ai-orchestrator";
import { normalizeAnalyzeTextInputs } from "@/lib/ai-input-normalize";
import { buildFailsafeProjectAnalysis, buildFailsafePromptPack } from "@/lib/ai-failsafe";
import { recordAiSample } from "@/lib/ai-prod-metrics";
import {
  MAX_TOKENS_ANALYZE_PHASE1,
  MAX_TOKENS_ANALYZE_PHASE2,
  MAX_TOKENS_ANALYZE_MERGED,
  MAX_PROJECT_DESCRIPTION_CHARS,
  MAX_TOKENS_GENERATE_PROMPTS,
} from "@/lib/ai-limits";
import { getCachedOrchestration, setCachedOrchestration, generateCacheKey } from "@/lib/cache";
import { shouldSkipLlmCalls } from "@/lib/ai-global-mode";
import {
  MIN_ANALYSIS_CONFIDENCE,
  MIN_PROMPTS_CONFIDENCE,
  scoreProjectAnalysisQuality,
  scorePromptPackQuality,
} from "@/lib/ai-response-confidence";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function logAiMonitor(event: string, payload: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "test") return;
  try {
    console.log(
      JSON.stringify({ tag: "ai-monitor", ts: new Date().toISOString(), event, ...payload }),
    );
  } catch {
    console.log("[ai-monitor]", event);
  }
}

// ── Analysis types (aligned with /api/analyze-project) ───────────────────────

export interface ArchLayer {
  icon: "frontend" | "backend" | "database" | "ai" | "auth" | "storage" | "realtime" | "payment" | "email";
  color: "blue" | "purple" | "emerald" | "indigo" | "yellow" | "pink" | "orange" | "cyan";
  title: string;
  desc: string;
}

export interface AiTool {
  name: string;
  category: string;
  compliance?: string;
  complianceColor?: "green" | "blue" | "yellow" | "red";
  why: string;
  warning?: string;
  skillGap?: string;
  iconLabel: string;
}

export interface AiRisk {
  level: "High Risk" | "Medium Risk" | "Low Risk";
  color: "red" | "yellow" | "orange" | "white";
  title: string;
  body: string;
  fix: string;
}

export interface ProjectAnalysis {
  overview: {
    summary: string;
    architecture: ArchLayer[];
  };
  tools: AiTool[];
  risks: AiRisk[];
}

const SYSTEM_PHASE1 = `You are a senior software architect. Return ONLY valid JSON — no markdown, no backticks.

Produce ONLY the "overview" section. Be specific to THIS project; concise but not generic.

JSON shape:
{
  "overview": {
    "summary": "3-4 sentences: what the product is, primary users, core workflows, main technical challenge. Name the project.",
    "architecture": [
      {
        "icon": "frontend" | "backend" | "database" | "ai" | "auth" | "storage" | "realtime" | "payment" | "email",
        "color": "blue" | "purple" | "emerald" | "indigo" | "yellow" | "pink" | "orange" | "cyan",
        "title": "Layer title for THIS project",
        "desc": "2 sentences: responsibilities, named technologies, how this layer connects to others."
      }
    ]
  }
}

RULES:
- architecture: exactly 4 or 5 layers, tailored to the domain.
- Each "desc" names real technologies or patterns.
- If the product uses AI/LLM features, include one layer that describes a centralized orchestration layer (routing across models, validation, fallbacks, secure keys) — not generic "AI" fluff; tie it to how THIS app uses models.
- Do not invent company facts beyond the description.`;

const SYSTEM_PHASE2 = `You are a senior software architect. Phase 1 already defined the architecture overview — stay consistent with it.

Return ONLY valid JSON — no markdown, no backticks.

JSON shape:
{
  "tools": [
    {
      "name": "Concrete tool or stack",
      "category": "Short label",
      "compliance": "Optional: SOC 2, GDPR, HIPAA, PCI if relevant",
      "complianceColor": "green" | "blue" | "yellow" | "red" only if compliance is set",
      "why": "2-3 sentences: why it fits THIS project and ties to the architecture",
      "warning": "Optional short constraint",
      "skillGap": "Optional short line",
      "iconLabel": "2 letters or short emoji"
    }
  ],
  "risks": [
    {
      "level": "High Risk" | "Medium Risk" | "Low Risk",
      "color": "red" | "yellow" | "orange" | "white",
      "title": "Specific risk",
      "body": "2 sentences, domain-specific",
      "fix": "1-2 sentences: mitigation"
    }
  ]
}

RULES:
- tools: exactly 6 entries, diverse categories; each "why" references project specifics and the architecture below.
- risks: exactly 4 — one High, one or two Medium, one Low.
- Align with the architecture you were given; no contradictions.`;

/** One model call: overview + tools + risks — ~2× faster than sequential phase1+phase2 on deployment. */
const SYSTEM_ANALYSIS_MERGED = `You are a senior software architect. Return ONLY valid JSON — no markdown, no backticks.

Return ONE object with keys "overview", "tools", and "risks".

Shape:
{
  "overview": {
    "summary": "3-4 sentences: what the product is, primary users, core workflows, main technical challenge. Name the project.",
    "architecture": [
      {
        "icon": "frontend" | "backend" | "database" | "ai" | "auth" | "storage" | "realtime" | "payment" | "email",
        "color": "blue" | "purple" | "emerald" | "indigo" | "yellow" | "pink" | "orange" | "cyan",
        "title": "Layer title for THIS project",
        "desc": "2 sentences: responsibilities, named technologies, how this layer connects to others."
      }
    ]
  },
  "tools": [
    {
      "name": "Concrete tool or stack",
      "category": "Short label",
      "compliance": "Optional: SOC 2, GDPR, HIPAA, PCI if relevant",
      "complianceColor": "green" | "blue" | "yellow" | "red" only if compliance is set",
      "why": "2-3 sentences: why it fits THIS project and ties to the architecture",
      "warning": "Optional short constraint",
      "skillGap": "Optional short line",
      "iconLabel": "2 letters or short emoji"
    }
  ],
  "risks": [
    {
      "level": "High Risk" | "Medium Risk" | "Low Risk",
      "color": "red" | "yellow" | "orange" | "white",
      "title": "Specific risk",
      "body": "2 sentences, domain-specific",
      "fix": "1-2 sentences: mitigation"
    }
  ]
}

RULES:
- overview.architecture: exactly 4 or 5 layers, tailored to the domain; each "desc" names real technologies or patterns.
- If the product uses AI/LLM features, include one layer describing centralized orchestration (routing, validation, fallbacks, keys) tied to THIS app.
- tools: exactly 6 entries, diverse categories; each "why" references project specifics and the architecture.
- risks: exactly 4 — one High, one or two Medium, one Low; consistent with overview.
- Do not invent company facts beyond the description.`;

/**
 * Pulls the first complete `{ ... }` from model output. Uses brace depth + string awareness
 * so `lastIndexOf("}")` never clips early when `}` appears inside string values or multiple objects exist.
 */
function extractJsonObject(raw: string): string {
  const cleaned = raw.replace(/^```[\w]*\n?/gm, "").replace(/\n?```/gm, "").trim();
  const start = cleaned.indexOf("{");
  if (start === -1) {
    throw new Error("No JSON object found in model response");
  }
  let depth = 0;
  let inString = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return cleaned.slice(start, i + 1);
    }
  }
  throw new Error("No complete JSON object found in model response");
}

function clipDescription(text: string): string {
  if (text.length <= MAX_PROJECT_DESCRIPTION_CHARS) return text;
  return `${text.slice(0, MAX_PROJECT_DESCRIPTION_CHARS)}\n\n[Note: description was truncated for processing.]`;
}

async function runAnalyzeProjectMergedOnce(
  projectName: string,
  projectIdea: string,
  extraUserHint = "",
): Promise<ProjectAnalysis> {
  const name = projectName.trim() || "My App";
  const idea = projectIdea.trim();
  const description = clipDescription(idea || `A modern web application called ${name}`);

  const userMsg = `Project name: "${name}"
Description: ${description}

Return ONE JSON object with overview, tools, and risks as specified.${extraUserHint ? `\n\n${extraUserHint}` : ""}`;

  const raw = await orchestrateChatCompletion(
    "architecture_deep",
    {
      messages: [
        { role: "system", content: SYSTEM_ANALYSIS_MERGED },
        { role: "user", content: userMsg },
      ],
      temperature: 0.37,
      max_tokens: MAX_TOKENS_ANALYZE_MERGED,
    },
    { minContentLength: 400 },
  );

  let parsed: ProjectAnalysis;
  try {
    parsed = JSON.parse(extractJsonObject(raw)) as ProjectAnalysis;
  } catch {
    throw new Error("Analysis returned invalid JSON. Please try again.");
  }
  if (!parsed.overview?.summary || !Array.isArray(parsed.overview.architecture)) {
    throw new Error("Analysis missing overview fields. Please try again.");
  }
  if (!Array.isArray(parsed.tools) || !Array.isArray(parsed.risks)) {
    throw new Error("Analysis missing tools or risks. Please try again.");
  }
  if (parsed.tools.length === 0) {
    throw new Error("Analysis returned no tools. Please try again.");
  }

  return {
    overview: parsed.overview,
    tools: parsed.tools,
    risks: parsed.risks,
  };
}

/** Retries: parse/validation failures, and one low-confidence reprompt. */
async function runAnalyzeProjectMerged(projectName: string, projectIdea: string): Promise<ProjectAnalysis> {
  let last: unknown;
  let lowConfRetry = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      await sleep(650);
      logAiMonitor("analyze_merged_retry", { attempt: attempt + 1, lowConfRetry });
    }
    try {
      const hint =
        lowConfRetry
          ? "The previous pass looked incomplete or generic. Tighten every field: use concrete product-specific detail, no placeholders."
          : "";
      const result = await runAnalyzeProjectMergedOnce(projectName, projectIdea, hint);
      const conf = scoreProjectAnalysisQuality(result);
      if (conf >= MIN_ANALYSIS_CONFIDENCE || attempt === 1) {
        if (lowConfRetry) {
          logAiMonitor("analyze_merged_confidence_ok", { conf });
        }
        return result;
      }
      if (attempt === 0) {
        logAiMonitor("analyze_merged_low_confidence", { conf });
        lowConfRetry = true;
        continue;
      }
      return result;
    } catch (e) {
      last = e;
      const msg = e instanceof Error ? e.message : "";
      const retryable =
        /invalid JSON|missing overview|missing tools|No JSON|No complete JSON|Please try again/i.test(msg);
      if (attempt === 0 && retryable) continue;
      throw e;
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

/** Legacy two-call path — used when \`AI_ANALYZE_TWO_PHASE=1\` or merged parse fails. */
async function runAnalyzeProjectTwoPhase(projectName: string, projectIdea: string): Promise<ProjectAnalysis> {
  const name = projectName.trim() || "My App";
  const idea = projectIdea.trim();
  const description = clipDescription(idea || `A modern web application called ${name}`);

  const userMsgPhase1 = `Project name: "${name}"
Description: ${description}

Produce the overview JSON only (summary + architecture layers).`;

  let raw1 = await orchestrateChatCompletion(
    "architecture_deep",
    {
      messages: [
        { role: "system", content: SYSTEM_PHASE1 },
        { role: "user", content: userMsgPhase1 },
      ],
      temperature: 0.37,
      max_tokens: MAX_TOKENS_ANALYZE_PHASE1,
    },
    { minContentLength: 80 },
  );

  let phase1: { overview: ProjectAnalysis["overview"] } | null = null;
  let phase1Ok = false;
  try {
    phase1 = JSON.parse(extractJsonObject(raw1)) as { overview: ProjectAnalysis["overview"] };
    phase1Ok = true;
  } catch {
    /* retry once */
  }
  if (!phase1Ok) {
    logAiMonitor("analyze_phase1_retry", {});
    await sleep(600);
    raw1 = await orchestrateChatCompletion(
      "architecture_deep",
      {
        messages: [
          { role: "system", content: SYSTEM_PHASE1 },
          { role: "user", content: userMsgPhase1 },
        ],
        temperature: 0.35,
        max_tokens: MAX_TOKENS_ANALYZE_PHASE1,
      },
      { minContentLength: 80 },
    );
    try {
      phase1 = JSON.parse(extractJsonObject(raw1)) as { overview: ProjectAnalysis["overview"] };
    } catch {
      throw new Error("ANALYSIS_PHASE_JSON");
    }
  }
  if (!phase1 || !phase1.overview?.summary || !Array.isArray(phase1.overview.architecture)) {
    throw new Error("Analysis step 1 missing required fields. Please try again.");
  }

  const userMsgPhase2 = `Project name: "${name}"
Description: ${description}

Architecture from step 1 (do not contradict; extend with tools and risks):
${JSON.stringify(phase1.overview, null, 2)}

Produce ONLY the tools and risks JSON.`;

  let raw2 = await orchestrateChatCompletion(
    "architecture_deep",
    {
      messages: [
        { role: "system", content: SYSTEM_PHASE2 },
        { role: "user", content: userMsgPhase2 },
      ],
      temperature: 0.38,
      max_tokens: MAX_TOKENS_ANALYZE_PHASE2,
    },
    { minContentLength: 120 },
  );

  let phase2: { tools: AiTool[]; risks: AiRisk[] } | null = null;
  let phase2Ok = false;
  try {
    phase2 = JSON.parse(extractJsonObject(raw2)) as { tools: AiTool[]; risks: AiRisk[] };
    phase2Ok = true;
  } catch {
    /* retry once */
  }
  if (!phase2Ok) {
    logAiMonitor("analyze_phase2_retry", {});
    await sleep(600);
    raw2 = await orchestrateChatCompletion(
      "architecture_deep",
      {
        messages: [
          { role: "system", content: SYSTEM_PHASE2 },
          { role: "user", content: userMsgPhase2 },
        ],
        temperature: 0.36,
        max_tokens: MAX_TOKENS_ANALYZE_PHASE2,
      },
      { minContentLength: 120 },
    );
    try {
      phase2 = JSON.parse(extractJsonObject(raw2)) as { tools: AiTool[]; risks: AiRisk[] };
    } catch {
      throw new Error("ANALYSIS_PHASE_JSON");
    }
  }
  if (!phase2) {
    throw new Error("ANALYSIS_PHASE_JSON");
  }

  const tools = Array.isArray(phase2.tools) ? phase2.tools : [];
  const risks = Array.isArray(phase2.risks) ? phase2.risks : [];
  if (tools.length === 0) {
    throw new Error("Analysis step 2 returned no tools. Please try again.");
  }

  return {
    overview: phase1.overview,
    tools,
    risks,
  };
}

export async function runAnalyzeProjectCore(projectName: string, projectIdea: string): Promise<ProjectAnalysis> {
  if (!getNimClient()) {
    throw new Error(NIM_KEY_ERROR);
  }

  const { name, idea } = normalizeAnalyzeTextInputs(projectName, projectIdea);
  const cacheKey = await generateCacheKey("analysis", name, idea);
  const cached = await getCachedOrchestration<ProjectAnalysis>(cacheKey);
  if (cached) {
    console.log("[cache] Hit for analyze project:", cacheKey);
    return cached;
  }

  if (shouldSkipLlmCalls()) {
    logAiMonitor("analyze_safe_mode_static", { name });
    const fb = buildFailsafeProjectAnalysis(name, idea);
    await setCachedOrchestration(cacheKey, fb, 45 * 24 * 60 * 60);
    recordAiSample(true, "analyze_safe_failsafe");
    return fb;
  }

  let result: ProjectAnalysis;
  try {
    if (process.env.AI_ANALYZE_TWO_PHASE?.trim() === "1") {
      result = await runAnalyzeProjectTwoPhase(name, idea);
    } else {
      try {
        result = await runAnalyzeProjectMerged(name, idea);
      } catch (e) {
        console.warn("[plan-orchestration] merged analyze failed, using two-phase fallback:", e);
        result = await runAnalyzeProjectTwoPhase(name, idea);
      }
    }
  } catch (e) {
    if (e instanceof Error && (e.message === NIM_KEY_ERROR || e.message === "NO_AI_CLIENT")) {
      throw e;
    }
    recordAiSample(false, "analyze_fail");
    const fb = buildFailsafeProjectAnalysis(name, idea);
    await setCachedOrchestration(cacheKey, fb, 45 * 24 * 60 * 60);
    return fb;
  }

  recordAiSample(true, "analyze");
  const cacheTtl = 45 * 24 * 60 * 60;
  await setCachedOrchestration(cacheKey, result, cacheTtl);
  return result;
}

// ── Prompts ─────────────────────────────────────────────────────────────────

export interface GeneratedPromptRow {
  phase: string;
  title: string;
  icon: string;
  color: string;
  target: string;
  desc: string;
  prompt: string;
}

export interface ProjectBlueprint {
  pages: string[];
  features: string[];
  userRoles: string[];
  dataModels: string[];
  primaryAction: string;
  brandTone: string;
  colorHint: string;
}

const DEFAULT_BLUEPRINT: ProjectBlueprint = {
  pages: ["Landing Page", "Dashboard", "Profile", "Settings"],
  features: ["User authentication", "Core functionality", "Settings management"],
  userRoles: ["User", "Admin"],
  dataModels: ["User", "Profile", "Settings"],
  primaryAction: "Get started",
  brandTone: "professional",
  colorHint: "indigo",
};

const COMBINED_SYSTEM = `You are a senior product manager and full-stack developer.

Return ONLY valid JSON — no markdown, no text outside the JSON — ONE object with exactly two keys: "blueprint" and "prompts".

Shape:
{
  "blueprint": {
    "pages": ["page names this website needs"],
    "features": ["specific features"],
    "userRoles": ["user types"],
    "dataModels": ["main entities"],
    "primaryAction": "most important user action",
    "brandTone": "one adjective",
    "colorHint": "one word colour direction"
  },
  "prompts": [
    {
      "phase": "string",
      "title": "string",
      "icon": "emoji or short string",
      "color": "indigo" | "blue" | "emerald" | "yellow" | "pink" | "orange",
      "target": "Cursor" | "Cursor / AI assistant" | "AI assistant" | "Cursor / Supabase" | "Vercel / GitHub Actions",
      "desc": "short description",
      "prompt": "build brief: 120-200 words each — dense and actionable, not verbose"
    }
  ]
}

RULES:
1. blueprint: infer only from the project text; do not invent unrelated pages.
2. prompts: EXACTLY 6 objects. Assign "color" in order: indigo, blue, emerald, yellow, pink, orange.
3. The 6 prompts must cover, in order:
   (1) Foundation & Design System
   (2) Landing Page & Public Pages
   (3) Authentication & User Onboarding
   (4) Core Feature Pages (unique to this product)
   (5) Dashboard & User Account
   (6) Backend, API & Deployment
4. Each "prompt" field: bullet-style clarity, named components, stack hints — prioritize signal over length.
5. USE THE PROJECT NAME in every prompt body.`;

function normalizeBlueprint(p: Partial<ProjectBlueprint> | undefined): ProjectBlueprint {
  if (!p || typeof p !== "object") return { ...DEFAULT_BLUEPRINT };
  return {
    pages: Array.isArray(p.pages) ? p.pages : DEFAULT_BLUEPRINT.pages,
    features: Array.isArray(p.features) ? p.features : DEFAULT_BLUEPRINT.features,
    userRoles: Array.isArray(p.userRoles) ? p.userRoles : DEFAULT_BLUEPRINT.userRoles,
    dataModels: Array.isArray(p.dataModels) ? p.dataModels : DEFAULT_BLUEPRINT.dataModels,
    primaryAction: typeof p.primaryAction === "string" ? p.primaryAction : DEFAULT_BLUEPRINT.primaryAction,
    brandTone: typeof p.brandTone === "string" ? p.brandTone : DEFAULT_BLUEPRINT.brandTone,
    colorHint: typeof p.colorHint === "string" ? p.colorHint : DEFAULT_BLUEPRINT.colorHint,
  };
}

export async function runGeneratePromptsCore(
  projectName: string,
  projectIdea: string,
  tools: string[] | string,
): Promise<{ prompts: GeneratedPromptRow[]; blueprint: ProjectBlueprint }> {
  if (!getNimClient()) {
    throw new Error(NIM_KEY_ERROR);
  }

  const defaultStack = "Next.js, Supabase, Tailwind CSS, TypeScript";
  const toolStack = Array.isArray(tools)
    ? tools.length > 0
      ? tools.join(", ")
      : defaultStack
    : typeof tools === "string" && tools.trim()
      ? tools
      : defaultStack;

  const { name, idea: rawIdea } = normalizeAnalyzeTextInputs(projectName, projectIdea);
  const idea = clipDescription(rawIdea);

  const cacheKey = await generateCacheKey("prompts", name, idea, toolStack);
  const cached = await getCachedOrchestration<{ prompts: GeneratedPromptRow[]; blueprint: ProjectBlueprint }>(cacheKey);
  if (cached) {
    console.log("[cache] Hit for generate prompts:", cacheKey);
    return cached;
  }

  if (shouldSkipLlmCalls()) {
    const fb = buildFailsafePromptPack(name);
    await setCachedOrchestration(cacheKey, fb, 45 * 24 * 60 * 60);
    recordAiSample(true, "prompts_safe_failsafe");
    return fb;
  }

  try {
    const userMsg = `Project name: "${name}"
Description: ${idea || `A web application called ${name}`}
Tech stack context: ${toolStack}

Return ONE JSON object with "blueprint" and "prompts" (6 items) as specified.`;

    let raw = (
      await orchestrateChatCompletion(
        "prompt_generation",
        {
          messages: [
            { role: "system", content: COMBINED_SYSTEM },
            { role: "user", content: userMsg },
          ],
          temperature: 0.4,
          max_tokens: MAX_TOKENS_GENERATE_PROMPTS,
        },
        { minContentLength: 200 },
      )
    ).trim();

    type RootShape = { blueprint?: Partial<ProjectBlueprint>; prompts?: unknown[] };
    let root: RootShape | null = null;
    let parseOk = false;
    try {
      root = JSON.parse(extractJsonObject(raw)) as RootShape;
      parseOk = true;
    } catch {
      /* one retry */
    }
    if (!parseOk) {
      logAiMonitor("generate_prompts_parse_retry", {});
      await sleep(550);
      raw = (
        await orchestrateChatCompletion(
          "prompt_generation",
          {
            messages: [
              { role: "system", content: COMBINED_SYSTEM },
              { role: "user", content: userMsg },
            ],
            temperature: 0.38,
            max_tokens: MAX_TOKENS_GENERATE_PROMPTS,
          },
          { minContentLength: 200 },
        )
      ).trim();
      try {
        root = JSON.parse(extractJsonObject(raw)) as RootShape;
      } catch {
        throw new Error("PROMPTS_JSON_RETRY_FAIL");
      }
    }
    if (!root) {
      throw new Error("PROMPTS_JSON_RETRY_FAIL");
    }

    const blueprint = normalizeBlueprint(root.blueprint);
    const promptsRaw = root.prompts;
    if (!Array.isArray(promptsRaw) || promptsRaw.length === 0) {
      throw new Error("AI returned an empty response. Please try again.");
    }

    const COLORS = ["indigo", "blue", "emerald", "yellow", "pink", "orange"];
    const validated = (promptsRaw as Record<string, unknown>[]).slice(0, 6).map((p, i) => ({
      phase: String(p.phase ?? `Step ${i + 1}`),
      title: String(p.title ?? ""),
      icon: String(p.icon ?? "⚡"),
      color: COLORS[i],
      target: String(p.target ?? "Cursor / AI assistant"),
      desc: String(p.desc ?? ""),
      prompt: String(p.prompt ?? ""),
    }));

    const draftData = { prompts: validated, blueprint };
    if (scorePromptPackQuality(draftData) < MIN_PROMPTS_CONFIDENCE) {
      logAiMonitor("generate_prompts_low_confidence", {});
      await sleep(500);
      let raw2 = "";
      try {
        raw2 = (
          await orchestrateChatCompletion(
            "prompt_generation",
            {
              messages: [
                { role: "system", content: COMBINED_SYSTEM },
                {
                  role: "user",
                  content: `${userMsg}\n\nThe previous plan was too thin. Strengthen: longer prompt bodies, concrete file names, and 6 full phases.`,
                },
              ],
              temperature: 0.35,
              max_tokens: MAX_TOKENS_GENERATE_PROMPTS,
            },
            { minContentLength: 200 },
          )
        ).trim();
        const root2 = JSON.parse(extractJsonObject(raw2)) as RootShape;
        const b2 = normalizeBlueprint(root2?.blueprint);
        const pr2 = root2?.prompts;
        if (Array.isArray(pr2) && pr2.length > 0) {
          const v2 = (pr2 as Record<string, unknown>[]).slice(0, 6).map((p, i) => ({
            phase: String(p.phase ?? `Step ${i + 1}`),
            title: String(p.title ?? ""),
            icon: String(p.icon ?? "⚡"),
            color: COLORS[i],
            target: String(p.target ?? "Cursor / AI assistant"),
            desc: String(p.desc ?? ""),
            prompt: String(p.prompt ?? ""),
          }));
          const finalData2 = { prompts: v2, blueprint: b2 };
          const cacheTtl = 45 * 24 * 60 * 60;
          await setCachedOrchestration(cacheKey, finalData2, cacheTtl);
          recordAiSample(true, "prompts");
          return finalData2;
        }
      } catch {
        /* keep draftData */
      }
    }

    const finalData = { prompts: validated, blueprint };
    const cacheTtl = 45 * 24 * 60 * 60;
    await setCachedOrchestration(cacheKey, finalData, cacheTtl);
    recordAiSample(true, "prompts");
    return finalData;
  } catch (e) {
    if (e instanceof Error && (e.message === NIM_KEY_ERROR || e.message === "NO_AI_CLIENT")) {
      throw e;
    }
    recordAiSample(false, "prompts_fail");
    const fb = buildFailsafePromptPack(name);
    const ttl = 45 * 24 * 60 * 60;
    await setCachedOrchestration(cacheKey, fb, ttl);
    return fb;
  }
}

export async function runFullPlanOrchestration(
  projectName: string,
  projectIdea: string,
): Promise<{
  analysis: ProjectAnalysis;
  prompts: GeneratedPromptRow[];
  blueprint: ProjectBlueprint;
}> {
  const analysis = await runAnalyzeProjectCore(projectName, projectIdea);
  const toolNames = analysis.tools.map((t) => t.name);
  const { prompts, blueprint } = await runGeneratePromptsCore(projectName, projectIdea, toolNames);
  return { analysis, prompts, blueprint };
}
