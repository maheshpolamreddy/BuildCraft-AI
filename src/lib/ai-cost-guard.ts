import { isPaymentOrQuotaError } from "@/lib/ai-retry";

let consecutive402 = 0;
let consecutiveHardFailures = 0;
let lastSuccessAt = Date.now();

export function recordAiCompletionOutcome(success: boolean, err?: unknown): void {
  if (success) {
    consecutive402 = Math.max(0, consecutive402 - 1);
    consecutiveHardFailures = Math.max(0, consecutiveHardFailures - 2);
    lastSuccessAt = Date.now();
    return;
  }
  consecutiveHardFailures = Math.min(64, consecutiveHardFailures + 1);
  if (err && isPaymentOrQuotaError(err)) {
    consecutive402 = Math.min(32, consecutive402 + 1);
  }
}

export function isLowCostModeActive(): boolean {
  return consecutive402 >= 2 || consecutiveHardFailures >= 6;
}

export function lowCostMaxTokenFactor(): number {
  return isLowCostModeActive() ? 0.42 : 1;
}

export function shouldPreferBudgetModelPath(): boolean {
  return consecutive402 >= 3;
}