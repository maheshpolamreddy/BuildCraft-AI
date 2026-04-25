/**
 * Single-instance dedupe: prevents duplicate LLM work when the same logical request
 * is triggered twice in parallel (e.g. double submit). In serverless, this helps per warm instance.
 */
const inflight = new Map<string, Promise<unknown>>();

export function withInflightDedup<T>(key: string, run: () => Promise<T>): Promise<T> {
  const hit = inflight.get(key) as Promise<T> | undefined;
  if (hit) return hit;
  const p = run().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, p);
  return p;
}