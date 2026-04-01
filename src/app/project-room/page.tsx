"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, UserCheck, ShieldCheck, CheckCircle2, Lock,
  ListOrdered, History, MessageSquare, AlertCircle,
  ChevronDown, ChevronRight, RotateCcw, Download,
  Clock, Bell, Send, X, Star, Scale, Info,
  Loader2, Layers, Terminal, GitBranch, CheckCircle,
  XCircle, Rocket, Play, Zap, Activity, GitMerge,
  Package, Eye, BarChart2, Flag, ArrowRight, Sparkles,
  FileText, Mail, Home, FolderOpen,
} from "lucide-react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _unused = { Download, ChevronRight, Play, Star, Scale };
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useStore } from "@/store/useStore";
import { logAction, getUserAuditLog, type AuditEntry } from "@/lib/auditLog";
import { parseJsonResponse } from "@/lib/parse-api-json";
import { getAllDeveloperProfiles, type DeveloperProfile } from "@/lib/developerProfile";
import { type MatchedDeveloper } from "@/app/api/match-developers/route";
import { getHireRequestsByCreator, createHireRequest, type HireRequest } from "@/lib/hireRequests";
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
import { deleteDoc, doc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

// ── Types ─────────────────────────────────────────────────────────────────────
type Tab = "milestones" | "talent" | "prd" | "chat" | "audit" | "deploy" | "history";
type TaskStatus = "todo" | "in-progress" | "review" | "approved" | "rejected";

interface Task {
  id: string;
  title: string;
  description: string;
  type: "frontend" | "backend" | "database" | "auth" | "devops" | "testing";
  estimatedHours: number;
  priority: "high" | "medium" | "low";
  status: TaskStatus;
  submission?: string;
  validationScore?: number;
  assignee?: string;
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
      { id: "t1", title: "Initialize Next.js project",    description: "Set up Next.js 14 with TypeScript and Tailwind", type: "devops",    estimatedHours: 3, priority: "high",   status: "review",   submission: "Created the project with create-next-app. Added all dependencies.", validationScore: 91, assignee: "Dev" },
      { id: "t2", title: "Database schema & migrations",  description: "Design all tables with RLS policies",             type: "database",  estimatedHours: 5, priority: "high",   status: "approved", validationScore: 95, assignee: "Dev" },
      { id: "t3", title: "Authentication flow",           description: "Email+Password and Google OAuth",                 type: "auth",      estimatedHours: 6, priority: "high",   status: "in-progress", assignee: "Dev" },
    ],
  },
  {
    id: "m2", phase: "Phase 2", title: "Core Features", description: "Main application features and API routes.", estimatedDays: 14, color: "purple",
    tasks: [
      { id: "t4", title: "Build primary API routes",        description: "CRUD routes with Zod validation",              type: "backend",   estimatedHours: 8, priority: "high",   status: "todo" },
      { id: "t5", title: "Dashboard UI components",         description: "Main dashboard with stats and tables",          type: "frontend",  estimatedHours: 10, priority: "high",   status: "todo" },
      { id: "t6", title: "State management",               description: "Zustand + TanStack Query setup",                type: "frontend",  estimatedHours: 5, priority: "medium", status: "todo" },
    ],
  },
  {
    id: "m3", phase: "Phase 3", title: "UI/UX Polish", description: "Animations, responsiveness, accessibility.", estimatedDays: 7, color: "emerald",
    tasks: [
      { id: "t7", title: "Responsive design",     description: "Mobile, tablet, and desktop",          type: "frontend", estimatedHours: 6, priority: "medium", status: "todo" },
      { id: "t8", title: "Animations",            description: "Framer Motion transitions",            type: "frontend", estimatedHours: 4, priority: "low",    status: "todo" },
      { id: "t9", title: "Performance & SEO",     description: "Image opt, code split, meta tags",     type: "devops",   estimatedHours: 4, priority: "medium", status: "todo" },
    ],
  },
  {
    id: "m4", phase: "Phase 4", title: "Testing & Deployment", description: "Tests, CI/CD, and production launch.", estimatedDays: 7, color: "orange",
    tasks: [
      { id: "t10", title: "Unit & integration tests",    description: "Vitest + React Testing Library",   type: "testing", estimatedHours: 8, priority: "high",   status: "todo" },
      { id: "t11", title: "CI/CD pipeline",             description: "GitHub Actions for auto-deploy",   type: "devops",  estimatedHours: 4, priority: "medium", status: "todo" },
      { id: "t12", title: "Production deployment",      description: "Vercel + Sentry monitoring",       type: "devops",  estimatedHours: 3, priority: "high",   status: "todo" },
    ],
  },
];

function firestoreAccessHint(msg: string): string {
  if (/permission|insufficient|PERMISSION_DENIED/i.test(msg)) {
    return "Firebase blocked loading developer profiles. Deploy buildcraft/firestore.rules (or update Firestore Rules) so signed-in users can read completed developerProfiles.";
  }
  return msg;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  { id: 1, from: "Alex M.", text: "Hi! I reviewed the technical plan. The architecture looks solid — I've worked on 3 similar projects.", time: "2h ago", isMe: false },
  { id: 2, from: "You",    text: "Great! Can you start next Monday? The timeline is 4 months.", time: "1h ago", isMe: true },
  { id: 3, from: "Alex M.", text: "Monday works. I'd like to do a 30-min scoping call to confirm requirements.", time: "45m ago", isMe: false },
];

// ── Component ──────────────────────────────────────────────────────────────────
const VALID_TABS: Tab[] = ["milestones", "talent", "prd", "chat", "history", "audit", "deploy"];

function ProjectRoomContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const chatQueryParam = searchParams.get("chat");
  const { project, approvedTools, currentUser, savedProjectId } = useStore();
  const [activeTab, setActiveTab] = useState<Tab>("milestones");
  const [milestones, setMilestones] = useState<Milestone[]>(FALLBACK_MILESTONES);
  const [loadingMilestones, setLoadingMilestones] = useState(false);
  const [expandedMilestone, setExpandedMilestone] = useState<string | null>("m1");
  const [reviewTask, setReviewTask] = useState<Task | null>(null);
  const [gate3Hired, setGate3Hired] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [selectedDev, setSelectedDev] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [newMsg, setNewMsg] = useState("");
  const [showRollbackConfirm, setShowRollbackConfirm] = useState(false);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [deployStage, setDeployStage] = useState(0);
  const [deploying, setDeploying] = useState(false);

  // ── Developer Matching Engine state ────────────────────────────────────────
  const [matchedDevs, setMatchedDevs]       = useState<MatchedDeveloper[]>([]);
  const [matchLoading, setMatchLoading]     = useState(false);
  const [matchError, setMatchError]         = useState(false);
  const [matchDetail, setMatchDetail]       = useState<string | null>(null);
  const [hiredDevIds, setHiredDevIds]       = useState<Set<string>>(new Set());
  const [expandedDev, setExpandedDev]       = useState<string | null>(null);
  const [chatDevId, setChatDevId]           = useState<string | null>(null);

  // ── Hire modal state ───────────────────────────────────────────────────────
  const [hireTarget,    setHireTarget]   = useState<MatchedDeveloper | null>(null);
  const [hireSending,   setHireSending]  = useState(false);
  const [hireResult,    setHireResult]   = useState<"sent" | "error" | "duplicate" | null>(null);
  const [hireErrorDetail, setHireErrorDetail] = useState<string | null>(null);
  const [sentTokens,    setSentTokens]   = useState<Record<string, string>>({}); // userId → token

  // ── PRD state ─────────────────────────────────────────────────────────────
  const [prds,      setPrds]     = useState<PRDDocument[]>([]);
  const [prdLoading, setPrdLoading] = useState(false);

  // ── Hire requests state ────────────────────────────────────────────────────
  const [hireRequests, setHireRequests] = useState<HireRequest[]>([]);

  // ── Real-time chat state ───────────────────────────────────────────────────
  const [activeChatId,   setActiveChatId]   = useState<string | null>(null);
  const [fireMsgs,       setFireMsgs]       = useState<FireChatMsg[]>([]);
  const [chatRoom,       setChatRoom]       = useState<ChatRoom | null>(null);
  const [chatText,       setChatText]       = useState("");
  const [chatSending,    setChatSending]    = useState(false);
  const [chatSubError,   setChatSubError]   = useState<string | null>(null);

  // Deep-link from Discovery / Architecture / hire emails (e.g. ?tab=chat&chat=…)
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && VALID_TABS.includes(t as Tab)) setActiveTab(t as Tab);
  }, [searchParams]);

  // ── All hire requests (history + chat threads) — load when signed in ────────
  useEffect(() => {
    if (!currentUser?.uid) return;
    getHireRequestsByCreator(currentUser.uid)
      .then(reqs => {
        setHireRequests(reqs);
        const tokens: Record<string, string> = {};
        reqs.forEach(r => {
          tokens[r.developerUid] = r.token;
        });
        setSentTokens(tokens);
        const hired = new Set(reqs.filter(r => r.status === "accepted").map(r => r.developerUid));
        if (hired.size) setHiredDevIds(hired);
      })
      .catch(() => {});
  }, [currentUser?.uid]);

  const approvedCount = Object.values(approvedTools).filter(Boolean).length;
  const projectName  = project?.name ?? "My Project";
  const version      = project?.version ?? "v1.0";
  const chatViewerUid = useFirebaseUid(currentUser?.uid);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const allTasks   = milestones.flatMap(m => m.tasks);
  const doneTasks  = allTasks.filter(t => t.status === "approved").length;
  const inReview   = allTasks.filter(t => t.status === "review").length;
  const progress   = allTasks.length ? Math.round((doneTasks / allTasks.length) * 100) : 0;

  // ── Generate milestones from AI ────────────────────────────────────────────
  useEffect(() => {
    if (!project) return;
    setLoadingMilestones(true);
    fetch("/api/generate-milestones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectName: project.name, projectIdea: project.idea }),
    })
      .then((r) => parseJsonResponse(r))
      .then(({ ok, data }) => {
        const raw = data.milestones;
        if (!ok || !Array.isArray(raw) || !raw.length) return;
        // Preserve some review state from fallback for demo
        const withState = raw.map((m: Milestone, mi: number) => ({
          ...m,
          tasks: m.tasks.map((t: Task, ti: number) => {
            const fb = FALLBACK_MILESTONES[mi]?.tasks[ti];
            return { ...t, status: fb?.status ?? "todo", submission: fb?.submission, validationScore: fb?.validationScore, assignee: fb?.assignee };
          }),
        }));
        setMilestones(withState);
      })
      .catch(() => {})
      .finally(() => setLoadingMilestones(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load developer matches when talent tab opens ──────────────────────────
  useEffect(() => {
    if (activeTab !== "talent") return;
    if (matchedDevs.length > 0) return;
    runMatchingEngine();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ── Load PRDs when prd tab opens ──────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== "prd" || !currentUser) return;
    setPrdLoading(true);
    getPRDsByUser(currentUser.uid).then(docs => setPrds(docs)).catch(() => {}).finally(() => setPrdLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

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
    getHireRequestsByCreator(currentUser.uid)
      .then(reqs => {
        if (cancelled) return;
        setHireRequests(reqs);
        const accepted = reqs.filter(r => r.status === "accepted");
        if (!accepted.length) {
          setActiveChatId(null);
          return;
        }
        let stored: string | null = null;
        try {
          stored = sessionStorage.getItem(chatStorageKey("creator", currentUser.uid));
        } catch {
          /* private mode */
        }
        const fromUrl = chatQueryParam && accepted.some(r => r.token === chatQueryParam) ? chatQueryParam : null;
        const fromStore = stored && accepted.some(r => r.token === stored) ? stored : null;
        const sorted = [...accepted].sort(
          (a, b) => (b.respondedAt?.toMillis?.() ?? 0) - (a.respondedAt?.toMillis?.() ?? 0),
        );
        const fallback = sorted[0]?.token ?? null;
        const next = fromUrl || fromStore || fallback;
        setActiveChatId(prev => (prev && accepted.some(r => r.token === prev) ? prev : next));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeTab, currentUser?.uid, chatQueryParam]);

  // ── Ensure Firestore chat room exists (signed-in creator can create per rules) ─
  useEffect(() => {
    if (activeTab !== "chat" || !currentUser?.uid || !activeChatId) return;
    const req = hireRequests.find(r => r.token === activeChatId && r.status === "accepted");
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
  }, [activeTab, currentUser?.uid, activeChatId, hireRequests]);

  // ── Persist active thread in URL + sessionStorage (reopen later) ───────────
  useEffect(() => {
    if (!currentUser?.uid || !activeChatId || activeTab !== "chat") return;
    try {
      sessionStorage.setItem(chatStorageKey("creator", currentUser.uid), activeChatId);
    } catch {
      /* */
    }
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("chat") === activeChatId && params.get("tab") === "chat") return;
    params.set("tab", "chat");
    params.set("chat", activeChatId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [activeChatId, activeTab, currentUser?.uid, pathname, router, searchParams]);

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
      // 1. Fetch real developer profiles from Firestore
      const { profiles, queryError } = await getAllDeveloperProfiles(30);
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
        if (currentUser) logAction(currentUser.uid, "analysis.generated", { type: "developer-matching", count: devs.length });
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
                : "Could not rank developers. Check /api/match-developers and your AI API key."),
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
      const duplicate = existing.find(
        r =>
          r.developerUid === dev.userId &&
          r.projectName === projectName &&
          r.status === "pending",
      );
      if (duplicate) {
        setSentTokens(prev => ({ ...prev, [dev.userId]: duplicate.token }));
        setHiredDevIds(prev => {
          const n = new Set(prev);
          n.add(dev.userId);
          return n;
        });
        setHireResult("duplicate");
        setGate3Hired(true);
        logAction(currentUser.uid, "project.updated", {
          action: "hire-invite-duplicate",
          dev: dev.fullName,
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
        setSentTokens(prev => ({ ...prev, [dev.userId]: token }));
        setHiredDevIds(prev => {
          const n = new Set(prev);
          n.add(dev.userId);
          return n;
        });
        setHireResult("sent");
        setGate3Hired(true);
        logAction(currentUser.uid, "project.updated", {
          action: "hire-invite-sent",
          dev: dev.fullName,
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

  // ── Load real Firestore audit log ──────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== "audit" || !currentUser) return;
    setLoadingAudit(true);
    getUserAuditLog(currentUser.uid, 30)
      .then(entries => setAuditEntries(entries))
      .catch(() => {})
      .finally(() => setLoadingAudit(false));
  }, [activeTab, currentUser]);

  // ── Task actions ────────────────────────────────────────────────────────────
  function approveTask(task: Task) {
    setMilestones(prev => prev.map(m => ({
      ...m,
      tasks: m.tasks.map(t => t.id !== task.id ? t : { ...t, status: "approved" }),
    })));
    setReviewTask(null);
    if (currentUser) logAction(currentUser.uid, "tool.approved", { task: task.title, projectId: savedProjectId });
  }

  function rejectTask(task: Task) {
    setMilestones(prev => prev.map(m => ({
      ...m,
      tasks: m.tasks.map(t => t.id !== task.id ? t : { ...t, status: "rejected" }),
    })));
    setReviewTask(null);
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
    DEPLOY_STAGES.forEach((_, i) => {
      setTimeout(() => {
        setDeployStage(i + 1);
        if (i === DEPLOY_STAGES.length - 1) {
          setDeploying(false);
          if (currentUser) logAction(currentUser.uid, "project.updated", { action: "deployed", version });
        }
      }, (i + 1) * 2000);
    });
  }

  // ── Milestone completion check ─────────────────────────────────────────────
  function milestoneProgress(m: Milestone) {
    const done = m.tasks.filter(t => t.status === "approved").length;
    return { done, total: m.tasks.length, pct: Math.round((done / m.tasks.length) * 100) };
  }

  const AUDIT_ICONS: Record<string, { icon: React.ReactNode; color: string }> = {
    "analysis.generated":       { icon: <Sparkles className="w-4 h-4" />,    color: "indigo" },
    "project.created":          { icon: <GitMerge className="w-4 h-4" />,    color: "blue"   },
    "project.locked":           { icon: <Lock className="w-4 h-4" />,         color: "green"  },
    "project.updated":          { icon: <CheckCircle2 className="w-4 h-4" />, color: "green"  },
    "tool.approved":            { icon: <CheckCircle2 className="w-4 h-4" />, color: "green"  },
    "tool.rejected":            { icon: <XCircle className="w-4 h-4" />,      color: "red"    },
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

  return (
    <div className="min-h-screen relative flex">
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
            <span>{inReview} in review</span>
            <span>{allTasks.length - doneTasks - inReview} todo</span>
          </div>
        </div>

        <nav className="flex-grow space-y-1.5">
          <Link href="/" className="flex items-center gap-3 w-full p-3 text-[#666] hover:text-white hover:bg-white/5 rounded-lg transition-all text-sm font-medium">
            <Home className="w-4 h-4" /> Home
          </Link>
          {([
            { id: "milestones", label: "Project Steps",   icon: <ListOrdered className="w-5 h-5" />,  badge: inReview > 0 ? `${inReview} review` : null },
            { id: "talent",     label: "Find Developers", icon: <UserCheck className="w-5 h-5" />,    badge: gate3Hired ? null : "!" },
            { id: "prd",        label: "PRD Document",    icon: <FileText className="w-5 h-5" />,     badge: prds.length > 0 ? "New" : null },
            { id: "chat",       label: "Chat with Dev",   icon: <MessageSquare className="w-5 h-5" />, badge: activeChatId ? "Live" : null },
            { id: "history",    label: "Hiring History",  icon: <FolderOpen className="w-5 h-5" />,   badge: hireRequests.length > 0 ? String(hireRequests.length) : null },
            { id: "deploy",     label: "CI/CD Deploy",    icon: <Rocket className="w-5 h-5" />,       badge: progress === 100 ? "Ready" : null },
            { id: "audit",      label: "Audit Log",       icon: <History className="w-5 h-5" /> },
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
      </aside>

      {/* ── Main Content ────────────────────────────────────────────────────── */}
      <main className="flex-grow p-10 overflow-y-auto">
        <div className="max-w-4xl space-y-10">

          <header className="border-b border-white/10 pb-8 flex justify-between items-end flex-wrap gap-4">
            <div className="space-y-2">
              <h1 className="text-5xl font-black tracking-tighter text-white">Project Workspace</h1>
              <p className="text-[#888] text-lg font-light tracking-wide">Manage milestones, review submissions, and ship to production.</p>
            </div>
            <div className="flex gap-2 text-xs font-bold uppercase tracking-widest">
              <span className="px-3 py-1.5 rounded-md border border-white/10 bg-black text-[#888]">Employer</span>
              <span className="px-3 py-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 text-emerald-500">Plan Locked</span>
            </div>
          </header>

          {loadingMilestones && (
            <div className="flex items-center gap-3 p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl">
              <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
              <p className="text-sm text-white/70 font-light">AI is generating project milestones for <strong>{projectName}</strong>…</p>
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
                        className={`p-4 rounded-2xl border text-left transition-all hover:border-white/20 ${expandedMilestone === m.id ? `glass-panel ${mc.ring}` : "bg-white/5 border-white/10"}`}>
                        <div className={`text-[9px] font-black uppercase tracking-widest mb-1 ${mc.badge.split(" ")[0]}`}>{m.phase}</div>
                        <div className="text-white text-xs font-bold mb-2 line-clamp-2">{m.title}</div>
                        <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${mc.dot}`} style={{ width: `${mp.pct}%` }} />
                        </div>
                        <div className="text-[9px] text-[#888] mt-1">{mp.done}/{mp.total} done</div>
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
                          "todo":        { label: "To Do",       color: "text-white/40",    bg: "bg-white/5 border-white/10" },
                          "in-progress": { label: "In Progress", color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/30" },
                          "review":      { label: "In Review",   color: "text-purple-400",  bg: "bg-purple-500/10 border-purple-500/30" },
                          "approved":    { label: "Approved",    color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" },
                          "rejected":    { label: "Rejected",    color: "text-red-400",     bg: "bg-red-500/10 border-red-500/30" },
                        };
                        const s = sc[task.status];
                        return (
                          <div key={task.id}
                            className={`p-5 rounded-2xl border transition-all ${task.status === "review" ? "glass-panel border-purple-500/30 cursor-pointer hover:border-purple-500/50" : "glass-panel border-white/10 hover:border-white/20"}`}
                            onClick={() => task.status === "review" && setReviewTask(task)}>
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
                                {task.status === "review" && (
                                  <div className="flex flex-col gap-2">
                                    <button onClick={e => { e.stopPropagation(); approveTask(task); }}
                                      className="px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 font-black text-[10px] uppercase tracking-widest rounded-lg hover:bg-emerald-500/30 transition-all flex items-center gap-1">
                                      <CheckCircle className="w-3 h-3" /> Approve
                                    </button>
                                    <button onClick={e => { e.stopPropagation(); rejectTask(task); }}
                                      className="px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 font-black text-[10px] uppercase tracking-widest rounded-lg hover:bg-red-500/20 transition-all flex items-center gap-1">
                                      <XCircle className="w-3 h-3" /> Reject
                                    </button>
                                  </div>
                                )}
                                {task.status === "approved" && <CheckCircle2 className="w-6 h-6 text-emerald-400" />}
                              </div>
                            </div>

                            {task.submission && task.status === "review" && (
                              <div className="mt-3 pt-3 border-t border-white/5">
                                <p className="text-[10px] text-purple-400 font-bold uppercase tracking-widest mb-1">Submitted Work</p>
                                <p className="text-xs text-white/50 font-mono line-clamp-2">{task.submission}</p>
                                <p className="text-[10px] text-white/30 mt-1">Click to open full review</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Approval dashboard summary */}
                <div className="glass-panel p-6 rounded-2xl border border-white/10">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50 mb-4 flex items-center gap-2">
                    <BarChart2 className="w-3 h-3" /> Project Status Summary
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: "Approved", count: doneTasks, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
                      { label: "In Review", count: inReview, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
                      { label: "Remaining", count: allTasks.length - doneTasks - inReview, color: "text-white/40", bg: "bg-white/5 border-white/10" },
                    ].map(s => (
                      <div key={s.label} className={`p-4 rounded-xl border text-center ${s.bg}`}>
                        <div className={`text-2xl font-black ${s.color}`}>{s.count}</div>
                        <div className="text-[10px] text-[#888] uppercase tracking-widest mt-1">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.section>
            )}

            {/* ── TALENT TAB — AI Developer Matching Engine ─────────────── */}
            {activeTab === "talent" && (
              <motion.section key="talent" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">

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
                      <div key={i} className="glass-panel p-6 rounded-2xl border border-white/10 animate-pulse">
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
                    {matchedDevs.map((dev, idx) => {
                      const isHired    = hiredDevIds.has(dev.userId);
                      const isExpanded = expandedDev === dev.userId;
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
                        <motion.div key={dev.userId}
                          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.07 }}
                          className={`glass-panel rounded-2xl border transition-all overflow-hidden ${isHired ? "border-emerald-500/40 bg-emerald-500/5" : "border-white/10 hover:border-white/20"}`}>

                          {/* Rank ribbon */}
                          <div className={`flex items-center gap-2 px-6 py-2 border-b border-white/5 text-[9px] font-black uppercase tracking-widest ${idx === 0 ? "bg-indigo-500/10 text-indigo-400" : "bg-white/5 text-white/30"}`}>
                            {idx === 0 ? <><Star className="w-3 h-3 fill-indigo-400" /> Top Match</> : `#${dev.rank} Ranked Match`}
                          </div>

                          <div className="p-6">
                            {/* Developer header */}
                            <div className="flex items-start gap-5 mb-5">
                              {/* Avatar */}
                              <div className="w-16 h-16 rounded-full border-2 border-white/20 overflow-hidden bg-white/5 flex items-center justify-center shrink-0">
                                {dev.photoURL ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={dev.photoURL} alt={dev.fullName} className="w-full h-full object-cover" />
                                ) : (
                                  <UserCheck className="w-7 h-7 text-white/30" />
                                )}
                              </div>

                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                  <div>
                                    <h3 className="text-white text-lg font-black tracking-tight">
                                      {dev.fullName || "Anonymous Developer"}
                                    </h3>
                                    <p className="text-white/40 text-xs mt-0.5">
                                      {dev.primaryRole?.replace("fullstack","Full Stack").replace("frontend","Frontend").replace("backend","Backend").replace("ai","AI/ML").replace("devops","DevOps")} Developer
                                      {" · "}{dev.yearsExp}yr{dev.yearsExp !== 1 ? "s" : ""} exp
                                      {" · "}<span className="capitalize">{dev.availability}</span>
                                    </p>
                                    <p className={`text-[10px] font-bold mt-1 flex items-center gap-1 ${tierColor}`}>
                                      <ShieldCheck className="w-3 h-3" /> {tierLabel}
                                    </p>
                                  </div>
                                  {/* Score badge */}
                                  <div className={`shrink-0 flex flex-col items-center gap-0.5 px-4 py-2.5 rounded-xl border ${bandColor}`}>
                                    <span className="text-2xl font-black leading-none">{dev.matchScore}</span>
                                    <span className="text-[8px] font-bold uppercase tracking-widest opacity-70">{dev.confidenceBand}</span>
                                  </div>
                                </div>

                                {/* Skill overlap chips */}
                                <div className="flex flex-wrap gap-1.5 mt-3">
                                  {dev.skillOverlap.slice(0, 6).map(s => (
                                    <span key={s} className="px-2 py-0.5 rounded-md text-[9px] font-bold border text-emerald-400 bg-emerald-500/10 border-emerald-500/20">{s}</span>
                                  ))}
                                  {dev.skills.filter(s => !dev.skillOverlap.includes(s)).slice(0, 3).map(s => (
                                    <span key={s} className="px-2 py-0.5 rounded-md text-[9px] font-bold border text-white/30 bg-white/5 border-white/10">{s}</span>
                                  ))}
                                </div>
                              </div>
                            </div>

                            {/* Match reasoning */}
                            <div className="p-4 bg-white/5 border border-white/5 rounded-xl mb-4 space-y-1.5">
                              <p className="text-[9px] text-white/30 uppercase tracking-widest font-bold mb-2 flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-indigo-400" /> AI Match Analysis
                              </p>
                              {dev.matchReasons.map((r, i) => (
                                <p key={i} className="text-xs text-white/60 font-light flex items-start gap-2">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" /> {r}
                                </p>
                              ))}
                              {dev.caution && (
                                <p className="text-xs text-yellow-400/70 font-light flex items-start gap-2 pt-1.5 mt-1 border-t border-white/5">
                                  <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" /> {dev.caution}
                                </p>
                              )}
                            </div>

                            {/* Expandable details */}
                            <button onClick={() => setExpandedDev(isExpanded ? null : dev.userId)}
                              className="w-full flex items-center justify-between text-[10px] text-white/40 hover:text-white font-bold uppercase tracking-widest transition-colors mb-3">
                              <span>{isExpanded ? "Hide Details" : "View Full Profile"}</span>
                              <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                            </button>

                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden border-t border-white/5 pt-4 space-y-4">
                                  {/* Strengths */}
                                  <div>
                                    <p className="text-[9px] text-white/30 uppercase tracking-widest font-bold mb-2">Strengths</p>
                                    <p className="text-xs text-white/60 font-light">{dev.strengthsNote}</p>
                                  </div>
                                  {/* All skills */}
                                  <div>
                                    <p className="text-[9px] text-white/30 uppercase tracking-widest font-bold mb-2">All Skills</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {dev.skills.map(s => (
                                        <span key={s} className={`px-2 py-0.5 rounded-md text-[9px] font-bold border ${dev.skillOverlap.includes(s) ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-white/30 bg-white/5 border-white/10"}`}>{s}</span>
                                      ))}
                                    </div>
                                  </div>
                                  {/* Pay + availability */}
                                  {dev.payMin > 0 && (
                                    <div className="flex items-center gap-4 text-xs">
                                      <span className="text-white/40">Rate:</span>
                                      <span className="text-emerald-400 font-bold">${dev.payMin}–${dev.payMax}/{dev.payCurrency}</span>
                                    </div>
                                  )}
                                  {/* Links */}
                                  {(dev.githubUrl || dev.portfolioUrl) && (
                                    <div className="flex gap-3">
                                      {dev.githubUrl && (
                                        <a href={dev.githubUrl} target="_blank" rel="noopener noreferrer"
                                          className="flex items-center gap-1.5 text-[10px] text-indigo-400 hover:text-indigo-300 font-bold border border-indigo-500/20 px-3 py-1.5 rounded-lg transition-colors">
                                          <GitBranch className="w-3 h-3" /> GitHub
                                        </a>
                                      )}
                                      {dev.portfolioUrl && (
                                        <a href={dev.portfolioUrl} target="_blank" rel="noopener noreferrer"
                                          className="flex items-center gap-1.5 text-[10px] text-indigo-400 hover:text-indigo-300 font-bold border border-indigo-500/20 px-3 py-1.5 rounded-lg transition-colors">
                                          <ArrowRight className="w-3 h-3" /> Portfolio
                                        </a>
                                      )}
                                    </div>
                                  )}
                                  {/* Missing skills */}
                                  {dev.missingSkills.length > 0 && (
                                    <div>
                                      <p className="text-[9px] text-yellow-400/60 uppercase tracking-widest font-bold mb-1">Skills Gap</p>
                                      <div className="flex flex-wrap gap-1.5">
                                        {dev.missingSkills.map(s => (
                                          <span key={s} className="px-2 py-0.5 rounded-md text-[9px] font-bold border text-yellow-400/60 bg-yellow-500/5 border-yellow-500/20">{s}</span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </motion.div>
                              )}
                            </AnimatePresence>

                            {/* Actions */}
                            <div className="flex gap-3 pt-4 border-t border-white/5">
                              {isHired && sentTokens[dev.userId] && (
                                <button onClick={() => { setActiveChatId(sentTokens[dev.userId]); setActiveTab("chat"); }}
                                  className="flex-1 py-3 border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 font-bold uppercase tracking-widest text-[10px] rounded-xl transition-all flex items-center justify-center gap-2">
                                  <MessageSquare className="w-4 h-4" /> Open Chat
                                </button>
                              )}
                              <button
                                disabled={isHired}
                                onClick={() => {
                                  setHireTarget(dev);
                                  setHireResult(null);
                                  setHireErrorDetail(null);
                                }}
                                className={`flex-1 py-3 font-black uppercase tracking-widest text-[10px] rounded-xl transition-all flex items-center justify-center gap-2 ${isHired ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 cursor-default" : "silver-gradient text-black hover:opacity-90"}`}>
                                <Mail className="w-4 h-4" />
                                {isHired
                                  ? (hireRequests.find(r => r.developerUid === dev.userId)?.status === "accepted" ? "Hired ✓" : "Invite Sent ✓")
                                  : "Hire Developer"}
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

              </motion.section>
            )}

            {/* ── PRD TAB ─────────────────────────────────────────────────── */}
            {activeTab === "prd" && (
              <motion.section key="prd" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
                <div>
                  <h2 className="text-white font-black text-xl tracking-tight flex items-center gap-2">
                    <FileText className="w-5 h-5 text-indigo-400" /> Project Requirement Document
                  </h2>
                  <p className="text-white/40 text-xs font-light mt-1">AI-generated PRD shared with your developer after hire acceptance.</p>
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
                    <p className="text-white/40 text-sm">No PRD generated yet.</p>
                    <p className="text-white/20 text-xs">A PRD is auto-generated when a developer accepts your hire invitation.</p>
                    <button onClick={() => setActiveTab("talent")}
                      className="px-5 py-2.5 silver-gradient text-black font-black uppercase tracking-widest text-xs rounded-xl">
                      Go to Find Developers
                    </button>
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
                  <MessageSquare className="w-5 h-5 text-indigo-400" /> Chat with Developer
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
                    <p className="text-white/40 text-sm">Chat is activated after a developer accepts your hire invitation.</p>
                    <button onClick={() => setActiveTab("talent")} className="px-5 py-2.5 silver-gradient text-black font-black uppercase tracking-widest text-xs rounded-xl">
                      Hire a Developer
                    </button>
                  </div>
                ) : (
                  <div className="glass-panel rounded-3xl border border-white/10 flex flex-col overflow-hidden" style={{ height: "60vh" }}>
                    {/* Chat header */}
                    <div className="p-4 border-b border-white/5 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shrink-0" />
                        <span className="text-white font-bold text-sm truncate">
                          {hireRequests.find(r => r.token === activeChatId)?.developerName ?? "Developer"}
                        </span>
                        <span className="text-[10px] text-white/30 ml-auto sm:ml-2 shrink-0">
                          {hireRequests.find(r => r.token === activeChatId)?.projectName ?? projectName}
                        </span>
                      </div>
                      {hireRequests.filter(r => r.status === "accepted").length > 1 && (
                        <select
                          value={activeChatId}
                          onChange={e => setActiveChatId(e.target.value)}
                          className="w-full sm:w-auto sm:max-w-[240px] bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/50"
                        >
                          {hireRequests
                            .filter(r => r.status === "accepted")
                            .map(r => (
                              <option key={r.token} value={r.token}>
                                {r.projectName} · {r.developerName}
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

            {/* ── HIRING HISTORY (all invites / hires — stored in Firestore) ─ */}
            {activeTab === "history" && (
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
                <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <GitBranch className="w-4 h-4 text-white/40" />
                    <span className="text-xs text-white/60 font-mono">main ← feature/implementation · 12 commits ahead</span>
                  </div>

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
                <div className="glass-panel p-5 rounded-2xl border border-white/10">
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
                      const ts = entry.timestamp ? new Date((entry.timestamp as { seconds: number }).seconds * 1000).toLocaleString() : "—";
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
                  <p className="text-[10px] text-purple-400 font-bold uppercase tracking-widest">Developer Submission — Pending Your Review</p>
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
                <button onClick={() => rejectTask(reviewTask)} className="flex-1 py-3 bg-red-500/10 border border-red-500/30 text-red-400 font-black uppercase tracking-widest text-xs rounded-xl hover:bg-red-500/20 transition-all flex items-center justify-center gap-2">
                  <XCircle className="w-4 h-4" /> Request Changes
                </button>
                <button onClick={() => approveTask(reviewTask)} className="flex-1 py-3 bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 font-black uppercase tracking-widest text-xs rounded-xl hover:bg-emerald-500/30 transition-all flex items-center justify-center gap-2">
                  <CheckCircle className="w-4 h-4" /> Approve & Merge
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
                    <h3 className="text-white font-bold">{selectedDev === "alex" ? "Alex M." : "Sarah J."}</h3>
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
