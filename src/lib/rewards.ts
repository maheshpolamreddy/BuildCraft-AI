/**
 * Rewards system: Tier 3 (project-verified), badges, portfolio, matching boost metadata after dual completion.
 */

import {
  getDeveloperProfile,
  updateDeveloperProfileField,
  type DeveloperProfile,
} from "./developerProfile";

const PROJECT_VERIFIED_BADGE = "Project Verified";

export async function awardProjectVerifiedBadge(developerUid: string): Promise<void> {
  const profile = await getDeveloperProfile(developerUid);
  if (!profile) return;

  const updates: Partial<DeveloperProfile> = {};

  // Promote to Tier 3 when a hired project completes (server calls this). Never downgrade.
  if (profile.verificationStatus !== "project-verified") {
    updates.verificationStatus = "project-verified";
    updates.tierLabel = "Tier 3 · Diamond";
  }

  if (Object.keys(updates).length > 0) {
    await updateDeveloperProfileField(developerUid, updates);
  }
}

export async function addProjectToPortfolio(
  developerUid: string,
  projectDescription: string,
): Promise<void> {
  const profile = await getDeveloperProfile(developerUid);
  if (!profile) return;

  const existing = profile.projectDescriptions || [];
  if (existing.includes(projectDescription)) return;

  const updated = [...existing, projectDescription].slice(-10);
  await updateDeveloperProfileField(developerUid, { projectDescriptions: updated });
}

function mergeBadges(profile: DeveloperProfile | null): string[] {
  const prev = Array.isArray(profile?.earnedBadges) ? [...profile!.earnedBadges!] : [];
  if (!prev.includes(PROJECT_VERIFIED_BADGE)) prev.push(PROJECT_VERIFIED_BADGE);
  return prev;
}

function mergeCompletedProjects(
  profile: DeveloperProfile | null,
  projectId: string,
): { ids: string[]; count: number } {
  const prev = Array.isArray(profile?.completedProjectIds) ? [...profile!.completedProjectIds!] : [];
  const ids = [...new Set([...prev, projectId])];
  return { ids, count: ids.length };
}

/**
 * Runs after client approves final completion (dual approval). Idempotent per projectId.
 */
export async function processCompletionRewards(
  developerUid: string,
  projectName: string,
  projectId: string,
): Promise<{ badgeUpgraded: boolean; portfolioUpdated: boolean; tier3: boolean }> {
  let badgeUpgraded = false;
  let portfolioUpdated = false;
  let tier3 = false;

  try {
    const before = await getDeveloperProfile(developerUid);
    await awardProjectVerifiedBadge(developerUid);
    const mid = await getDeveloperProfile(developerUid);
    badgeUpgraded = before?.verificationStatus !== mid?.verificationStatus;
    tier3 = mid?.verificationStatus === "project-verified";

    const { ids, count } = mergeCompletedProjects(mid, projectId);
    const badges = mergeBadges(mid);
    await updateDeveloperProfileField(developerUid, {
      earnedBadges: badges,
      completedProjectIds: ids,
      completedProjectsCount: count,
      tierLabel: "Tier 3 · Diamond",
    });
  } catch (e) {
    console.warn("[rewards] profile upgrade failed:", e);
  }

  try {
    await addProjectToPortfolio(developerUid, `Completed: ${projectName}`);
    portfolioUpdated = true;
  } catch (e) {
    console.warn("[rewards] portfolio update failed:", e);
  }

  return { badgeUpgraded, portfolioUpdated, tier3 };
}
