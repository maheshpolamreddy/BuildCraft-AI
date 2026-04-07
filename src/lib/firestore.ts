import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import type { ProjectState } from "@/store/useStore";

/** True only for real Firebase-authenticated UIDs (not demo-guest or empty). */
function isFirebaseUid(uid: string): boolean {
  return !!uid && uid !== "demo-guest";
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SavedProject {
  id:           string;
  uid:          string; // Creator UID
  developerUid?: string; // Hired Developer UID (if any)
  project:      ProjectState;
  approvedTools: Record<string, boolean | undefined>;
  createdAt:    Timestamp | null;
  updatedAt:    Timestamp | null;
  deletedAt?:   Timestamp | null;
}

// ── User profile ──────────────────────────────────────────────────────────────

export async function getUserProfile(uid: string) {
  if (!isFirebaseUid(uid)) return null;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

export async function updateUserProfile(uid: string, data: Record<string, unknown>) {
  if (!isFirebaseUid(uid)) return;
  try {
    await setDoc(
      doc(db, "users", uid),
      { ...data, updatedAt: serverTimestamp() },
      { merge: true },
    );
  } catch (err) { console.warn("[firestore] updateUserProfile failed:", err); }
}

// ── Projects ──────────────────────────────────────────────────────────────────

/** Save a project for the signed-in user. No-ops silently for demo users. */
export async function saveProject(
  uid: string,
  project: ProjectState,
  approvedTools: Record<string, boolean | undefined>,
): Promise<string> {
  if (!isFirebaseUid(uid)) return "";
  const id  = `${uid}_${Date.now()}`;
  const ref = doc(db, "projects", id);
  try {
    await setDoc(ref, {
      id,
      uid,
      project,
      approvedTools,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) { console.warn("[firestore] saveProject failed:", err); }
  return id;
}

/** Update an existing saved project. No-ops silently on error. */
export async function updateProject(
  docId: string,
  project: ProjectState,
  approvedTools: Record<string, boolean | undefined>,
) {
  if (!docId) return;
  try {
    await updateDoc(doc(db, "projects", docId), {
      project,
      approvedTools,
      updatedAt: serverTimestamp(),
    });
  } catch (err) { console.warn("[firestore] updateProject failed:", err); }
}

/** Load all projects belonging to a user, newest first. Returns [] for demo users. */
export async function getUserProjects(uid: string): Promise<SavedProject[]> {
  if (!isFirebaseUid(uid)) return [];
  try {
    const q = query(
      collection(db, "projects"),
      where("uid", "==", uid)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as SavedProject);
  } catch (err) { console.warn("[firestore] getUserProjects failed:", err); return []; }
}

/** Load a single saved project by doc ID. */
export async function getProject(docId: string): Promise<SavedProject | null> {
  if (!docId) return null;
  try {
    const snap = await getDoc(doc(db, "projects", docId));
    return snap.exists() ? (snap.data() as SavedProject) : null;
  } catch { return null; }
}

/** Soft Delete a saved project. */
export async function deleteProject(docId: string) {
  if (!docId) return;
  try {
    await updateDoc(doc(db, "projects", docId), {
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) { console.warn("[firestore] deleteProject failed:", err); }
}

/** Restore a soft-deleted project. */
export async function restoreProject(docId: string) {
  if (!docId) return;
  try {
    await updateDoc(doc(db, "projects", docId), {
      deletedAt: null,
      updatedAt: serverTimestamp(),
    });
  } catch (err) { console.warn("[firestore] restoreProject failed:", err); }
}
