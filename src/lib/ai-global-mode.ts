/**
 * Global adaptive AI mode: normal, low_cost, safe_mode.
 * Composes cost-guard + prod metrics ring; adds streak and structured logging.
 */

import { isLowCostModeActive } from "@/lib/ai-cost-guard";
import { recentFailureRatio, recordAiSample, shouldAutoSafeMode } from "@/lib/ai-prod-metrics";

export type AiAdaptiveMode = "normal" | "low_cost" | "safe_mode";

const RATIO_LOW_COST = 0.35;
const STREAK_SAFE = 8;

/** After a successful liveness probe, treat as normal briefly so LLM paths re-open and cache can warm. */
let forceNormalUntil = 0;

let consecutiveOrchestrationFailures = 0;

function logAiAdaptive(payload: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "test") return;
  try {
    console.log(
      JSON.stringify({
        tag: "ai-adaptive",
        ts: new Date().toISOString(),
        ...payload,
      }),
    );
  } catch {
    /* ignore */
  }
}

export function trackAdaptiveAfterOrchestration(success: boolean, meta?: { tag?: string }): void {
  if (success) {
    if (consecutiveOrchestrationFailures > 0) {
      logAiAdaptive({
        event: "streak_reset",
        priorStreak: consecutiveOrchestrationFailures,
        ...meta,
      });
    }
    consecutiveOrchestrationFailures = 0;
    return;
  }
  consecutiveOrchestrationFailures = Math.min(64, consecutiveOrchestrationFailures + 1);
  logAiAdaptive({
    event: "failure_streak",
    streak: consecutiveOrchestrationFailures,
    ratio: recentFailureRatio(),
    lowCost: isLowCostModeActive(),
    ...meta,
  });
}

function strongLowCostRatio(): boolean {
  return recentFailureRatio() > RATIO_LOW_COST;
}

export function getAdaptiveAiMode(): AiAdaptiveMode {
  if (Date.now() < forceNormalUntil) {
    return "normal";
  }
  if (shouldAutoSafeMode() || consecutiveOrchestrationFailures >= STREAK_SAFE) {
    return "safe_mode";
  }
  if (isLowCostModeActive() || strongLowCostRatio()) {
    return "low_cost";
  }
  return "normal";
}

/** Call after a successful background liveness call so safe_mode yields until metrics cool down. */
export function notifyRecoveryProbeSuccess(): void {
  consecutiveOrchestrationFailures = 0;
  forceNormalUntil = Date.now() + 3 * 60_000;
  lastLoggedMode = null;
  recordAiSample(true, "recovery_probe");
  logAiAdaptive({ event: "recovery_probe_ok", until: new Date(forceNormalUntil).toISOString() });
}

export function shouldSkipLlmCalls(): boolean {
  return getAdaptiveAiMode() === "safe_mode";
}

export function getAdaptiveModeTokenScale(): number {
  const m = getAdaptiveAiMode();
  if (m === "low_cost") return 0.78;
  return 1;
}

export function isSafeModeSkipsLlmError(err: unknown): boolean {
  return err instanceof Error && err.message === "AI_ORCHESTRATION_SKIPPED_SAFE_MODE";
}

export function makeSafeModeSkipError(): Error {
  return new Error("AI_ORCHESTRATION_SKIPPED_SAFE_MODE");
}

let lastLoggedMode: AiAdaptiveMode | null = null;

export function logAdaptiveModeIfChanged(): void {
  const m = getAdaptiveAiMode();
  if (m === lastLoggedMode) return;
  logAiAdaptive({
    event: "mode_change",
    from: lastLoggedMode,
    to: m,
    ratio: recentFailureRatio(),
    streak: consecutiveOrchestrationFailures,
  });
  lastLoggedMode = m;
  if (m === "normal") {
    recordAiSample(true, "adaptive_recovered");
  }
}
