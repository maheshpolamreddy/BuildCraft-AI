import type { NextConfig } from "next";

/** Must match NEXT_PUBLIC_FIREBASE_PROJECT_ID so /__/auth proxy hits the same Firebase project as the client SDK. */
const FIREBASE_PROJECT =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || "buildcraft-ai-d7b48";

const nextConfig: NextConfig = {
  /**
   * Proxy Firebase's auth handler through your own domain when
   * NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN is your Vercel host (not *.firebaseapp.com).
   * Same-origin /__/auth/* avoids cross-origin issues with getRedirectResult().
   */
  async rewrites() {
    return [
      {
        source: "/__/auth/:path*",
        destination: `https://${FIREBASE_PROJECT}.firebaseapp.com/__/auth/:path*`,
      },
      {
        source: "/__/firebase/:path*",
        destination: `https://${FIREBASE_PROJECT}.firebaseapp.com/__/firebase/:path*`,
      },
    ];
  },
};

export default nextConfig;
