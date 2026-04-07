"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, Phone, MapPin, Briefcase, Code2, GitBranch,
  Link2, Upload, Award, Clock, DollarSign, CheckCircle2,
  ChevronRight, ChevronLeft, Loader2, Plus, X, Shield,
  Sparkles, Terminal, Layers, Zap, Star, AlertCircle, Check,
  Camera, ImagePlus, Trash2,
} from "lucide-react";
import { useStore } from "@/store/useStore";
import { saveDeveloperProfile, type PrimaryRole, type Availability } from "@/lib/developerProfile";
import { logAction } from "@/lib/auditLog";
import { DeveloperFlowBreadcrumb } from "@/components/FlowNavigation";

// ── Constants ──────────────────────────────────────────────────────────────────
const STEPS = [
  { num: 1, label: "Basic Info",         icon: <User className="w-4 h-4" /> },
  { num: 2, label: "Professional",       icon: <Briefcase className="w-4 h-4" /> },
  { num: 3, label: "Portfolio",          icon: <GitBranch className="w-4 h-4" /> },
  { num: 4, label: "Skill Verify",       icon: <Shield className="w-4 h-4" /> },
  { num: 5, label: "Availability",       icon: <Clock className="w-4 h-4" /> },
  { num: 6, label: "Submit",             icon: <CheckCircle2 className="w-4 h-4" /> },
];

const SKILL_OPTIONS = [
  "React", "Next.js", "Vue", "Angular", "Svelte", "TypeScript", "JavaScript",
  "Node.js", "Python", "Go", "Rust", "Java", "C#", "PHP", "Ruby",
  "PostgreSQL", "MySQL", "MongoDB", "Redis", "Supabase", "Firebase",
  "AWS", "GCP", "Azure", "Docker", "Kubernetes", "Terraform",
  "TensorFlow", "PyTorch", "Langchain", "LLM APIs", "GraphQL", "REST",
  "Git", "CI/CD", "Linux", "Nginx", "WebSockets", "Stripe API",
];

const TOOL_OPTIONS = [
  "VS Code", "Cursor", "Figma", "Postman", "Jira", "GitHub", "GitLab",
  "Vercel", "Netlify", "Heroku", "PlanetScale", "Neon", "Prisma",
  "Drizzle ORM", "TanStack Query", "Zustand", "Redux", "Tailwind CSS",
  "Framer Motion", "shadcn/ui", "Ant Design", "Material UI",
];

const PROJECT_TYPES = [
  "SaaS Products", "E-Commerce", "FinTech", "HealthTech", "EdTech",
  "Social Platforms", "AI/ML Projects", "API Development", "Mobile Apps",
  "DevOps/Infrastructure", "Data Pipelines", "Security Systems",
];

const ROLE_OPTIONS: { value: PrimaryRole; label: string; desc: string; icon: React.ReactNode }[] = [
  { value: "frontend",  label: "Frontend Dev",   desc: "UI, components, animations",    icon: <Layers className="w-5 h-5" /> },
  { value: "backend",   label: "Backend Dev",    desc: "APIs, databases, server logic",  icon: <Terminal className="w-5 h-5" /> },
  { value: "fullstack", label: "Full Stack",     desc: "End-to-end across the stack",    icon: <Code2 className="w-5 h-5" /> },
  { value: "ai",        label: "AI / ML Eng",   desc: "Models, RAG, fine-tuning",       icon: <Sparkles className="w-5 h-5" /> },
  { value: "devops",    label: "DevOps / Cloud", desc: "CI/CD, infra, deployments",      icon: <Zap className="w-5 h-5" /> },
];

// ── Form State ────────────────────────────────────────────────────────────────
interface FormData {
  // Step 1
  fullName: string; phone: string; location: string; photoURL: string;
  // Step 2
  primaryRole: PrimaryRole; yearsExp: number; skills: string[]; tools: string[]; customSkill: string;
  // Step 3
  githubUrl: string; portfolioUrl: string; resumeUrl: string;
  projectDescriptions: string[]; currentDesc: string;
  // Step 4
  verificationChoice: "self-declared" | "take-assessment";
  // Step 5
  availability: Availability; payMin: number; payMax: number; payCurrency: string; preferredTypes: string[];
}

const INITIAL_FORM: FormData = {
  fullName: "", phone: "", location: "", photoURL: "",
  primaryRole: "fullstack", yearsExp: 1,
  skills: [], tools: [], customSkill: "",
  githubUrl: "", portfolioUrl: "", resumeUrl: "",
  projectDescriptions: [], currentDesc: "",
  verificationChoice: "self-declared",
  availability: "full-time", payMin: 50, payMax: 120, payCurrency: "USD", preferredTypes: [],
};

// ── Inner component (uses useSearchParams) ────────────────────────────────────
function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialStep = Math.min(6, Math.max(1, Number(searchParams.get("step") ?? "1")));

  const { currentUser, setDeveloperProfile, patchDeveloperProfile, setDevRegistrationStep, addUserRole, developerProfile } = useStore();
  const [step, setStep] = useState(initialStep);
  const [form, setForm] = useState<FormData>({
    ...INITIAL_FORM,
    fullName: currentUser?.displayName ?? "",
    // Pre-fill from existing profile if resuming
    ...(developerProfile ? {
      fullName: developerProfile.fullName || currentUser?.displayName || "",
      phone: developerProfile.phone || "",
      location: developerProfile.location || "",
      primaryRole: developerProfile.primaryRole || "fullstack",
      yearsExp: developerProfile.yearsExp || 1,
      skills: developerProfile.skills || [],
      tools: developerProfile.tools || [],
      githubUrl: developerProfile.githubUrl || "",
      portfolioUrl: developerProfile.portfolioUrl || "",
      resumeUrl: developerProfile.resumeUrl || "",
      projectDescriptions: developerProfile.projectDescriptions || [],
      availability: developerProfile.availability || "full-time",
      payMin: developerProfile.payMin || 50,
      payMax: developerProfile.payMax || 120,
      preferredTypes: developerProfile.preferredTypes || [],
    } : {}),
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(developerProfile?.photoURL ?? "");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Photo upload handler ──────────────────────────────────────────────────
  function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    // Compress to max 300×300 via canvas before storing as base64
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
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        setPhotoPreview(dataUrl);
        set_("photoURL", dataUrl);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    // Reset the input so the same file can be re-selected if needed
    e.target.value = "";
  }

  function clearPhoto() {
    setPhotoPreview("");
    set_("photoURL", "");
  }

  function set_<K extends keyof FormData>(key: K, val: FormData[K]) {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => { const n = { ...e }; delete n[key]; return n; });
  }

  function toggleMulti(key: "skills" | "tools" | "preferredTypes", val: string) {
    setForm(f => {
      const arr = f[key] as string[];
      return { ...f, [key]: arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val] };
    });
  }

  function addCustomSkill() {
    const s = form.customSkill.trim();
    if (s && !form.skills.includes(s)) {
      setForm(f => ({ ...f, skills: [...f.skills, s], customSkill: "" }));
    }
  }

  function addProjectDesc() {
    const d = form.currentDesc.trim();
    if (d && !form.projectDescriptions.includes(d)) {
      setForm(f => ({ ...f, projectDescriptions: [...f.projectDescriptions, d], currentDesc: "" }));
    }
  }

  // ── Validation ───────────────────────────────────────────────────────────────
  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (step === 1) {
      if (!form.fullName.trim()) errs.fullName = "Full name is required";
      if (!form.phone.trim()) errs.phone = "Phone number is required";
      if (!form.location.trim()) errs.location = "Location is required";
    }
    if (step === 2) {
      if (form.skills.length === 0) errs.skills = "Add at least one skill";
    }
    if (step === 3) {
      if (!form.githubUrl.trim() && !form.portfolioUrl.trim()) {
        errs.githubUrl = "Provide at least a GitHub or portfolio URL";
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // ── Save step to Firestore & Zustand ─────────────────────────────────────────
  async function saveStep(currentStep: number) {
    const uid = currentUser?.uid ?? "";
    const stepData = buildStepData(currentStep);
    patchDeveloperProfile({ ...stepData, completedStep: currentStep });
    setDevRegistrationStep(currentStep);
    await saveDeveloperProfile(uid, { ...stepData, completedStep: currentStep });
  }

  function buildStepData(s: number): Partial<import("@/lib/developerProfile").DeveloperProfile> {
    if (s === 1) return { fullName: form.fullName, phone: form.phone, location: form.location, photoURL: form.photoURL, email: currentUser?.email ?? "" };
    if (s === 2) return { primaryRole: form.primaryRole, yearsExp: form.yearsExp, skills: form.skills, tools: form.tools };
    if (s === 3) return { githubUrl: form.githubUrl, portfolioUrl: form.portfolioUrl, resumeUrl: form.resumeUrl, projectDescriptions: form.projectDescriptions };
    if (s === 4) return { verificationStatus: form.verificationChoice === "self-declared" ? "self-declared" : "self-declared" };
    if (s === 5) return { availability: form.availability, payMin: form.payMin, payMax: form.payMax, payCurrency: form.payCurrency, preferredTypes: form.preferredTypes };
    return {};
  }

  // ── Navigation ───────────────────────────────────────────────────────────────
  async function handleNext() {
    if (!validate()) return;
    setSaving(true);
    await saveStep(step);
    setSaving(false);
    if (step < 6) setStep(s => s + 1);
  }

  function handleBack() { if (step > 1) setStep(s => s - 1); }

  // ── Final submission ─────────────────────────────────────────────────────────
  async function handleSubmit() {
    setSaving(true);
    const uid = currentUser?.uid ?? "demo-guest";
    const finalProfile: Partial<import("@/lib/developerProfile").DeveloperProfile> = {
      userId: uid,
      email: currentUser?.email ?? "",
      fullName: form.fullName,
      phone: form.phone,
      location: form.location,
      photoURL: form.photoURL,
      primaryRole: form.primaryRole,
      yearsExp: form.yearsExp,
      skills: form.skills,
      tools: form.tools,
      githubUrl: form.githubUrl,
      portfolioUrl: form.portfolioUrl,
      resumeUrl: form.resumeUrl,
      projectDescriptions: form.projectDescriptions,
      verificationStatus: "self-declared",
      availability: form.availability,
      payMin: form.payMin,
      payMax: form.payMax,
      payCurrency: form.payCurrency,
      preferredTypes: form.preferredTypes,
      profileStatus: "active",
      completedStep: 6,
      registrationDone: true,
    };
    setDeveloperProfile(finalProfile as import("@/lib/developerProfile").DeveloperProfile);
    addUserRole("developer");
    await saveDeveloperProfile(uid, finalProfile);
    await logAction(uid, "project.created", { type: "developer_profile", role: form.primaryRole });
    setSaving(false);
    setDone(true);
    setTimeout(() => router.push("/employee-dashboard"), 2000);
  }

  const progress = ((step - 1) / 5) * 100;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-indigo-500/[0.03] rounded-full blur-[150px]" />
        <div className="absolute bottom-0 left-1/4 w-[500px] h-[500px] bg-blue-500/[0.03] rounded-full blur-[150px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 glass-panel border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Live avatar preview in header */}
          <div className="w-8 h-8 rounded-full border border-white/10 overflow-hidden bg-white/5 flex items-center justify-center shrink-0">
            {photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoPreview} alt="You" className="w-full h-full object-cover" />
            ) : (
              <Code2 className="w-4 h-4 text-white/40" />
            )}
          </div>
          <span className="text-white font-black tracking-tight">
            {form.fullName || "Developer Registration"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-40 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs text-white/40 font-bold">{step}/6</span>
        </div>
      </header>

      <DeveloperFlowBreadcrumb />

      {/* Step nav */}
      <div className="border-b border-white/5 px-6 py-3 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {STEPS.map((s, i) => (
            <div key={s.num} className="flex items-center gap-1">
              <button
                onClick={() => s.num < step && setStep(s.num)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${step === s.num ? "bg-indigo-500/20 border border-indigo-500/40 text-indigo-400" : s.num < step ? "text-emerald-400 cursor-pointer hover:bg-white/5" : "text-white/20 cursor-not-allowed"}`}>
                {s.num < step ? <CheckCircle2 className="w-3.5 h-3.5" /> : s.icon}
                {s.label}
              </button>
              {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-white/10 shrink-0" />}
            </div>
          ))}
        </div>
      </div>

      {/* Main form */}
      <main className="flex-1 flex items-start justify-center px-6 py-10">
        <div className="w-full max-w-2xl">
          <AnimatePresence mode="wait">
            {done ? (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="text-center space-y-6 py-20">
                {/* Avatar with success ring */}
                <div className="relative mx-auto w-28 h-28">
                  <div className="w-28 h-28 rounded-full border-4 border-emerald-500 overflow-hidden bg-white/5 flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.3)]">
                    {photoPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photoPreview} alt={form.fullName} className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-12 h-12 text-white/30" />
                    )}
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-9 h-9 bg-emerald-500 rounded-full border-4 border-black flex items-center justify-center shadow-lg">
                    <CheckCircle2 className="w-5 h-5 text-white" />
                  </div>
                </div>
                <div>
                  <h2 className="text-4xl font-black text-white tracking-tighter">
                    Welcome, {form.fullName.split(" ")[0] || "Developer"}!
                  </h2>
                  <p className="text-emerald-400 text-sm font-bold uppercase tracking-widest mt-1">Profile Created</p>
                  <p className="text-[#888] mt-2 font-light">Matching you with projects now… Redirecting to dashboard.</p>
                </div>
                <div className="flex gap-2 justify-center">
                  {[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: `${i*150}ms` }} />)}
                </div>
              </motion.div>
            ) : (

              <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                className="space-y-8">

                {/* ── STEP 1: Basic Info ──────────────────────────────────── */}
                {step === 1 && (
                  <div className="space-y-6">
                    <StepHeader icon={<User className="w-6 h-6 text-indigo-400" />} title="Basic Information" desc="Tell us who you are so employers can find you." />

                    {/* ── Profile Picture Upload ─────────────────────────── */}
                    <div className="flex flex-col items-center gap-3">
                      <p className="self-start text-[10px] font-black uppercase tracking-widest text-white/50">
                        Profile Picture <span className="text-white/20 font-normal normal-case tracking-normal">· optional but recommended</span>
                      </p>

                      <div className="relative group">
                        {/* Avatar circle */}
                        <div className={`w-28 h-28 rounded-full border-2 flex items-center justify-center overflow-hidden transition-all duration-300 ${photoPreview ? "border-indigo-500/60 shadow-[0_0_30px_rgba(99,102,241,0.25)]" : "border-white/10 border-dashed bg-white/5"}`}>
                          {photoPreview ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={photoPreview} alt="Profile" className="w-full h-full object-cover" />
                          ) : (
                            <div className="flex flex-col items-center gap-1.5 text-white/20">
                              <Camera className="w-8 h-8" />
                              <span className="text-[9px] font-bold uppercase tracking-widest">Photo</span>
                            </div>
                          )}
                        </div>

                        {/* Hover overlay — click to upload */}
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                          title="Upload photo">
                          <Camera className="w-6 h-6 text-white" />
                        </button>

                        {/* Remove badge */}
                        {photoPreview && (
                          <button
                            type="button"
                            onClick={clearPhoto}
                            title="Remove photo"
                            className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center shadow-lg transition-colors z-10">
                            <X className="w-3 h-3 text-white" />
                          </button>
                        )}
                      </div>

                      {/* Upload / remove buttons */}
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex items-center gap-2 px-4 py-2 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20 rounded-xl text-xs font-bold uppercase tracking-widest transition-all">
                          <ImagePlus className="w-3.5 h-3.5" />
                          {photoPreview ? "Change Photo" : "Upload Photo"}
                        </button>
                        {photoPreview && (
                          <button
                            type="button"
                            onClick={clearPhoto}
                            className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 rounded-xl text-xs font-bold uppercase tracking-widest transition-all">
                            <Trash2 className="w-3.5 h-3.5" /> Remove
                          </button>
                        )}
                      </div>

                      <p className="text-[10px] text-white/25 font-light text-center max-w-xs">
                        JPG, PNG or WEBP · Max 5 MB · Resized to 300×300 automatically
                      </p>

                      {/* Hidden file input */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={handlePhotoFile}
                        className="hidden"
                      />
                    </div>

                    {/* Divider */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px bg-white/5" />
                      <span className="text-[10px] text-white/20 uppercase tracking-widest font-bold">Personal Details</span>
                      <div className="flex-1 h-px bg-white/5" />
                    </div>

                    <div className="space-y-4">
                      <Field label="Full Name" error={errors.fullName} required>
                        <input value={form.fullName} onChange={e => set_("fullName", e.target.value)}
                          placeholder="Alex Johnson" className={Input(errors.fullName)} />
                      </Field>
                      <Field label="Email" hint="Auto-filled from your account">
                        <input value={currentUser?.email ?? ""} disabled className={`${Input()} opacity-40 cursor-not-allowed`} />
                      </Field>
                      <Field label="Phone Number" error={errors.phone} required>
                        <input value={form.phone} onChange={e => set_("phone", e.target.value)}
                          placeholder="+1 (555) 000-0000" className={Input(errors.phone)} />
                      </Field>
                      <Field label="Location" error={errors.location} required hint="City, Country">
                        <div className="relative">
                          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                          <input value={form.location} onChange={e => set_("location", e.target.value)}
                            placeholder="San Francisco, USA" className={`${Input(errors.location)} pl-9`} />
                        </div>
                      </Field>
                    </div>
                  </div>
                )}

                {/* ── STEP 2: Professional ───────────────────────────────── */}
                {step === 2 && (
                  <div className="space-y-6">
                    <StepHeader icon={<Briefcase className="w-6 h-6 text-purple-400" />} title="Professional Details" desc="Help us understand your expertise and match you to the right projects." />

                    <Field label="Primary Role" required>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                        {ROLE_OPTIONS.map(r => (
                          <button key={r.value} onClick={() => set_("primaryRole", r.value)}
                            className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all ${form.primaryRole === r.value ? "bg-indigo-500/10 border-indigo-500/40 text-white" : "bg-white/5 border-white/10 text-white/60 hover:border-white/20"}`}>
                            <div className={`${form.primaryRole === r.value ? "text-indigo-400" : "text-white/30"}`}>{r.icon}</div>
                            <div>
                              <div className="text-sm font-bold">{r.label}</div>
                              <div className="text-[10px] text-white/40">{r.desc}</div>
                            </div>
                            {form.primaryRole === r.value && <Check className="w-4 h-4 text-indigo-400 ml-auto" />}
                          </button>
                        ))}
                      </div>
                    </Field>

                    <Field label="Years of Experience" required>
                      <div className="flex items-center gap-4">
                        <input type="range" min={0} max={20} value={form.yearsExp} onChange={e => set_("yearsExp", Number(e.target.value))}
                          className="flex-1 accent-indigo-500" />
                        <span className="text-white font-black text-xl w-14 text-center">{form.yearsExp}yr{form.yearsExp !== 1 ? "s" : ""}</span>
                      </div>
                    </Field>

                    <Field label="Skills" error={errors.skills} required hint="Select all that apply">
                      <div className="flex flex-wrap gap-2 mb-3">
                        {SKILL_OPTIONS.map(s => (
                          <button key={s} onClick={() => toggleMulti("skills", s)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border ${form.skills.includes(s) ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-400" : "bg-white/5 border-white/10 text-white/50 hover:border-white/20"}`}>
                            {s}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input value={form.customSkill} onChange={e => set_("customSkill", e.target.value)}
                          onKeyDown={e => e.key === "Enter" && addCustomSkill()}
                          placeholder="Add custom skill…" className={`${Input()} flex-1 text-sm`} />
                        <button onClick={addCustomSkill} className="px-4 py-2 bg-white/10 border border-white/20 rounded-xl text-white hover:bg-white/15 transition-colors text-sm font-bold">
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      {form.skills.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {form.skills.map(s => (
                            <span key={s} className="flex items-center gap-1 px-2 py-1 bg-indigo-500/15 border border-indigo-500/30 rounded-md text-[10px] text-indigo-400 font-bold">
                              {s} <button onClick={() => toggleMulti("skills", s)}><X className="w-3 h-3" /></button>
                            </span>
                          ))}
                        </div>
                      )}
                    </Field>

                    <Field label="Tools Known" hint="IDEs, platforms, services you use">
                      <div className="flex flex-wrap gap-2">
                        {TOOL_OPTIONS.map(t => (
                          <button key={t} onClick={() => toggleMulti("tools", t)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border ${form.tools.includes(t) ? "bg-purple-500/20 border-purple-500/40 text-purple-400" : "bg-white/5 border-white/10 text-white/50 hover:border-white/20"}`}>
                            {t}
                          </button>
                        ))}
                      </div>
                    </Field>
                  </div>
                )}

                {/* ── STEP 3: Portfolio ──────────────────────────────────── */}
                {step === 3 && (
                  <div className="space-y-6">
                    <StepHeader icon={<GitBranch className="w-6 h-6 text-emerald-400" />} title="Portfolio & Proof of Work" desc="Show employers what you've built. At least one link is required." />
                    <div className="space-y-4">
                      <Field label="GitHub URL" error={errors.githubUrl}>
                        <div className="relative">
                          <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                          <input value={form.githubUrl} onChange={e => set_("githubUrl", e.target.value)}
                            placeholder="https://github.com/yourname" className={`${Input(errors.githubUrl)} pl-9`} />
                        </div>
                      </Field>
                      <Field label="Portfolio Website">
                        <div className="relative">
                          <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                          <input value={form.portfolioUrl} onChange={e => set_("portfolioUrl", e.target.value)}
                            placeholder="https://yoursite.com" className={`${Input()} pl-9`} />
                        </div>
                      </Field>
                      <Field label="Resume / CV URL" hint="Google Drive, Dropbox, or any direct link">
                        <div className="relative">
                          <Upload className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                          <input value={form.resumeUrl} onChange={e => set_("resumeUrl", e.target.value)}
                            placeholder="https://drive.google.com/..." className={`${Input()} pl-9`} />
                        </div>
                      </Field>

                      <Field label="Past Project Descriptions" hint="Describe 1–3 projects you've built. Press Enter or click Add.">
                        <div className="flex gap-2 mb-2">
                          <textarea value={form.currentDesc} onChange={e => set_("currentDesc", e.target.value)}
                            placeholder="Built a real-time chat app using Next.js and Supabase with 500+ daily users…"
                            rows={2} className={`${Input()} flex-1 resize-none`} />
                          <button onClick={addProjectDesc} className="px-4 py-2 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-xl hover:bg-emerald-500/30 transition-colors font-bold shrink-0">
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        {form.projectDescriptions.map((d, i) => (
                          <div key={i} className="flex items-start gap-2 p-3 bg-white/5 border border-white/10 rounded-xl mb-1">
                            <p className="text-xs text-white/70 flex-1 font-light">{d}</p>
                            <button onClick={() => setForm(f => ({ ...f, projectDescriptions: f.projectDescriptions.filter((_, j) => j !== i) }))} className="text-white/30 hover:text-red-400 shrink-0 transition-colors">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </Field>
                    </div>
                  </div>
                )}

                {/* ── STEP 4: Skill Verification ─────────────────────────── */}
                {step === 4 && (
                  <div className="space-y-6">
                    <StepHeader icon={<Award className="w-6 h-6 text-yellow-400" />} title="Skill Verification" desc="Verified skills unlock higher-tier projects and better matches. Verification is optional but recommended." />

                    <div className="grid grid-cols-1 gap-4">
                      {([
                        {
                          value: "self-declared",
                          label: "Self-Declared (Tier 1)",
                          desc: "List your skills without a test. Faster to set up, but lower trust score. Employers can see your portfolio to assess quality.",
                          icon: <User className="w-6 h-6 text-white/40" />,
                          badge: "text-white/40 bg-white/5 border-white/10",
                          recommended: false,
                        },
                        {
                          value: "take-assessment",
                          label: "Take Assessment (Tier 2)",
                          desc: "Complete a 20–45 min skill test in your primary role. Pass and get a verified badge. Unlocks 3× more project matches.",
                          icon: <Award className="w-6 h-6 text-yellow-400" />,
                          badge: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
                          recommended: true,
                        },
                      ] as const).map(opt => (
                        <button key={opt.value} onClick={() => set_("verificationChoice", opt.value)}
                          className={`p-5 rounded-2xl border text-left transition-all ${form.verificationChoice === opt.value ? "glass-panel border-indigo-500/40 bg-indigo-500/5" : "bg-white/5 border-white/10 hover:border-white/20"}`}>
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              {opt.icon}
                              <div>
                                <div className="text-white font-bold text-sm">{opt.label}</div>
                                {opt.recommended && <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${opt.badge}`}>Recommended</span>}
                              </div>
                            </div>
                            {form.verificationChoice === opt.value && <Check className="w-5 h-5 text-indigo-400 shrink-0" />}
                          </div>
                          <p className="text-xs text-white/50 font-light leading-relaxed">{opt.desc}</p>
                        </button>
                      ))}
                    </div>

                    <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-3">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-white/40">Tier Progression</h3>
                      {[
                        { tier: "Tier 1", label: "Self-Reported",     color: "text-white/40 bg-white/5 border-white/10",           perk: "Basic project access" },
                        { tier: "Tier 2", label: "Assessment-Passed", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20", perk: "3× project matches + verified badge" },
                        { tier: "Tier 3", label: "Project-Verified",  color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", perk: "Top match priority + reputation score" },
                      ].map(t => (
                        <div key={t.tier} className="flex items-center gap-3 text-xs">
                          <span className={`px-2 py-0.5 rounded-full border font-bold text-[9px] uppercase tracking-widest ${t.color}`}>{t.tier}</span>
                          <span className={`font-bold ${t.color.split(" ")[0]}`}>{t.label}</span>
                          <span className="text-white/30 ml-auto">{t.perk}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── STEP 5: Availability ───────────────────────────────── */}
                {step === 5 && (
                  <div className="space-y-6">
                    <StepHeader icon={<Clock className="w-6 h-6 text-blue-400" />} title="Availability & Preferences" desc="Tell employers when you're available and what you're looking for." />

                    <Field label="Work Availability" required>
                      <div className="grid grid-cols-3 gap-3">
                        {([
                          { value: "full-time",  label: "Full-Time",  desc: "40h/week" },
                          { value: "part-time",  label: "Part-Time",  desc: "10–20h/week" },
                          { value: "freelance",  label: "Freelance",  desc: "Project basis" },
                        ] as const).map(opt => (
                          <button key={opt.value} onClick={() => set_("availability", opt.value)}
                            className={`p-4 rounded-xl border text-center transition-all ${form.availability === opt.value ? "bg-blue-500/10 border-blue-500/40 text-white" : "bg-white/5 border-white/10 text-white/50 hover:border-white/20"}`}>
                            <div className="text-sm font-bold">{opt.label}</div>
                            <div className="text-[10px] text-white/40">{opt.desc}</div>
                          </button>
                        ))}
                      </div>
                    </Field>

                    <Field label="Expected Pay Rate (per hour)" hint="Employers will see this range">
                      <div className="grid grid-cols-3 gap-3 items-center">
                        <div>
                          <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-1 block">Min</label>
                          <div className="relative">
                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                            <input type="number" value={form.payMin} onChange={e => set_("payMin", Number(e.target.value))}
                              className={`${Input()} pl-9`} min={0} />
                          </div>
                        </div>
                        <div className="text-center text-white/30 text-sm mt-4">to</div>
                        <div>
                          <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-1 block">Max</label>
                          <div className="relative">
                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                            <input type="number" value={form.payMax} onChange={e => set_("payMax", Number(e.target.value))}
                              className={`${Input()} pl-9`} min={0} />
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-white/30 font-light">${form.payMin}–${form.payMax}/hr · {form.payCurrency}</div>
                    </Field>

                    <Field label="Preferred Project Types" hint="Select all that interest you">
                      <div className="flex flex-wrap gap-2">
                        {PROJECT_TYPES.map(t => (
                          <button key={t} onClick={() => toggleMulti("preferredTypes", t)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border ${form.preferredTypes.includes(t) ? "bg-blue-500/20 border-blue-500/40 text-blue-400" : "bg-white/5 border-white/10 text-white/50 hover:border-white/20"}`}>
                            {t}
                          </button>
                        ))}
                      </div>
                    </Field>
                  </div>
                )}

                {/* ── STEP 6: Review & Submit ────────────────────────────── */}
                {step === 6 && (
                  <div className="space-y-6">
                    <StepHeader icon={<CheckCircle2 className="w-6 h-6 text-emerald-400" />} title="Review & Submit" desc="Review your developer profile before submitting. You can edit any section after." />

                    {/* ── Profile identity card ──────────────────────────── */}
                    <div className="glass-panel p-5 rounded-2xl border border-white/10">
                      <div className="flex items-center gap-4">
                        {/* Avatar */}
                        <div className="relative shrink-0">
                          <div className="w-20 h-20 rounded-full border-2 border-indigo-500/40 overflow-hidden bg-white/5 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                            {photoPreview ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={photoPreview} alt={form.fullName} className="w-full h-full object-cover" />
                            ) : (
                              <User className="w-8 h-8 text-white/20" />
                            )}
                          </div>
                          {/* Tier badge */}
                          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-indigo-500 border-2 border-black flex items-center justify-center">
                            <Star className="w-3 h-3 text-white fill-white" />
                          </div>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-white font-black text-lg tracking-tight truncate">{form.fullName || "Your Name"}</h3>
                          <p className="text-indigo-400 text-xs font-bold uppercase tracking-widest mt-0.5">
                            {ROLE_OPTIONS.find(r => r.value === form.primaryRole)?.label ?? "Developer"}
                          </p>
                          <p className="text-white/40 text-xs mt-1 flex items-center gap-1.5">
                            <MapPin className="w-3 h-3" /> {form.location || "—"}
                          </p>
                        </div>

                        {/* Edit avatar button */}
                        <button onClick={() => setStep(1)}
                          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[10px] text-white/40 hover:text-indigo-400 hover:border-indigo-500/30 transition-all font-bold uppercase tracking-widest">
                          <Camera className="w-3 h-3" /> Edit
                        </button>
                      </div>

                      {/* Skills preview */}
                      {form.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-white/5">
                          {form.skills.slice(0, 6).map(s => (
                            <span key={s} className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-md text-[9px] font-bold uppercase tracking-widest">{s}</span>
                          ))}
                          {form.skills.length > 6 && (
                            <span className="px-2 py-0.5 bg-white/5 border border-white/10 text-white/30 rounded-md text-[9px] font-bold">+{form.skills.length - 6} more</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <ReviewSection title="Basic Info" onEdit={() => setStep(1)}>
                        <ReviewRow label="Photo" value={photoPreview ? "✓ Uploaded" : "Not added"} />
                        <ReviewRow label="Name" value={form.fullName} />
                        <ReviewRow label="Phone" value={form.phone} />
                        <ReviewRow label="Location" value={form.location} />
                      </ReviewSection>

                      <ReviewSection title="Professional" onEdit={() => setStep(2)}>
                        <ReviewRow label="Role" value={ROLE_OPTIONS.find(r => r.value === form.primaryRole)?.label ?? ""} />
                        <ReviewRow label="Experience" value={`${form.yearsExp} year${form.yearsExp !== 1 ? "s" : ""}`} />
                        <ReviewRow label="Skills" value={form.skills.slice(0, 5).join(", ") + (form.skills.length > 5 ? ` +${form.skills.length - 5} more` : "")} />
                      </ReviewSection>

                      <ReviewSection title="Portfolio" onEdit={() => setStep(3)}>
                        <ReviewRow label="GitHub" value={form.githubUrl || "—"} />
                        <ReviewRow label="Portfolio" value={form.portfolioUrl || "—"} />
                        <ReviewRow label="Projects" value={`${form.projectDescriptions.length} description${form.projectDescriptions.length !== 1 ? "s" : ""}`} />
                      </ReviewSection>

                      <ReviewSection title="Availability" onEdit={() => setStep(5)}>
                        <ReviewRow label="Type" value={form.availability} />
                        <ReviewRow label="Rate" value={`$${form.payMin}–$${form.payMax}/hr`} />
                        <ReviewRow label="Prefers" value={form.preferredTypes.slice(0, 3).join(", ") || "Any"} />
                      </ReviewSection>
                    </div>

                    <div className="p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl flex items-start gap-3">
                      <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-white/60 font-light leading-relaxed">
                        After submitting, our matching engine will analyze your skills and immediately surface compatible projects. You can update your profile at any time from your dashboard.
                      </p>
                    </div>

                    <button onClick={handleSubmit} disabled={saving}
                      className="w-full py-4 silver-gradient text-black font-black uppercase tracking-widest text-sm rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50">
                      {saving ? <><Loader2 className="w-5 h-5 animate-spin" /> Saving Profile…</> : <><CheckCircle2 className="w-5 h-5" /> Submit Developer Profile</>}
                    </button>
                  </div>
                )}

                {/* ── Navigation buttons (steps 1–5) ──────────────────────── */}
                {step < 6 && (
                  <div className="flex gap-3 pt-4 border-t border-white/5">
                    {step > 1 && (
                      <button onClick={handleBack} className="flex items-center gap-2 px-5 py-3 border border-white/10 text-white/60 hover:text-white hover:border-white/20 font-bold text-xs uppercase tracking-widest rounded-xl transition-all">
                        <ChevronLeft className="w-4 h-4" /> Back
                      </button>
                    )}
                    <button onClick={handleNext} disabled={saving}
                      className="flex-1 py-3 silver-gradient text-black font-black uppercase tracking-widest text-xs rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
                      {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <>Save & Continue <ChevronRight className="w-4 h-4" /></>}
                    </button>
                  </div>
                )}

                {/* Errors summary */}
                {Object.keys(errors).length > 0 && (
                  <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl flex items-start gap-3">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      {Object.values(errors).map((e, i) => <p key={i} className="text-xs text-red-400 font-light">{e}</p>)}
                    </div>
                  </div>
                )}

              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StepHeader({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-4 pb-4 border-b border-white/5">
      <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">{icon}</div>
      <div>
        <h2 className="text-2xl font-black text-white tracking-tighter">{title}</h2>
        <p className="text-[#888] text-sm font-light mt-1">{desc}</p>
      </div>
    </div>
  );
}

function Field({ label, children, error, hint, required }: { label: string; children: React.ReactNode; error?: string; hint?: string; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black uppercase tracking-widest text-white/50 flex items-center gap-1">
        {label} {required && <span className="text-red-400">*</span>}
        {hint && <span className="text-white/20 font-normal normal-case tracking-normal ml-1">· {hint}</span>}
      </label>
      {children}
      {error && <p className="text-[10px] text-red-400 font-light flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
    </div>
  );
}

function Input(err?: string) {
  return `w-full bg-white/5 border ${err ? "border-red-500/50 focus:border-red-500" : "border-white/10 focus:border-indigo-500/50"} rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none transition-colors`;
}

function ReviewSection({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="glass-panel p-5 rounded-2xl border border-white/10">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-white/50">{title}</h3>
        <button onClick={onEdit} className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-widest transition-colors">Edit</button>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-white/5 last:border-0">
      <span className="text-xs text-white/40">{label}</span>
      <span className="text-xs text-white font-medium max-w-[60%] text-right">{value}</span>
    </div>
  );
}

// ── Page wrapper (Suspense for useSearchParams) ────────────────────────────────
export default function DeveloperRegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white/30 animate-spin" />
      </div>
    }>
      <RegisterForm />
    </Suspense>
  );
}
