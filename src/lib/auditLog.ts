import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AuditAction =
  | "auth.sign_in"
  | "auth.sign_up"
  | "auth.sign_out"
  | "onboarding.developer_role"
  | "employer.profile_saved"
  | "employer.profile_updated"
  | "employer.project_creator_profile_completed"
  | "project.created"
  | "project.updated"
  | "project.locked"
  | "project.saved_to_firestore"
  | "tool.approved"
  | "tool.rejected"
  | "prompts.viewed"
  | "analysis.generated"
  | "ui.generated"
  | "code.generated"
  | "prompts.generated"
  | "milestone.approved"
  | "milestone.dual_approved"
  | "milestone.rejected"
  | "milestone.submitted";

export interface AuditEntry {
  id?:        string;
  uid:        string;
  action:     AuditAction;
  projectId?: string | null;
  creatorUid?: string | null;
  developerUid?: string | null;
  meta?:      Record<string, unknown>;
  timestamp:  Timestamp | null;
}

// ── Guards ────────────────────────────────────────────────────────────────────

/**
 * Returns true only for real Firebase-authenticated UIDs.
 * Demo users ("demo-guest") and empty strings are excluded.
 */
function isFirebaseUid(uid: string): boolean {
  return !!uid && uid !== "demo-guest";
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Fire-and-forget: write an audit event to Firestore.
 * Stores projectId, creatorUid and developerUid at top level for indexed security rules.
 */
export async function logAction(
  uid: string,
  action: AuditAction,
  meta?: Record<string, unknown>,
): Promise<void> {
  if (!isFirebaseUid(uid)) return;
  try {
    const projectId = meta?.projectId as string | undefined;
    const developerUid = meta?.developerUid as string | undefined;
    const creatorUid = (meta?.creatorUid || uid) as string | undefined;

    await addDoc(collection(db, "auditLog"), {
      uid,
      action,
      projectId: projectId || null,
      creatorUid: creatorUid || null,
      developerUid: developerUid || null,
      meta: meta ?? {},
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.warn("[auditLog] write failed:", err);
  }
}

// ── Read ──────────────────────────────────────────────────────────────────────

/** Load the most recent N audit entries for a user. Returns [] for demo users. */
export async function getUserAuditLog(
  uid: string,
  maxEntries = 50,
): Promise<AuditEntry[]> {
  if (!isFirebaseUid(uid)) return [];
  try {
    const q = query(
      collection(db, "auditLog"),
      where("uid", "==", uid),
      orderBy("timestamp", "desc"),
      limit(maxEntries),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AuditEntry));
  } catch (err) {
    console.warn("[auditLog] read failed:", err);
    return [];
  }
}

/** Load all audit entries for a specific project. Returns [] for demo users. */
export async function getProjectAuditLog(
  projectId: string,
  maxEntries = 50,
): Promise<AuditEntry[]> {
  if (!projectId) return [];
  try {
    const q = query(
      collection(db, "auditLog"),
      where("projectId", "==", projectId),
      orderBy("timestamp", "desc"),
      limit(maxEntries),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AuditEntry));
  } catch (err) {
    console.warn("[auditLog] project read failed:", err);
    return [];
  }
}
