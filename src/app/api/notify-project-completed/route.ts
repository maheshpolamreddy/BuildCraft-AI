import { NextRequest, NextResponse } from "next/server";
import {
  getAdminDbSafe,
  firebaseAdminUnavailableMessage,
  isFirestoreCredentialsError,
} from "@/lib/firebase-admin";
import { sendProjectCompletionBroadcast, transactionalEmailConfigured } from "@/lib/email";

function appBaseUrl(): string {
  const v = process.env.VERCEL_URL?.trim();
  if (v) return v.startsWith("http") ? v : `https://${v}`;
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
}

export async function POST(req: NextRequest) {
  try {
    if (!transactionalEmailConfigured()) {
      return NextResponse.json({ ok: true, skipped: true, reason: "email_not_configured" });
    }

    const db = getAdminDbSafe();
    if (!db) {
      console.warn("[notify-project-completed] Firestore admin unavailable; skipping email.");
      return NextResponse.json({ ok: true, skipped: true, reason: "firestore_unavailable" });
    }

    const body = await req.json();
    const projectId = typeof body.projectId === "string" ? body.projectId : "";
    const projectName = typeof body.projectName === "string" ? body.projectName : "Project";
    const developerTierUpgrade = body.developerTierUpgrade === true;
    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }

    const projSnap = await db.collection("projects").doc(projectId).get();
    const proj = projSnap.exists ? projSnap.data() : null;
    const creatorEmail = typeof proj?.email === "string" ? proj.email : undefined;
    const developerUid = typeof proj?.developerUid === "string" ? proj.developerUid : null;

    let developerEmail: string | undefined;
    if (developerUid) {
      const devProf = await db.collection("developerProfiles").doc(developerUid).get();
      const d = devProf.exists ? devProf.data() : null;
      if (d && typeof d.email === "string") developerEmail = d.email;
    }

    const projectUrl = `${appBaseUrl()}/project-room?projectId=${encodeURIComponent(projectId)}&tab=completion`;
    const result = await sendProjectCompletionBroadcast({
      creatorEmail,
      developerEmail,
      projectName,
      projectUrl,
      developerTierUpgrade,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[notify-project-completed]", err);
    if (isFirestoreCredentialsError(err)) {
      return NextResponse.json(
        { ok: false, error: firebaseAdminUnavailableMessage(err) },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
