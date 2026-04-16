/**
 * Firestore helpers for the hire-request workflow.
 *
 * Collection: hireRequests/{token}
 * {
 *   token, status: "pending"|"accepted"|"rejected"|"expired",
 *   projectId, projectName, projectSummary, projectIdea,
 *   creatorUid, creatorName, creatorEmail,
 *   developerUid, developerName, developerEmail,
 *   createdAt, expiresAt, respondedAt
 * }
 */

import { db } from "./firebase";
import {
  doc, setDoc, getDoc, updateDoc,
  collection, query, where, getDocs, onSnapshot,
  serverTimestamp, Timestamp,
} from "firebase/firestore";

export interface HireRequest {
  token:          string;
  status:         "pending" | "accepted" | "rejected" | "expired";
  projectId:      string | null;
  projectName:    string;
  projectSummary: string;
  projectIdea:    string;
  creatorUid:     string;
  creatorName:    string;
  creatorEmail:   string;
  developerUid:   string;
  developerName:  string;
  developerEmail: string;
  prdId:          string | null;
  createdAt:      Timestamp | null;
  expiresAt:      Timestamp | null;
  respondedAt:    Timestamp | null;
}

function makeToken(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  }
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createHireRequest(data: Omit<HireRequest, "token" | "status" | "prdId" | "createdAt" | "expiresAt" | "respondedAt">): Promise<string> {
  const token = makeToken();
  const now   = Date.now();
  const expires = new Date(now + 48 * 60 * 60 * 1000); // 48 h

  await setDoc(doc(db, "hireRequests", token), {
    ...data,
    token,
    status:      "pending",
    prdId:       null,
    createdAt:   serverTimestamp(),
    expiresAt:   Timestamp.fromDate(expires),
    respondedAt: null,
  });
  return token;
}

export async function getHireRequest(token: string): Promise<HireRequest | null> {
  const snap = await getDoc(doc(db, "hireRequests", token));
  if (!snap.exists()) return null;
  const data = snap.data() as HireRequest;
  // Auto-expire
  if (data.status === "pending" && data.expiresAt) {
    const expiresMs = data.expiresAt.toMillis();
    if (Date.now() > expiresMs) {
      await updateDoc(doc(db, "hireRequests", token), { status: "expired" });
      return { ...data, status: "expired" };
    }
  }
  return data;
}

export async function respondToHireRequest(token: string, status: "accepted" | "rejected"): Promise<void> {
  await updateDoc(doc(db, "hireRequests", token), {
    status,
    respondedAt: serverTimestamp(),
  });
}

export async function setPrdOnRequest(token: string, prdId: string): Promise<void> {
  await updateDoc(doc(db, "hireRequests", token), { prdId });
}

export async function getHireRequestsByCreator(creatorUid: string): Promise<HireRequest[]> {
  const q    = query(collection(db, "hireRequests"), where("creatorUid", "==", creatorUid));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as HireRequest);
}

export async function getHireRequestsByDeveloper(developerUid: string): Promise<HireRequest[]> {
  const q    = query(collection(db, "hireRequests"), where("developerUid", "==", developerUid));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as HireRequest);
}

/** Live updates for developer dashboard (invites, accepted, closed). */
export function subscribeHireRequestsByDeveloper(
  developerUid: string,
  onUpdate: (rows: HireRequest[]) => void,
  onError?: (msg: string) => void,
): () => void {
  if (!developerUid || developerUid === "demo-guest") return () => {};
  const q = query(collection(db, "hireRequests"), where("developerUid", "==", developerUid));
  return onSnapshot(
    q,
    (snap) => onUpdate(snap.docs.map((d) => d.data() as HireRequest)),
    (err) => {
      if (onError) onError(err.message);
      else console.warn("[hireRequests] subscribe developer:", err);
    },
  );
}

export async function getAcceptedRequestForProject(creatorUid: string, projectName: string): Promise<HireRequest | null> {
  const q    = query(
    collection(db, "hireRequests"),
    where("creatorUid",   "==", creatorUid),
    where("projectName",  "==", projectName),
    where("status",       "==", "accepted"),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].data() as HireRequest;
}

/**
 * Hire/invite rows for a single workspace (one Firestore `projects/{id}` doc).
 * Always prefer `projectId` when present so assignments never leak across projects.
 * Rows without `projectId` (legacy) match by display name only as a fallback.
 */
export function hireRequestsForProject(
  reqs: HireRequest[],
  projectDocId: string | null | undefined,
  projectDisplayName: string,
): HireRequest[] {
  const pid = (projectDocId ?? "").trim();
  const name = projectDisplayName.trim();
  if (!pid && !name) return [];
  if (pid) {
    return reqs.filter((r) => {
      if (r.projectId === pid) return true;
      if (!r.projectId && name && (r.projectName || "").trim() === name) return true;
      return false;
    });
  }
  return reqs.filter((r) => (r.projectName || "").trim() === name);
}
