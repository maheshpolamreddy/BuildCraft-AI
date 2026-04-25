import { getNimClient } from "@/lib/nim-client";
import { orchestrateChatCompletion } from "@/lib/ai-orchestrator";
import { savePRD, type PRDMilestone } from "@/lib/prd";
import { setPrdOnRequest } from "@/lib/hireRequests";
import { setAiGenerationFirestore, setRedisAiCache } from "@/lib/ai-generation-cache";
import { MAX_TOKENS_STRUCTURED_JSON_RETRY, MAX_TOKENS_STRUCTURED_JSON_ROUTE } from "@/lib/ai-limits";
import { tryParseJsonObject } from "@/lib/ai-json-helpers";
import { shouldSkipLlmCalls } from "@/lib/ai-global-mode";

export type PrdApiResponse = {
  success: true;
  prdId: string;
  prd: {
    overview: string;
    scope: string;
    features: string[];
    techStack: string[];
    milestones: PRDMilestone[];
    risks: string[];
    id: string;
    version: string;
  };
};

export type PrdBuildArgs = {
  projectName: string;
  idea: string;
  summary: string;
  stack: string[];
  stackSig: string;
  scopeId: string;
  inputHash: string;
  prdCacheKey: [string, string, string, string];
  hireToken: string;
  creatorUid: string;
  developerUid: string;
  projectBrief: string;
  prompt: string;
};

export async function runFullPrdBuild(a: PrdBuildArgs): Promise<PrdApiResponse> {
  const { projectName, stack, scopeId, inputHash, prdCacheKey, hireToken, creatorUid, developerUid, projectBrief, prompt } = a;

  let prdData: Record<string, unknown> | null = null;

  if (getNimClient() && !shouldSkipLlmCalls()) {
    const attemptParse = (raw: string) => {
      const j = tryParseJsonObject(raw);
      return (j && typeof j === "object" ? (j as Record<string, unknown>) : null) ?? null;
    };
    try {
      const raw = await orchestrateChatCompletion("structured_json", {
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: MAX_TOKENS_STRUCTURED_JSON_ROUTE,
      });
      prdData = attemptParse(raw);
      if (!prdData) {
        await new Promise((r) => setTimeout(r, 450));
        const raw2 = await orchestrateChatCompletion("structured_json", {
          messages: [
            {
              role: "user",
              content: `${prompt}\n\nReturn a compact valid JSON only (shorter strings if needed).`,
            },
          ],
          temperature: 0.2,
          max_tokens: MAX_TOKENS_STRUCTURED_JSON_RETRY,
        });
        prdData = attemptParse(raw2);
      }
    } catch {
      prdData = null;
    }
  }

  if (!prdData) {
    prdData = {
      overview: `${projectName} is a modern application built to solve real user problems efficiently.`,
      scope: `Build a full-stack application with user authentication, core business logic, and deployment infrastructure.`,
      features: [
        "User authentication & authorization",
        "Core business logic implementation",
        "Real-time data updates",
        "Responsive UI across all devices",
        "Performance monitoring & logging",
      ],
      techStack: stack.length ? stack : ["Next.js", "TypeScript", "Tailwind CSS", "Firebase"],
      milestones: [
        { phase: "Phase 1", title: "Foundation & Setup", duration: "2 weeks", deliverables: ["Project scaffolding", "Authentication flow", "Database schema"] },
        { phase: "Phase 2", title: "Core Features", duration: "4 weeks", deliverables: ["Primary API routes", "Dashboard UI", "Data models"] },
        { phase: "Phase 3", title: "Testing & Deployment", duration: "2 weeks", deliverables: ["Test coverage", "CI/CD pipeline", "Production launch"] },
      ],
      risks: [
        "Scope creep — keep feature set focused",
        "Third-party API rate limits",
        "Browser compatibility across older devices",
      ],
    };
  }

  const overview = String(prdData.overview ?? "");
  const scope = String(prdData.scope ?? "");
  const features = Array.isArray(prdData.features) ? prdData.features.map((x: unknown) => String(x)) : [];
  const techStackOut = Array.isArray(prdData.techStack) ? (prdData.techStack as unknown[]).map((x) => String(x)) : stack;
  const milestones = Array.isArray(prdData.milestones) ? prdData.milestones : [];
  const risks = Array.isArray(prdData.risks) ? (prdData.risks as unknown[]).map((x) => String(x)) : [];

  const prdId = await savePRD({
    id: "",
    version: "v1.0",
    projectName: String(projectName ?? ""),
    creatorUid: String(creatorUid ?? ""),
    developerUid: String(developerUid ?? ""),
    hireToken,
    projectBrief,
    overview,
    scope,
    features,
    techStack: techStackOut,
    milestones: milestones as PRDMilestone[],
    risks,
  });

  if (hireToken.trim()) {
    await setPrdOnRequest(hireToken, prdId);
  }

  const responseBody: PrdApiResponse = {
    success: true,
    prdId,
    prd: {
      overview,
      scope,
      features,
      techStack: techStackOut,
      milestones: milestones as PRDMilestone[],
      risks,
      id: prdId,
      version: "v1.0",
    },
  };
  await setAiGenerationFirestore(scopeId, "prd", inputHash, responseBody);
  await setRedisAiCache("prd", prdCacheKey, responseBody).catch(() => {});
  return responseBody;
}
