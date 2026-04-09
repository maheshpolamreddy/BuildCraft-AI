"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, XCircle, Rocket, Shield, Star, Send,
  AlertTriangle, ExternalLink, Loader2, Award, FileText,
  Trash2, Plus, Flag, Lock,
} from "lucide-react";
import type {
  ProjectExecution,
  Deliverable,
  ProjectStatus,
} from "@/lib/project-execution";
import {
  developerSubmitCompletion,
  creatorApproveCompletion,
  creatorRejectCompletion,
  addDeliverable,
  removeDeliverable,
  setDeploymentUrl,
  submitRating,
  canSubmitForCompletion,
  canCreatorApprove,
  getStatusLabel,
  getStatusColor,
} from "@/lib/project-execution";
import { processCompletionRewards } from "@/lib/rewards";
import { logAction } from "@/lib/auditLog";

interface Props {
  projectExecution: ProjectExecution | null;
  projectId: string;
  currentUid: string;
  isCreator: boolean;
  isDeveloper: boolean;
  allTasksDone: boolean;
  projectName: string;
  onRefresh?: () => void;
}

type PanelView = "status" | "submit" | "review" | "completed" | "rate";

export function ProjectCompletionPanel({
  projectExecution: pe,
  projectId,
  currentUid,
  isCreator,
  isDeveloper,
  allTasksDone,
  projectName,
  onRefresh,
}: Props) {
  const [view, setView] = useState<PanelView>("status");
  const [submitting, setSubmitting] = useState(false);
  const [devNotes, setDevNotes] = useState("");
  const [deployUrl, setDeployUrl] = useState(pe?.deploymentUrl || "");
  const [creatorNotes, setCreatorNotes] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [ratingScore, setRatingScore] = useState(0);
  const [ratingFeedback, setRatingFeedback] = useState("");
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [newDelTitle, setNewDelTitle] = useState("");
  const [newDelDesc, setNewDelDesc] = useState("");
  const [newDelUrl, setNewDelUrl] = useState("");
  const [addingDeliverable, setAddingDeliverable] = useState(false);
  const [rewardResult, setRewardResult] = useState<{ badgeUpgraded: boolean; portfolioUpdated: boolean } | null>(null);

  if (!pe) {
    return (
      <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.02] text-center">
        <Shield className="w-8 h-8 text-white/20 mx-auto mb-3" />
        <p className="text-white/40 text-sm">Project execution tracking will activate once a developer is hired.</p>
      </div>
    );
  }

  const status = pe.status;
  const statusLabel = getStatusLabel(status);
  const statusColor = getStatusColor(status);
  const submitCheck = canSubmitForCompletion(pe, allTasksDone);
  const approveCheck = canCreatorApprove(pe);

  async function handleDevSubmit() {
    if (!deployUrl.trim()) return;
    setSubmitting(true);
    try {
      await developerSubmitCompletion(projectId, devNotes, deployUrl.trim());
      await logAction(currentUid, "project.updated", {
        action: "developer_submitted_completion",
        projectId,
      });
      onRefresh?.();
    } catch (e) {
      console.error("Submit failed:", e);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreatorApprove() {
    if (!pe) return;
    setSubmitting(true);
    try {
      await creatorApproveCompletion(projectId, creatorNotes);
      if (pe.developerUid) {
        const result = await processCompletionRewards(pe.developerUid, projectName);
        setRewardResult(result);
      }
      await logAction(currentUid, "project.updated", {
        action: "creator_approved_completion",
        projectId,
      });
      onRefresh?.();
    } catch (e) {
      console.error("Approve failed:", e);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreatorReject() {
    if (!rejectReason.trim()) return;
    setSubmitting(true);
    try {
      await creatorRejectCompletion(projectId, rejectReason.trim());
      await logAction(currentUid, "project.updated", {
        action: "creator_rejected_completion",
        projectId,
        reason: rejectReason.trim(),
      });
      setShowRejectForm(false);
      setRejectReason("");
      onRefresh?.();
    } catch (e) {
      console.error("Reject failed:", e);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddDeliverable() {
    if (!newDelTitle.trim()) return;
    setAddingDeliverable(true);
    try {
      const deliverable: Deliverable = {
        id: `del_${Date.now()}`,
        title: newDelTitle.trim(),
        description: newDelDesc.trim(),
        url: newDelUrl.trim() || undefined,
        addedAt: Date.now(),
        addedBy: currentUid,
      };
      await addDeliverable(projectId, deliverable);
      setNewDelTitle("");
      setNewDelDesc("");
      setNewDelUrl("");
      onRefresh?.();
    } finally {
      setAddingDeliverable(false);
    }
  }

  async function handleRemoveDeliverable(id: string) {
    await removeDeliverable(projectId, id);
    onRefresh?.();
  }

  async function handleDeployUrlSave() {
    if (!deployUrl.trim()) return;
    await setDeploymentUrl(projectId, deployUrl.trim());
    onRefresh?.();
  }

  async function handleRatingSubmit() {
    if (ratingScore < 1) return;
    setSubmitting(true);
    try {
      const role = isCreator ? "creator" : "developer";
      await submitRating(projectId, role, ratingScore, ratingFeedback);
      setRatingSubmitted(true);
      onRefresh?.();
    } finally {
      setSubmitting(false);
    }
  }

  const hasRated = isCreator ? pe.rating.creator !== null : pe.rating.developer !== null;

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      <div className={`p-5 rounded-2xl border ${statusColor} flex items-center justify-between gap-4`}>
        <div className="flex items-center gap-3">
          {status === "completed" ? (
            <CheckCircle2 className="w-6 h-6 shrink-0" />
          ) : status === "review" ? (
            <Flag className="w-6 h-6 shrink-0" />
          ) : (
            <Rocket className="w-6 h-6 shrink-0" />
          )}
          <div>
            <div className="font-black text-sm uppercase tracking-widest">{statusLabel}</div>
            <p className="text-xs opacity-70 mt-0.5">
              {status === "review" && isCreator && "Developer submitted for review. Please verify deliverables."}
              {status === "review" && isDeveloper && "Waiting for project creator to review your submission."}
              {status === "in_progress" && "Project is actively being worked on."}
              {status === "completed" && "Both parties approved. Project completed successfully!"}
            </p>
          </div>
        </div>
        {status !== "completed" && status !== "draft" && (
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full animate-pulse ${status === "review" ? "bg-orange-500" : "bg-purple-500"}`} />
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">Live</span>
          </div>
        )}
      </div>

      {/* Approval Pipeline Visualization */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Developer Submits", done: pe.developerApproval.approved, icon: <Send className="w-4 h-4" /> },
          { label: "Creator Reviews", done: pe.creatorApproval.approved, icon: <Shield className="w-4 h-4" /> },
          { label: "Project Complete", done: status === "completed", icon: <Award className="w-4 h-4" /> },
        ].map((step, i) => (
          <div
            key={i}
            className={`p-3 rounded-xl border text-center transition-all ${
              step.done
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : "bg-white/[0.02] border-white/10 text-white/30"
            }`}
          >
            <div className="flex justify-center mb-1.5">{step.icon}</div>
            <div className="text-[10px] font-bold uppercase tracking-widest">{step.label}</div>
            {step.done && <CheckCircle2 className="w-3.5 h-3.5 mx-auto mt-1.5" />}
          </div>
        ))}
      </div>

      {/* Deliverables Section */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
        <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-widest text-white/60 flex items-center gap-2">
            <FileText className="w-4 h-4" /> Deliverables ({pe.deliverables.length})
          </h3>
          {(isDeveloper && status === "in_progress") && (
            <button
              onClick={() => setView(view === "submit" ? "status" : "submit")}
              className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white hover:border-white/20 transition-colors"
            >
              <Plus className="w-3 h-3 inline mr-1" /> Add
            </button>
          )}
        </div>

        {pe.deliverables.length === 0 ? (
          <div className="p-6 text-center text-white/25 text-sm">No deliverables added yet.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {pe.deliverables.map((d) => (
              <div key={d.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white font-bold truncate">{d.title}</div>
                  {d.description && <p className="text-xs text-white/40 truncate mt-0.5">{d.description}</p>}
                  {d.url && (
                    <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-1">
                      <ExternalLink className="w-3 h-3" /> {d.url}
                    </a>
                  )}
                </div>
                {isDeveloper && status === "in_progress" && (
                  <button onClick={() => handleRemoveDeliverable(d.id)} className="text-red-400/50 hover:text-red-400 transition-colors shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add deliverable form */}
        <AnimatePresence>
          {view === "submit" && isDeveloper && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-white/5 overflow-hidden"
            >
              <div className="p-5 space-y-3">
                <input
                  value={newDelTitle}
                  onChange={(e) => setNewDelTitle(e.target.value)}
                  placeholder="Deliverable title"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-indigo-500/50"
                />
                <input
                  value={newDelDesc}
                  onChange={(e) => setNewDelDesc(e.target.value)}
                  placeholder="Description (optional)"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-indigo-500/50"
                />
                <input
                  value={newDelUrl}
                  onChange={(e) => setNewDelUrl(e.target.value)}
                  placeholder="URL (optional)"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-indigo-500/50"
                />
                <button
                  onClick={handleAddDeliverable}
                  disabled={!newDelTitle.trim() || addingDeliverable}
                  className="w-full py-2.5 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 font-bold text-xs uppercase tracking-widest hover:bg-indigo-500/30 transition-colors disabled:opacity-40"
                >
                  {addingDeliverable ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Add Deliverable"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Deployment URL */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <h3 className="text-xs font-black uppercase tracking-widest text-white/60 flex items-center gap-2 mb-3">
          <Rocket className="w-4 h-4" /> Deployment URL
        </h3>
        {isDeveloper && status !== "completed" ? (
          <div className="flex gap-2">
            <input
              value={deployUrl}
              onChange={(e) => setDeployUrl(e.target.value)}
              placeholder="https://your-project.vercel.app"
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-indigo-500/50"
            />
            <button
              onClick={handleDeployUrlSave}
              disabled={!deployUrl.trim()}
              className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white font-bold text-xs uppercase tracking-widest transition-colors disabled:opacity-40"
            >
              Save
            </button>
          </div>
        ) : pe.deploymentUrl ? (
          <a href={pe.deploymentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm font-medium">
            <ExternalLink className="w-4 h-4" /> {pe.deploymentUrl}
          </a>
        ) : (
          <p className="text-white/30 text-sm">No deployment URL submitted yet.</p>
        )}
      </div>

      {/* Developer Submit Completion */}
      {isDeveloper && status === "in_progress" && (
        <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-5 space-y-4">
          <h3 className="text-sm font-black text-white flex items-center gap-2">
            <Send className="w-4 h-4 text-indigo-400" /> Submit for Completion
          </h3>
          {!submitCheck.ok ? (
            <div className="flex items-center gap-2 text-yellow-400 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{submitCheck.reason}</span>
            </div>
          ) : (
            <>
              <textarea
                value={devNotes}
                onChange={(e) => setDevNotes(e.target.value)}
                placeholder="Summary of what was delivered, any notes for the project creator..."
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-indigo-500/50 resize-none"
              />
              <button
                onClick={handleDevSubmit}
                disabled={!deployUrl.trim() || submitting}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-black text-sm uppercase tracking-widest hover:from-indigo-500 hover:to-purple-500 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Submit Project for Review
              </button>
            </>
          )}
        </div>
      )}

      {/* Creator Review Panel */}
      {isCreator && status === "review" && (
        <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-5 space-y-4">
          <h3 className="text-sm font-black text-white flex items-center gap-2">
            <Shield className="w-4 h-4 text-orange-400" /> Review Submission
          </h3>

          {pe.developerApproval.notes && (
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Developer Notes</div>
              <p className="text-sm text-white/70">{pe.developerApproval.notes}</p>
            </div>
          )}

          {pe.deploymentUrl && (
            <a href={pe.deploymentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm p-3 rounded-xl bg-blue-500/5 border border-blue-500/15">
              <ExternalLink className="w-4 h-4" /> View Deployment: {pe.deploymentUrl}
            </a>
          )}

          {!approveCheck.ok && (
            <div className="flex items-center gap-2 text-yellow-400 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{approveCheck.reason}</span>
            </div>
          )}

          <textarea
            value={creatorNotes}
            onChange={(e) => setCreatorNotes(e.target.value)}
            placeholder="Approval notes (optional)..."
            rows={2}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-emerald-500/50 resize-none"
          />

          <div className="flex gap-3">
            <button
              onClick={handleCreatorApprove}
              disabled={!approveCheck.ok || submitting}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 text-white font-black text-sm uppercase tracking-widest hover:from-emerald-500 hover:to-green-500 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Approve & Complete
            </button>
            <button
              onClick={() => setShowRejectForm(!showRejectForm)}
              className="px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 font-bold text-xs uppercase tracking-widest hover:bg-red-500/20 transition-colors"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>

          <AnimatePresence>
            {showRejectForm && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 space-y-3">
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Explain what needs to be fixed..."
                    rows={2}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-red-500/50 resize-none"
                  />
                  <button
                    onClick={handleCreatorReject}
                    disabled={!rejectReason.trim() || submitting}
                    className="w-full py-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 font-bold text-xs uppercase tracking-widest hover:bg-red-500/30 transition-colors disabled:opacity-40"
                  >
                    Request Revisions
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Completed + Rewards */}
      {status === "completed" && (
        <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-green-500/5 p-6 space-y-4">
          <div className="text-center space-y-2">
            <Award className="w-10 h-10 text-emerald-400 mx-auto" />
            <h3 className="text-lg font-black text-white">Project Completed!</h3>
            <p className="text-sm text-white/50">Both developer and project creator have approved the deliverables.</p>
          </div>

          {rewardResult && (
            <div className="space-y-2 pt-2">
              {rewardResult.badgeUpgraded && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs font-bold">
                  <Award className="w-4 h-4" /> Developer earned Tier 3: Project Verified badge!
                </div>
              )}
              {rewardResult.portfolioUpdated && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold">
                  <FileText className="w-4 h-4" /> Project added to developer portfolio.
                </div>
              )}
            </div>
          )}

          {/* Rating */}
          {!hasRated && (
            <div className="pt-4 border-t border-white/10 space-y-3">
              <h4 className="text-xs font-black uppercase tracking-widest text-white/60">
                Rate {isCreator ? "the Developer" : "the Project Creator"}
              </h4>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    onClick={() => setRatingScore(s)}
                    className={`p-1.5 transition-all ${s <= ratingScore ? "text-yellow-400" : "text-white/20 hover:text-white/40"}`}
                  >
                    <Star className={`w-6 h-6 ${s <= ratingScore ? "fill-yellow-400" : ""}`} />
                  </button>
                ))}
              </div>
              <textarea
                value={ratingFeedback}
                onChange={(e) => setRatingFeedback(e.target.value)}
                placeholder="Feedback (optional)..."
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none resize-none"
              />
              <button
                onClick={handleRatingSubmit}
                disabled={ratingScore < 1 || submitting || ratingSubmitted}
                className="w-full py-2.5 rounded-xl bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 font-bold text-xs uppercase tracking-widest hover:bg-yellow-500/30 transition-colors disabled:opacity-40"
              >
                {ratingSubmitted ? "Rating Submitted" : "Submit Rating"}
              </button>
            </div>
          )}

          {hasRated && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-white/5 border border-white/10 text-white/50 text-xs font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> You have rated this project.
            </div>
          )}
        </div>
      )}

      {/* Project State Timeline (always visible) */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <h3 className="text-xs font-black uppercase tracking-widest text-white/40 mb-4 flex items-center gap-2">
          <Lock className="w-3.5 h-3.5" /> Execution Timeline
        </h3>
        <div className="space-y-3">
          {(["draft", "matching", "hiring", "pending_acceptance", "in_progress", "review", "completed"] as ProjectStatus[]).map((s, i) => {
            const isCurrent = s === status;
            const isPast = (["draft", "matching", "hiring", "pending_acceptance", "in_progress", "review", "completed"] as ProjectStatus[]).indexOf(status) > i;
            return (
              <div key={s} className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full border-2 shrink-0 transition-all ${
                  isCurrent ? "border-purple-500 bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]"
                  : isPast ? "border-emerald-500 bg-emerald-500"
                  : "border-white/20 bg-transparent"
                }`} />
                <span className={`text-xs font-bold uppercase tracking-widest ${
                  isCurrent ? "text-white" : isPast ? "text-emerald-400/60" : "text-white/20"
                }`}>
                  {getStatusLabel(s)}
                </span>
                {isCurrent && <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 font-bold">Current</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
