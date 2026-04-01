"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

/**
 * UID from Firebase Auth (updates on login/logout). Falls back to store uid when auth is still hydrating.
 */
export function useFirebaseUid(storeUid: string | null | undefined): string {
  const [uid, setUid] = useState(() =>
    (auth.currentUser?.uid ?? storeUid ?? "").trim(),
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      const a = (u?.uid ?? "").trim();
      const b = (storeUid ?? "").trim();
      setUid(a || b);
    });
    return unsub;
  }, [storeUid]);

  return uid || (storeUid ?? "").trim();
}
