import { Redis } from '@upstash/redis';
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) 
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    }) 
  : null;

export async function getCachedOrchestration<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  try {
    return await redis.get<T>(key);
  } catch (error) {
    console.warn("[Redis Cache Error] get:", error);
    return null;
  }
}

export async function setCachedOrchestration<T>(key: string, data: T, expiresInSeconds = 2592000): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(key, data, { ex: expiresInSeconds });
  } catch (error) {
    console.warn("[Redis Cache Error] set:", error);
  }
}

/** Creates a SHA-256 hash suitable for Redis keys, works on the edge. */
export async function generateCacheKey(prefix: string, ...parts: string[]): Promise<string> {
  const text = parts.join("|").toLowerCase().trim();
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `ai-cache:${prefix}:${hashHex}`;
}

function readRateLimitInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const AI_RL_WINDOW_SEC = readRateLimitInt("AI_RATE_LIMIT_WINDOW_SEC", 12);
const AI_RL_MAX = readRateLimitInt("AI_RATE_LIMIT_MAX", 8);

function aiRateLimitClientKey(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (fwd) return `ip:${fwd}`;
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return `ip:${real}`;
  return "ip:unknown";
}

/** Redis sliding window per IP. Fails open if Redis is unavailable. */
export async function rateLimitAiRoute(req: NextRequest, routeLabel: string): Promise<NextResponse | null> {
  if (!redis) return null;
  const key = `ai:rl:${routeLabel}:${aiRateLimitClientKey(req)}`;
  try {
    const n = await redis.incr(key);
    if (n === 1) {
      await redis.expire(key, AI_RL_WINDOW_SEC);
    }
    if (n > AI_RL_MAX) {
      return NextResponse.json(
        { success: true, data: { rateLimited: true }, source: "fallback" as const },
        { status: 429 },
      );
    }
  } catch (e) {
    console.warn("[ai-rate-limit]", routeLabel, e);
  }
  return null;
}
