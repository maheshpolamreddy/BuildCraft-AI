import { NextRequest, NextResponse } from "next/server";
import { sendHireInvitation, transactionalEmailConfigured } from "@/lib/email";

/**
 * Sends the hire-invitation email only.
 *
 * The hireRequests/{token} document MUST be created by the signed-in client
 * (see project-room sendHireRequest). Server-side Firestore has no user auth,
 * so create/list would always fail security rules.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      token,
      projectName, projectSummary, projectIdea,
      creatorName,
      developerName, developerEmail,
    } = body;

    if (!token || typeof token !== "string" || token.length < 16) {
      return NextResponse.json(
        { error: "Invalid or missing invitation token." },
        { status: 400 },
      );
    }

    if (!developerEmail || !projectName) {
      return NextResponse.json(
        { error: "Missing project name or developer email." },
        { status: 400 },
      );
    }

    if (!transactionalEmailConfigured()) {
      return NextResponse.json(
        {
          error:
            "Email is not configured. Set GMAIL_USER + GMAIL_APP_PASSWORD (sends to any address as BUILDCRAFT AI), or BREVO_* / RESEND_* — see .env.example.",
          hint:
            "Local: put those in buildcraft/.env.local and restart dev. Vercel: add the same variables for Preview and Development, not only Production, then redeploy.",
        },
        { status: 503 },
      );
    }

    const emailResult = await sendHireInvitation({
      developerEmail,
      developerName: developerName ?? "Developer",
      creatorName:   creatorName ?? "Project creator",
      projectName,
      projectSummary:  projectSummary ?? projectIdea ?? "",
      token,
    });

    if (!emailResult.ok) {
      return NextResponse.json({ error: emailResult.error }, { status: 502 });
    }

    return NextResponse.json({ success: true, token });
  } catch (err) {
    console.error("[hire-request]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
