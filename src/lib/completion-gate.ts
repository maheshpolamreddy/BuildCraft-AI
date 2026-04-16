import {
  type Milestone,
  deriveMilestoneStatus,
  normalizeTaskStatus,
  withDerivedMilestoneStatuses,
} from "@/lib/workspace";

export function isTaskClientApproved(task: { status: unknown }): boolean {
  return normalizeTaskStatus(task.status) === "approved";
}

export function milestoneFullyApproved(m: Milestone): boolean {
  return deriveMilestoneStatus(m) === "approved";
}

export function areMilestonesReadyForCompletion(milestones: Milestone[]): boolean {
  const derived = withDerivedMilestoneStatuses(milestones);
  if (!derived.length) return false;
  const tasks = derived.flatMap((m) => m.tasks);
  if (!tasks.length) return false;
  const allTasksOk = tasks.every((t) => isTaskClientApproved(t));
  const allMilestonesOk = derived.every((m) => m.status === "approved");
  return allTasksOk && allMilestonesOk;
}

export function completionProgressPct(milestones: Milestone[]): number {
  const derived = withDerivedMilestoneStatuses(milestones);
  const tasks = derived.flatMap((m) => m.tasks);
  if (!tasks.length) return 0;
  const done = tasks.filter((t) => isTaskClientApproved(t)).length;
  return Math.round((done / tasks.length) * 100);
}

export function countTasksByStatus(milestones: Milestone[]) {
  const tasks = withDerivedMilestoneStatuses(milestones).flatMap((m) => m.tasks);
  return {
    total: tasks.length,
    fullyApproved: tasks.filter((t) => isTaskClientApproved(t)).length,
    awaitingClientReview: tasks.filter((t) => normalizeTaskStatus(t.status) === "completed_by_developer").length,
    otherTodo: tasks.filter((t) => {
      const s = normalizeTaskStatus(t.status);
      return s !== "approved" && s !== "completed_by_developer";
    }).length,
  };
}