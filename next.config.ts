import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets Firebase Google `signInWithPopup` postMessage the result to the opener on deployed
  // hosts (avoids a silent no-login when the user completes OAuth in a popup or new tab).
  async headers() {
    return [
      {
        source: "/auth",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
      {
        source: "/auth/:path*",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
      {
        source: "/",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
