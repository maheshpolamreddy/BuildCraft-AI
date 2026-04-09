/**
 * Project Execution Engine: state machine, dual-approval, deliverables tracking.
 *
 * Firestore collection: projectExecution/{projectId}
 */

import { db } from "./firebase";
import {
  doc, setDoc, getDoc, updateDoc, onSnapshot, serverTimestamp,
} from "firebase/firestore";

export type ProjectStatus =
  | "draft"
  | "matching"
  | "hiring"
  | "pending_acceptance"
  | "in_progress"
  | "review"
  | "completed"
  | "disputed";

export interface Deliverable {
  id: string;
  title: string;
  description: string;
  url?: string;
  addedAt: number;
  addedBy: string;
}

export interface CompletionApproval {
  approved: boolean;
  approvedAt: number | null;
  notes: string;
}

export interface ProjectExecution {
  projectId: string;
  savedProjectId: string;
  projectName: string;
  status: ProjectStatus;
  creatorUid: string;
  developerUid: string | null;
  hireToken: string | null;
  prdId: string | null;
  deploymentUrl: string;
  deliverables: Deliverable[];
  developerApproval: CompletionApproval;
  creatorApproval: CompletionApproval;
  completedAt: unknown;
  rating: {
    creator: number | null;
    developer: number | null;
    creatorFeedback: string;
    developerFeedback: string;
  };
  createdAt: unknown;
  updatedAt: unknown;
}

const COL = "projectExecution";

export function emptyApproval(): CompletionApproval {
  return { approved: false, approvedAt: null, notes: "" };
}

export async function initProjectExecution(data: {
  projectId: string;
  savedProjectId: string;
  projectName: string;
  creatorUid: string;
  developerUid?: string | null;
  hireToken?: string | null;
  prdId?: string | null;
}): Promise<void> {
  const ref = doc(db, COL, data.projectId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, {
      developerUid: data.developerUid ?? null,
      hireToken: data.hireToken ?? null,
      prdId: data.prdId ?? null,
      updatedAt: serverTimestamp(),
    });
    return;
  }
  await setDoc(ref, {
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
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function getProjectExecution(projectId: string): Promise<ProjectExecution | null> {
  if (!projectId) return null;
  const snap = await getDoc(doc(db, COL, projectId));
  return snap.exists() ? (snap.data() as ProjectExecution) : null;
}

export function subscribeToProjectExecution(
  projectId: string,
  onUpdate: (pe: ProjectExecution | null) => void,
  onError?: (err: string) => void,
): () => void {
  return onSnapshot(
    doc(db, COL, projectId),
    (snap) => onUpdate(snap.exists() ? (snap.data() as ProjectExecution) : null),
    (err) => { if (onError) onError(err.message); },
  );
}

export async function updateProjectStatus(projectId: string, status: ProjectStatus): Promise<void> {
  await updateDoc(doc(db, COL, projectId), { status, updatedAt: serverTimestamp() });
}

export async function setDeploymentUrl(projectId: string, url: string): Promise<void> {
  await updateDoc(doc(db, COL, projectId), { deploymentUrl: url, updatedAt: serverTimestamp() });
}

export async function addDeliverable(projectId: string, deliverable: Deliverable): Promise<void> {
  const pe = await getProjectExecution(projectId);
  if (!pe) return;
  const next = [...pe.deliverables, deliverable];
  await updateDoc(doc(db, COL, projectId), { deliverables: next, updatedAt: serverTimestamp() });
}

export async function removeDeliverable(projectId: string, deliverableId: string): Promise<void> {
  const pe = await getProjectExecution(projectId);
  if (!pe) return;
  const next = pe.deliverables.filter((d) => d.id !== deliverableId);
  await updateDoc(doc(db, COL, projectId), { deliverables: next, updatedAt: serverTimestamp() });
}

export async function developerSubmitCompletion(
  projectId: string,
  notes: string,
  deploymentUrl: string,
): Promise<void> {
  await updateDoc(doc(db, COL, projectId), {
    status: "review",
    deploymentUrl,
    developerApproval: { approved: true, approvedAt: Date.now(), notes },
    updatedAt: serverTimestamp(),
  });
}

export async function creatorApproveCompletion(
  projectId: string,
  notes: string,
): Promise<void> {
  await updateDoc(doc(db, COL, projectId), {
    status: "completed",
    creatorApproval: { approved: true, approvedAt: Date.now(), notes },
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function creatorRejectCompletion(
  projectId: string,
  notes: string,
): Promise<void> {
  await updateDoc(doc(db, COL, projectId), {
    status: "in_progress",
    creatorApproval: { approved: false, approvedAt: Date.now(), notes },
    developerApproval: emptyApproval(),
    updatedAt: serverTimestamp(),
  });
}

export async function submitRating(
  projectId: string,
  role: "creator" | "developer",
  score: number,
  feedback: string,
): Promise<void> {
  const pe = await getProjectExecution(projectId);
  if (!pe) return;
  const rating = { ...pe.rating };
  if (role === "creator") {
    rating.creator = score;
    rating.creatorFeedback = feedback;
  } else {
    rating.developer = score;
    rating.developerFeedback = feedback;
  }
  await updateDoc(doc(db, COL, projectId), { rating, updatedAt: serverTimestamp() });
}

export function canSubmitForCompletion(
  pe: ProjectExecution,
  allTasksDone: boolean,
): { ok: boolean; reason: string } {
  if (pe.status === "completed") return { ok: false, reason: "Project already completed" };
  if (pe.status === "review") return { ok: false, reason: "Already submitted for review" };
  if (!pe.developerUid) return { ok: false, reason: "No developer assigned" };
  if (!allTasksDone) return { ok: false, reason: "All tasks must be approved before submission" };
  return { ok: true, reason: "" };
}

export function canCreatorApprove(pe: ProjectExecution): { ok: boolean; reason: string } {
  if (pe.status !== "review") return { ok: false, reason: "Project must be in review status" };
  if (!pe.developerApproval.approved) return { ok: false, reason: "Developer has not submitted yet" };
  if (!pe.deploymentUrl) return { ok: false, reason: "Deployment URL is required" };
  return { ok: true, reason: "" };
}

export function getStatusLabel(status: ProjectStatus): string {
  const labels: Record<ProjectStatus, string> = {
    draft: "Draft",
    matching: "Finding Developers",
    hiring: "Hiring",
    pending_acceptance: "Awaiting Acceptance",
    in_progress: "In Progress",
    review: "Under Review",
    completed: "Completed",
    disputed: "Disputed",
  };
  return labels[status] || status;
}

export function getStatusColor(status: ProjectStatus): string {
  const colors: Record<ProjectStatus, string> = {
    draft: "text-white/40 bg-white/5 border-white/10",
    matching: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    hiring: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    pending_acceptance: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
    in_progress: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    review: "text-orange-400 bg-orange-500/10 border-orange-500/20",
    completed: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    disputed: "text-red-400 bg-red-500/10 border-red-500/20",
  };
  return colors[status] || "";
}
