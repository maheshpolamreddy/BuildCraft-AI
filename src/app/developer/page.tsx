"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Code2, Loader2, UserCheck, ShieldCheck, ArrowRight,
  Briefcase, ChevronRight, Sparkles, GitBranch, Zap,
  Users, Star, CheckCircle2, Lock,
} from "lucide-react";
import { useStore } from "@/store/useStore";
import { getDeveloperProfile, isDeveloperRegistrationComplete } from "@/lib/developerProfile";
import { DeveloperFlowBreadcrumb } from "@/components/FlowNavigation";

// ── Decision states ────────────────────────────────────────────────────────────
type Decision =
  | "loading"          // Checking auth + Firestore
  | "not-logged-in"    // Must sign in first
  | "no-dev-role"      // Logged in but not a developer
  | "incomplete-reg"   // Started but didn't finish registration
  | "ready";           // Full developer — go to dashboard

export default function DeveloperEntryPage() {
  const router = useRouter();
  const { authReady, currentUser, userRoles, developerProfile, setDeveloperProfile, addUserRole } = useStore();
  const [decision, setDecision] = useState<Decision>("loading");
  const [startingDemo, setStartingDemo] = useState(false);

  // ── Decision Engine (waits for Firebase auth before evaluating) ─
  useEffect(() => {
    if (!authReady) return;
    async function evaluate() {
      if (!currentUser) {
        setDecision("not-logged-in");
        return;
      }

      if (currentUser.uid === "demo-guest") {
        setDecision("not-logged-in");
        return;
      }

      // Drop cached profile if it belongs to another account (persist bleed)
      let profile = developerProfile;
      if (profile && profile.userId !== currentUser.uid) {
        profile = null;
        setDeveloperProfile(null);
      }

      const fromDb = await getDeveloperProfile(currentUser.uid);
      if (fromDb) {
        profile = fromDb;
        setDeveloperProfile(fromDb);
        if (!userRoles.includes("developer")) addUserRole("developer");
      } else {
        profile = null;
      }

      if (!profile) {
        setDecision("no-dev-role");
        return;
      }

      if (!isDeveloperRegistrationComplete(profile)) {
        setDecision("incomplete-reg");
        return;
      }

      setDecision("ready");
    }

    evaluate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, currentUser?.uid]);

  // Auto-redirect when ready
  useEffect(() => {
    if (decision === "ready") {
      const t = setTimeout(() => router.push("/employee-dashboard"), 1200);
      return () => clearTimeout(t);
    }
  }, [decision, router]);

  function handleSignIn() { router.push("/auth?return=/developer"); }
  function handleBecomeDeveloper() { router.push("/developer/register"); }
  function handleResumeRegistration() { router.push(`/developer/register?step=${developerProfile?.completedStep ?? 1}`); }

  function handleDemoAccess() {
    setStartingDemo(true);
    addUserRole("developer");
    setTimeout(() => router.push("/employee-dashboard"), 800);
  }

  return (
    <div className="min-h-screen relative flex flex-col">
      <DeveloperFlowBreadcrumb className="sticky top-0 z-50 shrink-0 bg-[#050505]/85 backdrop-blur-xl" />
      <div className="relative flex flex-col flex-1 items-center justify-center p-6">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-blue-500/[0.04] rounded-full blur-[150px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-indigo-500/[0.03] rounded-full blur-[150px]" />
      </div>

      <AnimatePresence mode="wait">

        {/* LOADING */}
        {decision === "loading" && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-white/40 animate-spin" />
            </div>
            <p className="text-white/40 text-sm font-light">Checking your profile…</p>
          </motion.div>
        )}

        {/* NOT LOGGED IN */}
        {decision === "not-logged-in" && (
          <motion.div key="not-logged-in" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="max-w-md w-full space-y-8 text-center">
            <div className="space-y-3">
              <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-blue-900/60 to-indigo-900/60 border border-blue-500/20 flex items-center justify-center">
                <Code2 className="w-10 h-10 text-blue-400" />
              </div>
              <h1 className="text-4xl font-black tracking-tighter text-white">Developer Section</h1>
              <p className="text-[#888] font-light leading-relaxed">
                Sign in to access the developer workspace, get matched to projects, and track your earnings.
              </p>
            </div>

            {/* Feature highlights */}
            <div className="grid grid-cols-2 gap-3 text-left">
              {[
                { icon: <Sparkles className="w-4 h-4 text-blue-400" />, label: "AI-Matched Projects" },
                { icon: <ShieldCheck className="w-4 h-4 text-emerald-400" />, label: "Verified Skill Tiers" },
                { icon: <GitBranch className="w-4 h-4 text-purple-400" />, label: "Task-Based Execution" },
                { icon: <Star className="w-4 h-4 text-yellow-400" />, label: "Reputation Scoring" },
              ].map((f, i) => (
                <div key={i} className="flex items-center gap-2 p-3 bg-white/5 rounded-xl border border-white/5 text-xs text-white/70 font-medium">
                  {f.icon} {f.label}
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <button onClick={handleSignIn}
                className="w-full py-4 silver-gradient text-black font-black uppercase tracking-widest text-sm rounded-2xl flex items-center justify-center gap-2">
                Sign In / Create Account <ArrowRight className="w-4 h-4" />
              </button>
              <button onClick={handleDemoAccess}
                className="w-full py-3 border border-white/10 text-white/60 hover:text-white hover:border-white/20 font-bold text-xs uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2">
                <Zap className="w-3.5 h-3.5 text-yellow-500" /> Try Demo — No Account Needed
              </button>
            </div>

            <p className="text-[10px] text-white/20 font-light">
              Already an employer? <button onClick={() => router.push("/discovery")} className="text-white/40 hover:text-white underline transition-colors">Switch to Employer View</button>
            </p>
          </motion.div>
        )}

        {/* NO DEVELOPER ROLE — Become a Developer */}
        {decision === "no-dev-role" && (
          <motion.div key="no-dev-role" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="max-w-lg w-full space-y-8">
            <div className="text-center space-y-3">
              <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-indigo-900/60 to-purple-900/60 border border-indigo-500/20 flex items-center justify-center">
                <UserCheck className="w-10 h-10 text-indigo-400" />
              </div>
              <h1 className="text-4xl font-black tracking-tighter text-white">Become a Developer</h1>
              <p className="text-[#888] font-light leading-relaxed">
                Hi <strong className="text-white">{currentUser?.displayName ?? "there"}</strong> — we don&apos;t have a finished developer profile for this account yet.
                Complete registration to unlock matching, chat, and the workspace.
              </p>
            </div>

            {/* Role switching card */}
            <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">Your Current Roles</h3>
              <div className="flex gap-3">
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-400 font-bold">
                  <Briefcase className="w-3.5 h-3.5" /> Employer <CheckCircle2 className="w-3 h-3" />
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white/30 font-bold">
                  <Code2 className="w-3.5 h-3.5" /> Developer <Lock className="w-3 h-3" />
                </div>
              </div>
              <p className="text-xs text-white/40 font-light">
                Adding the developer role is free. You can switch between employer and developer views at any time. Your existing projects and data are not affected.
              </p>
            </div>

            {/* What you get */}
            <div className="space-y-2">
              {[
                "Get matched to projects based on your verified skills",
                "AI-generated task prompts for every milestone",
                "Validated submissions before employer review",
                "Build reputation across BuildCraft projects",
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5 text-xs text-white/70">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> {item}
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <button onClick={handleBecomeDeveloper}
                className="w-full py-4 silver-gradient text-black font-black uppercase tracking-widest text-sm rounded-2xl flex items-center justify-center gap-2">
                Start Developer Registration <ChevronRight className="w-5 h-5" />
              </button>
              <button onClick={() => router.push("/discovery")}
                className="w-full py-3 border border-white/10 text-white/50 hover:text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all text-center">
                Back to Employer Dashboard
              </button>
            </div>
          </motion.div>
        )}

        {/* INCOMPLETE REGISTRATION */}
        {decision === "incomplete-reg" && (
          <motion.div key="incomplete-reg" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="max-w-md w-full space-y-8 text-center">
            <div className="space-y-3">
              <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-yellow-900/40 to-orange-900/40 border border-yellow-500/20 flex items-center justify-center">
                <GitBranch className="w-10 h-10 text-yellow-400" />
              </div>
              <h1 className="text-4xl font-black tracking-tighter text-white">Resume Registration</h1>
              <p className="text-[#888] font-light">
                You started your developer profile but didn&apos;t finish. Pick up right where you left off.
              </p>
            </div>

            <div className="glass-panel p-5 rounded-2xl border border-yellow-500/20 bg-yellow-500/5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-yellow-400">Registration Progress</span>
                <span className="text-yellow-400 font-bold text-sm">{developerProfile?.completedStep ?? 0}/6 Steps</span>
              </div>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5, 6].map(s => (
                  <div key={s} className={`flex-1 h-1.5 rounded-full ${s <= (developerProfile?.completedStep ?? 0) ? "bg-yellow-500" : "bg-white/10"}`} />
                ))}
              </div>
              <p className="text-xs text-white/40 mt-2 font-light">
                Last completed: Step {developerProfile?.completedStep ?? 0} —{" "}
                {["", "Basic Info", "Professional Details", "Portfolio", "Skill Verification", "Availability", "Complete"][developerProfile?.completedStep ?? 0]}
              </p>
            </div>

            <div className="space-y-3">
              <button onClick={handleResumeRegistration}
                className="w-full py-4 silver-gradient text-black font-black uppercase tracking-widest text-sm rounded-2xl flex items-center justify-center gap-2">
                <ArrowRight className="w-5 h-5" /> Resume from Step {(developerProfile?.completedStep ?? 0) + 1}
              </button>
              <button onClick={() => router.push("/developer/register")}
                className="w-full py-3 border border-white/10 text-white/50 hover:text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all">
                Start Over
              </button>
            </div>
          </motion.div>
        )}

        {/* READY — Auto-redirecting */}
        {decision === "ready" && (
          <motion.div key="ready" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-6 text-center">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-emerald-900/60 to-green-900/60 border border-emerald-500/30 flex items-center justify-center">
              <ShieldCheck className="w-12 h-12 text-emerald-400" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-black text-white tracking-tighter">
                Welcome back, {currentUser?.displayName?.split(" ")[0] ?? "Developer"}
              </h2>
              <p className="text-[#888] font-light">Profile verified · Entering workspace…</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Demo loading */}
        {startingDemo && (
          <motion.div key="demo" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-4 text-center">
            <Loader2 className="w-10 h-10 text-white/40 animate-spin" />
            <p className="text-white/40 text-sm">Loading demo workspace…</p>
          </motion.div>
        )}

      </AnimatePresence>

      {/* Stats bar at bottom */}
      {(decision === "not-logged-in" || decision === "no-dev-role") && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-8 px-6 py-3 glass-panel border border-white/5 rounded-2xl">
          {[
            { icon: <Users className="w-4 h-4 text-blue-400" />, value: "2,400+", label: "Developers" },
            { icon: <Briefcase className="w-4 h-4 text-emerald-400" />, value: "180+", label: "Projects" },
            { icon: <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />, value: "4.9", label: "Avg Rating" },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-2">
              {s.icon}
              <div>
                <div className="text-white font-bold text-sm">{s.value}</div>
                <div className="text-[9px] text-[#888] uppercase tracking-widest">{s.label}</div>
              </div>
            </div>
          ))}
        </motion.div>
      )}
      </div>
    </div>
  );
}
