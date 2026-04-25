type Sample = { at: number; ok: boolean; tag?: string };
const ring: Sample[] = [];
const RING_MAX = 120;
const WINDOW_MS = 5 * 60_000;

export function recordAiSample(ok: boolean, tag?: string): void {
  ring.push({ at: Date.now(), ok, tag });
  while (ring.length > RING_MAX) ring.shift();
}

export function recentFailureRatio(): number {
  const now = Date.now();
  const win = ring.filter((s) => now - s.at < WINDOW_MS);
  if (win.length < 8) return 0;
  const bad = win.filter((s) => !s.ok).length;
  return bad / win.length;
}

export function shouldAutoSafeMode(): boolean {
  return recentFailureRatio() > 0.5;
}