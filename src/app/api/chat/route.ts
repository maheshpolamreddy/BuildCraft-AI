import { aiSuccessJson } from "@/lib/ai-response-envelope";

/**
 * Legacy route: chat messages are written from the **signed-in browser** via
 * `sendChatMessage` in `@/lib/chat` (Firestore security rules require auth).
 * This endpoint no longer performs Firestore writes.
 */
export async function POST() {
  return aiSuccessJson({ useInAppChat: true as const, code: "legacy" as const }, "fallback", { status: 400 });
}
