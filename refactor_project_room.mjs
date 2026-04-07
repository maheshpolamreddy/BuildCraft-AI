import fs from 'fs';

const filePath = 'src/app/project-room/page.tsx';
let data = fs.readFileSync(filePath, 'utf-8');

// 1. Import workspace functions
if (!data.includes('subscribeToWorkspace')) {
    data = data.replace(
        'import {',
        'import { subscribeToWorkspace, updateWorkspaceTask } from "@/lib/workspace";\nimport {'
    );
}

// 2. We inject the subscription effect
const generateMilestonesString = `  // ── Generate milestones from AI ────────────────────────────────────────────`;
const replacementSub = `
  // ── Sync Milestones from Real-Time Workspace ─────────────────────────────
  useEffect(() => {
    if (!savedProjectId) return;
    return subscribeToWorkspace(savedProjectId, (state) => {
       if (state && state.milestones) {
           setMilestones(state.milestones);
       }
    });
  }, [savedProjectId]);

  // ── Generate milestones from AI ────────────────────────────────────────────`;
  
data = data.replace(generateMilestonesString, replacementSub);

// 3. We modify approveTask and rejectTask
const oldApproveTask = `  function approveTask(task: Task) {
    setMilestones(prev => prev.map(m => ({
      ...m,
      tasks: m.tasks.map(t => t.id !== task.id ? t : { ...t, status: "approved" }),
    })));
    setReviewTask(null);
    if (currentUser) logAction(currentUser.uid, "tool.approved", { task: task.title, projectId: savedProjectId });
  }`;

const newApproveTask = `  async function approveTask(task: Task) {
    if (savedProjectId && expandedMilestone) {
        await updateWorkspaceTask(savedProjectId, expandedMilestone, task.id, { status: "approved" });
    }
    setReviewTask(null);
    if (currentUser) logAction(currentUser.uid, "tool.approved", { task: task.title, projectId: savedProjectId });
  }`;

const oldRejectTask = `  function rejectTask(task: Task) {
    setMilestones(prev => prev.map(m => ({
      ...m,
      tasks: m.tasks.map(t => t.id !== task.id ? t : { ...t, status: "rejected" }),
    })));
    setReviewTask(null);
  }`;

const newRejectTask = `  async function rejectTask(task: Task) {
    if (savedProjectId && expandedMilestone) {
        await updateWorkspaceTask(savedProjectId, expandedMilestone, task.id, { status: "rejected" });
    }
    setReviewTask(null);
  }`;

data = data.replace(oldApproveTask, newApproveTask);
data = data.replace(oldRejectTask, newRejectTask);

fs.writeFileSync(filePath, data);
console.log('Project room synced with Workspace.');
