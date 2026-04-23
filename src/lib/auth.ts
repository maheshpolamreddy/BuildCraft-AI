import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, googleProvider } from "./firebase";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  uid:         string;
  email:       string | null;
  displayName: string | null;
  photoURL:    string | null;
}

export function toAuthUser(user: User): AuthUser {
  return {
    uid:         user.uid,
    email:       user.email,
    displayName: user.displayName,
    photoURL:    user.photoURL,
  };
}

function getAuthErrorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const c = (err as { code?: unknown }).code;
    return typeof c === "string" ? c : undefined;
  }
  return undefined;
}

// ── Profile creation ──────────────────────────────────────────────────────────

// Non-blocking — Firestore may be unavailable (not yet created, offline, rules)
// Auth always succeeds regardless of whether the profile write works.
async function createUserProfile(user: User, displayName?: string) {
  try {
    const ref  = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid:         user.uid,
        email:       user.email,
        displayName: displayName ?? user.displayName ?? "",
        photoURL:    user.photoURL ?? "",
        createdAt:   serverTimestamp(),
        updatedAt:   serverTimestamp(),
      });
    }
  } catch (err) {
    // Firestore not set up yet or offline — log and continue, never block auth
    console.warn("[Firestore] createUserProfile failed (non-fatal):", err);
  }
}

// ── Auth actions ──────────────────────────────────────────────────────────────

export async function signUpWithEmail(email: string, password: string, displayName: string) {
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(user, { displayName });
  await createUserProfile(user, displayName);  // non-blocking internally
  return toAuthUser(user);
}

export async function signInWithEmail(email: string, password: string) {
  const { user } = await signInWithEmailAndPassword(auth, email, password);
  await createUserProfile(user);  // non-blocking internally
  return toAuthUser(user);
}

export type SignInWithGoogleResult =
  | { kind: "signedIn"; user: AuthUser }
  | { kind: "redirect" };

/**
 * When popup flows fail, fall back to full-page Google redirect. Do not use this for
 * explicit user actions like closing the popup.
 */
function shouldFallbackToGoogleRedirect(code: string | undefined): boolean {
  if (!code) return false;
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
    return false;
  }
  return (
    code === "auth/popup-blocked" ||
    code === "auth/operation-not-supported-in-this-environment" ||
    code === "auth/web-storage-unsupported" ||
    code === "auth/internal-error"
  );
}

/**
 * Google: try popup first (with COOP header on /auth; see next.config). If the browser
 * or host blocks the popup/result handoff, use signInWithRedirect. Redirect also completes
 * the session when getRedirectResult runs in AuthProvider.
 */
export async function signInWithGoogle(): Promise<SignInWithGoogleResult> {
  if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim()) {
    throw new Error("Firebase is not configured (missing NEXT_PUBLIC_FIREBASE_API_KEY).");
  }
  try {
    const { user } = await signInWithPopup(auth, googleProvider);
    await createUserProfile(user);
    return { kind: "signedIn", user: toAuthUser(user) };
  } catch (err: unknown) {
    const code = getAuthErrorCode(err);
    if (shouldFallbackToGoogleRedirect(code)) {
      try {
        await signInWithRedirect(auth, googleProvider);
        return { kind: "redirect" };
      } catch (redirectErr) {
        throw redirectErr;
      }
    }
    throw err;
  }
}

/** Call once on app load after a Google redirect sign-in to create the Firestore user stub. */
export async function consumeGoogleRedirectResult(): Promise<AuthUser | null> {
  try {
    const result = await getRedirectResult(auth);
    if (!result?.user) return null;
    await createUserProfile(result.user);
    return toAuthUser(result.user);
  } catch (err) {
    // Log at error level in prod so Vercel logs show OAuth redirect failures.
    const code = getAuthErrorCode(err);
    if (code === "auth/redirect-cancelled-by-user") {
      return null;
    }
    console.error("[auth] getRedirectResult failed:", err);
    return null;
  }
}

export async function signOutUser() {
  await signOut(auth);
}

export async function sendPasswordReset(email: string) {
  await sendPasswordResetEmail(auth, email);
}

export function onAuthChange(callback: (user: AuthUser | null) => void) {
  return onAuthStateChanged(auth, (user) =>
    callback(user ? toAuthUser(user) : null)
  );
}

type FirestoreUnsub = () => void;

/**
 * Attach Firestore listeners only when auth.currentUser.uid === expectedUid so
 * request.auth is set (avoids permission-denied snapshot races).
 */
export function listenWhenAuthed(
  expectedUid: string,
  attach: (user: User) => FirestoreUnsub,
): FirestoreUnsub {
  if (!expectedUid || expectedUid === "demo-guest") {
    return () => {};
  }
  let innerUnsub: FirestoreUnsub | null = null;
  const authUnsub = onAuthStateChanged(auth, (user) => {
    innerUnsub?.();
    innerUnsub = null;
    if (!user || user.uid !== expectedUid) return;
    innerUnsub = attach(user);
  });
  return () => {
    authUnsub();
    innerUnsub?.();
  };
}
