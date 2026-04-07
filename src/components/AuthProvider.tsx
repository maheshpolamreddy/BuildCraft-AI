"use client";

import { useEffect } from "react";
import { onAuthChange } from "@/lib/auth";
import { useStore } from "@/store/useStore";
import { getDeveloperProfile, isDeveloperRegistrationComplete } from "@/lib/developerProfile";

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
  useEffect(() => {
    let previousUid: string | null = null;
    const unsubscribe = onAuthChange((user) => {
      if (!user) {
        if (previousUid !== null) {
          useStore.getState().clearProject();
        }
        useStore.setState({
          currentUser: null,
          authReady: true,
          developerProfile: null,
          devRegistrationStep: 1,
          userRoles: [],
          role: null,
        });
        previousUid = null;
      } else {
        clearStaleDeveloperStateForUid(user.uid);

        if (previousUid !== null && previousUid !== user.uid) {
          useStore.getState().clearProject();
        }
        previousUid = user.uid;

        useStore.setState({ currentUser: user, authReady: true });

        if (user.uid !== "demo-guest") {
          getDeveloperProfile(user.uid).then((p) => {
            if (p && isDeveloperRegistrationComplete(p)) {
              const s = useStore.getState();
              s.setDeveloperProfile(p);
              s.addUserRole("developer");
            }
          }).catch(() => {});
        }
      }
    });
    return unsubscribe;
  }, []);

  return <>{children}</>;
}
