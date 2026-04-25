import { NextRequest } from "next/server";
import { getDeferredJob } from "@/lib/ai-deferred-jobs";
import { aiSuccessJson } from "@/lib/ai-response-envelope";

export const maxDuration = 60;

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await ctx.params;
  if (!jobId?.trim()) {
    return aiSuccessJson({ status: "unknown" as const, result: null }, "fallback", { status: 400 });
  }
  const state = await getDeferredJob(jobId);
  if (!state) {
    return aiSuccessJson({ status: "unknown" as const, result: null }, "fallback", { status: 404 });
  }
  if (state.status === "pending") {
    return aiSuccessJson({ status: "pending" as const, result: null }, "ai");
  }
  if (state.status === "error") {
    return aiSuccessJson({ status: "complete" as const, result: null }, "fallback");
  }
  return aiSuccessJson({ status: "complete" as const, result: state.result }, "ai");
}
