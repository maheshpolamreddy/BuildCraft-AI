import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  doc,
  serverTimestamp,
  Timestamp,
  onSnapshot,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import { listenWhenAuthed } from "./auth";

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
  | "milestone.submitted"
  | "project.completion_submitted"
  | "project.completed";

export interface AuditEntry {
  id?: string;
  uid: string;
  action: AuditAction;
  projectId?: string | null;
  creatorUid?: string | null;
  developerUid?: string | null;
  meta?: Record<string, unknown>;
  timestamp: Timestamp | null;
}

// ── Guards ────────────────────────────────────────────────────────────────────

function isFirebaseUid(uid: string): boolean {
  return !!uid && uid !== "demo-guest";
}

function tsSeconds(t: Timestamp | null | undefined): number {
  return t?.seconds ?? 0;
}

/** Resolve creator + developer UIDs from the saved project doc (for rules + audit display). */
async function resolveProjectParties(
  projectId: string,
): Promise<{ creatorUid: string | null; developerUid: string | null }> {
  try {
    const snap = await getDoc(doc(db, "projects", projectId));
    if (!snap.exists()) return { creatorUid: null, developerUid: null };
    const d = snap.data() as Record<string, unknown>;
    const nested = d.project as Record<string, unknown> | undefined;
    const creator =
      (typeof d.uid === "string" && d.uid ? d.uid : null) ??
      (nested && typeof nested.creatorUid === "string" ? nested.creatorUid : null);
    const developer =
      (typeof d.developerUid === "string" && d.developerUid ? d.developerUid : null) ??
      (nested && typeof nested.developerUid === "string" ? nested.developerUid : null);
    return { creatorUid: creator, developerUid: developer };
  } catch {
    return { creatorUid: null, developerUid: null };
  }
}

function mapSubAuditDoc(d: QueryDocumentSnapshot, projectId: string): AuditEntry {
  const x = d.data() as Record<string, unknown>;
  return {
    id: d.id,
    uid: String(x.performedByUid ?? ""),
    action: x.action as AuditAction,
    projectId,
    creatorUid: (x.creatorUid as string | null) ?? null,
    developerUid: (x.developerUid as string | null) ?? null,
    meta: (x.meta as Record<string, unknown>) ?? {},
    timestamp: (x.timestamp as Timestamp | null) ?? null,
  };
}

function dedupeKey(e: AuditEntry): string {
  return `${e.action}_${e.uid}_${tsSeconds(e.timestamp)}`;
}

function mergeAndDedupe(a: AuditEntry[], b: AuditEntry[], maxEntries: number): AuditEntry[] {
  const seen = new Set<string>();
  const merged = [...a, ...b].sort((x, y) => tsSeconds(y.timestamp) - tsSeconds(x.timestamp));
  const out: AuditEntry[] = [];
  for (const e of merged) {
    const k = dedupeKey(e);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
    if (out.length >= maxEntries) break;
  }
  return out;
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Write an audit event. When `meta.projectId` is set, resolves creator/developer from the
 * project doc so both parties can read (Firestore rules), and mirrors to
 * `projects/{projectId}/audit_logs` for the project timeline.
 */
export async function logAction(
  uid: string,
  action: AuditAction,
  meta?: Record<string, unknown>,
): Promise<void> {
  if (!isFirebaseUid(uid)) return;
  try {
    const projectId = typeof meta?.projectId === "string" ? meta.projectId : undefined;
    let developerUid = meta?.developerUid as string | undefined;
    let creatorUid = (meta?.creatorUid as string | undefined) || undefined;

    if (projectId && (!creatorUid || !developerUid)) {
      const resolved = await resolveProjectParties(projectId);
      creatorUid = creatorUid || resolved.creatorUid || undefined;
      developerUid = developerUid || resolved.developerUid || undefined;
    }
    if (!creatorUid) creatorUid = uid;

    await addDoc(collection(db, "auditLog"), {
      uid,
      action,
      projectId: projectId || null,
      creatorUid: creatorUid || null,
      developerUid: developerUid || null,
      meta: meta ?? {},
      timestamp: serverTimestamp(),
    });

    if (projectId) {
      await addDoc(collection(db, "projects", projectId, "audit_logs"), {
        performedByUid: uid,
        action,
        creatorUid: creatorUid || null,
        developerUid: developerUid || null,
        meta: meta ?? {},
        timestamp: serverTimestamp(),
      });
    }
  } catch (err) {
    console.warn("[auditLog] write failed:", err);
  }
}

// ── Read ──────────────────────────────────────────────────────────────────────

/** Legacy top-level audit rows only (used when merging). */
async function getProjectAuditLogLegacy(
  projectId: string,
  maxEntries: number,
): Promise<AuditEntry[]> {
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
    console.warn("[auditLog] legacy project read failed:", err);
    return [];
  }
}

/** Load the most recent N audit entries for a user. Returns [] for demo users. */
export async function getUserAuditLog(uid: string, maxEntries = 50): Promise<AuditEntry[]> {
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

/** Load project-scoped audit: subcollection + legacy `auditLog` rows, de-duplicated. */
export async function getProjectAuditLog(projectId: string, maxEntries = 50): Promise<AuditEntry[]> {
  if (!projectId) return [];
  try {
    const [subSnap, legacy] = await Promise.all([
      getDocs(
        query(
          collection(db, "projects", projectId, "audit_logs"),
          orderBy("timestamp", "desc"),
          limit(maxEntries),
        ),
      ).catch(() => null),
      getProjectAuditLogLegacy(projectId, maxEntries),
    ]);
    const sub = subSnap?.docs?.map((d) => mapSubAuditDoc(d, projectId)) ?? [];
    return mergeAndDedupe(sub, legacy, maxEntries);
  } catch (err) {
    console.warn("[auditLog] project read failed:", err);
    return getProjectAuditLogLegacy(projectId, maxEntries);
  }
}

/**
 * Real-time project audit: subcollection updates merged with a one-time legacy fetch.
 */
export function subscribeProjectAuditLog(
  projectId: string,
  expectedUid: string,
  onUpdate: (entries: AuditEntry[]) => void,
  maxEntries = 40,
): () => void {
  if (!projectId || !expectedUid || expectedUid === "demo-guest") return () => {};
  return listenWhenAuthed(expectedUid, () => {
    let cancelled = false;
    let unsubSnapshot: (() => void) | null = null;

    void getProjectAuditLogLegacy(projectId, maxEntries).then((legacy) => {
      if (cancelled) return;
      const q = query(
        collection(db, "projects", projectId, "audit_logs"),
        orderBy("timestamp", "desc"),
        limit(maxEntries),
      );
      unsubSnapshot = onSnapshot(
        q,
        (snap) => {
          const sub = snap.docs.map((d) => mapSubAuditDoc(d, projectId));
          onUpdate(mergeAndDedupe(sub, legacy, maxEntries));
        },
        (err) => {
          if (err.code !== "permission-denied") {
            console.warn("[auditLog] subscribeProjectAuditLog:", err);
          }
        },
      );
    });

    return () => {
      cancelled = true;
      unsubSnapshot?.();
    };
  });
}
