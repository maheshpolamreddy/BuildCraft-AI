"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Code2, CheckCircle2, Play, FileText, MessageSquare, Briefcase, 
  ChevronRight, Activity, Terminal, GitBranch, Shield, Zap, Layers,
  CheckCircle, Loader2, ArrowLeft, Send
} from "lucide-react";
import { useStore } from "@/store/useStore";
import { getProject, type SavedProject } from "@/lib/firestore";
import { getHireRequest, type HireRequest } from "@/lib/hireRequests";
import { getPRD, type PRDDocument } from "@/lib/prd";
import {
  subscribeToWorkspace,
  updateWorkspaceTask,
  initializeWorkspace,
  type WorkspaceState,
  type Milestone,
  type Task,
  type TaskStatus,
  type ValidationResult
} from "@/lib/workspace";
import {
  createOrGetChat, sendChatMessage, subscribeToChatMessages,
  subscribeToChatRoom, type ChatMessage as FireChatMsg, type ChatRoom
} from "@/lib/chat";

type SubTab = "kanban" | "prd" | "chat";

const TYPE_ICON: Record<Task["type"], React.ReactNode> = {
  frontend: <Layers className="w-3.5 h-3.5" />,
  backend:  <Terminal className="w-3.5 h-3.5" />,
  database: <GitBranch className="w-3.5 h-3.5" />,
  auth:     <Shield className="w-3.5 h-3.5" />,
  devops:   <Zap className="w-3.5 h-3.5" />,
  testing:  <CheckCircle2 className="w-3.5 h-3.5" />,
};

const COLOR_MAP: Record<string, string> = {
  blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  purple: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  orange: "text-orange-400 bg-orange-500/10 border-orange-500/20",
};

export default function IsolatedWorkspace() {
  const router = useRouter();
  const { projectId } = useParams() as { projectId: string };
  const { currentUser } = useStore();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeTab, setActiveTab] = useState<SubTab>("kanban");

  // Core Data
  const [projectData, setProjectData] = useState<SavedProject | null>(null);
  const [hireReq, setHireReq] = useState<HireRequest | null>(null);
  const [prdData, setPrdData] = useState<PRDDocument | null>(null);

  // Firestore Synced Workspace
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const milestones = workspace?.milestones ?? [];

  // Local UI State
  const [activeMilestoneId, setActiveMilestoneId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [submission, setSubmission] = useState("");
  const [validating, setValidating] = useState(false);
  
  // Chat Sync
  const [fireMsgs, setFireMsgs] = useState<FireChatMsg[]>([]);
  const [chatRoom, setChatRoom] = useState<ChatRoom | null>(null);
  const [chatText, setChatText] = useState("");
  const [chatSending, setChatSending] = useState(false);

  // 1. Initial Access Check & Data Fetching
  useEffect(() => {
    if (!currentUser) return;
    
    async function load() {
      try {
        const pState = await getProject(projectId);
        if (!pState) throw new Error("Project not found.");

        const res = await fetch("/api/hire-queries", { 
          method: "POST", 
          body: JSON.stringify({ projectId }) 
        });
        const { reqs } = await res.json();
        const req = reqs.find((r: any) => r.status === "accepted");
        
        if (!req) throw new Error("No accepted hire request found for this project.");
        
        // Access Control: Must be the Assigned Developer or the Creator
        if (currentUser!.uid !== req.developerUid && currentUser!.uid !== req.creatorUid) {
          throw new Error("Unauthorized access. You are not assigned to this project.");
        }

        setProjectData(pState);
        setHireReq(req);

        if (req.prdId) {
          const prd = await getPRD(req.prdId);
          setPrdData(prd);
        }

        // Initialize Workspace if missing
        if (req.developerUid === currentUser!.uid) {
           await fetch("/api/generate-milestones", {
             method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify({ projectName: pState.project.name, projectIdea: pState.project.idea })
           }).then(r => r.json()).then(data => {
             const defaultM = data.data?.milestones?.map((m: any) => ({
                 ...m, tasks: m.tasks.map((t: any) => ({ ...t, status: "todo", submission: "", validationResult: null, version: 1 }))
             })) || [];
             initializeWorkspace(projectId, defaultM);
           }).catch(() => {});
        }

      } catch (err: any) {
        setErrorMsg(err.message || "Failed to load workspace.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [projectId, currentUser]);

  // 2. Real-Time Workspace Listener
  useEffect(() => {
    if (!projectId || loading || errorMsg) return;
    return subscribeToWorkspace(projectId, (state) => {
      setWorkspace(state);
      if (state && !activeMilestoneId && state.milestones.length > 0) {
        setActiveMilestoneId(state.milestones[0].id);
      }
    });
  }, [projectId, loading, errorMsg, activeMilestoneId]);

  // 3. Real-Time Chat Listener
  useEffect(() => {
    if (!hireReq || activeTab !== "chat") return;
    const token = hireReq.token;
    
    createOrGetChat({
      chatId: token, projectName: hireReq.projectName,
      creatorUid: hireReq.creatorUid, creatorName: hireReq.creatorName, creatorEmail: hireReq.creatorEmail,
      developerUid: hireReq.developerUid, developerName: hireReq.developerName, developerEmail: hireReq.developerEmail
    }).catch(() => {});

    const u1 = subscribeToChatMessages(token, setFireMsgs, console.error);
    const u2 = subscribeToChatRoom(token, setChatRoom, console.error);
    return () => { u1(); u2(); };
  }, [hireReq, activeTab]);

  async function handleSendChat(e: React.FormEvent) {
    e.preventDefault();
    if (!chatText.trim() || !hireReq) return;
    setChatSending(true);
    try {
      await sendChatMessage(hireReq.token, {
        text: chatText,
        senderUid: currentUser!.uid,
        senderName: currentUser!.displayName || "Developer"
      });
      setChatText("");
    } finally {
      setChatSending(false);
    }
  }

  // 4. Task Validation
  async function handleValidate() {
    if (!selectedTask || !submission.trim() || !activeMilestoneId) return;
    setValidating(true);
    await updateWorkspaceTask(projectId, activeMilestoneId, selectedTask.id, { status: "validating", submission });
    
    try {
      const res = await fetch("/api/validate-submission", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskTitle: selectedTask.title, submission })
      });
      const { data, ok } = await res.json();
      const status = data.passed ? "review" : "rejected";
      await updateWorkspaceTask(projectId, activeMilestoneId, selectedTask.id, { status, submission, validationResult: data });
      setSelectedTask(prev => prev ? { ...prev, status, submission, validationResult: data } : null);
    } catch {
      await updateWorkspaceTask(projectId, activeMilestoneId, selectedTask.id, { status: "in-progress" });
    } finally {
      setValidating(false);
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-black"><Loader2 className="w-10 h-10 text-emerald-500 animate-spin" /></div>;
  if (errorMsg) return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white p-10 flex-col gap-4">
      <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-2xl text-center">
         <Shield className="w-10 h-10 text-red-500 mx-auto mb-3" />
         <h1 className="text-xl font-bold tracking-tight mb-2">Access Denied / Error</h1>
         <p className="text-red-300 text-sm max-w-sm">{errorMsg}</p>
      </div>
      <button onClick={() => router.push("/employee-dashboard")} className="flex items-center gap-2 hover:underline text-white/50 hover:text-white mt-4"><ArrowLeft className="w-4 h-4"/> Back to Dashboard</button>
    </div>
  );

  const activeMilestone = milestones.find(m => m.id === activeMilestoneId) ?? milestones[0];
  const isEmployer = currentUser?.uid === hireReq?.creatorUid;

  return (
    <div className="min-h-screen flex bg-[#050505] text-white">
      {/* ── Sidebar Navigation ──────────────────────────────── */}
      <aside className="w-64 border-r border-white/10 p-6 flex flex-col">
        <LinkToBack isEmployer={isEmployer} />
        <div className="mt-8 mb-6">
          <h2 className="text-xs font-black uppercase tracking-widest text-[#888] mb-1">Project Workspace</h2>
          <div className="text-lg font-black tracking-tighter truncate">{hireReq?.projectName}</div>
          <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest mt-1">Status: Active</div>
        </div>

        <nav className="flex flex-col gap-2 flex-grow">
          {[
            { id: "kanban", label: "Kanban Board", icon: <Briefcase className="w-4 h-4" /> },
            { id: "prd", label: "Project Details (PRD)", icon: <FileText className="w-4 h-4" /> },
            { id: "chat", label: "Client Communication", icon: <MessageSquare className="w-4 h-4" /> }
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id as SubTab)}
              className={`flex items-center gap-3 p-3 text-sm font-bold rounded-xl transition-all ${activeTab === t.id ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "text-white/40 hover:text-white hover:bg-white/5"}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* ── Main Canvas ───────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto p-10 relative">
        <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-emerald-500/[0.03] rounded-full blur-[150px] pointer-events-none -z-10" />

        {/* ── Kanban View ────────────────────────────── */}
        {activeTab === "kanban" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <h1 className="text-4xl font-black tracking-tight">Execution Board</h1>
            
            <div className="flex gap-2 flex-wrap">
              {milestones.map(m => (
                <button key={m.id} onClick={() => setActiveMilestoneId(m.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border ${activeMilestoneId === m.id ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-white/10 text-white/40 hover:bg-white/5'}`}>
                  {m.phase}
                </button>
              ))}
            </div>

            {activeMilestone && (
              <div className="grid lg:grid-cols-2 gap-8 mt-6">
                 {/* Tasks List */}
                 <div className="space-y-3">
                   {activeMilestone.tasks.map(task => (
                      <div key={task.id} onClick={() => setSelectedTask(task)}
                         className={`p-4 rounded-xl border transition-all cursor-pointer ${selectedTask?.id === task.id ? 'border-emerald-500/50 bg-emerald-500/5 shadow-xl' : 'border-white/10 glass-panel hover:border-white/20'}`}>
                         <div className="flex justify-between mb-2">
                           <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest border border-white/5 bg-white/5`}>
                              {TYPE_ICON[task.type]} {task.type}
                           </div>
                           <span className="text-[10px] text-white/50 font-bold uppercase tracking-widest">{task.status}</span>
                         </div>
                         <h4 className="font-bold">{task.title}</h4>
                      </div>
                   ))}
                 </div>

                 {/* Task Details Editor */}
                 <div className="glass-panel border border-white/10 rounded-3xl p-6 h-[70vh] flex flex-col">
                   {selectedTask ? (
                     <>
                        <h2 className="text-xl font-black mb-1">{selectedTask.title}</h2>
                        <p className="text-xs text-[#888] font-light italic mb-4">{selectedTask.description}</p>
                        
                        <div className="bg-black/40 border border-white/5 rounded-xl p-4 mb-4 text-xs font-mono text-emerald-400/70 select-all overflow-y-auto max-h-40">
                          {selectedTask.aiPrompt}
                        </div>
                        
                        {!isEmployer ? (
                          <>
                            <textarea placeholder="Paste your implementation code, PR link, or execution notes here..."
                              value={submission} onChange={e => setSubmission(e.target.value)}
                              className="flex-1 w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm resize-none focus:outline-none focus:border-emerald-500/50 transition-colors mb-4" />
                            <button onClick={handleValidate} disabled={validating || !submission.trim()}
                              className="w-full silver-gradient py-3.5 text-black font-black uppercase tracking-widest text-xs rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
                              {validating ? <Loader2 className="w-4 h-4 animate-spin"/> : <Play className="w-4 h-4"/>} 
                              Submit & AI Validate
                            </button>
                          </>
                        ) : (
                          <div className="flex-1 bg-white/5 rounded-xl p-4 overflow-y-auto border border-white/10 text-sm font-mono text-white/60">
                             {selectedTask.submission || "No submission provided yet."}
                          </div>
                        )}
                        
                        {selectedTask.validationResult && (
                           <div className={`mt-4 p-4 rounded-xl border ${selectedTask.validationResult.passed ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
                             <h4 className={`text-xs font-bold uppercase ${selectedTask.validationResult.passed ? 'text-emerald-400' : 'text-red-400'}`}>
                               {selectedTask.validationResult.passed ? "Passed Validation" : "Validation Failed"} ({selectedTask.validationResult.score}/100)
                             </h4>
                             <p className="text-xs mt-1 text-white/70">{selectedTask.validationResult.summary}</p>
                           </div>
                        )}
                     </>
                   ) : (
                     <div className="flex-1 flex flex-col items-center justify-center text-white/20 space-y-3">
                       <Code2 className="w-10 h-10" />
                       <span className="text-sm">Select a task from the board</span>
                     </div>
                   )}
                 </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ── PRD View ────────────────────────────── */}
        {activeTab === "prd" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <h1 className="text-4xl font-black tracking-tight border-b border-white/10 pb-6">Project Requirements Document</h1>
            {prdData ? (
              <div className="glass-panel border border-white/10 rounded-3xl p-8 max-w-4xl mx-auto space-y-8">
                <div>
                  <h2 className="text-2xl font-black tracking-tighter mb-2">{prdData.projectName}</h2>
                  <div className="text-sm text-[#888] font-light leading-relaxed p-4 bg-white/5 rounded-xl">{prdData.overview}</div>
                </div>
                
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-white/70">Core Features</h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {prdData.features.map((feature: string, idx: number) => (
                      <div key={idx} className="p-4 bg-white/5 rounded-xl border border-white/5 hover:border-white/20 transition-all flex items-start gap-3">
                        <div className="w-5 h-5 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <CheckCircle className="w-3 h-3 text-emerald-500" />
                        </div>
                        <p className="text-xs text-white/70 leading-relaxed font-light">{feature}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                   <h3 className="text-lg font-bold text-white/70">Implementation Roadmap</h3>
                   <div className="space-y-3">
                      {prdData.milestones.map((m, idx) => (
                        <div key={idx} className="p-4 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between">
                           <div>
                              <h4 className="font-bold text-sm text-white">{m.phase}: {m.title}</h4>
                              <p className="text-[10px] text-white/40 mt-0.5">{m.deliverables.join(", ")}</p>
                           </div>
                           <span className="text-[10px] font-black uppercase tracking-widest text-[#888]">{m.duration}</span>
                        </div>
                      ))}
                   </div>
                </div>
              </div>
            ) : (
               <div className="text-center py-20 text-white/40">No PRD Generated</div>
            )}
          </motion.div>
        )}

        {/* ── Chat View ────────────────────────────── */}
        {activeTab === "chat" && (
           <motion.div className="h-full flex flex-col">
             <h1 className="text-4xl font-black tracking-tight border-b border-white/10 pb-6 mb-6">Client Communication</h1>
             <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl flex flex-col overflow-hidden max-w-4xl mx-auto w-full">
               <div className="flex-1 overflow-y-auto p-4 flex flex-col-reverse justify-end gap-3">
                  <div className="space-y-4 pt-10">
                    {fireMsgs.map(msg => {
                       const isMe = msg.senderUid === currentUser!.uid;
                       return (
                         <div key={msg.id} className={`flex flex-col max-w-[70%] ${isMe ? "ml-auto items-end" : "mr-auto items-start"}`}>
                           <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${isMe ? "silver-gradient text-black font-medium" : "bg-white/10 text-white"} `}>
                             {msg.text}
                           </div>
                           <span className="text-[9px] text-[#888] mt-1 pr-1">{msg.senderName}</span>
                         </div>
                       )
                    })}
                  </div>
               </div>
               <form onSubmit={handleSendChat} className="p-3 border-t border-white/10 bg-[#050505] flex gap-2">
                 <input type="text" value={chatText} onChange={e => setChatText(e.target.value)} placeholder="Type a message..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm focus:border-emerald-500/50 outline-none"/>
                 <button type="submit" disabled={!chatText.trim() || chatSending}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/20 text-black font-black uppercase text-xs rounded-xl transition-all flex items-center justify-center">
                   <Send className="w-4 h-4"/>
                 </button>
               </form>
             </div>
           </motion.div>
        )}

      </main>
    </div>
  );
}

function LinkToBack({ isEmployer }: { isEmployer: boolean }) {
  const router = useRouter();
  return (
    <button onClick={() => router.push(isEmployer ? "/project-room" : "/employee-dashboard")} className="flex flex-row items-center gap-2 hover:text-white text-white/50 text-xs font-bold uppercase tracking-widest transition-all w-fit">
      <ArrowLeft className="w-4 h-4" /> Back to Dashboard
    </button>
  );
}
