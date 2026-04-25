import type { ProjectAnalysis, GeneratedPromptRow, ProjectBlueprint } from "./plan-orchestration";

export function buildFailsafeProjectAnalysis(projectName: string, projectIdea: string): ProjectAnalysis {
  const name = projectName.trim() || "Your project";
  const idea = projectIdea.trim().slice(0, 400) || "your product goals";
  return {
    overview: {
      summary: `${name}: ${idea} - we are finalizing a tailored architecture. This preview lists standard layers you can refine as you add details.`,
      architecture: [
        {
          icon: "frontend",
          color: "indigo",
          title: "Web client and UI",
          desc: "Responsive interface, component structure, and client-side state aligned to your product flows.",
        },
        {
          icon: "backend",
          color: "purple",
          title: "Application and APIs",
          desc: "Business logic, authenticated routes, and integrations behind a consistent API surface.",
        },
        {
          icon: "database",
          color: "emerald",
          title: "Data layer",
          desc: "Structured storage, migrations, and access patterns sized to your entities and queries.",
        },
        {
          icon: "auth",
          color: "orange",
          title: "Identity and security",
          desc: "Sign-in, sessions or tokens, and least-privilege access for users and services.",
        },
      ],
    },
    tools: [
      { name: "TypeScript + React/Next.js", category: "Frontend", why: "Typed UI and routing that scale with your feature set.", iconLabel: "FE" },
      { name: "API routes or edge handlers", category: "Backend", why: "Keeps product logic close to deployment and observability.", iconLabel: "API" },
      { name: "Postgres-compatible DB", category: "Database", why: "Relational model for core entities and reporting as you grow.", iconLabel: "DB" },
      { name: "Managed auth (OAuth-ready)", category: "Auth", why: "Reduces custom security risk for sign-in and recovery flows.", iconLabel: "Id" },
      { name: "CI + preview deploys", category: "Delivery", why: "Catch regressions before production and speed up review.", iconLabel: "CI" },
      { name: "Structured logging and alerts", category: "Ops", why: "Faster triage when usage or error rates shift.", iconLabel: "Log" },
    ].map((t) => ({ ...t, compliance: undefined, complianceColor: undefined, warning: undefined, skillGap: undefined })),
    risks: [
      { level: "High Risk", color: "red", title: "Scope and integration complexity", body: "Third-party APIs and data flows can slip deadlines if not sequenced early.", fix: "Lock MVP scope, stub integrations, and add contract tests for critical paths." },
      { level: "Medium Risk", color: "yellow", title: "Performance at scale", body: "Hot paths and N+1 queries may surface as usage grows.", fix: "Add caching, indexes, and budgets for heavy endpoints." },
      { level: "Medium Risk", color: "orange", title: "Security posture", body: "Auth and secrets need rotation and review as features ship.", fix: "Use environment secrets, least privilege, and regular dependency updates." },
      { level: "Low Risk", color: "white", title: "Tooling drift", body: "Minor version skew across environments can confuse debugging.", fix: "Pin toolchains in CI and document local setup." },
    ],
  };
}

const FALLBACK_BLUEPRINT: ProjectBlueprint = {
  pages: ["Landing", "Product", "Dashboard", "Settings"],
  features: ["Onboarding", "Core workflows", "Account management"],
  userRoles: ["User", "Admin"],
  dataModels: ["User", "Project", "Settings"],
  primaryAction: "Get started",
  brandTone: "clear and professional",
  colorHint: "indigo",
};

export function buildFailsafePromptPack(projectName: string): {
  prompts: GeneratedPromptRow[];
  blueprint: ProjectBlueprint;
} {
  const n = projectName.trim() || "the product";
  const COLORS = ["indigo", "blue", "emerald", "yellow", "pink", "orange"] as const;
  const titles = [
    "Foundation and design system",
    "Landing and public pages",
    "Authentication and onboarding",
    "Core product features",
    "Dashboard and account",
    "APIs, data, and deployment",
  ];
  const prompts: GeneratedPromptRow[] = titles.map((title, i) => ({
    phase: `Phase ${i + 1}`,
    title,
    icon: "ok",
    color: COLORS[i] ?? "indigo",
    target: "Cursor / AI assistant",
    desc: `Ship ${n} with consistent patterns and tests.`,
    prompt: `Implement ${title} for ${n}: define components, data contracts, and a short test plan. Keep scope shippable in one iteration.`,
  }));
  return { prompts, blueprint: { ...FALLBACK_BLUEPRINT } };
}