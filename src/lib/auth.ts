import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
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

export async function signInWithGoogle() {
  const { user } = await signInWithPopup(auth, googleProvider);
  await createUserProfile(user);  // non-blocking internally
  return toAuthUser(user);
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
