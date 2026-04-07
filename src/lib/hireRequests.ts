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
  collection, query, where, getDocs,
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
