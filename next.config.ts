import type { NextConfig } from "next";

/** Must match NEXT_PUBLIC_FIREBASE_PROJECT_ID so /__/auth proxy hits the same Firebase project as the client SDK. */
const FIREBASE_PROJECT = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ?? "";

const nextConfig: NextConfig = {
  experimental: {
    /** Smaller dev + prod client bundles for framer-motion imports */
    optimizePackageImports: ["framer-motion", "lenis"],
  },
  /**
   * Proxy Firebase's auth handler through your own domain when
   * NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN is your Vercel host (not *.firebaseapp.com).
   * Same-origin /__/auth/* avoids cross-origin issues with getRedirectResult().
   * If PROJECT_ID is unset at build time, skip rewrites (avoids proxying to the wrong project).
   */
  async rewrites() {
    if (!FIREBASE_PROJECT) return [];
    const base = `https://${FIREBASE_PROJECT}.firebaseapp.com`;
    return [
      { source: "/__/auth/:path*", destination: `${base}/__/auth/:path*` },
      { source: "/__/firebase/:path*", destination: `${base}/__/firebase/:path*` },
    ];
  },
};

export default nextConfig;
