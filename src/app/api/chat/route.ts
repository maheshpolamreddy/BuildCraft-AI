/**
 * Legacy route: chat messages are written from the **signed-in browser** via
 * `sendChatMessage` in `@/lib/chat` (Firestore security rules require auth).
 * This endpoint no longer performs Firestore writes.
 */
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "Use the in-app Chat tab while signed in to send messages.",
      hint: "Open Project Room → Chat with Dev (employer) or Employee Dashboard → Chat with Client (developer).",
    },
    { status: 400 },
  );
}
