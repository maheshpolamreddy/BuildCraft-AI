import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import type { ProjectState } from "@/store/useStore";
import { extractUploadedFileNameFromIdea, resolveProjectDisplayName } from "@/lib/projectName";

/** Persist a non-empty `project.name` when the model left it blank but `idea` has an upload marker. */
function withResolvedProjectName(project: ProjectState): ProjectState {
  return {
    ...project,
    name: resolveProjectDisplayName(project.name, extractUploadedFileNameFromIdea(project.idea)),
  };
}

/** True only for real Firebase-authenticated UIDs (not demo-guest or empty). */
function isFirebaseUid(uid: string): boolean {
  return !!uid && uid !== "demo-guest";
}

/** Normalize so `where("email", "==", …)` matches how we store and how Auth returns emails. */
function normalizeAuthEmail(email: string | undefined | null): string | undefined {
  const t = typeof email === "string" ? email.trim().toLowerCase() : "";
  return t.length > 0 ? t : undefined;
}

/** Firestore rejects `undefined` anywhere in document data. JSON round-trip removes undefined keys. */
function cloneJson<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Stay under Firestore's ~1 MiB document limit when Stitch / preview HTML is huge. */
const MAX_LANDING_HTML_CHARS = 450_000;

function truncateLargeProjectFields(project: ProjectState): ProjectState {
  const lp = project.landingPage;
  if (!lp?.html || lp.html.length <= MAX_LANDING_HTML_CHARS) return project;
  return {
    ...project,
    landingPage: {
      ...lp,
      html: `${lp.html.slice(0, MAX_LANDING_HTML_CHARS)}\n<!-- truncated for Firestore storage -->`,
    },
  };
}

/**
 * Produces JSON-safe project data: no undefined (nested), bounded size, stable creator fields.
 */
function sanitizeProjectForWrite(
  project: ProjectState,
  defaults: { uid: string; email?: string },
): ProjectState {
  const trimmed = truncateLargeProjectFields(project);
  const named = withResolvedProjectName(trimmed);
  const emailNorm = normalizeAuthEmail(defaults.email ?? named.creatorEmail);
  const merged: ProjectState = {
    ...named,
    creatorUid: named.creatorUid || defaults.uid,
    ...(emailNorm ? { creatorEmail: emailNorm } : {}),
  };
  return cloneJson(merged);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SavedProject {
  id:           string;
  uid:          string; // Creator UID
  email?:       string; // Creator Email (Recovery)
  developerUid?: string; // Hired Developer UID (if any)
  project:      ProjectState;
  approvedTools: Record<string, boolean | undefined>;
  createdAt:    Timestamp | null;
  updatedAt:    Timestamp | null;
  deletedAt?:   Timestamp | null;
}

/** Sort key for project lists (newest first). */
export function firestoreTimestampSeconds(ts: Timestamp | null | undefined): number {
  return ts?.seconds ?? 0;
}

/**
 * Lists and React keys require a stable `id`. Prefer the field on the document; fall back to the
 * Firestore document id (legacy rows sometimes omitted `id` in the payload).
 */
export function savedProjectFromSnapshot(docId: string, data: Record<string, unknown>): SavedProject {
  const raw = data as Partial<SavedProject>;
  const id = typeof raw.id === "string" && raw.id.length > 0 ? raw.id : docId;
  return {
    ...raw,
    id,
    uid: typeof raw.uid === "string" ? raw.uid : "",
    project: raw.project as ProjectState,
    approvedTools: raw.approvedTools ?? {},
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
    deletedAt: raw.deletedAt,
    developerUid: raw.developerUid,
    email: raw.email,
  } as SavedProject;
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

/**
 * Save a new project document. Returns the doc id only after Firestore accepts the write.
 * Sanitizes nested `undefined` values (Firestore rejects them) and retries transient failures.
 */
export async function saveProject(
  uid: string,
  project: ProjectState,
  approvedTools: Record<string, boolean | undefined>,
  email?: string,
): Promise<string> {
  if (!isFirebaseUid(uid)) return "";
  const id = `${uid}_${Date.now()}`;
  const ref = doc(db, "projects", id);
  const emailNorm = normalizeAuthEmail(email);
  const projectPayload = sanitizeProjectForWrite(project, { uid, email: emailNorm });
  const toolsPayload = cloneJson(approvedTools ?? {});

  const data: Record<string, unknown> = {
    id,
    uid,
    project: projectPayload,
    approvedTools: toolsPayload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (emailNorm) data.email = emailNorm;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await setDoc(ref, data);
      return id;
    } catch (err) {
      lastErr = err;
      console.warn(`[firestore] saveProject attempt ${attempt + 1}/3 failed:`, err);
      if (attempt < 2) await sleep(250 * (attempt + 1));
    }
  }
  console.warn("[firestore] saveProject failed after retries:", lastErr);
  return "";
}

/** Update an existing saved project. No-ops silently on error. */
export async function updateProject(
  docId: string,
  project: ProjectState,
  approvedTools: Record<string, boolean | undefined>,
) {
  if (!docId) return;
  const ownerUid = project.creatorUid ?? "";
  const emailNorm = normalizeAuthEmail(project.creatorEmail);
  const projectPayload = sanitizeProjectForWrite(project, { uid: ownerUid, email: emailNorm });
  try {
    await updateDoc(doc(db, "projects", docId), {
      project: projectPayload,
      approvedTools: cloneJson(approvedTools ?? {}),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn("[firestore] updateProject failed:", err);
  }
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
    return snap.docs.map((d) => savedProjectFromSnapshot(d.id, d.data() as Record<string, unknown>));
  } catch (err) { console.warn("[firestore] getUserProjects failed:", err); return []; }
}

/**
 * Load projects by creator email (recovery / multi-device). Queries lowercase and exact trimmed
 * variants so older rows stored with mixed-case email still match.
 */
export async function getProjectsByEmail(email: string): Promise<SavedProject[]> {
  const trimmed = typeof email === "string" ? email.trim() : "";
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  const variants = lower === trimmed ? [lower] : [lower, trimmed];
  const merged = new Map<string, SavedProject>();
  for (const v of variants) {
    try {
      const q = query(collection(db, "projects"), where("email", "==", v));
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        const sp = savedProjectFromSnapshot(d.id, d.data() as Record<string, unknown>);
        const prev = merged.get(sp.id);
        if (
          !prev ||
          firestoreTimestampSeconds(sp.updatedAt) >= firestoreTimestampSeconds(prev.updatedAt)
        ) {
          merged.set(sp.id, sp);
        }
      }
    } catch (err) {
      console.warn("[firestore] getProjectsByEmail failed for variant:", v, err);
    }
  }
  return Array.from(merged.values());
}

/** Load a single saved project by doc ID. */
export async function getProject(docId: string): Promise<SavedProject | null> {
  if (!docId) return null;
  try {
    const snap = await getDoc(doc(db, "projects", docId));
    if (!snap.exists()) return null;
    return savedProjectFromSnapshot(snap.id, snap.data() as Record<string, unknown>);
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

/** Set the developerUid on a project (client-side, uses Firestore rules for auth). */
export async function claimProjectAsDeveloper(docId: string, developerUid: string): Promise<boolean> {
  if (!docId || !developerUid) return false;
  try {
    await updateDoc(doc(db, "projects", docId), { developerUid });
    return true;
  } catch (err) {
    console.warn("[firestore] claimProjectAsDeveloper failed:", err);
    return false;
  }
}

/**
 * Mirror nested `project.developerUid` to top-level `developerUid` when missing.
 * Firestore security rules and some APIs rely on the top-level field.
 */
export async function syncDeveloperUidToProjectRoot(docId: string): Promise<void> {
  if (!docId) return;
  try {
    const saved = await getProject(docId);
    if (!saved) return;
    const nested = saved.project?.developerUid?.trim();
    const top = typeof saved.developerUid === "string" ? saved.developerUid.trim() : "";
    if (nested && !top) {
      await updateDoc(doc(db, "projects", docId), {
        developerUid: nested,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    console.warn("[firestore] syncDeveloperUidToProjectRoot:", err);
  }
}
