import { FieldValue } from "firebase-admin/firestore";
import { getAdminDbSafe } from "@/lib/firebase-admin";
import { generateCacheKey, getCachedOrchestration, setCachedOrchestration } from "@/lib/cache";

export type AiCacheSection = "architecture" | "prompts" | "milestones" | "prd";

const COLLECTION = "aiGenerationCache";

export async function hashAiInputs(...parts: string[]): Promise<string> {
  const text = parts.map((p) => String(p ?? "").trim()).join("|").toLowerCase();
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function buildAiCacheDocId(
  scopeId: string | undefined,
  section: AiCacheSection,
  inputHash: string,
): string {
  const sid = (scopeId ?? "").trim();
  const safe = sid.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 140) || "anon";
  return `${safe}_${section}_${inputHash.slice(0, 64)}`;
}

export async function getAiGenerationFirestore<T>(
  scopeId: string,
  section: AiCacheSection,
  inputHash: string,
): Promise<T | null> {
  const db = getAdminDbSafe();
  if (!db) return null;
  try {
    const id = buildAiCacheDocId(scopeId, section, inputHash);
    const snap = await db.collection(COLLECTION).doc(id).get();
    if (!snap.exists) return null;
    const d = snap.data() as { inputHash?: string; output?: T } | undefined;
    if (!d || d.inputHash !== inputHash || d.output === undefined) return null;
    return d.output;
  } catch (e) {
    console.warn("[ai-generation-cache] get:", e);
    return null;
  }
}

export async function setAiGenerationFirestore<T>(
  scopeId: string,
  section: AiCacheSection,
  inputHash: string,
  output: T,
): Promise<void> {
  const db = getAdminDbSafe();
  if (!db) return;
  try {
    const id = buildAiCacheDocId(scopeId, section, inputHash);
    await db
      .collection(COLLECTION)
      .doc(id)
      .set(
        {
          projectId: scopeId,
          section,
          inputHash,
          output,
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  } catch (e) {
    console.warn("[ai-generation-cache] set:", e);
  }
}

export async function getRedisAiCache<T>(prefix: string, keyParts: string[]): Promise<T | null> {
  const key = await generateCacheKey(prefix, ...keyParts);
  return getCachedOrchestration<T>(key);
}

export async function setRedisAiCache<T>(prefix: string, keyParts: string[], data: T): Promise<void> {
  const key = await generateCacheKey(prefix, ...keyParts);
  await setCachedOrchestration(key, data);
}