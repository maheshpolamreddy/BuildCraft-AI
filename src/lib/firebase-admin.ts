import { cert, getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

export class FirebaseAdminConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirebaseAdminConfigurationError";
  }
}

/**
 * User-facing copy for any server route that cannot run without Admin / Firestore.
 * Never put secret paths, env names, or stack details in API JSON.
 */
export const SERVER_CONFIG_USER_FACING_ERROR =
  "System configuration incomplete. Please check server setup.";

/** Operator hint — logs only, not sent to clients. */
export const CONFIG_HINT =
  "Set FIREBASE_SERVICE_ACCOUNT (JSON) or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY on the server (e.g. Vercel Production env), then redeploy.";

/** Detailed log line when Firestore rejects credentials (logs only). */
export const FIRESTORE_CRED_HINT =
  "Firebase Admin could not access Firestore. Verify service account JSON or split env vars and private key newlines (\\\\n).";

/** Normalize private key from env (Vercel often stores \\n as literal backslash-n). */
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
    console.error("[firebase-admin] FIREBASE_SERVICE_ACCOUNT parse/init failed:", e);
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
      "[firebase-admin] FIREBASE_CLIENT_EMAIL/PRIVATE_KEY set but FIREBASE_PROJECT_ID (or NEXT_PUBLIC_FIREBASE_PROJECT_ID) missing.",
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
    console.error("[firebase-admin] Split env (CLIENT_EMAIL/PRIVATE_KEY) init failed:", e);
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

/** Returns true if Firebase Admin app exists after attempting initialization (never throws). */
function attemptInitializeApp(): boolean {
  if (getApps().length > 0) return true;
  if (tryInitFromServiceAccountJson()) return true;
  if (tryInitFromSplitEnv()) return true;
  if (tryInitApplicationDefault()) return true;
  return false;
}

const E2E_CUSTOM_TOKEN_APP = "[buildcraft-e2e-custom-token]";

/**
 * Auth for `/api/e2e/custom-token` only. Uses explicit service account credentials when set
 * so tokens are minted for the same Firebase project as the client app. If only Application
 * Default Credentials exist (e.g. Vercel) they often target a different GCP project than
 * `NEXT_PUBLIC_FIREBASE_PROJECT_ID`; in that case this returns null unless credentials match.
 */
export function getAdminAuthForE2ECustomToken(): Auth | null {
  const expectedProject = resolveProjectIdForAdmin();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY?.trim();

  if (raw || (clientEmail && privateKeyRaw && expectedProject)) {
    try {
      const existing = getApps().find((a) => a.name === E2E_CUSTOM_TOKEN_APP);
      if (existing) return getAuth(existing);

      if (raw) {
        const parsed = JSON.parse(raw) as { project_id?: string; private_key?: string };
        if (parsed.private_key) {
          parsed.private_key = normalizeServiceAccountPrivateKey(String(parsed.private_key));
        }
        const app = initializeApp(
          { credential: cert(parsed as Parameters<typeof cert>[0]) },
          E2E_CUSTOM_TOKEN_APP,
        );
        return getAuth(app);
      }

      const privateKey = normalizeServiceAccountPrivateKey(privateKeyRaw!);
      const app = initializeApp(
        {
          credential: cert({
            projectId: expectedProject!,
            clientEmail: clientEmail!,
            privateKey,
          }),
        },
        E2E_CUSTOM_TOKEN_APP,
      );
      return getAuth(app);
    } catch (e) {
      console.error("[firebase-admin] E2E custom-token admin init failed:", e);
      return null;
    }
  }

  const shared = getAdminAuthSafe();
  if (!shared || !expectedProject) return shared;
  const actual = shared.app.options.projectId;
  if (actual && actual !== expectedProject) {
    console.error(
      "[firebase-admin] E2E custom-token: shared Admin project mismatch",
      JSON.stringify({ actual, expected: expectedProject }),
    );
    return null;
  }
  return shared;
}

export function getBuildCraftRuntimeEnvironment(): "production" | "preview" | "development" {
  const v = process.env.VERCEL_ENV;
  if (v === "production") return "production";
  if (v === "preview") return "preview";
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

/** Quick check from env only (no network, no SDK init). */
export function isFirebaseAdminEnvPresent(): boolean {
  if (process.env.FIREBASE_SERVICE_ACCOUNT?.trim()) return true;
  const email = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const key = process.env.FIREBASE_PRIVATE_KEY?.trim();
  const pid = resolveProjectIdForAdmin();
  return !!(email && key && pid);
}

type AdminCache = { status: "ok"; db: Firestore; auth: Auth } | { status: "fail" };

let adminCache: AdminCache | null = null;
let loggedAdminFailure = false;

/**
 * Returns Firestore via Firebase Admin, or null if credentials are missing or invalid.
 * Safe to call from serverless handlers — initializes at most once per instance; failures are cached.
 */
export function getAdminDbSafe(): Firestore | null {
  if (adminCache?.status === "ok") return adminCache.db;
  if (adminCache?.status === "fail") return null;

  try {
    if (!attemptInitializeApp()) {
      adminCache = { status: "fail" };
      if (!loggedAdminFailure) {
        loggedAdminFailure = true;
        console.error(
          "[firebase-admin] Not initialized. runtime=%s adminEnvKeysPresent=%s. %s",
          getBuildCraftRuntimeEnvironment(),
          isFirebaseAdminEnvPresent(),
          CONFIG_HINT,
        );
      }
      return null;
    }
    const db = getFirestore();
    const auth = getAuth();
    adminCache = { status: "ok", db, auth };
    return db;
  } catch (e) {
    adminCache = { status: "fail" };
    console.error("[firebase-admin] Unexpected initialization error:", e, FIRESTORE_CRED_HINT);
    return null;
  }
}

export function getAdminAuthSafe(): Auth | null {
  getAdminDbSafe();
  const c = adminCache;
  return c?.status === "ok" ? c.auth : null;
}

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

/** Use for JSON `error` fields — always user-safe. (Callers may pass a caught error for API symmetry; it is not logged here.) */
export function firebaseAdminUnavailableMessage(_err?: unknown): string {
  void _err;
  return SERVER_CONFIG_USER_FACING_ERROR;
}
