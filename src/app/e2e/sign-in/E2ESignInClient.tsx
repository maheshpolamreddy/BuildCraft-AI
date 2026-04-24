"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "@/lib/firebase";

const ENABLED = process.env.NEXT_PUBLIC_ENABLE_E2E_SIGNIN === "true";

declare global {
  interface Window {
    __E2E_CUSTOM_TOKEN__?: string;
  }
}

export function E2ESignInClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo")?.trim() || "/discovery";
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!ENABLED) {
      setMessage("E2E sign-in is disabled for this build (set NEXT_PUBLIC_ENABLE_E2E_SIGNIN=true on test deployments only).");
      return;
    }
    const token = typeof window !== "undefined" ? window.__E2E_CUSTOM_TOKEN__ : undefined;
    if (!token) {
      setMessage("Missing E2E token. Run Playwright global setup.");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await signInWithCustomToken(auth, token);
        delete window.__E2E_CUSTOM_TOKEN__;
        if (!cancelled) router.replace(returnTo || "/discovery");
      } catch (e) {
        if (!cancelled) {
          setMessage(e instanceof Error ? e.message : "Custom token sign-in failed.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, returnTo]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center bg-[#030303] text-white gap-4 px-6"
      data-testid="e2e-sign-in-page"
    >
      {!message ? (
        <>
          <p className="text-sm text-white/60">Signing in with E2E token</p>
          <p className="text-xs text-white/35">If this hangs, add your Vercel host to Firebase Authorized domains.</p>
        </>
      ) : (
        <p className="text-sm text-amber-300/90 max-w-md text-center" data-testid="e2e-signin-error">
          {message}
        </p>
      )}
    </div>
  );
}