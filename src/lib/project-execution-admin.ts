/**
 * Server-only projectExecution writes (hire accept on Vercel must not use the browser Firebase SDK).
 */

import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";

function emptyApproval() {
  return { approved: false, approvedAt: null, notes: "" };
}

export async function initProjectExecutionAdmin(
  db: Firestore,
  data: {
    projectId: string;
    savedProjectId: string;
    projectName: string;
    creatorUid: string;
    developerUid?: string | null;
    hireToken?: string | null;
    prdId?: string | null;
  },
): Promise<void> {
  const ref = db.collection("projectExecution").doc(data.projectId);
  const snap = await ref.get();
  if (snap.exists) {
    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (data.developerUid != null && String(data.developerUid).trim() !== "") {
      patch.developerUid = data.developerUid;
    }
    if (data.hireToken !== undefined) patch.hireToken = data.hireToken;
    if (data.prdId !== undefined) patch.prdId = data.prdId;
    await ref.update(patch);
    return;
  }
  await ref.set({
    projectId: data.projectId,
    savedProjectId: data.savedProjectId,
    projectName: data.projectName,
    status: data.developerUid ? "in_progress" : "draft",
    creatorUid: data.creatorUid,
    developerUid: data.developerUid ?? null,
    hireToken: data.hireToken ?? null,
    prdId: data.prdId ?? null,
    deploymentUrl: "",
    deliverables: [],
    developerApproval: emptyApproval(),
    creatorApproval: emptyApproval(),
    completedAt: null,
    rating: { creator: null, developer: null, creatorFeedback: "", developerFeedback: "" },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}