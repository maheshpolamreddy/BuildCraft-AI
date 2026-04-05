/**
 * Shared server logic for architecture analysis + build prompts (used by API routes
 * and the combined orchestrate-plan endpoint for deployment reliability).
 */

import { getNimClient, NIM_KEY_ERROR } from "@/lib/nim-client";
import { orchestrateChatCompletion } from "@/lib/ai-orchestrator";
import {
  MAX_TOKENS_ANALYZE_PHASE1,
  MAX_TOKENS_ANALYZE_PHASE2,
  MAX_TOKENS_ANALYZE_MERGED,
  MAX_PROJECT_DESCRIPTION_CHARS,
  MAX_TOKENS_GENERATE_PROMPTS,
} from "@/lib/ai-limits";

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

function extractJsonObject(raw: string): string {
  const cleaned = raw.replace(/^```[\w]*\n?/gm, "").replace(/\n?```$/gm, "").trim();
  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error("No JSON object found in model response");
  }
  return cleaned.slice(jsonStart, jsonEnd + 1);
}

function clipDescription(text: string): string {
  if (text.length <= MAX_PROJECT_DESCRIPTION_CHARS) return text;
  return `${text.slice(0, MAX_PROJECT_DESCRIPTION_CHARS)}\n\n[Note: description was truncated for processing.]`;
}

async function runAnalyzeProjectMerged(projectName: string, projectIdea: string): Promise<ProjectAnalysis> {
  const name = projectName.trim() || "My App";
  const idea = projectIdea.trim();
  const description = clipDescription(idea || `A modern web application called ${name}`);

  const userMsg = `Project name: "${name}"
Description: ${description}

Return ONE JSON object with overview, tools, and risks as specified.`;

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

  return {
    overview: parsed.overview,
    tools: parsed.tools,
    risks: parsed.risks,
  };
}

/** Legacy two-call path — used when \`AI_ANALYZE_TWO_PHASE=1\` or merged parse fails. */
async function runAnalyzeProjectTwoPhase(projectName: string, projectIdea: string): Promise<ProjectAnalysis> {
  const name = projectName.trim() || "My App";
  const idea = projectIdea.trim();
  const description = clipDescription(idea || `A modern web application called ${name}`);

  const userMsgPhase1 = `Project name: "${name}"
Description: ${description}

Produce the overview JSON only (summary + architecture layers).`;

  const raw1 = await orchestrateChatCompletion(
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

  let phase1: { overview: ProjectAnalysis["overview"] };
  try {
    phase1 = JSON.parse(extractJsonObject(raw1)) as { overview: ProjectAnalysis["overview"] };
  } catch {
    throw new Error("Analysis step 1 returned invalid JSON. Please try again.");
  }
  if (!phase1.overview?.summary || !Array.isArray(phase1.overview.architecture)) {
    throw new Error("Analysis step 1 missing required fields. Please try again.");
  }

  const userMsgPhase2 = `Project name: "${name}"
Description: ${description}

Architecture from step 1 (do not contradict; extend with tools and risks):
${JSON.stringify(phase1.overview, null, 2)}

Produce ONLY the tools and risks JSON.`;

  const raw2 = await orchestrateChatCompletion(
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

  let phase2: { tools: AiTool[]; risks: AiRisk[] };
  try {
    phase2 = JSON.parse(extractJsonObject(raw2)) as { tools: AiTool[]; risks: AiRisk[] };
  } catch {
    throw new Error("Analysis step 2 returned invalid JSON. Please try again.");
  }

  return {
    overview: phase1.overview,
    tools: Array.isArray(phase2.tools) ? phase2.tools : [],
    risks: Array.isArray(phase2.risks) ? phase2.risks : [],
  };
}

export async function runAnalyzeProjectCore(projectName: string, projectIdea: string): Promise<ProjectAnalysis> {
  if (!getNimClient()) {
    throw new Error(NIM_KEY_ERROR);
  }

  if (process.env.AI_ANALYZE_TWO_PHASE?.trim() === "1") {
    return runAnalyzeProjectTwoPhase(projectName, projectIdea);
  }

  try {
    return await runAnalyzeProjectMerged(projectName, projectIdea);
  } catch (e) {
    console.warn("[plan-orchestration] merged analyze failed, using two-phase fallback:", e);
    return runAnalyzeProjectTwoPhase(projectName, projectIdea);
  }
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

  const name = projectName.trim() || "My App";
  const idea = projectIdea.trim();
  const toolStack = Array.isArray(tools) ? tools.join(", ") : tools || "Next.js, Supabase, Tailwind CSS, TypeScript";

  const userMsg = `Project name: "${name}"
Description: ${idea || `A web application called ${name}`}
Tech stack context: ${toolStack}

Return ONE JSON object with "blueprint" and "prompts" (6 items) as specified.`;

  const raw = (
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

  let root: { blueprint?: Partial<ProjectBlueprint>; prompts?: unknown[] };
  try {
    root = JSON.parse(extractJsonObject(raw)) as typeof root;
  } catch {
    throw new Error("AI returned unexpected format. Please try again.");
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

  return { prompts: validated, blueprint };
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
