import { randomBytes } from "node:crypto";
import { redis } from "@/lib/cache";
import { messageForAiRouteFailure } from "@/lib/map-ai-route-error";

const PREFIX = "ai:deferred:";
const EX_SEC = 900;

export type DeferredJobState =
  | { status: "pending"; createdAt: string }
  | { status: "complete"; result: unknown; at: string }
  | { status: "error"; error: string; at: string };

export function canRunDeferredJobs(): boolean {
  return Boolean(redis);
}

export async function createDeferredJobId(): Promise<string> {
  return randomBytes(14).toString("hex");
}

export async function setDeferredJobPending(id: string): Promise<void> {
  if (!redis) return;
  const v: DeferredJobState = { status: "pending", createdAt: new Date().toISOString() };
  await redis.set(PREFIX + id, v, { ex: EX_SEC });
}

export async function setDeferredJobComplete(id: string, result: unknown): Promise<void> {
  if (!redis) return;
  const v: DeferredJobState = { status: "complete", result, at: new Date().toISOString() };
  await redis.set(PREFIX + id, v, { ex: EX_SEC });
}

export async function setDeferredJobErrorFromErr(id: string, err: unknown): Promise<void> {
  const msg = messageForAiRouteFailure(err);
  if (!redis) return;
  const v: DeferredJobState = { status: "error", error: msg, at: new Date().toISOString() };
  await redis.set(PREFIX + id, v, { ex: EX_SEC });
}

export async function getDeferredJob(id: string): Promise<DeferredJobState | null> {
  if (!redis) return null;
  return (await redis.get(PREFIX + id)) as DeferredJobState | null;
}