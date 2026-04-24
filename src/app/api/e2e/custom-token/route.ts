import { NextRequest, NextResponse } from "next/server";
import { getAdminAuthSafe } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  const secret = process.env.E2E_SETUP_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (req.headers.get("x-e2e-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const emailRaw = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const creator = process.env.E2E_CREATOR_EMAIL?.trim().toLowerCase() ?? "";
  const developer = process.env.E2E_DEVELOPER_EMAIL?.trim().toLowerCase() ?? "";
  const allow = new Set([creator, developer].filter(Boolean));
  if (!emailRaw || !allow.has(emailRaw)) {
    return NextResponse.json({ error: "Email not allowlisted for E2E" }, { status: 400 });
  }

  const auth = getAdminAuthSafe();
  if (!auth) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  try {
    const user = await auth.getUserByEmail(emailRaw);
    const customToken = await auth.createCustomToken(user.uid);
    return NextResponse.json({ customToken });
  } catch (e) {
    console.error("[e2e/custom-token]", e);
    return NextResponse.json({ error: "Failed to mint token" }, { status: 500 });
  }
}