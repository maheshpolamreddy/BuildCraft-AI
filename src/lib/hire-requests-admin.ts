// Server-only hire requests and chat bootstrap via Firebase Admin (no browser Firebase session on Vercel).

import { adminDb } from "@/lib/firebase-admin";
import type { HireRequest } from "@/lib/hireRequests";
import type { ChatRoom } from "@/lib/chat";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

export async function getHireRequestAdmin(token: string): Promise<HireRequest | null> {
  const ref = adminDb.collection("hireRequests").doc(token);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  const status = data.status as string;
  const exp = data.expiresAt;
  if (status === "pending" && exp instanceof Timestamp) {
    if (Date.now() > exp.toMillis()) {
      await ref.update({ status: "expired" });
      return { ...(data as HireRequest), status: "expired" };
    }
  }
  return data as HireRequest;
}

export async function respondToHireRequestAdmin(
  token: string,
  status: "accepted" | "rejected",
): Promise<void> {
  await adminDb.collection("hireRequests").doc(token).update({
    status,
    respondedAt: FieldValue.serverTimestamp(),
  });
}

export async function createOrGetChatAdmin(
  data: Omit<ChatRoom, "lastMessage" | "lastMessageAt" | "lastSenderUid" | "createdAt">,
): Promise<void> {
  const ref = adminDb.collection("chats").doc(data.chatId);
  const snap = await ref.get();
  if (snap.exists) return;
  await ref.set({
    ...data,
    lastMessage: "",
    lastMessageAt: FieldValue.serverTimestamp(),
    lastSenderUid: "",
    createdAt: FieldValue.serverTimestamp(),
  });
}
