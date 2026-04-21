import { db } from "./firebase";
import { listenWhenAuthed } from "./auth";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
} from "firebase/firestore";
import type { MatchedDeveloper } from "@/app/api/match-developers/route";

/**
 * Task lifecycle: pending → in-progress → completed_by_developer → approved (client).
 * reopened = client requested changes.
 */
export type TaskStatus =
  | "pending"
  | "in-progress"
  | "validating"
  | "completed_by_developer"
  | "approved"
  | "reopened";

export type MilestoneStatus = "pending" | "in_progress" | "approved";

export interface ValidationResult {
  passed: boolean;
  score: number;
  summary: string;
  checks: { label: string; passed: boolean; note: string }[];
  issues: string[];
  suggestions: string[];
}

export interface Task {
  id: string;
  title: string;
  description: string;
  type: "frontend" | "backend" | "database" | "auth" | "devops" | "testing";
  estimatedHours: number;
  priority: "high" | "medium" | "low";
  aiPrompt?: string;
  status: TaskStatus;
  submission?: string;
  validationResult?: ValidationResult | null;
  validationScore?: number;
  assignee?: string;
  version?: number;
  submittedAt?: string;
}

export interface Milestone {
  id: string;
  phase: string;
  title: string;
  description: string;
  estimatedDays: number;
  color: string;
  /** Derived from tasks when saving; all tasks approved ⇒ approved */
  status?: MilestoneStatus;
  tasks: Task[];
}

/** Map legacy / AI-generated statuses into the current workflow */
export function normalizeTaskStatus(raw: unknown): TaskStatus {
  const s = typeof raw === "string" ? raw : "pending";
  switch (s) {
    case "todo":
      return "pending";
    case "review":
      return "completed_by_developer";
    case "rejected":
      return "reopened";
    case "approved_creator":
    case "approved_by_both":
      return "approved";
    default:
      break;
  }
  if (
    s === "pending" ||
    s === "in-progress" ||
    s === "validating" ||
    s === "completed_by_developer" ||
    s === "approved" ||
    s === "reopened"
  ) {
    return s;
  }
  return "pending";
}

function normalizeTask(t: Task): Task {
  return { ...t, status: normalizeTaskStatus(t.status) };
}

/** Milestone approved iff every task is client-approved */
export function deriveMilestoneStatus(m: Milestone): MilestoneStatus {
  if (!m.tasks.length) return "pending";
  const statuses = m.tasks.map((t) => normalizeTaskStatus(t.status));
  if (statuses.every((st) => st === "approved")) return "approved";
  if (statuses.every((st) => st === "pending")) return "pending";
  return "in_progress";
}

/** Normalize tasks + set milestone.status for Firestore */
export function withDerivedMilestoneStatuses(milestones: Milestone[]): Milestone[] {
  return milestones.map((m) => {
    const tasks = m.tasks.map(normalizeTask);
    const milestone = { ...m, tasks };
    return { ...milestone, status: deriveMilestoneStatus(milestone) };
  });
}

export interface WorkspaceState {
  projectId: string;
  uid?: string; // Creator's Firebase UID
  milestones: Milestone[];
  matchedDevelopers?: MatchedDeveloper[] | null;
  updatedAt: number;
}

/**
 * Ensures a workspace document exists for the project.
 */
export async function initializeWorkspace(projectId: string, initialMilestones: Milestone[], uid?: string): Promise<void> {
  if (!projectId) return;
  const ref = doc(db, "projectWorkspaces", projectId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      projectId,
      uid,
      milestones: initialMilestones,
      updatedAt: Date.now(),
    });
  }
}

/**
 * Gets the current workspace state once.
 */
export async function getWorkspaceState(projectId: string): Promise<WorkspaceState | null> {
  if (!projectId) return null;
  const ref = doc(db, "projectWorkspaces", projectId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as WorkspaceState;
}

/**
 * Replaces all milestones in the project workspace.
 */
export async function setWorkspaceMilestones(projectId: string, milestones: Milestone[], uid?: string): Promise<void> {
  if (!projectId) return;
  const ref = doc(db, "projectWorkspaces", projectId);
  await setDoc(ref, {
    projectId,
    uid,
    milestones,
    updatedAt: Date.now(),
  }, { merge: true });
}

/**
 * Updates a specific task's status and/or submission within a milestone.
 * Since Firestore doesn't support deep nested array updates easily, we merge the whole array.
 */
export async function updateWorkspaceTask(
  projectId: string,
  milestoneId: string,
  taskId: string,
  updates: Partial<Task>
): Promise<boolean> {
  if (!projectId) return false;
  const ref = doc(db, "projectWorkspaces", projectId);
  const snap = await getDoc(ref);
  
  if (!snap.exists()) return false;

  const data = snap.data() as WorkspaceState;
  let changed = false;

  const newMilestones = data.milestones.map(m => {
    if (m.id !== milestoneId) return m;
    return {
      ...m,
      tasks: m.tasks.map(t => {
        if (t.id !== taskId) return t;
        changed = true;
        return { ...t, ...updates };
      })
    };
  });

  if (changed) {
    await updateDoc(ref, {
      milestones: newMilestones,
      updatedAt: Date.now(),
    });
  }
  
  return changed;
}

/**
 * Subscribe to real-time milestone updates.
 * `expectedUid` must be the signed-in Firebase user (token must match for rules).
 */
export function subscribeToWorkspace(
  projectId: string,
  expectedUid: string,
  onUpdate: (state: WorkspaceState | null) => void,
  onError?: (err: string) => void,
): () => void {
  return listenWhenAuthed(expectedUid, () => {
    const ref = doc(db, "projectWorkspaces", projectId);
    return onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          onUpdate(snap.data() as WorkspaceState);
        } else {
          onUpdate(null);
        }
      },
      (err) => {
        if (err.code !== "permission-denied") console.warn("Workspace sync error:", err);
        if (onError) onError(err.message);
      },
    );
  });
}
/**
 * Replaces the matched developers in the project workspace.
 */
export async function setWorkspaceMatchedDevelopers(projectId: string, developers: MatchedDeveloper[], uid?: string): Promise<void> {
  if (!projectId) return;
  const ref = doc(db, "projectWorkspaces", projectId);
  await setDoc(ref, {
    uid,
    matchedDevelopers: developers,
    updatedAt: Date.now(),
  }, { merge: true });
}
