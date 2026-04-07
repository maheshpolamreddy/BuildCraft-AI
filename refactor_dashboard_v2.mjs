import fs from 'fs';

const p = 'src/app/employee-dashboard/page.tsx';
let d = fs.readFileSync(p, 'utf-8');

// 1. Remove `workspace` from the sidebar nav.
// Look for `{ id: "workspace",   label: "Execution Workspace",       icon: <Code2 className="w-5 h-5" /> },`
d = d.replace(
  '{ id: "workspace",   label: "Execution Workspace",       icon: <Code2 className="w-5 h-5" /> },\n',
  ''
);

// 2. Change sidebar title of Projects to "Projects & Opportunities".
d = d.replace(
  '{ id: "projects",    label: "Projects & Opportunities"',
  '{ id: "projects",    label: "Assigned Projects",  icon: <Briefcase className="w-5 h-5" />, badge: hireReqs.filter(r => r.status === "accepted").length > 0 ? String(hireReqs.filter(r => r.status === "accepted").length) : null } // '
);

// 3. Remove the entire `{activeTab === "workspace" && (` section.
const workspaceRegex = /\{\/\* ── WORKSPACE TAB ─────────────────────────────────────────────── \*\/\}\s*\{activeTab === "workspace" && \([\s\S]*?(?=\{\/\* ── ASSESSMENTS TAB ───────────────────────────────────────────── \*\/\})/m;
d = d.replace(workspaceRegex, '');

// 4. Update the header title/subtitle slightly
d = d.replace(
  'activeTab === "workspace" ? "Developer Workspace"',
  'activeTab === "workspace" ? ""'
);

// 5. Enhance the Projects block. We will replace the entire `{activeTab === "projects" && (` block up to `WORKSPACE TAB`
const projectsRegex = /\{\/\* ── PROJECTS TAB ─────────────────────────────────────────────── \*\/\}\s*\{activeTab === "projects" && \([\s\S]*?(?=\{\/\* ── WORKSPACE TAB ─────────────────────────────────────────────── \*\/\})/m;

const customProjectsBlock = `
            {/* ── ASSIGNED PROJECTS TAB ─────────────────────────────────────────────── */}
            {activeTab === "projects" && (
              <motion.section key="projects" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                 {hireReqs.filter(r => r.status === "accepted").length === 0 ? (
                    <div className="p-10 border border-white/5 rounded-3xl text-center flex flex-col items-center justify-center">
                       <Briefcase className="w-12 h-12 text-white/10 mb-4" />
                       <h3 className="text-xl font-bold tracking-tight mb-2 text-white/50">No Assigned Projects</h3>
                       <p className="text-sm text-white/30 max-w-md">You haven't been hired for any projects yet. Ensure your profile and skill tests are complete to get match opportunities.</p>
                    </div>
                 ) : (
                    <div className="grid lg:grid-cols-2 gap-6">
                       {hireReqs.filter(r => r.status === "accepted").map(req => (
                          <div key={req.id} className="glass-panel border border-white/10 rounded-2xl p-6 hover:border-emerald-500/30 transition-all flex flex-col">
                             <div className="flex justify-between items-start mb-4">
                                <div>
                                   <h3 className="text-xl font-black text-white">{req.projectName}</h3>
                                   <p className="text-xs text-white/50 font-bold uppercase tracking-widest mt-1">Client: {req.creatorName}</p>
                                </div>
                                <div className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase rounded-lg">Active</div>
                             </div>
                             
                             <div className="mt-auto pt-6 flex gap-3">
                                <Link 
                                  href={\`/employee-dashboard/workspace/\${req.projectId}\`}
                                  className="flex-1 py-3 silver-gradient text-black font-black text-[10px] uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 hover:opacity-90"
                                >
                                  Open Workspace <ChevronRight className="w-3.5 h-3.5"/>
                                </Link>
                             </div>
                          </div>
                       ))}
                    </div>
                 )}
              </motion.section>
            )}

            `;

d = d.replace(projectsRegex, customProjectsBlock);

fs.writeFileSync(p, d);
console.log("Dashboard refactored perfectly.");
