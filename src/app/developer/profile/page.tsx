"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, Phone, MapPin, Briefcase, Code2, GitBranch,
  Link2, Upload, Award, Clock, DollarSign, CheckCircle2,
  Loader2, Plus, X, Shield, Sparkles, Terminal, Layers,
  Zap, Star, AlertCircle, Camera, ImagePlus, Trash2,
  Save, ArrowLeft, Edit3, ShieldCheck, Check, ExternalLink,
  Activity, TrendingUp, Globe, Github, RefreshCw,
} from "lucide-react";
import { useStore } from "@/store/useStore";
import {
  getDeveloperProfile,
  saveDeveloperProfile,
  type DeveloperProfile,
  type PrimaryRole,
  type Availability,
} from "@/lib/developerProfile";
import { DeveloperFlowBreadcrumb } from "@/components/FlowNavigation";

// ── Constants ─────────────────────────────────────────────────────────────────
type ProfileTab = "personal" | "professional" | "portfolio" | "availability";

const TABS: { id: ProfileTab; label: string; icon: React.ReactNode }[] = [
  { id: "personal",     label: "Personal",     icon: <User className="w-4 h-4" /> },
  { id: "professional", label: "Professional",  icon: <Briefcase className="w-4 h-4" /> },
  { id: "portfolio",    label: "Portfolio",     icon: <GitBranch className="w-4 h-4" /> },
  { id: "availability", label: "Availability",  icon: <Clock className="w-4 h-4" /> },
];

const ROLE_LABELS: Record<PrimaryRole, string> = {
  frontend: "Frontend Developer",
  backend:  "Backend Developer",
  fullstack: "Full Stack Developer",
  ai:       "AI / ML Engineer",
  devops:   "DevOps / Cloud Engineer",
};

const ROLE_ICONS: Record<PrimaryRole, React.ReactNode> = {
  frontend: <Layers className="w-4 h-4" />,
  backend:  <Terminal className="w-4 h-4" />,
  fullstack: <Code2 className="w-4 h-4" />,
  ai:       <Sparkles className="w-4 h-4" />,
  devops:   <Zap className="w-4 h-4" />,
};

const TIER_CONFIG = {
  "self-declared":      { label: "Tier 1 · Self-Declared",    color: "text-white/50", bg: "bg-white/5 border-white/10",            icon: <Edit3 className="w-3.5 h-3.5" /> },
  "assessment-passed":  { label: "Tier 2 · Assessment-Passed", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30", icon: <Award className="w-3.5 h-3.5" /> },
  "project-verified":   { label: "Tier 3 · Project-Verified",  color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30", icon: <ShieldCheck className="w-3.5 h-3.5" /> },
};

const ALL_SKILLS = [
  "React","Next.js","Vue","Angular","Svelte","TypeScript","JavaScript",
  "Node.js","Python","Go","Rust","Java","C#","PHP","Ruby",
  "PostgreSQL","MySQL","MongoDB","Redis","Supabase","Firebase",
  "AWS","GCP","Azure","Docker","Kubernetes","Terraform",
  "TensorFlow","PyTorch","Langchain","LLM APIs","GraphQL","REST",
  "Git","CI/CD","Linux","Nginx","WebSockets","Stripe API",
];

const ALL_TOOLS = [
  "VS Code","Cursor","Figma","Postman","Jira","GitHub","GitLab",
  "Vercel","Netlify","Heroku","PlanetScale","Neon","Prisma",
  "Drizzle ORM","TanStack Query","Zustand","Redux","Tailwind CSS",
  "Framer Motion","shadcn/ui","Ant Design","Material UI",
];

const PROJECT_TYPES = [
  "SaaS Products","E-Commerce","FinTech","HealthTech","EdTech",
  "Social Platforms","AI/ML Projects","API Development","Mobile Apps",
  "DevOps/Infrastructure","Data Pipelines","Security Systems",
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function Input(err?: string, extra = "") {
  return `w-full bg-white/5 border ${err ? "border-red-500/50 focus:border-red-500" : "border-white/10 focus:border-indigo-500/50"} rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none transition-colors ${extra}`;
}

function completionScore(p: DeveloperProfile): number {
  let score = 0;
  if (p.fullName)    score += 15;
  if (p.phone)       score += 5;
  if (p.location)    score += 5;
  if (p.photoURL)    score += 10;
  if (p.skills.length > 0)  score += 15;
  if (p.tools.length > 0)   score += 5;
  if (p.githubUrl || p.portfolioUrl) score += 15;
  if (p.projectDescriptions.length > 0) score += 10;
  if (p.availability) score += 5;
  if (p.payMin > 0 && p.payMax > 0) score += 5;
  if (p.preferredTypes.length > 0) score += 5;
  if (p.verificationStatus !== "self-declared") score += 5;
  return Math.min(100, score);
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DeveloperProfilePage() {
  const router = useRouter();
  const { currentUser, developerProfile, setDeveloperProfile, patchDeveloperProfile } = useStore();

  const [tab, setTab]           = useState<ProfileTab>("personal");
  const [profile, setProfile]   = useState<DeveloperProfile | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [customSkill, setCustomSkill] = useState("");
  const [newDesc, setNewDesc]   = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load profile ─────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true);
      let p = developerProfile;
      if (!p && currentUser?.uid) {
        p = await getDeveloperProfile(currentUser.uid);
        if (p) setDeveloperProfile(p);
      }
      setProfile(p);
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Debounced auto-save ───────────────────────────────────────────────────
  const autoSave = useCallback((updated: DeveloperProfile) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveState("saving");
    saveTimerRef.current = setTimeout(async () => {
      try {
        await saveDeveloperProfile(currentUser?.uid ?? "", updated);
        patchDeveloperProfile(updated);
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 2000);
      } catch {
        setSaveState("error");
      }
    }, 800);
  }, [currentUser?.uid, patchDeveloperProfile]);

  // ── Field updater — triggers live preview + auto-save ─────────────────────
  function update<K extends keyof DeveloperProfile>(key: K, val: DeveloperProfile[K]) {
    if (!profile) return;
    const updated = { ...profile, [key]: val };
    setProfile(updated);
    autoSave(updated);
  }

  function toggleArray(key: "skills" | "tools" | "preferredTypes", val: string) {
    if (!profile) return;
    const arr = profile[key] as string[];
    const updated = { ...profile, [key]: arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val] };
    setProfile(updated);
    autoSave(updated);
  }

  function addCustomSkill() {
    const s = customSkill.trim();
    if (!s || !profile) return;
    if (!profile.skills.includes(s)) {
      const updated = { ...profile, skills: [...profile.skills, s] };
      setProfile(updated);
      autoSave(updated);
    }
    setCustomSkill("");
  }

  function addProjectDesc() {
    const d = newDesc.trim();
    if (!d || !profile) return;
    const updated = { ...profile, projectDescriptions: [...profile.projectDescriptions, d] };
    setProfile(updated);
    autoSave(updated);
    setNewDesc("");
  }

  function removeProjectDesc(idx: number) {
    if (!profile) return;
    const updated = { ...profile, projectDescriptions: profile.projectDescriptions.filter((_, i) => i !== idx) };
    setProfile(updated);
    autoSave(updated);
  }

  // ── Photo upload ──────────────────────────────────────────────────────────
  function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const MAX = 300;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        update("photoURL", dataUrl);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const completion = profile ? completionScore(profile) : 0;
  const tier = profile?.verificationStatus ?? "self-declared";
  const tierCfg = TIER_CONFIG[tier];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-white/30 animate-spin" />
          <p className="text-white/30 text-sm">Loading your profile…</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
            <User className="w-8 h-8 text-white/20" />
          </div>
          <h2 className="text-2xl font-black text-white">No Profile Found</h2>
          <p className="text-[#888] text-sm font-light">Complete your developer registration first.</p>
          <button onClick={() => router.push("/developer/register")}
            className="w-full py-3 silver-gradient text-black font-black uppercase tracking-widest text-xs rounded-xl">
            Start Registration
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Background glows */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-0 right-1/3 w-[600px] h-[600px] bg-indigo-500/[0.04] rounded-full blur-[150px]" />
        <div className="absolute bottom-0 left-1/4 w-[500px] h-[500px] bg-blue-500/[0.03] rounded-full blur-[150px]" />
      </div>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 glass-panel border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/employee-dashboard")}
            className="flex items-center gap-2 text-white/40 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest">
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </button>
          <div className="w-px h-4 bg-white/10" />
          <span className="text-white font-black tracking-tight">Developer Profile</span>
        </div>

        {/* Auto-save indicator */}
        <AnimatePresence mode="wait">
          {saveState === "saving" && (
            <motion.div key="saving" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex items-center gap-2 text-xs text-white/40 font-bold">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
            </motion.div>
          )}
          {saveState === "saved" && (
            <motion.div key="saved" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex items-center gap-2 text-xs text-emerald-400 font-bold">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </motion.div>
          )}
          {saveState === "error" && (
            <motion.div key="error" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex items-center gap-2 text-xs text-red-400 font-bold">
              <AlertCircle className="w-3.5 h-3.5" /> Save failed
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <DeveloperFlowBreadcrumb />

      <div className="flex flex-col lg:flex-row flex-1">

        {/* ── LEFT — Live profile card (sticky) ────────────────────────── */}
        <aside className="lg:w-80 lg:sticky lg:top-[69px] lg:h-[calc(100vh-69px)] overflow-y-auto p-6 space-y-4 border-b lg:border-b-0 lg:border-r border-white/5">

          {/* Avatar + name */}
          <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-5">
            {/* Photo */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative group">
                <div className="w-28 h-28 rounded-full border-2 border-indigo-500/40 overflow-hidden bg-white/5 flex items-center justify-center shadow-[0_0_30px_rgba(99,102,241,0.2)] transition-all duration-300">
                  {profile.photoURL ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.photoURL} alt={profile.fullName} className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-12 h-12 text-white/20" />
                  )}
                </div>
                {/* Hover overlay */}
                <button onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera className="w-6 h-6 text-white" />
                </button>
                {/* Tier badge */}
                <div className={`absolute -bottom-1 -right-1 flex items-center gap-1 px-2 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest ${tierCfg.bg} ${tierCfg.color}`}>
                  {tierCfg.icon}
                </div>
              </div>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoFile} className="hidden" />

              <div className="flex gap-2">
                <button onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all">
                  <ImagePlus className="w-3 h-3" /> {profile.photoURL ? "Change" : "Upload"}
                </button>
                {profile.photoURL && (
                  <button onClick={() => update("photoURL", "")}
                    className="flex items-center gap-1 px-2 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 rounded-lg text-[10px] font-bold transition-all">
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Identity */}
            <div className="text-center space-y-1">
              <h2 className="text-white font-black text-xl tracking-tight leading-tight">
                {profile.fullName || <span className="text-white/20 italic font-light">Your Name</span>}
              </h2>
              <div className={`flex items-center justify-center gap-1.5 text-xs font-bold ${ROLE_ICONS[profile.primaryRole] ? "text-indigo-400" : "text-white/30"}`}>
                {ROLE_ICONS[profile.primaryRole]}
                {ROLE_LABELS[profile.primaryRole]}
              </div>
              {profile.location && (
                <p className="flex items-center justify-center gap-1 text-[11px] text-white/40">
                  <MapPin className="w-3 h-3" /> {profile.location}
                </p>
              )}
            </div>

            {/* Tier badge */}
            <div className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold ${tierCfg.bg} ${tierCfg.color}`}>
              {tierCfg.icon} {tierCfg.label}
            </div>

            {/* Profile completion */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
                <span className="text-white/40">Profile Completeness</span>
                <span className={completion >= 80 ? "text-emerald-400" : completion >= 50 ? "text-yellow-400" : "text-red-400"}>{completion}%</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${completion >= 80 ? "bg-emerald-500" : completion >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
                  style={{ width: `${completion}%` }}
                />
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5">
              {[
                { label: "Skills",    value: profile.skills.length,  color: "text-indigo-400" },
                { label: "Tools",     value: profile.tools.length,   color: "text-purple-400" },
                { label: "Exp (yrs)", value: profile.yearsExp,       color: "text-blue-400"   },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <div className={`text-lg font-black ${s.color}`}>{s.value}</div>
                  <div className="text-[9px] text-white/30 uppercase tracking-widest">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Skills preview */}
          {profile.skills.length > 0 && (
            <div className="glass-panel p-4 rounded-2xl border border-white/10 space-y-2">
              <p className="text-[9px] text-white/30 uppercase tracking-widest font-bold">Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {profile.skills.map(s => (
                  <span key={s} className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-md text-[9px] font-bold uppercase tracking-widest">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Links preview */}
          {(profile.githubUrl || profile.portfolioUrl) && (
            <div className="glass-panel p-4 rounded-2xl border border-white/10 space-y-2">
              <p className="text-[9px] text-white/30 uppercase tracking-widest font-bold">Links</p>
              <div className="space-y-1.5">
                {profile.githubUrl && (
                  <a href={profile.githubUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-white/50 hover:text-white transition-colors truncate">
                    <Github className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{profile.githubUrl.replace("https://", "")}</span>
                    <ExternalLink className="w-3 h-3 shrink-0 ml-auto" />
                  </a>
                )}
                {profile.portfolioUrl && (
                  <a href={profile.portfolioUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-white/50 hover:text-white transition-colors truncate">
                    <Globe className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{profile.portfolioUrl.replace("https://", "")}</span>
                    <ExternalLink className="w-3 h-3 shrink-0 ml-auto" />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Availability */}
          <div className="glass-panel p-4 rounded-2xl border border-white/10 space-y-2">
            <p className="text-[9px] text-white/30 uppercase tracking-widest font-bold">Availability</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-white font-bold capitalize">{profile.availability}</span>
              {profile.payMin > 0 && (
                <span className="text-xs text-emerald-400 font-bold">${profile.payMin}–${profile.payMax}/hr</span>
              )}
            </div>
          </div>
        </aside>

        {/* ── RIGHT — Edit panels ───────────────────────────────────────── */}
        <main className="flex-1 p-6 lg:p-10 overflow-y-auto">
          <div className="max-w-2xl mx-auto space-y-6">

            {/* Page title */}
            <div>
              <h1 className="text-3xl font-black text-white tracking-tighter">Edit Profile</h1>
              <p className="text-white/40 text-sm mt-1 font-light">All changes are saved automatically in real-time.</p>
            </div>

            {/* Tab navigation */}
            <div className="flex gap-1 p-1 bg-white/5 rounded-2xl border border-white/10 overflow-x-auto">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 flex-1 min-w-max px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${tab === t.id ? "bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 shadow-sm" : "text-white/40 hover:text-white"}`}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.18 }} className="space-y-6">

                {/* ── PERSONAL ─────────────────────────────────────────── */}
                {tab === "personal" && (
                  <Section title="Personal Details" icon={<User className="w-5 h-5 text-indigo-400" />}>
                    <div className="space-y-4">
                      <FormField label="Full Name" required>
                        <input value={profile.fullName} onChange={e => update("fullName", e.target.value)}
                          placeholder="Alex Johnson" className={Input()} />
                      </FormField>

                      <FormField label="Email" hint="From your account — cannot be changed here">
                        <input value={profile.email || currentUser?.email || ""} disabled className={`${Input()} opacity-40 cursor-not-allowed`} />
                      </FormField>

                      <FormField label="Phone Number">
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                          <input value={profile.phone} onChange={e => update("phone", e.target.value)}
                            placeholder="+1 (555) 000-0000" className={`${Input()} pl-9`} />
                        </div>
                      </FormField>

                      <FormField label="Location" hint="City, Country">
                        <div className="relative">
                          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                          <input value={profile.location} onChange={e => update("location", e.target.value)}
                            placeholder="San Francisco, USA" className={`${Input()} pl-9`} />
                        </div>
                      </FormField>

                      <FormField label="Profile Photo" hint="Click the avatar on the left to change">
                        <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/10">
                          <div className="w-14 h-14 rounded-full overflow-hidden border border-white/20 bg-white/5 flex items-center justify-center shrink-0">
                            {profile.photoURL ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={profile.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                              <User className="w-6 h-6 text-white/20" />
                            )}
                          </div>
                          <div className="flex-1">
                            <p className="text-xs text-white/60 font-medium mb-2">
                              {profile.photoURL ? "Photo uploaded" : "No photo added yet"}
                            </p>
                            <div className="flex gap-2">
                              <button onClick={() => fileInputRef.current?.click()}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all">
                                <ImagePlus className="w-3 h-3" /> {profile.photoURL ? "Change" : "Upload"}
                              </button>
                              {profile.photoURL && (
                                <button onClick={() => update("photoURL", "")}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all">
                                  <Trash2 className="w-3 h-3" /> Remove
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </FormField>
                    </div>
                  </Section>
                )}

                {/* ── PROFESSIONAL ─────────────────────────────────────── */}
                {tab === "professional" && (
                  <Section title="Professional Details" icon={<Briefcase className="w-5 h-5 text-purple-400" />}>
                    <div className="space-y-6">

                      <FormField label="Primary Role" required>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {(["frontend","backend","fullstack","ai","devops"] as PrimaryRole[]).map(r => (
                            <button key={r} onClick={() => update("primaryRole", r)}
                              className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all ${profile.primaryRole === r ? "bg-indigo-500/10 border-indigo-500/40 text-white" : "bg-white/5 border-white/10 text-white/50 hover:border-white/20"}`}>
                              <div className={profile.primaryRole === r ? "text-indigo-400" : "text-white/20"}>{ROLE_ICONS[r]}</div>
                              <span className="text-sm font-bold">{ROLE_LABELS[r]}</span>
                              {profile.primaryRole === r && <Check className="w-4 h-4 text-indigo-400 ml-auto" />}
                            </button>
                          ))}
                        </div>
                      </FormField>

                      <FormField label="Years of Experience">
                        <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/10">
                          <input type="range" min={0} max={20} value={profile.yearsExp}
                            onChange={e => update("yearsExp", Number(e.target.value))}
                            className="flex-1 accent-indigo-500" />
                          <span className="text-white font-black text-xl w-14 text-right">{profile.yearsExp}yr{profile.yearsExp !== 1 ? "s" : ""}</span>
                        </div>
                      </FormField>

                      <FormField label="Skills" hint="Select or add custom">
                        <div className="flex flex-wrap gap-2 mb-3">
                          {ALL_SKILLS.map(s => (
                            <button key={s} onClick={() => toggleArray("skills", s)}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border ${profile.skills.includes(s) ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-400" : "bg-white/5 border-white/10 text-white/50 hover:border-white/20"}`}>
                              {s}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <input value={customSkill} onChange={e => setCustomSkill(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && addCustomSkill()}
                            placeholder="Add custom skill…" className={`${Input()} flex-1`} />
                          <button onClick={addCustomSkill} className="px-4 py-2 bg-white/10 border border-white/20 rounded-xl text-white hover:bg-white/15 transition-colors font-bold">
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        {/* Custom skills not in the preset list */}
                        {profile.skills.filter(s => !ALL_SKILLS.includes(s)).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {profile.skills.filter(s => !ALL_SKILLS.includes(s)).map(s => (
                              <span key={s} className="flex items-center gap-1 px-2 py-1 bg-indigo-500/15 border border-indigo-500/30 rounded-md text-[10px] text-indigo-400 font-bold">
                                {s}
                                <button onClick={() => toggleArray("skills", s)}><X className="w-3 h-3" /></button>
                              </span>
                            ))}
                          </div>
                        )}
                      </FormField>

                      <FormField label="Tools Known">
                        <div className="flex flex-wrap gap-2">
                          {ALL_TOOLS.map(t => (
                            <button key={t} onClick={() => toggleArray("tools", t)}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border ${profile.tools.includes(t) ? "bg-purple-500/20 border-purple-500/40 text-purple-400" : "bg-white/5 border-white/10 text-white/50 hover:border-white/20"}`}>
                              {t}
                            </button>
                          ))}
                        </div>
                      </FormField>

                      <FormField label="Skill Verification Tier">
                        <div className="space-y-2">
                          {(["self-declared", "assessment-passed", "project-verified"] as const).map(v => {
                            const cfg = TIER_CONFIG[v];
                            return (
                              <button key={v} onClick={() => update("verificationStatus", v)}
                                className={`w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-all ${profile.verificationStatus === v ? `${cfg.bg} ${cfg.color}` : "bg-white/5 border-white/10 text-white/50 hover:border-white/20"}`}>
                                {cfg.icon}
                                <span className="text-sm font-bold">{cfg.label}</span>
                                {profile.verificationStatus === v && <Check className="w-4 h-4 ml-auto" />}
                              </button>
                            );
                          })}
                        </div>
                      </FormField>
                    </div>
                  </Section>
                )}

                {/* ── PORTFOLIO ─────────────────────────────────────────── */}
                {tab === "portfolio" && (
                  <Section title="Portfolio & Proof of Work" icon={<GitBranch className="w-5 h-5 text-emerald-400" />}>
                    <div className="space-y-4">
                      <FormField label="GitHub URL">
                        <div className="relative">
                          <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                          <input value={profile.githubUrl} onChange={e => update("githubUrl", e.target.value)}
                            placeholder="https://github.com/yourname" className={`${Input()} pl-9`} />
                        </div>
                        {profile.githubUrl && (
                          <a href={profile.githubUrl} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-[10px] text-indigo-400 hover:text-indigo-300 mt-1.5 transition-colors font-bold">
                            <ExternalLink className="w-3 h-3" /> Open link
                          </a>
                        )}
                      </FormField>

                      <FormField label="Portfolio Website">
                        <div className="relative">
                          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                          <input value={profile.portfolioUrl} onChange={e => update("portfolioUrl", e.target.value)}
                            placeholder="https://yoursite.com" className={`${Input()} pl-9`} />
                        </div>
                        {profile.portfolioUrl && (
                          <a href={profile.portfolioUrl} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-[10px] text-indigo-400 hover:text-indigo-300 mt-1.5 transition-colors font-bold">
                            <ExternalLink className="w-3 h-3" /> Open link
                          </a>
                        )}
                      </FormField>

                      <FormField label="Resume / CV URL" hint="Google Drive, Dropbox, or direct link">
                        <div className="relative">
                          <Upload className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                          <input value={profile.resumeUrl} onChange={e => update("resumeUrl", e.target.value)}
                            placeholder="https://drive.google.com/…" className={`${Input()} pl-9`} />
                        </div>
                      </FormField>

                      <FormField label="Past Project Descriptions" hint="Press Enter or click ＋ to add">
                        <div className="flex gap-2 mb-3">
                          <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)}
                            placeholder="Built a real-time app with Next.js…"
                            rows={2} className={`${Input()} flex-1 resize-none`} />
                          <button onClick={addProjectDesc}
                            className="px-4 py-2 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-xl hover:bg-emerald-500/30 transition-colors font-bold shrink-0 self-start mt-0">
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="space-y-2">
                          {profile.projectDescriptions.map((d, i) => (
                            <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                              className="flex items-start gap-3 p-3.5 bg-white/5 border border-white/10 rounded-xl group">
                              <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0 mt-0.5">
                                <span className="text-[9px] font-black text-emerald-400">{i + 1}</span>
                              </div>
                              <p className="text-xs text-white/70 flex-1 font-light leading-relaxed">{d}</p>
                              <button onClick={() => removeProjectDesc(i)}
                                className="text-white/20 hover:text-red-400 shrink-0 transition-colors opacity-0 group-hover:opacity-100">
                                <X className="w-4 h-4" />
                              </button>
                            </motion.div>
                          ))}
                          {profile.projectDescriptions.length === 0 && (
                            <p className="text-xs text-white/20 font-light italic text-center py-4">No project descriptions added yet</p>
                          )}
                        </div>
                      </FormField>
                    </div>
                  </Section>
                )}

                {/* ── AVAILABILITY ──────────────────────────────────────── */}
                {tab === "availability" && (
                  <Section title="Availability & Preferences" icon={<Clock className="w-5 h-5 text-blue-400" />}>
                    <div className="space-y-6">

                      <FormField label="Work Availability" required>
                        <div className="grid grid-cols-3 gap-3">
                          {([
                            { value: "full-time",  label: "Full-Time",  sub: "40h/week" },
                            { value: "part-time",  label: "Part-Time",  sub: "10–20h/week" },
                            { value: "freelance",  label: "Freelance",  sub: "Project basis" },
                          ] as const).map(opt => (
                            <button key={opt.value} onClick={() => update("availability", opt.value)}
                              className={`p-4 rounded-xl border text-center transition-all ${profile.availability === opt.value ? "bg-blue-500/10 border-blue-500/40 text-white" : "bg-white/5 border-white/10 text-white/50 hover:border-white/20"}`}>
                              <div className="text-sm font-bold">{opt.label}</div>
                              <div className="text-[10px] text-white/30 mt-0.5">{opt.sub}</div>
                            </button>
                          ))}
                        </div>
                      </FormField>

                      <FormField label="Expected Pay Rate (per hour)">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[9px] text-white/30 uppercase tracking-widest font-bold block mb-1">Min</label>
                            <div className="relative">
                              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                              <input type="number" min={0} value={profile.payMin}
                                onChange={e => update("payMin", Number(e.target.value))}
                                className={`${Input()} pl-9`} />
                            </div>
                          </div>
                          <div>
                            <label className="text-[9px] text-white/30 uppercase tracking-widest font-bold block mb-1">Max</label>
                            <div className="relative">
                              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                              <input type="number" min={0} value={profile.payMax}
                                onChange={e => update("payMax", Number(e.target.value))}
                                className={`${Input()} pl-9`} />
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-2 px-1">
                          <p className="text-xs text-white/30 font-light">${profile.payMin}–${profile.payMax} per hour</p>
                          <select value={profile.payCurrency}
                            onChange={e => update("payCurrency", e.target.value)}
                            className="bg-transparent text-white/40 text-xs font-bold border-none outline-none cursor-pointer">
                            {["USD","EUR","GBP","INR","AUD","CAD"].map(c => <option key={c} value={c} className="bg-black">{c}</option>)}
                          </select>
                        </div>
                      </FormField>

                      <FormField label="Preferred Project Types" hint="Select all that interest you">
                        <div className="flex flex-wrap gap-2">
                          {PROJECT_TYPES.map(t => (
                            <button key={t} onClick={() => toggleArray("preferredTypes", t)}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border ${profile.preferredTypes.includes(t) ? "bg-blue-500/20 border-blue-500/40 text-blue-400" : "bg-white/5 border-white/10 text-white/50 hover:border-white/20"}`}>
                              {t}
                            </button>
                          ))}
                        </div>
                      </FormField>

                      <FormField label="Profile Status">
                        <div className="grid grid-cols-2 gap-3">
                          {([
                            { value: "active",   label: "Active",    desc: "Open to new projects",   color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
                            { value: "inactive", label: "Inactive",  desc: "Not available right now", color: "text-white/40 bg-white/5 border-white/10" },
                          ] as const).map(opt => (
                            <button key={opt.value} onClick={() => update("profileStatus", opt.value)}
                              className={`p-3 rounded-xl border text-left transition-all ${profile.profileStatus === opt.value ? opt.color : "bg-white/5 border-white/10 text-white/30 hover:border-white/20"}`}>
                              <div className="flex items-center gap-2 mb-0.5">
                                <div className={`w-2 h-2 rounded-full ${opt.value === "active" ? "bg-emerald-400 animate-pulse" : "bg-white/20"}`} />
                                <span className="text-xs font-bold">{opt.label}</span>
                              </div>
                              <p className="text-[10px] text-white/30 font-light">{opt.desc}</p>
                            </button>
                          ))}
                        </div>
                      </FormField>
                    </div>
                  </Section>
                )}

              </motion.div>
            </AnimatePresence>

            {/* Bottom save status */}
            <div className="flex items-center justify-between pt-4 border-t border-white/5 text-xs text-white/30">
              <span className="flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3" /> Auto-saved to Firebase in real-time
              </span>
              {saveState === "saved" && (
                <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" /> All changes saved
                </span>
              )}
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-5">
      <div className="flex items-center gap-3 pb-4 border-b border-white/5">
        <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">{icon}</div>
        <h2 className="text-white font-black tracking-tight">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function FormField({ label, children, hint, required }: { label: string; children: React.ReactNode; hint?: string; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black uppercase tracking-widest text-white/50 flex items-center gap-1">
        {label} {required && <span className="text-red-400">*</span>}
        {hint && <span className="text-white/20 font-normal normal-case tracking-normal ml-1">· {hint}</span>}
      </label>
      {children}
    </div>
  );
}
