import { cert, getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

export class FirebaseAdminConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirebaseAdminConfigurationError";
  }
}

/** Normalize private key from env (Vercel often stores \n as literal backslash-n). */
function normalizeServiceAccountPrivateKey(raw: string): string {
  let k = raw.trim();
  if (k.startsWith('"') && k.endsWith('"')) k = k.slice(1, -1);
  k = k.replace(/\\n/g, "\n");
  return k;
}

function resolveProjectIdForAdmin(): string | undefined {
  const explicit = process.env.FIREBASE_PROJECT_ID?.trim();
  if (explicit) return explicit;
  return process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || undefined;
}

function tryInitFromServiceAccountJson(): boolean {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { project_id?: string; private_key?: string };
    if (parsed.private_key) {
      parsed.private_key = normalizeServiceAccountPrivateKey(String(parsed.private_key));
    }
    initializeApp({ credential: cert(parsed as Parameters<typeof cert>[0]) });
    return true;
  } catch (e) {
    console.error("Firebase Admin: FIREBASE_SERVICE_ACCOUNT JSON parse/init failed:", e);
    return false;
  }
}

function tryInitFromSplitEnv(): boolean {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (!clientEmail || !privateKeyRaw) return false;
  const projectId = resolveProjectIdForAdmin();
  if (!projectId) {
    console.warn(
      "Firebase Admin: FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY are set but FIREBASE_PROJECT_ID (or NEXT_PUBLIC_FIREBASE_PROJECT_ID) is missing."
    );
    return false;
  }
  try {
    const privateKey = normalizeServiceAccountPrivateKey(privateKeyRaw);
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    return true;
  } catch (e) {
    console.error("Firebase Admin: split env (CLIENT_EMAIL/PRIVATE_KEY) init failed:", e);
    return false;
  }
}

function tryInitApplicationDefault(): boolean {
  try {
    initializeApp({ credential: applicationDefault() });
    return true;
  } catch {
    return false;
  }
}

function ensureFirebaseAdminApp() {
  if (getApps().length > 0) return;

  if (tryInitFromServiceAccountJson()) return;
  if (tryInitFromSplitEnv()) return;
  if (tryInitApplicationDefault()) return;

  throw new FirebaseAdminConfigurationError(
    "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT (JSON), or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (private key with \\n for newlines), or use gcloud application-default credentials locally."
  );
}

export const CONFIG_HINT =
  "Set FIREBASE_SERVICE_ACCOUNT (service account JSON), or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY on the server (Vercel env).";

export const FIRESTORE_CRED_HINT =
  "Firebase Admin cannot access Firestore. Set FIREBASE_SERVICE_ACCOUNT or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (service account JSON or split vars in env), or valid Application Default Credentials.";

let adminDbSingleton: Firestore | null = null;

function getAdminDbInternal(): Firestore {
  ensureFirebaseAdminApp();
  if (!adminDbSingleton) adminDbSingleton = getFirestore();
  return adminDbSingleton;
}

/** Lazy Firestore instance for API routes (same as getAdminDb()). */
export const adminDb = new Proxy({} as Firestore, {
  get(_target, prop, receiver) {
    const db = getAdminDbInternal();
    const value = Reflect.get(db as object, prop, receiver);
    if (typeof value === "function") {
      return (value as (...a: unknown[]) => unknown).bind(db);
    }
    return value;
  },
});

export function isFirestoreCredentialsError(err: unknown): boolean {
  if (err instanceof FirebaseAdminConfigurationError) return true;
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  const code = e.code ? String(e.code).toLowerCase() : "";
  if (code === "app/invalid-credential" || code === "unauthenticated" || code === "invalid_grant") {
    return true;
  }
  const msg = String(e.message || "").toLowerCase();
  return (
    msg.includes("could not load the default credentials") ||
    msg.includes("application default credentials") ||
    msg.includes("invalid_grant") ||
    (msg.includes("private_key") && msg.includes("invalid")) ||
    (msg.includes("service account") && msg.includes("credential")) ||
    (msg.includes("failed to parse") && msg.includes("private key"))
  );
}

export function firebaseAdminUnavailableMessage(err: unknown): string {
  if (err instanceof FirebaseAdminConfigurationError) return err.message;
  if (isFirestoreCredentialsError(err)) return FIRESTORE_CRED_HINT;
  return FIRESTORE_CRED_HINT;
}

let adminAuthSingleton: Auth | null = null;

function getAdminAuthInternal(): Auth {
  ensureFirebaseAdminApp();
  if (!adminAuthSingleton) adminAuthSingleton = getAuth();
  return adminAuthSingleton;
}

/** Lazy Auth instance (verifyIdToken, etc.). */
export const adminAuth = new Proxy({} as Auth, {
  get(_target, prop, receiver) {
    const auth = getAdminAuthInternal();
    const value = Reflect.get(auth as object, prop, receiver);
    if (typeof value === "function") {
      return (value as (...a: unknown[]) => unknown).bind(auth);
    }
    return value;
  },
});

export function getAdminAuth(): Auth {
  return getAdminAuthInternal();
}

export function getAdminDb(): Firestore {
  return getAdminDbInternal();
}
