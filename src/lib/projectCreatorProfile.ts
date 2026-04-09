import type { EmployerProfile, ProfileImageMeta } from "@/store/useStore";

export const PROJECT_CREATOR_AVATAR_URLS = [
  "/avatars/bot-1.svg",
  "/avatars/bot-2.svg",
  "/avatars/bot-3.svg",
  "/avatars/bot-4.svg",
  "/avatars/bot-5.svg",
  "/avatars/bot-6.svg",
] as const;

export function normalizeEmployerProfile(raw: unknown): EmployerProfile {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const img = o.profileImage;
  let profileImage: ProfileImageMeta | null = null;
  if (img && typeof img === "object" && img !== null) {
    const p = img as Record<string, unknown>;
    const type = p.type;
    const url = String(p.url ?? "");
    if (url && (type === "upload" || type === "avatar")) {
      profileImage = { type, url };
    }
  }
  return {
    fullName: String(o.fullName ?? ""),
    companyName: String(o.companyName ?? ""),
    jobTitle: String(o.jobTitle ?? ""),
    phone: String(o.phone ?? ""),
    website: String(o.website ?? ""),
    experience: String(o.experience ?? ""),
    projectInterests: String(o.projectInterests ?? ""),
    profileImage,
  };
}

export function legacyProjectCreatorProfileLooksComplete(ep: EmployerProfile): boolean {
  return (
    ep.fullName.trim().length > 0 &&
    ep.companyName.trim().length > 0 &&
    ep.jobTitle.trim().length > 0
  );
}

export function isMandatoryProjectCreatorSetupComplete(ep: EmployerProfile): boolean {
  const exp = (ep.experience?.trim() || ep.jobTitle?.trim() || "").length > 0;
  return (
    ep.fullName.trim().length > 0 &&
    ep.companyName.trim().length > 0 &&
    exp &&
    ep.projectInterests.trim().length > 0
  );
}

export function inferProjectCreatorProfileCompletedFromProfile(ep: EmployerProfile): boolean {
  return (
    legacyProjectCreatorProfileLooksComplete(ep) ||
    isMandatoryProjectCreatorSetupComplete(ep)
  );
}

export function resolveProjectCreatorProfileCompletedFromFirestore(
  flag: unknown,
  ep: EmployerProfile,
): boolean {
  if (flag === true) return true;
  if (flag === false) return false;
  return inferProjectCreatorProfileCompletedFromProfile(ep);
}