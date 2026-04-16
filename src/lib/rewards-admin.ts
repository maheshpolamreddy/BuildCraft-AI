/**
 * Server-only completion rewards (Admin SDK). Client cannot write another user's developerProfiles.
 */

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin";

const PROJECT_VERIFIED_BADGE = "Project Verified";

export async function processCompletionRewardsAdmin(
  developerUid: string,
  projectName: string,
  projectId: string,
): Promise<void> {
  if (!developerUid?.trim() || !projectId?.trim()) return;

  const ref = adminDb.collection("developerProfiles").doc(developerUid);
  const snap = await ref.get();
  const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};

  const prevBadges = Array.isArray(data.earnedBadges) ? [...(data.earnedBadges as string[])] : [];
  if (!prevBadges.includes(PROJECT_VERIFIED_BADGE)) prevBadges.push(PROJECT_VERIFIED_BADGE);

  const prevIds = Array.isArray(data.completedProjectIds)
    ? [...(data.completedProjectIds as string[])]
    : [];
  const ids = [...new Set([...prevIds, projectId])];

  const portfolio = Array.isArray(data.projectDescriptions)
    ? [...(data.projectDescriptions as string[])]
    : [];
  const line = `Completed: ${projectName}`;
  const nextPortfolio = portfolio.includes(line) ? portfolio : [...portfolio, line].slice(-10);

  await ref.set(
    {
      verificationStatus: "project-verified",
      tierLabel: "Tier 3",
      earnedBadges: prevBadges,
      completedProjectIds: ids,
      completedProjectsCount: ids.length,
      projectDescriptions: nextPortfolio,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}