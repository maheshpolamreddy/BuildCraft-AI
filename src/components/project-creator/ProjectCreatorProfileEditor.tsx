"use client";

import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, Briefcase, Globe, Phone, UserRound, Upload, Sparkles, X, Loader2 } from "lucide-react";
import type { EmployerProfile } from "@/store/useStore";
import {
  PROJECT_CREATOR_AVATAR_URLS,
  isMandatoryProjectCreatorSetupComplete,
} from "@/lib/projectCreatorProfile";
import { fileToResizedJpegDataUrl } from "@/lib/imageUpload";

export type ProfileEditorMode = "setup" | "edit";

type Props = {
  mode: ProfileEditorMode;
  value: EmployerProfile;
  onChange: (next: EmployerProfile) => void;
  /** When false, submit stays disabled until mandatory setup fields are valid. */
  requireMandatorySetup?: boolean;
};

export function ProjectCreatorProfileEditor({
  mode,
  value,
  onChange,
  requireMandatorySetup = false,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const previewUrl =
    value.profileImage?.url ||
    (value.profileImage?.type === "avatar" ? value.profileImage.url : null);

  const patch = useCallback(
    (partial: Partial<EmployerProfile>) => {
      onChange({ ...value, ...partial });
    },
    [onChange, value],
  );

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadErr(null);
    setUploadBusy(true);
    try {
      const dataUrl = await fileToResizedJpegDataUrl(file);
      patch({ profileImage: { type: "upload", url: dataUrl } });
    } catch (err) {
      setUploadErr(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadBusy(false);
    }
  }

  function clearPhoto() {
    patch({ profileImage: null });
  }

  const mandatoryOk = isMandatoryProjectCreatorSetupComplete(value);
  const showHint = requireMandatorySetup && !mandatoryOk;

  return (
    <div className="space-y-6">
      {/* Photo */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-3">
          Profile photo
        </p>
        <div className="flex flex-col sm:flex-row gap-5 items-start">
          <div className="relative w-24 h-24 rounded-2xl overflow-hidden border border-white/15 bg-black/40 shrink-0">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URLs + local avatars
              <img src={previewUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/25">
                <UserRound className="w-10 h-10" />
              </div>
            )}
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploadBusy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 border border-white/15 text-xs font-bold text-white hover:bg-white/15 transition-colors disabled:opacity-50"
              >
                {uploadBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                Upload photo
              </button>
              <button
                type="button"
                onClick={() => setAvatarOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-xs font-bold text-indigo-200 hover:bg-indigo-500/25 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Choose avatar
              </button>
              {value.profileImage && (
                <button
                  type="button"
                  onClick={clearPhoto}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-white/45 hover:text-white hover:bg-white/5"
                >
                  <X className="w-3.5 h-3.5" /> Remove
                </button>
              )}
            </div>
            <p className="text-[11px] text-white/35 leading-relaxed">
              JPG or PNG, up to 2MB. Images are resized in your browser before saving.
            </p>
            {uploadErr && <p className="text-xs text-red-400">{uploadErr}</p>}
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => void onPickFile(e)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-white/35 mb-1.5">
            Full name *
          </label>
          <input
            value={value.fullName}
            onChange={(e) => patch({ fullName: e.target.value })}
            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/40"
            placeholder="Your name"
            autoComplete="name"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-white/35 mb-1.5 flex items-center gap-1.5">
            <Building2 className="w-3 h-3" /> Company / organization *
          </label>
          <input
            value={value.companyName}
            onChange={(e) => patch({ companyName: e.target.value })}
            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/40"
            placeholder="Company or team"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-white/35 mb-1.5 flex items-center gap-1.5">
            <Briefcase className="w-3 h-3" /> Role / title
          </label>
          <input
            value={value.jobTitle}
            onChange={(e) => patch({ jobTitle: e.target.value })}
            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/40"
            placeholder="e.g. Product lead"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-white/35 mb-1.5">
            Experience *
          </label>
          <input
            value={value.experience}
            onChange={(e) => patch({ experience: e.target.value })}
            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/40"
            placeholder="Years or areas of experience"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-white/35 mb-1.5">
            Project interests *
          </label>
          <textarea
            value={value.projectInterests}
            onChange={(e) => patch({ projectInterests: e.target.value })}
            rows={3}
            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/40 resize-y min-h-[80px]"
            placeholder="e.g. SaaS, mobile apps, AI assistants, internal tools…"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-white/35 mb-1.5 flex items-center gap-1.5">
            <Phone className="w-3 h-3" /> Phone
          </label>
          <input
            value={value.phone}
            onChange={(e) => patch({ phone: e.target.value })}
            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/40"
            placeholder="+1 …"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-white/35 mb-1.5 flex items-center gap-1.5">
            <Globe className="w-3 h-3" /> Website
          </label>
          <input
            value={value.website}
            onChange={(e) => patch({ website: e.target.value })}
            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/40"
            placeholder="https://"
          />
        </div>
      </div>

      {showHint && (
        <p className="text-xs text-amber-400/90">
          Fill name, company, experience, and project interests to continue.
        </p>
      )}

      {mode === "edit" && (
        <p className="text-[11px] text-white/30">
          Profile completeness is tracked for the project creator workspace only — separate from developer
          profiles.
        </p>
      )}

      <AnimatePresence>
        {avatarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setAvatarOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#0a0a0a] p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-bold text-white">Pick an avatar</span>
                <button
                  type="button"
                  onClick={() => setAvatarOpen(false)}
                  className="p-2 rounded-lg hover:bg-white/10 text-white/50"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {PROJECT_CREATOR_AVATAR_URLS.map((url) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => {
                      patch({ profileImage: { type: "avatar", url } });
                      setAvatarOpen(false);
                    }}
                    className="aspect-square rounded-xl overflow-hidden border border-white/10 hover:border-indigo-500/50 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function canSubmitProjectCreatorProfile(
  value: EmployerProfile,
  requireMandatory: boolean,
): boolean {
  if (!requireMandatory) return true;
  return isMandatoryProjectCreatorSetupComplete(value);
}
