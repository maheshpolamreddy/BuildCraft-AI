"use client";

import {
  subscribeToWorkspace,
  getWorkspaceState,
  setWorkspaceMilestones,
  setWorkspaceMatchedDevelopers,
  withDerivedMilestoneStatuses,
  type Task,
  type Milestone,
  type TaskStatus,
} from "@/lib/workspace";
import {
  areMilestonesReadyForCompletion,
  completionProgressPct,
  countTasksByStatus,
  isTaskClientApproved,
} from "@/lib/completion-gate";
import React, { useState, useEffect, useMemo, Suspense, useRef, useCallback, cloneElement } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, UserCheck, ShieldCheck, CheckCircle2, Lock,
  ListOrdered, History, MessageSquare, AlertCircle,
  ChevronDown, ChevronRight, RotateCcw, Download,
  Clock, Bell, Send, X, Star, Scale, Info,
  Loader2, Layers, Terminal, GitBranch, CheckCircle,
  XCircle, Rocket, Play, Zap, Activity, GitMerge,
  Package, Eye, BarChart2, Flag, ArrowRight, Sparkles,
  FileText, Mail, Home, FolderOpen, CheckSquare, Trash2, Briefcase, UserRound,
} from "lucide-react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _unused = { Download, ChevronRight, Play, Star, Scale };
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useStore } from "@/store/useStore";
import { logAction, getProjectAuditLog, type AuditEntry } from "@/lib/auditLog";
import { parseJsonResponse } from "@/lib/parse-api-json";
import { getAllDeveloperProfiles, isDeveloperRegistrationComplete, shouldDefaultToDeveloperDashboard } from "@/lib/developerProfile";
import { type MatchedDeveloper } from "@/app/api/match-developers/route";
import {
  getHireRequestsByCreator,
  getHireRequestsByDeveloper,
  createHireRequest,
  hireRequestsForProject,
  type HireRequest,
} from "@/lib/hireRequests";
import { getPRD, getPRDsByHireToken, getPRDsByUser, type PRDDocument } from "@/lib/prd";
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
import { deleteDoc, doc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { getProject, claimProjectAsDeveloper, syncDeveloperUidToProjectRoot, type SavedProject } from "@/lib/firestore";
import { CreatorFlowBreadcrumb, DeveloperFlowBreadcrumb } from "@/components/FlowNavigation";
import { CreatorFlowGuard } from "@/components/CreatorFlowGuard";
import { ProjectCompletionPanel } from "@/components/ProjectCompletionPanel";
import {
  initProjectExecution,
  getProjectExecution,
  subscribeToProjectExecution,
  updateProjectStatus,
  getStatusLabel,
  getStatusColor,
  type ProjectExecution,
} from "@/lib/project-execution";
import {
  parseToDate,
  formatJoinedPrefix,
  formatSentPrefix,
  formatExpiresLabel,
  formatChatMessageTime,
  formatDateTimeSmart,
} from "@/lib/dateDisplay";

// ── Types ─────────────────────────────────────────────────────────────────────
type Tab = "milestones" | "talent" | "prd" | "chat" | "audit" | "deploy" | "history" | "completion" | "architecture" | "deliverables";

export type ProjectRoomContentProps = {
  initialProjectId?: string | null;
  isDeveloperWorkspace?: boolean;
};

interface ChatMessage {
  id: number;
  from: string;
  text: string;
  time: string;
  isMe: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const TYPE_ICON: Record<Task["type"], React.ReactNode> = {
  frontend: <Layers className="w-3 h-3" />,
  backend:  <Terminal className="w-3 h-3" />,
  database: <GitBranch className="w-3 h-3" />,
  auth:     <Shield className="w-3 h-3" />,
  devops:   <Zap className="w-3 h-3" />,
  testing:  <CheckCircle2 className="w-3 h-3" />,
};

const TYPE_COLOR: Record<Task["type"], string> = {
  frontend: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  backend:  "text-purple-400 bg-purple-500/10 border-purple-500/20",
  database: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  auth:     "text-red-400 bg-red-500/10 border-red-500/20",
  devops:   "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  testing:  "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
};

const MILESTONE_COLORS: Record<string, { ring: string; dot: string; badge: string }> = {
  blue:    { ring: "border-blue-500/40",    dot: "bg-blue-500",    badge: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  purple:  { ring: "border-purple-500/40",  dot: "bg-purple-500",  badge: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
  emerald: { ring: "border-emerald-500/40", dot: "bg-emerald-500", badge: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  orange:  { ring: "border-orange-500/40",  dot: "bg-orange-500",  badge: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
};

const FALLBACK_MILESTONES: Milestone[] = [
  {
    id: "m1", phase: "Phase 1", title: "Foundation & Setup", description: "Project scaffolding, auth, and database schema.", estimatedDays: 7, color: "blue",
    tasks: [
      { id: "t1", title: "Initialize Next.js project",    description: "Set up Next.js 14 with TypeScript and Tailwind", type: "devops",    estimatedHours: 3, priority: "high",   status: "completed_by_developer",   submission: "Created the project with create-next-app. Added all dependencies.", validationScore: 91, assignee: "Dev" },
      { id: "t2", title: "Database schema & migrations",  description: "Design all tables with RLS policies",             type: "database",  estimatedHours: 5, priority: "high",   status: "approved", validationScore: 95, assignee: "Dev" },
      { id: "t3", title: "Authentication flow",           description: "Email+Password and Google OAuth",                 type: "auth",      estimatedHours: 6, priority: "high",   status: "in-progress", assignee: "Dev" },
    ],
  },
  {
    id: "m2", phase: "Phase 2", title: "Core Features", description: "Main application features and API routes.", estimatedDays: 14, color: "purple",
    tasks: [
      { id: "t4", title: "Build primary API routes",        description: "CRUD routes with Zod validation",              type: "backend",   estimatedHours: 8, priority: "high",   status: "pending" },
      { id: "t5", title: "Dashboard UI components",         description: "Main dashboard with stats and tables",          type: "frontend",  estimatedHours: 10, priority: "high",   status: "pending" },
      { id: "t6", title: "State management",               description: "Zustand + TanStack Query setup",                type: "frontend",  estimatedHours: 5, priority: "medium", status: "pending" },
    ],
  },
  {
    id: "m3", phase: "Phase 3", title: "UI/UX Polish", description: "Animations, responsiveness, accessibility.", estimatedDays: 7, color: "emerald",
    tasks: [
      { id: "t7", title: "Responsive design",     description: "Mobile, tablet, and desktop",          type: "frontend", estimatedHours: 6, priority: "medium", status: "pending" },
      { id: "t8", title: "Animations",            description: "Framer Motion transitions",            type: "frontend", estimatedHours: 4, priority: "low",    status: "pending" },
      { id: "t9", title: "Performance & SEO",     description: "Image opt, code split, meta tags",     type: "devops",   estimatedHours: 4, priority: "medium", status: "pending" },
    ],
  },
  {
    id: "m4", phase: "Phase 4", title: "Testing & Deployment", description: "Tests, CI/CD, and production launch.", estimatedDays: 7, color: "orange",
    tasks: [
      { id: "t10", title: "Unit & integration tests",    description: "Vitest + React Testing Library",   type: "testing", estimatedHours: 8, priority: "high",   status: "pending", aiPrompt: "", version: 1, validationResult: null, submission: "" },
      { id: "t11", title: "CI/CD pipeline",             description: "GitHub Actions for auto-deploy",   type: "devops",  estimatedHours: 4, priority: "medium", status: "pending", aiPrompt: "", version: 1, validationResult: null, submission: "" },
      { id: "t12", title: "Production deployment",      description: "Vercel + Sentry monitoring",       type: "devops",  estimatedHours: 3, priority: "high",   status: "pending", aiPrompt: "", version: 1, validationResult: null, submission: "" },
    ],
  },
];

function firestoreAccessHint(msg: string): string {
  if (/permission|insufficient|PERMISSION_DENIED/i.test(msg)) {
    return "Firebase blocked loading developer profiles. Deploy buildcraft/firestore.rules (or update Firestore Rules) so signed-in users can read completed developerProfiles.";
  }
  return msg;
}

/** Case-insensitive match — Auth and stored project emails can differ in casing. */
function creatorEmailsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = (a ?? "").trim().toLowerCase();
  const y = (b ?? "").trim().toLowerCase();
  return x.length > 0 && x === y;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  { id: 1, from: "Alex M.", text: "Hi! I reviewed the technical plan. The architecture looks solid — I've worked on 3 similar projects.", time: "2h ago", isMe: false },
  { id: 2, from: "You",    text: "Great! Can you start next Monday? The timeline is 4 months.", time: "1h ago", isMe: true },
  { id: 3, from: "Alex M.", text: "Monday works. I'd like to do a 30-min scoping call to confirm requirements.", time: "45m ago", isMe: false },
];

// ── Component ──────────────────────────────────────────────────────────────────
const VALID_TABS: Tab[] = ["milestones", "talent", "prd", "chat", "completion", "history", "audit", "deploy", "architecture", "deliverables"];

export function ProjectRoomContent({ initialProjectId = null, isDeveloperWorkspace = false }: ProjectRoomContentProps = {}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const chatQueryParam = searchParams.get("chat");
  const routeProjectId = (initialProjectId?.trim() || searchParams.get("projectId")) || null;
  const {
    authReady,
    project,
    setProject,
    approvedTools,
    currentUser,
    savedProjectId,
    setSavedProjectId,
    clearProject,
    developerProfile,
    userRoles,
    role,
    projectCreatorHydrated,
  } = useStore();

  // ── Role Detection (Robust email-based recovery fallback) ──────────────────
  const legacyProjectUid =
    project && "uid" in project && typeof (project as { uid?: unknown }).uid === "string"
      ? (project as { uid: string }).uid
      : undefined;
  const isDeveloper = !!currentUser && !!project && !!project.developerUid && (currentUser.uid === project.developerUid);
  const isCreator = !!currentUser && !!project && !isDeveloper && (
    currentUser.uid === project.creatorUid ||
    (!!legacyProjectUid && legacyProjectUid === currentUser.uid) ||
    creatorEmailsMatch(currentUser.email, project.creatorEmail) ||
    (!project.creatorUid && !project.developerUid)
  );
  /** Until Firestore project loads, still query hire requests as creator (avoids empty list + wrong chat ACL wiring). */
  const hireQueriesAsCreator =
    isCreator ||
    (!!currentUser && !project && !!routeProjectId && !isDeveloperWorkspace);
  const chatParticipantRole: "creator" | "developer" = hireQueriesAsCreator ? "creator" : "developer";
  const userRole    = isCreator ? "creator" : "developer";

  // Auto-heal logic: If email matches but UID is different, update the project UID
  useEffect(() => {
    if (currentUser?.uid && project?.creatorEmail && currentUser.email === project.creatorEmail && currentUser.uid !== project.creatorUid) {
      console.info("[ProjectRoom] Auto-healing project creator UID from email match...");
      setProject({ ...project, creatorUid: currentUser.uid });
    }
  }, [currentUser, project?.creatorEmail, project?.creatorUid, setProject]);

  // Diagnostic for dev/troubleshooting:
  console.debug("[ProjectRoom] Role Debug:", { 
    isCreator, 
    isDeveloper, 
    curUid: currentUser?.uid, 
    projCreator: project?.creatorUid, 
    projDev: project?.developerUid 
  });

  const [loadingProject, setLoadingProject] = useState(!!routeProjectId);
  const [projectLoadFailed, setProjectLoadFailed] = useState(false);
  const [loadRetry, setLoadRetry] = useState(0);
  const [activeTab, setActiveTab] = useState<Tab>("milestones");
  const [milestones, setMilestones] = useState<Milestone[]>(() => withDerivedMilestoneStatuses(FALLBACK_MILESTONES));
  const [loadingMilestones, setLoadingMilestones] = useState(false);
  const [expandedMilestone, setExpandedMilestone] = useState<string | null>("m1");
  const [reviewTask, setReviewTask] = useState<Task | null>(null);
  const [gate3Hired, setGate3Hired] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [newMsg, setNewMsg] = useState("");
  const [showRollbackConfirm, setShowRollbackConfirm] = useState(false);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [deployStage, setDeployStage] = useState(0);
  const [deployLogs, setDeployLogs]   = useState<string[]>([]);
  const [deploying, setDeploying]     = useState(false);

  // ── Developer Matching Engine state ────────────────────────────────────────
  const [matchedDevs, setMatchedDevs]       = useState<MatchedDeveloper[]>([]);
  const [matchLoading, setMatchLoading]     = useState(false);
  const [matchError, setMatchError]         = useState(false);
  const [matchDetail, setMatchDetail]       = useState<string | null>(null);
  const [expandedDevs, setExpandedDevs]       = useState<Record<string, boolean>>({});
  // ── Hire modal state ───────────────────────────────────────────────────────
  const [hireTarget,    setHireTarget]   = useState<MatchedDeveloper | null>(null);
  const [hireSending,   setHireSending]  = useState(false);
  const [hireResult,    setHireResult]   = useState<"sent" | "error" | "duplicate" | null>(null);
  const [hireErrorDetail, setHireErrorDetail] = useState<string | null>(null);
  const [sentTokens,    setSentTokens]   = useState<Record<string, string>>({}); // userId → token

  // ── PRD state ─────────────────────────────────────────────────────────────
  const [prds,      setPrds]     = useState<PRDDocument[]>([]);
  const [prdLoading, setPrdLoading] = useState(false);
  const [prdRetrying, setPrdRetrying] = useState(false);
  const [prdRetryMessage, setPrdRetryMessage] = useState<string | null>(null);

  // ── Hire requests state ────────────────────────────────────────────────────
  const [hireRequests, setHireRequests] = useState<HireRequest[]>([]);

  // ── Real-time chat state ───────────────────────────────────────────────────
  const [activeChatId,   setActiveChatId]   = useState<string | null>(null);
  const [fireMsgs,       setFireMsgs]       = useState<FireChatMsg[]>([]);
  const [chatRoom,       setChatRoom]       = useState<ChatRoom | null>(null);
  const [chatText,       setChatText]       = useState("");
  const [chatSending,    setChatSending]    = useState(false);
  const [chatSubError,   setChatSubError]   = useState<string | null>(null);
  const chatViewerUid = useFirebaseUid(currentUser?.uid);

  // ── Project Execution state ──────────────────────────────────────────────
  const [projExec, setProjExec] = useState<ProjectExecution | null>(null);
  const [projExecSubError, setProjExecSubError] = useState<string | null>(null);

  /** Reset when switching Firestore project doc so milestone AI does not skip for the new id. */
  const generatedRef = useRef(false);

  const visibleTabs = useMemo(() => {
    if (isCreator) return VALID_TABS.filter(t => !["architecture", "deliverables"].includes(t));
    if (isDeveloperWorkspace) {
      return ["milestones", "architecture", "prd", "chat", "deliverables", "completion"] as Tab[];
    }
    return VALID_TABS.filter(t => ["milestones", "chat", "prd", "completion"].includes(t));
  }, [isCreator, isDeveloperWorkspace]);

  /**
   * Deep-linked workspace (`/developer/workspace/:id` or `?projectId=`) — URL is the source of truth.
   * Clears persisted Zustand project/approvedTools if they belong to another Firestore doc so we never
   * flash another project’s data while the correct one loads.
   */
  useEffect(() => {
    const pId = routeProjectId;
    if (!pId) return;
    if (savedProjectId && savedProjectId !== pId) {
      setLoadingProject(true);
      setProjectLoadFailed(false);
      clearProject();
      generatedRef.current = false;
      setMilestones(FALLBACK_MILESTONES);
      setMatchedDevs([]);
      setPrds([]);
      setProjExec(null);
      setActiveTab("milestones");
      setGate3Hired(false);
      setExpandedMilestone("m1");
    }
  }, [routeProjectId, savedProjectId, clearProject]);

  /** New URL project → drop in-memory chat subscription state (prevents cross-project message bleed). */
  useEffect(() => {
    if (!routeProjectId) return;
    setActiveChatId(null);
    setFireMsgs([]);
    setChatRoom(null);
  }, [routeProjectId]);

  // ── Remote Project Loading (Deep Linking) ──────────────────────────────────
  useEffect(() => {
    const pId = routeProjectId;
    if (!pId) {
      setLoadingProject(false);
      return;
    }
    if (project && savedProjectId === pId) {
      setLoadingProject(false);
      return;
    }
    if (!authReady) return;

    let cancelled = false;
    async function loadRemote() {
      setLoadingProject(true);
      try {
        // 1. Try client-side Firestore read (works if user has permission)
        let saved = await getProject(pId as string);

        // 2. Fallback: use server API with Admin SDK (for hired developers whose
        //    Firestore rules might block client reads)
        if (!saved && currentUser?.uid) {
          try {
            const res = await fetch(
              `/api/load-project?id=${encodeURIComponent(pId as string)}&uid=${encodeURIComponent(currentUser.uid)}`,
            );
            if (res.ok) {
              const json = await res.json();
              if (json.project) saved = json.project as SavedProject;
            }
          } catch (apiErr) {
            console.warn("[ProjectRoom] API fallback load error:", apiErr);
          }
        }

        if (cancelled) return;
        if (saved) {
          const devFromDoc =
            saved.project.developerUid ?? saved.developerUid ?? undefined;
          const merged = {
            ...saved.project,
            creatorUid: saved.project.creatorUid || saved.uid,
            creatorEmail: saved.project.creatorEmail || saved.email,
            /** Per Firestore project doc only — never infer from other projects. */
            developerUid: devFromDoc,
          };
          setProject(merged);
          setSavedProjectId(pId);
          void syncDeveloperUidToProjectRoot(pId as string);
          setProjectLoadFailed(false);
        } else {
          setProjectLoadFailed(true);
        }
      } catch (e) {
        console.error("[ProjectRoom] remote load error:", e);
        if (!cancelled) setProjectLoadFailed(true);
      } finally {
        if (!cancelled) setLoadingProject(false);
      }
    }
    loadRemote();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeProjectId, project, savedProjectId, setProject, setSavedProjectId, authReady, loadRetry]);

  // Deep-link from Discovery / Architecture / hire emails (e.g. ?tab=chat&chat=…)
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && VALID_TABS.includes(t as Tab)) setActiveTab(t as Tab);
  }, [searchParams]);

  const approvedCount = Object.values(approvedTools).filter(Boolean).length;
  const projectName  = project?.name ?? "My Project";
  const version      = project?.version ?? "v1.0";

  /** Firestore project doc id from store or URL — keeps hire/PRD scope aligned per workspace. */
  const workspaceProjectId = savedProjectId || routeProjectId || null;
  /** Prefer URL id for sessionStorage keys so chat persistence matches the open workspace. */
  const chatScopeProjectId = routeProjectId || savedProjectId || null;

  // ── All hire requests — load for BOTH creators and developers (full list; scope per workspace below) ──
  useEffect(() => {
    if (!authReady || !currentUser?.uid) return;
    const fetcher = hireQueriesAsCreator ? getHireRequestsByCreator : getHireRequestsByDeveloper;
    fetcher(currentUser.uid)
      .then((reqs) => {
        setHireRequests(reqs);
        const tokens: Record<string, string> = {};
        reqs.forEach((r) => {
          tokens[r.developerUid] = r.token;
        });
        setSentTokens(tokens);
      })
      .catch(() => {});
  }, [authReady, currentUser?.uid, hireQueriesAsCreator]);

  // ── Hiring state derivation (state machine for talent tab UI) — project-scoped ─────────────
  const projectHireReqs = useMemo(() => {
    const uid = currentUser?.uid;
    if (!uid) return [];
    const scoped = hireRequestsForProject(
      hireRequests,
      workspaceProjectId,
      projectName,
    );
    return scoped.filter(
      (r) => r.creatorUid === uid || r.developerUid === uid,
    );
  }, [hireRequests, workspaceProjectId, projectName, currentUser?.uid]);
  const acceptedHire  = useMemo(() => projectHireReqs.find(r => r.status === "accepted") ?? null, [projectHireReqs]);
  const pendingHires  = useMemo(() => projectHireReqs.filter(r => r.status === "pending"), [projectHireReqs]);
  type HiringState = "no-hire" | "pending" | "accepted";
  const hiringState: HiringState = acceptedHire ? "accepted" : pendingHires.length > 0 ? "pending" : "no-hire";

  /** Chat labels + partner name: developer sees client; employer sees developer. */
  const viewerIsDeveloperRole = Boolean(isDeveloper || isDeveloperWorkspace);
  const chatSectionTitle = viewerIsDeveloperRole ? "Chat with Client" : "Chat with Developer";

  const activeChatHire = useMemo(
    () => projectHireReqs.find((r) => r.token === activeChatId),
    [projectHireReqs, activeChatId],
  );
  const acceptedHiresForWorkspace = useMemo(
    () => projectHireReqs.filter((r) => r.status === "accepted"),
    [projectHireReqs],
  );
  const chatPartnerDisplayName = useMemo(() => {
    const req = activeChatHire;
    if (viewerIsDeveloperRole) {
      return (
        (req?.creatorName || "").trim() ||
        (chatRoom?.creatorName || "").trim() ||
        "Client"
      );
    }
    return (
      (req?.developerName || "").trim() ||
      (chatRoom?.developerName || "").trim() ||
      "Developer"
    );
  }, [viewerIsDeveloperRole, activeChatHire, chatRoom?.creatorName, chatRoom?.developerName]);

  // ── Derived stats (completion gate = all tasks dual-approved or legacy approved) ──
  const allTasks   = milestones.flatMap(m => m.tasks);
  const taskCounts = useMemo(() => countTasksByStatus(milestones), [milestones]);
  const doneTasks  = taskCounts.fullyApproved;
  const inReview   = taskCounts.awaitingClientReview;
  const progress   = completionProgressPct(milestones);
  const completionSectionUnlocked = areMilestonesReadyForCompletion(milestones);
  /** Final dual-approved closure — milestones/tasks become view-only */
  const workspaceProjectCompleted =
    projExec?.status === "completed" || project?.lifecycleStatus === "completed";

  // ── Strict Tab Guard ───────────────────────────────────────────────────────
  useEffect(() => {
    if ((isDeveloper || isDeveloperWorkspace) && !visibleTabs.includes(activeTab)) {
      setActiveTab("milestones");
    }
  }, [isDeveloper, isDeveloperWorkspace, activeTab, visibleTabs]);


  // ── Route Guard (waits for Firebase auth before redirecting) ────────────────
  const hasProjectIdParam = !!routeProjectId;
  useEffect(() => {
    if (!authReady) return;
    if (loadingProject) return;

    if (!currentUser) {
       router.push(`/auth?return=${encodeURIComponent(pathname + (searchParams.toString() ? "?" + searchParams.toString() : ""))}`);
    } else if (!project && !savedProjectId && !hasProjectIdParam) {
       if (
         isDeveloperRegistrationComplete(developerProfile) &&
         shouldDefaultToDeveloperDashboard(userRoles, developerProfile, role)
       ) {
         router.push("/employee-dashboard");
       } else {
         router.push("/discovery");
       }
    }
  }, [authReady, currentUser, project, savedProjectId, router, loadingProject, pathname, searchParams, developerProfile, userRoles, role, hasProjectIdParam]);

  // ── Sync Milestones from Real-Time Workspace ─────────────────────────────
  useEffect(() => {
    if (!savedProjectId) return;
    return subscribeToWorkspace(savedProjectId, (state) => {
       if (state) {
         if (state.milestones && state.milestones.length > 0) {
           setMilestones(withDerivedMilestoneStatuses(state.milestones));
         }
         if (state.matchedDevelopers && state.matchedDevelopers.length > 0 && matchedDevs.length === 0) {
           setMatchedDevs(state.matchedDevelopers);
         }
       }
    });
  }, [savedProjectId]);

  // ── Subscribe to Project Execution state ──────────────────────────────────
  useEffect(() => {
    if (!savedProjectId || !currentUser?.uid) return;
    setProjExecSubError(null);
    return subscribeToProjectExecution(
      savedProjectId,
      setProjExec,
      (err) => {
        console.warn("[ProjectRoom] projExec subscription:", err);
        setProjExecSubError(err);
      },
    );
  }, [savedProjectId, currentUser?.uid]);

  // Heal top-level developerUid when legacy rows only stored it under project.* (Firestore rules use both)
  useEffect(() => {
    if (!savedProjectId || !authReady) return;
    void syncDeveloperUidToProjectRoot(savedProjectId);
  }, [savedProjectId, authReady]);

  // ── Initialize Project Execution record (creator OR hired developer — both need the doc) ──
  const hasExecutionContext =
    !!savedProjectId &&
    !!currentUser?.uid &&
    !!project &&
    (!!project.developerUid || hiringState === "accepted");

  useEffect(() => {
    if (!hasExecutionContext) return;
    if (!isCreator && !isDeveloper) return;
    initProjectExecution({
      projectId: savedProjectId!,
      savedProjectId: savedProjectId!,
      projectName: project!.name,
      creatorUid: project!.creatorUid || currentUser.uid,
      developerUid: project!.developerUid || null,
    }).catch((e) => console.warn("[ProjectRoom] initProjectExecution:", e));
  }, [
    hasExecutionContext,
    savedProjectId,
    currentUser?.uid,
    project?.name,
    project?.creatorUid,
    project?.developerUid,
    isCreator,
    isDeveloper,
    hiringState,
  ]);

  const ensureProjectExecutionDoc = useCallback(() => {
    if (!savedProjectId || !currentUser?.uid || !project) return Promise.resolve();
    if (!isCreator && !isDeveloper) return Promise.resolve();
    setProjExecSubError(null);
    return initProjectExecution({
      projectId: savedProjectId,
      savedProjectId,
      projectName: project.name,
      creatorUid: project.creatorUid || currentUser.uid,
      developerUid: project.developerUid || null,
    })
      .then(() => getProjectExecution(savedProjectId).then(setProjExec))
      .catch((e: unknown) => {
        console.warn("[ProjectRoom] ensureProjectExecutionDoc:", e);
        setProjExecSubError(e instanceof Error ? e.message : String(e));
      });
  }, [savedProjectId, currentUser?.uid, project, isCreator, isDeveloper]);

  const onProjectDocCompleted = useCallback(
    (payload: { deploymentUrl: string }) => {
      const p = useStore.getState().project;
      if (!p) return;
      setProject({
        ...p,
        lifecycleStatus: "completed",
        completedAt: Date.now(),
        completionDeploymentUrl: payload.deploymentUrl,
      });
    },
    [setProject],
  );

  useEffect(() => {
    if (!isDeveloperWorkspace || !authReady || !currentUser?.uid || !savedProjectId || !project) return;
    if (project.developerUid) return;
    void claimProjectAsDeveloper(savedProjectId, currentUser.uid).then(ok => {
      if (!ok) return;
      const p = useStore.getState().project;
      if (p) setProject({ ...p, developerUid: currentUser.uid });
    });
  }, [isDeveloperWorkspace, authReady, currentUser?.uid, savedProjectId, project?.name, project?.developerUid, setProject]);

  // ── Auto-update execution status when hire completes ────────────────────
  useEffect(() => {
    if (!savedProjectId || !projExec) return;
    if (hiringState !== "no-hire" && projExec.status === "draft") {
      updateProjectStatus(savedProjectId, "hiring").catch(() => {});
    }
  }, [savedProjectId, projExec?.status, hiringState]);

  // ── Generate milestones from AI ────────────────────────────────────────────
  useEffect(() => {
    if (!project || !savedProjectId || generatedRef.current) return;
    
    // Deterministic Catch: Verify if workspace already has milestones before triggering AI!
    getWorkspaceState(savedProjectId).then((state) => {
       if (state && state.milestones && state.milestones.length > 0) {
          setMilestones(withDerivedMilestoneStatuses(state.milestones));
          generatedRef.current = true;
          return;
       }

       generatedRef.current = true;
       setLoadingMilestones(true);
       fetch("/api/generate-milestones", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ projectName: project.name, projectIdea: project.idea }),
       })
         .then((r) => parseJsonResponse(r))
         .then(async ({ ok, data }) => {
           const raw = data.milestones;
           if (!ok || !Array.isArray(raw) || !raw.length) return;
           const withState = raw.map((m: Milestone, mi: number) => ({
             ...m,
             tasks: m.tasks.map((t: Task, ti: number) => {
               const fb = FALLBACK_MILESTONES[mi]?.tasks[ti];
               return { 
                 ...t, 
                 status: fb?.status ?? "pending", 
                 submission: fb?.submission ?? "", 
                 validationScore: fb?.validationScore ?? 0, 
                 assignee: fb?.assignee ?? "",
                 aiPrompt: t.aiPrompt ?? "",
                 validationResult: t.validationResult ?? null,
                 version: t.version ?? 1
               } as Task;
             }),
           }));
           const derived = withDerivedMilestoneStatuses(withState);
           setMilestones(derived);
           if (savedProjectId) {
             await setWorkspaceMilestones(savedProjectId, derived);
           }
         })
         .catch(() => {})
         .finally(() => setLoadingMilestones(false));
    });
  }, [project, savedProjectId]);



  const regenerateMilestones = useCallback(() => {
    if (!project || hiringState !== "no-hire" || !savedProjectId) return;
    if (workspaceProjectCompleted) return;
    if (!confirm("Are you sure you want to regenerate all milestones? Any unsaved manual modifications will be lost.")) return;
    
    setLoadingMilestones(true);
    fetch("/api/generate-milestones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectName: project.name, projectIdea: project.idea }),
    })
      .then((r) => parseJsonResponse(r))
      .then(async ({ ok, data }) => {
        const raw = data.milestones;
        if (!ok || !Array.isArray(raw) || !raw.length) return;
        const withState = raw.map((m: Milestone, mi: number) => ({
             ...m,
             tasks: m.tasks.map((t: Task, ti: number) => {
               const fb = FALLBACK_MILESTONES[mi]?.tasks[ti];
               return { 
                 ...t, 
                 status: fb?.status ?? "pending", 
                 submission: fb?.submission ?? "", 
                 validationScore: fb?.validationScore ?? 0, 
                 assignee: fb?.assignee ?? "",
                 aiPrompt: t.aiPrompt ?? "",
                 validationResult: t.validationResult ?? null,
                 version: t.version ?? 1
               } as Task;
             }),
        }));
        const derivedRegen = withDerivedMilestoneStatuses(withState);
        setMilestones(derivedRegen);
        await setWorkspaceMilestones(savedProjectId, derivedRegen, currentUser?.uid);
        if (currentUser) {
          logAction(currentUser.uid, "project.updated", { 
            action: "milestones_regenerated",
            projectId: savedProjectId,
            creatorUid: project?.creatorUid,
            developerUid: project?.developerUid
          }).catch(() => {});
        }
      })
      .catch((err) => console.error("Regeneration failed", err))
      .finally(() => setLoadingMilestones(false));
  }, [project, savedProjectId, hiringState, workspaceProjectCompleted]);

  // ── Automatic Matching Trigger ─────────────────────────────────────────────
  const matchTriggeredRef = useRef(false);
  useEffect(() => {
    matchTriggeredRef.current = false;
  }, [savedProjectId]);
  useEffect(() => {
    if (!authReady || !currentUser?.uid) return;
    if (activeTab !== "talent" || !isCreator) return;
    if (matchedDevs.length > 0 || matchLoading) return;
    if (matchTriggeredRef.current) return;

    matchTriggeredRef.current = true;
    const timer = setTimeout(() => {
      if (!auth.currentUser) {
        matchTriggeredRef.current = false;
        return;
      }
      runMatchingEngine();
    }, 600);
    return () => { clearTimeout(timer); matchTriggeredRef.current = false; };
  }, [activeTab, isCreator, matchedDevs.length, matchLoading, authReady, currentUser?.uid, savedProjectId]);

  // ── Load PRDs when PRD tab opens — scoped to this workspace (not all user PRDs) ─
  useEffect(() => {
    if (activeTab !== "prd" || !currentUser) return;
    const uid = currentUser.uid;
    setPrdLoading(true);
    setPrdRetryMessage(null);
    let cancelled = false;

    async function loadScopedPrds() {
      const pid = workspaceProjectId;
      const nameTrim = (projectName || "").trim();
      try {
        const hasWorkspace = !!(pid || projectName);
        if (hasWorkspace) {
          const accepted = projectHireReqs.filter(r => r.status === "accepted");
          const docs: PRDDocument[] = [];
          for (const r of accepted) {
            if (r.prdId) {
              const one = await getPRD(r.prdId);
              if (one) docs.push(one);
            } else {
              const byToken = await getPRDsByHireToken(r.token);
              docs.push(...byToken);
            }
          }
          let merged = [...new Map(docs.map(p => [p.id, p])).values()];

          if (merged.length === 0) {
            const fallbackTokens = new Set(
              hireRequestsForProject(hireRequests, pid, nameTrim)
                .filter((r) => r.status === "accepted")
                .map((r) => r.token),
            );
            if (fallbackTokens.size > 0) {
              const all = await getPRDsByUser(uid);
              const healed = all.filter(p => fallbackTokens.has(p.hireToken));
              merged = [...new Map(healed.map(p => [p.id, p])).values()];
            }
          }

          if (!cancelled) setPrds(merged);
        } else {
          const all = await getPRDsByUser(uid);
          if (!cancelled) setPrds(all);
        }
      } catch {
        if (!cancelled) setPrds([]);
      } finally {
        if (!cancelled) setPrdLoading(false);
      }
    }

    void loadScopedPrds();
    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    currentUser,
    workspaceProjectId,
    projectName,
    projectHireReqs,
    hireRequests,
    project?.developerUid,
    project?.creatorUid,
  ]);

  async function retryGeneratePrd() {
    if (!acceptedHire) return;
    setPrdRetrying(true);
    setPrdRetryMessage(null);
    setPrdLoading(true);
    try {
      const res = await fetch("/api/generate-prd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName:    acceptedHire.projectName,
          projectIdea:    acceptedHire.projectIdea,
          projectSummary: acceptedHire.projectSummary,
          techStack:      [],
          creatorUid:     acceptedHire.creatorUid,
          developerUid:   acceptedHire.developerUid,
          hireToken:      acceptedHire.token,
        }),
      });
      const { ok, data } = await parseJsonResponse(res);
      if (!ok) {
        setPrdRetryMessage(String((data as { error?: string })?.error || "Could not generate PRD"));
        return;
      }
      const prdId = (data as { prdId?: string })?.prdId;
      if (prdId) {
        const one = await getPRD(String(prdId));
        if (one) setPrds([one]);
      }
    } catch (e) {
      setPrdRetryMessage(e instanceof Error ? e.message : "Request failed");
    } finally {
      setPrdRetrying(false);
      setPrdLoading(false);
    }
  }

  // ── Subscribe to real-time chat (signed-in client — Firestore rules apply) ─
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

  const chatBubbleRows = useMemo(
    () => fireMsgs.map(msg => ({ msg, ...classifyChatBubble(msg, chatViewerUid, chatRoom) })),
    [fireMsgs, chatViewerUid, chatRoom],
  );

  // ── Chat tab: load hire requests, restore thread from ?chat= or sessionStorage ─
  useEffect(() => {
    if (activeTab !== "chat" || !currentUser) return;
    let cancelled = false;

    const fetcher = hireQueriesAsCreator ? getHireRequestsByCreator : getHireRequestsByDeveloper;

    fetcher(currentUser.uid)
      .then((reqs) => {
        if (cancelled) return;
        setHireRequests(reqs);
        const scoped = hireRequestsForProject(
          reqs,
          workspaceProjectId,
          projectName,
        );
        const accepted = scoped.filter((r) => r.status === "accepted");
        if (!accepted.length) {
          setActiveChatId(null);
          return;
        }
        let stored: string | null = null;
        try {
          stored = sessionStorage.getItem(
            chatStorageKey(chatParticipantRole, currentUser.uid, chatScopeProjectId),
          );
        } catch {
          /* private mode */
        }
        const fromUrl = chatQueryParam && accepted.some((r) => r.token === chatQueryParam) ? chatQueryParam : null;
        const fromStore = stored && accepted.some((r) => r.token === stored) ? stored : null;
        const sorted = [...accepted].sort(
          (a, b) => (b.respondedAt?.toMillis?.() ?? 0) - (a.respondedAt?.toMillis?.() ?? 0),
        );
        const fallback = sorted[0]?.token ?? null;
        const next = fromUrl || fromStore || fallback;
        setActiveChatId((prev) => (prev && accepted.some((r) => r.token === prev) ? prev : next));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    currentUser?.uid,
    chatQueryParam,
    hireQueriesAsCreator,
    chatParticipantRole,
    workspaceProjectId,
    projectName,
    chatScopeProjectId,
  ]);

  // ── Ensure Firestore chat room exists (signed-in creator can create per rules) ─
  useEffect(() => {
    if (activeTab !== "chat" || !currentUser?.uid || !activeChatId) return;
    const req = projectHireReqs.find((r) => r.token === activeChatId && r.status === "accepted");
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
  }, [activeTab, currentUser?.uid, activeChatId, projectHireReqs]);

  // ── Persist active thread in URL + sessionStorage (reopen later) ───────────
  useEffect(() => {
    if (!currentUser?.uid || !activeChatId || activeTab !== "chat") return;
    try {
      sessionStorage.setItem(
        chatStorageKey(chatParticipantRole, currentUser.uid, chatScopeProjectId),
        activeChatId,
      );
    } catch {
      /* */
    }
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("chat") === activeChatId && params.get("tab") === "chat") return;
    params.set("tab", "chat");
    params.set("chat", activeChatId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [activeChatId, activeTab, currentUser?.uid, pathname, router, searchParams, chatParticipantRole, chatScopeProjectId]);

  // ── Presence on chat tab (so offline pings work) ────────────────────────────
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

  async function runMatchingEngine() {
    setMatchLoading(true);
    setMatchError(false);
    setMatchDetail(null);
    try {
      // 1. Fetch real developer profiles from Firestore (retry once if empty due to auth-token timing)
      let { profiles, queryError } = await getAllDeveloperProfiles(30);
      if (!profiles.length && !queryError && auth.currentUser) {
        await new Promise(r => setTimeout(r, 800));
        ({ profiles, queryError } = await getAllDeveloperProfiles(30));
      }
      if (!profiles.length) {
        setMatchError(true);
        setMatchDetail(queryError ? firestoreAccessHint(queryError) : null);
        return;
      }

      // 2. Build required skills list from project + approved tools
      const toolNames = Object.keys(approvedTools).filter(k => approvedTools[k]);
      const requiredSkills = [...new Set([...toolNames, ...(project?.idea?.split(/\s+/).filter(w => w.length > 3) ?? [])])].slice(0, 20);

      // 3. Call AI matching engine
      const res = await fetch("/api/match-developers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName:    project?.name ?? projectName,
          projectIdea:    project?.idea ?? "",
          requiredSkills,
          candidates:     profiles,
        }),
      });
      const { ok, data } = await parseJsonResponse(res);
      const devs = data.developers;
      if (ok && Array.isArray(devs) && devs.length) {
        setMatchedDevs(devs);
        if (savedProjectId && currentUser) {
          await setWorkspaceMatchedDevelopers(savedProjectId, devs, currentUser.uid);
        }
        if (currentUser) logAction(currentUser.uid, "analysis.generated", { 
          type: "developer-matching", 
          count: devs.length,
          projectId: savedProjectId,
          creatorUid: project?.creatorUid,
          developerUid: project?.developerUid
        });
      } else {
        setMatchError(true);
        const apiErr = typeof data?.error === "string" ? data.error : null;
        if (profiles.length && ok) {
          setMatchDetail(
            "Developers were found in the database but the matcher returned no results. Try again or check profile data.",
          );
        } else {
          setMatchDetail(
            apiErr ??
              (!ok
                ? `Matching request failed (${res.status}). Check /api/match-developers.`
                : "Could not rank developers. Check /api/match-developers or try again."),
          );
        }
      }
    } catch {
      setMatchError(true);
      setMatchDetail(null);
    } finally {
      setMatchLoading(false);
    }
  }

  // ── Hire request ──────────────────────────────────────────────────────────
  async function sendHireRequest(dev: MatchedDeveloper) {
    if (!currentUser) return;
    const developerEmail = (dev.email ?? "").trim();
    if (!developerEmail) {
      setHireResult("error");
      setHireErrorDetail("This developer has no email on their profile. They need to add one before you can send an invite.");
      return;
    }

    setHireSending(true);
    setHireResult(null);
    setHireErrorDetail(null);
    try {
      const existing = await getHireRequestsByCreator(currentUser.uid);
      const wsId = savedProjectId ?? null;
      const duplicate = existing.find(
        (r) =>
          r.developerUid === dev.userId &&
          r.status === "pending" &&
          (wsId ? r.projectId === wsId : r.projectName === projectName),
      );
      if (duplicate) {
        setSentTokens((prev) => ({ ...prev, [dev.userId]: duplicate.token }));
        setHireRequests(existing);
        setHireResult("duplicate");
        setGate3Hired(true);
        logAction(currentUser.uid, "project.updated", {
          action: "hire-invite-duplicate",
          dev: dev.fullName,
          projectId: savedProjectId,
        }).catch(() => {});
        return;
      }

      const token = await createHireRequest({
        projectId:      savedProjectId ?? null,
        projectName,
        projectSummary: project?.idea ?? "",
        projectIdea:    project?.idea ?? "",
        creatorUid:     currentUser.uid,
        creatorName:    currentUser.displayName ?? currentUser.email ?? "Project Creator",
        creatorEmail:   currentUser.email ?? "",
        developerUid:   dev.userId,
        developerName:  dev.fullName,
        developerEmail,
      });

      const res = await fetch("/api/hire-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          projectName,
          projectSummary: project?.idea ?? "",
          projectIdea:    project?.idea ?? "",
          creatorName:    currentUser.displayName ?? currentUser.email ?? "Project Creator",
          creatorEmail:   currentUser.email ?? "",
          developerName:  dev.fullName,
          developerEmail,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSentTokens((prev) => ({ ...prev, [dev.userId]: token }));
        const refreshed = await getHireRequestsByCreator(currentUser.uid);
        setHireRequests(refreshed);
        setHireResult("sent");
        setGate3Hired(true);
        logAction(currentUser.uid, "project.updated", {
          action: "hire-invite-sent",
          dev: dev.fullName,
          projectId: savedProjectId,
        }).catch(() => {});
      } else {
        await deleteDoc(doc(db, "hireRequests", token)).catch(() => {});
        setHireResult("error");
        {
          const err = typeof data?.error === "string" ? data.error : "";
          const hint = typeof data?.hint === "string" ? data.hint : "";
          setHireErrorDetail(
            [err, hint].filter(Boolean).join("\n\n") || null,
          );
        }
      }
    } catch (e) {
      setHireResult("error");
      setHireErrorDetail(e instanceof Error ? e.message : null);
    } finally {
      setHireSending(false);
    }
  }

  // ── Real-time chat send ────────────────────────────────────────────────────
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
        senderName: currentUser.displayName ?? currentUser.email ?? "Project Creator",
      });
      await maybeSetOfflinePingForPartner(activeChatId, uid);
    } catch (e) {
      setChatText(text);
      setChatSubError(e instanceof Error ? e.message : "Could not send message. Check your connection and Firestore rules.");
    } finally {
      setChatSending(false);
    }
  }

  // ── Load shared Project Audit Log ──────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== "audit" || !currentUser || !savedProjectId) return;
    setLoadingAudit(true);
    getProjectAuditLog(savedProjectId, 30)
      .then(entries => setAuditEntries(entries))
      .catch(() => {})
      .finally(() => setLoadingAudit(false));
  }, [activeTab, currentUser, savedProjectId]);

  // ── Task actions ────────────────────────────────────────────────────────────
  async function approveTask(task: Task, milestoneId: string) {
    if (!project || !savedProjectId || !currentUser || workspaceProjectCompleted) return;
    const nextMilestones = milestones.map(m => {
      if (m.id !== milestoneId) return m;
      return {
        ...m,
        tasks: m.tasks.map(t => (t.id === task.id ? { ...t, status: "approved" as TaskStatus } : t)),
      };
    });
    const derived = withDerivedMilestoneStatuses(nextMilestones);
    setMilestones(derived);
    await setWorkspaceMilestones(savedProjectId, derived, currentUser?.uid);
    setReviewTask(null);
    void postTaskWorkflowNotify("approved", task.title);
    logAction(currentUser.uid, "milestone.approved", {
      taskId: task.id,
      taskTitle: task.title,
      projectId: savedProjectId
    }).catch(() => {});
  }

  async function rejectTask(task: Task, milestoneId: string) {
    if (!project || !savedProjectId || !currentUser || workspaceProjectCompleted) return;
    const nextMilestones = milestones.map(m => {
      if (m.id !== milestoneId) return m;
      return {
        ...m,
        tasks: m.tasks.map(t =>
          t.id === task.id ? { ...t, status: "reopened" as TaskStatus, submission: t.submission ?? "" } : t,
        ),
      };
    });
    const derived = withDerivedMilestoneStatuses(nextMilestones);
    setMilestones(derived);
    await setWorkspaceMilestones(savedProjectId, derived, currentUser?.uid);
    setReviewTask(null);
    void postTaskWorkflowNotify("reopened", task.title);
    logAction(currentUser.uid, "milestone.rejected", {
      taskId: task.id,
      taskTitle: task.title,
      projectId: savedProjectId
    }).catch(() => {});
  }

  async function markTaskCompleted(milestoneId: string, task: Task, submission: string) {
    if (!project || !savedProjectId || !currentUser || workspaceProjectCompleted) return;
    const nextMilestones = milestones.map(m => {
      if (m.id !== milestoneId) return m;
      return {
        ...m,
        tasks: m.tasks.map(t =>
          t.id === task.id
            ? { ...t, status: "completed_by_developer" as TaskStatus, submission }
            : t,
        ),
      };
    });
    const derived = withDerivedMilestoneStatuses(nextMilestones);
    setMilestones(derived);
    await setWorkspaceMilestones(savedProjectId, derived, currentUser?.uid);
    void postTaskWorkflowNotify("completed_by_developer", task.title);
    logAction(currentUser.uid, "milestone.submitted", {
      taskId: task.id,
      taskTitle: task.title,
      projectId: savedProjectId
    }).catch(() => {});
  }

  // ── Messaging ───────────────────────────────────────────────────────────────
  function sendMessage() {
    if (!newMsg.trim()) return;
    setMessages(prev => [...prev, { id: Date.now(), from: "You", text: newMsg.trim(), time: "just now", isMe: true }]);
    setNewMsg("");
    setTimeout(() => {
      setMessages(prev => [...prev, { id: Date.now() + 1, from: "Alex M.", text: "Got it! I'll update the task and push the changes.", time: "just now", isMe: false }]);
    }, 1500);
  }

  // ── Deploy simulation ───────────────────────────────────────────────────────
  const DEPLOY_STAGES = [
    { label: "Run Tests",        icon: <Activity className="w-4 h-4" />,    time: "12s" },
    { label: "Type Check",       icon: <CheckCircle2 className="w-4 h-4" />, time: "8s"  },
    { label: "Build",            icon: <Package className="w-4 h-4" />,      time: "45s" },
    { label: "Deploy to Vercel", icon: <Rocket className="w-4 h-4" />,       time: "20s" },
    { label: "Health Check",     icon: <Eye className="w-4 h-4" />,          time: "5s"  },
  ];

  function startDeploy() {
    if (deploying) return;
    setDeploying(true);
    setDeployStage(0);
    setDeployLogs(["[build] Initializing Vercel deployment pipeline...", "[env] Loading production secrets...", "[git] Fetching latest commit: main"]);
    
    DEPLOY_STAGES.forEach((stage, i) => {
      setTimeout(() => {
        setDeployStage(i + 1);
        setDeployLogs(prev => [
          ...prev, 
          `[${stage.label.toLowerCase().replace(/ /g, "_")}] ${stage.label} specialized runner started...`,
          `[${stage.label.toLowerCase().replace(/ /g, "_")}] Execution time estimated: ${stage.time}`,
          `[${stage.label.toLowerCase().replace(/ /g, "_")}] Completed successfully.`
        ]);

        if (i === DEPLOY_STAGES.length - 1) {
          setDeploying(false);
          setDeployLogs(prev => [...prev, "[deploy] Live URL generated: buildcraft-eight.vercel.app", "[system] Deployment stable 100%"]);
          if (currentUser) logAction(currentUser.uid, "project.updated", { 
            action: "deployed", 
            version,
            projectId: savedProjectId 
          });
        }
      }, (i + 1) * 2000);
    });
  }

  // ── Milestone completion check ─────────────────────────────────────────────
  function milestoneProgress(m: Milestone) {
    const done = m.tasks.filter(t => isTaskClientApproved(t)).length;
    return { done, total: m.tasks.length, pct: m.tasks.length ? Math.round((done / m.tasks.length) * 100) : 0 };
  }

  function milestoneIdForTask(taskId: string): string | null {
    for (const m of milestones) {
      if (m.tasks.some(t => t.id === taskId)) return m.id;
    }
    return null;
  }

  async function postTaskWorkflowNotify(
    kind: "completed_by_developer" | "approved" | "reopened",
    taskTitle: string,
  ) {
    if (!savedProjectId) return;
    try {
      await fetch("/api/notify-task-workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: savedProjectId,
          projectName,
          kind,
          taskTitle,
        }),
      });
    } catch {
      /* optional */
    }
  }

  const AUDIT_ICONS: Record<string, { icon: React.ReactNode; color: string }> = {
    "analysis.generated":       { icon: <Sparkles className="w-4 h-4" />,    color: "indigo" },
    "project.created":          { icon: <GitMerge className="w-4 h-4" />,    color: "blue"   },
    "project.locked":           { icon: <Lock className="w-4 h-4" />,         color: "green"  },
    "project.updated":          { icon: <CheckCircle2 className="w-4 h-4" />, color: "green"  },
    "tool.approved":            { icon: <CheckCircle2 className="w-4 h-4" />, color: "green"  },
    "tool.rejected":            { icon: <XCircle className="w-4 h-4" />,      color: "red"    },
    "milestone.approved":       { icon: <CheckSquare className="w-4 h-4" />,  color: "green"  },
    "milestone.rejected":       { icon: <Trash2 className="w-4 h-4" />,       color: "red"    },
    "auth.sign_in":             { icon: <Shield className="w-4 h-4" />,       color: "white"  },
    "auth.sign_up":             { icon: <Shield className="w-4 h-4" />,       color: "white"  },
    "code.generated":           { icon: <Terminal className="w-4 h-4" />,     color: "purple" },
    "ui.generated":             { icon: <Layers className="w-4 h-4" />,       color: "blue"   },
    "prompts.generated":        { icon: <Zap className="w-4 h-4" />,          color: "yellow" },
    "project.saved_to_firestore": { icon: <GitBranch className="w-4 h-4" />, color: "blue"   },
  };

  const COLOR_CLS: Record<string, string> = {
    indigo: "bg-indigo-500/20 border-indigo-500 text-indigo-400",
    blue:   "bg-blue-500/20 border-blue-500 text-blue-400",
    green:  "bg-emerald-500/20 border-emerald-500 text-emerald-400",
    red:    "bg-red-500/20 border-red-500 text-red-400",
    purple: "bg-purple-500/20 border-purple-500 text-purple-400",
    yellow: "bg-yellow-500/20 border-yellow-500 text-yellow-400",
    white:  "bg-white/10 border-white/30 text-white/60",
  };

  if (loadingProject || (!authReady && hasProjectIdParam)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 text-purple-500 animate-spin mx-auto" />
          <p className="text-white/40 text-sm font-medium">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (projectLoadFailed && hasProjectIdParam && !project) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="text-center space-y-4 max-w-md">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
          <h2 className="text-white font-bold text-lg">Unable to load project</h2>
          <p className="text-white/40 text-sm">This project could not be found or you don&apos;t have access yet. If you were recently hired, the project owner may need to re-share access.</p>
          <div className="flex gap-3 justify-center pt-2">
            <button onClick={() => router.push("/employee-dashboard")} className="px-5 py-2.5 bg-white/10 border border-white/10 text-white rounded-xl text-sm font-bold hover:bg-white/20 transition-all">
              Back to Dashboard
            </button>
            <button onClick={() => { setProjectLoadFailed(false); setLoadRetry(c => c + 1); }} className="px-5 py-2.5 bg-purple-600 border border-purple-500 text-white rounded-xl text-sm font-bold hover:bg-purple-500 transition-all">
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const devWorkspaceBlocked =
    isDeveloperWorkspace &&
    !!project &&
    !!currentUser?.uid &&
    !!project.developerUid &&
    project.developerUid !== currentUser.uid;

  if (devWorkspaceBlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="text-center space-y-4 max-w-md px-4">
          <Shield className="w-10 h-10 text-amber-400 mx-auto" />
          <h2 className="text-white font-bold text-lg">Access restricted</h2>
          <p className="text-white/40 text-sm">This workspace is assigned to another developer. Open a project from your dashboard that you were hired for.</p>
          <button type="button" onClick={() => router.push("/employee-dashboard")} className="px-5 py-2.5 bg-white/10 border border-white/10 text-white rounded-xl text-sm font-bold hover:bg-white/20 transition-all">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const mustWaitCreatorHydration =
    isCreator &&
    !isDeveloperWorkspace &&
    authReady &&
    currentUser &&
    currentUser.uid !== "demo-guest" &&
    userRoles.includes("employer") &&
    !projectCreatorHydrated;

  if (mustWaitCreatorHydration) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[#0a0a0a] text-white/50">
        <Loader2 className="w-10 h-10 animate-spin text-purple-400/80" />
        <p className="text-xs font-light">Loading workspace…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative flex">
      <CreatorFlowGuard />
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] z-50 bg-[url('/noise.svg')]" />
      <div className="fixed top-1/4 right-1/4 w-[500px] h-[500px] bg-white/[0.02] rounded-full blur-[150px] pointer-events-none -z-10" />

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="w-64 border-r border-white/5 bg-[#050505]/80 backdrop-blur-xl flex flex-col p-6 sticky top-0 h-screen overflow-y-auto">
        <div className="mb-6">
          <Link href="/" className="flex items-center gap-2 group w-fit mb-1">
            <span className="text-lg font-black text-white tracking-tighter group-hover:text-white/80 transition-colors truncate max-w-[180px]">BuildCraft AI</span>
          </Link>
          <div className="text-[10px] text-white/30 truncate mb-1">{projectName}</div>
          <div className="text-green-500 text-[10px] uppercase tracking-[0.2em] flex items-center gap-1 font-bold">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Workspace Active
          </div>
          <div className="text-[#888] text-[10px] mt-1">{version} · {approvedCount} tools approved</div>
        </div>

        {/* Overall progress */}
        <div className="mb-5 p-3 bg-white/5 rounded-xl border border-white/10">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Overall Progress</span>
            <span className="text-emerald-400 font-bold text-xs">{progress}%</span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between mt-2 text-[9px] text-[#888]">
            <span>{doneTasks} approved</span>
            <span>{inReview ? `${inReview} client review` : "0 client review"}</span>
            <span>{taskCounts.otherTodo} open</span>
          </div>
        </div>

        <nav className="flex-grow space-y-1.5">
          <Link href="/" className="flex items-center gap-3 w-full px-3 py-2.5 text-white/40 hover:text-white hover:bg-white/5 rounded-xl transition-all text-xs group">
            <Home className="w-4 h-4 group-hover:text-blue-400 transition-colors" /> 
            <span className="font-medium">Home</span>
          </Link>

          {isDeveloperWorkspace && (
            <Link href="/employee-dashboard" className="flex items-center gap-3 w-full px-3 py-2.5 text-white/40 hover:text-white hover:bg-white/5 rounded-xl transition-all text-xs group border border-transparent hover:border-indigo-500/20">
              <Briefcase className="w-4 h-4 group-hover:text-indigo-400 transition-colors" />
              <span className="font-medium">Developer Dashboard</span>
            </Link>
          )}

          {isCreator && currentUser && userRoles.includes("employer") && (
            <Link
              href="/creator/profile"
              className="flex items-center gap-3 w-full px-3 py-2.5 text-white/40 hover:text-white hover:bg-white/5 rounded-xl transition-all text-xs group"
            >
              <UserRound className="w-4 h-4 group-hover:text-purple-400 transition-colors shrink-0" />
              <span className="font-medium">Profile</span>
            </Link>
          )}

          {isCreator && (
            <>
              {/* Requirements */}
              <button onClick={() => router.push("/discovery")} className="flex items-center gap-3 w-full px-3 py-2.5 text-white/40 hover:text-white hover:bg-white/5 transition-all rounded-xl text-xs group">
                <Layers className="w-4 h-4 group-hover:text-blue-400 transition-colors" />
                <span className="font-medium">Requirements</span>
              </button>

              {/* Architecture */}
              <button onClick={() => router.push("/architecture")} className="flex items-center gap-3 w-full px-3 py-2.5 text-white/40 hover:text-white hover:bg-white/5 transition-all rounded-xl text-xs group">
                <Activity className="w-4 h-4 group-hover:text-indigo-400 transition-colors" />
                <span className="font-medium">Architecture</span>
              </button>
            </>
          )}

          <div className="pt-2 pb-1 border-t border-white/5 my-2"></div>
          
          {/* Project Workspace tabs */}
          {([
            { id: "milestones", label: "Tasks & Milestones",   icon: <ListOrdered className="w-5 h-5" />,  badge: inReview > 0 ? `${inReview} review` : null },
            { id: "talent",     label: hiringState === "accepted" ? "Hired Developer" : hiringState === "pending" ? "Hiring Status" : "Find Developers", icon: <UserCheck className="w-5 h-5" />,    badge: hiringState === "accepted" ? "Active" : hiringState === "pending" ? "Pending" : (gate3Hired ? null : "!") },
            { id: "architecture", label: "Architecture & Tools", icon: <Layers className="w-5 h-5" />, badge: approvedCount > 0 ? String(approvedCount) : null },
            { id: "deliverables", label: "Files & Deliverables", icon: <Package className="w-5 h-5" />, badge: doneTasks > 0 ? `${doneTasks} done` : null },
            { id: "prd",        label: "PRD Document",    icon: <FileText className="w-5 h-5" />,     badge: prds.length > 0 ? "New" : null },
            { id: "chat",       label: (isDeveloper || isDeveloperWorkspace) ? "Chat with Client" : "Chat with Developer",   icon: <MessageSquare className="w-5 h-5" />, badge: activeChatId ? "Live" : null },
            { id: "history",    label: "Hiring History",  icon: <FolderOpen className="w-5 h-5" />,   badge: hireRequests.length > 0 ? String(hireRequests.length) : null },
            { id: "completion",  label: "Completion",      icon: <Flag className="w-5 h-5" />,         badge: !completionSectionUnlocked ? "Locked" : projExec?.status === "review" ? "Review" : projExec?.status === "completed" ? "Done" : completionSectionUnlocked ? "Ready" : null },
            { id: "deploy",     label: "CI/CD Deploy",    icon: <Rocket className="w-5 h-5" />,       badge: completionSectionUnlocked ? "Ready" : null },
            { id: "audit",      label: "Audit Log",       icon: <History className="w-5 h-5" /> },
          ] as const).filter(t => visibleTabs.includes(t.id)).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as Tab)}
              className={`flex items-center gap-3 w-full p-3 font-bold rounded-xl transition-all relative overflow-hidden group ${
                activeTab === tab.id 
                  ? "text-white bg-gradient-to-r from-purple-500/15 to-transparent border border-purple-500/20 shadow-[0_0_20px_rgba(168,85,247,0.05)]" 
                  : "text-[#888] hover:text-white hover:bg-white/5 border border-transparent"
              }`}>
              {activeTab === tab.id && <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-purple-500 rounded-full" />}
              {tab.icon}
              <span className="text-sm flex-1 text-left">{tab.label}</span>
              {"badge" in tab && tab.badge && (
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${
                  activeTab === tab.id ? "bg-purple-500/20 text-purple-300 border-purple-500/20" : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {!isDeveloperWorkspace && (
        <div className="mt-4 space-y-3">
          <button onClick={() => setShowRollbackConfirm(true)}
            className="w-full flex items-center gap-2 p-3 text-[#888] hover:text-yellow-500 hover:bg-yellow-500/5 rounded-lg transition-all text-xs font-bold uppercase tracking-widest border border-transparent hover:border-yellow-500/20">
            <RotateCcw className="w-4 h-4" /> Revert to {version}
          </button>
          <div className="p-3 bg-white/5 border border-white/10 rounded-xl">
            <div className="text-[9px] uppercase tracking-widest text-white/40 mb-1 font-bold flex items-center gap-1">
              <Bell className="w-3 h-3" /> Weekly Check-in
            </div>
            <p className="text-[10px] text-[#888] font-light">Next check-in: Monday 9:00 AM</p>
          </div>
        </div>
        )}
      </aside>

      {/* ── Main Content ────────────────────────────────────────────────────── */}
      <main className="flex-grow p-10 overflow-y-auto">
        <div className="max-w-4xl space-y-10">
          {isDeveloper || isDeveloperWorkspace ? (
            <DeveloperFlowBreadcrumb
              className="rounded-2xl border border-white/10 bg-white/[0.03] mb-2"
              includeProjectRoomPath={isDeveloper && !isDeveloperWorkspace}
            />
          ) : (
            <CreatorFlowBreadcrumb />
          )}

          <header className="border-b border-white/10 pb-8 flex justify-between items-end flex-wrap gap-4">
            <div className="space-y-2">
              <h1 className="text-5xl font-black tracking-tighter text-white">
                {isDeveloperWorkspace ? "Developer workspace" : "Project Workspace"}
              </h1>
              <p className="text-[#888] text-lg font-light tracking-wide">
                {isDeveloperWorkspace
                  ? "PRD, milestones, chat, and completion — synced in real time with your client."
                  : "Manage milestones, review submissions, and ship to production."}
              </p>
            </div>
            <div className="flex gap-2 text-xs font-bold uppercase tracking-widest flex-wrap">
              <span className="px-3 py-1.5 rounded-md border border-white/10 bg-black text-[#888]">{chatParticipantRole === "creator" ? "Employer" : "Developer"}</span>
              <span className="px-3 py-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 text-emerald-500">Plan Locked</span>
              {projExec && (
                <span className={`px-3 py-1.5 rounded-md border ${getStatusColor(projExec.status)}`}>
                  {getStatusLabel(projExec.status)}
                </span>
              )}
              {activeTab === "milestones" && hiringState === "no-hire" && (
                <button 
                  onClick={regenerateMilestones}
                  disabled={loadingMilestones || workspaceProjectCompleted}
                  className="px-3 py-1.5 rounded-lg border border-white/20 bg-gradient-to-r from-white/10 to-white/5 text-white/90 hover:text-white hover:border-white/40 hover:shadow-[0_0_15px_rgba(255,255,255,0.15)] transition-all disabled:opacity-50 flex items-center gap-1.5 group overflow-hidden relative"
                >
                  <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <span className="relative z-10 flex items-center gap-1.5">
                   {loadingMilestones ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                   {loadingMilestones ? "Generating..." : "Regenerate Milestones"}
                  </span>
                </button>
              )}
            </div>
          </header>

          {loadingMilestones && (
            <div className="flex items-center gap-3 p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl">
              <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
              <p className="text-sm text-white/70 font-light">AI is generating project milestones for <strong>{projectName}</strong>…</p>
            </div>
          )}

          {workspaceProjectCompleted && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-emerald-300 uppercase tracking-widest">Project completed</p>
                <p className="text-xs text-white/60 mt-1">
                  This engagement is closed with dual approval. Tasks and milestones are view-only.
                  {project?.completionDeploymentUrl ? (
                    <>
                      {" "}
                      <a href={project.completionDeploymentUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-300 hover:text-indigo-200 underline break-all">
                        Live deployment
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
            </div>
          )}

          <AnimatePresence mode="wait">

            {/* ── MILESTONES TAB ──────────────────────────────────────────── */}
            {activeTab === "milestones" && (
              <motion.section key="milestones" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">

                {/* Stage gate summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {milestones.map(m => {
                    const mp = milestoneProgress(m);
                    const mc = MILESTONE_COLORS[m.color] ?? MILESTONE_COLORS.blue;
                    return (
                      <button key={m.id} onClick={() => { setExpandedMilestone(m.id); }}
                        className={`group relative p-5 rounded-3xl border text-left transition-all duration-300 transform hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)] overflow-hidden ${expandedMilestone === m.id ? `bg-gradient-to-br from-[#161616] to-[#0A0A0A] border-indigo-500/40 shadow-[0_0_25px_rgba(79,70,229,0.15)]` : "bg-[#0A0A0A]/80 border-white/5 hover:border-white/15"}`}>
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                        <div className={`text-[9px] font-black uppercase tracking-[0.2em] mb-2 ${mc.badge.split(" ")[0]}`}>{m.phase}</div>
                        <div className="relative z-10 text-white text-sm font-bold mb-4 line-clamp-2 leading-snug group-hover:text-indigo-200 transition-colors">{m.title}</div>
                        <div className="relative z-10 h-1.5 bg-black/40 rounded-full overflow-hidden shadow-inner">
                          <div className={`h-full rounded-full transition-all duration-700 ease-out ${mc.dot}`} style={{ width: `${mp.pct}%` }} />
                        </div>
                        <div className="relative z-10 text-[10px] uppercase tracking-widest font-black text-white/30 mt-3 flex justify-between">
                          <span>Progress</span>
                          <span className={mp.pct === 100 ? "text-emerald-400" : "text-white/60"}>{mp.done}/{mp.total} done</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Expanded milestone task list */}
                {milestones.map(m => m.id === expandedMilestone && (
                  <div key={m.id} className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-white font-black text-xl">{m.phase}: {m.title}</h2>
                      <span className="text-[10px] text-[#888]">{m.estimatedDays} days est.</span>
                    </div>
                    <p className="text-[#888] text-sm font-light">{m.description}</p>

                    <div className="space-y-3">
                      {m.tasks.map(task => {
                        const sc: Record<TaskStatus, { label: string; color: string; bg: string }> = {
                          "pending":     { label: "Pending",       color: "text-white/40",    bg: "bg-white/5 border-white/5" },
                          "in-progress": { label: "In Progress", color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.15)]" },
                          "validating":  { label: "Validating",  color: "text-yellow-400",  bg: "bg-yellow-500/10 border-yellow-500/30 shadow-[0_0_15px_rgba(234,179,8,0.15)]" },
                          "completed_by_developer": { label: "Awaiting client", color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.15)]" },
                          "approved":    { label: "Approved",    color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)]" },
                          "reopened":    { label: "Reopened",    color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.15)]" },
                        };
                        const s = sc[task.status];
                        return (
                          <div key={task.id}
                            className={`group relative p-5 rounded-3xl border transition-all duration-300 transform ${task.status === "completed_by_developer" ? "hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(168,85,247,0.2)] bg-gradient-to-br from-[#160f24] to-[#0A0A0A] border-purple-500/30 cursor-pointer" : "hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)] bg-gradient-to-br from-[#111] to-[#050505] border-white/5 hover:border-white/15"}`}
                            onClick={() => task.status === "completed_by_developer" && isCreator && !workspaceProjectCompleted && setReviewTask(task)}>
                            <div className="flex items-start justify-between gap-4 flex-wrap">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-1 flex-wrap">
                                  <h4 className="text-white font-bold text-sm">{task.title}</h4>
                                  <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${s.bg} ${s.color}`}>{s.label}</span>
                                </div>
                                <p className="text-[#888] text-xs font-light">{task.description}</p>
                                <div className="flex items-center gap-3 mt-2 flex-wrap">
                                  <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${TYPE_COLOR[task.type]}`}>
                                    {TYPE_ICON[task.type]} {task.type}
                                  </span>
                                  <span className="text-[10px] text-[#888] flex items-center gap-1">
                                    <Clock className="w-3 h-3" />{task.estimatedHours}h
                                  </span>
                                  <span className={`text-[10px] font-bold uppercase flex items-center gap-1 ${task.priority === "high" ? "text-red-400" : task.priority === "medium" ? "text-yellow-400" : "text-white/30"}`}>
                                    <Flag className="w-3 h-3" />{task.priority}
                                  </span>
                                  {task.assignee && <span className="text-[10px] text-[#888]">· {task.assignee}</span>}
                                </div>
                              </div>

                              <div className="shrink-0 flex items-center gap-3">
                                {task.validationScore && (
                                  <div className="text-center">
                                    <div className={`text-lg font-black ${task.validationScore >= 80 ? "text-emerald-400" : "text-red-400"}`}>{task.validationScore}</div>
                                    <div className="text-[9px] text-[#888]">AI Score</div>
                                  </div>
                                )}
                                {task.status === "completed_by_developer" && isCreator && !workspaceProjectCompleted && (
                                  <div className="flex flex-col gap-2">
                                    <button type="button" onClick={e => { e.stopPropagation(); void approveTask(task, m.id); }}
                                      className="px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 font-black text-[10px] uppercase tracking-widest rounded-lg hover:bg-emerald-500/30 transition-all flex items-center gap-1">
                                      <CheckCircle className="w-3 h-3" /> Approve
                                    </button>
                                    <button type="button" onClick={e => { e.stopPropagation(); void rejectTask(task, m.id); }}
                                      className="px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 font-black text-[10px] uppercase tracking-widest rounded-lg hover:bg-red-500/20 transition-all flex items-center gap-1">
                                      <XCircle className="w-3 h-3" /> Request changes
                                    </button>
                                  </div>
                                )}
                                {(task.status === "pending" || task.status === "in-progress" || task.status === "validating" || task.status === "reopened") && isDeveloper && !workspaceProjectCompleted && (
                                  <button type="button" onClick={e => { e.stopPropagation(); void markTaskCompleted(m.id, task, task.status === "reopened" ? "Addressed feedback and re-completed work." : "Marked complete by developer in workspace."); }}
                                    className="px-4 py-2 border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-emerald-500/20 transition-all flex items-center gap-2">
                                    <Play className="w-3 h-3" /> Mark as completed
                                  </button>
                                )}
                                {task.status === "approved" && (
                                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                                )}
                              </div>
                            </div>

                            {task.submission && (task.status === "completed_by_developer" || task.status === "reopened") && (
                              <div className="mt-3 pt-3 border-t border-white/5">
                                <p className="text-[10px] text-purple-400 font-bold uppercase tracking-widest mb-1">Developer notes</p>
                                <p className="text-xs text-white/50 font-mono line-clamp-2">{task.submission}</p>
                                {task.status === "completed_by_developer" && isCreator && (
                                  <p className="text-[10px] text-white/30 mt-1">Click card to open full review</p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Approval dashboard summary */}
                <div className="relative overflow-hidden bg-gradient-to-br from-[#0c0c0c] to-[#040404] p-8 rounded-3xl border border-white/5 shadow-[0_15px_50px_rgba(0,0,0,0.5)]">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-[80px] pointer-events-none" />
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50 mb-6 flex items-center gap-2 relative z-10">
                    <BarChart2 className="w-4 h-4 text-indigo-400" /> Project Status Summary
                  </h3>
                  <div className="grid grid-cols-3 gap-5 relative z-10">
                    {[
                      { label: "Approved", count: doneTasks, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)]" },
                      { label: "Awaiting client", count: inReview, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20 shadow-[0_0_20px_rgba(168,85,247,0.1)]" },
                      { label: "Remaining", count: taskCounts.otherTodo, color: "text-white/60", bg: "bg-[#111] border-white/5" },
                    ].map(s => (
                      <div key={s.label} className={`p-5 rounded-2xl border text-center transition-transform hover:-translate-y-1 ${s.bg}`}>
                        <div className={`text-4xl font-black ${s.color}`}>{s.count}</div>
                        <div className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-2">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.section>
            )}

            {/* ── TALENT / HIRING tab — single container for AnimatePresence ── */}
            {activeTab === "talent" && (
              <motion.section key="talent" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">

                {/* Loading guard */}
                {(!authReady || !currentUser) && (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                    <p className="text-sm text-white/40 font-light">Initializing developer matching engine...</p>
                  </div>
                )}

                {/* Accepted state */}
                {authReady && !!currentUser && isCreator && hiringState === "accepted" && acceptedHire && (
                  <>
                    <div>
                      <h2 className="text-white font-black text-xl tracking-tight flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" /> Developer Assigned
                      </h2>
                      <p className="text-white/40 text-xs font-light mt-1">
                        Your developer has accepted the invitation. Project is now in progress.
                      </p>
                    </div>

                    <div className="glass-panel p-6 rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent space-y-5">
                      <div className="flex items-center gap-5">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-emerald-500/20 to-emerald-500/5 border border-emerald-500/20 flex items-center justify-center shrink-0">
                          <UserCheck className="w-7 h-7 text-emerald-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-black text-white tracking-tight">{acceptedHire.developerName}</h3>
                          <p className="text-xs text-white/40 truncate">{acceptedHire.developerEmail}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg border text-emerald-400 border-emerald-500/30 bg-emerald-500/10">Accepted</span>
                            {acceptedHire.respondedAt && (() => {
                              const jd = parseToDate(acceptedHire.respondedAt);
                              return jd ? (
                                <span className="text-[10px] text-white/25">{formatJoinedPrefix(jd)}</span>
                              ) : null;
                            })()}
                          </div>
                        </div>
                        <div className="shrink-0 flex gap-2">
                          <button onClick={() => { setActiveChatId(acceptedHire.token); setActiveTab("chat"); }}
                            className="px-4 py-2.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500/20 transition-all flex items-center gap-2">
                            <MessageSquare className="w-3.5 h-3.5" /> Chat
                          </button>
                          <button onClick={() => setActiveTab("milestones")}
                            className="px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white/60 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2">
                            <ListOrdered className="w-3.5 h-3.5" /> Tasks
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 pt-3 border-t border-white/5">
                        <div className="text-center p-3 bg-white/5 rounded-xl">
                          <div className="text-2xl font-black text-white">{progress}%</div>
                          <div className="text-[9px] text-white/30 uppercase tracking-widest font-bold mt-1">Progress</div>
                        </div>
                        <div className="text-center p-3 bg-white/5 rounded-xl">
                          <div className="text-2xl font-black text-emerald-400">{doneTasks}</div>
                          <div className="text-[9px] text-white/30 uppercase tracking-widest font-bold mt-1">Completed</div>
                        </div>
                        <div className="text-center p-3 bg-white/5 rounded-xl">
                          <div className="text-2xl font-black text-amber-400">{inReview}</div>
                          <div className="text-[9px] text-white/30 uppercase tracking-widest font-bold mt-1">In Review</div>
                        </div>
                      </div>
                    </div>

                    {pendingHires.length > 0 && (
                      <div className="p-4 bg-amber-500/5 border border-amber-500/15 rounded-xl">
                        <p className="text-[10px] text-amber-400 font-bold uppercase tracking-widest mb-2">Other Pending Invitations</p>
                        <div className="space-y-2">
                          {pendingHires.map(r => (
                            <div key={r.token} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                              <span className="text-xs text-white/60">{r.developerName}</span>
                              <span className="text-[9px] text-amber-400/60 uppercase tracking-widest">Pending</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Pending state: hiring status + matching engine below */}
                {authReady && !!currentUser && isCreator && hiringState === "pending" && (
                  <>
                    <div>
                      <h2 className="text-white font-black text-xl tracking-tight flex items-center gap-2">
                        <Clock className="w-5 h-5 text-amber-400" /> Hiring Status
                      </h2>
                      <p className="text-white/40 text-xs font-light mt-1">
                        Invitation sent — waiting for developer response.
                      </p>
                    </div>

                    <div className="space-y-4">
                      {pendingHires.map(r => (
                        <div key={r.token} className="glass-panel p-6 rounded-3xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent">
                          <div className="flex items-center gap-5">
                            <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-amber-500/20 to-amber-500/5 border border-amber-500/20 flex items-center justify-center shrink-0">
                              <UserCheck className="w-6 h-6 text-amber-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-lg font-black text-white tracking-tight">{r.developerName}</h3>
                              <p className="text-xs text-white/40 truncate">{r.developerEmail}</p>
                              <div className="flex items-center gap-3 mt-2">
                                <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg border text-amber-400 border-amber-500/30 bg-amber-500/10 flex items-center gap-1.5">
                                  <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" /> Pending
                                </span>
                                {r.createdAt && (() => {
                                  const sd = parseToDate(r.createdAt);
                                  return sd ? (
                                    <span className="text-[10px] text-white/25">{formatSentPrefix(sd)}</span>
                                  ) : null;
                                })()}
                                {r.expiresAt && (() => {
                                  const ed = parseToDate(r.expiresAt);
                                  return ed ? (
                                    <span className="text-[10px] text-white/20">{formatExpiresLabel(ed)}</span>
                                  ) : null;
                                })()}
                              </div>
                            </div>
                            <button
                              onClick={async () => {
                                try {
                                  await deleteDoc(doc(db, "hireRequests", r.token));
                                  setHireRequests((prev) => prev.filter((h) => h.token !== r.token));
                                  setSentTokens((prev) => {
                                    const n = { ...prev };
                                    delete n[r.developerUid];
                                    return n;
                                  });
                                } catch { /* ignore */ }
                              }}
                              className="px-3 py-2 rounded-xl border border-white/10 text-white/30 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/5 text-[10px] font-bold uppercase tracking-widest transition-all shrink-0"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="p-4 bg-white/5 border border-white/10 rounded-xl flex items-start gap-3">
                      <Info className="w-4 h-4 text-white/30 shrink-0 mt-0.5" />
                      <div className="text-xs text-white/50 font-light leading-relaxed">
                        <p>You can invite additional developers while waiting. The first to accept will be assigned to the project.</p>
                        <button onClick={() => runMatchingEngine()} className="mt-2 text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-widest text-[10px] transition-colors">
                          Find More Developers →
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-white/5 pt-6">
                      <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest mb-4">Browse More Developers</p>
                    </div>
                  </>
                )}

                {/* Matching engine: shown for no-hire and pending states */}
                {authReady && !!currentUser && isCreator && (hiringState === "no-hire" || hiringState === "pending") && (
                  <>

                {/* Header */}
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <h2 className="text-white font-black text-xl tracking-tight flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-indigo-400" /> AI Developer Matching Engine
                    </h2>
                    <p className="text-white/40 text-xs font-light mt-1">
                      Ranked by skill overlap · experience · verification tier · portfolio
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {matchedDevs.length > 0 && (
                      <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold uppercase tracking-widest">
                        <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                        {matchedDevs.length} matches found
                      </span>
                    )}
                    <button onClick={runMatchingEngine} disabled={matchLoading}
                      className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 text-white/50 hover:text-white rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-30">
                      <RotateCcw className={`w-3 h-3 ${matchLoading ? "animate-spin" : ""}`} /> Re-run
                    </button>
                  </div>
                </div>

                {/* Project requirements summary */}
                <div className="p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-xl flex items-start gap-3">
                  <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-white/60 font-light">
                      Matching against <strong className="text-white">{projectName}</strong> requirements.
                      {Object.keys(approvedTools).filter(k => approvedTools[k]).length > 0 && (
                        <> Required stack: <span className="text-indigo-400">{Object.keys(approvedTools).filter(k => approvedTools[k]).join(", ")}</span></>
                      )}
                    </p>
                  </div>
                </div>

                {/* Loading skeleton */}
                {matchLoading && (
                  <div className="space-y-4">
                    {[1,2,3].map(i => (
                      <div key={i} className="relative group rounded-3xl border border-white/5 bg-gradient-to-br from-[#111] to-[#080808] p-6 animate-pulse">
                        <div className="flex gap-5 mb-4">
                          <div className="w-16 h-16 rounded-full bg-white/10 shrink-0" />
                          <div className="flex-1 space-y-2">
                            <div className="h-4 bg-white/10 rounded w-40" />
                            <div className="h-3 bg-white/5 rounded w-56" />
                            <div className="flex gap-2">
                              {[1,2,3].map(j => <div key={j} className="h-5 bg-white/5 rounded w-16" />)}
                            </div>
                          </div>
                          <div className="w-14 h-14 bg-white/5 rounded-xl" />
                        </div>
                        <div className="h-16 bg-white/5 rounded-xl" />
                      </div>
                    ))}
                    <p className="text-center text-xs text-white/30 font-light flex items-center justify-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Scoring and ranking developers from Firestore…
                    </p>
                  </div>
                )}

                {/* Error */}
                {matchError && !matchLoading && (
                  <div className="p-6 rounded-2xl border border-yellow-500/20 bg-yellow-500/5 space-y-3">
                    <p className="text-sm text-yellow-400 font-bold flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      {matchDetail ? "Could not load developers" : "No developers registered yet"}
                    </p>
                    {matchDetail ? (
                      <p className="text-xs text-white/60 font-light leading-relaxed">{matchDetail}</p>
                    ) : (
                      <p className="text-xs text-white/50 font-light">
                        Developers must finish registration (final submit) at <code className="text-indigo-400">/developer/register</code> while signed in. Guest sign-in does not save a profile to Firestore.
                      </p>
                    )}
                    <button onClick={runMatchingEngine} className="px-4 py-2 bg-white/5 border border-white/10 text-white text-xs font-bold rounded-xl hover:bg-white/10 transition-colors">
                      Try Again
                    </button>
                  </div>
                )}

                {/* Matched developer cards */}
                {!matchLoading && matchedDevs.length > 0 && (
                  <div className="space-y-4">
                    {matchedDevs.map((dev, i) => {
                      const link = projectHireReqs.find((r) => r.developerUid === dev.userId);
                      const isHired =
                        !!link && (link.status === "accepted" || link.status === "pending");
                      const isExpanded = !!expandedDevs[dev.userId];
                      const bandColor  = dev.confidenceBand === "Excellent" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
                        : dev.confidenceBand === "Strong" ? "text-blue-400 bg-blue-500/10 border-blue-500/30"
                        : dev.confidenceBand === "Good"   ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/30"
                        : "text-white/40 bg-white/5 border-white/10";
                      const tierLabel  = dev.verificationStatus === "project-verified" ? "Tier 3 · Project-Verified"
                        : dev.verificationStatus === "assessment-passed" ? "Tier 2 · Assessment-Passed"
                        : "Tier 1 · Self-Declared";
                      const tierColor  = dev.verificationStatus === "project-verified" ? "text-emerald-400"
                        : dev.verificationStatus === "assessment-passed" ? "text-yellow-400"
                        : "text-white/40";

                      return (
                        <motion.div
                          key={dev.userId}
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="group relative"
                        >
                          {/* Premium Glowing Border */}
                          <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-3xl blur opacity-0 group-hover:opacity-100 transition duration-500" />
                          
                          <div className="relative glass-panel p-6 rounded-3xl border border-white/10 hover:border-white/20 transition-all duration-300 overflow-hidden">
                            {/* Subtle background glow */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />

                            {/* Developer header */}
                            <div className="flex items-start gap-6 mb-6">
                              {/* Avatar & Score Combination */}
                              <div className="relative shrink-0">
                                <div className="w-20 h-20 rounded-full p-1 bg-gradient-to-tr from-white/10 to-white/5 border border-white/10">
                                  <div className="w-full h-full rounded-full overflow-hidden bg-[#0A0A0A] flex items-center justify-center">
                                    {dev.photoURL ? (
                                      <img src={dev.photoURL} alt={dev.fullName} className="w-full h-full object-cover" />
                                    ) : (
                                      <UserCheck className="w-8 h-8 text-white/20" />
                                    )}
                                  </div>
                                </div>
                                {/* Match Score Gauge (SVG) */}
                                <div className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-[#0F0F0F] border border-white/10 flex items-center justify-center shadow-2xl">
                                   <svg className="w-7 h-7 -rotate-90">
                                      <circle cx="14" cy="14" r="12" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/5" />
                                      <circle cx="14" cy="14" r="12" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray={75} strokeDashoffset={75 - (75 * (dev.matchScore / 100))} className={`${dev.matchScore > 80 ? "text-emerald-400" : "text-indigo-400"} transition-all duration-1000`} />
                                   </svg>
                                   <span className="absolute text-[8px] font-black text-white">{dev.matchScore}</span>
                                </div>
                              </div>

                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="space-y-1">
                                    <h3 className={`text-xl font-black tracking-tight leading-tight ${dev.verificationStatus === "project-verified" ? "silver-gradient" : "text-white"}`}>
                                      {dev.fullName || "Anonymous"}
                                    </h3>
                                    <div className="flex flex-wrap items-center gap-x-2 text-[10px] font-medium text-white/40">
                                      <span className="text-indigo-300/80">{dev.primaryRole?.toUpperCase()}</span>
                                      <span className="w-1 h-1 rounded-full bg-white/10" />
                                      <span>{dev.yearsExp} YEARS PASSION</span>
                                      <span className="w-1 h-1 rounded-full bg-white/10" />
                                      <span className="text-emerald-400/80 uppercase">{dev.availability}</span>
                                    </div>
                                    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest mt-2 ${tierColor} ${dev.verificationStatus !== "self-declared" ? "bg-emerald-500/5 shadow-[0_0_15px_rgba(52,211,153,0.1)]" : "bg-white/5 opacity-50"}`}>
                                      <ShieldCheck className="w-3 h-3" /> {tierLabel}
                                    </div>
                                  </div>
                                  
                                  {/* Trust Band */}
                                  <div className={`hidden sm:flex flex-col items-end shrink-0`}>
                                     <div className={`px-3 py-1 rounded-lg border text-[9px] font-black uppercase tracking-[0.2em] ${bandColor}`}>
                                        {dev.confidenceBand}
                                     </div>
                                  </div>
                                </div>

                                {/* Skills */}
                                <div className="flex flex-wrap gap-1.5 mt-4">
                                  {dev.skillOverlap.slice(0, 5).map(s => (
                                    <span key={s} className="px-2.5 py-1 rounded-lg text-[9px] font-bold border text-emerald-400 bg-emerald-500/10 border-emerald-500/25 shadow-sm shadow-emerald-500/5">{s}</span>
                                  ))}
                                  {dev.skills.filter(s => !dev.skillOverlap.includes(s)).slice(0, 2).map(s => (
                                    <span key={s} className="px-2.5 py-1 rounded-lg text-[9px] font-bold border text-white/30 bg-white/5 border-white/10">{s}</span>
                                  ))}
                                </div>
                              </div>
                            </div>

                            {/* Reasoning Section (Collapsible Look) */}
                            <div className="relative p-5 bg-[#080808] border border-white/5 rounded-2xl mb-5 group-hover:border-white/10 transition-colors">
                              <p className="text-[9px] text-indigo-400/60 uppercase tracking-[0.2em] font-black mb-3 flex items-center gap-2">
                                <Sparkles className="w-3 h-3" /> Expert Match Intelligence
                              </p>
                              <div className="space-y-2">
                                {dev.matchReasons.slice(0, 2).map((r, ri) => (
                                  <div key={ri} className="flex gap-3 text-xs text-white/70 font-light leading-snug">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5 opacity-80" />
                                    <span>{r}</span>
                                  </div>
                                ))}
                              </div>
                              {dev.caution && (
                                <div className="mt-3 pt-3 border-t border-white/5 flex gap-3 text-xs text-amber-300/60 font-light italic bg-amber-400/5 -mx-5 -mb-5 p-4 rounded-b-2xl">
                                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                  <span>{dev.caution}</span>
                                </div>
                              )}
                            </div>

                            {/* Details Trigger */}
                            <button 
                              onClick={() => setExpandedDevs(prev => ({ ...prev, [dev.userId]: !prev[dev.userId] }))}
                              className="w-full flex items-center justify-center gap-2 py-2 text-[9px] font-black uppercase tracking-[0.15em] text-white/20 hover:text-white/60 transition-all group/btn"
                            >
                               {isExpanded ? "Minimize Specs" : "Analyze Full DNA"}
                               <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-500 ${isExpanded ? "rotate-180" : "group-hover/btn:translate-y-0.5"}`} />
                            </button>

                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div 
                                  initial={{ height: 0, opacity: 0 }} 
                                  animate={{ height: "auto", opacity: 1 }} 
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden"
                                >
                                  <div className="pt-6 pb-2 space-y-6 border-t border-white/5 mt-4">
                                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-4">
                                           <div>
                                              <p className="text-[9px] text-white/25 uppercase tracking-widest font-black mb-2">Technical Strengths</p>
                                              <p className="text-xs text-white/60 font-light leading-relaxed">{dev.strengthsNote}</p>
                                           </div>
                                           <div className="flex items-center gap-6">
                                              {dev.payMin > 0 && (
                                                <div>
                                                   <p className="text-[9px] text-white/25 uppercase tracking-widest font-black mb-1">Fee Tier</p>
                                                   <p className="text-sm text-emerald-400 font-black">${dev.payMin}–${dev.payMax}/<span className="text-[10px] text-white/40">{dev.payCurrency}</span></p>
                                                </div>
                                              )}
                                              <div>
                                                 <p className="text-[9px] text-white/25 uppercase tracking-widest font-black mb-1">Status</p>
                                                 <p className="text-xs text-white/80 font-bold uppercase">{dev.availability}</p>
                                              </div>
                                           </div>
                                        </div>
                                        <div className="space-y-4">
                                           <div>
                                              <p className="text-[9px] text-white/25 uppercase tracking-widest font-black mb-2">Validated Stack</p>
                                              <div className="flex flex-wrap gap-1.5">
                                                {dev.skills.map(s => (
                                                  <span key={s} className={`px-2.5 py-1 rounded-lg text-[9px] font-bold border ${dev.skillOverlap.includes(s) ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/25" : "text-white/20 bg-white/5 border-white/5"}`}>{s}</span>
                                                ))}
                                              </div>
                                           </div>
                                           {dev.missingSkills.length > 0 && (
                                              <div>
                                                 <p className="text-[9px] text-amber-500/30 uppercase tracking-widest font-black mb-1">Gaps Identified</p>
                                                 <div className="flex flex-wrap gap-1.5">
                                                   {dev.missingSkills.map(s => (
                                                     <span key={s} className="px-2.5 py-1 rounded-lg text-[9px] font-bold border text-amber-500/40 bg-amber-500/5 border-amber-500/10">{s}</span>
                                                   ))}
                                                 </div>
                                              </div>
                                           )}
                                        </div>
                                     </div>

                                     {(dev.githubUrl || dev.portfolioUrl) && (
                                       <div className="flex gap-3 pt-2">
                                          {dev.githubUrl && (
                                            <a href={dev.githubUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-[9px] text-white/50 font-black uppercase tracking-widest hover:text-white hover:bg-white/10 transition-all">
                                              <GitBranch className="w-3.5 h-3.5" /> Source
                                            </a>
                                          )}
                                          {dev.portfolioUrl && (
                                            <a href={dev.portfolioUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/10 text-[9px] text-indigo-300/70 font-black uppercase tracking-widest hover:text-indigo-200 transition-all">
                                              <ArrowRight className="w-3.5 h-3.5" /> Portal
                                            </a>
                                          )}
                                       </div>
                                     )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>

                            {/* Primary Actions */}
                            <div className="flex gap-4 mt-6">
                              {isHired && sentTokens[dev.userId] && (
                                <button 
                                  onClick={() => { setActiveChatId(sentTokens[dev.userId]); setActiveTab("chat"); }}
                                  className="flex-1 h-14 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 text-indigo-400 hover:bg-indigo-500/10 transition-all font-black uppercase tracking-[0.2em] text-[10px] flex items-center justify-center gap-3"
                                >
                                  <MessageSquare className="w-5 h-5" /> Open Hub
                                </button>
                              )}
                              <button
                                disabled={isHired}
                                onClick={() => {
                                  setHireTarget(dev);
                                  setHireResult(null);
                                  setHireErrorDetail(null);
                                }}
                                className={`flex-1 h-14 rounded-2xl transition-all duration-300 font-black uppercase tracking-[0.2em] text-[10px] flex items-center justify-center gap-3 ${isHired ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 cursor-default" : "silver-gradient text-black hover:scale-[1.02] active:scale-[0.98] shadow-2xl shadow-white/5"}`}
                              >
                                {isHired ? <CheckCircle2 className="w-5 h-5" /> : <Mail className="w-5 h-5" />}
                                {isHired
                                  ? (hireRequests.find(r => r.developerUid === dev.userId)?.status === "accepted" ? "ACTIVE" : "PENDING")
                                  : "INITIATE HIRE"}
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                {/* Empty state */}
                {!matchLoading && !matchError && matchedDevs.length === 0 && (
                  <div className="text-center py-16 space-y-4">
                    <UserCheck className="w-12 h-12 text-white/10 mx-auto" />
                    <div>
                      <p className="text-white/40 text-sm font-light">No registered developers found yet.</p>
                      <p className="text-white/20 text-xs mt-1">Share <code className="text-indigo-400">/developer/register</code> to invite developers.</p>
                    </div>
                    <button onClick={runMatchingEngine} className="px-5 py-2.5 bg-white/5 border border-white/10 text-white text-xs font-bold rounded-xl hover:bg-white/10 transition-colors">
                      Check Again
                    </button>
                  </div>
                )}

                {/* Payment protection note */}
                <div className="p-5 bg-white/5 border border-white/10 rounded-2xl flex items-start gap-4">
                  <Shield className="w-5 h-5 text-white/40 shrink-0 mt-0.5" />
                  <p className="text-xs text-white/60 font-light leading-relaxed">
                    <strong className="text-white">Payment Protection:</strong> When you invite a developer, payment is held in escrow and released only when you approve a milestone. Matching scores are computed from skill overlap (40%), experience (20%), verification tier (20%), availability (10%), and portfolio signals (10%).
                  </p>
                </div>
                </>
                )}

              </motion.section>
            )}

            {/* ── PRD TAB ─────────────────────────────────────────────────── */}
            {activeTab === "prd" && (
              <motion.section key="prd" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
                <div>
                  <h2 className="text-white font-black text-xl tracking-tight flex items-center gap-2">
                    <FileText className="w-5 h-5 text-indigo-400" /> Project Requirement Document
                  </h2>
                  <p className="text-white/40 text-xs font-light mt-1">
                    {isDeveloper || isDeveloperWorkspace
                      ? "PRD for this project only — tied to your accepted hire for this workspace."
                      : "AI-generated PRD shared with your developer after hire acceptance."}
                  </p>
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
                    <p className="text-white/40 text-sm">
                      {hiringState === "accepted"
                        ? "PRD isn’t showing in this workspace yet."
                        : isDeveloper || isDeveloperWorkspace
                          ? "No PRD is linked to this project yet."
                          : "No PRD generated yet."}
                    </p>
                    <p className="text-white/20 text-xs max-w-md mx-auto leading-relaxed">
                      {hiringState === "accepted"
                        ? "The hire is active — the doc may still be generating, or the link didn’t match this project. Use the button below to regenerate, or refresh the page."
                        : isDeveloper || isDeveloperWorkspace
                          ? "The client’s PRD appears here after hire acceptance and generation completes."
                          : "A PRD is auto-generated when a developer accepts your hire invitation."}
                    </p>
                    {prdRetryMessage && (
                      <p className="text-xs text-red-400/90 max-w-md mx-auto">{prdRetryMessage}</p>
                    )}
                    {hiringState === "accepted" && acceptedHire && (
                      <div className="flex flex-col sm:flex-row gap-3 justify-center items-center pt-2">
                        <button
                          type="button"
                          disabled={prdRetrying}
                          onClick={() => void retryGeneratePrd()}
                          className="px-5 py-2.5 rounded-xl border border-indigo-500/40 bg-indigo-500/10 text-indigo-300 font-black uppercase tracking-widest text-[10px] hover:bg-indigo-500/20 disabled:opacity-40 inline-flex items-center justify-center gap-2"
                        >
                          {prdRetrying ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                              Generating…
                            </>
                          ) : (
                            "Generate or refresh PRD"
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => window.location.reload()}
                          className="px-5 py-2.5 rounded-xl border border-white/15 text-white/50 hover:text-white hover:bg-white/5 font-bold uppercase tracking-widest text-[10px]"
                        >
                          Reload page
                        </button>
                      </div>
                    )}
                    {!(isDeveloper || isDeveloperWorkspace) && hiringState !== "accepted" && (
                      <button onClick={() => setActiveTab("talent")}
                        className="px-5 py-2.5 silver-gradient text-black font-black uppercase tracking-widest text-xs rounded-xl">
                        Go to Find Developers
                      </button>
                    )}
                  </div>
                )}

                {!prdLoading && prds.map(prd => (
                  <div key={prd.id} className="glass-panel p-8 rounded-3xl border border-indigo-500/20 space-y-6">
                    <div className="flex items-start justify-between flex-wrap gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded">{prd.version}</span>
                          <span className="text-[10px] text-white/30 uppercase tracking-widest font-bold">Auto-generated by AI</span>
                        </div>
                        <h3 className="text-2xl font-black text-white tracking-tighter">{prd.projectName}</h3>
                      </div>
                    </div>

                    {prd.projectBrief?.trim() && (
                      <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-amber-400/90">
                          Your original project brief (sent to the developer)
                        </p>
                        <p className="text-sm text-white/75 font-light leading-relaxed whitespace-pre-wrap">
                          {prd.projectBrief.trim()}
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Overview</p>
                        <p className="text-sm text-white/70 font-light leading-relaxed">{prd.overview}</p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Scope</p>
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
                        <div className="flex flex-wrap gap-1.5">
                          {prd.techStack.map(t => (
                            <span key={t} className="px-2.5 py-1 rounded-lg text-[10px] font-bold border text-indigo-400 bg-indigo-500/10 border-indigo-500/20">{t}</span>
                          ))}
                        </div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mt-4 mb-2">Risks</p>
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
                  </div>
                ))}
              </motion.section>
            )}

            {/* ── CHAT TAB ─────────────────────────────────────────────────── */}
            {activeTab === "chat" && (
              <motion.section key="chat" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
                <h2 className="text-white font-black text-xl tracking-tight flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-indigo-400" /> {chatSectionTitle}
                </h2>

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
                    <p className="text-white/40 text-sm">
                      {viewerIsDeveloperRole
                        ? "Chat opens here once the client has sent a hire invitation and you have accepted it for this project."
                        : "Chat is activated after a developer accepts your hire invitation."}
                    </p>
                    {!viewerIsDeveloperRole && (
                      <button onClick={() => setActiveTab("talent")} className="px-5 py-2.5 silver-gradient text-black font-black uppercase tracking-widest text-xs rounded-xl">
                        Hire a Developer
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="bg-gradient-to-br from-[#0c0c0c] to-[#050505] rounded-3xl border border-white/5 flex flex-col overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.5)]" style={{ height: "60vh" }}>
                    {/* Chat header */}
                    <div className="p-4 border-b border-white/5 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shrink-0" />
                        <span className="text-white font-bold text-sm truncate">
                          {chatPartnerDisplayName}
                        </span>
                        <span className="text-[10px] text-white/30 ml-auto sm:ml-2 shrink-0">
                          {activeChatHire?.projectName ?? projectName}
                        </span>
                      </div>
                      {acceptedHiresForWorkspace.length > 1 && (
                        <select
                          value={activeChatId ?? ""}
                          onChange={e => setActiveChatId(e.target.value)}
                          className="w-full sm:w-auto sm:max-w-[280px] bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/50"
                          aria-label="Switch active chat thread for this project"
                        >
                          {acceptedHiresForWorkspace.map(r => (
                            <option key={r.token} value={r.token}>
                              {viewerIsDeveloperRole
                                ? `${r.projectName} · ${(r.creatorName || "").trim() || "Client"}`
                                : `${r.projectName} · ${(r.developerName || "").trim() || "Developer"}`}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Messages */}
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
                                isMine ? "bg-emerald-400 text-zinc-900" : "bg-indigo-500 text-white"
                              }`}
                              aria-hidden
                            >
                              {isMine
                                ? (currentUser?.displayName || currentUser?.email || "Y").slice(0, 1).toUpperCase()
                                : (label || msg.senderName || "?").slice(0, 1).toUpperCase()}
                            </div>
                            <div
                              className={`max-w-[min(100%,380px)] rounded-2xl px-4 py-2.5 shadow-lg ${
                                isMine
                                  ? "rounded-br-md bg-emerald-600 text-white ring-1 ring-emerald-300/35"
                                  : "rounded-bl-md bg-zinc-800 text-zinc-100 ring-1 ring-white/12"
                              }`}
                            >
                              <p
                                className={`text-[9px] font-bold uppercase tracking-widest mb-1 ${isMine ? "text-emerald-100/90" : "text-amber-400/95"}`}
                              >
                                {label}
                              </p>
                              <p className={`text-sm font-light leading-relaxed ${isMine ? "text-white" : "text-white/90"}`}>
                                {msg.text}
                              </p>
                              <p
                                className={`text-[9px] mt-1 tabular-nums ${isMine ? "text-emerald-100/65 text-right" : "text-white/40 text-left"}`}
                              >
                                {(() => {
                                  const md = parseToDate(msg.sentAt);
                                  return md ? formatChatMessageTime(md) : "";
                                })()}
                              </p>
                            </div>
                          </div>
                        ))}
                    </div>

                    {/* Input */}
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
                        className="px-4 py-3 silver-gradient text-black rounded-xl font-black disabled:opacity-40 flex items-center gap-2 transition-all"
                      >
                        {chatSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}
              </motion.section>
            )}

            {/* ── HISTORY tab ────────────────────────────────────────────── */}
            {activeTab === "history" && isCreator && (
              <motion.section key="history" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                <div>
                  <h2 className="text-white font-black text-xl tracking-tight flex items-center gap-2">
                    <FolderOpen className="w-5 h-5 text-indigo-400" /> Hiring &amp; project history
                  </h2>
                  <p className="text-white/40 text-xs font-light mt-1">
                    Every hire request is kept here. Open chat or PRD for accepted hires anytime.
                  </p>
                </div>
                {hireRequests.length === 0 ? (
                  <div className="text-center py-16 text-white/30 text-sm font-light">No hire requests yet. Invite developers from Find Developers.</div>
                ) : (
                  <div className="space-y-3">
                    {[...hireRequests]
                      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
                      .map(r => (
                        <div
                          key={r.token}
                          className="glass-panel p-5 rounded-2xl border border-white/10 flex flex-col md:flex-row md:items-center gap-4"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-white font-bold truncate">{r.projectName}</div>
                            <div className="text-xs text-white/45 mt-1">
                              Developer: <span className="text-white/70">{r.developerName}</span>
                            </div>
                            <div className="text-[10px] text-white/30 mt-1 font-mono truncate">Invite ID · {r.token.slice(0, 12)}…</div>
                          </div>
                          <span
                            className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border shrink-0 ${
                              r.status === "accepted"
                                ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                                : r.status === "pending"
                                  ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
                                  : "text-white/40 border-white/15 bg-white/5"
                            }`}
                          >
                            {r.status}
                          </span>
                          <div className="flex flex-wrap gap-2 shrink-0">
                            {r.status === "accepted" && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveChatId(r.token);
                                    setActiveTab("chat");
                                  }}
                                  className="px-4 py-2 rounded-xl bg-indigo-500/20 border border-indigo-500/35 text-indigo-200 text-[10px] font-bold uppercase tracking-widest hover:bg-indigo-500/30"
                                >
                                  Open chat
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveChatId(r.token);
                                    setActiveTab("prd");
                                  }}
                                  className="px-4 py-2 rounded-xl bg-white/5 border border-white/15 text-white/70 text-[10px] font-bold uppercase tracking-widest hover:bg-white/10"
                                >
                                  PRD
                                </button>
                              </>
                            )}
                            {r.status === "pending" && (
                              <button
                                type="button"
                                onClick={() => setActiveTab("talent")}
                                className="px-4 py-2 rounded-xl bg-white/5 border border-white/15 text-white/50 text-[10px] font-bold uppercase tracking-widest"
                              >
                                Talent
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </motion.section>
            )}

            {/* ── ARCHITECTURE & TOOLS (developer workspace) ───────────── */}
            {activeTab === "architecture" && isDeveloperWorkspace && (
              <motion.section key="architecture" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
                <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">Architecture &amp; approved tools</h2>
                <p className="text-sm text-white/50 font-light">
                  Same plan as the client&apos;s project. Open the full architecture board to review assumptions, stack, and tooling.
                </p>
                <button
                  type="button"
                  onClick={() => router.push("/architecture")}
                  className="px-5 py-3 rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-200 text-xs font-black uppercase tracking-widest hover:bg-indigo-500/30 transition-all"
                >
                  Open architecture
                </button>
                <div className="glass-panel rounded-2xl border border-white/10 p-5 space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Approved tools ({approvedCount})</p>
                  <ul className="text-sm text-white/70 space-y-1">
                    {Object.entries(approvedTools).filter(([, v]) => v).map(([k]) => (
                      <li key={k} className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />{k}</li>
                    ))}
                    {approvedCount === 0 && <li className="text-white/35 text-xs">No tools flagged yet — check with the client in chat.</li>}
                  </ul>
                </div>
              </motion.section>
            )}

            {/* ── FILES & DELIVERABLES (developer workspace) ────────────── */}
            {activeTab === "deliverables" && isDeveloperWorkspace && (
              <motion.section key="deliverables" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
                <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">Files &amp; deliverables</h2>
                <p className="text-sm text-white/50 font-light">
                  Track work in <strong className="text-white/70">Tasks &amp; Milestones</strong> — submit tasks for review; approved items count as delivered. Use <strong className="text-white/70">Chat with Client</strong> for file links and handoffs.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="glass-panel p-4 rounded-2xl border border-white/10">
                    <p className="text-[9px] text-white/40 uppercase font-bold tracking-widest mb-1">Approved tasks</p>
                    <p className="text-2xl font-black text-emerald-400">{doneTasks}</p>
                  </div>
                  <div className="glass-panel p-4 rounded-2xl border border-white/10">
                    <p className="text-[9px] text-white/40 uppercase font-bold tracking-widest mb-1">In review</p>
                    <p className="text-2xl font-black text-purple-400">{inReview}</p>
                  </div>
                  <div className="glass-panel p-4 rounded-2xl border border-white/10">
                    <p className="text-[9px] text-white/40 uppercase font-bold tracking-widest mb-1">Total tasks</p>
                    <p className="text-2xl font-black text-white">{allTasks.length}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("milestones")}
                  className="text-xs font-black uppercase tracking-widest text-indigo-300 hover:text-indigo-200 border border-indigo-500/30 px-4 py-2 rounded-xl"
                >
                  Go to milestones
                </button>
              </motion.section>
            )}

            {/* ── COMPLETION TAB ────────────────────────────────────────── */}
            {activeTab === "completion" && (
              <motion.section key="completion" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
                <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">
                  Project Completion — Dual Approval System
                </h2>
                <ProjectCompletionPanel
                  projectExecution={projExec}
                  projectId={savedProjectId ?? ""}
                  currentUid={currentUser?.uid ?? ""}
                  isCreator={isCreator}
                  isDeveloper={isDeveloper}
                  completionUnlocked={completionSectionUnlocked}
                  hasAssignedDeveloper={Boolean(project?.developerUid) || hiringState === "accepted"}
                  projectName={projectName}
                  executionLoadError={projExecSubError}
                  onEnsureExecution={ensureProjectExecutionDoc}
                  onRefresh={() => {
                    if (savedProjectId) {
                      getProjectExecution(savedProjectId).then(setProjExec);
                    }
                  }}
                  onProjectCompleted={onProjectDocCompleted}
                />
              </motion.section>
            )}

            {/* ── DEPLOY TAB ──────────────────────────────────────────────── */}
            {activeTab === "deploy" && (
              <motion.section key="deploy" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">CI/CD Pipeline — Automated Deployment</h2>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${deploying ? "bg-yellow-500 animate-pulse" : deployStage >= DEPLOY_STAGES.length ? "bg-emerald-500" : "bg-white/20"}`} />
                    <span className="text-[10px] text-[#888] font-bold uppercase tracking-widest">
                      {deploying ? "Deploying…" : deployStage >= DEPLOY_STAGES.length ? "Live" : "Idle"}
                    </span>
                  </div>
                </div>

                {/* Pipeline visualization */}
                <div className="relative overflow-hidden bg-gradient-to-br from-[#111] to-[#080808] p-6 rounded-3xl border border-white/5 space-y-4 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-[60px] pointer-events-none" />
                  <div className="relative z-10 flex items-center gap-2 mb-4">
                    <GitBranch className="w-4 h-4 text-white/40" />
                    <span className="text-xs text-white/60 font-mono">main ← feature/implementation · 12 commits ahead</span>
                  </div>

                  <div className="grid grid-cols-5 gap-2 mt-8 relative">
                    {/* Background connector line */}
                    <div className="absolute top-5 left-8 right-8 h-px bg-white/5 -z-0" />
                    <div 
                      className="absolute top-5 left-8 h-px bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-1000 -z-0" 
                      style={{ width: `${Math.max(0, (deployStage - 1) * 25)}%` }}
                    />

                    {DEPLOY_STAGES.map((stage, i) => {
                      const done = i < deployStage;
                      const active = i === deployStage - 1 && deploying;
                      return (
                        <div key={stage.label} className="flex flex-col items-center gap-3 relative z-10">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all duration-500 shadow-lg ${
                            active ? "bg-indigo-500/20 border-indigo-500 shadow-indigo-500/20 scale-110" :
                            done ? "bg-emerald-500/20 border-emerald-500 shadow-emerald-500/10" :
                            "bg-white/5 border-white/10 opacity-40"
                          }`}>
                            {done ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : 
                             active ? <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" /> : 
                             cloneElement(stage.icon as React.ReactElement<{ className?: string }>, { className: "w-5 h-5 text-white/40" })}
                          </div>
                          <div className="text-center">
                            <p className={`text-[9px] font-black uppercase tracking-tighter transition-colors ${active ? "text-indigo-400" : done ? "text-emerald-400" : "text-white/20"}`}>
                              {stage.label}
                            </p>
                            {done && <p className="text-[8px] text-white/20 font-mono mt-0.5">{stage.time}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Terminal build logs */}
                  {deploying || deployStage > 0 ? (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative font-mono text-[10px] bg-[#050505] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
                      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-white/5 bg-white/[0.02]">
                         <div className="w-1.5 h-1.5 rounded-full bg-red-500/50" />
                         <div className="w-1.5 h-1.5 rounded-full bg-yellow-500/50" />
                         <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50" />
                         <span className="ml-2 text-white/20 text-[9px] uppercase tracking-widest font-black">Build Terminal</span>
                      </div>
                      <div className="p-4 space-y-1 h-56 overflow-y-auto scrollbar-hide flex flex-col-reverse">
                         {[...deployLogs].reverse().map((log, i) => (
                           <div key={i} className={`${log.includes("Completed") || log.includes("stable") ? "text-emerald-400" : log.includes("error") ? "text-red-400" : "text-white/40"}`}>
                             <span className="text-white/10 mr-2">[{new Date().toLocaleTimeString()}]</span>
                             {log}
                           </div>
                         ))}
                         {deploying && <div className="text-white/60 animate-pulse mt-2">_ Building in progress...</div>}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-3xl py-20 text-center">
                       <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 group hover:scale-110 transition-transform cursor-pointer" onClick={startDeploy}>
                          <Play className="w-6 h-6 text-indigo-400 fill-indigo-400" />
                       </div>
                       <p className="text-white font-bold">Ready to deploy</p>
                       <p className="text-white/30 text-xs mt-1">Start project builds to Vercel instances.</p>
                    </motion.div>
                  )}

                  {DEPLOY_STAGES.map((stage, i) => {
                    const done = i < deployStage;
                    const active = i === deployStage - 1 && deploying;
                    return (
                      <div key={i} className="flex items-center gap-4">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border transition-all ${done ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : active ? "bg-yellow-500/20 border-yellow-500 text-yellow-400 animate-pulse" : "bg-white/5 border-white/10 text-white/30"}`}>
                          {done ? <CheckCircle2 className="w-4 h-4" /> : stage.icon}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className={`text-sm font-bold ${done ? "text-emerald-400" : active ? "text-yellow-400" : "text-white/40"}`}>{stage.label}</span>
                            <span className="text-[10px] text-[#888]">{done ? "✓ " : ""}{stage.time}</span>
                          </div>
                          <div className="h-0.5 mt-2 bg-white/5 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-1000 ${done ? "w-full bg-emerald-500" : active ? "w-3/4 bg-yellow-500" : "w-0"}`} />
                          </div>
                        </div>
                        {i < DEPLOY_STAGES.length - 1 && (
                          <ArrowRight className={`w-4 h-4 shrink-0 ${done ? "text-emerald-400" : "text-white/10"}`} />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Deploy button */}
                <button onClick={startDeploy} disabled={deploying || progress < 50}
                  className="w-full py-4 silver-gradient text-black font-black uppercase tracking-widest text-sm rounded-2xl flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity">
                  {deploying ? <><Loader2 className="w-5 h-5 animate-spin" /> Deploying…</> : deployStage >= DEPLOY_STAGES.length ? <><Rocket className="w-5 h-5" /> Redeploy</> : <><Play className="w-5 h-5" /> Deploy to Production</>}
                </button>
                {progress < 50 && <p className="text-center text-xs text-white/30">Complete at least 50% of tasks before deploying</p>}

                {deployStage >= DEPLOY_STAGES.length && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="p-5 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl flex items-center gap-4">
                    <Rocket className="w-6 h-6 text-emerald-400 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-emerald-400">Deployment Successful</p>
                      <p className="text-xs text-[#888] font-light">Your app is live · All checks passed · Monitoring active</p>
                    </div>
                  </motion.div>
                )}

                {/* Environment status */}
                <div className="bg-gradient-to-br from-[#111] to-[#080808] p-6 rounded-3xl border border-white/5 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50 mb-4">Environments</h3>
                  <div className="space-y-3">
                    {[
                      { env: "Production",  url: "buildcraft-eight.vercel.app", status: deployStage >= DEPLOY_STAGES.length ? "live" : "pending", branch: "main" },
                      { env: "Staging",     url: "staging.buildcraft-eight.vercel.app", status: "live", branch: "develop" },
                      { env: "Preview",     url: "pr-preview.buildcraft-eight.vercel.app", status: "building", branch: "feature/*" },
                    ].map(e => (
                      <div key={e.env} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                        <div>
                          <p className="text-white text-xs font-bold">{e.env}</p>
                          <p className="text-[10px] text-[#888] font-mono">{e.url}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-[#888] font-mono">{e.branch}</span>
                          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${e.status === "live" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : e.status === "building" ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" : "text-white/30 bg-white/5 border-white/10"}`}>
                            {e.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.section>
            )}

            {/* ── AUDIT LOG TAB ────────────────────────────────────────────── */}
            {activeTab === "audit" && (
              <motion.section key="audit" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">Action History — Immutable Audit Trail</h2>
                  <button className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[10px] font-bold uppercase tracking-widest text-[#888] hover:text-white transition-colors">
                    <Download className="w-3 h-3" /> Export SOC2 Log
                  </button>
                </div>

                {loadingAudit && (
                  <div className="flex items-center gap-3 text-sm text-white/40">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading audit entries…
                  </div>
                )}

                {!loadingAudit && auditEntries.length > 0 && (
                  <div className="space-y-4">
                    {auditEntries.map((entry, i) => {
                      const cfg = AUDIT_ICONS[entry.action] ?? { icon: <Info className="w-4 h-4" />, color: "white" };
                      const cls = COLOR_CLS[cfg.color] ?? COLOR_CLS.white;
                      const ts = (() => {
                        const ad = parseToDate(entry.timestamp);
                        return ad ? formatDateTimeSmart(ad) : "—";
                      })();
                      return (
                        <div key={entry.id ?? i} className="flex gap-4 group">
                          <div className="flex flex-col items-center">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center mt-1 shrink-0 border ${cls}`}>{cfg.icon}</div>
                            {i < auditEntries.length - 1 && <div className="flex-1 w-px bg-white/10 my-2" />}
                          </div>
                          <div className="flex-1 glass-panel p-4 rounded-xl border border-white/5">
                            <div className="flex justify-between items-start mb-1 flex-wrap gap-2">
                              <h4 className="text-white font-bold text-sm capitalize">{entry.action.replace(/\./g, " › ")}</h4>
                              <span className="text-[10px] text-[#888] flex items-center gap-1"><Clock className="w-3 h-3" /> {ts}</span>
                            </div>
                            {entry.meta && Object.keys(entry.meta).length > 0 && (
                              <p className="text-xs text-[#888] font-light">{JSON.stringify(entry.meta).replace(/[{}"]/g, "").replace(/,/g, " · ")}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {!loadingAudit && auditEntries.length === 0 && (
                  <>
                    {/* Fallback local audit entries */}
                    <div className="space-y-4">
                      {[
                        { action: "project.locked",    label: "Architecture Locked",      desc: `${version} locked. ${approvedCount} tools approved.`,             color: "green",  icon: <Lock className="w-4 h-4" /> },
                        { action: "tool.approved",     label: "Tools Approved",           desc: `${approvedCount} tools selected for ${projectName}`,              color: "green",  icon: <CheckCircle2 className="w-4 h-4" /> },
                        { action: "analysis.generated",label: "Project Analyzed",         desc: `AI analysis generated for "${projectName}"`,                      color: "indigo", icon: <Sparkles className="w-4 h-4" /> },
                        { action: "project.created",   label: "Project Created",          desc: `"${projectName}" created and added to workspace`,                 color: "blue",   icon: <GitMerge className="w-4 h-4" /> },
                      ].map((entry, i) => {
                        const cls = COLOR_CLS[entry.color] ?? COLOR_CLS.white;
                        return (
                          <div key={i} className="flex gap-4">
                            <div className="flex flex-col items-center">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center mt-1 shrink-0 border ${cls}`}>{entry.icon}</div>
                              {i < 3 && <div className="flex-1 w-px bg-white/10 my-2" />}
                            </div>
                            <div className="flex-1 glass-panel p-4 rounded-xl border border-white/5">
                              <div className="flex justify-between items-start mb-1 flex-wrap gap-2">
                                <h4 className="text-white font-bold text-sm">{entry.label}</h4>
                                <span className="text-[10px] text-[#888] flex items-center gap-1"><Clock className="w-3 h-3" /> Today</span>
                              </div>
                              <p className="text-xs text-[#888] font-light">{entry.desc}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {!currentUser && (
                      <div className="p-4 bg-white/5 border border-white/10 rounded-xl text-xs text-white/40 text-center">
                        Sign in to see your real-time Firestore audit trail
                      </div>
                    )}
                  </>
                )}

                {/* Dispute resolution */}
                <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-4">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">Dispute Resolution Flow</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { step: "1", title: "Informal Resolution",  desc: "Chat directly with developer. All messages auto-logged.",                  active: true },
                      { step: "2", title: "Platform Mediation",   desc: "Request a BuildCraft moderator to review the evidence package.",           active: false },
                      { step: "3", title: "Arbitration",          desc: "Formal binding arbitration with compiled evidence.",                       active: false },
                    ].map(s => (
                      <div key={s.step} className={`p-4 rounded-xl border text-xs ${s.active ? "bg-blue-500/5 border-blue-500/20" : "bg-white/5 border-white/5 opacity-50"}`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black mb-3 ${s.active ? "bg-blue-500 text-white" : "bg-white/10 text-white/40"}`}>{s.step}</div>
                        <h4 className="text-white font-bold mb-1">{s.title}</h4>
                        <p className="text-[#888] font-light leading-relaxed">{s.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.section>
            )}

          </AnimatePresence>
        </div>
      </main>

      {/* ── Task Review Modal ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {reviewTask && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-2xl glass-panel rounded-3xl border border-purple-500/20 overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.5)]">
              <div className="flex items-center justify-between p-5 border-b border-white/10">
                <div>
                  <h3 className="text-white font-bold">{reviewTask.title}</h3>
                  <p className="text-[10px] text-purple-400 font-bold uppercase tracking-widest">Completed by developer — pending your approval</p>
                </div>
                <button onClick={() => setReviewTask(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors text-white/60">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-4 max-h-96 overflow-y-auto">
                <div className="flex items-center gap-3">
                  {reviewTask.validationScore && (
                    <div className="flex items-center gap-2 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      <div>
                        <p className="text-emerald-400 font-bold text-sm">{reviewTask.validationScore}/100 AI Score</p>
                        <p className="text-[10px] text-[#888]">Passed automated validation</p>
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-2">Submission</p>
                  <pre className="text-xs text-white/70 font-mono bg-white/5 border border-white/10 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap">
                    {reviewTask.submission ?? "No submission content"}
                  </pre>
                </div>
              </div>
              <div className="p-5 border-t border-white/10 flex gap-3">
                <button type="button" onClick={() => {
                  const mid = milestoneIdForTask(reviewTask.id);
                  if (mid) void rejectTask(reviewTask, mid);
                }} className="flex-1 py-3 bg-red-500/10 border border-red-500/30 text-red-400 font-black uppercase tracking-widest text-xs rounded-xl hover:bg-red-500/20 transition-all flex items-center justify-center gap-2">
                  <XCircle className="w-4 h-4" /> Request changes
                </button>
                <button type="button" onClick={() => {
                  const mid = milestoneIdForTask(reviewTask.id);
                  if (mid) void approveTask(reviewTask, mid);
                }} className="flex-1 py-3 bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 font-black uppercase tracking-widest text-xs rounded-xl hover:bg-emerald-500/30 transition-all flex items-center justify-center gap-2">
                  <CheckCircle className="w-4 h-4" /> Approve
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Chat Modal ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showContact && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4">
            <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              className="w-full max-w-lg glass-panel rounded-3xl border border-white/10 overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.5)]">
              <div className="flex items-center justify-between p-5 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-tr from-blue-900 to-black rounded-full flex items-center justify-center border border-white/20">
                    <UserCheck className="w-5 h-5 text-white/60" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold">Sarah J.</h3>
                    <p className="text-[10px] text-green-500 font-bold uppercase tracking-widest">Online · All messages logged</p>
                  </div>
                </div>
                <button onClick={() => setShowContact(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors text-white/60">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-4 max-h-72 overflow-y-auto">
                {messages.map(msg => (
                  <div key={msg.id} className={`flex gap-3 ${msg.isMe ? "flex-row-reverse" : ""}`}>
                    <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0 text-[10px] font-bold text-white">{msg.from[0]}</div>
                    <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-xs font-light leading-relaxed ${msg.isMe ? "bg-white text-black rounded-tr-sm" : "glass-panel text-white/80 rounded-tl-sm border border-white/10"}`}>
                      {msg.text}
                      <div className={`text-[10px] mt-1 ${msg.isMe ? "text-black/40" : "text-white/30"}`}>{msg.time}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-white/10 flex gap-3">
                <input value={newMsg} onChange={e => setNewMsg(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()}
                  placeholder="Type a message…" className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xs placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors" />
                <button onClick={sendMessage} disabled={!newMsg.trim()} className="w-10 h-10 silver-gradient rounded-xl flex items-center justify-center shrink-0 disabled:opacity-30">
                  <Send className="w-4 h-4 text-black" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Hire Developer Modal ────────────────────────────────────────────── */}
      <AnimatePresence>
        {hireTarget && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => !hireSending && setHireTarget(null)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md glass-panel rounded-3xl border border-white/10 p-8 space-y-5"
              onClick={e => e.stopPropagation()}>

              <div className="text-center space-y-2">
                <Mail className="w-10 h-10 text-indigo-400 mx-auto" />
                <h2 className="text-2xl font-black text-white tracking-tighter">Confirm Hire Request</h2>
                <p className="text-white/40 text-sm font-light">An invitation email will be sent to this developer.</p>
              </div>

              {/* Developer summary */}
              <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-white/10 border border-white/20 flex items-center justify-center shrink-0 overflow-hidden">
                  {hireTarget.photoURL
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={hireTarget.photoURL} alt={hireTarget.fullName} className="w-full h-full object-cover" />
                    : <UserCheck className="w-6 h-6 text-white/30" />}
                </div>
                <div>
                  <p className="text-white font-bold">{hireTarget.fullName}</p>
                  <p className="text-[10px] text-white/40">Match score: <span className="text-emerald-400 font-bold">{hireTarget.matchScore}</span> · {hireTarget.confidenceBand}</p>
                </div>
              </div>

              {/* Project summary */}
              <div className="p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-xl">
                <p className="text-[9px] text-indigo-400 font-bold uppercase tracking-widest mb-1">Project</p>
                <p className="text-white font-bold text-sm">{projectName}</p>
                <p className="text-white/40 text-xs font-light mt-1 line-clamp-2">{project?.idea}</p>
              </div>

              {/* Estimated cost */}
              {hireTarget.payMin > 0 && (
                <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex items-center justify-between">
                  <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Estimated Cost</span>
                  <span className="text-emerald-400 font-black">${hireTarget.payMin}–${hireTarget.payMax}/{hireTarget.payCurrency}</span>
                </div>
              )}

              <p className="text-[10px] text-white/30 font-light text-center">
                The developer has 48 hours to respond. You will be notified by email when they accept or decline.
              </p>

              {hireResult === "sent" && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs font-bold text-center">
                  ✅ Invitation sent successfully!
                </div>
              )}
              {hireResult === "duplicate" && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-400 text-xs font-bold text-center">
                  ⚠️ An invitation was already sent to this developer.
                </div>
              )}
              {hireResult === "error" && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-bold text-center space-y-1">
                  <p>❌ Failed to send. Please try again.</p>
                  {hireErrorDetail && (
                    <p className="text-red-300/90 font-normal text-[11px] leading-snug whitespace-pre-wrap text-left">
                      {hireErrorDetail}
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setHireTarget(null)} disabled={hireSending}
                  className="flex-1 py-3 border border-white/10 text-white/60 hover:text-white font-bold uppercase tracking-widest text-xs rounded-xl transition-all">
                  Cancel
                </button>
                <button
                  onClick={() => hireTarget && sendHireRequest(hireTarget)}
                  disabled={hireSending || hireResult === "sent" || hireResult === "duplicate"}
                  className="flex-1 py-3 silver-gradient text-black font-black uppercase tracking-widest text-xs rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
                  {hireSending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><Mail className="w-4 h-4" /> Send Invitation</>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Rollback Confirm ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showRollbackConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md glass-panel rounded-3xl border border-yellow-500/20 p-8">
              <RotateCcw className="w-10 h-10 text-yellow-500 mx-auto mb-4" />
              <h2 className="text-xl font-black text-white text-center mb-2">Revert to {version}?</h2>
              <p className="text-[#888] text-sm text-center font-light mb-6 leading-relaxed">This will restore the immutable snapshot from Architecture {version}. All post-lock changes will be discarded and logged in the audit trail.</p>
              <div className="flex gap-4">
                <button onClick={() => setShowRollbackConfirm(false)} className="flex-1 py-3 border border-white/10 text-white font-bold uppercase tracking-widest text-xs rounded-xl hover:bg-white/5 transition-colors">Cancel</button>
                <button onClick={() => { setShowRollbackConfirm(false); if (currentUser) logAction(currentUser.uid, "project.updated", { action: "rollback", version }); }}
                  className="flex-1 py-3 bg-yellow-500/20 border border-yellow-500/50 text-yellow-500 font-bold uppercase tracking-widest text-xs rounded-xl hover:bg-yellow-500/30 transition-colors">
                  Confirm Rollback
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ProjectRoom() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] text-white">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-400" aria-label="Loading" />
        </div>
      }
    >
      <ProjectRoomContent />
    </Suspense>
  );
}
