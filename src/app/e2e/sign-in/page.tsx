import { Suspense } from "react";
import { E2ESignInClient } from "./E2ESignInClient";

export default function E2ESignInPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#030303] flex items-center justify-center text-white/50 text-sm">
          Loading
        </div>
      }
    >
      <E2ESignInClient />
    </Suspense>
  );
}