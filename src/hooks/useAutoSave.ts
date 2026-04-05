import { useEffect, useRef } from "react";
import { useStore } from "@/store/useStore";
import { updateProject } from "@/lib/firestore";

export function useAutoSave() {
  const { project, approvedTools, savedProjectId } = useStore();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Only auto-save if we have an actively saved project ID
    if (!savedProjectId || !project) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      updateProject(savedProjectId, project, approvedTools).catch((err) => {
        console.warn("[AutoSave] Failed to save project:", err);
      });
    }, 2000); // 2-second debounce for continuous typing

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [project, approvedTools, savedProjectId]);
}
