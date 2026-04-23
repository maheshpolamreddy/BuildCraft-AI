import {
  doc, setDoc, getDoc, updateDoc, serverTimestamp, Timestamp,
  collection, getDocs, query, where, limit, onSnapshot,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import { listenWhenAuthed } from "./auth";

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
  /** Human-readable tier for dashboards (mirrors verificationStatus). */
  tierLabel?: string;
  /** Badges earned on-platform (e.g. "Project Verified"). */
  earnedBadges?: string[];
  /** Firestore project doc IDs successfully completed with dual approval. */
  completedProjectIds?: string[];
  /** Denormalized count for matching / profile display. */
  completedProjectsCount?: number;
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

/** Firestore may store skills as "a, b", a single string, or alternate field names from imports. */
export function normalizeSkillsFromFirestore(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) {
    return v.flatMap((item) => {
      if (typeof item === "string") {
        return item
          .split(/[,;|]+/)
          .map((s) => s.trim())
          .filter(Boolean);
      }
      return item != null && String(item).trim() ? [String(item).trim()] : [];
    });
  }
  if (typeof v === "string") {
    return v
      .split(/[,;|]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof v === "object" && v !== null && !Array.isArray(v)) {
    return Object.values(v as Record<string, unknown>)
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((s) => s.trim());
  }
  return [];
}

export function coerceCompletedStep(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

function registrationDoneTruthy(registrationDone: unknown): boolean {
  if (registrationDone === true || registrationDone === 1) return true;
  return String(registrationDone).toLowerCase() === "true";
}

/**
 * Older `developerProfiles` docs may omit `registrationDone`, `completedStep`, or `profileStatus`
 * (created before those fields were written on every save). Infer “finished signup” from content.
 */
export function looksLikeLegacyCompletedDeveloperProfile(p: DeveloperProfile | null | undefined): boolean {
  if (!p?.userId) return false;
  const nameOk =
    String(p.fullName ?? "").trim().length >= 2 ||
    String((p as unknown as { name?: string }).name ?? "").trim().length >= 2 ||
    String((p as unknown as { displayName?: string }).displayName ?? "").trim().length >= 2;
  const skillsOk = normalizeSkillsFromFirestore(p.skills).length > 0;
  if (!nameOk || !skillsOk) return false;
  const hasPortfolioLink =
    !!String(p.githubUrl ?? "").trim() || !!String(p.portfolioUrl ?? "").trim();
  if (hasPortfolioLink) return true;
  const step = coerceCompletedStep(p.completedStep);
  if (step >= 5) return true;
  if (registrationDoneTruthy(p.registrationDone)) return true;
  return false;
}

/** True when the developer has finished the multi-step registration (Firestore is source of truth). */
export function isDeveloperRegistrationComplete(p: DeveloperProfile | null | undefined): boolean {
  if (!p?.userId) return false;
  if (registrationDoneTruthy(p.registrationDone) || coerceCompletedStep(p.completedStep) >= 6) {
    return true;
  }
  return looksLikeLegacyCompletedDeveloperProfile(p);
}

export function isEmployerUser(userRoles: readonly string[]): boolean {
  return userRoles.includes("employer");
}

/**
 * Should the user be sent to the developer dashboard by default?
 * True when the developer registration is complete AND:
 *  - they have no employer role at all, OR
 *  - their last onboarding choice was "employee" (developer)
 */
export function shouldDefaultToDeveloperDashboard(
  userRoles: readonly string[],
  p: DeveloperProfile | null | undefined,
  activeRole?: "employer" | "employee" | null,
): boolean {
  if (!isDeveloperRegistrationComplete(p)) return false;
  if (!isEmployerUser(userRoles)) return true;
  return activeRole === "employee";
}

export const EMPTY_PROFILE: Omit<DeveloperProfile, "userId" | "email" | "createdAt" | "updatedAt"> = {
  fullName: "", phone: "", location: "", photoURL: "",
  primaryRole: "fullstack", yearsExp: 0,
  skills: [], tools: [],
  githubUrl: "", portfolioUrl: "", resumeUrl: "", projectDescriptions: [],
  verificationStatus: "self-declared",
  tierLabel: "Tier 1",
  earnedBadges: [],
  completedProjectIds: [],
  completedProjectsCount: 0,
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

/** Live profile updates (tier, badges, completed counts after project completion). */
export function subscribeToDeveloperProfile(
  uid: string,
  onUpdate: (profile: DeveloperProfile | null) => void,
): () => void {
  if (!isFirebaseUid(uid)) return () => {};
  return listenWhenAuthed(uid, () =>
    onSnapshot(
      doc(db, "developerProfiles", uid),
      (snap) => {
        onUpdate(snap.exists() ? (snap.data() as DeveloperProfile) : null);
      },
      (err) => {
        if (err.code !== "permission-denied") console.warn("[developerProfile] snapshot:", err);
      },
    ),
  );
}

/** True if this profile should appear in employer matching lists. */
function isVisibleForMatching(p: DeveloperProfile): boolean {
  if (!p.userId) return false;
  if (p.profileStatus === "inactive" || p.profileStatus === "flagged") return false;
  const doneFlag = registrationDoneTruthy(p.registrationDone);
  const step = coerceCompletedStep(p.completedStep);
  const finished =
    doneFlag ||
    step >= 4 ||
    step >= 6 ||
    looksLikeLegacyCompletedDeveloperProfile(p);
  if (!finished) return false;
  // Allow any other profileStatus (e.g. "completed", "verified") — only inactive/flagged are hidden
  return true;
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
      const raw = d.data() as Record<string, unknown>;
      const mergedSkills = normalizeSkillsFromFirestore(
        raw.skillList ?? raw.techStack ?? raw.skills,
      );
      const fullName =
        String(raw.fullName ?? raw.name ?? raw.displayName ?? "").trim() ||
        String(raw.fullName ?? "");
      const p = {
        ...(raw as unknown as DeveloperProfile),
        userId: String(raw.userId ?? d.id).trim() || d.id,
        fullName,
        email: String(raw.email ?? "")
          .trim()
          .toLowerCase(),
        skills: mergedSkills,
        completedStep: coerceCompletedStep(raw.completedStep),
      };
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

    // Always merge a bounded full scan: legacy docs often lack index fields; without this, filling
    // maxCount from registrationDone-only queries could hide every older developer.
    const qAll = query(collection(db, "developerProfiles"), limit(500));
    const snapAll = await getDocs(qAll);
    ingest(snapAll.docs);

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

// ── Marketing landing (breadcrumb Home) ─────────────────────────────────────
const BC_ALLOW_MARKETING_LANDING = "buildcraft_allow_marketing_landing";

/** Breadcrumb Home sets this so `/` skips the developer auto-redirect once. */
export function markOpenMarketingHome(): void {
  try {
    sessionStorage.setItem(BC_ALLOW_MARKETING_LANDING, "1");
  } catch {
    /* ignore */
  }
}

/** Landing page: read and clear; if true, skip redirect to employee dashboard. */
export function consumeOpenMarketingHome(): boolean {
  try {
    if (sessionStorage.getItem(BC_ALLOW_MARKETING_LANDING) !== "1") return false;
    sessionStorage.removeItem(BC_ALLOW_MARKETING_LANDING);
    return true;
  } catch {
    return false;
  }
}
