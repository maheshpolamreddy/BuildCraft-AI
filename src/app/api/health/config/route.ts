import { NextResponse } from "next/server";
import {
  getAdminDbSafe,
  getBuildCraftRuntimeEnvironment,
  isFirebaseAdminEnvPresent,
} from "@/lib/firebase-admin";

function isFirebaseClientEnvPresent(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() &&
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim()
  );
}

/**
 * Lightweight configuration probe for operators (no secrets). Safe to expose publicly;
 * only boolean flags and environment name.
 */
export async function GET() {
  const adminSdkReady = getAdminDbSafe() !== null;
  const clientEnv = isFirebaseClientEnvPresent();
  const adminEnv = isFirebaseAdminEnvPresent();

  return NextResponse.json({
    ok: clientEnv && adminSdkReady,
    environment: getBuildCraftRuntimeEnvironment(),
    checks: {
      firebaseClientEnv: clientEnv,
      firebaseAdminEnvKeysPresent: adminEnv,
      firebaseAdminSdkReady: adminSdkReady,
    },
  });
}