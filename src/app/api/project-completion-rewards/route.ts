import { NextRequest, NextResponse } from "next/server";
import type { DocumentData } from "firebase-admin/firestore";
import {
  getAdminAuthSafe,
  getAdminDbSafe,
  firebaseAdminUnavailableMessage,
  isFirestoreCredentialsError,
  SERVER_CONFIG_USER_FACING_ERROR,
} from "@/lib/firebase-admin";
import { processCompletionRewardsAdmin } from "@/lib/rewards-admin";

function projectDocSaysCompleted(data: DocumentData): boolean {
  const nested = data.project as { lifecycleStatus?: string } | undefined;
  return data.completionStatus === "completed" || nested?.lifecycleStatus === "completed";
}

export async function POST(req: NextRequest) {
  const db = getAdminDbSafe();
  const auth = getAdminAuthSafe();
  if (!db || !auth) {
    return NextResponse.json({ error: SERVER_CONFIG_USER_FACING_ERROR }, { status: 503 });
  }

  try {
    const body = await req.json();
    const idToken = typeof body.idToken === "string" ? body.idToken : "";
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
    const projectNameFallback = typeof body.projectName === "string" ? body.projectName.trim() : "";

    if (!idToken || !projectId) {
      return NextResponse.json({ error: "Missing idToken or projectId" }, { status: 400 });
    }

    const decoded = await auth.verifyIdToken(idToken);
    const uid = decoded.uid;

    const projSnap = await db.collection("projects").doc(projectId).get();
    if (!projSnap.exists) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const data = projSnap.data()!;
    const creatorUid = typeof data.uid === "string" ? data.uid : "";
    const devTop = typeof data.developerUid === "string" ? data.developerUid : "";
    const nested = data.project as { developerUid?: string; name?: string } | undefined;
    const devNested = typeof nested?.developerUid === "string" ? nested.developerUid : "";
    const developerUid = devTop || devNested;

    const isCreator = creatorUid === uid;
    const isDeveloper = developerUid === uid;
    if (!isCreator && !isDeveloper) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let completed = projectDocSaysCompleted(data);
    if (!completed) {
      const execSnap = await db.collection("projectExecution").doc(projectId).get();
      const st = execSnap.exists ? String((execSnap.data() as { status?: string })?.status ?? "") : "";
      completed = st === "completed";
    }

    if (!completed) {
      return NextResponse.json({ error: "Project is not completed yet" }, { status: 400 });
    }

    if (!developerUid) {
      return NextResponse.json({ error: "No developer assigned on project" }, { status: 400 });
    }

    const displayName =
      projectNameFallback || (typeof nested?.name === "string" ? nested.name : "") || "Project";

    await processCompletionRewardsAdmin(db, developerUid, displayName, projectId);

    return NextResponse.json({ ok: true, developerUid });
  } catch (e) {
    console.error("[project-completion-rewards]", e);
    if (isFirestoreCredentialsError(e)) {
      return NextResponse.json({ error: firebaseAdminUnavailableMessage(e) }, { status: 503 });
    }
    return NextResponse.json({ error: "Unable to process rewards. Please try again." }, { status: 500 });
  }
}
