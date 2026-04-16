import { Timestamp } from "firebase/firestore";
import type { ProjectState } from "@/store/useStore";
import type { SavedProject } from "@/lib/firestore";
import { firestoreTimestampSeconds } from "@/lib/firestore";

/**
 * Dedupe by document id. When both `getUserProjects` and `getProjectsByEmail` return the same
 * id, keep the snapshot with the newer `updatedAt` (stale reads / race-safe).
 */
export function mergeProjectListsFromQueries(
  uidProjects: SavedProject[],
  emailProjects: SavedProject[],
): SavedProject[] {
  const merged = new Map<string, SavedProject>();
  for (const p of [...uidProjects, ...emailProjects]) {
    const prev = merged.get(p.id);
    if (!prev) {
      merged.set(p.id, p);
      continue;
    }
    const tNew = firestoreTimestampSeconds(p.updatedAt);
    const tOld = firestoreTimestampSeconds(prev.updatedAt);
    merged.set(p.id, tNew >= tOld ? p : prev);
  }
  return Array.from(merged.values()).sort(
    (a, b) => firestoreTimestampSeconds(b.updatedAt) - firestoreTimestampSeconds(a.updatedAt),
  );
}

/**
 * Merge the in-memory workspace project into the fetched list so:
 * - The current project always appears (fixes missing rows / id bugs / eventual consistency).
 * - Sidebar shows latest locked state without waiting for another Firestore round-trip.
 * Then pin the active project id to the top of Active Projects.
 */
export function hydrateHistoryWithSessionProject(
  list: SavedProject[],
  session: {
    savedProjectId: string | null;
    project: ProjectState | null;
    uid: string | null;
    email?: string | null;
    approvedTools: Record<string, boolean | undefined>;
  },
): SavedProject[] {
  const { savedProjectId, project, uid, email, approvedTools } = session;

  let next: SavedProject[];

  if (!savedProjectId || !project || !uid || uid === "demo-guest") {
    next = [...list];
  } else {
    const idx = list.findIndex((p) => p.id === savedProjectId);
    if (idx >= 0) {
      next = [...list];
      next[idx] = {
        ...next[idx],
        project,
        approvedTools: { ...next[idx].approvedTools, ...approvedTools },
        uid: next[idx].uid || uid,
        email: next[idx].email || email || undefined,
      };
    } else {
      const now = Timestamp.fromMillis(Date.now());
      const synthetic: SavedProject = {
        id: savedProjectId,
        uid,
        email: email ?? undefined,
        project,
        approvedTools: { ...approvedTools },
        createdAt: now,
        updatedAt: now,
        deletedAt: undefined,
      };
      next = [synthetic, ...list];
    }
  }

  return sortProjectsWithCurrentFirst(next, savedProjectId);
}

export function sortProjectsWithCurrentFirst(
  list: SavedProject[],
  currentId: string | null | undefined,
): SavedProject[] {
  const sorted = [...list].sort(
    (a, b) => firestoreTimestampSeconds(b.updatedAt) - firestoreTimestampSeconds(a.updatedAt),
  );
  if (!currentId) return sorted;
  const idx = sorted.findIndex((p) => p.id === currentId);
  if (idx <= 0) return sorted;
  const [row] = sorted.splice(idx, 1);
  return [row, ...sorted];
}
