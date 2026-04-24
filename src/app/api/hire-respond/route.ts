import { NextRequest, NextResponse } from "next/server";
import { getHireRequestAdmin } from "@/lib/hire-requests-admin";
import type { HireRequest } from "@/lib/hireRequests";
import { sendHireAccepted, transactionalEmailConfigured } from "@/lib/email";
import {
  getAdminDbSafe,
  firebaseAdminUnavailableMessage,
  isFirestoreCredentialsError,
  SERVER_CONFIG_USER_FACING_ERROR,
} from "@/lib/firebase-admin";
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { initProjectExecutionAdmin } from "@/lib/project-execution-admin";

function appBaseUrl(): string {
  const v = process.env.VERCEL_URL?.trim();
  if (v) return v.startsWith("http") ? v : `https://${v}`;
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
}

function normalizeProjectNameKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

async function resolveProjectDocIdForHire(
  adb: Firestore,
  creatorUid: string,
  projectName: string,
): Promise<string | null> {
  const key = normalizeProjectNameKey(projectName);
  if (!creatorUid || !key) return null;
  try {
    const snap = await adb.collection("projects").where("uid", "==", creatorUid).limit(50).get();
    let best: { id: string; updatedSec: number } | null = null;
    for (const docSnap of snap.docs) {
      const data = docSnap.data() as {
        project?: { name?: string };
        updatedAt?: { seconds?: number };
      };
      const nm =
        typeof data.project?.name === "string" ? normalizeProjectNameKey(data.project.name) : "";
      if (nm !== key) continue;
      const sec = typeof data.updatedAt?.seconds === "number" ? data.updatedAt.seconds : 0;
      if (!best || sec >= best.updatedSec) best = { id: docSnap.id, updatedSec: sec };
    }
    return best?.id ?? null;
  } catch (e) {
    console.warn("[hire-respond] resolveProjectDocIdForHire:", e);
    return null;
  }
}

async function runRejectTransaction(db: Firestore, token: string): Promise<void> {
  await db.runTransaction(async (t) => {
    const hireRef = db.collection("hireRequests").doc(token);
    const hireSnap = await t.get(hireRef);
    if (!hireSnap.exists) {
      throw Object.assign(new Error("Invite not found"), { code: "NOT_FOUND" });
    }
    const st = hireSnap.data()!.status as string;
    if (st !== "pending") {
      throw Object.assign(new Error(`This invite is already ${st}`), { code: "CONFLICT" });
    }
    t.update(hireRef, {
      status: "rejected",
      respondedAt: FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Single transaction: accept invite, assign developer on project + workspace, create chat if missing.
 * No partial accept: if this throws, Firestore stays unchanged.
 */
async function runAcceptTransaction(
  db: Firestore,
  token: string,
  hire: HireRequest,
  projectDocId: string,
): Promise<void> {
  await db.runTransaction(async (t) => {
    const hireRef = db.collection("hireRequests").doc(token);
    const hireSnap = await t.get(hireRef);
    if (!hireSnap.exists) {
      throw Object.assign(new Error("Invite not found"), { code: "NOT_FOUND" });
    }
    const hr = hireSnap.data()!;
    if (hr.status !== "pending") {
      throw Object.assign(new Error(`This invite is already ${hr.status}`), { code: "CONFLICT" });
    }

    const projRef = db.collection("projects").doc(projectDocId);
    const projSnap = await t.get(projRef);
    if (!projSnap.exists) {
      throw Object.assign(new Error("Project not found"), { code: "NOT_FOUND" });
    }
    const projData = projSnap.data()!;
    const ownerUid = typeof projData.uid === "string" ? projData.uid : "";
    if (ownerUid && ownerUid !== hire.creatorUid) {
      throw Object.assign(new Error("Project creator does not match this invite"), { code: "FORBIDDEN" });
    }

    const chatRef = db.collection("chats").doc(token);
    const chatSnap = await t.get(chatRef);
    const wsRef = db.collection("projectWorkspaces").doc(projectDocId);
    const wsSnap = await t.get(wsRef);

    t.update(hireRef, {
      status: "accepted",
      respondedAt: FieldValue.serverTimestamp(),
      projectId: projectDocId,
    });

    t.update(projRef, { developerUid: hire.developerUid });

    const creatorUidForWorkspace = ownerUid || hire.creatorUid;

    if (wsSnap.exists) {
      t.update(wsRef, {
        developerUid: hire.developerUid,
        updatedAt: Date.now(),
      });
    } else {
      t.set(wsRef, {
        projectId: projectDocId,
        uid: creatorUidForWorkspace,
        developerUid: hire.developerUid,
        milestones: [],
        updatedAt: Date.now(),
      });
    }

    if (!chatSnap.exists) {
      t.set(chatRef, {
        chatId: token,
        projectName: hire.projectName,
        creatorUid: hire.creatorUid,
        creatorName: hire.creatorName,
        creatorEmail: hire.creatorEmail,
        developerUid: hire.developerUid,
        developerName: hire.developerName,
        developerEmail: hire.developerEmail,
        lastMessage: "",
        lastMessageAt: FieldValue.serverTimestamp(),
        lastSenderUid: "",
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  });
}

function mapTransactionError(err: unknown): NextResponse {
  const code =
    typeof err === "object" && err !== null && "code" in err ? String((err as { code: string }).code) : "";
  const msg = err instanceof Error ? err.message : "Unable to accept offer. Please try again.";
  if (code === "NOT_FOUND") {
    return NextResponse.json({ error: msg }, { status: 404 });
  }
  if (code === "CONFLICT") {
    return NextResponse.json({ error: msg }, { status: 409 });
  }
  if (code === "FORBIDDEN") {
    return NextResponse.json({ error: msg }, { status: 403 });
  }
  return NextResponse.json({ error: "Unable to accept offer. Please try again." }, { status: 500 });
}

export async function POST(req: NextRequest) {
  const db = getAdminDbSafe();
  if (!db) {
    return NextResponse.json({ error: SERVER_CONFIG_USER_FACING_ERROR }, { status: 503 });
  }

  try {
    const { token, action } = await req.json();

    if (!token || !["accept", "reject"].includes(action)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const requestRow = await getHireRequestAdmin(db, token);
    if (!requestRow) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }
    if (requestRow.status !== "pending") {
      return NextResponse.json({ error: `This invite is already ${requestRow.status}` }, { status: 409 });
    }

    if (action === "reject") {
      try {
        await runRejectTransaction(db, token);
      } catch (err) {
        return mapTransactionError(err);
      }
      return NextResponse.json({ success: true, status: "rejected" });
    }

    let effectiveProjectId = requestRow.projectId?.trim() || null;
    if (!effectiveProjectId) {
      effectiveProjectId = await resolveProjectDocIdForHire(db, requestRow.creatorUid, requestRow.projectName);
    }

    if (!effectiveProjectId) {
      return NextResponse.json(
        {
          error:
            "Could not link this invite to a saved project. Ask the client to open Project Room and re-send the hire invite so the project ID is attached.",
        },
        { status: 409 },
      );
    }

    try {
      await runAcceptTransaction(db, token, requestRow, effectiveProjectId);
    } catch (err) {
      console.error("[hire-respond] accept transaction:", err);
      return mapTransactionError(err);
    }

    if (transactionalEmailConfigured()) {
      const emailResult = await sendHireAccepted({
        creatorEmail: requestRow.creatorEmail,
        creatorName: requestRow.creatorName,
        developerName: requestRow.developerName,
        projectName: requestRow.projectName,
        dashboardUrl: `${appBaseUrl()}/project-room?tab=chat&chat=${encodeURIComponent(token)}`,
      });
      if (!emailResult.ok) {
        console.warn("[hire-respond] sendHireAccepted failed (non-blocking):", emailResult.error);
      }
    } else {
      console.warn("[hire-respond] Email not configured; skipping hire-accepted message.");
    }

    try {
      await initProjectExecutionAdmin(db, {
        projectId: effectiveProjectId,
        savedProjectId: effectiveProjectId,
        projectName: requestRow.projectName,
        creatorUid: requestRow.creatorUid,
        developerUid: requestRow.developerUid,
        hireToken: token,
      });
    } catch (e) {
      console.warn("[hire-respond] project execution init error (non-blocking):", e);
    }

    fetch(`${appBaseUrl()}/api/generate-prd`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectName: requestRow.projectName,
        projectIdea: requestRow.projectIdea,
        projectSummary: requestRow.projectSummary,
        techStack: [],
        creatorUid: requestRow.creatorUid,
        developerUid: requestRow.developerUid,
        hireToken: token,
      }),
    }).catch((err) => console.error("[hire-respond] PRD generation failed:", err));

    return NextResponse.json({
      success: true,
      status: "accepted",
      chatId: token,
      projectId: effectiveProjectId,
    });
  } catch (err) {
    console.error("[hire-respond]", err);
    if (isFirestoreCredentialsError(err)) {
      return NextResponse.json({ error: firebaseAdminUnavailableMessage(err) }, { status: 503 });
    }
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code: string }).code)
        : "";
    if (code === "permission-denied") {
      return NextResponse.json({ error: SERVER_CONFIG_USER_FACING_ERROR }, { status: 503 });
    }
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "development"
            ? err instanceof Error
              ? err.message
              : String(err)
            : "Unable to accept offer. Please try again.",
      },
      { status: 500 },
    );
  }
}
