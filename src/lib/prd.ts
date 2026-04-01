/**
 * Firestore helpers for Project Requirement Documents (PRDs).
 *
 * Collection: prds/{prdId}
 * {
 *   id, version, projectName, creatorUid, developerUid, hireToken,
 *   overview, scope, features[], techStack[], milestones[], risks[],
 *   createdAt, updatedAt
 * }
 */

import { db } from "./firebase";
import {
  doc, setDoc, getDoc, updateDoc,
  collection, query, where, getDocs,
  serverTimestamp,
} from "firebase/firestore";

export interface PRDMilestone {
  phase:      string;
  title:      string;
  duration:   string;
  deliverables: string[];
}

export interface PRDDocument {
  id:           string;
  version:      string;
  projectName:  string;
  creatorUid:   string;
  developerUid: string;
  hireToken:    string;
  /** Verbatim creator submission (idea + summary) so the developer sees exactly what the project was. */
  projectBrief?: string;
  overview:     string;
  scope:        string;
  features:     string[];
  techStack:    string[];
  milestones:   PRDMilestone[];
  risks:        string[];
  createdAt:    unknown;
  updatedAt:    unknown;
}

export async function savePRD(data: Omit<PRDDocument, "createdAt" | "updatedAt">): Promise<string> {
  const ref = doc(collection(db, "prds"));
  await setDoc(ref, {
    ...data,
    id:        ref.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getPRD(prdId: string): Promise<PRDDocument | null> {
  const snap = await getDoc(doc(db, "prds", prdId));
  if (!snap.exists()) return null;
  return snap.data() as PRDDocument;
}

export async function updatePRD(prdId: string, partial: Partial<PRDDocument>): Promise<void> {
  await updateDoc(doc(db, "prds", prdId), { ...partial, updatedAt: serverTimestamp() });
}

export async function getPRDsByUser(uid: string): Promise<PRDDocument[]> {
  const asCreator  = query(collection(db, "prds"), where("creatorUid",   "==", uid));
  const asDev      = query(collection(db, "prds"), where("developerUid", "==", uid));
  const [cs, ds]   = await Promise.all([getDocs(asCreator), getDocs(asDev)]);
  const all = [...cs.docs, ...ds.docs].map(d => d.data() as PRDDocument);
  // deduplicate by id
  return [...new Map(all.map(p => [p.id, p])).values()];
}

/** PRDs tied to a specific hire / chat thread (hireToken === chatId). */
export async function getPRDsByHireToken(hireToken: string): Promise<PRDDocument[]> {
  if (!hireToken.trim()) return [];
  const q = query(collection(db, "prds"), where("hireToken", "==", hireToken));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as PRDDocument);
}
