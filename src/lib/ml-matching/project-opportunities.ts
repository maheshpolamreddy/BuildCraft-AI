import {
  augmentIdfForQueryTerms,
  bm25Score,
  buildBm25Corpus,
  jaccardTokenBags,
  minMaxNorm,
  tokenBag,
  tokenize,
} from "./bm25";

export type OpportunityTemplate = {
  id: string;
  title: string;
  description: string;
  category: string;
  techStack: string[];
  budget: string;
  duration: string;
  postedBy: string;
  urgency: "urgent" | "normal" | "flexible";
  remote: boolean;
  keywords: string[];
};

const W_T = {
  bm25: 0.42,
  jaccard: 0.3,
  experienceFit: 0.18,
  preferredTypes: 0.1,
} as const;

function templateDocument(t: OpportunityTemplate): string {
  return [t.title, t.description, t.category, ...t.techStack, ...t.keywords].join(" ");
}

function developerQueryText(input: {
  skills: string[];
  tools: string[];
  primaryRole: string;
  preferredTypes: string[];
  yearsExp: number;
}): string {
  return [input.primaryRole, `${input.yearsExp} years`, ...input.skills, ...input.tools, ...input.preferredTypes].join(
    " ",
  );
}

function experienceFit(yearsExp: number, durationWeeks: number): number {
  const senior = yearsExp >= 5;
  const longProject = durationWeeks >= 16;
  if (longProject && senior) return 1;
  if (!longProject && !senior) return 0.95;
  return 0.75;
}

function parseDurationWeeks(duration: string): number {
  const m = duration.match(/(\d+)\s*-\s*(\d+)/);
  if (m) return (Number(m[1]) + Number(m[2])) / 2;
  const one = duration.match(/(\d+)\s*week/i);
  return one ? Number(one[1]) : 8;
}

export const OPPORTUNITY_TEMPLATES: OpportunityTemplate[] = [
  {
    id: "tmpl-saas-analytics",
    title: "Self-serve SaaS analytics dashboard",
    description:
      "Mid-market B2B startup needs a responsive analytics front end with role-based access, charting, and CSV export.",
    category: "SaaS",
    techStack: ["TypeScript", "React", "Next.js", "PostgreSQL", "Tailwind CSS"],
    budget: "$18,000–$32,000",
    duration: "10–14 weeks",
    postedBy: "Northline Analytics",
    urgency: "normal",
    remote: true,
    keywords: ["dashboard", "charts", "RBAC", "SSR", "API routes"],
  },
  {
    id: "tmpl-fintech-payments",
    title: "PCI-scoped payments microservice",
    description:
      "FinTech team modernizing card vault and tokenization flows with audited Node services and observability.",
    category: "FinTech",
    techStack: ["Node.js", "TypeScript", "PostgreSQL", "Redis", "Docker"],
    budget: "$25,000–$45,000",
    duration: "12–18 weeks",
    postedBy: "HarborPay Labs",
    urgency: "urgent",
    remote: true,
    keywords: ["payments", "security", "microservices", "REST", "logging"],
  },
  {
    id: "tmpl-ai-rag",
    title: "Enterprise RAG knowledge portal",
    description:
      "Internal support teams need semantic search over PDF and Confluence with citation-backed answers.",
    category: "AI Tool",
    techStack: ["Python", "FastAPI", "OpenAI", "PostgreSQL", "pgvector"],
    budget: "$30,000–$55,000",
    duration: "14–20 weeks",
    postedBy: "KiteMind AI",
    urgency: "normal",
    remote: true,
    keywords: ["embeddings", "vector", "LLM", "retrieval", "citations"],
  },
  {
    id: "tmpl-health-hipaa",
    title: "HIPAA-aligned patient portal",
    description:
      "Clinic network needs secure messaging, appointments, and EHR integration with audit trails.",
    category: "HealthTech",
    techStack: ["React", "Node.js", "PostgreSQL", "OAuth2", "FHIR"],
    budget: "$35,000–$60,000",
    duration: "16–24 weeks",
    postedBy: "Summit Care Group",
    urgency: "flexible",
    remote: true,
    keywords: ["HIPAA", "healthcare", "integration", "encryption"],
  },
  {
    id: "tmpl-edtech-lms",
    title: "K–12 LMS course builder",
    description:
      "District-wide LMS with assignments, rubrics, and LMS LTI hooks for existing SIS tools.",
    category: "EdTech",
    techStack: ["Next.js", "Supabase", "TypeScript", "Tailwind CSS"],
    budget: "$14,000–$28,000",
    duration: "8–12 weeks",
    postedBy: "BrightPath Schools",
    urgency: "normal",
    remote: true,
    keywords: ["education", "LTI", "assignments", "teachers"],
  },
  {
    id: "tmpl-ecom-headless",
    title: "Headless commerce storefront",
    description:
      "D2C brand replatforming to headless Shopify with edge-cached PDPs and subscription club.",
    category: "E-Commerce",
    techStack: ["Next.js", "Shopify", "GraphQL", "Vercel", "Stripe"],
    budget: "$20,000–$38,000",
    duration: "10–16 weeks",
    postedBy: "Olive & Oak Retail",
    urgency: "normal",
    remote: true,
    keywords: ["ecommerce", "subscriptions", "SSR", "SEO"],
  },
  {
    id: "tmpl-devops-gitops",
    title: "GitOps cluster lifecycle",
    description:
      "Platform team needs Terraform + Argo CD pipelines with policy-as-code for multi-tenant clusters.",
    category: "DevOps",
    techStack: ["Kubernetes", "Terraform", "Argo CD", "GitHub Actions", "Prometheus"],
    budget: "$28,000–$48,000",
    duration: "12–18 weeks",
    postedBy: "GridOps",
    urgency: "urgent",
    remote: true,
    keywords: ["CI/CD", "infrastructure", "monitoring", "helm"],
  },
  {
    id: "tmpl-data-pipeline",
    title: "Batch + streaming ingestion pipeline",
    description:
      "Data team consolidating CRM and product events into Snowflake with dbt models and Airbyte connectors.",
    category: "Data",
    techStack: ["Python", "dbt", "Snowflake", "Airbyte", "Kafka"],
    budget: "$26,000–$44,000",
    duration: "12–20 weeks",
    postedBy: "Riverstone Data",
    urgency: "normal",
    remote: true,
    keywords: ["ETL", "warehouse", "streaming", "SQL"],
  },
  {
    id: "tmpl-mobile-react-native",
    title: "Cross-platform field service app",
    description:
      "Technicians need offline-first mobile workflows with GPS check-ins and photo upload to S3.",
    category: "Social",
    techStack: ["React Native", "TypeScript", "Expo", "AWS", "PostgreSQL"],
    budget: "$22,000–$40,000",
    duration: "12–16 weeks",
    postedBy: "FieldSync",
    urgency: "normal",
    remote: true,
    keywords: ["mobile", "offline", "maps", "iOS", "Android"],
  },
  {
    id: "tmpl-security-sso",
    title: "Organization-wide SSO rollout",
    description:
      "SAML/OIDC bridge for legacy apps with SCIM provisioning and audit dashboards for IT admins.",
    category: "SaaS",
    techStack: ["Node.js", "TypeScript", "Okta", "OpenID Connect", "PostgreSQL"],
    budget: "$18,000–$32,000",
    duration: "8–14 weeks",
    postedBy: "ClearGate Identity",
    urgency: "flexible",
    remote: true,
    keywords: ["SSO", "identity", "SAML", "security"],
  },
  {
    id: "tmpl-iot-edge",
    title: "Industrial sensor edge gateway",
    description:
      "MQTT ingestion at the edge with local buffering, OPC-UA bridges, and cloud telemetry.",
    category: "DevOps",
    techStack: ["Rust", "MQTT", "Docker", "AWS IoT", "Grafana"],
    budget: "$32,000–$52,000",
    duration: "16–22 weeks",
    postedBy: "FoundryLink",
    urgency: "urgent",
    remote: true,
    keywords: ["IoT", "edge", "telemetry", "streaming"],
  },
  {
    id: "tmpl-cms-marketing",
    title: "Marketing site on headless CMS",
    description:
      "Global marketing needs localized pages on Contentful with ISR and experiments via Edge Config.",
    category: "SaaS",
    techStack: ["Next.js", "Contentful", "Vercel", "TypeScript", "Tailwind CSS"],
    budget: "$12,000–$24,000",
    duration: "6–10 weeks",
    postedBy: "Aperture Creative",
    urgency: "normal",
    remote: true,
    keywords: ["CMS", "localization", "ISR", "SEO"],
  },
];

function preferredOverlap(preferredTypes: string[], template: OpportunityTemplate): number {
  if (!preferredTypes.length) return 0.5;
  const hay = [template.category, ...template.keywords, template.title].join(" ").toLowerCase();
  let hits = 0;
  for (const p of preferredTypes) {
    if (hay.includes(p.toLowerCase())) hits++;
  }
  return Math.min(1, hits / preferredTypes.length);
}

export type RankProjectsInput = {
  skills: string[];
  tools: string[];
  primaryRole: string;
  yearsExp: number;
  preferredTypes: string[];
  currentProjectName: string;
  currentProjectIdea: string;
};

export type RankedOpportunity = OpportunityTemplate & {
  matchScore: number;
  matchReasons: string[];
  skillOverlap: string[];
  missingSkills: string[];
};

function skillOverlapTemplate(skillsLower: string[], techStack: string[]): string[] {
  const overlap: string[] = [];
  for (const t of techStack) {
    const tl = t.toLowerCase();
    if (skillsLower.some((s) => s.includes(tl) || tl.includes(s))) overlap.push(t);
  }
  return overlap;
}

function missingSkillsTemplate(skillsLower: string[], techStack: string[]): string[] {
  const miss: string[] = [];
  for (const t of techStack) {
    const tl = t.toLowerCase();
    if (!skillsLower.some((s) => s.includes(tl) || tl.includes(s))) miss.push(t);
  }
  return miss.slice(0, 2);
}

function tooSimilarToCurrent(
  template: OpportunityTemplate,
  currentName: string,
  currentIdea: string,
): boolean {
  const n = currentName.trim().toLowerCase();
  if (!n) return false;
  const blob = `${template.title} ${template.description}`.toLowerCase();
  if (n.length > 4 && blob.includes(n)) return true;
  const idea = currentIdea.trim().toLowerCase();
  if (idea.length < 12) return false;
  const words = idea.split(/\s+/).filter((w) => w.length > 4);
  let hits = 0;
  for (const w of words.slice(0, 8)) {
    if (blob.includes(w)) hits++;
  }
  return hits >= 3;
}

export function rankProjectOpportunities(input: RankProjectsInput): RankedOpportunity[] {
  const qText = developerQueryText(input);
  const queryTokens =
    tokenize(qText).length > 0 ? tokenize(qText) : tokenize("software engineer developer");

  let templates = OPPORTUNITY_TEMPLATES.filter(
    (t) => !tooSimilarToCurrent(t, input.currentProjectName, input.currentProjectIdea),
  );
  if (!templates.length) {
    templates = [...OPPORTUNITY_TEMPLATES];
  }

  const documents = templates.map(templateDocument);
  const corpus = buildBm25Corpus(documents);
  augmentIdfForQueryTerms(corpus, queryTokens);

  const rawBm25 = templates.map((_, i) => bm25Score(queryTokens, i, corpus));
  const bm25Norm = minMaxNorm(rawBm25);
  const queryBags = tokenBag(qText);
  const skillsLower = input.skills.map((s) => s.toLowerCase());

  const scored = templates.map((tpl, i) => {
    const doc = templateDocument(tpl);
    const jac = jaccardTokenBags(queryBags, tokenBag(doc));
    const pref = preferredOverlap(input.preferredTypes, tpl);
    const weeks = parseDurationWeeks(tpl.duration);
    const expF = experienceFit(input.yearsExp, weeks);
    const linear =
      W_T.bm25 * (bm25Norm[i] ?? 0) +
      W_T.jaccard * jac +
      W_T.experienceFit * expF +
      W_T.preferredTypes * pref;
    const s01 = 1 / (1 + Math.exp(-(linear - 0.48) * 7));
    const matchScore = Math.max(0, Math.min(100, Math.round(s01 * 100)));
    const skillOverlap = skillOverlapTemplate(skillsLower, tpl.techStack);
    const missingSkills = missingSkillsTemplate(skillsLower, tpl.techStack);
    const matchReasons = [
      skillOverlap.length
        ? `Your stack overlaps on ${skillOverlap.slice(0, 3).join(", ")}`
        : "Retrieval score aligns your profile text with this opportunity.",
      `BM25 relevance ${Math.round((bm25Norm[i] ?? 0) * 100)}%, Jaccard overlap ${Math.round(jac * 100)}%.`,
      pref >= 0.65
        ? "Matches one of your preferred project types."
        : "Calibrated logistic score ranks this among top fits.",
    ];
    return {
      ...tpl,
      matchScore,
      matchReasons,
      skillOverlap,
      missingSkills,
    };
  });

  scored.sort((a, b) => b.matchScore - a.matchScore);

  const seen = new Set<string>();
  const deduped: RankedOpportunity[] = [];
  for (const p of scored) {
    const fp = [...p.techStack].sort().slice(0, 3).join(",").toLowerCase();
    if (seen.has(fp)) continue;
    seen.add(fp);
    deduped.push(p);
  }

  return deduped.slice(0, 5);
}
