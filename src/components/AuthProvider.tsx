"use client";

import { useEffect } from "react";
import { onAuthChange } from "@/lib/auth";
import { useStore } from "@/store/useStore";
import { getDeveloperProfile, isDeveloperRegistrationComplete } from "@/lib/developerProfile";
import { getUserProfile, updateUserProfile } from "@/lib/firestore";
import {
  inferProjectCreatorProfileCompletedFromProfile,
  normalizeEmployerProfile,
  resolveProjectCreatorProfileCompletedFromFirestore,
} from "@/lib/projectCreatorProfile";

/**
 * Drop persisted workspace if it belongs to another Firebase user (same browser, different login).
 * Doc ids are `${uid}_${timestamp}` so we can validate without hitting Firestore.
 */
function clearProjectStateIfWrongUser(uid: string) {
  if (!uid || uid === "demo-guest") return;
  const { savedProjectId, project } = useStore.getState();
  const prefix = `${uid}_`;
  const idMismatch =
    typeof savedProjectId === "string" &&
    savedProjectId.length > 0 &&
    !savedProjectId.startsWith(prefix);
  const creatorMismatch =
    project?.creatorUid != null && project.creatorUid !== uid;
  if (idMismatch || creatorMismatch) {
    useStore.getState().clearProject();
  }
}

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
          projectCreatorHydrated: false,
          projectCreatorProfileCompleted: null,
        });
        previousUid = null;
      } else {
        clearStaleDeveloperStateForUid(user.uid);

        if (previousUid !== null && previousUid !== user.uid) {
          useStore.getState().clearProject();
          useStore.setState({
            projectCreatorProfileCompleted: null,
            projectCreatorHydrated: false,
          });
        }
        previousUid = user.uid;

        useStore.setState({ currentUser: user, authReady: true });
        clearProjectStateIfWrongUser(user.uid);

        if (user.uid !== "demo-guest") {
          useStore.setState({ projectCreatorHydrated: false });

          getUserProfile(user.uid)
            .then((data) => {
              const s = useStore.getState();
              const persistedCompleted = s.projectCreatorProfileCompleted;
              if (!data) {
                const ep = s.employerProfile;
                const inferred = inferProjectCreatorProfileCompletedFromProfile(ep);
                s.setProjectCreatorProfileCompleted(
                  !!(inferred || persistedCompleted === true),
                );
                return;
              }
              const ep = normalizeEmployerProfile(data.employerProfile ?? {});
              s.setEmployerProfile(ep);
              if ((data as { role?: string }).role === "employer") {
                s.addUserRole("employer");
              }
              const rawFlag = (data as { projectCreatorProfileCompleted?: unknown })
                .projectCreatorProfileCompleted;
              let completed = resolveProjectCreatorProfileCompletedFromFirestore(rawFlag, ep);
              if (rawFlag !== true && rawFlag !== false) {
                if (persistedCompleted === true) completed = true;
              }
              s.setProjectCreatorProfileCompleted(completed);
              if (rawFlag !== true && rawFlag !== false && completed) {
                void updateUserProfile(user.uid, { projectCreatorProfileCompleted: true });
              }
            })
            .catch(() => {
              const s = useStore.getState();
              const ep = s.employerProfile;
              const persistedCompleted = s.projectCreatorProfileCompleted;
              const inferred = inferProjectCreatorProfileCompletedFromProfile(ep);
              s.setProjectCreatorProfileCompleted(
                !!(inferred || persistedCompleted === true),
              );
            })
            .finally(() => {
              useStore.getState().setProjectCreatorHydrated(true);
            });

          getDeveloperProfile(user.uid).then((p) => {
            if (p && isDeveloperRegistrationComplete(p)) {
              const s = useStore.getState();
              s.setDeveloperProfile(p);
              s.addUserRole("developer");
            }
          }).catch(() => {});
        } else {
          useStore.setState({
            projectCreatorHydrated: true,
            projectCreatorProfileCompleted: true,
          });
        }
      }
    });
    return unsubscribe;
  }, []);

  return <>{children}</>;
}
