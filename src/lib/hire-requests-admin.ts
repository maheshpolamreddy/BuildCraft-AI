// Server-only hire request reads via Firebase Admin (no browser session on Vercel).

import type { Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import type { HireRequest } from "@/lib/hireRequests";

export async function getHireRequestAdmin(db: Firestore, token: string): Promise<HireRequest | null> {
  const ref = db.collection("hireRequests").doc(token);
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