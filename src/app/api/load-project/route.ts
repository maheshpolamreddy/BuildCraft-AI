import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("id");
    if (!projectId) {
      return NextResponse.json({ error: "Missing project id" }, { status: 400 });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let uid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
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

      await adminDb.collection("projects").doc(projectId).update({ developerUid: uid }).catch(() => {});
    }

    return NextResponse.json({ project: data });
  } catch (err) {
    console.error("[load-project]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}