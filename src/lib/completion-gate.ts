import type { Milestone, Task } from "@/lib/workspace";

export function isTaskFullyApprovedForCompletion(task: Task): boolean {
  const s = task.status;
  return s === "approved_by_both" || s === "approved";
}

export function isTaskAwaitingDeveloperSignOff(task: Task): boolean {
  return task.status === "approved_creator";
}

export function milestoneFullyApprovedForCompletion(m: Milestone): boolean {
  if (m.tasks.length === 0) return false;
  return m.tasks.every(isTaskFullyApprovedForCompletion);
}

export function areMilestonesReadyForCompletion(milestones: Milestone[]): boolean {
  if (!milestones.length) return false;
  const tasks = milestones.flatMap((m) => m.tasks);
  if (!tasks.length) return false;
  return tasks.every(isTaskFullyApprovedForCompletion);
}

export function completionProgressPct(milestones: Milestone[]): number {
  const tasks = milestones.flatMap((m) => m.tasks);
  if (!tasks.length) return 0;
  const done = tasks.filter(isTaskFullyApprovedForCompletion).length;
  return Math.round((done / tasks.length) * 100);
}

export function countTasksByStatus(milestones: Milestone[]) {
  const tasks = milestones.flatMap((m) => m.tasks);
  return {
    total: tasks.length,
    fullyApproved: tasks.filter(isTaskFullyApprovedForCompletion).length,
    inReview: tasks.filter((t) => t.status === "review").length,
    awaitingDevSignOff: tasks.filter(isTaskAwaitingDeveloperSignOff).length,
    otherTodo: tasks.filter(
      (t) =>
        !isTaskFullyApprovedForCompletion(t) &&
        t.status !== "review" &&
        !isTaskAwaitingDeveloperSignOff(t),
    ).length,
  };
}