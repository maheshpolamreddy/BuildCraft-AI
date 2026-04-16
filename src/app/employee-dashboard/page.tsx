"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck, User, Star, Activity, AlertTriangle, Briefcase,
  FileText, CheckCircle2, Award, Clock,
  Shield, Lock, Edit3, BarChart2,
  Play, Loader2, Code2, LogOut,
  ArrowRight, Sparkles, Flag, AlertCircle,
  GitBranch, RotateCcw, ExternalLink,
} from "lucide-react";
import { useStore } from "@/store/useStore";
import { logAction } from "@/lib/auditLog";
import { parseJsonResponse } from "@/lib/parse-api-json";
import {
  getDeveloperProfile,
  subscribeToDeveloperProfile,
  updateDeveloperProfileField,
  isDeveloperRegistrationComplete,
  type DeveloperProfile as DevProfileType,
} from "@/lib/developerProfile";
import { type MatchedProject } from "@/app/api/match-projects/route";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOutUser } from "@/lib/auth";
import { subscribeHireRequestsByDeveloper, type HireRequest } from "@/lib/hireRequests";
import { getProject, claimProjectAsDeveloper } from "@/lib/firestore";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { DeveloperFlowBreadcrumb } from "@/components/FlowNavigation";
import { formatDateTimeSmart } from "@/lib/dateDisplay";

// ── Types ─────────────────────────────────────────────────────────────────────
type Tab = "projects" | "workspace" | "assessments" | "profile";

/** Live row from `projects/{id}` for dashboard + workspace cards (single source of truth). */
type WorkspaceCompletionRow = {
  completed: boolean;
  completedAt?: number;
  deployUrl?: string;
  displayName: string;
};

function parseProjectDocToWorkspaceMeta(data: Record<string, unknown>): WorkspaceCompletionRow {
  const proj = data.project as Record<string, unknown> | undefined;
  const nestedDone = proj?.lifecycleStatus === "completed";
  const rootDone = data.completionStatus === "completed";
  const completed = Boolean(nestedDone || rootDone);
  let completedAt: number | undefined;
  const ca = proj?.completedAt;
  if (typeof ca === "number") completedAt = ca;
  else if (ca && typeof (ca as { toMillis?: () => number }).toMillis === "function") {
    completedAt = (ca as { toMillis: () => number }).toMillis();
  }
  if (completedAt == null && typeof data.completionRecordedAtMs === "number") {
    completedAt = data.completionRecordedAtMs;
  }
  let deployUrl: string | undefined;
  if (typeof proj?.completionDeploymentUrl === "string") deployUrl = proj.completionDeploymentUrl;
  else if (typeof data.completionDeploymentUrlRoot === "string") deployUrl = data.completionDeploymentUrlRoot;
  const displayName = typeof proj?.name === "string" ? proj.name : "";
  return { completed, completedAt, deployUrl, displayName };
}

function normalizeHireProjectName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Tolerant match for hire card title vs Firestore `project.name` (typos e.g. Alra vs AIra). */
function levenshtein(a: string, b: string): number {
  if (a.length < b.length) return levenshtein(b, a);
  const prev = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let cur0 = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev[j - 1] = cur0;
      cur0 = cur;
    }
    prev[b.length] = cur0;
  }
  return prev[b.length];
}

function namesLikelySameProject(hireName: string, docName: string): boolean {
  const a = normalizeHireProjectName(hireName);
  const b = normalizeHireProjectName(docName);
  if (!a || !b) return false;
  if (a === b) return true;
  const A = a.replace(/[^a-z0-9]/gi, "");
  const B = b.replace(/[^a-z0-9]/gi, "");
  if (!A || !B) return false;
  if (A === B) return true;
  if (A.length >= 8 && B.length >= 8 && (A.includes(B) || B.includes(A))) return true;
  const maxDist = Math.min(3, Math.max(1, Math.floor(Math.min(A.length, B.length) / 6)));
  return levenshtein(A, B) <= maxDist;
}

/**
 * Match hire row to saved project doc: prefer hire.projectId, else same normalized display name
 * (covers legacy invites created before projectId was persisted).
 */
function resolveAssignmentProjectState(
  a: HireRequest,
  map: Record<string, WorkspaceCompletionRow>,
): { meta?: WorkspaceCompletionRow; effectiveProjectId?: string } {
  const pid = a.projectId?.trim();
  if (pid) {
    const m = map[pid];
    if (m) return { meta: m, effectiveProjectId: pid };
    return { effectiveProjectId: pid };
  }
  if (!normalizeHireProjectName(a.projectName ?? "")) return {};
  for (const [id, meta] of Object.entries(map)) {
    if (meta.displayName && namesLikelySameProject(a.projectName ?? "", meta.displayName)) {
      return { meta, effectiveProjectId: id };
    }
  }
  return {};
}

// ── Role label map ────────────────────────────────────────────────────────────
const ROLE_LABEL: Record<string, string> = {
  frontend: "Frontend Developer",
  backend:  "Backend Developer",
  fullstack: "Full Stack Developer",
  ai:       "AI / ML Engineer",
  devops:   "DevOps Engineer",
};

const TIER_CONFIG = {
  "self-declared":     { tierNumber: 1, label: "Tier 1",    subtitle: "Self-declared",    color: "text-white/50",    border: "border-white/10",           icon: <Edit3 className="w-3.5 h-3.5" />, dots: 1 },
  "assessment-passed": { tierNumber: 2, label: "Tier 2",    subtitle: "Assessment-passed", color: "text-yellow-400",  border: "border-yellow-500/30",      icon: <Award className="w-3.5 h-3.5" />, dots: 2 },
  "project-verified":  { tierNumber: 3, label: "Tier 3",    subtitle: "Project-verified",  color: "text-emerald-400", border: "border-emerald-500/30",     icon: <ShieldCheck className="w-3.5 h-3.5" />, dots: 3 },
} as const;

function tierKeyFromProfile(status: string | undefined): keyof typeof TIER_CONFIG {
  if (status === "project-verified" || status === "assessment-passed" || status === "self-declared") {
    return status;
  }
  return "self-declared";
}

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
  const { project, currentUser, developerProfile, setDeveloperProfile, patchDeveloperProfile, reset, addUserRole, userRoles, setRole, setProject, setSavedProjectId } = useStore();

  const [hireReqs,     setHireReqs]    = useState<HireRequest[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("projects");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    const allowed: Tab[] = ["projects", "workspace", "assessments", "profile"];
    if (t && allowed.includes(t)) setActiveTab(t);
  }, []);
  const [startedAssessment, setStartedAssessment] = useState<string | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number[]>>({});
  const [assessmentSubmitting, setAssessmentSubmitting] = useState(false);
  const [assessmentFeedback, setAssessmentFeedback] = useState<string | null>(null);

  const [matchedProjects, setMatchedProjects]   = useState<MatchedProject[]>([]);
  const [matchLoading, setMatchLoading]         = useState(false);
  const [matchError, setMatchError]             = useState(false);
  const [invitedProjects, setInvitedProjects]   = useState<Set<string>>(new Set());
  const [respondLoading,   setRespondLoading]    = useState<string | null>(null);
  const [respondError,     setRespondError]      = useState<string | null>(null);
  /** projectId → completion info from saved project doc (merged: developerUid query + per-id listeners). */
  const [workspaceCompletion, setWorkspaceCompletion] = useState<Record<string, WorkspaceCompletionRow>>({});
  /** Dual-approval completion also mirrored on projectExecution/{id}. */
  const [executionCompletedByProjectId, setExecutionCompletedByProjectId] = useState<
    Record<string, boolean>
  >({});
  const rewardsHealAttempted = useRef<Set<string>>(new Set());

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

  const pendingInvitations = useMemo(
    () => hireReqs.filter(r => r.status === "pending"),
    [hireReqs]
  );

  const activeAssignments = useMemo(
    () => hireReqs.filter(r => r.status === "accepted"),
    [hireReqs]
  );

  const activeAssignmentProjectIdsKey = useMemo(
    () =>
      activeAssignments
        .map((a) => a.projectId)
        .filter(Boolean)
        .sort()
        .join("|"),
    [activeAssignments],
  );

  /** Includes fuzzy name–matched Firestore ids so projectExecution listeners still attach. */
  const executionWatchIdsKey = useMemo(() => {
    const ids = new Set<string>();
    for (const a of activeAssignments) {
      const raw = a.projectId?.trim();
      if (raw) ids.add(raw);
      else {
        const st = resolveAssignmentProjectState(a, workspaceCompletion);
        if (st.effectiveProjectId?.trim()) ids.add(st.effectiveProjectId.trim());
      }
    }
    return [...ids].sort().join("|");
  }, [activeAssignments, workspaceCompletion]);

  /** All projects assigned to this developer (top-level developerUid) — fixes missing hire.projectId. */
  useEffect(() => {
    const uid = currentUser?.uid;
    if (!uid || uid === "demo-guest") return;
    const q = query(collection(db, "projects"), where("developerUid", "==", uid));
    return onSnapshot(q, (snap) => {
      setWorkspaceCompletion((prev) => {
        const next = { ...prev };
        snap.docs.forEach((d) => {
          next[d.id] = parseProjectDocToWorkspaceMeta(d.data() as Record<string, unknown>);
        });
        return next;
      });
    });
  }, [currentUser?.uid]);

  /** Per hire.projectId listener — covers docs where developerUid on root is missing/stale. */
  useEffect(() => {
    const ids = activeAssignments.map((a) => a.projectId).filter((id): id is string => Boolean(id?.trim()));
    if (!ids.length) return;
    const unsubs = ids.map((id) =>
      onSnapshot(doc(db, "projects", id), (snap) => {
        if (!snap.exists()) return;
        const row = parseProjectDocToWorkspaceMeta(snap.data() as Record<string, unknown>);
        setWorkspaceCompletion((prev) => ({
          ...prev,
          [id]: row,
        }));
      }),
    );
    return () => unsubs.forEach((u) => u());
  }, [activeAssignmentProjectIdsKey]);

  useEffect(() => {
    const unique = executionWatchIdsKey.split("|").filter(Boolean);
    if (!unique.length) return;
    const unsubs = unique.map((id) =>
      onSnapshot(doc(db, "projectExecution", id), (snap) => {
        const done =
          snap.exists() && (snap.data() as { status?: string }).status === "completed";
        setExecutionCompletedByProjectId((prev) => ({ ...prev, [id]: done }));
      }),
    );
    return () => unsubs.forEach((u) => u());
  }, [executionWatchIdsKey]);

  const mergedWorkspaceCompletion = useMemo(() => {
    const out: Record<string, WorkspaceCompletionRow> = { ...workspaceCompletion };
    for (const [id, execDone] of Object.entries(executionCompletedByProjectId)) {
      if (!execDone) continue;
      const cur = out[id];
      out[id] = {
        completed: true,
        completedAt: cur?.completedAt,
        deployUrl: cur?.deployUrl,
        displayName: cur?.displayName ?? "",
      };
    }
    return out;
  }, [workspaceCompletion, executionCompletedByProjectId]);

  const openClientProjects = useMemo(
    () =>
      activeAssignments.filter((r) => {
        const { meta } = resolveAssignmentProjectState(r, mergedWorkspaceCompletion);
        return !meta?.completed;
      }),
    [activeAssignments, mergedWorkspaceCompletion],
  );

  const completedClientProjects = useMemo(
    () =>
      activeAssignments.filter((r) => {
        const { meta } = resolveAssignmentProjectState(r, mergedWorkspaceCompletion);
        return meta?.completed === true;
      }),
    [activeAssignments, mergedWorkspaceCompletion],
  );

  const closedHireCount = useMemo(
    () => hireReqs.filter(r => r.status === "rejected" || r.status === "expired").length,
    [hireReqs],
  );

  /** Live counts: profile + workspace snapshots stay in sync after dual-approved completion. */
  const devDashboardMetrics = useMemo(() => {
    const acceptedList = hireReqs.filter((r) => r.status === "accepted");
    const requestsAccepted = acceptedList.length;
    let activeProjects = 0;
    let completedFromWorkspaces = 0;
    for (const r of acceptedList) {
      const { meta } = resolveAssignmentProjectState(r, mergedWorkspaceCompletion);
      if (meta?.completed) completedFromWorkspaces++;
      else activeProjects++;
    }
    const profileCompleted = developerProfile?.completedProjectsCount ?? 0;
    const completedProjects = Math.max(profileCompleted, completedFromWorkspaces);
    return {
      completedProjects,
      activeProjects,
      closedProjects: closedHireCount,
      requestsAccepted,
    };
  }, [
    hireReqs,
    mergedWorkspaceCompletion,
    developerProfile?.completedProjectsCount,
    closedHireCount,
  ]);

  /** Self-heal Tier 3 / counts if project completed but Admin rewards never ran (e.g. old client-only path). */
  useEffect(() => {
    const uid = currentUser?.uid;
    if (!uid || uid === "demo-guest") return;

    const sync = async () => {
      const user = auth.currentUser;
      if (!user) return;

      for (const hire of activeAssignments) {
        const { meta, effectiveProjectId } = resolveAssignmentProjectState(
          hire,
          mergedWorkspaceCompletion,
        );
        const pid = effectiveProjectId?.trim();
        if (!pid || !meta?.completed) continue;

        const ids = developerProfile?.completedProjectIds ?? [];
        const alreadyRecorded = ids.includes(pid);
        const tierOk = developerProfile?.verificationStatus === "project-verified";
        if (tierOk && alreadyRecorded) continue;
        if (rewardsHealAttempted.current.has(pid)) continue;

        rewardsHealAttempted.current.add(pid);
        try {
          const idToken = await user.getIdToken();
          const res = await fetch("/api/project-completion-rewards", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              idToken,
              projectId: pid,
              projectName: hire.projectName,
            }),
          });
          if (!res.ok) rewardsHealAttempted.current.delete(pid);
        } catch {
          rewardsHealAttempted.current.delete(pid);
        }
      }
    };

    void sync();
  }, [
    activeAssignments,
    mergedWorkspaceCompletion,
    developerProfile?.verificationStatus,
    developerProfile?.completedProjectIds?.join("|"),
    currentUser?.uid,
  ]);

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

  // ── Profile: load once for gate, then real-time sync (tier, badges, counts) ─
  const firebaseUid = currentUser?.uid ?? null;
  useEffect(() => {
    if (!firebaseUid || firebaseUid === "demo-guest") return;
    let cancelled = false;
    let unsub: (() => void) | null = null;
    void (async () => {
      const fresh = await getDeveloperProfile(firebaseUid);
      if (cancelled) return;
      if (fresh) setDeveloperProfile(fresh);
      if (!isDeveloperRegistrationComplete(fresh)) {
        router.replace("/developer");
        return;
      }
      unsub = subscribeToDeveloperProfile(firebaseUid, (live) => {
        if (live) setDeveloperProfile(live);
      });
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [firebaseUid, router, setDeveloperProfile]);

  // ── Hire requests (real-time) ────────────────────────────────────────────
  useEffect(() => {
    const uid = currentUser?.uid;
    if (!uid || uid === "demo-guest") return;
    return subscribeHireRequestsByDeveloper(uid, setHireReqs);
  }, [currentUser?.uid]);

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
        const pid = String(
          data?.projectId || hireReqs.find((r) => r.token === token)?.projectId || "",
        ).trim();
        if (pid) await openDeveloperWorkspace(pid);
        else router.push("/employee-dashboard?tab=workspace");
      }
    } catch (err) {
      setRespondError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRespondLoading(null);
    }
  }

  async function openDeveloperWorkspace(projectId: string | null | undefined) {
    const pid = String(projectId || "").trim();
    if (!pid || !currentUser?.uid) return;
    await claimProjectAsDeveloper(pid, currentUser.uid).catch(() => {});
    const saved = await getProject(pid).catch(() => null);
    if (saved) {
      setProject({
        ...saved.project,
        creatorUid: saved.project.creatorUid || saved.uid,
        creatorEmail: saved.project.creatorEmail || saved.email,
        developerUid: currentUser.uid,
      });
      setSavedProjectId(pid);
    }
    router.push(`/developer/workspace/${encodeURIComponent(pid)}`);
  }

  function renderOpportunitiesProjectCard(assignment: HireRequest) {
    const { meta: wc, effectiveProjectId } = resolveAssignmentProjectState(
      assignment,
      mergedWorkspaceCompletion,
    );
    const isDone = wc?.completed === true;
    const pidForOpen = (effectiveProjectId ?? assignment.projectId)?.trim() ?? "";
    const enterWorkspace = () => openDeveloperWorkspace(pidForOpen || undefined);
    return (
      <div
        key={assignment.token}
        className={`glass-panel p-6 rounded-2xl border transition-all ${
          isDone
            ? "border-emerald-500/35 bg-emerald-500/[0.07] hover:border-emerald-500/50"
            : "border-blue-500/20 bg-blue-500/5 hover:border-blue-500/40"
        }`}
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              {isDone ? (
                <>
                  <span className="text-[9px] text-emerald-400 font-black uppercase tracking-widest px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10">
                    ✓ Completed
                  </span>
                  <span className="text-[9px] text-amber-400 font-black uppercase tracking-widest px-2 py-0.5 rounded-full border border-amber-500/25 bg-amber-500/10">
                    Tier 3 · Project Verified
                  </span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-widest">In progress</span>
                </>
              )}
            </div>
            <h3 className="text-white font-black">{assignment.projectName}</h3>
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mt-1">Client: {assignment.creatorName}</p>
            {isDone && wc?.completedAt != null && (
              <p className="text-[10px] text-white/35 mt-1">
                Completed {new Date(wc.completedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
              </p>
            )}
            {isDone && wc?.deployUrl ? (
              <a
                href={wc.deployUrl.startsWith("http") ? wc.deployUrl : `https://${wc.deployUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-emerald-400/90 hover:text-emerald-300 mt-2 font-bold"
              >
                <ExternalLink className="w-3 h-3" /> Deployment
              </a>
            ) : null}
          </div>
          <button
            type="button"
            onClick={enterWorkspace}
            disabled={!pidForOpen}
            className={`p-2.5 rounded-xl transition-all ${
              isDone
                ? "bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/25"
                : "bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={enterWorkspace}
          disabled={!pidForOpen}
          className={`w-full py-2.5 flex items-center justify-center gap-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
            isDone
              ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25"
              : "bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10"
          }`}
        >
          <Play className="w-3.5 h-3.5" /> {isDone ? "View workspace (read-only)" : "Open workspace"}
        </button>
      </div>
    );
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

        {/* Verification tier — horizontal capsule + bottom notch (always shows 1 / 2 / 3) */}
        <div className="mb-5">
          {(() => {
            const tier = tierKeyFromProfile(developerProfile?.verificationStatus);
            const cfg = TIER_CONFIG[tier];
            const completion = profileCompletion(developerProfile);
            const tier3Glow = tier === "project-verified";
            const tierNum = cfg.tierNumber;

            return (
              <>
                <div className="relative pb-3">
                  <div
                    className={`relative flex w-full min-h-[4.5rem] items-center gap-3 rounded-full border-2 px-4 py-3 shadow-inner ${
                      tier3Glow
                        ? "border-amber-400/55 bg-gradient-to-br from-[#1a1208] via-[#0c0c0c] to-[#140a1a] shadow-[0_0_32px_-10px_rgba(251,191,36,0.35)]"
                        : tier === "assessment-passed"
                          ? "border-yellow-500/45 bg-[#0a0a0a]"
                          : "border-white/20 bg-[#0a0a0a]"
                    }`}
                  >
                    {tier3Glow && (
                      <div
                        className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-r from-amber-500/[0.07] via-transparent to-purple-500/[0.07]"
                        aria-hidden
                      />
                    )}
                    <div
                      className={`relative z-10 flex h-12 min-w-[3rem] shrink-0 items-center justify-center rounded-xl border-2 text-3xl font-black tabular-nums leading-none text-white ${
                        tier3Glow
                          ? "border-amber-400/60 bg-amber-500/25 text-amber-50"
                          : tier === "assessment-passed"
                            ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-100"
                            : "border-white/25 bg-white/[0.08] text-white"
                      }`}
                      aria-label={`Verification tier ${tierNum}`}
                    >
                      {tierNum}
                    </div>
                    <div className="relative z-10 min-w-0 flex-1 text-left">
                      <p className={`text-[11px] font-black uppercase tracking-[0.22em] ${cfg.color}`}>
                        {cfg.label}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-wider text-white/50">
                        {cfg.subtitle}
                      </p>
                    </div>
                    <div className={`relative z-10 shrink-0 ${cfg.color}`}>{cfg.icon}</div>
                  </div>
                  {/* Bottom-center tab / notch */}
                  <div
                    className={`pointer-events-none absolute bottom-0 left-1/2 z-20 h-2.5 w-10 -translate-x-1/2 translate-y-px rounded-t-md border border-b-0 bg-[#050505] sm:w-12 ${
                      tier3Glow ? "border-amber-400/35" : "border-white/20"
                    }`}
                    aria-hidden
                  />
                </div>

                <div className="mt-1 flex items-center justify-center gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className={`h-1.5 w-8 rounded-full transition-all ${
                        i < cfg.dots ? DOT_COLORS[i] : "bg-white/10"
                      }`}
                    />
                  ))}
                </div>
                <div className="relative mt-3 space-y-1">
                  <div className="flex justify-between text-[9px] font-bold uppercase tracking-widest">
                    <span className="text-white/30">Profile</span>
                    <span
                      className={
                        completion >= 80 ? "text-emerald-400" : completion >= 50 ? "text-yellow-400" : "text-red-400"
                      }
                    >
                      {completion}%
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        completion >= 80 ? "bg-emerald-500" : completion >= 50 ? "bg-yellow-500" : "bg-red-500"
                      }`}
                      style={{ width: `${completion}%` }}
                    />
                  </div>
                  {tier3Glow && typeof developerProfile?.completedProjectsCount === "number" && (
                    <p className="mt-2 border-t border-white/10 pt-2 text-[9px] font-bold text-amber-200/90">
                      Verified completions: {developerProfile.completedProjectsCount}
                    </p>
                  )}
                </div>
              </>
            );
          })()}
        </div>

        {/* Live analytics — updates in real time via Firestore listeners */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          {[
            {
              label: "Completed",
              value: String(devDashboardMetrics.completedProjects),
              icon: <CheckCircle2 className="w-3 h-3" />,
              color: "text-emerald-400",
            },
            {
              label: "Active",
              value: String(devDashboardMetrics.activeProjects),
              icon: <Briefcase className="w-3 h-3" />,
              color: "text-blue-400",
            },
            {
              label: "Closed",
              value: String(devDashboardMetrics.closedProjects),
              icon: <Flag className="w-3 h-3" />,
              color: "text-white/45",
            },
            {
              label: "Requests accepted",
              value: String(devDashboardMetrics.requestsAccepted),
              icon: <ShieldCheck className="w-3 h-3" />,
              color: "text-amber-400",
            },
          ].map((s) => (
            <div key={s.label} className="p-3 bg-white/5 rounded-xl text-center border border-white/5">
              <div className={`flex items-center justify-center gap-1 mb-1 ${s.color}`}>{s.icon}</div>
              <div className={`font-bold text-sm ${s.color}`}>{s.value}</div>
              <div className="text-[9px] text-[#888] uppercase tracking-widest leading-tight">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {[
            { label: "Pending invites", value: String(pendingInvitations.length), icon: <Star className="w-3 h-3" />, color: "text-yellow-400" },
            { label: "Skill tests open", value: String(openSkillTestCount), icon: <Activity className="w-3 h-3" />, color: "text-indigo-400" },
          ].map((s) => (
            <div key={s.label} className="p-2.5 bg-white/[0.03] rounded-lg text-center border border-white/[0.06]">
              <div className={`flex items-center justify-center gap-1 mb-0.5 ${s.color}`}>{s.icon}</div>
              <div className={`font-bold text-xs ${s.color}`}>{s.value}</div>
              <div className="text-[8px] text-[#666] uppercase tracking-widest">{s.label}</div>
            </div>
          ))}
        </div>

        <nav className="flex-grow space-y-2">
          {([
            { id: "projects",    label: "Opportunities",  icon: <Briefcase className="w-5 h-5" />, badge: pendingInvitations.length > 0 ? String(pendingInvitations.length) : null },
            { id: "workspace",   label: "Workspaces",     icon: <Code2 className="w-5 h-5" />, badge: devDashboardMetrics.activeProjects > 0 ? String(devDashboardMetrics.activeProjects) : null },
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
            <p className="text-[10px] text-[#888] font-light">
              {devDashboardMetrics.activeProjects} in-progress workspace{devDashboardMetrics.activeProjects === 1 ? "" : "s"}
              {devDashboardMetrics.completedProjects > 0
                ? ` · ${devDashboardMetrics.completedProjects} completed`
                : ""}
              {pendingInvitations.length > 0 ? ` · ${pendingInvitations.length} invite${pendingInvitations.length === 1 ? "" : "s"} pending` : ""}
            </p>
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
                   : activeTab === "workspace" ? "Workspaces"
                   : activeTab === "assessments" ? "Skill Assessments"
                   : "My Profile"}
                </h1>
                <p className="text-[#888] text-lg font-light tracking-wide mt-1">
                  {activeTab === "projects" ? "Invitations, your active client projects, and AI-matched opportunities."
                   : activeTab === "workspace" ? "Open a dedicated room per project — PRD, chat, milestones, and files stay scoped to that client."
                   : activeTab === "assessments" ? "Tests unlock from your profile skills. Finish your full profile after passing to activate Tier 2 verification."
                   : "Your verified developer profile."}
                </p>
              </div>
            </div>
          </header>

          <AnimatePresence mode="wait">

            {/* ── PROJECTS TAB ─────────────────────────────────────────────── */}
            {activeTab === "projects" && (
              <motion.section key="projects" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">

                {respondError && (
                  <div className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-red-500/25 bg-red-500/10 text-red-200 text-sm">
                    <span className="font-light leading-relaxed">{respondError}</span>
                    <button
                      type="button"
                      onClick={() => setRespondError(null)}
                      className="shrink-0 text-[10px] font-black uppercase tracking-widest text-red-300 hover:text-white"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

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

                {/* ── CLIENT PROJECTS (live status from Firestore project docs) ── */}
                {(completedClientProjects.length > 0 || openClientProjects.length > 0) && (
                  <div className="space-y-8">
                    {completedClientProjects.length > 0 && (
                      <div className="space-y-4">
                        <h2 className="text-white font-black tracking-tight flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-emerald-400" /> Completed projects
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {completedClientProjects.map((assignment) => renderOpportunitiesProjectCard(assignment))}
                        </div>
                      </div>
                    )}
                    {openClientProjects.length > 0 && (
                      <div className="space-y-4">
                        <h2 className="text-white font-black tracking-tight flex items-center gap-2">
                          <Briefcase className="w-5 h-5 text-blue-400" /> In progress
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {openClientProjects.map((assignment) => renderOpportunitiesProjectCard(assignment))}
                        </div>
                      </div>
                    )}
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

            {/* ── WORKSPACE TAB — list only; each project opens /developer/workspace/:id ─ */}
            {activeTab === "workspace" && (
              <motion.section key="workspace" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
                <div className="glass-panel p-5 rounded-2xl border border-white/10 bg-white/[0.02] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <p className="text-white font-bold">Dedicated room per project</p>
                    <p className="text-xs text-white/45 font-light mt-1 max-w-xl">
                      Open a workspace to work with PRD, architecture, milestones, chat, and deliverables for that client only — routed at
                      {" "}
                      <span className="text-indigo-300/90 font-mono text-[10px]">/developer/workspace/&lt;projectId&gt;</span>
                      .
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("projects")}
                    className="shrink-0 px-4 py-2.5 rounded-xl border border-white/15 text-white/70 hover:text-white hover:bg-white/5 text-[10px] font-black uppercase tracking-widest transition-colors"
                  >
                    View opportunities
                  </button>
                </div>

                {activeAssignments.length === 0 ? (
                  <div className="glass-panel p-12 rounded-3xl border border-white/5 text-center space-y-4">
                    <Code2 className="w-12 h-12 text-white/15 mx-auto" />
                    <h2 className="text-white font-black text-lg">No workspaces yet</h2>
                    <p className="text-sm text-white/40 font-light max-w-md mx-auto">
                      Accept a hire under Opportunities to get an isolated workspace for that client project.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab("projects")}
                      className="px-6 py-3 silver-gradient text-black font-black uppercase tracking-widest text-[10px] rounded-xl transition-all hover:scale-[1.02]"
                    >
                      Go to opportunities
                    </button>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {completedClientProjects.length > 0 && (
                      <div className="space-y-3">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400/90">Completed</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {completedClientProjects.map((a) => {
                            const { meta: wc, effectiveProjectId } = resolveAssignmentProjectState(
                              a,
                              mergedWorkspaceCompletion,
                            );
                            const isDone = wc?.completed === true;
                            const lastMs = a.respondedAt?.toMillis?.() ?? null;
                            const last = lastMs != null ? new Date(lastMs) : null;
                            const lastLabel = last
                              ? `Last update ${formatDateTimeSmart(last)}`
                              : "Activity timestamp not recorded";
                            const pidOpen = (effectiveProjectId ?? a.projectId)?.trim() ?? "";
                            const hasId = Boolean(pidOpen);
                            return (
                              <div
                                key={a.token}
                                className="glass-panel p-6 rounded-2xl border border-emerald-500/35 bg-emerald-500/[0.06] flex flex-col gap-4"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap gap-2">
                                      <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                                        ✓ Completed
                                      </span>
                                      <span className="text-[9px] font-black uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded-full">
                                        Tier 3 · Project Verified
                                      </span>
                                    </div>
                                    <h3 className="text-white font-black text-lg mt-2 truncate">{a.projectName}</h3>
                                    <p className="text-[10px] text-white/35 font-bold uppercase tracking-widest mt-1">
                                      Client · {a.creatorName}
                                    </p>
                                    {isDone && wc?.deployUrl ? (
                                      <a
                                        href={wc.deployUrl.startsWith("http") ? wc.deployUrl : `https://${wc.deployUrl}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-[10px] text-emerald-400 mt-2 font-bold"
                                      >
                                        <ExternalLink className="w-3 h-3" /> Deployment
                                      </a>
                                    ) : null}
                                  </div>
                                </div>
                                <p className="text-[10px] text-white/30 font-light">{lastLabel}</p>
                                {!hasId && (
                                  <p className="text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                                    Project ID is still linking. Refresh shortly or contact support if this does not resolve.
                                  </p>
                                )}
                                <button
                                  type="button"
                                  disabled={!hasId}
                                  onClick={() => openDeveloperWorkspace(pidOpen)}
                                  className="w-full py-3 font-black uppercase tracking-widest text-[10px] rounded-xl flex items-center justify-center gap-2 transition-all hover:scale-[1.01] border border-emerald-500/35 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                                >
                                  <Play className="w-3.5 h-3.5 shrink-0" aria-hidden />
                                  View workspace (read-only)
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {openClientProjects.length > 0 && (
                      <div className="space-y-3">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-400/90">In progress</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {openClientProjects.map((a) => {
                            const { effectiveProjectId } = resolveAssignmentProjectState(
                              a,
                              mergedWorkspaceCompletion,
                            );
                            const lastMs = a.respondedAt?.toMillis?.() ?? null;
                            const last = lastMs != null ? new Date(lastMs) : null;
                            const lastLabel = last
                              ? `Last update ${formatDateTimeSmart(last)}`
                              : "Activity timestamp not recorded";
                            const pidOpen = (effectiveProjectId ?? a.projectId)?.trim() ?? "";
                            const hasId = Boolean(pidOpen);
                            return (
                              <div
                                key={a.token}
                                className="glass-panel p-6 rounded-2xl border border-blue-500/20 bg-blue-500/[0.03] flex flex-col gap-4"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-blue-300 bg-blue-500/10 border border-blue-500/25 px-2 py-0.5 rounded-full">
                                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" aria-hidden />
                                      In progress
                                    </span>
                                    <h3 className="text-white font-black text-lg mt-2 truncate">{a.projectName}</h3>
                                    <p className="text-[10px] text-white/35 font-bold uppercase tracking-widest mt-1">
                                      Client · {a.creatorName}
                                    </p>
                                  </div>
                                </div>
                                <p className="text-[10px] text-white/30 font-light">{lastLabel}</p>
                                {!hasId && (
                                  <p className="text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                                    Project ID is still linking. Refresh shortly or contact support if this does not resolve.
                                  </p>
                                )}
                                <button
                                  type="button"
                                  disabled={!hasId}
                                  onClick={() => openDeveloperWorkspace(pidOpen)}
                                  className="w-full py-3 font-black uppercase tracking-widest text-[10px] rounded-xl flex items-center justify-center gap-2 transition-all hover:scale-[1.01] silver-gradient text-black disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                                >
                                  <Play className="w-3.5 h-3.5 shrink-0" aria-hidden />
                                  Open workspace
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {closedHireCount > 0 && (
                  <p className="text-center text-[10px] text-white/25 font-light">
                    {closedHireCount} declined or expired invitation{closedHireCount === 1 ? "" : "s"} (not listed above).
                  </p>
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

                {/* Client project overview (task detail lives in each /developer/workspace/:id) */}
                <div className="glass-panel p-6 rounded-2xl border border-white/10">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50 mb-4">Client projects</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: "Active", value: String(devDashboardMetrics.activeProjects), color: "text-blue-400" },
                      { label: "Completed", value: String(devDashboardMetrics.completedProjects), color: "text-emerald-400" },
                      { label: "Pending invites", value: String(pendingInvitations.length), color: "text-yellow-400" },
                      { label: "Closed", value: String(closedHireCount), color: "text-white/40" },
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
