"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useStore } from "@/store/useStore";

export function CreatorFlowGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    authReady,
    currentUser,
    userRoles,
    projectCreatorHydrated,
    projectCreatorProfileCompleted,
  } = useStore();

  useEffect(() => {
    if (!authReady || !currentUser || currentUser.uid === "demo-guest") return;
    if (!projectCreatorHydrated) return;
    if (!userRoles.includes("employer")) return;
    if (projectCreatorProfileCompleted !== false) return;
    if (pathname?.startsWith("/creator/")) return;

    const returnTo = pathname || "/discovery";
    router.replace(`/creator/profile-setup?return=${encodeURIComponent(returnTo)}`);
  }, [
    authReady,
    currentUser,
    userRoles,
    projectCreatorHydrated,
    projectCreatorProfileCompleted,
    pathname,
    router,
  ]);

  return null;
}