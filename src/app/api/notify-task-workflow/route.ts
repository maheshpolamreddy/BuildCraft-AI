import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendTaskWorkflowEmails, transactionalEmailConfigured } from "@/lib/email";

function appBaseUrl(): string {
  const v = process.env.VERCEL_URL?.trim();
  if (v) return v.startsWith("http") ? v : `https://${v}`;
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
}

export async function POST(req: NextRequest) {
  try {
    if (!transactionalEmailConfigured()) {
      return NextResponse.json({ ok: true, skipped: true });
    }
    const body = await req.json();
    const projectId = typeof body.projectId === "string" ? body.projectId : "";
    const projectName = typeof body.projectName === "string" ? body.projectName : "Project";
    const taskTitle = typeof body.taskTitle === "string" ? body.taskTitle : "Task";
    const kind = body.kind as string;
    if (!projectId || !["completed_by_developer", "approved", "reopened"].includes(kind)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const projSnap = await adminDb.collection("projects").doc(projectId).get();
    const proj = projSnap.exists ? projSnap.data() : null;
    const creatorEmail = typeof proj?.email === "string" ? proj.email : undefined;
    const developerUid = typeof proj?.developerUid === "string" ? proj.developerUid : null;

    let developerEmail: string | undefined;
    if (developerUid) {
      const devProf = await adminDb.collection("developerProfiles").doc(developerUid).get();
      const d = devProf.exists ? devProf.data() : null;
      if (d && typeof d.email === "string") developerEmail = d.email;
    }

    const workspaceUrl = `${appBaseUrl()}/project-room?projectId=${encodeURIComponent(projectId)}&tab=milestones`;
    await sendTaskWorkflowEmails({
      projectName,
      taskTitle,
      kind: kind as "completed_by_developer" | "approved" | "reopened",
      creatorEmail,
      developerEmail,
      workspaceUrl,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[notify-task-workflow]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}