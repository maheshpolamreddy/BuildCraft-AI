"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { useStore } from "@/store/useStore";
import { getUserProfile, updateUserProfile } from "@/lib/firestore";
import { logAction } from "@/lib/auditLog";
import { normalizeEmployerProfile } from "@/lib/projectCreatorProfile";
import { ProjectCreatorProfileEditor } from "@/components/project-creator/ProjectCreatorProfileEditor";
import type { EmployerProfile } from "@/store/useStore";

export default function ProjectCreatorProfilePage() {
  const router = useRouter();
  const {
    authReady,
    currentUser,
    userRoles,
    employerProfile,
    setEmployerProfile,
  } = useStore();

  const [draft, setDraft] = useState<EmployerProfile>(employerProfile);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    setDraft(employerProfile);
  }, [employerProfile]);

  useEffect(() => {
    if (!authReady) return;
    if (!currentUser) {
      router.replace("/auth?return=/creator/profile");
      return;
    }
    if (currentUser.uid === "demo-guest") {
      return;
    }
    if (!userRoles.includes("employer")) {
      router.replace("/");
      return;
    }

    getUserProfile(currentUser.uid)
      .then((data) => {
        if (data?.employerProfile) {
          const ep = normalizeEmployerProfile(data.employerProfile);
          setEmployerProfile(ep);
          setDraft(ep);
        }
      })
      .catch(() => setLoadErr("Could not refresh profile from the server."));
  }, [authReady, currentUser, userRoles, router, setEmployerProfile]);

  async function onSave() {
    if (!currentUser?.uid || currentUser.uid === "demo-guest") {
      setEmployerProfile(draft);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
      return;
    }
    setSaving(true);
    setLoadErr(null);
    try {
      setEmployerProfile(draft);
      await updateUserProfile(currentUser.uid, { employerProfile: draft });
      await logAction(currentUser.uid, "employer.profile_updated", { source: "creator_profile_page" });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2200);
    } catch {
      setLoadErr("Save failed. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!authReady || !currentUser) {
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
    <main className="min-h-screen relative bg-[#030303] text-white pb-16">
      <div className="fixed inset-0 pointer-events-none opacity-[0.04] bg-[url('/noise.svg')]" />
      <div className="relative max-w-2xl mx-auto px-5 pt-10 pb-6">
        <Link
          href="/discovery"
          className="inline-flex items-center gap-2 text-xs text-white/45 hover:text-white/80 transition-colors mb-8"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Discovery
        </Link>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-black tracking-tight mb-1">Project creator profile</h1>
          <p className="text-sm text-white/45 mb-8 font-light">
            View and edit your organization details and photo. This is separate from the Discovery requirements
            workspace.
          </p>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 md:p-8">
            <ProjectCreatorProfileEditor mode="edit" value={draft} onChange={setDraft} />

            {loadErr && <p className="mt-4 text-sm text-red-400">{loadErr}</p>}

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void onSave()}
                disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Save changes
              </button>
              {savedFlash && (
                <span className="text-xs text-emerald-400 font-medium">Saved</span>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </main>
  );
}