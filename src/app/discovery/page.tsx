"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Layers, Activity, Check, AlertTriangle,
  ArrowRight, ShieldCheck, Zap, Target, AlertCircle,
  Home, Users, History, Trash2, FolderOpen, Lock, Clock, ChevronDown,
  RefreshCw, LogIn, UserCheck, CheckCircle2, Loader2, UserRound, Phone, Globe, Briefcase, Building2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStore, analyzeIdea, type ProjectState } from "@/store/useStore";
import type { Requirement } from "@/store/useStore";
import { saveProject, getUserProjects, deleteProject, getUserProfile, updateUserProfile, type SavedProject } from "@/lib/firestore";
import { logAction } from "@/lib/auditLog";
import { getAllDeveloperProfiles, type DeveloperProfile } from "@/lib/developerProfile";
import { type MatchedDeveloper } from "@/app/api/match-developers/route";
import Logo from "@/components/Logo";
import { parseJsonResponse } from "@/lib/parse-api-json";

const typeConfig: Record<Requirement["type"], { label: string; color: string; bg: string }> = {
  feature:     { label: "Feature",     color: "text-blue-400",    bg: "border-blue-500/20 bg-blue-500/5"    },
  security:    { label: "Security",    color: "text-red-400",     bg: "border-red-500/20 bg-red-500/5"      },
  performance: { label: "Performance", color: "text-yellow-400",  bg: "border-yellow-500/20 bg-yellow-500/5" },
  compliance:  { label: "Compliance",  color: "text-emerald-400", bg: "border-emerald-500/20 bg-emerald-500/5" },
};

const ANALYZE_MESSAGES = [
  "Reading your idea...",
  "Extracting requirements...",
  "Detecting compliance needs...",
  "Generating assumptions...",
  "Calculating confidence score...",
  "Finalising technical plan...",
];

function firestoreAccessHint(msg: string): string {
  if (/permission|insufficient|PERMISSION_DENIED/i.test(msg)) {
    return "Firebase blocked loading developer profiles. Deploy the rules in buildcraft/firestore.rules (Firestore → Rules) so signed-in users can read completed developerProfiles — not only their own document.";
  }
  return msg;
}

export default function DiscoveryHub() {
  const router = useRouter();
  const {
    project, setProject, toggleAssumption, currentUser, setSavedProjectId, approvedTools, setToolApproval,
    employerProfile, setEmployerProfile,
  } = useStore();

  const [profileOpen, setProfileOpen] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileDraft, setProfileDraft] = useState({
    fullName: "",
    companyName: "",
    jobTitle: "",
    phone: "",
    website: "",
  });

  const [idea, setIdea]               = useState(project?.idea ?? "");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeMsg, setAnalyzeMsg]   = useState(ANALYZE_MESSAGES[0]);
  const [error, setError]             = useState<string | null>(null);

  // ── Project History state ──────────────────────────────────────────────────
  const [history,        setHistory]        = useState<SavedProject[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyOpen,    setHistoryOpen]    = useState(true);
  const [deletingId,     setDeletingId]     = useState<string | null>(null);

  // ── Hire a developer — AI matching (same engine as Project Workspace) ─────
  const [matchedDevs,   setMatchedDevs]   = useState<MatchedDeveloper[]>([]);
  const [matchLoading,  setMatchLoading]  = useState(false);
  const [matchError,    setMatchError]    = useState(false);
  const [matchDetail,   setMatchDetail]   = useState<string | null>(null);
  const [expandedDevId, setExpandedDevId] = useState<string | null>(null);

  // Reload history whenever the logged-in user changes
  useEffect(() => {
    if (!currentUser) { setHistory([]); return; }
    setHistoryLoading(true);
    getUserProjects(currentUser.uid)
      .then(projects => setHistory(projects))
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [currentUser]);

  // Load employer profile from Firestore into store + local draft (when user changes)
  useEffect(() => {
    const uid = currentUser?.uid;
    if (!uid) return;

    if (uid === "demo-guest") {
      const ep = useStore.getState().employerProfile;
      setProfileDraft({
        fullName: ep.fullName,
        companyName: ep.companyName,
        jobTitle: ep.jobTitle,
        phone: ep.phone,
        website: ep.website,
      });
      return;
    }

    getUserProfile(uid).then((data) => {
      const ep = data?.employerProfile;
      if (ep && typeof ep === "object" && "fullName" in ep) {
        const next = {
          fullName: String((ep as { fullName?: string }).fullName ?? ""),
          companyName: String((ep as { companyName?: string }).companyName ?? ""),
          jobTitle: String((ep as { jobTitle?: string }).jobTitle ?? ""),
          phone: String((ep as { phone?: string }).phone ?? ""),
          website: String((ep as { website?: string }).website ?? ""),
        };
        setEmployerProfile(next);
        setProfileDraft(next);
      } else {
        const epLocal = useStore.getState().employerProfile;
        const display = useStore.getState().currentUser?.displayName ?? "";
        setProfileDraft({
          fullName: epLocal.fullName || display || "",
          companyName: epLocal.companyName,
          jobTitle: epLocal.jobTitle,
          phone: epLocal.phone,
          website: epLocal.website,
        });
      }
    });
  }, [currentUser?.uid, setEmployerProfile]);

  async function saveEmployerProfile() {
    if (!currentUser?.uid || currentUser.uid === "demo-guest") {
      setEmployerProfile(profileDraft);
      return;
    }
    setProfileSaving(true);
    try {
      setEmployerProfile(profileDraft);
      await updateUserProfile(currentUser.uid, { employerProfile: profileDraft });
      await logAction(currentUser.uid, "employer.profile_updated", {});
    } finally {
      setProfileSaving(false);
    }
  }

  // Restore history item as the active project and navigate to correct page
  function loadFromHistory(saved: SavedProject) {
    setProject(saved.project);
    setSavedProjectId(saved.id);
    Object.entries(saved.approvedTools ?? {}).forEach(([toolId, val]) => {
      if (val !== undefined) setToolApproval(toolId, val as boolean);
    });
    setIdea(saved.project.idea);

    // Smart navigate based on project state
    if (saved.project.locked) {
      router.push("/project-room");
    } else if (saved.project.assumptions?.every(a => a.accepted)) {
      router.push("/architecture");
    }
    // else stay on discovery (scroll to requirements)
  }

  async function handleDeleteHistory(id: string) {
    setDeletingId(id);
    await deleteProject(id).catch(() => {});
    setHistory(prev => prev.filter(p => p.id !== id));
    setDeletingId(null);
  }

  const allAccepted = project?.assumptions?.every((a) => a.accepted) ?? false;

  async function runDiscoveryMatching() {
    if (!project) return;
    setMatchLoading(true);
    setMatchError(false);
    setMatchDetail(null);
    try {
      const { profiles, queryError } = await getAllDeveloperProfiles(30);
      if (!profiles.length) {
        setMatchedDevs([]);
        setMatchError(true);
        setMatchDetail(queryError ? firestoreAccessHint(queryError) : null);
        return;
      }
      const reqWords = project.requirements.flatMap(r =>
        `${r.title} ${r.description}`.split(/\s+/).filter(w => w.length > 3)
      );
      const ideaWords = (project.idea ?? "").split(/\s+/).filter(w => w.length > 3);
      const requiredSkills = [...new Set([...reqWords, ...ideaWords])].slice(0, 20);

      const res = await fetch("/api/match-developers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName:    project.name,
          projectIdea:    project.idea,
          requiredSkills,
          candidates:     profiles,
        }),
      });
      const { ok, data } = await parseJsonResponse(res);
      const devs = data.developers;
      if (ok && Array.isArray(devs) && devs.length) {
        setMatchedDevs(devs);
        if (currentUser) {
          logAction(currentUser.uid, "analysis.generated", {
            type: "discovery-developer-matching",
            count: devs.length,
          }).catch(() => {});
        }
      } else {
        setMatchedDevs([]);
        setMatchError(true);
        const apiErr = typeof data?.error === "string" ? data.error : null;
        if (profiles.length && ok) {
          setMatchDetail(
            "Developers were found in the database but the matcher returned no results. Try again or check profile data.",
          );
        } else {
          setMatchDetail(
            apiErr ??
              (!res.ok
                ? `Matching request failed (${res.status}). Check server logs for /api/match-developers.`
                : "Could not rank developers. Check server logs for /api/match-developers and that your AI API key is set."),
          );
        }
      }
    } catch {
      setMatchedDevs([]);
      setMatchError(true);
      setMatchDetail(null);
    } finally {
      setMatchLoading(false);
    }
  }

  // Re-run matching when project content changes (new analysis or history load)
  useEffect(() => {
    if (!project || isAnalyzing) return;
    runDiscoveryMatching();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.idea, project?.name, isAnalyzing]);

  async function runAnalysis(text: string) {
    if (!text.trim()) return;
    setIsAnalyzing(true);
    setError(null);

    // Cycle through loading messages while waiting
    let msgIdx = 0;
    const msgTimer = setInterval(() => {
      msgIdx = (msgIdx + 1) % ANALYZE_MESSAGES.length;
      setAnalyzeMsg(ANALYZE_MESSAGES[msgIdx]);
    }, 900);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: text.trim() }),
      });

      const { ok, data } = await parseJsonResponse(res);

      const analysedProject = ok ? (data as unknown as ProjectState) : (() => {
        console.warn("AI analysis fallback triggered:", data.error);
        return analyzeIdea(text.trim());
      })();
      setProject(analysedProject);

      // Persist to Firestore if user is signed in
      if (currentUser) {
        try {
          const docId = await saveProject(currentUser.uid, analysedProject, {});
          setSavedProjectId(docId);
          await logAction(currentUser.uid, "project.created", {
            projectName: analysedProject.name,
            docId,
          });
        } catch (saveErr) {
          console.warn("[Firestore] project save failed:", saveErr);
        }
      }
    } catch (err) {
      console.error("Network error calling /api/analyze:", err);
      const fallback = analyzeIdea(text.trim());
      setProject(fallback);
      if (currentUser) {
        try {
          const docId = await saveProject(currentUser.uid, fallback, {});
          setSavedProjectId(docId);
          await logAction(currentUser.uid, "project.created", { projectName: fallback.name, docId, source: "fallback" });
        } catch { /* non-blocking */ }
      }
    } finally {
      clearInterval(msgTimer);
      setIsAnalyzing(false);
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") runAnalysis(idea);
  };

  return (
    <div className="min-h-screen relative flex">
      <div className="fixed top-0 right-0 w-[700px] h-[700px] bg-blue-500/[0.04] rounded-full blur-[180px] pointer-events-none -z-10" />
      <div className="fixed bottom-0 left-0 w-[600px] h-[600px] bg-purple-500/[0.03] rounded-full blur-[180px] pointer-events-none -z-10" />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-emerald-500/[0.02] rounded-full blur-[150px] pointer-events-none -z-10" />

      {/* Sidebar */}
      <aside className="w-64 border-r border-white/5 bg-[#030303]/90 backdrop-blur-2xl flex flex-col p-6 sticky top-0 h-screen shadow-[inset_-1px_0_0_rgba(255,255,255,0.03)]">
        <div className="mb-8">
          <Link href="/" className="flex items-center gap-2 group w-fit hover:scale-105 transition-transform">
            <Logo className="w-9 h-9 group-hover:drop-shadow-[0_0_15px_rgba(59,130,246,0.8)] transition-all" />
            <span className="text-xl font-black tracking-tighter text-white uppercase group-hover:text-white/90 transition-colors">BuildCraft AI</span>
          </Link>
          <div className="flex items-center gap-1.5 mt-3">
            <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
            <span className="text-emerald-500/80 text-[10px] uppercase tracking-[0.2em] font-bold">Discovery Hub</span>
          </div>
          {project && (
            <div className="mt-1 text-white/30 text-[10px] truncate font-light">{project.name}</div>
          )}
        </div>

        <nav className="flex-grow space-y-1">
          {/* Home */}
          <Link href="/" className="flex items-center gap-3 w-full px-3 py-2.5 text-white/40 hover:text-white hover:bg-white/5 rounded-xl transition-all text-sm group">
            <Home className="w-4 h-4 group-hover:text-blue-400 transition-colors" /> 
            <span className="text-xs font-medium">Home</span>
          </Link>

          {/* Requirements — active */}
          <button className="flex items-center gap-3 w-full px-3 py-2.5 text-white font-bold bg-gradient-to-r from-blue-500/15 to-transparent rounded-xl border border-blue-500/20 text-sm shadow-[0_0_20px_rgba(59,130,246,0.05)] relative overflow-hidden group">
            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500 rounded-full" />
            <Layers className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-bold text-blue-300">Requirements</span>
            {project && (
              <span className="ml-auto text-[9px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-full border border-blue-500/20 uppercase tracking-widest">v1.0</span>
            )}
          </button>

          {/* Architecture */}
          <button
            onClick={() => allAccepted && router.push("/architecture")}
            className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-all text-xs ${
              allAccepted ? "text-white/60 hover:text-white hover:bg-white/5 group" : "text-white/20 cursor-not-allowed"
            }`}
          >
            <Activity className={`w-4 h-4 ${allAccepted ? "group-hover:text-emerald-400 transition-colors" : ""}`} />
            <span className="font-medium">Architecture</span>
            {!allAccepted && <span className="ml-auto text-[9px] text-white/20 bg-white/5 px-1.5 py-0.5 rounded-full">Accept all</span>}
            {allAccepted && <span className="ml-auto text-[9px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">Ready</span>}
          </button>

          {/* Project Room (only shown if project is locked) */}
          {project?.locked && (
            <button
              onClick={() => router.push("/project-room")}
              className="flex items-center gap-3 w-full px-3 py-2.5 text-white/40 hover:text-white hover:bg-white/5 rounded-xl transition-all group"
            >
              <Users className="w-4 h-4 group-hover:text-purple-400 transition-colors" />
              <span className="text-xs font-medium">Project Workspace</span>
            </button>
          )}
        </nav>

        {/* ── Project History in Sidebar ─────────────────────────────────────── */}
        {currentUser && (
          <div className="mt-4 flex-shrink-0">
            <button
              onClick={() => setHistoryOpen(v => !v)}
              className="flex items-center justify-between w-full mb-2 text-[10px] font-bold uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <History className="w-3 h-3" /> Past Projects
                {history.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-[9px]">{history.length}</span>
                )}
              </span>
              <ChevronDown className={`w-3 h-3 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
            </button>

            <AnimatePresence>
              {historyOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  {historyLoading && (
                    <div className="flex items-center gap-2 py-3 text-white/20">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span className="text-[10px]">Loading…</span>
                    </div>
                  )}

                  {!historyLoading && history.length === 0 && (
                    <p className="text-[10px] text-white/20 font-light py-2">No projects yet.</p>
                  )}

                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                    {history.map(saved => {
                      const isActive = saved.id === (useStore.getState().savedProjectId);
                      return (
                        <div key={saved.id}
                          className={`group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all ${isActive ? "bg-indigo-500/15 border border-indigo-500/20" : "hover:bg-white/5 border border-transparent"}`}
                          onClick={() => loadFromHistory(saved)}
                        >
                          <div className="shrink-0">
                            {saved.project.locked
                              ? <Lock className="w-3 h-3 text-emerald-400" />
                              : <FolderOpen className="w-3 h-3 text-white/30" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold text-white/70 truncate leading-tight">{saved.project.name}</p>
                            <p className="text-[9px] text-white/20 truncate">
                              {saved.createdAt
                                ? new Date((saved.createdAt as { seconds: number }).seconds * 1000).toLocaleDateString()
                                : "—"}
                            </p>
                          </div>
                          <button
                            onClick={e => { e.stopPropagation(); handleDeleteHistory(saved.id); }}
                            disabled={deletingId === saved.id}
                            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-red-400/50 hover:text-red-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ── Bottom Stats ──────────────────────────────────────────────────── */}
        {project && (
          <div className="mt-4 space-y-2">
            <div className="p-3 bg-gradient-to-r from-yellow-500/10 to-transparent border border-yellow-500/20 rounded-2xl">
              <div className="text-[9px] uppercase tracking-widest text-yellow-400/80 mb-2 font-bold flex items-center gap-1.5">
                <Zap className="w-3 h-3" /> AI Confidence
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 shadow-[0_0_6px_currentColor] ${
                      project.confidence >= 75 ? "bg-emerald-500" 
                      : project.confidence >= 50 ? "bg-yellow-500" 
                      : "bg-red-500"
                    }`}
                    style={{ width: `${project.confidence}%` }}
                  />
                </div>
                <span className="text-xs font-black text-white">{project.confidence}%</span>
              </div>
            </div>
            <div className="p-3 bg-purple-500/5 border border-purple-500/15 rounded-2xl flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
              <p className="text-[10px] text-white/50">BuildCraft AI</p>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-grow p-8 lg:p-10 lg:flex gap-10 overflow-y-auto bg-[#030303]">
        <div className="flex-grow max-w-4xl space-y-10">

          {/* Project creator profile */}
          <section className="rounded-3xl border border-white/8 bg-white/[0.02] overflow-hidden backdrop-blur-sm shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
            <button
              type="button"
              onClick={() => setProfileOpen((o) => !o)}
              className="w-full flex items-center justify-between gap-4 p-5 text-left hover:bg-white/[0.03] transition-colors group"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-500/5 border border-blue-500/30 flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(59,130,246,0.1)] group-hover:shadow-[0_0_25px_rgba(59,130,246,0.2)] transition-all">
                  <UserRound className="w-5 h-5 text-blue-400" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-black text-white tracking-tight">Your profile</h2>
                  <p className="text-[11px] text-white/40 truncate">
                    {profileDraft.fullName || "Add your name and org"} · Project creator
                  </p>
                </div>
              </div>
              <div className={`w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center transition-all ${ profileOpen ? "rotate-180 border-white/20" : ""}`}>
                <ChevronDown className="w-3.5 h-3.5 text-white/50" />
              </div>
            </button>
            <AnimatePresence>
              {profileOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-white/10"
                >
                  <div className="p-5 pt-2 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-white/35 mb-1.5">Full name</label>
                        <input
                          value={profileDraft.fullName}
                          onChange={(e) => setProfileDraft((d) => ({ ...d, fullName: e.target.value }))}
                          placeholder="Your name"
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/40"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-white/35 mb-1.5 flex items-center gap-1.5">
                          <Building2 className="w-3 h-3" /> Company / org
                        </label>
                        <input
                          value={profileDraft.companyName}
                          onChange={(e) => setProfileDraft((d) => ({ ...d, companyName: e.target.value }))}
                          placeholder="Company or team"
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/40"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-white/35 mb-1.5 flex items-center gap-1.5">
                          <Briefcase className="w-3 h-3" /> Role / title
                        </label>
                        <input
                          value={profileDraft.jobTitle}
                          onChange={(e) => setProfileDraft((d) => ({ ...d, jobTitle: e.target.value }))}
                          placeholder="e.g. Product lead"
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/40"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-white/35 mb-1.5 flex items-center gap-1.5">
                          <Phone className="w-3 h-3" /> Phone
                        </label>
                        <input
                          value={profileDraft.phone}
                          onChange={(e) => setProfileDraft((d) => ({ ...d, phone: e.target.value }))}
                          placeholder="+1 …"
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/40"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-white/35 mb-1.5 flex items-center gap-1.5">
                          <Globe className="w-3 h-3" /> Website (optional)
                        </label>
                        <input
                          value={profileDraft.website}
                          onChange={(e) => setProfileDraft((d) => ({ ...d, website: e.target.value }))}
                          placeholder="https://"
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/40"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => void saveEmployerProfile()}
                        disabled={profileSaving}
                        className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest silver-gradient text-black disabled:opacity-50 flex items-center gap-2"
                      >
                        {profileSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        Save profile
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* Header */}
          <section className="space-y-8">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 shadow-[0_0_20px_rgba(168,85,247,0.1)]">
                <span className="flex h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse shadow-[0_0_6px_rgba(168,85,247,0.8)]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-purple-300">
                  AI-Powered Discovery
                </span>
              </div>
              <h1 className="text-5xl md:text-6xl font-black tracking-tighter text-white leading-tight">
                Describe Your{" "}
                <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-emerald-400 bg-clip-text text-transparent">Project</span>
              </h1>
              <p className="text-white/40 text-lg font-light max-w-2xl">
                Tell us about your app. BuildCraft AI generates real technical requirements, risks, and implementation blueprints.
              </p>
            </motion.div>

            {/* AI Command Bar */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="relative group"
            >
              {/* Animated outer glow */}
              <div className="absolute -inset-[2px] bg-gradient-to-r from-blue-500/30 via-purple-500/20 to-emerald-500/30 rounded-[1.75rem] blur-md opacity-0 group-focus-within:opacity-100 transition-all duration-700" />
              <div className="relative bg-[#050505] border border-white/10 group-focus-within:border-white/20 rounded-[1.5rem] transition-all duration-500 shadow-[0_8px_40px_rgba(0,0,0,0.6)]">
                <div className="flex items-start gap-4 px-6 py-5">
                  <div className={`mt-1 flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-500 ${
                    isAnalyzing ? "bg-purple-500/20 border border-purple-500/40 shadow-[0_0_20px_rgba(168,85,247,0.3)]" 
                    : idea.trim() ? "bg-blue-500/20 border border-blue-500/30" 
                    : "bg-white/5 border border-white/10"
                  }`}>
                    {isAnalyzing 
                      ? <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                      : <Sparkles className={`w-4 h-4 transition-colors ${idea.trim() ? "text-blue-400" : "text-white/30"}`} />}
                  </div>
                  <textarea
                    value={idea}
                    onChange={(e) => setIdea(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runAnalysis(idea); } }}
                    disabled={isAnalyzing}
                    rows={3}
                    className="bg-transparent border-none focus:outline-none focus:ring-0 text-lg text-white w-full placeholder:text-white/20 font-light disabled:opacity-50 resize-none leading-relaxed"
                    placeholder="I want to build a fitness app where users track workouts, set goals, and compete with friends..."
                  />
                </div>
                <div className="flex items-center justify-between px-6 pb-4 pt-0">
                  <span className="text-[10px] text-white/20 font-light">
                    {isAnalyzing ? 
                      <span className="text-purple-400/80 flex items-center gap-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping" />Analyzing with BuildCraft AI…</span>
                      : "Press Enter or click Analyze →"}
                  </span>
                  <button
                    onClick={() => runAnalysis(idea)}
                    disabled={!idea.trim() || isAnalyzing}
                    className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2 ${
                      idea.trim() && !isAnalyzing 
                        ? "silver-gradient text-black shadow-[0_0_20px_rgba(255,255,255,0.15)] hover:shadow-[0_0_30px_rgba(255,255,255,0.3)] hover:scale-105" 
                        : "bg-white/5 text-white/20 cursor-not-allowed border border-white/5"
                    }`}
                  >
                    {isAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                    {isAnalyzing ? "Analyzing" : "Analyze"}
                  </button>
                </div>
              </div>
            </motion.div>

            {/* Error Banner */}
            {error && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl backdrop-blur-sm">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-300 font-light leading-relaxed">{error}</p>
              </motion.div>
            )}

            {/* Intro cards (only when no project yet) */}
            {!project && !isAnalyzing && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2"
              >
                {[
                  { icon: Target, color: "blue", iconColor: "text-blue-400", bg: "from-blue-500/10", border: "border-blue-500/20", title: "Requirement Extraction", desc: "BuildCraft AI reads your idea and generates precise technical requirements." },
                  { icon: ShieldCheck, color: "emerald", iconColor: "text-emerald-400", bg: "from-emerald-500/10", border: "border-emerald-500/20", title: "Compliance Detection", desc: "Automatically flags GDPR, HIPAA, SOC2 needs based on your project context." },
                  { icon: Zap, color: "yellow", iconColor: "text-yellow-400", bg: "from-yellow-500/10", border: "border-yellow-500/20", title: "Live Confidence Score", desc: "AI tells you exactly how certain it is and what extra detail would help." },
                ].map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <motion.div 
                      key={i} 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + i * 0.08 }}
                      className={`bg-gradient-to-b ${item.bg} to-transparent border ${item.border} p-5 rounded-2xl backdrop-blur-sm hover:scale-[1.02] transition-transform duration-300 cursor-default group`}
                    >
                      <div className={`w-10 h-10 rounded-xl bg-white/5 border ${item.border} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                        <Icon className={`w-5 h-5 ${item.iconColor}`} />
                      </div>
                      <h3 className="text-white font-bold text-sm mb-1.5 tracking-tight">{item.title}</h3>
                      <p className="text-white/40 text-xs font-light leading-relaxed">{item.desc}</p>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </section>
          {/* END header section — history sections below are siblings */}

          {/* ── Project History (main area) ──────────────────────────────────── */}
          {!project && !isAnalyzing && currentUser && (
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="space-y-5"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50 flex items-center gap-2">
                  <History className="w-3.5 h-3.5" /> Your Project History
                </h2>
                <button
                  onClick={() => {
                    if (!currentUser) return;
                    setHistoryLoading(true);
                    getUserProjects(currentUser.uid)
                      .then(setHistory).catch(() => {})
                      .finally(() => setHistoryLoading(false));
                  }}
                  className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/20 hover:text-white transition-colors"
                >
                  <RefreshCw className={`w-3 h-3 ${historyLoading ? "animate-spin" : ""}`} /> Refresh
                </button>
              </div>

              {historyLoading && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="glass-panel p-5 rounded-2xl border border-white/5 animate-pulse space-y-3">
                      <div className="h-4 bg-white/10 rounded w-3/4" />
                      <div className="h-3 bg-white/5 rounded w-1/2" />
                      <div className="h-3 bg-white/5 rounded w-2/3" />
                    </div>
                  ))}
                </div>
              )}

              {!historyLoading && history.length === 0 && (
                <div className="text-center py-12 space-y-3">
                  <FolderOpen className="w-10 h-10 text-white/10 mx-auto" />
                  <p className="text-white/30 text-sm font-light">No saved projects yet.</p>
                  <p className="text-white/20 text-xs">Describe your first project above and it will automatically be saved here.</p>
                </div>
              )}

              {!historyLoading && history.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {history.map((saved, idx) => {
                    const isLocked = saved.project.locked;
                    const toolCount = Object.values(saved.approvedTools ?? {}).filter(Boolean).length;
                    const reqCount  = saved.project.requirements?.length ?? 0;
                    const dateStr   = saved.createdAt
                      ? new Date((saved.createdAt as { seconds: number }).seconds * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : "—";

                    return (
                      <motion.div
                        key={saved.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.06 }}
                        className="glass-panel p-5 rounded-2xl border border-white/8 hover:border-white/20 transition-all group cursor-pointer relative overflow-hidden"
                        onClick={() => loadFromHistory(saved)}
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                        {/* Status badge */}
                        <div className="flex items-center justify-between mb-4 relative z-10">
                          <span className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${
                            isLocked
                              ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                              : "text-white/30 bg-white/5 border-white/10"
                          }`}>
                            {isLocked ? <><Lock className="w-3 h-3" /> Locked</> : <><FolderOpen className="w-3 h-3" /> Draft</>}
                          </span>
                          <button
                            onClick={e => { e.stopPropagation(); handleDeleteHistory(saved.id); }}
                            disabled={deletingId === saved.id}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400/40 hover:text-red-400 p-1 rounded-lg hover:bg-red-500/10"
                          >
                            {deletingId === saved.id
                              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>

                        {/* Project name */}
                        <h3 className="text-white font-bold text-base tracking-tight mb-1 relative z-10 line-clamp-1">
                          {saved.project.name}
                        </h3>
                        <p className="text-white/30 text-[10px] font-light line-clamp-2 mb-4 relative z-10">
                          {saved.project.idea}
                        </p>

                        {/* Stats row */}
                        <div className="flex items-center gap-3 text-[9px] text-white/30 relative z-10 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Activity className="w-3 h-3" /> {reqCount} requirements
                          </span>
                          {toolCount > 0 && (
                            <span className="flex items-center gap-1">
                              <Layers className="w-3 h-3" /> {toolCount} tools
                            </span>
                          )}
                          <span className="flex items-center gap-1 ml-auto">
                            <Clock className="w-3 h-3" /> {dateStr}
                          </span>
                        </div>

                        {/* Hover CTA */}
                        <div className="mt-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all translate-y-1 group-hover:translate-y-0 relative z-10">
                          <span className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-400">
                            <ArrowRight className="w-3 h-3" />
                            {isLocked ? "Open Workspace" : "Continue Project"}
                          </span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </motion.section>
          )}

          {/* Sign-in prompt when not logged in */}
          {!project && !isAnalyzing && !currentUser && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 glass-panel rounded-2xl border border-white/5 flex items-center gap-5"
            >
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                <LogIn className="w-6 h-6 text-blue-400" />
              </div>
              <div className="flex-1">
                <p className="text-white font-bold text-sm">Save your project history</p>
                <p className="text-white/40 text-xs font-light mt-0.5">Sign in to automatically save every project you create and access them from any device.</p>
              </div>
              <Link href="/auth?return=/discovery" className="shrink-0 px-4 py-2 silver-gradient text-black font-black text-[10px] uppercase tracking-widest rounded-xl">
                Sign In
              </Link>
            </motion.div>
          )}

          {/* Loading State */}
          {isAnalyzing && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-24 space-y-8"
            >
              {/* Cinematic ring loader */}
              <div className="relative w-28 h-28">
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-500/20 to-blue-500/20 blur-xl animate-pulse" />
                <div className="absolute inset-0 border border-white/5 rounded-full" />
                <div className="absolute inset-0 border-2 border-transparent border-t-purple-500 rounded-full animate-spin" style={{ animationDuration: "1.5s" }} />
                <div className="absolute inset-3 border border-white/5 rounded-full" />
                <div className="absolute inset-3 border-2 border-transparent border-t-blue-400 rounded-full animate-spin" style={{ animationDirection: "reverse", animationDuration: "1s" }} />
                <div className="absolute inset-6 border border-white/5 rounded-full" />
                <div className="absolute inset-6 border-2 border-transparent border-t-emerald-400 rounded-full animate-spin" style={{ animationDuration: "0.7s" }} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white/60 animate-pulse" />
                </div>
              </div>
              <div className="text-center space-y-2">
                <motion.p 
                  key={analyzeMsg}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-white font-bold text-base tracking-wide"
                >
                  {analyzeMsg}
                </motion.p>
                <p className="text-white/30 text-xs font-light flex items-center gap-2 justify-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  BuildCraft AI
                </p>
              </div>
            </motion.div>
          )}

          {/* Results */}
          {project && !isAnalyzing && (
            <AnimatePresence>
              <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">
                    AI-Generated Requirements — <span className="text-blue-400">{project.requirements.length} items</span>
                  </h2>
                  <button
                    onClick={() => runAnalysis(idea)}
                    disabled={isAnalyzing}
                    className="text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors flex items-center gap-1 disabled:opacity-30"
                  >
                    Re-analyze with AI
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {project.requirements.map((req, idx) => {
                    const cfg = typeConfig[req.type] ?? typeConfig.feature;
                    return (
                      <motion.div
                        key={req.id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.07 }}
                        className={`relative p-6 rounded-2xl border ${cfg.bg} hover:border-white/25 transition-all duration-500 group cursor-default overflow-hidden bg-[#040404]`}
                      >
                        {/* Hover glow */}
                        <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-2xl ${cfg.bg}`} />
                        <div className="relative z-10">
                          <div className="flex justify-between items-start mb-4">
                            <span className={`px-2.5 py-1 border rounded-full text-[9px] font-black uppercase tracking-[0.2em] ${cfg.color} ${cfg.bg} group-hover:shadow-sm transition-all`}>
                              {cfg.label}
                            </span>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${cfg.bg} border opacity-60`}>
                              <Check className={`w-3 h-3 ${cfg.color}`} />
                            </div>
                          </div>
                          <h3 className="text-white text-sm font-bold mb-2 tracking-tight leading-snug group-hover:text-white/90 transition-colors">{req.title}</h3>
                          <p className="text-white/40 text-xs leading-relaxed font-light group-hover:text-white/60 transition-colors">{req.description}</p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* ── Hire a developer — matched to this project ───────────────── */}
                <div className="pt-8 border-t border-white/5 space-y-8">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div>
                      <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 flex items-center gap-2 mb-3">
                        <Users className="w-3.5 h-3.5 text-indigo-400" /> Hire a developer
                      </h2>
                      <p className="text-white/40 text-sm font-light max-w-xl leading-relaxed">
                        Developers below are AI-ranked for <span className="text-white font-semibold">{project.name}</span>. Send invites after you lock your architecture plan.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={runDiscoveryMatching}
                      disabled={matchLoading}
                      className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 hover:border-white/20 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-white transition-all disabled:opacity-40 group"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${matchLoading ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}`} />
                      Refresh matches
                    </button>
                  </div>

                  {/* Hiring flow — steps */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      { step: 1, title: "Requirements",    desc: "AI extracted scope from your idea.", done: true, color: "indigo" },
                      { step: 2, title: "Architecture",    desc: "Approve tools & lock the plan.",    done: allAccepted, color: "blue" },
                      { step: 3, title: "Workspace",       desc: "Send hire invites to developers.",   done: project.locked, color: "emerald" },
                      { step: 4, title: "Build Together",  desc: "PRD + chat after accept.",           done: false, color: "purple" },
                    ].map((s, i) => (
                      <div
                        key={s.step}
                        className={`relative p-4 rounded-2xl border transition-all ${
                          s.done
                            ? "bg-gradient-to-b from-emerald-500/10 to-transparent border-emerald-500/25 shadow-[0_0_20px_rgba(16,185,129,0.05)]"
                            : i === 0
                              ? "bg-gradient-to-b from-indigo-500/10 to-transparent border-indigo-500/25"
                              : "bg-white/[0.02] border-white/8"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shadow-sm ${
                            s.done ? "bg-emerald-500 text-black shadow-emerald-500/30" : i === 0 ? "bg-indigo-500 text-white shadow-indigo-500/30" : "bg-white/10 text-white/40"
                          }`}>
                            {s.done ? <Check className="w-3.5 h-3.5" /> : s.step}
                          </span>
                          <span className="text-xs font-bold text-white tracking-tight">{s.title}</span>
                        </div>
                        <p className="text-[10px] text-white/40 font-light leading-relaxed">{s.desc}</p>
                        {s.step === 2 && !allAccepted && (
                          <p className="text-[9px] text-yellow-500/80 mt-2 font-bold uppercase tracking-wider">Next →</p>
                        )}
                        {s.step === 3 && allAccepted && !project.locked && (
                          <p className="text-[9px] text-indigo-400 mt-2 font-bold uppercase tracking-wider">After lock</p>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => router.push("/architecture")}
                      className="px-5 py-3 silver-gradient text-black font-black uppercase tracking-widest text-[10px] rounded-xl flex items-center gap-2"
                    >
                      {allAccepted ? "Continue to architecture" : "Review assumptions first"} <ArrowRight className="w-4 h-4" />
                    </button>
                    {project.locked && (
                      <button
                        type="button"
                        onClick={() => router.push("/project-room?tab=talent")}
                        className="px-5 py-3 border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 font-bold uppercase tracking-widest text-[10px] rounded-xl flex items-center gap-2"
                      >
                        <Users className="w-4 h-4" /> Open hire flow in workspace
                      </button>
                    )}
                  </div>

                  {/* Matching results */}
                  {matchLoading && (
                    <div className="space-y-3 py-6">
                      <div className="flex items-center gap-3 text-white/40 text-sm">
                        <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                        Matching developers to your requirements…
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[1, 2, 3, 4].map(j => (
                          <div key={j} className="h-28 rounded-2xl bg-white/5 border border-white/5 animate-pulse" />
                        ))}
                      </div>
                    </div>
                  )}

                  {matchError && !matchLoading && (
                    <div className="p-5 rounded-2xl border border-yellow-500/20 bg-yellow-500/5 flex gap-3">
                      <AlertCircle className="w-5 h-5 text-yellow-500 shrink-0" />
                      <div>
                        <p className="text-sm text-yellow-200 font-bold">
                          {matchDetail ? "Could not load developers" : "No developers to show yet"}
                        </p>
                        {matchDetail ? (
                          <p className="text-xs text-white/60 font-light mt-1 leading-relaxed">{matchDetail}</p>
                        ) : (
                          <p className="text-xs text-white/50 font-light mt-1">
                            They must <strong className="text-white/70">finish all registration steps</strong> and submit on the final step (sets <code className="text-indigo-400">registrationDone</code> and <code className="text-indigo-400">profileStatus: active</code>).
                            Registration: <code className="text-indigo-400">/developer/register</code> while signed in (not guest).
                          </p>
                        )}
                        <button type="button" onClick={runDiscoveryMatching} className="mt-3 text-[10px] font-bold uppercase tracking-widest text-indigo-400 hover:text-indigo-300">
                          Try again
                        </button>
                      </div>
                    </div>
                  )}

                  {!matchLoading && !matchError && matchedDevs.length > 0 && (
                    <div className="space-y-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 flex items-center gap-2">
                        <span className="h-px flex-1 bg-white/5" />
                        Top matches for &quot;{project.name}&quot;
                        <span className="h-px flex-1 bg-white/5" />
                      </p>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {matchedDevs.map((dev, idx) => {
                          const expanded = expandedDevId === dev.userId;
                          const bandStyle =
                            dev.confidenceBand === "Excellent" 
                              ? { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", glow: "shadow-[0_0_20px_rgba(16,185,129,0.3)]" }
                              : dev.confidenceBand === "Strong" 
                              ? { text: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30", glow: "shadow-[0_0_20px_rgba(59,130,246,0.3)]" }
                              : dev.confidenceBand === "Good" 
                              ? { text: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30", glow: "shadow-[0_0_15px_rgba(234,179,8,0.2)]" }
                              : { text: "text-white/40", bg: "bg-white/5", border: "border-white/10", glow: "" };
                          return (
                            <motion.div
                              key={dev.userId}
                              initial={{ opacity: 0, y: 12 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.06 }}
                              className="bg-[#040404] rounded-2xl border border-white/8 overflow-hidden hover:border-white/18 transition-all duration-500 group"
                            >
                              <div className="p-5 flex gap-4">
                                {/* Avatar */}
                                <div className={`w-14 h-14 rounded-2xl border ${bandStyle.border} ${bandStyle.bg} overflow-hidden flex items-center justify-center shrink-0 transition-all duration-300 ${bandStyle.glow} group-hover:scale-105`}>
                                  {dev.photoURL ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={dev.photoURL} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <UserCheck className={`w-6 h-6 ${bandStyle.text}`} />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <h3 className="text-white font-bold text-sm truncate tracking-tight">{dev.fullName || "Developer"}</h3>
                                      <p className="text-[10px] text-white/35 mt-0.5 font-light">
                                        {dev.primaryRole} &middot; {dev.yearsExp}y exp &middot; {dev.availability}
                                      </p>
                                    </div>
                                    {/* Score badge */}
                                    <div className={`shrink-0 px-3 py-1.5 rounded-xl border text-center ${bandStyle.bg} ${bandStyle.border} ${bandStyle.glow}`}>
                                      <div className={`text-xl font-black leading-none tracking-tighter ${bandStyle.text}`}>{dev.matchScore}</div>
                                      <div className={`text-[7px] font-bold uppercase tracking-widest opacity-80 ${bandStyle.text}`}>{dev.confidenceBand}</div>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-1 mt-2.5">
                                    {dev.skillOverlap.slice(0, 4).map(sk => (
                                      <span key={sk} className="text-[9px] px-2 py-0.5 rounded-full border text-emerald-400/80 bg-emerald-500/10 border-emerald-500/20 font-bold">
                                        {sk}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setExpandedDevId(expanded ? null : dev.userId)}
                                className="w-full py-2.5 text-[9px] font-bold uppercase tracking-widest text-white/25 hover:text-white/60 border-t border-white/5 flex items-center justify-center gap-1.5 transition-colors hover:bg-white/[0.02]"
                              >
                                {expanded ? "Hide reasoning" : "Why this match?"}
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} />
                              </button>
                              <AnimatePresence>
                                {expanded && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="border-t border-white/5 overflow-hidden"
                                  >
                                    <div className="p-4 space-y-2 bg-white/[0.015]">
                                      {dev.matchReasons.map((r, ri) => (
                                        <p key={ri} className="text-[11px] text-white/50 font-light flex gap-2 leading-relaxed">
                                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                          {r}
                                        </p>
                                      ))}
                                      {dev.caution && (
                                        <p className="text-[11px] text-yellow-500/70 flex gap-2 pt-1">
                                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                          {dev.caution}
                                        </p>
                                      )}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                              <div className="p-3 border-t border-white/5">
                                <button
                                  type="button"
                                  onClick={() => router.push(project.locked ? "/project-room?tab=talent" : "/architecture")}
                                  className="w-full py-2.5 rounded-xl bg-white/5 border border-white/8 hover:border-white/20 text-[10px] font-bold uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                                >
                                  {project.locked ? "Hire in workspace" : "Lock plan to hire"}
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </motion.section>
            </AnimatePresence>
          )}
        </div>

        {/* Right Panel — AI Analysis HUD */}
        {project && !isAnalyzing && (
          <motion.aside
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="w-full lg:w-[340px] shrink-0"
          >
            <div className="sticky top-6 space-y-4">
              {/* Main HUD Card */}
              <div className="relative bg-[#040404] rounded-3xl border border-white/8 overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
                {/* Ambient glow matching confidence */}
                <div className={`absolute top-0 right-0 w-48 h-48 rounded-full blur-[80px] opacity-30 pointer-events-none ${
                  project.confidence >= 75 ? "bg-emerald-500/30" 
                  : project.confidence >= 50 ? "bg-yellow-500/20" 
                  : "bg-red-500/20"
                }`} />

                <div className="p-6 space-y-6 relative z-10">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                      <h2 className="text-[10px] font-black uppercase tracking-[0.25em] text-white/60">AI Analysis</h2>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[9px] font-bold text-white/30 uppercase tracking-widest">Live</span>
                  </div>

                  {/* Confidence Meter */}
                  <div className="flex flex-col items-center py-2">
                    <div className="relative w-40 h-40 flex items-center justify-center">
                      {/* Outer glow ring */}
                      <div className={`absolute inset-0 rounded-full blur-2xl opacity-20 ${
                        project.confidence >= 75 ? "bg-emerald-500" 
                        : project.confidence >= 50 ? "bg-yellow-500" 
                        : "bg-red-500"
                      }`} />
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 160 160">
                        <circle cx="80" cy="80" r="68" stroke="rgba(255,255,255,0.05)" strokeWidth="2" fill="transparent" />
                        <circle
                          cx="80" cy="80" r="68"
                          stroke={project.confidence >= 75 ? "#10b981" : project.confidence >= 50 ? "#eab308" : "#ef4444"}
                          strokeWidth="3" fill="transparent"
                          strokeDasharray="427"
                          strokeDashoffset={427 - (427 * project.confidence) / 100}
                          strokeLinecap="round"
                          style={{ 
                            transition: "stroke-dashoffset 1.5s cubic-bezier(0.4,0,0.2,1)",
                            filter: `drop-shadow(0 0 8px ${ project.confidence >= 75 ? "#10b981" : project.confidence >= 50 ? "#eab308" : "#ef4444" })`
                          }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-4xl font-black text-white tracking-tighter">{project.confidence}%</span>
                        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/30 mt-1">AI Confidence</span>
                      </div>
                    </div>
                    <p className={`text-center text-xs font-light mt-3 px-4 ${
                      project.confidence >= 75 ? "text-emerald-400/80" 
                      : project.confidence >= 50 ? "text-yellow-400/80" 
                      : "text-red-400/80"
                    }`}>
                      {project.confidence >= 75
                        ? "High confidence — your idea is clear"
                        : project.confidence >= 50
                        ? "Moderate — some assumptions needed"
                        : "Low confidence — add more detail"}
                    </p>
                  </div>

                  {/* Assumptions */}
                  <div className="space-y-3 pt-4 border-t border-white/5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="text-yellow-500/80 w-3.5 h-3.5" />
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">AI Assumptions</span>
                      </div>
                      <span className="text-[9px] text-white/25 font-light">
                        {project.assumptions.filter(a => a.accepted).length}/{project.assumptions.length} accepted
                      </span>
                    </div>
                    <div className="space-y-2">
                      {project.assumptions.map((a) => (
                        <div
                          key={a.id}
                          onClick={() => toggleAssumption(a.id)}
                          className={`p-3.5 rounded-2xl border transition-all duration-300 flex gap-3 cursor-pointer group ${
                            a.accepted 
                              ? "bg-emerald-500/8 border-emerald-500/25 hover:border-emerald-500/40" 
                              : "bg-white/[0.02] border-white/8 hover:border-white/20"
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-all duration-300 ${
                            a.accepted 
                              ? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]" 
                              : "bg-white/5 border border-white/20 group-hover:border-white/40"
                          }`}>
                            {a.accepted && <Check className="w-2.5 h-2.5 text-black" />}
                          </div>
                          <p className={`text-xs leading-relaxed transition-colors duration-300 ${
                            a.accepted ? "text-white/75" : "text-white/35"
                          }`}>{a.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Uncertainties */}
                  {project.uncertainties.length > 0 && (
                    <div className="space-y-2">
                      {project.uncertainties.map((u, i) => (
                        <div key={i} className="p-3.5 bg-red-500/5 border border-red-500/15 rounded-2xl">
                          <span className="text-[8px] font-black uppercase tracking-widest text-red-400/70 mb-1.5 flex items-center gap-1">
                            <AlertTriangle className="w-2.5 h-2.5" /> AI Uncertainty
                          </span>
                          <p className="text-[11px] text-white/50 font-light leading-relaxed mt-1">{u}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Powered-by */}
                  <div className="flex items-center gap-2.5 p-3 bg-purple-500/5 border border-purple-500/15 rounded-2xl">
                    <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse shadow-[0_0_6px_rgba(168,85,247,0.8)]" />
                    <p className="text-[10px] text-white/40 font-light">
                      Analysis by <strong className="text-purple-400">BuildCraft AI</strong>
                    </p>
                  </div>

                  {/* CTA */}
                  <div className="space-y-3 pt-2 border-t border-white/5">
                    {!allAccepted && (
                      <p className="text-[10px] text-white/30 text-center font-light">Accept all assumptions to proceed</p>
                    )}
                    <button
                      disabled={!allAccepted}
                      onClick={() => router.push("/architecture")}
                      className={`w-full flex items-center justify-center gap-2 py-4 font-black uppercase tracking-[0.15em] text-[10px] transition-all duration-300 rounded-2xl ${
                        allAccepted 
                          ? "silver-gradient text-black shadow-[0_0_30px_rgba(255,255,255,0.15)] hover:shadow-[0_0_50px_rgba(255,255,255,0.3)] hover:scale-[1.02]" 
                          : "bg-white/5 text-white/20 cursor-not-allowed border border-white/5"
                      }`}
                    >
                      Accept & Recommend Tools <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </main>
    </div>
  );
}
