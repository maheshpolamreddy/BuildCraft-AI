import {
  doc, setDoc, getDoc, updateDoc, serverTimestamp, Timestamp,
  collection, getDocs, query, where, limit,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PrimaryRole = "frontend" | "backend" | "fullstack" | "ai" | "devops";
export type Availability = "full-time" | "part-time" | "freelance";
export type VerificationStatus = "self-declared" | "assessment-passed" | "project-verified";
export type ProfileStatus = "active" | "inactive" | "flagged" | "pending";

export interface DeveloperProfile {
  // Identity
  userId:       string;
  email:        string;

  // Step 1 — Basic
  fullName:     string;
  phone:        string;
  location:     string;
  photoURL:     string;   // base64 data-URL or external URL

  // Step 2 — Professional
  primaryRole:  PrimaryRole;
  yearsExp:     number;
  skills:       string[];
  tools:        string[];

  // Step 3 — Portfolio
  githubUrl:    string;
  portfolioUrl: string;
  resumeUrl:    string;
  projectDescriptions: string[];

  // Step 4 — Verification
  verificationStatus: VerificationStatus;
  /** IDs from the employee-dashboard skill test catalog; tier upgrade after full profile. */
  passedSkillAssessments?: string[];

  // Step 5 — Availability
  availability:  Availability;
  payMin:        number;
  payMax:        number;
  payCurrency:   string;
  preferredTypes: string[];

  // Meta
  profileStatus:   ProfileStatus;
  completedStep:   number;        // 0–6; 6 = fully complete
  registrationDone: boolean;
  createdAt:       Timestamp | null;
  updatedAt:       Timestamp | null;
}

/** True when the developer has finished the multi-step registration (Firestore is source of truth). */
export function isDeveloperRegistrationComplete(p: DeveloperProfile | null | undefined): boolean {
  if (!p?.userId) return false;
  const doneFlag =
    p.registrationDone === true ||
    String(p.registrationDone).toLowerCase() === "true";
  return doneFlag || (p.completedStep ?? 0) >= 6;
}

export const EMPTY_PROFILE: Omit<DeveloperProfile, "userId" | "email" | "createdAt" | "updatedAt"> = {
  fullName: "", phone: "", location: "", photoURL: "",
  primaryRole: "fullstack", yearsExp: 0,
  skills: [], tools: [],
  githubUrl: "", portfolioUrl: "", resumeUrl: "", projectDescriptions: [],
  verificationStatus: "self-declared",
  availability: "full-time", payMin: 0, payMax: 0, payCurrency: "USD", preferredTypes: [],
  profileStatus: "pending", completedStep: 0, registrationDone: false,
};

// ── Guard ─────────────────────────────────────────────────────────────────────

function isFirebaseUid(uid: string): boolean {
  return !!uid && uid !== "demo-guest";
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

/** Create or overwrite a developer profile doc. */
export async function saveDeveloperProfile(
  uid: string,
  data: Partial<DeveloperProfile>,
): Promise<void> {
  if (!isFirebaseUid(uid)) return;
  try {
    const ref = doc(db, "developerProfiles", uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
    } else {
      await setDoc(ref, {
        userId: uid,
        ...EMPTY_PROFILE,
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    console.warn("[developerProfile] save failed:", err);
  }
}

/** Load a developer profile. Returns null for demo users or if not found. */
export async function getDeveloperProfile(uid: string): Promise<DeveloperProfile | null> {
  if (!isFirebaseUid(uid)) return null;
  try {
    const snap = await getDoc(doc(db, "developerProfiles", uid));
    return snap.exists() ? (snap.data() as DeveloperProfile) : null;
  } catch (err) {
    console.warn("[developerProfile] load failed:", err);
    return null;
  }
}

/** True if this profile should appear in employer matching lists. */
function isVisibleForMatching(p: DeveloperProfile): boolean {
  if (!p.userId) return false;
  if (p.profileStatus === "inactive" || p.profileStatus === "flagged") return false;
  const doneFlag =
    p.registrationDone === true ||
    String(p.registrationDone).toLowerCase() === "true";
  const finished = doneFlag || (p.completedStep ?? 0) >= 6;
  if (!finished) return false;
  // Final submit sets active; profile editor may leave pending — still show if registration finished.
  return p.profileStatus === "active" || p.profileStatus === "pending";
}

export type DeveloperProfilesFetchResult = {
  profiles: DeveloperProfile[];
  /** Set when Firestore throws (e.g. permission denied on collection query). */
  queryError: string | null;
};

/**
 * Fetch registered developer profiles for the matching engine.
 *
 * Uses single-field Firestore queries only, then filters in memory. A compound
 * query (registrationDone + profileStatus) requires a composite index and
 * fails silently in the client until that index exists — which hid every dev.
 */
export async function getAllDeveloperProfiles(maxCount = 30): Promise<DeveloperProfilesFetchResult> {
  const byId = new Map<string, DeveloperProfile>();

  function ingest(docs: QueryDocumentSnapshot[]) {
    for (const d of docs) {
      const data = d.data() as DeveloperProfile;
      const p = { ...data, userId: data.userId || d.id };
      if (isVisibleForMatching(p)) byId.set(p.userId, p);
    }
  }

  try {
    const qDone = query(
      collection(db, "developerProfiles"),
      where("registrationDone", "==", true),
      limit(Math.max(maxCount * 3, 60)),
    );
    const snapDone = await getDocs(qDone);
    ingest(snapDone.docs);

    if (byId.size < maxCount) {
      const qStep = query(
        collection(db, "developerProfiles"),
        where("completedStep", "==", 6),
        limit(Math.max(maxCount * 3, 60)),
      );
      const snapStep = await getDocs(qStep);
      ingest(snapStep.docs);
    }

    // If indexed queries returned nothing (missing fields, odd data), scan a small window client-side.
    if (byId.size === 0) {
      const qAll = query(collection(db, "developerProfiles"), limit(150));
      const snapAll = await getDocs(qAll);
      ingest(snapAll.docs);
    }

    return {
      profiles: Array.from(byId.values()).slice(0, maxCount),
      queryError: null,
    };
  } catch (err) {
    console.warn("[developerProfile] getAllProfiles failed:", err);
    const queryError = err instanceof Error ? err.message : String(err);
    return { profiles: [], queryError };
  }
}

/** Update specific fields of a developer profile. */
export async function updateDeveloperProfileField(
  uid: string,
  data: Partial<DeveloperProfile>,
): Promise<void> {
  if (!isFirebaseUid(uid)) return;
  try {
    await updateDoc(doc(db, "developerProfiles", uid), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn("[developerProfile] update failed:", err);
    throw err;
  }
}
