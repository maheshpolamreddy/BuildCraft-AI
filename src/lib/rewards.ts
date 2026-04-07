/**
 * Rewards system: badge upgrades, portfolio updates, ranking boosts after project completion.
 */

import { getDeveloperProfile, updateDeveloperProfileField, type DeveloperProfile } from "./developerProfile";

export async function awardProjectVerifiedBadge(developerUid: string): Promise<void> {
  const profile = await getDeveloperProfile(developerUid);
  if (!profile) return;

  const updates: Partial<DeveloperProfile> = {};

  if (profile.verificationStatus !== "project-verified") {
    updates.verificationStatus = "project-verified";
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

export async function processCompletionRewards(
  developerUid: string,
  projectName: string,
): Promise<{ badgeUpgraded: boolean; portfolioUpdated: boolean }> {
  let badgeUpgraded = false;
  let portfolioUpdated = false;

  try {
    const before = await getDeveloperProfile(developerUid);
    await awardProjectVerifiedBadge(developerUid);
    const after = await getDeveloperProfile(developerUid);
    badgeUpgraded = before?.verificationStatus !== after?.verificationStatus;
  } catch (e) {
    console.warn("[rewards] badge upgrade failed:", e);
  }

  try {
    await addProjectToPortfolio(developerUid, `Completed: ${projectName}`);
    portfolioUpdated = true;
  } catch (e) {
    console.warn("[rewards] portfolio update failed:", e);
  }

  return { badgeUpgraded, portfolioUpdated };
}
