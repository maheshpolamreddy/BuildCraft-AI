import { NextRequest, NextResponse } from "next/server";
import { getHireRequest, respondToHireRequest } from "@/lib/hireRequests";
import { sendHireAccepted, transactionalEmailConfigured } from "@/lib/email";
import { createOrGetChat } from "@/lib/chat";

/** Prefer deployment host so server-side fetch() works on Vercel (localhost would fail). */
function appBaseUrl(): string {
  const v = process.env.VERCEL_URL?.trim();
  if (v) return v.startsWith("http") ? v : `https://${v}`;
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
}

export async function POST(req: NextRequest) {
  try {
    const { token, action } = await req.json();

    if (!token || !["accept", "reject"].includes(action)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const request = await getHireRequest(token);
    if (!request) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }
    if (request.status !== "pending") {
      return NextResponse.json({ error: `This invite is already ${request.status}` }, { status: 409 });
    }

    if (action === "reject") {
      await respondToHireRequest(token, "rejected");
      return NextResponse.json({ success: true, status: "rejected" });
    }

    // ── Accept flow ────────────────────────────────────────────────────────────
    if (!transactionalEmailConfigured()) {
      return NextResponse.json(
        {
          error:
            "Email is not configured. Set GMAIL_USER + GMAIL_APP_PASSWORD (sends to any address as BUILDCRAFT AI), or BREVO_* / RESEND_* — see .env.example.",
          hint:
            "Local: use buildcraft/.env.local and restart dev. Vercel: enable these variables for Preview and Development, not only Production, then redeploy.",
        },
        { status: 503 },
      );
    }

    await respondToHireRequest(token, "accepted");

    // 1. Send confirmation email to project creator
    const emailResult = await sendHireAccepted({
      creatorEmail:  request.creatorEmail,
      creatorName:   request.creatorName,
      developerName: request.developerName,
      projectName:   request.projectName,
      dashboardUrl:  `${appBaseUrl()}/project-room?tab=chat&chat=${encodeURIComponent(token)}`,
    });
    if (!emailResult.ok) {
      console.error("[hire-respond] sendHireAccepted failed:", emailResult.error);
    }

    // 2. Create chat room (chatId = token)
    await createOrGetChat({
      chatId:         token,
      projectName:    request.projectName,
      creatorUid:     request.creatorUid,
      creatorName:    request.creatorName,
      creatorEmail:   request.creatorEmail,
      developerUid:   request.developerUid,
      developerName:  request.developerName,
      developerEmail: request.developerEmail,
    });

    // 3. Trigger PRD generation (fire and forget — no await needed)
    fetch(`${appBaseUrl()}/api/generate-prd`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        projectName:    request.projectName,
        projectIdea:    request.projectIdea,
        projectSummary: request.projectSummary,
        techStack:      [],
        creatorUid:     request.creatorUid,
        developerUid:   request.developerUid,
        hireToken:      token,
      }),
    }).catch(err => console.error("[hire-respond] PRD generation failed:", err));

    return NextResponse.json({ success: true, status: "accepted", chatId: token });
  } catch (err) {
    console.error("[hire-respond]", err);
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code: string }).code)
        : "";
    const message = err instanceof Error ? err.message : String(err);
    if (code === "permission-denied") {
      return NextResponse.json(
        {
          error:
            "Database permission denied. Deploy updated Firestore rules (chat room after accept), then try again.",
          hint: "From the buildcraft folder: npm run deploy:firestore — or paste firestore.rules into the Firebase console and Publish.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      {
        error: "Internal server error",
        hint: process.env.NODE_ENV === "development" ? message : undefined,
      },
      { status: 500 },
    );
  }
}
