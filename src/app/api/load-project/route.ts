import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("id");
    const uid = req.nextUrl.searchParams.get("uid");
    if (!projectId || !uid) {
      return NextResponse.json({ error: "Missing id or uid" }, { status: 400 });
    }

    const projSnap = await adminDb.collection("projects").doc(projectId).get();
    if (!projSnap.exists) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const data = projSnap.data()!;

    const isCreator = data.uid === uid;
    let isDeveloper = data.developerUid === uid;

    if (!isCreator && !isDeveloper) {
      const hireSnap = await adminDb
        .collection("hireRequests")
        .where("projectId", "==", projectId)
        .where("developerUid", "==", uid)
        .where("status", "==", "accepted")
        .limit(1)
        .get();

      if (hireSnap.empty) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
      isDeveloper = true;

      await adminDb
        .collection("projects")
        .doc(projectId)
        .update({ developerUid: uid })
        .catch(() => {});
    }

    return NextResponse.json({ project: data });
  } catch (err) {
    console.error("[load-project]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}