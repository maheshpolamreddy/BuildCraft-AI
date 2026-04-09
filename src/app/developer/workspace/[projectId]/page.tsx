"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ProjectRoomContent } from "@/app/project-room/page";

function DeveloperWorkspaceInner() {
  const params = useParams();
  const raw = params?.projectId;
  const projectId = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  if (!projectId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white/50 text-sm">
        Missing project id
      </div>
    );
  }
  return (
    <ProjectRoomContent
      key={projectId}
      initialProjectId={projectId}
      isDeveloperWorkspace
    />
  );
}

export default function DeveloperWorkspacePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-400" aria-label="Loading" />
        </div>
      }
    >
      <DeveloperWorkspaceInner />
    </Suspense>
  );
}