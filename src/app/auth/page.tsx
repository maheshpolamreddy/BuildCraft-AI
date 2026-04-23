"use client";

import { useState, useLayoutEffect, useEffect, Suspense, useRef } from "react";
import Threads from "@/components/Threads";
import { motion } from "framer-motion";
import {
  Building2, User, Lock, ArrowRight, Mail, CheckCircle2,
  ChevronRight, Eye, EyeOff, Loader2, AlertCircle, Chrome, Phone, Globe, Briefcase,
} from "lucide-react";
import Logo from "@/components/Logo";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/store/useStore";
import type { EmployerProfile } from "@/store/useStore";
import {
  signUpWithEmail,
  signInWithEmail,
  signInWithGoogle,
  isAuthPopupBlockedError,
} from "@/lib/auth";
import { logAction } from "@/lib/auditLog";
import { updateUserProfile } from "@/lib/firestore";
import { getDeveloperProfile, isDeveloperRegistrationComplete } from "@/lib/developerProfile";
import { sanitizeInternalReturnPath } from "@/lib/safePaths";

const PROD_GOOGLE_ERR = "Sign in could not be completed. Please try again.";

function PlatformEntryInner() {
  const router  = useRouter();
  const searchParams = useSearchParams();
  const returnRaw = searchParams.get("return");
  const returnTo = returnRaw ? sanitizeInternalReturnPath(returnRaw, "/discovery") : null;
  const asDeveloper  = searchParams.get("as") === "developer";
  const {
    role, setRole, setCurrentUser,
    employerProfile, setEmployerProfile, addUserRole,
  } = useStore();

  const [step,       setStep]       = useState(1);
  const [authMode,   setAuthMode]   = useState<"sign-in" | "sign-up">("sign-in");
  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [name,       setName]       = useState("");
  const [showPass,   setShowPass]   = useState(false);
  const [authError,  setAuthError]  = useState<string | null>(null);
  /** Dev only: popup-blocked helper UI (hidden in production). */
  const [googlePopupBlocked, setGooglePopupBlocked] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [postRoleLoading, setPostRoleLoading] = useState(false);
  const [employerFullName, setEmployerFullName] = useState("");
  const [employerCompany, setEmployerCompany] = useState("");
  const [employerJobTitle, setEmployerJobTitle] = useState("");
  const [employerPhone, setEmployerPhone] = useState("");
  const [employerWebsite, setEmployerWebsite] = useState("");
  /** Survives transient Zustand `role` clears (auth flicker) so step 3 does not unmount to a blank card. */
  const [employerWizardOpen, setEmployerWizardOpen] = useState(false);

  const handleNext = () => setStep((p) => p + 1);
  /** When true, user used "Back" from role step; don't immediately force step 2 again (still signed in). */
  const userReturnedToAuth = useRef(false);
  const handleBack = () => {
    if (step === 2) userReturnedToAuth.current = true;
    if (step === 3) setEmployerWizardOpen(false);
    setStep((p) => p - 1);
  };

  /** Developers finish after role (2 steps). Employers continue to profile (3 steps). */
  const totalSteps = role === "employee" ? 2 : 3;

  // Landing “I’m a Developer” → force employee role even after zustand rehydration overwrites from localStorage
  useLayoutEffect(() => {
    if (!asDeveloper) return;
    const sync = () => setRole("employee");
    sync();
    return useStore.persist.onFinishHydration(() => {
      sync();
    });
  }, [asDeveloper, setRole]);

  /** Wait for persist rehydration so late merge from localStorage cannot wipe role/text state after sign-in. */
  const [storePersistReady, setStorePersistReady] = useState(
    () => typeof window !== "undefined" && useStore.persist.hasHydrated(),
  );
  useEffect(() => {
    if (useStore.persist.hasHydrated()) {
      setStorePersistReady(true);
      return;
    }
    return useStore.persist.onFinishHydration(() => setStorePersistReady(true));
  }, []);

  const authReady = useStore((s) => s.authReady);
  const storeUser = useStore((s) => s.currentUser);
  const projectCreatorHydrated = useStore((s) => s.projectCreatorHydrated);

  /**
   * Single redirect path → role step: only after AuthProvider has finished loading Firestore user doc
   * (projectCreatorHydrated). No handleNext in login handlers; avoids flash/blank while profile loads.
   */
  const autoRoleStepSyncRef = useRef(false);
  useEffect(() => {
    if (!storePersistReady || !authReady) return;
    if (!storeUser) {
      autoRoleStepSyncRef.current = false;
      return;
    }
    if (userReturnedToAuth.current) return;
    if (step !== 1) return;
    if (autoRoleStepSyncRef.current) return;

    // Returning users: once Firestore hydration is done, go straight to the right app surface.
    if (storeUser.uid !== "demo-guest" && projectCreatorHydrated) {
      const s = useStore.getState();
      const { userRoles, projectCreatorProfileCompleted, developerProfile } = s;
      if (
        asDeveloper &&
        userRoles.includes("developer") &&
        developerProfile &&
        isDeveloperRegistrationComplete(developerProfile)
      ) {
        autoRoleStepSyncRef.current = true;
        router.replace(returnTo ?? "/employee-dashboard");
        return;
      }
      if (returnTo) {
        if (
          userRoles.includes("developer") &&
          developerProfile &&
          isDeveloperRegistrationComplete(developerProfile)
        ) {
          autoRoleStepSyncRef.current = true;
          router.replace(returnTo);
          return;
        }
        if (userRoles.includes("employer") && projectCreatorProfileCompleted === true) {
          autoRoleStepSyncRef.current = true;
          router.replace(returnTo);
          return;
        }
      } else {
        if (userRoles.includes("developer") && developerProfile && isDeveloperRegistrationComplete(developerProfile)) {
          autoRoleStepSyncRef.current = true;
          router.replace("/employee-dashboard");
          return;
        }
        if (userRoles.includes("employer") && projectCreatorProfileCompleted === true) {
          autoRoleStepSyncRef.current = true;
          router.replace("/discovery");
          return;
        }
      }
    }

    // New / incomplete users — advance to role selection after profile gate.
    if (storeUser.uid === "demo-guest") {
      if (!projectCreatorHydrated) return;
      autoRoleStepSyncRef.current = true;
      if (!asDeveloper) setRole(null);
      setStep(2);
      return;
    }
    if (!projectCreatorHydrated) return;
    autoRoleStepSyncRef.current = true;
    if (!asDeveloper) setRole(null);
    setStep(2);
  }, [
    storePersistReady,
    authReady,
    storeUser,
    projectCreatorHydrated,
    step,
    asDeveloper,
    setRole,
    router,
    returnTo,
  ]);

  /** True while we have a real Firebase user but Firestore user profile has not finished loading. */
  const isUserProfileLoading =
    !!storeUser && storeUser.uid !== "demo-guest" && !projectCreatorHydrated;

  // ── Firebase auth handlers ────────────────────────────────────────────────

  async function handleEmailAuth() {
    if (!email.trim() || !password.trim()) {
      setAuthError("Please fill in all fields.");
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      const user = authMode === "sign-up"
        ? await signUpWithEmail(email, password, name || email.split("@")[0])
        : await signInWithEmail(email, password);
      setCurrentUser(user);
      await logAction(user.uid, authMode === "sign-up" ? "auth.sign_up" : "auth.sign_in", { method: "email" });
      userReturnedToAuth.current = false;
      if (!asDeveloper) setRole(null);
      setEmployerWizardOpen(false);
      setGooglePopupBlocked(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Authentication failed.";
      setAuthError(friendlyError(msg, err));
    } finally {
      setAuthLoading(false);
    }
  }

  // Prefill project creator fields when entering step 3 (do not overwrite existing input)
  useEffect(() => {
    if (step !== 3) return;
    const ep = useStore.getState().employerProfile;
    const u = useStore.getState().currentUser;
    setEmployerFullName((prev) =>
      prev.trim() ? prev : ep.fullName || name.trim() || u?.displayName || "",
    );
    setEmployerCompany((prev) => (prev.trim() ? prev : ep.companyName));
    setEmployerJobTitle((prev) => (prev.trim() ? prev : ep.jobTitle));
    setEmployerPhone((prev) => (prev.trim() ? prev : ep.phone));
    setEmployerWebsite((prev) => (prev.trim() ? prev : ep.website));
  }, [step, name]);

  async function handleGoogleAuth() {
    setGooglePopupBlocked(false);
    setAuthLoading(true);
    setAuthError(null);
    try {
      const googleUser = await signInWithGoogle();
      setCurrentUser(googleUser);
      await logAction(googleUser.uid, "auth.sign_in", { method: "google" });
      userReturnedToAuth.current = false;
      if (!asDeveloper) setRole(null);
      setEmployerWizardOpen(false);
    } catch (err: unknown) {
      if (isAuthPopupBlockedError(err)) {
        setGooglePopupBlocked(true);
        setAuthError(null);
        return;
      }
      const msg = err instanceof Error ? err.message : "Google sign-in failed.";
      setAuthError(friendlyError(msg, err));
    } finally {
      setAuthLoading(false);
    }
  }

  /** After choosing Developer: new users -> registration; completed profiles -> dashboard. */
  async function completeDeveloperFlow() {
    const { currentUser, addUserRole: storeAddRole, setDeveloperProfile } = useStore.getState();
    if (!currentUser) return;

    storeAddRole("developer");

    if (currentUser.uid === "demo-guest") {
      if (returnTo) router.push(returnTo);
      else router.push("/employee-dashboard");
      return;
    }

    await updateUserProfile(currentUser.uid, {
      roles: ["developer"],
      onboardedAt: new Date().toISOString(),
    });
    await logAction(currentUser.uid, "onboarding.developer_role", { role: "developer" });

    if (returnTo) {
      router.push(returnTo);
      return;
    }

    const profile = await getDeveloperProfile(currentUser.uid);
    if (profile && isDeveloperRegistrationComplete(profile)) {
      setDeveloperProfile(profile);
      router.push("/employee-dashboard");
    } else {
      router.push("/developer/register");
    }
  }

  /** After project creator details — save profile and go to Discovery. */
  async function completeEmployerFlow() {
    if (!employerFullName.trim()) {
      setAuthError("Please enter your name.");
      return;
    }
    setAuthError(null);

    const next: EmployerProfile = {
      fullName: employerFullName.trim(),
      companyName: employerCompany.trim(),
      jobTitle: employerJobTitle.trim(),
      phone: employerPhone.trim(),
      website: employerWebsite.trim(),
      experience: "",
      projectInterests: "",
      profileImage: null,
    };
    setEmployerProfile(next);
    addUserRole("employer");
    useStore.getState().setProjectCreatorProfileCompleted(false);

    const { currentUser } = useStore.getState();
    if (currentUser && currentUser.uid !== "demo-guest") {
      await updateUserProfile(currentUser.uid, {
        role: "employer",
        employerProfile: next,
        projectCreatorProfileCompleted: false,
        onboardedAt: new Date().toISOString(),
      });
      await logAction(currentUser.uid, "employer.profile_saved", { company: next.companyName });
    }

    if (returnTo) router.push(returnTo);
    else router.push("/discovery");
  }

  // ── UI helpers ────────────────────────────────────────────────────────────

  const colorMap: Record<string, string> = {
    blue:    "border-blue-500 shadow-[0_0_40px_rgba(59,130,246,0.15)] ring-1 ring-blue-500/50",
    purple:  "border-purple-500 shadow-[0_0_40px_rgba(168,85,247,0.15)] ring-1 ring-purple-500/50",
  };
  const iconColorMap: Record<string, string> = {
    blue:    "bg-blue-500 text-white shadow-[0_0_20px_rgba(59,130,246,0.4)]",
    purple:  "bg-purple-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)]",
  };

  if (!storePersistReady) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#131313] p-6">
        <Loader2 className="h-10 w-10 shrink-0 animate-spin text-white/35" aria-hidden />
      </main>
    );
  }

  return (
    <main className="min-h-screen relative flex font-body overflow-x-hidden items-center justify-center p-6">
      <div className="fixed inset-0 -z-20 opacity-80 pointer-events-none">
        <Threads amplitude={2} distance={0} enableMouseInteraction={true} color={[0.2, 0.4, 0.9]} />
      </div>
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-500/[0.02] rounded-full blur-[150px] pointer-events-none -z-10" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-purple-500/[0.02] rounded-full blur-[150px] pointer-events-none -z-10" />

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[500px] premium-card rounded-[2.5rem] relative overflow-hidden ring-1 ring-white/5 flex flex-col shadow-[0_40px_100px_-20px_rgba(0,0,0,0.8)] backdrop-blur-3xl bg-black/40 group mx-auto [isolation:isolate]"
        >
          {/* Main Auth Card */}
          <div
            className={`w-full p-8 md:p-12 relative flex flex-col justify-start z-10 min-h-[600px]`}
          >
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none z-0" />
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-500/10 rounded-full blur-[100px] pointer-events-none z-0" />

          {/* Logo Brand Name Header */}
          <div className="flex flex-col items-center justify-center mb-6 relative z-10">
            <div className="flex items-center gap-3">
              <Logo className="w-10 h-10 drop-shadow-[0_0_30px_rgba(59,130,246,0.5)]" />
              <span className="text-xl font-black tracking-[0.2em] text-white">BUILDCRAFT</span>
            </div>
            <div className="h-px w-24 bg-gradient-to-r from-transparent via-white/20 to-transparent mt-4" />
          </div>

          <div className="flex gap-2 mb-10 relative z-10 w-full max-w-[180px] mx-auto">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-500 ${step > i ? "bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" : "bg-white/10"}`} />
            ))}
          </div>

          <div className="relative z-20 flex w-full min-h-[20rem] flex-1 flex-col">

            {isUserProfileLoading ? (
              <div className="flex min-h-[20rem] flex-1 flex-col items-center justify-center gap-4 py-10 px-4">
                <Loader2 className="h-10 w-10 shrink-0 animate-spin text-white/50" aria-hidden />
                <p className="text-sm font-light text-white/60">Signing you in…</p>
                  <p className="text-xs text-center text-white/40 max-w-sm">
                    Preparing your workspace. This only takes a moment.
                  </p>
              </div>
            ) : (
              <>
            {/* ── Step 1: Firebase Auth — avoid remounting the whole card on step change
                (keyed AnimatePresence was leaving the role step body blank until refresh). */}

            {step === 1 && (
              <div className="space-y-8 flex-1 flex flex-col">
                <div className="text-center space-y-3">
                  <h1 className="text-3xl font-black tracking-tighter leading-tight text-white drop-shadow-[0_0_1px_rgba(255,255,255,0.4)]">
                    {authMode === "sign-in" ? "Welcome Back" : "Create Account"}
                  </h1>
                  <p className="text-[#888] text-sm font-light">
                    {authMode === "sign-in"
                      ? "Sign in to access your workspace."
                      : "Join BuildCraft and start building."}
                  </p>
                </div>

                <div className="space-y-4 max-w-md mx-auto">
                  <button
                    type="button"
                    onClick={() => {
                      void handleGoogleAuth();
                    }}
                    disabled={authLoading}
                    className="w-full py-4 flex items-center justify-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/30 transition-all rounded-2xl text-sm font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {authLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Chrome className="w-5 h-5" />}
                    Continue with Google
                  </button>

                  {googlePopupBlocked && (
                    <div className="rounded-xl border border-sky-500/40 bg-sky-500/[0.08] p-3 space-y-2">
                      <p className="text-[11px] leading-relaxed text-sky-100/95">
                        Your browser <span className="font-semibold text-white">blocked the sign-in window</span>{" "}
                        (lock or popup icon in the address bar). Allow popups for this site, then use{" "}
                        <span className="text-white">Continue with Google</span> again.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setGooglePopupBlocked(false);
                          void handleGoogleAuth();
                        }}
                        disabled={authLoading}
                        className="w-full py-3 flex items-center justify-center gap-2 border border-sky-400/50 bg-sky-500/15 hover:bg-sky-500/25 text-sky-50 text-xs font-bold rounded-xl transition-all disabled:opacity-50"
                      >
                        {authLoading
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Chrome className="w-4 h-4" />}
                        Try again with Google
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-[10px] uppercase tracking-widest text-white/30 font-bold">or</span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>

                  <div className="space-y-3">
                    {authMode === "sign-up" && (
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Full name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full bg-black/40 backdrop-blur-md shadow-inner border border-white/5 focus:border-blue-500/50 focus:bg-white-[0.03] focus:shadow-[0_0_20px_rgba(59,130,246,0.1)] focus:outline-none rounded-xl px-4 py-3.5 text-sm text-white placeholder-white/30 transition-colors"
                        />
                      </div>
                    )}
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                      <input
                        type="email"
                        placeholder="Email address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleEmailAuth()}
                        className="w-full bg-black/40 backdrop-blur-md shadow-inner border border-white/5 focus:border-blue-500/50 focus:bg-white-[0.03] focus:shadow-[0_0_20px_rgba(59,130,246,0.1)] focus:outline-none rounded-xl pl-11 pr-4 py-3.5 text-sm text-white placeholder-white/30 transition-colors"
                      />
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                      <input
                        type={showPass ? "text" : "password"}
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleEmailAuth()}
                        className="w-full bg-black/40 backdrop-blur-md shadow-inner border border-white/5 focus:border-blue-500/50 focus:bg-white-[0.03] focus:shadow-[0_0_20px_rgba(59,130,246,0.1)] focus:outline-none rounded-xl pl-11 pr-11 py-3.5 text-sm text-white placeholder-white/30 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass((p) => !p)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors"
                      >
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {authError && (
                    <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
                      <AlertCircle className="w-4 h-4 shrink-0" /> {authError}
                    </div>
                  )}

                  <button
                    onClick={handleEmailAuth}
                    disabled={authLoading}
                    className="w-full py-4 silver-gradient text-black rounded-2xl font-black uppercase tracking-[0.2em] text-xs transition-all shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:shadow-[0_0_50px_rgba(255,255,255,0.4)] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {authLoading
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : authMode === "sign-in" ? "Sign In" : "Create Account"}
                  </button>

                  <button
                    onClick={() => {
                      setAuthMode(authMode === "sign-in" ? "sign-up" : "sign-in");
                      setAuthError(null);
                      setGooglePopupBlocked(false);
                    }}
                    className="w-full text-center text-xs text-white/40 hover:text-white transition-colors py-2"
                  >
                    {authMode === "sign-in"
                      ? "Don't have an account? Sign up"
                      : "Already have an account? Sign in"}
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 2: Role ──────────────────────────────────────────── */}
            {step === 2 && (
              <div className="space-y-8">
                <div className="text-center space-y-3">
                  <h1 className="text-3xl font-black tracking-tighter leading-tight text-white drop-shadow-[0_0_1px_rgba(255,255,255,0.4)]">
                    Choose Your Role
                  </h1>
                  <p className="text-[#888] text-sm font-light">Are you looking to build an app, or looking for work?</p>
                  {asDeveloper && (
                    <p className="text-xs text-indigo-300/90 font-light max-w-md mx-auto">
                      You came in as a developer — confirm below to continue to your developer profile setup.
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-4">
                  {/* Employer Role */}
                  <motion.div 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setRole("employer")} 
                    className={`relative p-5 md:p-6 rounded-[2rem] border transition-all duration-500 cursor-pointer overflow-hidden group ${
                      role === "employer" 
                      ? `bg-gradient-to-br from-blue-500/10 to-transparent ${colorMap.blue} z-10 scale-[1.02]` 
                      : role ? "bg-black/40 border-white/5 opacity-40 hover:opacity-70" : "bg-black/40 border-white/10 hover:border-white/30 hover:bg-white/5 shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
                    }`}
                  >
                    {role === "employer" && <div className="absolute inset-0 bg-blue-500/10 blur-2xl" />}
                    <div className="flex items-center gap-5 relative z-10">
                      <div className={`w-14 h-14 shrink-0 rounded-[1.25rem] flex items-center justify-center transition-all duration-500 ${role === "employer" ? "bg-blue-500 text-white shadow-[0_0_30px_rgba(59,130,246,0.6)] rotate-3 scale-110" : "bg-white/5 text-white/50 group-hover:text-white group-hover:bg-white/10 group-hover:rotate-3 group-hover:scale-110"}`}>
                        <Building2 className="w-6 h-6" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className={`text-xl font-black tracking-tight transition-colors duration-300 ${role === "employer" ? "text-blue-400" : "text-white group-hover:text-white/90"}`}>Project Creator</h3>
                          {role === "employer" && (
                            <motion.div initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 200 }}>
                              <CheckCircle2 className="w-6 h-6 text-blue-500 drop-shadow-[0_0_15px_rgba(59,130,246,0.8)]" />
                            </motion.div>
                          )}
                        </div>
                        <p className={`text-xs leading-relaxed transition-colors duration-300 font-light ${role === "employer" ? "text-blue-100/90" : "text-[#888] group-hover:text-white/70"}`}>
                          Describe your app idea, get a technical plan, and hire verified developers securely.
                        </p>
                      </div>
                    </div>
                  </motion.div>

                  {/* Employee Role */}
                  <motion.div 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setRole("employee")} 
                    className={`relative p-5 md:p-6 rounded-[2rem] border transition-all duration-500 cursor-pointer overflow-hidden group ${
                      role === "employee" 
                      ? `bg-gradient-to-br from-purple-500/10 to-transparent ${colorMap.purple} z-10 scale-[1.02]` 
                      : role ? "bg-black/40 border-white/5 opacity-40 hover:opacity-70" : "bg-black/40 border-white/10 hover:border-white/30 hover:bg-white/5 shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
                    }`}
                  >
                    {role === "employee" && <div className="absolute inset-0 bg-purple-500/10 blur-2xl" />}
                    <div className="flex items-center gap-5 relative z-10">
                      <div className={`w-14 h-14 shrink-0 rounded-[1.25rem] flex items-center justify-center transition-all duration-500 ${role === "employee" ? "bg-purple-500 text-white shadow-[0_0_30px_rgba(168,85,247,0.6)] -rotate-3 scale-110" : "bg-white/5 text-white/50 group-hover:text-white group-hover:bg-white/10 group-hover:-rotate-3 group-hover:scale-110"}`}>
                        <User className="w-6 h-6" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className={`text-xl font-black tracking-tight transition-colors duration-300 ${role === "employee" ? "text-purple-400" : "text-white group-hover:text-white/90"}`}>Developer</h3>
                          {role === "employee" && (
                            <motion.div initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 200 }}>
                              <CheckCircle2 className="w-6 h-6 text-purple-500 drop-shadow-[0_0_15px_rgba(168,85,247,0.8)]" />
                            </motion.div>
                          )}
                        </div>
                        <p className={`text-xs leading-relaxed transition-colors duration-300 font-light ${role === "employee" ? "text-purple-100/90" : "text-[#888] group-hover:text-white/70"}`}>
                          Verify your coding skills and get matched with great projects that need your exact expertise.
                        </p>
                      </div>
                    </div>
                  </motion.div>
                </div>
                <div className="flex justify-between pt-4">
                  <button onClick={handleBack} className="px-8 py-5 text-[#888] hover:text-white text-xs font-bold uppercase tracking-widest transition-colors">Back</button>
                  <button
                    type="button"
                    disabled={!role || postRoleLoading}
                    onClick={async () => {
                      if (role === "employer") {
                        setEmployerWizardOpen(true);
                        handleNext();
                        return;
                      }
                      setPostRoleLoading(true);
                      try {
                        await completeDeveloperFlow();
                      } finally {
                        setPostRoleLoading(false);
                      }
                    }}
                    className={`px-12 py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-xs transition-all duration-300 flex items-center gap-3 ${role && !postRoleLoading ? "silver-gradient text-black shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:shadow-[0_0_50px_rgba(255,255,255,0.4)]" : "bg-white/5 text-white/20 cursor-not-allowed border border-white/5"}`}
                  >
                    {postRoleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    {role === "employee" ? "Continue as developer" : "Continue"}
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 3: Project creator profile (employer only) ───────── */}
            {step === 3 && (role === "employer" || employerWizardOpen) && (
              <div className="space-y-8">
                <div className="text-center space-y-3">
                  <h1 className="text-3xl font-black tracking-tighter leading-tight text-white drop-shadow-[0_0_1px_rgba(255,255,255,0.4)]">
                    Your details
                  </h1>
                  <p className="text-[#888] text-sm font-light max-w-md mx-auto">
                    Tell us who you are so we can personalize your workspace and hiring experience.
                  </p>
                </div>

                <div className="space-y-4 max-w-lg mx-auto">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Full name *</label>
                    <input
                      type="text"
                      value={employerFullName}
                      onChange={(e) => setEmployerFullName(e.target.value)}
                      placeholder="Jane Doe"
                      className="w-full bg-black/40 backdrop-blur-md shadow-inner border border-white/5 focus:border-blue-500/50 focus:bg-white-[0.03] focus:shadow-[0_0_20px_rgba(59,130,246,0.1)] focus:outline-none rounded-xl px-4 py-3.5 text-sm text-white placeholder-white/30 transition-colors"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Company / org</label>
                      <div className="relative">
                        <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                        <input
                          type="text"
                          value={employerCompany}
                          onChange={(e) => setEmployerCompany(e.target.value)}
                          placeholder="Acme Inc."
                          className="w-full bg-black/40 backdrop-blur-md shadow-inner border border-white/5 focus:border-blue-500/50 focus:bg-white-[0.03] focus:shadow-[0_0_20px_rgba(59,130,246,0.1)] focus:outline-none rounded-xl pl-11 pr-4 py-3.5 text-sm text-white placeholder-white/30 transition-colors"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Role / title</label>
                      <input
                        type="text"
                        value={employerJobTitle}
                        onChange={(e) => setEmployerJobTitle(e.target.value)}
                        placeholder="Product lead, Founder…"
                        className="w-full bg-black/40 backdrop-blur-md shadow-inner border border-white/5 focus:border-blue-500/50 focus:bg-white-[0.03] focus:shadow-[0_0_20px_rgba(59,130,246,0.1)] focus:outline-none rounded-xl px-4 py-3.5 text-sm text-white placeholder-white/30 transition-colors"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Phone</label>
                      <div className="relative">
                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                        <input
                          type="tel"
                          value={employerPhone}
                          onChange={(e) => setEmployerPhone(e.target.value)}
                          placeholder="+1 …"
                          className="w-full bg-black/40 backdrop-blur-md shadow-inner border border-white/5 focus:border-blue-500/50 focus:bg-white-[0.03] focus:shadow-[0_0_20px_rgba(59,130,246,0.1)] focus:outline-none rounded-xl pl-11 pr-4 py-3.5 text-sm text-white placeholder-white/30 transition-colors"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Website (optional)</label>
                      <div className="relative">
                        <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                        <input
                          type="url"
                          value={employerWebsite}
                          onChange={(e) => setEmployerWebsite(e.target.value)}
                          placeholder="https://"
                          className="w-full bg-black/40 backdrop-blur-md shadow-inner border border-white/5 focus:border-blue-500/50 focus:bg-white-[0.03] focus:shadow-[0_0_20px_rgba(59,130,246,0.1)] focus:outline-none rounded-xl pl-11 pr-4 py-3.5 text-sm text-white placeholder-white/30 transition-colors"
                        />
                      </div>
                    </div>
                  </div>

                  {authError && (
                    <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
                      <AlertCircle className="w-4 h-4 shrink-0" /> {authError}
                    </div>
                  )}
                </div>

                <div className="flex justify-between pt-4 max-w-lg mx-auto w-full">
                  <button type="button" onClick={handleBack} className="px-8 py-5 text-[#888] hover:text-white text-xs font-bold uppercase tracking-widest transition-colors">Back</button>
                  <button
                    type="button"
                    onClick={() => void completeEmployerFlow()}
                    className="px-12 py-5 silver-gradient text-black rounded-2xl font-black uppercase tracking-[0.2em] text-xs transition-all shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:shadow-[0_0_50px_rgba(255,255,255,0.4)] flex items-center justify-center gap-3 group"
                  >
                    Go to Discovery <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            )}
              </>
            )}

          </div>
          </div>
        </motion.div>
    </main>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function firebaseErrorCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string") {
    return (err as { code: string }).code;
  }
  return "";
}

function friendlyError(msg: string, err?: unknown): string {
  const code = firebaseErrorCode(err);
  const host =
    typeof window !== "undefined" ? window.location.hostname : "your production domain";
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  if (code === "auth/unauthorized-domain") {
    return (
      `This host (${host}) is not allowed for Firebase Auth. ` +
      `In Firebase Console → Authentication → Settings → Authorized domains, add "${host}". ` +
      `In Google Cloud → Credentials → your OAuth Web client, add ${origin || "this page's https URL"} to Authorized JavaScript origins.`
    );
  }
  if (code === "auth/unauthorized-continue-uri" || code === "auth/invalid-continue-uri") {
    return (
      `The sign-in return URL is not authorized. Add ${origin || "this site's https URL"} to Firebase Authorized domains and Google OAuth settings.`
    );
  }
  if (code === "auth/popup-blocked") {
    return "Your browser blocked the sign-in window. Allow popups for this site (address bar) and use Continue with Google again.";
  }
  if (code === "auth/popup-closed-by-user") {
    return "The sign-in window was closed. Try again when you are ready.";
  }
  if (msg.includes("configuration-not-found"))  return "Firebase Authentication is not enabled yet. Please enable it in the Firebase console under Authentication → Get started.";
  if (msg.includes("email-already-in-use"))     return "This email is already registered. Try signing in.";
  if (msg.includes("wrong-password") || msg.includes("invalid-credential")) return "Incorrect email or password.";
  if (msg.includes("user-not-found"))           return "No account found with that email.";
  if (msg.includes("weak-password"))            return "Password must be at least 6 characters.";
  if (msg.includes("invalid-email"))            return "Please enter a valid email address.";
  if (msg.includes("popup-closed"))             return "Sign-in popup was closed. Please try again.";
  if (msg.includes("popup-blocked")) {
    return "Your browser blocked the sign-in window. Allow popups for this site and try Continue with Google again.";
  }
  if (msg.includes("network-request-failed"))   return "Network error. Check your internet connection.";
  if (msg.includes("unauthorized-domain"))      return "This domain is not authorized in Firebase. Add it under Authentication → Settings → Authorized domains.";
  if (msg.includes("operation-not-allowed"))    return "This sign-in method is not enabled. Enable it in Firebase console under Authentication → Sign-in method.";
  return msg;
}

// Suspense wrapper — required because useSearchParams() needs it in Next.js App Router
export default function PlatformEntry() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center"><Loader2 className="w-8 h-8 text-white/30 animate-spin" /></div>}>
      <PlatformEntryInner />
    </Suspense>
  );
}
