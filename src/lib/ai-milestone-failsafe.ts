type MilestoneTask = {
  id: string;
  title: string;
  description: string;
  type: "frontend" | "backend" | "database" | "auth" | "devops" | "testing";
  estimatedHours: number;
  priority: "high" | "medium" | "low";
  aiPrompt: string;
};

type MilestoneBlock = {
  id: string;
  phase: string;
  title: string;
  description: string;
  estimatedDays: number;
  color: "blue" | "purple" | "emerald" | "orange";
  tasks: MilestoneTask[];
};

/** Deterministic plan when the model fails or returns invalid JSON — matches /api/generate-milestones shape. */
export function buildFailsafeMilestonesPayload(projectName: string, projectIdea: string): {
  milestones: MilestoneBlock[];
} {
  const name = projectName.trim() || "My App";
  const idea = projectIdea.trim().slice(0, 600) || "A modern web application.";
  const mkTask = (
    tid: string,
    title: string,
    desc: string,
    type: MilestoneTask["type"],
    hours: number,
    pri: MilestoneTask["priority"],
  ): MilestoneTask => ({
    id: tid,
    title,
    description: desc,
    type,
    estimatedHours: hours,
    priority: pri,
    aiPrompt: `You are building "${title}" for ${name}. Context: ${idea}\n\nImplement: ${desc}\nDeliver working code with clear file layout and a short verification step.`,
  });

  const milestones: MilestoneBlock[] = [
    {
      id: "m1",
      phase: "Phase 1",
      title: "Foundation & Setup",
      description: `Establish repository, env, and core stack for ${name}.`,
      estimatedDays: 7,
      color: "blue",
      tasks: [
        mkTask("t1", "Project scaffold", "Create app layout, linting, and env config.", "devops", 6, "high"),
        mkTask("t2", "Auth baseline", "Wire sign-in/session or a safe placeholder for production.", "auth", 8, "high"),
        mkTask("t3", "Design system", "Shared UI primitives and theme tokens.", "frontend", 6, "medium"),
      ],
    },
    {
      id: "m2",
      phase: "Phase 2",
      title: "Core Product",
      description: `Ship the main user journeys. Focus: ${idea.slice(0, 200)}`,
      estimatedDays: 14,
      color: "purple",
      tasks: [
        mkTask("t4", "Primary data model", "Define entities and persistence.", "database", 8, "high"),
        mkTask("t5", "Main UI surfaces", "Build key pages and client state.", "frontend", 10, "high"),
        mkTask("t6", "API layer", "Server routes with validation and errors.", "backend", 10, "high"),
      ],
    },
    {
      id: "m3",
      phase: "Phase 3",
      title: "Hardening",
      description: "Quality, monitoring, and edge cases for production readiness.",
      estimatedDays: 10,
      color: "emerald",
      tasks: [
        mkTask("t7", "Automated tests", "Unit and integration coverage on critical paths.", "testing", 8, "medium"),
        mkTask("t8", "Observability", "Structured logs and error reporting.", "devops", 5, "medium"),
        mkTask("t9", "Performance pass", "Bundle and query optimization where needed.", "backend", 6, "low"),
      ],
    },
    {
      id: "m4",
      phase: "Phase 4",
      title: "Launch",
      description: "Release checklist, docs, and handoff.",
      estimatedDays: 7,
      color: "orange",
      tasks: [
        mkTask("t10", "CI/CD", "Build, test, and deploy pipeline.", "devops", 8, "high"),
        mkTask("t11", "Docs & UX polish", "README, onboarding copy, empty states.", "frontend", 5, "medium"),
        mkTask("t12", "Go-live review", "Final smoke tests and rollback plan.", "testing", 4, "high"),
      ],
    },
  ];

  return { milestones };
}
