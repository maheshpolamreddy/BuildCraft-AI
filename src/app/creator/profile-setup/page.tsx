"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Loader2, ArrowRight } from "lucide-react";
import { useStore } from "@/store/useStore";
import { updateUserProfile } from "@/lib/firestore";
import { logAction } from "@/lib/auditLog";
import {
  ProjectCreatorProfileEditor,
  canSubmitProjectCreatorProfile,
} from "@/components/project-creator/ProjectCreatorProfileEditor";
import type { EmployerProfile } from "@/store/useStore";

function ProfileSetupInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnPath = searchParams.get("return") || "/discovery";

  const {
    authReady,
    currentUser,
    userRoles,
    employerProfile,
    setEmployerProfile,
    setProjectCreatorProfileCompleted,
    projectCreatorProfileCompleted,
    projectCreatorHydrated,
  } = useStore();

  const [draft, setDraft] = useState<EmployerProfile>(employerProfile);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(useStore.getState().employerProfile);
  }, [employerProfile]);

  useEffect(() => {
    if (!authReady) return;
    if (!currentUser) {
      router.replace(`/auth?return=${encodeURIComponent("/creator/profile-setup")}`);
      return;
    }
    if (currentUser.uid === "demo-guest") {
      router.replace(returnPath.startsWith("/") ? returnPath : "/discovery");
      return;
    }
    if (!userRoles.includes("employer")) {
      router.replace("/");
      return;
    }
    if (!projectCreatorHydrated) return;
    if (projectCreatorProfileCompleted === true) {
      const dest = returnPath.startsWith("/") ? returnPath : "/discovery";
      router.replace(dest);
    }
  }, [
    authReady,
    currentUser,
    userRoles,
    router,
    returnPath,
    projectCreatorHydrated,
    projectCreatorProfileCompleted,
  ]);

  async function onContinue() {
    if (!currentUser?.uid || currentUser.uid === "demo-guest") return;
    if (!canSubmitProjectCreatorProfile(draft, true)) {
      setError("Please fill in all required fields.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      setEmployerProfile(draft);
      await updateUserProfile(currentUser.uid, {
        employerProfile: draft,
        projectCreatorProfileCompleted: true,
      });
      setProjectCreatorProfileCompleted(true);
      await logAction(currentUser.uid, "employer.project_creator_profile_completed", {});
      const dest = returnPath.startsWith("/") ? returnPath : "/discovery";
      router.replace(dest);
    } catch {
      setError("Could not save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!authReady || !currentUser || currentUser.uid === "demo-guest") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#030303] text-white/50">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!userRoles.includes("employer")) {
    return null;
  }

  return (
    <main className="min-h-screen relative flex flex-col items-center justify-center p-6 bg-[#030303] text-white">
      <div className="fixed inset-0 pointer-events-none opacity-[0.04] bg-[url('/noise.svg')]" />
      <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-blue-500/[0.06] rounded-full blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-xl"
      >
        <div className="mb-6 text-center space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-blue-400/90">
            Project creator
          </p>
          <h1 className="text-2xl font-black tracking-tight">Complete your profile</h1>
          <p className="text-sm text-white/45 font-light max-w-md mx-auto">
            A few details help us tailor Discovery and hiring. You can edit this anytime under Profile.
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 md:p-8 shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
          <ProjectCreatorProfileEditor
            mode="setup"
            value={draft}
            onChange={setDraft}
            requireMandatorySetup
          />

          {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

          <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:justify-end">
            <Link
              href="/creator/profile"
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-white/45 hover:text-white/70 text-center sm:text-left"
            >
              Open full profile page
            </Link>
            <button
              type="button"
              onClick={() => void onContinue()}
              disabled={saving || !canSubmitProjectCreatorProfile(draft, true)}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-sm font-black uppercase tracking-widest text-white disabled:opacity-40 shadow-lg shadow-blue-500/20"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              Save & continue
            </button>
          </div>
        </div>
      </motion.div>
    </main>
  );
}

export default function ProjectCreatorProfileSetupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#030303] text-white/50">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      }
    >
      <ProfileSetupInner />
    </Suspense>
  );
}