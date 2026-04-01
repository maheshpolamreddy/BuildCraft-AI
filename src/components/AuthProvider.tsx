"use client";

import { useEffect } from "react";
import { onAuthChange } from "@/lib/auth";
import { useStore } from "@/store/useStore";

function clearStaleDeveloperStateForUid(uid: string | undefined) {
  const { developerProfile, userRoles } = useStore.getState();
  if (!uid) return;
  const prof = developerProfile;
  const wrongProfile = prof != null && prof.userId !== uid;
  const orphanDevRole =
    userRoles.includes("developer") && (!prof || prof.userId !== uid);
  if (wrongProfile || orphanDevRole) {
    useStore.setState({
      developerProfile: null,
      devRegistrationStep: 1,
      userRoles: userRoles.filter(r => r !== "developer"),
    });
  }
}

/**
 * Mounts once at the root layout. Subscribes to Firebase auth state and keeps
 * the Zustand store in sync so every page knows who is signed in.
 */
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const setCurrentUser = useStore((s) => s.setCurrentUser);

  useEffect(() => {
    const unsubscribe = onAuthChange((user) => {
      const { userRoles } = useStore.getState();
      if (!user) {
        useStore.setState({
          developerProfile: null,
          devRegistrationStep: 1,
          userRoles: userRoles.filter(r => r !== "developer"),
        });
      } else {
        clearStaleDeveloperStateForUid(user.uid);
      }
      setCurrentUser(user);
    });
    return unsubscribe;
  }, [setCurrentUser]);

  return <>{children}</>;
}
