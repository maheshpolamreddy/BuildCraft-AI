"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck, User, Star, Activity, AlertTriangle, Briefcase,
  FileText, CheckCircle2, Zap, Award, ChevronRight, Clock,
  TrendingUp, Shield, Lock, Edit3, BarChart2, MessageSquare,
  Play, Send, Loader2, Code2, CheckCircle, XCircle, ChevronDown,
  Terminal, GitBranch, Layers, RotateCcw, Eye, Copy, Check, LogOut,
  ArrowRight, Sparkles, Flag, AlertCircle, Info,
} from "lucide-react";
import { useStore } from "@/store/useStore";
import { logAction } from "@/lib/auditLog";
import { parseJsonResponse } from "@/lib/parse-api-json";
import {
  getDeveloperProfile,
  updateDeveloperProfileField,
  isDeveloperRegistrationComplete,
  type DeveloperProfile as DevProfileType,
} from "@/lib/developerProfile";
import { type MatchedProject } from "@/app/api/match-projects/route";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { signOutUser } from "@/lib/auth";
import { auth } from "@/lib/firebase";
import { getHireRequestsByDeveloper, type HireRequest } from "@/lib/hireRequests";
import { getPRDsByUser, type PRDDocument } from "@/lib/prd";
import {
  createOrGetChat,
  sendChatMessage,
  subscribeToChatMessages,
  subscribeToChatRoom,
  chatStorageKey,
  classifyChatBubble,
  updateChatPresence,
  maybeSetOfflinePingForPartner,
  clearOfflinePing,
  type ChatMessage as FireChatMsg,
  type ChatRoom,
} from "@/lib/chat";
import { useFirebaseUid } from "@/hooks/useFirebaseUid";
import { DeveloperFlowBreadcrumb } from "@/components/FlowNavigation";

// ── Types ─────────────────────────────────────────────────────────────────────
type Tab = "projects" | "workspace" | "assessments" | "profile" | "prd" | "chat";
type TaskStatus = "todo" | "in-progress" | "validating" | "review" | "approved" | "rejected";

interface Task {
  id: string;
  title: string;
  description: string;
  type: "frontend" | "backend" | "database" | "auth" | "devops" | "testing";
  estimatedHours: number;
  priority: "high" | "medium" | "low";
  aiPrompt: string;
  status: TaskStatus;
  submission: string;
  validationResult: ValidationResult | null;
  version: number;
  submittedAt?: string;
}

interface Milestone {
  id: string;
  phase: string;
  title: string;
  description: string;
  estimatedDays: number;
  color: string;
  tasks: Task[];
}

interface ValidationResult {
  passed: boolean;
  score: number;
  summary: string;
  checks: { label: string; passed: boolean; note: string }[];
  issues: string[];
  suggestions: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const TYPE_ICON: Record<Task["type"], React.ReactNode> = {
  frontend: <Layers className="w-3.5 h-3.5" />,
  backend:  <Terminal className="w-3.5 h-3.5" />,
  database: <GitBranch className="w-3.5 h-3.5" />,
  auth:     <Shield className="w-3.5 h-3.5" />,
  devops:   <Zap className="w-3.5 h-3.5" />,
  testing:  <CheckCircle2 className="w-3.5 h-3.5" />,
};

const TYPE_COLOR: Record<Task["type"], string> = {
  frontend: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  backend:  "text-purple-400 bg-purple-500/10 border-purple-500/20",
  database: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  auth:     "text-red-400 bg-red-500/10 border-red-500/20",
  devops:   "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  testing:  "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
};

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  "todo":        { label: "To Do",      color: "text-white/40",    bg: "bg-white/5 border-white/10" },
  "in-progress": { label: "In Progress",color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/30" },
  "validating":  { label: "Validating", color: "text-yellow-400",  bg: "bg-yellow-500/10 border-yellow-500/30" },
  "review":      { label: "In Review",  color: "text-purple-400",  bg: "bg-purple-500/10 border-purple-500/30" },
  "approved":    { label: "Approved",   color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" },
  "rejected":    { label: "Rejected",   color: "text-red-400",     bg: "bg-red-500/10 border-red-500/30" },
};

const PRIORITY_COLOR = { high: "text-red-400", medium: "text-yellow-400", low: "text-white/40" };

const MILESTONES_FALLBACK: Milestone[] = [
  {
    id: "m1", phase: "Phase 1", title: "Foundation & Setup", description: "Project scaffolding, auth, and database schema.", estimatedDays: 7, color: "blue",
    tasks: [
      { id: "t1", title: "Initialize Next.js project", description: "Set up Next.js 14+ with TypeScript, Tailwind CSS, and all required dependencies.", type: "devops", estimatedHours: 3, priority: "high", aiPrompt: "You are building the project foundation. Initialize a Next.js 14 App Router project with TypeScript strict mode, Tailwind CSS v3, and ESLint. Create the folder structure: src/app, src/components, src/lib, src/hooks, src/types, src/store. Set up environment variables in .env.local.example with all required keys. Configure tailwind.config.ts with a dark theme (bg: #09090b, accent: indigo-500). Return all config files ready to copy-paste.", status: "todo", submission: "", validationResult: null, version: 1 },
      { id: "t2", title: "Database schema & migrations", description: "Design and create all database tables with RLS policies.", type: "database", estimatedHours: 5, priority: "high", aiPrompt: "You are building the database schema. Write SQL CREATE TABLE statements for all entities with UUID primary keys, created_at/updated_at timestamps, and proper foreign keys. Enable Row Level Security on every table. Write CREATE POLICY statements so users only see their own data. Add indexes on frequently queried columns. Include a trigger to auto-update updated_at.", status: "todo", submission: "", validationResult: null, version: 1 },
      { id: "t3", title: "Authentication flow", description: "Implement sign-up, sign-in, OAuth, and session management.", type: "auth", estimatedHours: 6, priority: "high", aiPrompt: "You are building the authentication system. Implement email+password sign-up and sign-in using Supabase Auth. Add Google OAuth. Create src/middleware.ts to protect routes. Build app/(auth)/sign-in/page.tsx and sign-up/page.tsx with full form validation, error handling, and loading states. After successful auth, create a user profile record in the users table.", status: "todo", submission: "", validationResult: null, version: 1 },
    ],
  },
  {
    id: "m2", phase: "Phase 2", title: "Core Features", description: "Main application features and API routes.", estimatedDays: 14, color: "purple",
    tasks: [
      { id: "t4", title: "Build primary API routes", description: "Create all CRUD API routes with Zod validation and error handling.", type: "backend", estimatedHours: 8, priority: "high", aiPrompt: "You are building the API layer. Create Next.js App Router API routes for all main entities. Each route file handles GET (list with pagination), POST (create with Zod validation), GET by ID, PATCH (update), and DELETE (soft delete). Include proper HTTP status codes, error responses, and auth checks using Supabase server client.", status: "todo", submission: "", validationResult: null, version: 1 },
      { id: "t5", title: "Dashboard UI components", description: "Build the main dashboard layout with stats, tables, and navigation.", type: "frontend", estimatedHours: 10, priority: "high", aiPrompt: "You are building the main dashboard. Create a responsive dashboard page at app/dashboard/page.tsx with: a collapsible sidebar with navigation links and user avatar, a top stats bar with 4 KPI cards showing animated numbers, a data table with sorting and pagination, and a recent activity feed. Use Tailwind CSS dark theme (bg-[#09090b]) with glass morphism panels. Add skeleton loading states.", status: "todo", submission: "", validationResult: null, version: 1 },
      { id: "t6", title: "State management & data fetching", description: "Set up Zustand global state and TanStack Query for server state.", type: "frontend", estimatedHours: 5, priority: "medium", aiPrompt: "You are building the state management layer. Set up Zustand stores in src/store/ for each main feature with typed state and actions. Configure TanStack Query in app/providers.tsx with staleTime and retry settings. Create custom hooks in src/hooks/ for each entity that combine useQuery/useMutation with optimistic updates. Add proper cache invalidation after mutations.", status: "todo", submission: "", validationResult: null, version: 1 },
    ],
  },
  {
    id: "m3", phase: "Phase 3", title: "UI/UX Polish", description: "Animations, responsiveness, accessibility, and performance.", estimatedDays: 7, color: "emerald",
    tasks: [
      { id: "t7", title: "Responsive design & mobile", description: "Ensure all pages work perfectly on mobile, tablet, and desktop.", type: "frontend", estimatedHours: 6, priority: "medium", aiPrompt: "You are fixing responsive design. Audit every page for mobile issues. Fix: navigation (hamburger menu on mobile), grid layouts (stack vertically on <640px), data tables (horizontal scroll on mobile), modals (full-screen on mobile), sidebar (drawer/overlay on mobile). Test all breakpoints: 320px, 768px, 1024px, 1280px.", status: "todo", submission: "", validationResult: null, version: 1 },
      { id: "t8", title: "Animations & transitions", description: "Add Framer Motion animations for page transitions and interactions.", type: "frontend", estimatedHours: 4, priority: "low", aiPrompt: "You are adding animations using Framer Motion. Add: page transitions (fade+slide on route change), list animations (stagger children with 50ms delay), modal animations (scale+fade with AnimatePresence), button press feedback (scale 0.97), card hover (translateY -2px + shadow). Create reusable animation variants in src/lib/animations.ts.", status: "todo", submission: "", validationResult: null, version: 1 },
      { id: "t9", title: "Performance & SEO optimization", description: "Image optimization, code splitting, and meta tags.", type: "devops", estimatedHours: 4, priority: "medium", aiPrompt: "You are optimizing performance. Use next/image for all images with explicit width/height. Add dynamic imports for heavy components. Add loading.tsx and error.tsx for all route segments. Generate metadata in layout.tsx for SEO. Add Open Graph meta tags. Run next build and fix any warnings. Target: 90+ Lighthouse score.", status: "todo", submission: "", validationResult: null, version: 1 },
    ],
  },
  {
    id: "m4", phase: "Phase 4", title: "Testing & Deployment", description: "Tests, CI/CD pipeline, and production launch.", estimatedDays: 7, color: "orange",
    tasks: [
      { id: "t10", title: "Unit & integration tests", description: "Write tests for utilities, API routes, and key components.", type: "testing", estimatedHours: 8, priority: "high", aiPrompt: "You are writing tests. Set up Vitest with React Testing Library. Write unit tests for all utility functions in src/lib/. Write integration tests for all API routes using mock Supabase client. Write component tests for all forms (submit, validation, error states). Achieve >80% code coverage. Run: npm test --coverage.", status: "todo", submission: "", validationResult: null, version: 1 },
      { id: "t11", title: "CI/CD pipeline setup", description: "Configure GitHub Actions for automated testing and deployment.", type: "devops", estimatedHours: 4, priority: "medium", aiPrompt: "You are setting up CI/CD. Create .github/workflows/ci.yml that runs on every PR: installs dependencies, runs TypeScript check, runs ESLint, runs tests with coverage. Create .github/workflows/deploy.yml that runs on merge to main: builds the app, deploys to Vercel using VERCEL_TOKEN. Add branch protection rules.", status: "todo", submission: "", validationResult: null, version: 1 },
      { id: "t12", title: "Production deployment & monitoring", description: "Deploy to Vercel, configure environment, set up error monitoring.", type: "devops", estimatedHours: 3, priority: "high", aiPrompt: "You are deploying to production. Configure Vercel project: add all environment variables, set up custom domain, enable Edge Config. Set up Sentry for error monitoring: install @sentry/nextjs, configure sentry.client.config.ts and sentry.server.config.ts, add SENTRY_DSN to env. Configure Vercel Analytics. Test all features on production URL before marking complete.", status: "todo", submission: "", validationResult: null, version: 1 },
    ],
  },
];

// ── Role label map ────────────────────────────────────────────────────────────
const ROLE_LABEL: Record<string, string> = {
  frontend: "Frontend Developer",
  backend:  "Backend Developer",
  fullstack: "Full Stack Developer",
  ai:       "AI / ML Engineer",
  devops:   "DevOps Engineer",
};

const TIER_CONFIG = {
  "self-declared":     { label: "Tier 1 · Self-Declared",    color: "text-white/50",    border: "border-white/10",           icon: <Edit3 className="w-3.5 h-3.5" />, dots: 1 },
  "assessment-passed": { label: "Tier 2 · Assessment-Passed", color: "text-yellow-400",  border: "border-yellow-500/30",      icon: <Award className="w-3.5 h-3.5" />, dots: 2 },
  "project-verified":  { label: "Tier 3 · Project-Verified",  color: "text-emerald-400", border: "border-emerald-500/30",     icon: <ShieldCheck className="w-3.5 h-3.5" />, dots: 3 },
};

const DOT_COLORS = ["bg-emerald-500", "bg-yellow-500", "bg-emerald-500"];

type ProfileCompletionInput = {
  fullName: string;
  phone: string;
  location: string;
  photoURL: string;
  skills: string[];
  tools: string[];
  githubUrl: string;
  portfolioUrl: string;
  projectDescriptions: string[];
  availability: string;
  payMin: number;
  payMax: number;
  preferredTypes: string[];
  verificationStatus: string;
};

/** Points from profile fields only (max 95). Tier 2/3 adds +5 via verificationStatus in profileCompletion(). */
function profileCompletionBase(p: ProfileCompletionInput | null): number {
  if (!p) return 0;
  let s = 0;
  if (p.fullName)    s += 15;
  if (p.phone)       s += 5;
  if (p.location)    s += 5;
  if (p.photoURL)    s += 10;
  if (p.skills.length  > 0) s += 15;
  if (p.tools.length   > 0) s += 5;
  if (p.githubUrl || p.portfolioUrl) s += 15;
  if (p.projectDescriptions.length > 0) s += 10;
  if (p.availability) s += 5;
  if (p.payMin > 0 && p.payMax > 0) s += 5;
  if (p.preferredTypes.length > 0) s += 5;
  return Math.min(95, s);
}

function profileCompletion(p: ProfileCompletionInput | null) {
  if (!p) return 0;
  let s = profileCompletionBase(p);
  if (p.verificationStatus !== "self-declared") s += 5;
  return Math.min(100, s);
}

const PROFILE_BASE_COMPLETE_THRESHOLD = 95;

/** True when all profile fields are filled; excludes verification tier bonus (so Tier 2 can unlock after skill test). */
function isProfileComplete(p: DevProfileType | null): boolean {
  if (!p) return false;
  return profileCompletionBase(p) >= PROFILE_BASE_COMPLETE_THRESHOLD;
}

/** Unlock a skill test if any profile skill overlaps catalog tags (substring match). */
function skillTagsMatch(tags: string[], userSkills: string[]): boolean {
  if (!userSkills.length) return false;
  const u = userSkills.map(s => s.toLowerCase().trim()).filter(Boolean);
  return tags.some(tag =>
    u.some(sk => sk.includes(tag) || tag.includes(sk)),
  );
}

type AssessmentDifficulty = "Easy" | "Medium" | "Hard";
type AssessmentRunStatus = "locked" | "available" | "completed";

interface SkillQuizQuestion {
  id: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
}

interface SkillAssessmentCatalogEntry {
  id: string;
  title: string;
  description: string;
  skillTags: string[];
  duration: string;
  questionCount: number;
  difficulty: AssessmentDifficulty;
  questions: SkillQuizQuestion[];
}

const SKILL_ASSESSMENT_CATALOG: SkillAssessmentCatalogEntry[] = [
  {
    id: "nextjs-patterns",
    title: "Next.js & React Patterns",
    description: "App Router, RSC boundaries, data fetching, and performance.",
    skillTags: ["next", "next.js", "react", "typescript", "javascript", "frontend", "vercel"],
    duration: "45 min",
    questionCount: 3,
    difficulty: "Hard",
    questions: [
      { id: "n1", prompt: "In the App Router, which file name defines a shared layout segment?", choices: ["layout.tsx", "template.tsx", "_document.tsx", "pages/_app.tsx"], correctIndex: 0 },
      { id: "n2", prompt: "Server Components run where by default in Next.js 14+?", choices: ["Only in the browser", "On the server at request time", "Only at build time in CI", "Inside service workers"], correctIndex: 1 },
      { id: "n3", prompt: "Best practice for fetching data in a Server Component?", choices: ["useEffect + fetch", "async component + await fetch directly", "Only client-side SWR", "window.fetch in onClick"], correctIndex: 1 },
    ],
  },
  {
    id: "supabase-data",
    title: "Supabase & PostgreSQL",
    description: "Auth, RLS policies, and Postgres patterns for multi-tenant apps.",
    skillTags: ["supabase", "postgres", "postgresql", "sql", "database", "rls", "backend"],
    duration: "35 min",
    questionCount: 3,
    difficulty: "Medium",
    questions: [
      { id: "s1", prompt: "Row Level Security (RLS) is enforced at which layer?", choices: ["Application middleware only", "The database engine", "CDN edge", "Browser localStorage"], correctIndex: 1 },
      { id: "s2", prompt: "Supabase Auth user id is typically available in SQL as:", choices: ["auth.uid()", "current_user", "session.id", "jwt.sub() only in Edge"], correctIndex: 0 },
      { id: "s3", prompt: "Why enable RLS on all public tables?", choices: ["Faster queries", "Enforce access even if the API is bypassed", "Required for Vercel", "To disable realtime"], correctIndex: 1 },
    ],
  },
  {
    id: "pinecone-ai",
    title: "Vector DB & RAG",
    description: "Embeddings, similarity search, and production RAG pitfalls.",
    skillTags: ["pinecone", "vector", "embedding", "openai", "rag", "ai", "ml", "langchain", "llm"],
    duration: "30 min",
    questionCount: 3,
    difficulty: "Medium",
    questions: [
      { id: "p1", prompt: "Cosine similarity is most often used with:", choices: ["Normalized embedding vectors", "Raw JPEG pixels", "SQL primary keys", "Git commit hashes"], correctIndex: 0 },
      { id: "p2", prompt: "A common cause of poor RAG answers is:", choices: ["Too much CSS", "Irrelevant chunks in the context window", "Using HTTP/1.0", "Dark mode"], correctIndex: 1 },
      { id: "p3", prompt: "Metadata on vector records helps with:", choices: ["Faster disk spin", "Filtering and attribution without scanning all vectors", "GPU driver updates", "Email deliverability"], correctIndex: 1 },
    ],
  },
  {
    id: "system-design",
    title: "System Design for Scale",
    description: "Load balancing, caching, idempotency, and failure modes.",
    skillTags: ["system", "design", "scale", "distributed", "microservices", "kafka", "redis", "aws", "backend", "architecture"],
    duration: "60 min",
    questionCount: 3,
    difficulty: "Hard",
    questions: [
      { id: "d1", prompt: "Idempotent API operations help with:", choices: ["Beautiful UI", "Safe retries without duplicate side effects", "Smaller bundle size", "JWT colour"], correctIndex: 1 },
      { id: "d2", prompt: "A read replica primarily improves:", choices: ["Write throughput for single-row locks", "Read scaling and failover options", "Image compression", "CSS specificity"], correctIndex: 1 },
      { id: "d3", prompt: "Circuit breakers protect a system from:", choices: ["CSS bugs", "Cascading failures when a dependency is unhealthy", "npm peer warnings", "TypeScript strict null"], correctIndex: 1 },
    ],
  },
  {
    id: "devops-ci",
    title: "DevOps & CI/CD",
    description: "Pipelines, containers, and safe deployments.",
    skillTags: ["devops", "docker", "kubernetes", "ci", "cd", "github", "actions", "terraform", "aws", "deploy"],
    duration: "40 min",
    questionCount: 3,
    difficulty: "Medium",
    questions: [
      { id: "o1", prompt: "A CI pipeline should typically run on:", choices: ["Every production deploy only", "Pull requests before merge", "Developer laptops only", "Friday evenings only"], correctIndex: 1 },
      { id: "o2", prompt: "Docker images help with:", choices: ["Consistent runtime environments", "Replacing DNS", "OAuth flows", "Firestore security rules"], correctIndex: 0 },
      { id: "o3", prompt: "Blue-green deploys reduce risk by:", choices: ["Deleting logs", "Switching traffic between two environments", "Using only HTTP GET", "Disabling monitoring"], correctIndex: 1 },
    ],
  },
  {
    id: "security-compliance",
    title: "Security & Data Compliance",
    description: "GDPR-style concepts, least privilege, and secure defaults.",
    skillTags: ["security", "gdpr", "compliance", "privacy", "oauth", "encryption", "auth"],
    duration: "25 min",
    questionCount: 3,
    difficulty: "Easy",
    questions: [
      { id: "c1", prompt: "Least privilege means:", choices: ["Everyone is admin", "Grant only the minimum access needed", "No passwords", "Public buckets by default"], correctIndex: 1 },
      { id: "c2", prompt: "PII should generally be:", choices: ["Logged in plain text", "Minimized, encrypted, and access-controlled", "Posted in Slack", "Hardcoded in frontend"], correctIndex: 1 },
      { id: "c3", prompt: "A data processing agreement (conceptually) matters when:", choices: ["You ignore vendors", "A processor handles user data on your behalf", "You only use localStorage", "You skip HTTPS"], correctIndex: 1 },
    ],
  },
];

// ── Main Component ────────────────────────────────────────────────────────────
export default function EmployeeDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const { project, currentUser, developerProfile, setDeveloperProfile, patchDeveloperProfile, reset, addUserRole, userRoles, setRole } = useStore();

  // ── PRD + Chat state ────────────────────────────────────────────────────────
  const [prds,         setPrds]        = useState<PRDDocument[]>([]);
  const [prdLoading,   setPrdLoading]  = useState(false);
  const [hireReqs,     setHireReqs]    = useState<HireRequest[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [fireMsgs,     setFireMsgs]    = useState<FireChatMsg[]>([]);
  const [chatRoom,     setChatRoom]    = useState<ChatRoom | null>(null);
  const [chatText,     setChatText]    = useState("");
  const [chatSending,  setChatSending] = useState(false);
  const [chatSubError, setChatSubError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("projects");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    const allowed: Tab[] = ["projects", "workspace", "assessments", "profile", "prd", "chat"];
    if (t && allowed.includes(t)) setActiveTab(t);
  }, []);
  const [milestones, setMilestones] = useState<Milestone[]>(MILESTONES_FALLBACK);
  const [generatingMilestones, setGeneratingMilestones] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [activeMilestoneId, setActiveMilestoneId] = useState("m1");
  const [submission, setSubmission] = useState("");
  const [validating, setValidating] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [startedAssessment, setStartedAssessment] = useState<string | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number[]>>({});
  const [assessmentSubmitting, setAssessmentSubmitting] = useState(false);
  const [assessmentFeedback, setAssessmentFeedback] = useState<string | null>(null);
  const submissionRef = useRef<HTMLTextAreaElement>(null);

  const [matchedProjects, setMatchedProjects]   = useState<MatchedProject[]>([]);
  const [matchLoading, setMatchLoading]         = useState(false);
  const [matchError, setMatchError]             = useState(false);
  const [invitedProjects, setInvitedProjects]   = useState<Set<string>>(new Set());
  const [respondLoading,   setRespondLoading]    = useState<string | null>(null);
  const [respondError,     setRespondError]      = useState<string | null>(null);

  const projectName = project?.name ?? "My Project";
  const chatViewerUid = useFirebaseUid(currentUser?.uid);
  const userName = developerProfile?.fullName || currentUser?.displayName || "Developer";
  const userSkills = developerProfile?.skills ?? [];
  const passedAssessmentSet = useMemo(
    () => new Set(developerProfile?.passedSkillAssessments ?? []),
    [developerProfile?.passedSkillAssessments?.join("|")],
  );

  const derivedSkillAssessments = useMemo(() => {
    return SKILL_ASSESSMENT_CATALOG.map((def) => {
      const unlocked = skillTagsMatch(def.skillTags, userSkills);
      const completed = passedAssessmentSet.has(def.id);
      let status: AssessmentRunStatus;
      if (completed) status = "completed";
      else if (unlocked) status = "available";
      else status = "locked";
      const score = completed ? 92 + (def.id.length % 7) : null;
      return { ...def, status, score, badge: completed ? "Verified" : null };
    });
  }, [userSkills, passedAssessmentSet]);

  const openSkillTestCount = useMemo(
    () => derivedSkillAssessments.filter(a => a.status === "available").length,
    [derivedSkillAssessments],
  );

  const acceptedHireTokens = useMemo(
    () => new Set(hireReqs.filter(r => r.status === "accepted").map(r => r.token)),
    [hireReqs],
  );

  const pendingInvitations = useMemo(
    () => hireReqs.filter(r => r.status === "pending"),
    [hireReqs]
  );

  const activeAssignments = useMemo(
    () => hireReqs.filter(r => r.status === "accepted"),
    [hireReqs]
  );

  const sortedPrds = useMemo(() => {
    const copy = [...prds];
    copy.sort((a, b) => {
      const pa = acceptedHireTokens.has(a.hireToken) ? 1 : 0;
      const pb = acceptedHireTokens.has(b.hireToken) ? 1 : 0;
      if (pb !== pa) return pb - pa;
      return (b.projectName || "").localeCompare(a.projectName || "");
    });
    return copy;
  }, [prds, acceptedHireTokens]);

  const prdForActiveChat = useMemo(
    () => prds.find(p => p.hireToken === activeChatId) ?? null,
    [prds, activeChatId],
  );

  const chatBubbleRows = useMemo(
    () => fireMsgs.map(msg => ({ msg, ...classifyChatBubble(msg, chatViewerUid, chatRoom) })),
    [fireMsgs, chatViewerUid, chatRoom],
  );

  const needsProfileAfterSkillPass = useMemo(() => {
    if (!developerProfile) return false;
    const passed = (developerProfile.passedSkillAssessments?.length ?? 0) > 0;
    return passed && !isProfileComplete(developerProfile) && developerProfile.verificationStatus === "self-declared";
  }, [developerProfile]);

  const completionPct = useMemo(() => profileCompletion(developerProfile ?? null), [developerProfile]);
  const profileBasePct = useMemo(() => profileCompletionBase(developerProfile ?? null), [developerProfile]);
  const passedIdsKey = developerProfile?.passedSkillAssessments?.join("|") ?? "";

  // Skill test passed first, then profile fields reach 95% → Tier 2 (bar hits 100% after +5 tier bonus)
  useEffect(() => {
    const uid = currentUser?.uid;
    if (!uid || uid === "demo-guest" || !developerProfile) return;
    if (!passedIdsKey) return;
    if (developerProfile.verificationStatus !== "self-declared") return;
    if (profileBasePct < PROFILE_BASE_COMPLETE_THRESHOLD) return;
    let cancelled = false;
    updateDeveloperProfileField(uid, { verificationStatus: "assessment-passed" })
      .then(() => {
        if (!cancelled) patchDeveloperProfile({ verificationStatus: "assessment-passed" });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [passedIdsKey, profileBasePct, developerProfile?.verificationStatus, currentUser?.uid, patchDeveloperProfile]);

  const setQuizChoice = (assessmentId: string, qIndex: number, choiceIndex: number) => {
    setQuizAnswers(prev => {
      const def = SKILL_ASSESSMENT_CATALOG.find(d => d.id === assessmentId);
      const len = def?.questions.length ?? 0;
      const base = prev[assessmentId] ?? Array(len).fill(-1);
      const row = [...base];
      while (row.length < len) row.push(-1);
      row[qIndex] = choiceIndex;
      return { ...prev, [assessmentId]: row };
    });
  };

  async function submitSkillAssessment(assessmentId: string) {
    const def = SKILL_ASSESSMENT_CATALOG.find(d => d.id === assessmentId);
    const uid = currentUser?.uid;
    if (!def || !uid || uid === "demo-guest" || !developerProfile) return;
    const answers = quizAnswers[assessmentId] ?? [];
    const ok = def.questions.every((q, i) => answers[i] === q.correctIndex);
    if (!ok) {
      setAssessmentFeedback("Not quite — review the highlighted topics and try again.");
      return;
    }
    const prev = developerProfile.passedSkillAssessments ?? [];
    if (prev.includes(assessmentId)) return;
    setAssessmentSubmitting(true);
    setAssessmentFeedback(null);
    try {
      const next = [...prev, assessmentId];
      const merged: DevProfileType = { ...developerProfile, passedSkillAssessments: next };
      const updates: Partial<DevProfileType> = { passedSkillAssessments: next };
      if (isProfileComplete(merged)) updates.verificationStatus = "assessment-passed";
      await updateDeveloperProfileField(uid, updates);
      patchDeveloperProfile(updates);
      await logAction(uid, "analysis.generated", { type: "skill_assessment_passed", assessmentId }).catch(() => {});
      setStartedAssessment(null);
      setQuizAnswers(prev => ({ ...prev, [assessmentId]: [] }));
    } catch {
      setAssessmentFeedback("Could not save to Firebase. Stay signed in, ensure your developer profile exists, and check Firestore rules allow updates.");
    } finally {
      setAssessmentSubmitting(false);
    }
  }

  function beginSkillAssessment(id: string) {
    const def = SKILL_ASSESSMENT_CATALOG.find(d => d.id === id);
    setAssessmentFeedback(null);
    setStartedAssessment(id);
    setQuizAnswers(prev => ({
      ...prev,
      [id]: Array(def?.questions.length ?? 0).fill(-1),
    }));
  }

  // ── Refresh profile from Firestore; require completed registration ─────────
  const firebaseUid = currentUser?.uid ?? null;
  useEffect(() => {
    if (!firebaseUid || firebaseUid === "demo-guest") return;
    let cancelled = false;
    void (async () => {
      const fresh = await getDeveloperProfile(firebaseUid);
      if (cancelled) return;
      if (fresh) setDeveloperProfile(fresh);
      if (!isDeveloperRegistrationComplete(fresh)) {
        router.replace("/developer");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firebaseUid, router, setDeveloperProfile]);

  // ── Load hire requests on mount + refetch on tab switch + poll every 30s ──
  const fetchHireReqs = useRef<() => void>(() => {});
  fetchHireReqs.current = () => {
    if (!currentUser?.uid || currentUser.uid === "demo-guest") return;
    getHireRequestsByDeveloper(currentUser.uid)
      .then(setHireReqs)
      .catch(() => {});
  };

  useEffect(() => {
    fetchHireReqs.current();
    const id = setInterval(() => fetchHireReqs.current(), 30_000);
    return () => clearInterval(id);
  }, [currentUser?.uid]);

  useEffect(() => {
    if (activeTab === "projects" || activeTab === "workspace") {
      fetchHireReqs.current();
    }
  }, [activeTab]);

  // ── Load PRDs + hire requests when PRD tab opens ────────────────────────────
  useEffect(() => {
    if (activeTab !== "prd" || !currentUser) return;
    setPrdLoading(true);
    Promise.all([
      getPRDsByUser(currentUser.uid),
      getHireRequestsByDeveloper(currentUser.uid),
    ])
      .then(([docs, reqs]) => {
        setPrds(docs);
        setHireReqs(reqs);
      })
      .catch(() => {})
      .finally(() => setPrdLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentUser?.uid]);

  // ── Chat tab: hire threads + PRDs for this hire (banner + PRD tab ordering) ─
  useEffect(() => {
    if (activeTab !== "chat" || !currentUser) return;
    let cancelled = false;
    const fromUrl =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("chat")
        : null;
    Promise.all([getHireRequestsByDeveloper(currentUser.uid), getPRDsByUser(currentUser.uid)])
      .then(([reqs, docs]) => {
        if (cancelled) return;
        setHireReqs(reqs);
        setPrds(docs);
        const accepted = reqs.filter(r => r.status === "accepted");
        if (!accepted.length) {
          setActiveChatId(null);
          return;
        }
        let stored: string | null = null;
        try {
          stored = sessionStorage.getItem(chatStorageKey("developer", currentUser.uid));
        } catch {
          /* */
        }
        const urlOk = fromUrl && accepted.some(r => r.token === fromUrl) ? fromUrl : null;
        const storeOk = stored && accepted.some(r => r.token === stored) ? stored : null;
        const sorted = [...accepted].sort(
          (a, b) => (b.respondedAt?.toMillis?.() ?? 0) - (a.respondedAt?.toMillis?.() ?? 0),
        );
        const fallback = sorted[0]?.token ?? null;
        const next = urlOk || storeOk || fallback;
        setActiveChatId(prev => (prev && accepted.some(r => r.token === prev) ? prev : next));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeTab, currentUser?.uid]);

  // ── Ensure chat room doc exists (signed-in developer can create per rules) ──
  useEffect(() => {
    if (activeTab !== "chat" || !currentUser?.uid || !activeChatId) return;
    const req = hireReqs.find(r => r.token === activeChatId && r.status === "accepted");
    if (!req) return;
    createOrGetChat({
      chatId:         activeChatId,
      projectName:    req.projectName,
      creatorUid:     req.creatorUid,
      creatorName:    req.creatorName,
      creatorEmail:   req.creatorEmail,
      developerUid:   req.developerUid,
      developerName:  req.developerName,
      developerEmail: req.developerEmail,
    }).catch(() => {});
  }, [activeTab, currentUser?.uid, activeChatId, hireReqs]);

  useEffect(() => {
    if (!activeChatId) {
      setFireMsgs([]);
      setChatRoom(null);
      return;
    }
    setChatSubError(null);
    const unMsg = subscribeToChatMessages(
      activeChatId,
      msgs => setFireMsgs(msgs),
      err => setChatSubError(err),
    );
    const unRoom = subscribeToChatRoom(
      activeChatId,
      setChatRoom,
      err => setChatSubError(prev => prev ?? err),
    );
    return () => {
      unMsg();
      unRoom();
    };
  }, [activeChatId]);

  // ── Persist developer’s active chat in URL + sessionStorage ─────────────────
  useEffect(() => {
    if (!currentUser?.uid || !activeChatId || activeTab !== "chat") return;
    try {
      sessionStorage.setItem(chatStorageKey("developer", currentUser.uid), activeChatId);
    } catch {
      /* */
    }
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    if (params.get("chat") === activeChatId && params.get("tab") === "chat") return;
    params.set("tab", "chat");
    params.set("chat", activeChatId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [activeChatId, activeTab, currentUser?.uid, pathname, router]);

  useEffect(() => {
    if (activeTab !== "chat" || !activeChatId || !currentUser?.uid) return;
    const uid = currentUser.uid;
    const tick = () => {
      void updateChatPresence(activeChatId, uid);
    };
    tick();
    const id = setInterval(tick, 45_000);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [activeTab, activeChatId, currentUser?.uid]);

  // ── Fetch AI-matched project opportunities ────────────────────────────────
  useEffect(() => {
    if (activeTab !== "projects") return;
    if (matchedProjects.length > 0) return; // already loaded
    fetchMatchedProjects();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  async function fetchMatchedProjects() {
    setMatchLoading(true);
    setMatchError(false);
    try {
      const res = await fetch("/api/match-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skills:             developerProfile?.skills ?? [],
          tools:              developerProfile?.tools  ?? [],
          primaryRole:        developerProfile?.primaryRole ?? "fullstack",
          yearsExp:           developerProfile?.yearsExp ?? 1,
          preferredTypes:     developerProfile?.preferredTypes ?? [],
          currentProjectName: project?.name ?? "",
          currentProjectIdea: project?.idea ?? "",
        }),
      });
      const { ok, data } = await parseJsonResponse(res);
      const projects = data.projects;
      if (ok && Array.isArray(projects) && projects.length) {
        setMatchedProjects(projects);
      } else {
        setMatchError(true);
      }
    } catch {
      setMatchError(true);
    } finally {
      setMatchLoading(false);
    }
  }

  // ── Generate AI milestones on workspace open ──────────────────────────────
  async function generateMilestones() {
    if (!project) return;
    setGeneratingMilestones(true);
    try {
      const res = await fetch("/api/generate-milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName: project.name, projectIdea: project.idea }),
      });
      const { ok, data } = await parseJsonResponse(res);
      const rawMilestones = data.milestones;
      if (ok && Array.isArray(rawMilestones) && rawMilestones.length) {
        const withState = rawMilestones.map((m: Milestone) => ({
          ...m,
          tasks: m.tasks.map((t: Task) => ({ ...t, status: "todo" as TaskStatus, submission: "", validationResult: null, version: 1 })),
        }));
        setMilestones(withState);
        if (currentUser) logAction(currentUser.uid, "analysis.generated", { type: "milestones", project: project.name });
      }
    } catch { /* use fallback */ }
    finally { setGeneratingMilestones(false); }
  }

  // Open workspace and generate milestones
  function openWorkspace() {
    setActiveTab("workspace");
    generateMilestones();
  }

  // ── Task actions ──────────────────────────────────────────────────────────
  function updateTaskStatus(milestoneId: string, taskId: string, status: TaskStatus) {
    setMilestones(prev => prev.map(m => m.id !== milestoneId ? m : {
      ...m,
      tasks: m.tasks.map(t => t.id !== taskId ? t : { ...t, status }),
    }));
    if (selectedTask?.id === taskId) setSelectedTask(prev => prev ? { ...prev, status } : null);
  }

  function updateTaskSubmission(milestoneId: string, taskId: string, sub: string, result: ValidationResult | null) {
    setMilestones(prev => prev.map(m => m.id !== milestoneId ? m : {
      ...m,
      tasks: m.tasks.map(t => t.id !== taskId ? t : { ...t, submission: sub, validationResult: result, submittedAt: new Date().toLocaleTimeString() }),
    }));
  }

  // ── Validate submission ───────────────────────────────────────────────────
  async function handleValidate() {
    if (!selectedTask || !submission.trim()) return;
    setValidating(true);

    const milestoneId = milestones.find(m => m.tasks.some(t => t.id === selectedTask.id))?.id ?? "";
    updateTaskStatus(milestoneId, selectedTask.id, "validating");

    try {
      const res = await fetch("/api/validate-submission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskTitle: selectedTask.title, taskDescription: selectedTask.description, submission }),
      });
      const { ok, data } = await parseJsonResponse(res);
      if (!ok || typeof data.passed !== "boolean") {
        updateTaskStatus(milestoneId, selectedTask.id, "in-progress");
        return;
      }
      const result = data as unknown as ValidationResult;
      updateTaskSubmission(milestoneId, selectedTask.id, submission, result);
      const nextStatus: TaskStatus = result.passed ? "review" : "rejected";
      updateTaskStatus(milestoneId, selectedTask.id, nextStatus);
      setSelectedTask(prev => prev ? { ...prev, status: nextStatus, submission, validationResult: result } : null);
      if (currentUser) logAction(currentUser.uid, "code.generated", { task: selectedTask.title, passed: result.passed, score: result.score });
    } catch {
      updateTaskStatus(milestoneId, selectedTask.id, "in-progress");
    } finally {
      setValidating(false);
    }
  }

  function handleStartTask(task: Task) {
    const milestoneId = milestones.find(m => m.tasks.some(t => t.id === task.id))?.id ?? "";
    if (task.status === "todo") updateTaskStatus(milestoneId, task.id, "in-progress");
    setSelectedTask({ ...task, status: task.status === "todo" ? "in-progress" : task.status });
    setSubmission(task.submission);
    setActiveTab("workspace");
    setTimeout(() => submissionRef.current?.focus(), 300);
  }

  function copyPrompt() {
    if (!selectedTask) return;
    navigator.clipboard.writeText(selectedTask.aiPrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  }

  async function sendFireMessage() {
    if (!chatText.trim() || !activeChatId || !currentUser) return;
    setChatSending(true);
    const text = chatText.trim();
    setChatText("");
    setChatSubError(null);
    try {
      const uid = (auth.currentUser?.uid ?? currentUser.uid).trim();
      if (!uid) throw new Error("Not signed in");
      await sendChatMessage(activeChatId, {
        text,
        senderUid:  uid,
        senderName: developerProfile?.fullName ?? currentUser.displayName ?? "Developer",
      });
      await maybeSetOfflinePingForPartner(activeChatId, uid);
    } catch (e) {
      setChatSubError(e instanceof Error ? e.message : "Failed to send message");
    } finally {
      setChatSending(false);
    }
  }

  async function handleRespond(token: string, action: "accept" | "reject") {
    if (!currentUser) return;
    setRespondLoading(token);
    setRespondError(null);
    try {
      const res = await fetch("/api/hire-respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action }),
      });
      const { ok, data } = await parseJsonResponse(res);
      if (!ok) throw new Error(String(data?.error || "Failed to respond to invitation"));

      if (action === "accept") {
        // Success! Re-fetch hire requests and then redirect
        const updated = await getHireRequestsByDeveloper(currentUser.uid);
        setHireReqs(updated);
        router.push(`/project-room?projectId=${data.projectId || ""}&tab=milestones`);
      } else {
        // Refetch to clear the rejected one
        const updated = await getHireRequestsByDeveloper(currentUser.uid);
        setHireReqs(updated);
      }
    } catch (err) {
      setRespondError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRespondLoading(null);
    }
  }

  async function handleLogout() {
    try {
      await signOutUser();
    } catch (err) {
      console.warn("Logout failed:", err);
    } finally {
      reset();
      router.push("/");
    }
  }

  // ── Derived stats ──────────────────────────────────────────────────────────
  const allTasks = (milestones || []).flatMap(m => m.tasks || []);
  const doneTasks = allTasks.filter(t => t?.status === "approved").length;
  const inProgress = allTasks.filter(t => t?.status === "in-progress" || t?.status === "validating").length;
  const inReview = allTasks.filter(t => t?.status === "review").length;
  const progress = allTasks.length ? Math.round((doneTasks / allTasks.length) * 100) : 0;

  const activeMilestone = (milestones || []).find(m => m.id === activeMilestoneId) ?? (milestones?.[0] || null);
  const COLOR_MAP: Record<string, string> = {
    blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    purple: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    orange: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  };

  return (
    <div className="min-h-screen relative flex">
      <div className="fixed top-1/4 left-1/4 w-[500px] h-[500px] bg-white/[0.02] rounded-full blur-[150px] pointer-events-none -z-10" />
      <div className="fixed bottom-0 right-0 w-[600px] h-[600px] bg-white/[0.01] rounded-full blur-[180px] pointer-events-none -z-10" />

      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <aside className="w-72 border-r border-white/5 bg-[#050505]/80 backdrop-blur-xl flex flex-col p-6 sticky top-0 h-screen overflow-y-auto">
        {/* Avatar + name — live from developerProfile */}
        <Link href="/developer/profile" className="flex items-center gap-3 mb-6 group">
          <div className="w-14 h-14 rounded-full border-2 border-white/20 group-hover:border-indigo-500/50 overflow-hidden bg-white/5 flex items-center justify-center shrink-0 transition-all duration-300 shadow-lg">
            {developerProfile?.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={developerProfile.photoURL} alt={userName} className="w-full h-full object-cover" />
            ) : (
              <User className="w-6 h-6 text-white/40" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-white font-black truncate tracking-tight">{userName}</div>
            <div className="text-[10px] text-[#888] uppercase tracking-widest mt-0.5 truncate">
              {developerProfile?.primaryRole ? ROLE_LABEL[developerProfile.primaryRole] : "Developer"}
            </div>
            {developerProfile?.location && (
              <div className="text-[10px] text-white/30 truncate mt-0.5">{developerProfile.location}</div>
            )}
          </div>
          <Edit3 className="w-3.5 h-3.5 text-white/20 group-hover:text-indigo-400 transition-colors shrink-0" />
        </Link>

        {!userRoles.includes("employer") && (
          <button
            type="button"
            onClick={() => {
              addUserRole("employer");
              setRole("employer");
              router.push("/discovery");
            }}
            className="mb-5 w-full py-2.5 px-3 rounded-xl border border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 hover:border-indigo-400/60 text-[10px] font-bold uppercase tracking-widest transition-all"
          >
            Post a project · Discovery
          </button>
        )}

        {/* Dynamic tier card */}
        {(() => {
          const tier = (developerProfile?.verificationStatus ?? "self-declared") as keyof typeof TIER_CONFIG;
          const cfg = TIER_CONFIG[tier];
          const completion = profileCompletion(developerProfile);
          return (
            <div className={`mb-5 p-4 bg-white/5 border ${cfg.border} rounded-2xl text-center`}>
              <div className={`flex items-center justify-center gap-1.5 mb-1 ${cfg.color}`}>
                {cfg.icon}
                <span className="text-xs font-black uppercase tracking-widest">{cfg.label}</span>
              </div>
              <div className="mt-2 flex items-center justify-center gap-1.5">
                {[0,1,2].map(i => (
                  <div key={i} className={`h-1.5 w-8 rounded-full transition-all ${i < cfg.dots ? DOT_COLORS[i] : "bg-white/10"}`} />
                ))}
              </div>
              <div className="mt-3 space-y-1">
                <div className="flex justify-between text-[9px] uppercase tracking-widest font-bold">
                  <span className="text-white/30">Profile</span>
                  <span className={completion >= 80 ? "text-emerald-400" : completion >= 50 ? "text-yellow-400" : "text-red-400"}>{completion}%</span>
                </div>
                <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700 ${completion >= 80 ? "bg-emerald-500" : completion >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
                    style={{ width: `${completion}%` }} />
                </div>
              </div>
            </div>
          );
        })()}

        {/* Live stats */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          {[
            { label: "Done", value: `${doneTasks}/${allTasks.length}`, icon: <CheckCircle2 className="w-3 h-3" />, color: "text-emerald-400" },
            { label: "Active", value: String(inProgress), icon: <Activity className="w-3 h-3" />, color: "text-blue-400" },
            { label: "Review", value: String(inReview), icon: <Eye className="w-3 h-3" />, color: "text-purple-400" },
            { label: "Progress", value: `${progress}%`, icon: <TrendingUp className="w-3 h-3" />, color: "text-yellow-400" },
          ].map(s => (
            <div key={s.label} className="p-3 bg-white/5 rounded-xl text-center border border-white/5">
              <div className={`flex items-center justify-center gap-1 mb-1 ${s.color}`}>{s.icon}</div>
              <div className={`font-bold text-sm ${s.color}`}>{s.value}</div>
              <div className="text-[9px] text-[#888] uppercase tracking-widest">{s.label}</div>
            </div>
          ))}
        </div>

        <nav className="flex-grow space-y-2">
          {([
            { id: "projects",    label: "Opportunities",  icon: <Briefcase className="w-5 h-5" />, badge: pendingInvitations.length > 0 ? String(pendingInvitations.length) : null },
            { id: "workspace",   label: "Workspaces",     icon: <Code2 className="w-5 h-5" />, badge: activeAssignments.length > 0 ? String(activeAssignments.length) : null },
            { id: "prd",         label: "PRD Document",   icon: <FileText className="w-5 h-5" />, badge: prds.length > 0 ? "New" : null },
            { id: "chat",        label: "Chat with Client", icon: <MessageSquare className="w-5 h-5" />, badge: activeChatId ? "Live" : null },
            { id: "assessments", label: "Skill Tests",    icon: <Activity className="w-5 h-5" />, badge: openSkillTestCount > 0 ? String(openSkillTestCount) : null },
            { id: "profile",     label: "My Profile",     icon: <User className="w-5 h-5" /> },
          ] as const).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as Tab)}
              className={`flex items-center gap-3 w-full p-3 font-bold rounded-lg transition-all ${activeTab === tab.id ? "text-white bg-white/10 border border-white/10" : "text-[#888] hover:text-white hover:bg-white/5"}`}>
              {tab.icon}
              <span className="text-sm flex-1 text-left">{tab.label}</span>
              {"badge" in tab && tab.badge && (
                <span className="text-[9px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-bold">{tab.badge}</span>
              )}
            </button>
          ))}
        </nav>

        <button
          onClick={handleLogout}
          className="mt-3 w-full flex items-center justify-center gap-2 py-3 border border-red-500/20 text-red-300 hover:text-red-200 hover:border-red-500/40 hover:bg-red-500/10 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
        >
          <LogOut className="w-3.5 h-3.5" />
          Logout
        </button>

        {/* Live status */}
        <div className="mt-4 space-y-2">
          <div className="p-3 bg-white/5 border border-white/10 rounded-xl">
            <div className="text-[9px] text-white/40 uppercase tracking-widest mb-1.5 font-bold flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${developerProfile?.profileStatus === "active" ? "bg-emerald-500" : "bg-white/30"}`} />
              {developerProfile?.profileStatus === "active" ? "Available for Projects" : "Status: Inactive"}
            </div>
            <p className="text-[10px] text-[#888] font-light">{projectName} · {progress}% complete</p>
          </div>
          {(developerProfile?.payMin ?? 0) > 0 && (
            <div className="p-3 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between">
              <span className="text-[9px] text-white/30 uppercase tracking-widest font-bold">Rate</span>
              <span className="text-[10px] text-emerald-400 font-black">${developerProfile!.payMin}–${developerProfile!.payMax}/{developerProfile?.payCurrency ?? "USD"}</span>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main Content ───────────────────────────────────────────────────── */}
      <main className="flex-grow overflow-y-auto flex flex-col">
        <DeveloperFlowBreadcrumb className="px-10 pt-4 shrink-0 border-b border-white/5 bg-[#030303]/50" />
        <div className="p-10 max-w-5xl space-y-8 flex-1">

          <header className="border-b border-white/10 pb-8 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h1 className="text-5xl font-black tracking-tighter text-white">
                  {activeTab === "projects" ? "Project Opportunities"
                   : activeTab === "workspace" ? ""
                   : activeTab === "assessments" ? "Skill Assessments"
                   : "My Profile"}
                </h1>
                <p className="text-[#888] text-lg font-light tracking-wide mt-1">
                  {activeTab === "projects" ? "Projects matched to your verified skills."
                   : activeTab === "workspace" ? `${projectName} — execution pipeline with AI-validated tasks.`
                   : activeTab === "assessments" ? "Tests unlock from your profile skills. Finish your full profile after passing to activate Tier 2 verification."
                   : "Your verified developer profile."}
                </p>
              </div>
              {activeTab === "workspace" && (
                <div className="flex items-center gap-3">
                  <div className="h-2 w-40 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
                  </div>
                  <span className="text-emerald-400 font-bold text-sm">{progress}%</span>
                </div>
              )}
            </div>
          </header>

          <AnimatePresence mode="wait">

            {/* ── PROJECTS TAB ─────────────────────────────────────────────── */}
            {activeTab === "projects" && (
              <motion.section key="projects" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">

                {/* ── PROJECT INVITATIONS ── */}
                {pendingInvitations.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-white font-black tracking-tight flex items-center gap-2">
                        <Star className="w-5 h-5 text-yellow-400" /> Project Invitations
                      </h2>
                      <span className="bg-yellow-500/20 text-yellow-500 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest">{pendingInvitations.length} Pending</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {pendingInvitations?.map((invite) => (
                        <div key={invite?.token} className="glass-panel p-6 rounded-2xl border border-yellow-500/30 bg-yellow-500/5 relative overflow-hidden group">
                          {/* Glossy highlight */}
                          <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                          
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <div className="flex items-center gap-2 mb-1.5">
                                <ShieldCheck className="w-3.5 h-3.5 text-yellow-400" />
                                <span className="text-[9px] text-yellow-400 font-bold uppercase tracking-widest">New Invitation</span>
                              </div>
                              <h3 className="text-white text-lg font-black tracking-tight">{invite.projectName}</h3>
                              <p className="text-white/40 text-[10px] uppercase tracking-widest font-bold mt-1">From: {invite.creatorName}</p>
                            </div>
                            <div className="text-right">
                              <span className="text-[9px] text-white/30 uppercase tracking-widest block mb-1">Status</span>
                              <span className="px-2 py-0.5 bg-white/5 border border-white/10 text-white/40 text-[8px] font-black rounded uppercase">Awaiting Action</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 mt-6">
                            <button
                              onClick={() => handleRespond(invite.token, "accept")}
                              disabled={respondLoading === invite.token}
                              className="flex-1 py-2.5 silver-gradient text-black font-black uppercase tracking-widest text-[10px] rounded-xl flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                            >
                              {respondLoading === invite.token ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                              Accept Offer
                            </button>
                            <button
                              onClick={() => handleRespond(invite.token, "reject")}
                              disabled={respondLoading === invite.token}
                              className="px-4 py-2.5 border border-white/10 text-white/40 hover:text-white hover:border-white/20 hover:bg-white/5 font-black uppercase tracking-widest text-[10px] rounded-xl transition-all disabled:opacity-50"
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── ACTIVE ASSIGNMENTS ── */}
                {activeAssignments.length > 0 && (
                  <div className="space-y-4">
                    <h2 className="text-white font-black tracking-tight flex items-center gap-2">
                      <Briefcase className="w-5 h-5 text-blue-400" /> My Active Projects
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {activeAssignments?.map((assignment) => (
                        <div key={assignment?.token} className="glass-panel p-6 rounded-2xl border border-blue-500/20 bg-blue-500/5 hover:border-blue-500/40 transition-all">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <div className="flex items-center gap-2 mb-1.5">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-widest">Active Workspace</span>
                              </div>
                              <h3 className="text-white font-black">{assignment.projectName}</h3>
                              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mt-1">Client: {assignment.creatorName}</p>
                            </div>
                            <Link 
                              href={`/project-room?projectId=${assignment.projectId}&tab=milestones`}
                              className="p-2.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 rounded-xl transition-all"
                            >
                              <ArrowRight className="w-4 h-4" />
                            </Link>
                          </div>
                          <button 
                            onClick={() => router.push(`/project-room?projectId=${assignment.projectId}&tab=milestones`)}
                            className="w-full py-2.5 flex items-center justify-center gap-2 bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                          >
                            <Play className="w-3.5 h-3.5" /> Enter Workspace
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Matching engine header */}
                <div className="flex items-center justify-between pt-2">
                  <div>
                    <h2 className="text-white font-black tracking-tight flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-indigo-400" /> AI-Matched Opportunities
                    </h2>
                    <p className="text-white/40 text-xs font-light mt-0.5">
                      Unique projects filtered by your verified skills — no duplicates
                    </p>
                  </div>
                  <button onClick={fetchMatchedProjects} disabled={matchLoading}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 text-white/50 hover:text-white hover:border-white/20 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-30">
                    <RotateCcw className={`w-3 h-3 ${matchLoading ? "animate-spin" : ""}`} /> Refresh
                  </button>
                </div>

                {/* Loading state */}
                {matchLoading && (
                  <div className="space-y-4">
                    {[1,2,3].map(i => (
                      <div key={i} className="glass-panel p-6 rounded-2xl border border-white/10 animate-pulse">
                        <div className="flex justify-between mb-4">
                          <div className="space-y-2">
                            <div className="h-4 bg-white/10 rounded w-48" />
                            <div className="h-3 bg-white/5 rounded w-72" />
                          </div>
                          <div className="h-6 bg-white/10 rounded w-16" />
                        </div>
                        <div className="flex gap-2 mb-4">
                          {[1,2,3].map(j => <div key={j} className="h-5 bg-white/5 rounded w-20" />)}
                        </div>
                        <div className="h-9 bg-white/5 rounded-xl" />
                      </div>
                    ))}
                    <p className="text-center text-xs text-white/30 font-light flex items-center justify-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      AI is matching projects to your skills — removing duplicates…
                    </p>
                  </div>
                )}

                {/* Error state */}
                {matchError && !matchLoading && (
                  <div className="p-6 rounded-2xl border border-red-500/20 bg-red-500/5 text-center space-y-3">
                    <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
                    <p className="text-sm text-white/60">Could not load matched projects. Check your connection.</p>
                    <button onClick={fetchMatchedProjects} className="px-4 py-2 bg-white/5 border border-white/10 text-white text-xs font-bold rounded-xl hover:bg-white/10 transition-colors">
                      Try Again
                    </button>
                  </div>
                )}

                {/* Matched project cards */}
                {!matchLoading && matchedProjects.length > 0 && (
                  <div className="space-y-4">
                    {matchedProjects.map((proj, idx) => {
                      const scoreColor = proj.matchScore >= 85 ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
                        : proj.matchScore >= 70 ? "text-blue-400 bg-blue-500/10 border-blue-500/30"
                        : proj.matchScore >= 55 ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/30"
                        : "text-white/40 bg-white/5 border-white/10";
                      const isInvited = invitedProjects.has(proj.id);
                      return (
                        <motion.div key={proj.id}
                          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.06 }}
                          className={`glass-panel p-6 rounded-2xl border transition-all ${isInvited ? "border-emerald-500/30 bg-emerald-500/5" : "border-white/10 hover:border-white/20"}`}>

                          {/* Header */}
                          <div className="flex items-start justify-between gap-4 mb-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="text-[9px] text-white/30 font-bold uppercase tracking-widest">{proj.category}</span>
                                {proj.urgency === "urgent" && (
                                  <span className="text-[9px] text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded font-bold uppercase tracking-widest">Urgent</span>
                                )}
                                {proj.remote && (
                                  <span className="text-[9px] text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded font-bold">Remote</span>
                                )}
                              </div>
                              <h3 className="text-white text-lg font-black tracking-tight">{proj.title}</h3>
                              <p className="text-[#888] text-xs font-light mt-1 leading-relaxed">{proj.description}</p>
                            </div>
                            <div className={`shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl border ${scoreColor}`}>
                              <span className="text-xl font-black leading-none">{proj.matchScore}</span>
                              <span className="text-[9px] font-bold uppercase tracking-widest opacity-70">Match</span>
                            </div>
                          </div>

                          {/* Tech stack */}
                          <div className="flex flex-wrap gap-1.5 mb-4">
                            {proj.techStack.map(tech => {
                              const isOwned = (developerProfile?.skills ?? []).some(s => s.toLowerCase().includes(tech.toLowerCase()) || tech.toLowerCase().includes(s.toLowerCase()));
                              return (
                                <span key={tech} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${isOwned ? "text-indigo-400 bg-indigo-500/10 border-indigo-500/20" : "text-white/30 bg-white/5 border-white/10"}`}>
                                  {tech}
                                </span>
                              );
                            })}
                          </div>

                          {/* Match reasons */}
                          <div className="mb-4 p-4 bg-white/5 rounded-xl border border-white/5 space-y-1.5">
                            <p className="text-[9px] text-white/30 uppercase tracking-widest font-bold mb-2 flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-indigo-400" /> Why you&apos;re a fit
                            </p>
                            {proj.matchReasons.map((reason, i) => (
                              <p key={i} className="text-xs text-white/60 font-light flex items-start gap-2">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" /> {reason}
                              </p>
                            ))}
                            {proj.missingSkills.length > 0 && (
                              <p className="text-xs text-yellow-400/70 font-light flex items-start gap-2 pt-1 border-t border-white/5 mt-1">
                                <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" /> Gap: {proj.missingSkills.join(", ")}
                              </p>
                            )}
                          </div>

                          {/* Meta + actions */}
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-4 text-[10px] text-[#888]">
                              <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{proj.postedBy}</span>
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{proj.duration}</span>
                              <span className="flex items-center gap-1 text-emerald-400 font-bold">{proj.budget}</span>
                            </div>
                            <button
                              onClick={() => setInvitedProjects(prev => { const n = new Set(prev); n.add(proj.id); return n; })}
                              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${isInvited ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 cursor-default" : "silver-gradient text-black hover:opacity-90"}`}>
                              {isInvited ? <><CheckCircle2 className="w-3.5 h-3.5" /> Applied</> : <><ArrowRight className="w-3.5 h-3.5" /> Apply Now</>}
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                {/* Empty state after load */}
                {!matchLoading && !matchError && matchedProjects.length === 0 && (
                  <div className="text-center py-12 space-y-3">
                    <Briefcase className="w-10 h-10 text-white/20 mx-auto" />
                    <p className="text-white/40 text-sm">No matches yet. Complete your profile to unlock opportunities.</p>
                    <Link href="/developer/profile" className="inline-flex items-center gap-2 px-4 py-2 silver-gradient text-black text-xs font-black uppercase tracking-widest rounded-xl">
                      Complete Profile
                    </Link>
                  </div>
                )}

              </motion.section>
            )}

            {/* ── WORKSPACE TAB ────────────────────────────────────────────── */}
            {activeTab === "workspace" && (
              <motion.section key="workspace" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                
                {!project && (
                  <div className="glass-panel p-10 rounded-3xl border border-white/5 bg-white/[0.02] text-center space-y-6">
                    <div className="w-16 h-16 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center mx-auto">
                      <Code2 className="w-8 h-8 text-blue-400" />
                    </div>
                    <div>
                      <h2 className="text-white text-xl font-black tracking-tight">No Active Workspace Selected</h2>
                      <p className="text-[#888] text-sm font-light mt-2 max-w-sm mx-auto">
                        Select one of your active assignments from the Opportunities tab to open its dedicated project room and start coding.
                      </p>
                    </div>
                    <button onClick={() => setActiveTab("projects")} 
                      className="px-6 py-3 silver-gradient text-black font-black uppercase tracking-widest text-[10px] rounded-xl hover:scale-[1.02] transition-all">
                      Browse Active Projects
                    </button>
                    
                    {activeAssignments?.length > 0 && (
                      <div className="pt-6 border-t border-white/5 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
                        {activeAssignments.map(a => (
                          <Link key={a?.token || Math.random()} href={`/project-room?projectId=${a?.projectId || ""}&tab=milestones`}
                            className="p-4 glass-panel border border-white/5 hover:border-blue-500/30 bg-white/5 rounded-2xl flex items-center justify-between group transition-all">
                            <div className="text-left">
                              <div className="text-white font-bold text-sm group-hover:text-blue-400 transition-colors">{a.projectName}</div>
                              <div className="text-[9px] text-[#888] uppercase tracking-widest font-bold font-mono">ID: {a.projectId?.slice(-6)}</div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-blue-400 -translate-x-1 group-hover:translate-x-0 transition-all" />
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {project && (
                  <>
                    {generatingMilestones && (
                      <div className="p-5 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl flex items-center gap-3">
                        <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                        <div>
                          <p className="text-sm font-bold text-white">Generating AI Milestones…</p>
                          <p className="text-xs text-[#888]">Breaking {projectName} into tasks with prompts</p>
                        </div>
                      </div>
                    )}

                    {/* Milestone phase selector */}
                    <div className="flex gap-2 flex-wrap">
                      {milestones?.map(m => (
                        <button key={m?.id} onClick={() => setActiveMilestoneId(m.id)}
                          className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border ${activeMilestoneId === m.id ? `${COLOR_MAP[m.color] ?? "text-white bg-white/10 border-white/20"}` : "text-white/40 border-white/10 hover:text-white hover:border-white/20"}`}>
                          {m.phase}: {m.title}
                        </button>
                      ))}
                    </div>

                    <div className={`flex gap-6 ${selectedTask ? "flex-col lg:flex-row" : "flex-col"}`}>

                      {/* Task list */}
                      <div className={`space-y-3 ${selectedTask ? "lg:w-80 shrink-0" : "w-full"}`}>
                        <div className="flex items-center justify-between">
                          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">{activeMilestone?.title}</h3>
                          <span className="text-[10px] text-[#888]">{activeMilestone?.estimatedDays}d estimated</span>
                        </div>
                        {activeMilestone?.tasks?.map(task => {
                          const sc = STATUS_CONFIG[task?.status || "todo"] || STATUS_CONFIG.todo;
                          return (
                            <div key={task?.id || Math.random()}
                              onClick={() => handleStartTask(task)}
                              className={`p-4 rounded-2xl border cursor-pointer transition-all hover:border-white/20 ${selectedTask?.id === task?.id ? "border-blue-500/40 bg-blue-500/5" : "glass-panel border-white/10"}`}>
                              <div className="flex items-start justify-between gap-3 mb-2">
                                <h4 className="text-white text-sm font-bold leading-snug">{task.title}</h4>
                                <span className={`shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${sc.bg} ${sc.color}`}>{sc.label}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${TYPE_COLOR[task.type]}`}>
                                  {TYPE_ICON[task.type]} {task.type}
                                </span>
                                <span className={`text-[10px] font-bold uppercase ${PRIORITY_COLOR[task.priority]}`}>
                                  <Flag className="w-3 h-3 inline mr-1" />{task.priority}
                                </span>
                                <span className="text-[10px] text-[#888] ml-auto flex items-center gap-1">
                                  <Clock className="w-3 h-3" />{task.estimatedHours}h
                                </span>
                              </div>
                            </div>
                          );
                        })}
                        {!selectedTask && (
                          <button onClick={generateMilestones} disabled={generatingMilestones}
                            className="w-full py-3 border border-dashed border-white/15 text-white/40 hover:text-white hover:border-white/30 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2">
                            <RotateCcw className="w-3.5 h-3.5" /> Regenerate with AI
                          </button>
                        )}
                      </div>

                      {/* Task detail panel */}
                      {selectedTask && (
                        <div className="flex-1 space-y-5 min-w-0">
                          <div className="flex items-center justify-between">
                            <div className="space-y-1">
                              <h3 className="text-white text-xl font-bold">{selectedTask.title}</h3>
                              <p className="text-[#888] text-sm font-light">{selectedTask.description}</p>
                            </div>
                            <button onClick={() => setSelectedTask(null)} className="text-white/30 hover:text-white text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                              Close
                            </button>
                          </div>

                          {/* AI Prompt */}
                          <div className="glass-panel p-5 rounded-2xl border border-indigo-500/20 bg-indigo-500/5">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-indigo-400" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">AI Development Prompt</span>
                              </div>
                              <button onClick={copyPrompt} className="flex items-center gap-1 text-[10px] text-white/40 hover:text-white transition-colors font-bold uppercase tracking-widest">
                                {copiedPrompt ? <><Check className="w-3 h-3 text-green-500" /> Copied</> : <><Copy className="w-3 h-3" /> Copy Prompt</>}
                              </button>
                            </div>
                            <p className="text-white/70 text-xs font-light leading-relaxed">{selectedTask.aiPrompt}</p>
                            <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2 text-[10px] text-white/30">
                              <Info className="w-3 h-3" /> Paste this into Cursor or your AI coding assistant to generate the implementation
                            </div>
                          </div>

                          {/* Submission */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-black uppercase tracking-widest text-white/50">Your Submission</label>
                              {selectedTask.version > 1 && (
                                <span className="text-[10px] text-white/30 flex items-center gap-1">
                                  <GitBranch className="w-3 h-3" /> v{selectedTask.version}
                                </span>
                              )}
                            </div>
                            <textarea
                              ref={submissionRef}
                              value={submission}
                              onChange={e => setSubmission(e.target.value)}
                              placeholder="Paste your code, implementation, or description here..."
                              rows={10}
                              className="w-full bg-white/5 border border-white/10 focus:border-blue-500/50 focus:outline-none rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 font-mono resize-none transition-colors"
                            />
                            <div className="flex gap-3">
                              <button onClick={handleValidate} disabled={validating || !submission.trim()}
                                className="flex-1 py-3 bg-indigo-500 hover:bg-indigo-400 text-white font-black uppercase tracking-widest text-xs rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
                                {validating ? <><Loader2 className="w-4 h-4 animate-spin" /> Validating…</> : <><Sparkles className="w-4 h-4" /> Validate with AI</>}
                              </button>
                              {selectedTask.validationResult?.passed && (
                                <button onClick={() => {
                                  const mid = milestones.find(m => m.tasks.some(t => t.id === selectedTask.id))?.id ?? "";
                                  updateTaskStatus(mid, selectedTask.id, "review");
                                  setSelectedTask(prev => prev ? { ...prev, status: "review" } : null);
                                }} className="flex-1 py-3 bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 font-black uppercase tracking-widest text-xs rounded-xl hover:bg-emerald-500/30 transition-all flex items-center justify-center gap-2">
                                  <Send className="w-4 h-4" /> Submit for Review
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Validation result */}
                          {selectedTask.validationResult && (
                            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                              className={`p-5 rounded-2xl border space-y-4 ${selectedTask.validationResult.passed ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20"}`}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  {selectedTask.validationResult.passed
                                    ? <CheckCircle className="w-5 h-5 text-emerald-400" />
                                    : <XCircle className="w-5 h-5 text-red-400" />}
                                  <span className={`font-bold text-sm ${selectedTask.validationResult.passed ? "text-emerald-400" : "text-red-400"}`}>
                                    {selectedTask.validationResult.passed ? "Validation Passed" : "Validation Failed"}
                                  </span>
                                </div>
                                <div className={`text-2xl font-black ${selectedTask.validationResult.score >= 80 ? "text-emerald-400" : "text-red-400"}`}>
                                  {selectedTask.validationResult.score}<span className="text-sm">/100</span>
                                </div>
                              </div>
                              <p className="text-sm text-white/70 font-light">{selectedTask.validationResult.summary}</p>
                              <div className="grid grid-cols-1 gap-2">
                                {selectedTask.validationResult.checks.map((c, i) => (
                                  <div key={i} className="flex items-center gap-3 text-xs">
                                    {c.passed ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
                                    <span className={c.passed ? "text-white/70" : "text-red-400"}>{c.label}</span>
                                    <span className="text-[#888] ml-auto">{c.note}</span>
                                  </div>
                                ))}
                              </div>
                              {selectedTask.validationResult.issues.length > 0 && (
                                <div className="space-y-1">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-red-400">Issues</p>
                                  {selectedTask.validationResult.issues.map((iss, i) => (
                                    <p key={i} className="text-xs text-red-400/80 font-light flex items-start gap-2"><span>·</span>{iss}</p>
                                  ))}
                                </div>
                              )}
                              {selectedTask.validationResult.suggestions.length > 0 && (
                                <div className="space-y-1">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Suggestions</p>
                                  {selectedTask.validationResult.suggestions.map((s, i) => (
                                    <p key={i} className="text-xs text-white/50 font-light flex items-start gap-2"><span>·</span>{s}</p>
                                  ))}
                                </div>
                              )}
                            </motion.div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </motion.section>
            )}

            {/* ── PRD TAB ──────────────────────────────────────────────────── */}
            {activeTab === "prd" && (
              <motion.section key="prd" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                <div>
                  <h2 className="text-white font-black text-xl tracking-tight flex items-center gap-2">
                    <FileText className="w-5 h-5 text-indigo-400" /> Project Requirement Document
                  </h2>
                  <p className="text-white/40 text-xs font-light mt-1">AI-generated PRD shared after hire acceptance. This is your project contract.</p>
                </div>

                {prdLoading && (
                  <div className="flex items-center gap-3 p-5 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl">
                    <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                    <p className="text-sm text-white/70 font-light">Loading PRD documents…</p>
                  </div>
                )}

                {!prdLoading && prds.length === 0 && (
                  <div className="text-center py-16 space-y-4">
                    <FileText className="w-12 h-12 text-white/10 mx-auto" />
                    <p className="text-white/40 text-sm">No PRD available yet.</p>
                    <p className="text-white/20 text-xs">A PRD will appear here once a project creator hires you and accepts your response.</p>
                  </div>
                )}

                {!prdLoading && sortedPrds.map(prd => (
                  <div key={prd.id} className="glass-panel p-8 rounded-3xl border border-indigo-500/20 space-y-6">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded">{prd.version}</span>
                      <h3 className="text-2xl font-black text-white tracking-tighter">{prd.projectName}</h3>
                    </div>

                    {prd.projectBrief?.trim() && (
                      <div className="p-4 rounded-2xl bg-white/[0.04] border border-emerald-500/15 space-y-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400/90">
                          What the project creator submitted (your source of truth)
                        </p>
                        <p className="text-sm text-white/75 font-light leading-relaxed whitespace-pre-wrap">
                          {prd.projectBrief.trim()}
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Overview</p>
                        <p className="text-sm text-white/70 font-light leading-relaxed">{prd.overview}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Scope</p>
                        <p className="text-sm text-white/70 font-light leading-relaxed">{prd.scope}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Features</p>
                        <ul className="space-y-1.5">
                          {prd.features.map((f, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-white/60 font-light">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /> {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Tech Stack</p>
                        <div className="flex flex-wrap gap-1.5 mb-4">
                          {prd.techStack.map(t => (
                            <span key={t} className="px-2.5 py-1 rounded-lg text-[10px] font-bold border text-indigo-400 bg-indigo-500/10 border-indigo-500/20">{t}</span>
                          ))}
                        </div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Risks</p>
                        <ul className="space-y-1">
                          {prd.risks.map((r, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-yellow-400/70 font-light">
                              <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" /> {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Milestones</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {prd.milestones.map((m, i) => (
                          <div key={i} className="p-4 bg-white/5 rounded-xl border border-white/5">
                            <div className="text-[9px] text-white/30 uppercase tracking-widest font-bold mb-1">{m.phase}</div>
                            <div className="text-white font-bold text-sm mb-1">{m.title}</div>
                            <div className="text-[10px] text-white/40 mb-2">{m.duration}</div>
                            <ul className="space-y-1">
                              {m.deliverables.map((d, j) => (
                                <li key={j} className="text-[10px] text-white/50 font-light flex items-start gap-1">
                                  <span className="text-white/20">·</span> {d}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Chat CTA */}
                    {hireReqs.find(r => r.prdId === prd.id || r.token === prd.hireToken) && (
                      <button
                        onClick={() => { setActiveChatId(prd.hireToken); setActiveTab("chat"); }}
                        className="w-full py-3 border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 font-bold uppercase tracking-widest text-xs rounded-xl transition-all flex items-center justify-center gap-2">
                        <MessageSquare className="w-4 h-4" /> Open Chat with Client
                      </button>
                    )}
                  </div>
                ))}
              </motion.section>
            )}

            {/* ── CHAT TAB ─────────────────────────────────────────────────── */}
            {activeTab === "chat" && (
              <motion.section key="chat" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <h2 className="text-white font-black text-xl tracking-tight flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-indigo-400" /> Chat with Client
                </h2>

                {prdForActiveChat && (
                  <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/25 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">PRD for this chat</p>
                      <p className="text-sm text-white font-bold">{prdForActiveChat.projectName}</p>
                      <p className="text-xs text-white/45 font-light">Same hire as this thread — overview reflects this project.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("prd")}
                      className="shrink-0 px-4 py-2.5 rounded-xl bg-indigo-500/20 border border-indigo-500/35 text-indigo-200 text-xs font-bold uppercase tracking-widest hover:bg-indigo-500/30 transition-colors">
                      Open PRD
                    </button>
                  </div>
                )}

                {chatSubError && (
                  <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/25 text-red-200 text-sm font-light">
                    {chatSubError}
                  </div>
                )}

                {activeChatId && chatRoom && chatViewerUid && (() => {
                  const ping =
                    chatRoom.creatorUid === chatViewerUid
                      ? chatRoom.offlinePingForCreator
                      : chatRoom.developerUid === chatViewerUid
                        ? chatRoom.offlinePingForDeveloper
                        : null;
                  if (!ping) return null;
                  const which = chatRoom.creatorUid === chatViewerUid ? "creator" as const : "developer" as const;
                  return (
                    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <p className="text-sm text-amber-100/90 font-light">{ping}</p>
                      <button
                        type="button"
                        onClick={() => void clearOfflinePing(activeChatId, which)}
                        className="shrink-0 text-[10px] font-black uppercase tracking-widest text-amber-400 hover:text-white border border-amber-500/30 rounded-lg px-3 py-2"
                      >
                        Dismiss
                      </button>
                    </div>
                  );
                })()}

                {!activeChatId ? (
                  <div className="text-center py-16 space-y-4">
                    <MessageSquare className="w-12 h-12 text-white/10 mx-auto" />
                    <p className="text-white/40 text-sm">Chat is activated after you accept a hire invitation.</p>
                  </div>
                ) : (
                  <div className="glass-panel rounded-3xl border border-white/10 flex flex-col overflow-hidden" style={{ height: "60vh" }}>
                    <div className="p-4 border-b border-white/5 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shrink-0" />
                        <span className="text-white font-bold text-sm truncate">
                          {hireReqs.find(r => r.token === activeChatId)?.creatorName ?? "Project Creator"}
                        </span>
                        <span className="text-[10px] text-white/30 ml-auto sm:ml-2 shrink-0">
                          {hireReqs.find(r => r.token === activeChatId)?.projectName ?? "—"}
                        </span>
                      </div>
                      {hireReqs.filter(r => r.status === "accepted").length > 1 && (
                        <select
                          value={activeChatId}
                          onChange={e => setActiveChatId(e.target.value)}
                          className="w-full sm:w-auto sm:max-w-[240px] bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/50"
                        >
                          {hireReqs
                            .filter(r => r.status === "accepted")
                            .map(r => (
                              <option key={r.token} value={r.token}>
                                {r.projectName} · {r.creatorName}
                              </option>
                            ))}
                        </select>
                      )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 space-y-3">
                      {fireMsgs.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full gap-2 text-white/20">
                          <MessageSquare className="w-8 h-8" />
                          <p className="text-xs font-light">No messages yet. Start the conversation!</p>
                        </div>
                      )}
                      {chatBubbleRows.map(({ msg, isMine, label }) => (
                          <div
                            key={msg.id}
                            className={`flex w-full items-end gap-2 ${isMine ? "flex-row-reverse" : "flex-row"}`}
                          >
                            <div
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${
                                isMine ? "bg-emerald-400 text-zinc-900" : "bg-violet-500 text-white"
                              }`}
                              aria-hidden
                            >
                              {isMine
                                ? (developerProfile?.fullName || currentUser?.displayName || currentUser?.email || "Y")
                                    .slice(0, 1)
                                    .toUpperCase()
                                : (label || msg.senderName || "?").slice(0, 1).toUpperCase()}
                            </div>
                            <div
                              className={`max-w-[min(100%,380px)] rounded-2xl px-4 py-2.5 shadow-lg ${
                                isMine
                                  ? "rounded-br-md bg-emerald-600 text-white ring-1 ring-emerald-300/35"
                                  : "rounded-bl-md bg-zinc-800 text-zinc-100 ring-1 ring-violet-400/25"
                              }`}
                            >
                              <p
                                className={`text-[9px] font-bold uppercase tracking-widest mb-1 ${isMine ? "text-emerald-100/90" : "text-violet-300/95"}`}
                              >
                                {label}
                              </p>
                              <p className={`text-sm font-light leading-relaxed ${isMine ? "text-white" : "text-white/90"}`}>
                                {msg.text}
                              </p>
                              <p
                                className={`text-[9px] mt-1 tabular-nums ${isMine ? "text-emerald-100/65 text-right" : "text-white/40 text-left"}`}
                              >
                                {msg.sentAt
                                  ? new Date(msg.sentAt.seconds * 1000).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : ""}
                              </p>
                            </div>
                          </div>
                        ))}
                    </div>

                    <div className="p-4 border-t border-white/5 flex gap-3">
                      <input
                        value={chatText}
                        onChange={e => setChatText(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendFireMessage()}
                        placeholder="Type a message…"
                        className="flex-1 bg-white/5 border border-white/10 focus:border-indigo-500/50 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none transition-colors"
                      />
                      <button
                        onClick={sendFireMessage}
                        disabled={!chatText.trim() || chatSending}
                        className="px-4 py-3 silver-gradient text-black rounded-xl font-black disabled:opacity-40 flex items-center gap-2">
                        {chatSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}
              </motion.section>
            )}

            {/* ── ASSESSMENTS TAB — skill-matched tests + full profile for Tier 2 ─ */}
            {activeTab === "assessments" && (
              <motion.section key="assessments" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                <div className="p-5 bg-white/5 border border-white/10 rounded-2xl flex items-start gap-4">
                  <Shield className="w-5 h-5 text-white/40 shrink-0 mt-0.5" />
                  <p className="text-xs text-white/60 font-light leading-relaxed">
                    <strong className="text-white">How it works:</strong> Each test activates only when your profile skills overlap that topic. Pass the quiz, then <strong className="text-white">fill every profile section (95% “base” completion)</strong> to unlock <strong className="text-yellow-400">Tier 2 · Assessment-passed</strong> — the bar then shows 100% including the tier bonus. Tier 3 comes from delivering a BuildCraft project.
                  </p>
                </div>

                {userSkills.length === 0 && (
                  <div className="p-5 rounded-2xl border border-amber-500/25 bg-amber-500/5 flex flex-col sm:flex-row sm:items-center gap-4">
                    <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-white">Add skills to unlock tests</p>
                      <p className="text-xs text-white/50 font-light mt-1">Skill tests are generated from your profile. Add technologies you know (e.g. React, Supabase, Docker) under My Profile → Edit.</p>
                    </div>
                    <Link href="/developer/profile" className="shrink-0 px-5 py-3 silver-gradient text-black font-black uppercase tracking-widest text-[10px] rounded-xl text-center">
                      Edit skills
                    </Link>
                  </div>
                )}

                {needsProfileAfterSkillPass && (
                  <div className="p-5 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 flex flex-col sm:flex-row sm:items-center gap-4">
                    <Award className="w-6 h-6 text-indigo-400 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-white">Complete your profile to finalize verification</p>
                      <p className="text-xs text-white/60 font-light mt-1">
                        You passed at least one skill test. Finish every profile checklist item (photo, pay range, portfolio, etc.) until <strong className="text-white">base completion is 95%</strong> — then Tier 2 activates automatically. Base now: <strong className="text-indigo-300">{profileBasePct}%</strong> · bar with tier: <strong className="text-white/80">{completionPct}%</strong>
                      </p>
                    </div>
                    <Link href="/developer/profile" className="shrink-0 px-5 py-3 border border-indigo-500/40 text-indigo-200 font-black uppercase tracking-widest text-[10px] rounded-xl hover:bg-indigo-500/20 text-center">
                      Complete profile
                    </Link>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-5">
                  {derivedSkillAssessments.map((a, idx) => (
                    <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
                      className={`glass-panel p-6 rounded-2xl border transition-all ${a.status === "completed" ? "border-emerald-500/20" : a.status === "locked" ? "border-white/5 opacity-70" : "border-white/10 hover:border-white/20"}`}>
                      <div className="flex items-center justify-between flex-wrap gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <h3 className="text-white font-bold">{a.title}</h3>
                            {a.status === "completed" && <span className="text-[9px] text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded uppercase tracking-widest font-black">Passed</span>}
                            {a.status === "locked" && <Lock className="w-4 h-4 text-white/20" />}
                          </div>
                          <p className="text-[11px] text-white/40 font-light mb-2">{a.description}</p>
                          {a.status === "locked" && (
                            <p className="text-[10px] text-amber-500/80 font-light mb-2">
                              Unlock hint — add a skill such as: {a.skillTags.slice(0, 5).join(", ")}
                            </p>
                          )}
                          <div className="flex items-center gap-4 text-[10px] text-[#888] font-bold uppercase tracking-widest flex-wrap">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {a.duration}</span>
                            <span className="flex items-center gap-1"><BarChart2 className="w-3 h-3" /> {a.questionCount} questions</span>
                            <span className={a.difficulty === "Hard" ? "text-red-400" : a.difficulty === "Medium" ? "text-yellow-400" : "text-emerald-400"}>{a.difficulty}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          {a.status === "completed" && a.score != null && (
                            <div className="text-center">
                              <div className="text-2xl font-black text-white">{a.score}%</div>
                              <div className="text-[9px] text-emerald-500 uppercase tracking-widest font-bold">{a.badge}</div>
                            </div>
                          )}
                          {a.status === "available" && (
                            <button type="button" onClick={() => beginSkillAssessment(a.id)} className="px-6 py-3 silver-gradient text-black font-black uppercase tracking-widest text-[10px] rounded-xl">
                              Start Test
                            </button>
                          )}
                          {a.status === "completed" && <div className="w-10 h-10 bg-emerald-500/20 border border-emerald-500 rounded-full flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-emerald-500" /></div>}
                          {a.status === "locked" && <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-full flex items-center justify-center"><Lock className="w-5 h-5 text-white/20" /></div>}
                        </div>
                      </div>

                      {startedAssessment === a.id && a.status === "available" && (
                        <div className="mt-5 pt-5 border-t border-white/5 space-y-4">
                          <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Answer all questions to pass</p>
                          {a.questions.map((q, qi) => (
                            <div key={q.id} className="p-4 bg-white/[0.03] border border-white/10 rounded-xl space-y-2">
                              <p className="text-sm text-white font-medium">{qi + 1}. {q.prompt}</p>
                              <div className="flex flex-col gap-2">
                                {q.choices.map((choice, ci) => {
                                  const picked = (quizAnswers[a.id]?.[qi] ?? -1) === ci;
                                  return (
                                    <button
                                      key={ci}
                                      type="button"
                                      onClick={() => setQuizChoice(a.id, qi, ci)}
                                      className={`text-left text-xs px-3 py-2.5 rounded-lg border transition-all ${picked ? "border-indigo-500/50 bg-indigo-500/10 text-white" : "border-white/10 text-white/60 hover:border-white/20"}`}
                                    >
                                      {choice}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                          {assessmentFeedback && (
                            <p className="text-xs text-amber-400 font-light">{assessmentFeedback}</p>
                          )}
                          <div className="flex flex-wrap gap-3">
                            <button
                              type="button"
                              disabled={assessmentSubmitting || (quizAnswers[a.id] ?? []).length !== a.questions.length || !(quizAnswers[a.id] ?? []).every(x => x >= 0)}
                              onClick={() => submitSkillAssessment(a.id)}
                              className="px-6 py-3 silver-gradient text-black font-black uppercase tracking-widest text-[10px] rounded-xl disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              {assessmentSubmitting ? "Saving…" : "Submit answers"}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setStartedAssessment(null); setAssessmentFeedback(null); }}
                              className="px-4 py-3 text-white/40 text-[10px] font-bold uppercase tracking-widest hover:text-white/70"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              </motion.section>
            )}

            {/* ── PROFILE TAB ──────────────────────────────────────────────── */}
            {activeTab === "profile" && (
              <motion.section key="profile" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

                {/* Profile summary card with live data */}
                <div className="glass-panel p-6 rounded-3xl border border-indigo-500/20 bg-indigo-500/5">
                  <div className="flex items-start gap-5 flex-wrap">
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      <div className="w-20 h-20 rounded-full border-2 border-indigo-500/40 overflow-hidden bg-white/5 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                        {developerProfile?.photoURL ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={developerProfile.photoURL} alt={developerProfile.fullName} className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-8 h-8 text-white/20" />
                        )}
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-indigo-500 rounded-full border-2 border-black flex items-center justify-center">
                        <ShieldCheck className="w-3 h-3 text-white" />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-black text-xl tracking-tight">
                        {developerProfile?.fullName || userName}
                      </h3>
                      <p className="text-indigo-400 text-xs font-bold uppercase tracking-widest mt-0.5">
                        {developerProfile?.primaryRole ? developerProfile.primaryRole.replace("fullstack","Full Stack").replace("frontend","Frontend").replace("backend","Backend").replace("ai","AI / ML").replace("devops","DevOps") + " Developer" : "Developer"}
                      </p>
                      <p className="text-white/40 text-xs mt-1">{developerProfile?.location || "Location not set"}</p>

                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {(developerProfile?.skills ?? []).slice(0, 5).map(s => (
                          <span key={s} className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-md text-[9px] font-bold uppercase tracking-widest">{s}</span>
                        ))}
                        {(developerProfile?.skills?.length ?? 0) > 5 && (
                          <span className="px-2 py-0.5 bg-white/5 border border-white/10 text-white/30 rounded-md text-[9px] font-bold">+{(developerProfile?.skills?.length ?? 0) - 5}</span>
                        )}
                      </div>
                    </div>

                    <Link href="/developer/profile"
                      className="shrink-0 flex items-center gap-2 px-4 py-2.5 silver-gradient text-black font-black uppercase tracking-widest text-[10px] rounded-xl hover:opacity-90 transition-opacity">
                      <Edit3 className="w-3.5 h-3.5" /> Edit Profile
                    </Link>
                  </div>
                </div>

                {/* Workspace Stats */}
                <div className="glass-panel p-6 rounded-2xl border border-white/10">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50 mb-4">Workspace Stats</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: "Tasks Done",  value: `${doneTasks}`,  color: "text-emerald-400" },
                      { label: "In Progress", value: `${inProgress}`, color: "text-blue-400" },
                      { label: "In Review",   value: `${inReview}`,   color: "text-purple-400" },
                      { label: "Overall %",   value: `${progress}%`,  color: "text-yellow-400" },
                    ].map(s => (
                      <div key={s.label} className="p-4 bg-white/5 rounded-xl text-center border border-white/5">
                        <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
                        <div className="text-[10px] text-[#888] uppercase tracking-widest mt-1">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Professional details — live from profile */}
                <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">Professional Details</h3>
                    <Link href="/developer/profile" className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-widest transition-colors flex items-center gap-1">
                      <Edit3 className="w-3 h-3" /> Edit
                    </Link>
                  </div>

                  {/* Quick stats row */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Skills",    value: developerProfile?.skills?.length ?? 0,    color: "text-indigo-400" },
                      { label: "Tools",     value: developerProfile?.tools?.length ?? 0,     color: "text-purple-400" },
                      { label: "Exp (yrs)", value: developerProfile?.yearsExp ?? 0,          color: "text-blue-400"   },
                    ].map(s => (
                      <div key={s.label} className="p-3 bg-white/5 rounded-xl text-center border border-white/5">
                        <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
                        <div className="text-[9px] text-white/30 uppercase tracking-widest">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Skills */}
                  {(developerProfile?.skills?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-[9px] text-white/30 uppercase tracking-widest font-bold mb-2">Skills</p>
                      <div className="flex flex-wrap gap-1.5">
                        {developerProfile!.skills.map(s => {
                          const tierColor = developerProfile?.verificationStatus === "project-verified" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                            : developerProfile?.verificationStatus === "assessment-passed" ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
                            : "text-white/60 bg-white/5 border-white/10";
                          return (
                            <span key={s} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${tierColor}`}>
                              <ShieldCheck className="w-3 h-3" /> {s}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Tools */}
                  {(developerProfile?.tools?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-[9px] text-white/30 uppercase tracking-widest font-bold mb-2">Tools</p>
                      <div className="flex flex-wrap gap-1.5">
                        {developerProfile!.tools.map(t => (
                          <span key={t} className="px-2.5 py-1 rounded-lg text-[10px] font-bold border text-purple-400 bg-purple-500/10 border-purple-500/20">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Availability + pay */}
                  <div className="flex flex-wrap gap-3 pt-3 border-t border-white/5">
                    {developerProfile?.availability && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                        <Clock className="w-3 h-3 text-blue-400" />
                        <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest capitalize">{developerProfile.availability}</span>
                      </div>
                    )}
                    {(developerProfile?.payMin ?? 0) > 0 && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                        <span className="text-[10px] font-black text-emerald-400">${developerProfile!.payMin}–${developerProfile!.payMax}/{developerProfile?.payCurrency ?? "USD"}</span>
                      </div>
                    )}
                    {developerProfile?.profileStatus === "active" && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                        <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Open to Work</span>
                      </div>
                    )}
                  </div>

                  {/* Preferred project types */}
                  {(developerProfile?.preferredTypes?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-[9px] text-white/30 uppercase tracking-widest font-bold mb-2">Preferred Projects</p>
                      <div className="flex flex-wrap gap-1.5">
                        {developerProfile!.preferredTypes.map(t => (
                          <span key={t} className="px-2.5 py-1 rounded-lg text-[10px] font-bold border text-white/50 bg-white/5 border-white/10">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Portfolio links */}
                {(developerProfile?.githubUrl || developerProfile?.portfolioUrl || developerProfile?.resumeUrl) && (
                  <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-3">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">Portfolio Links</h3>
                      <Link href="/developer/profile" className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-widest transition-colors flex items-center gap-1">
                        <Edit3 className="w-3 h-3" /> Edit
                      </Link>
                    </div>
                    {developerProfile?.githubUrl && (
                      <a href={developerProfile.githubUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10 hover:border-white/20 transition-colors group">
                        <GitBranch className="w-4 h-4 text-white/40 group-hover:text-white transition-colors shrink-0" />
                        <span className="text-xs text-white/60 group-hover:text-white transition-colors truncate">{developerProfile.githubUrl.replace("https://", "")}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white shrink-0 ml-auto transition-colors" />
                      </a>
                    )}
                    {developerProfile?.portfolioUrl && (
                      <a href={developerProfile.portfolioUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10 hover:border-white/20 transition-colors group">
                        <Activity className="w-4 h-4 text-white/40 group-hover:text-white transition-colors shrink-0" />
                        <span className="text-xs text-white/60 group-hover:text-white transition-colors truncate">{developerProfile.portfolioUrl.replace("https://", "")}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white shrink-0 ml-auto transition-colors" />
                      </a>
                    )}
                    {developerProfile?.resumeUrl && (
                      <a href={developerProfile.resumeUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10 hover:border-white/20 transition-colors group">
                        <FileText className="w-4 h-4 text-white/40 group-hover:text-white transition-colors shrink-0" />
                        <span className="text-xs text-white/60 group-hover:text-white transition-colors truncate">Resume / CV</span>
                        <ArrowRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white shrink-0 ml-auto transition-colors" />
                      </a>
                    )}
                    {(developerProfile?.projectDescriptions?.length ?? 0) > 0 && (
                      <div className="pt-2 border-t border-white/5">
                        <p className="text-[9px] text-white/30 uppercase tracking-widest font-bold mb-2">Past Projects ({developerProfile!.projectDescriptions.length})</p>
                        <div className="space-y-2">
                          {developerProfile!.projectDescriptions.slice(0, 2).map((d, i) => (
                            <p key={i} className="text-xs text-white/50 font-light line-clamp-2 leading-relaxed border-l-2 border-white/10 pl-3">{d}</p>
                          ))}
                          {developerProfile!.projectDescriptions.length > 2 && (
                            <Link href="/developer/profile" className="text-[10px] text-indigo-400 font-bold">+ {developerProfile!.projectDescriptions.length - 2} more</Link>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Profile completeness */}
                {(() => {
                  const score = profileCompletion(developerProfile);
                  const checks = [
                    { task: "Upload profile photo",       done: !!(developerProfile?.photoURL),                                    points: 10 },
                    { task: "Add full name",              done: !!(developerProfile?.fullName),                                    points: 15 },
                    { task: "Add phone & location",       done: !!(developerProfile?.phone && developerProfile?.location),          points: 10 },
                    { task: "Add skills (min 3)",          done: (developerProfile?.skills?.length ?? 0) >= 3,                      points: 15 },
                    { task: "Add tools used",             done: (developerProfile?.tools?.length ?? 0) > 0,                        points: 5  },
                    { task: "Add GitHub or portfolio",    done: !!(developerProfile?.githubUrl || developerProfile?.portfolioUrl),  points: 15 },
                    { task: "Add past project description", done: (developerProfile?.projectDescriptions?.length ?? 0) > 0,        points: 10 },
                    { task: "Set availability & pay",     done: (developerProfile?.payMin ?? 0) > 0,                               points: 10 },
                    { task: "Pick preferred project types", done: (developerProfile?.preferredTypes?.length ?? 0) > 0,             points: 5  },
                    { task: "Upgrade skill verification", done: developerProfile?.verificationStatus !== "self-declared",           points: 5  },
                  ];
                  return (
                    <div className="glass-panel p-6 rounded-2xl border border-white/10">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">Profile Completeness</h3>
                        <span className={`font-black text-lg ${score >= 80 ? "text-emerald-400" : score >= 50 ? "text-yellow-400" : "text-red-400"}`}>{score}%</span>
                      </div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-5">
                        <div className={`h-full rounded-full transition-all duration-700 ${score >= 80 ? "bg-emerald-500" : score >= 50 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${score}%` }} />
                      </div>
                      <div className="space-y-0">
                        {checks.map((item, i) => (
                          <div key={i} className="flex items-center gap-3 text-xs py-2.5 border-b border-white/5 last:border-0">
                            <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${item.done ? "bg-emerald-500/20 border border-emerald-500" : "bg-white/5 border border-white/10"}`}>
                              {item.done && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                            </div>
                            <span className={`flex-1 ${item.done ? "text-white/40 line-through" : "text-white"}`}>{item.task}</span>
                            <span className={`text-[9px] font-bold ${item.done ? "text-emerald-400" : "text-white/20"}`}>+{item.points}%</span>
                            {!item.done && (
                              <Link href="/developer/profile" className="text-[9px] text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-widest transition-colors">Fix →</Link>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Quick link to full profile editor */}
                <Link href="/developer/profile"
                  className="flex items-center justify-center gap-3 w-full py-4 glass-panel border border-indigo-500/20 bg-indigo-500/5 text-indigo-400 hover:bg-indigo-500/10 rounded-2xl font-bold text-sm uppercase tracking-widest transition-all">
                  <Edit3 className="w-5 h-5" /> Open Full Profile Editor
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
