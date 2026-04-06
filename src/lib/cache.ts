import { Redis } from '@upstash/redis';

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
