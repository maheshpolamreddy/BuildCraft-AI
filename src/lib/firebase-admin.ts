import * as admin from "firebase-admin";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";

let initAttempted = false;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;

/** Thrown when Admin SDK cannot start (missing/invalid env). API routes map this to HTTP 503. */
export class FirebaseAdminConfigurationError extends Error {
  readonly statusCode = 503 as const;
  constructor() {
    super(
      "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT (JSON from a service account), or use Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS or gcloud auth application-default login).",
    );
    this.name = "FirebaseAdminConfigurationError";
  }
}

const FIRESTORE_CRED_HINT =
  "Firebase Admin cannot access Firestore. Set FIREBASE_SERVICE_ACCOUNT (service account JSON in env) or valid Application Default Credentials.";

/** True when Admin/Firestore failed because credentials are missing or invalid (common locally). */
export function isFirestoreCredentialsError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message;
  return (
    m.includes("Could not load the default credentials") ||
    m.includes("Could not refresh access token") ||
    m.includes("UNAUTHENTICATED") ||
    m.includes("invalid authentication credentials")
  );
}

export function firebaseAdminUnavailableMessage(err: unknown): string {
  if (err instanceof FirebaseAdminConfigurationError) return err.message;
  if (isFirestoreCredentialsError(err)) return FIRESTORE_CRED_HINT;
  return err instanceof Error ? err.message : "Service unavailable";
}

/** Initializes the default app once; throws if configuration is missing or invalid. */
function ensureFirebaseAdminApp(): admin.app.App {
  if (admin.apps.length > 0) {
    return admin.app();
  }
  if (initAttempted) {
    throw new FirebaseAdminConfigurationError();
  }
  initAttempted = true;
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
    if (raw) {
      const parsed = JSON.parse(raw) as admin.ServiceAccount;
      admin.initializeApp({
        credential: admin.credential.cert(parsed),
      });
      return admin.app();
    }
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      ...(projectId ? { projectId } : {}),
    });
    return admin.app();
  } catch (err) {
    console.warn("Firebase Admin init error:", err);
    throw new FirebaseAdminConfigurationError();
  }
}

function getDb(): Firestore {
  ensureFirebaseAdminApp();
  dbInstance ??= admin.firestore();
  return dbInstance;
}

function getAuth(): Auth {
  ensureFirebaseAdminApp();
  authInstance ??= admin.auth();
  return authInstance;
}

/**
 * Lazy Firestore handle so importing this module never throws when Admin is
 * misconfigured — callers get a clear error on first use instead of a boot-time 500.
 */
export const adminDb = new Proxy({} as Firestore, {
  get(_target, prop) {
    const db = getDb();
    const value = Reflect.get(db as object, prop, db);
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(db)
      : value;
  },
});

export const adminAuth = new Proxy({} as Auth, {
  get(_target, prop) {
    const auth = getAuth();
    const value = Reflect.get(auth as object, prop, auth);
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(auth)
      : value;
  },
});
