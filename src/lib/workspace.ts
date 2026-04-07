import { db } from "./firebase";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  onSnapshot,
} from "firebase/firestore";

export type TaskStatus = "todo" | "in-progress" | "validating" | "review" | "approved" | "rejected";

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
  tasks: Task[];
}

export interface WorkspaceState {
  projectId: string;
  milestones: Milestone[];
  matchedDevelopers?: any[] | null;
  updatedAt: number;
}

/**
 * Ensures a workspace document exists for the project.
 */
export async function initializeWorkspace(projectId: string, initialMilestones: Milestone[]): Promise<void> {
  if (!projectId) return;
  const ref = doc(db, "projectWorkspaces", projectId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      projectId,
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
export async function setWorkspaceMilestones(projectId: string, milestones: Milestone[]): Promise<void> {
  if (!projectId) return;
  const ref = doc(db, "projectWorkspaces", projectId);
  await setDoc(ref, {
    projectId,
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
 * Returns an unsubscribe function.
 */
export function subscribeToWorkspace(
  projectId: string,
  onUpdate: (state: WorkspaceState | null) => void,
  onError?: (err: string) => void
): () => void {
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
      console.warn("Workspace sync error:", err);
      if (onError) onError(err.message);
    }
  );
}
/**
 * Replaces the matched developers in the project workspace.
 */
export async function setWorkspaceMatchedDevelopers(projectId: string, developers: any[]): Promise<void> {
  if (!projectId) return;
  const ref = doc(db, "projectWorkspaces", projectId);
  await setDoc(ref, {
    matchedDevelopers: developers,
    updatedAt: Date.now(),
  }, { merge: true });
}
