import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets Firebase Google `signInWithPopup` postMessage the result to the opener on deployed
  // hosts (avoids a silent no-login when the user completes OAuth in a popup or new tab).
  async headers() {
    return [
      {
        // Required for `signInWithPopup` to postMessage the result back to the app on
        // production (any page may open the OAuth window from shared layout components).
        source: "/:path*",
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
