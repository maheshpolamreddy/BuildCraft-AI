import type { NextConfig } from "next";

const FIREBASE_PROJECT = "buildcraft-ai-d7b48";

const nextConfig: NextConfig = {
  /**
   * Proxy Firebase's auth handler through your own domain.
   * This eliminates cross-origin cookie issues with getRedirectResult()
   * because auth stays same-origin (buildcraft-omega.vercel.app/__/auth/*)
   * instead of going through firebaseapp.com.
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
