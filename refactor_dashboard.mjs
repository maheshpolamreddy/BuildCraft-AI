import fs from 'fs';

const filePath = 'src/app/employee-dashboard/page.tsx';
let data = fs.readFileSync(filePath, 'utf-8');

// 1. Remove workspace, prd, chat from Tab type
data = data.replace(
  'type Tab = "projects" | "workspace" | "assessments" | "profile" | "prd" | "chat";',
  'type Tab = "projects" | "assessments" | "profile";'
);
data = data.replace(
  'const allowed: Tab[] = ["projects", "workspace", "assessments", "profile", "prd", "chat"];',
  'const allowed: Tab[] = ["projects", "assessments", "profile"];'
);

// 2. Change the fetch effect so it loads hire requests on "projects" tab
data = data.replace(
  'if (activeTab !== "prd" || !currentUser) return;',
  'if ((activeTab !== "prd" && activeTab !== "projects") || !currentUser) return;'
);

// 3. Remove "workspace", "prd", "chat" from sidebar
const sidebarCodeToReplace = `        <nav className="flex-grow space-y-2">
          {([
            { id: "projects",    label: "Opportunities",  icon: <Briefcase className="w-5 h-5" /> },
            { id: "workspace",   label: "My Workspace",   icon: <Code2 className="w-5 h-5" />, badge: inProgress > 0 ? String(inProgress) : null },
            { id: "prd",         label: "PRD Document",   icon: <FileText className="w-5 h-5" />, badge: prds.length > 0 ? "New" : null },
            { id: "chat",        label: "Chat with Client", icon: <MessageSquare className="w-5 h-5" />, badge: activeChatId ? "Live" : null },
            { id: "assessments", label: "Skill Tests",    icon: <Activity className="w-5 h-5" />, badge: openSkillTestCount > 0 ? String(openSkillTestCount) : null },
            { id: "profile",     label: "My Profile",     icon: <User className="w-5 h-5" /> },
          ] as const).map(tab => (`;

const newSidebarCode = `        <nav className="flex-grow space-y-2">
          {([
            { id: "projects",    label: "Projects & Opportunities",  icon: <Briefcase className="w-5 h-5" />, badge: hireReqs.filter(r => r.status === "accepted").length > 0 ? String(hireReqs.filter(r => r.status === "accepted").length) : null },
            { id: "assessments", label: "Skill Tests",    icon: <Activity className="w-5 h-5" />, badge: openSkillTestCount > 0 ? String(openSkillTestCount) : null },
            { id: "profile",     label: "My Profile",     icon: <User className="w-5 h-5" /> },
          ] as const).map(tab => (`;

data = data.replace(sidebarCodeToReplace, newSidebarCode);

// 4. Update the Header logic
data = data.replace(
  '{activeTab === "projects" ? "Project Opportunities"',
  '{activeTab === "projects" ? "Projects & Opportunities"'
);

// 5. Inject Assigned Projects into "projects" tab
const assignedProjectsJSX = `
                {/* ── ASSIGNED PROJECTS ────────────────────────────────────────── */}
                {hireReqs.filter(r => r.status === "accepted").length > 0 && (
                  <div className="mb-10">
                    <h2 className="text-white font-black tracking-tight flex items-center gap-2 mb-4">
                      <Layers className="w-5 h-5 text-emerald-400" /> My Assigned Projects
                    </h2>
                    <div className="space-y-4">
                      {hireReqs.filter(r => r.status === "accepted").map(req => (
                        <div key={req.token} className="glass-panel p-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 transition-all">
                          <div className="flex justify-between items-start flex-wrap gap-4">
                            <div>
                              <div className="flex items-center gap-2 mb-1.5">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">Active Workspace</span>
                              </div>
                              <h3 className="text-white text-2xl font-black tracking-tight">{req.projectName}</h3>
                              <p className="text-[#888] text-xs mt-1 font-light flex items-center gap-1.5">
                                <Briefcase className="w-3.5 h-3.5" /> Client: {req.creatorName} ({req.creatorEmail})
                              </p>
                              <p className="text-white/60 text-sm font-light mt-3 leading-relaxed max-w-2xl text-left bg-black/20 p-3 rounded-lg border border-white/5">
                                {req.projectSummary || req.projectIdea}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-3 w-full sm:w-auto">
                              <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-bold rounded-lg uppercase tracking-widest">Assigned</span>
                              <Link href={\`/employee-dashboard/workspace/\${req.projectId}\`}
                                className="w-full sm:w-auto px-6 py-3 silver-gradient text-black font-black uppercase tracking-widest text-xs rounded-xl flex items-center justify-center gap-2 hover:opacity-90">
                                <Code2 className="w-4 h-4" /> Open Dedicated Workspace
                              </Link>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
`;

// Insert it right after the Match Opportunities header part... actually right at the start of activeTab === "projects"
data = data.replace(
  '<motion.section key="projects" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">',
  '<motion.section key="projects" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">' + assignedProjectsJSX
);

// Remove the old hardcoded "Active assignment — pinned at top" which uses the Zustand project
const oldActiveAssignmentStart = '{project && (';
const matchingEngineHeaderStart = '{/* Matching engine header */}';
const startIndexStr = data.indexOf(oldActiveAssignmentStart);
const endIndexStr = data.indexOf(matchingEngineHeaderStart);
if (startIndexStr !== -1 && endIndexStr !== -1) {
    data = data.slice(0, startIndexStr) + data.slice(endIndexStr);
}


// 6. Delete "workspace", "prd", "chat" tabs entirely!
const startDelete = data.indexOf('{activeTab === "workspace" && (');
const endDelete = data.indexOf('{activeTab === "assessments" && (');

if (startDelete !== -1 && endDelete !== -1) {
  data = data.slice(0, startDelete) + data.slice(endDelete);
}

// Write it back
fs.writeFileSync(filePath, data);
console.log('Dashboard refactored successfully.');
