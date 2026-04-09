import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AuthUser } from "@/lib/auth";
import type { DeveloperProfile } from "@/lib/developerProfile";
import { type ProjectAnalysis, type GeneratedPromptRow, type ProjectBlueprint } from "@/lib/plan-orchestration";
import { type Milestone } from "@/lib/workspace";

export type Role = "employer" | "employee" | null;
export type Purpose = "startup" | "enterprise" | "learning" | "freelance" | null;

export type ProfileImageMeta = { type: "upload" | "avatar"; url: string };

/** Project creator (employer) profile — also persisted under Firestore `users/{uid}.employerProfile` */
export interface EmployerProfile {
  fullName: string;
  companyName: string;
  jobTitle: string;
  phone: string;
  website: string;
  /** Professional / product experience (years or summary) */
  experience: string;
  /** Types of projects or domains the creator cares about */
  projectInterests: string;
  profileImage: ProfileImageMeta | null;
}

/** Roles a user can hold simultaneously */
export type UserRole = "employer" | "developer";

export interface Assumption {
  id: string;
  text: string;
  accepted: boolean;
}

export interface Requirement {
  id: string;
  title: string;
  description: string;
  type: "feature" | "security" | "performance" | "compliance";
}

/** Saved landing page from Stitch (HTML preview + theme metadata) — persists with the project. */
export interface LandingPageSnapshot {
  html: string;
  palette?: string;
  /** Server-derived visual theme: aurora | noir | ember | lattice */
  visualVariant?: string;
  savedAt: number;
}

export interface ProjectState {
  idea: string;
  name: string;
  confidence: number;
  requirements: Requirement[];
  assumptions: Assumption[];
  uncertainties: string[];
  version: string;
  locked: boolean;
  /** Last generated premium landing HTML for this project (restored on return to Architecture). */
  landingPage?: LandingPageSnapshot | null;
  /** True after the combined architecture + AI prompts pipeline succeeded (auto or manual). */
  autoPlanPipelineDone?: boolean;
  /** Persisted architecture analysis results scoped to this project */
  aiAnalysis?: ProjectAnalysis | null;
  /** Persisted generated prompt details scoped to this project */
  aiPrompts?: GeneratedPromptRow[] | null;
  /** Persisted generated blueprint scoped to this project */
  aiBlueprint?: ProjectBlueprint | null;
  /** Persisted milestones scoped to this project (Project Room) */
  milestones?: Milestone[] | null;
  /** Firebase UID of the project owner (creator) */
  creatorUid?: string;
  /** Firebase email of the project owner (creator) for recovery/multi-device sync */
  creatorEmail?: string;
  /** Firebase UID of the hired developer (if any) */
  developerUid?: string;
}

interface BuildCraftStore {
  // Firebase auth — NOT persisted (handled by AuthProvider)
  /** True once Firebase onAuthStateChanged fires for the first time. Guards must wait for this. */
  authReady:      boolean;
  currentUser:    AuthUser | null;
  savedProjectId: string | null;

  // Multi-role system
  userRoles:              UserRole[];
  developerProfile:       DeveloperProfile | null;
  devRegistrationStep:    number;

  // Onboarding (employer flow)
  role:             Role;
  purpose:          Purpose;
  compliance:       { soc2: boolean; gdpr: boolean; hipaa: boolean };
  employerProfile:  EmployerProfile;
  /** True after first Firestore user doc load for project-creator gate (session-scoped). */
  projectCreatorHydrated: boolean;
  /** Mirrors Firestore `projectCreatorProfileCompleted`; false blocks creator hub until setup. */
  projectCreatorProfileCompleted: boolean | null;

  // Project (employer)
  project:       ProjectState | null;
  approvedTools: Record<string, boolean | undefined>;
  promptsViewed: boolean;

  // Actions — auth
  setAuthReady:      () => void;
  setCurrentUser:    (user: AuthUser | null) => void;
  setSavedProjectId: (id: string | null) => void;

  // Actions — multi-role
  addUserRole:             (role: UserRole) => void;
  setDeveloperProfile:     (p: DeveloperProfile | null) => void;
  setDevRegistrationStep:  (step: number) => void;
  patchDeveloperProfile:   (partial: Partial<DeveloperProfile>) => void;

  // Actions — employer onboarding
  setRole:           (role: Role) => void;
  setPurpose:        (purpose: Purpose) => void;
  setCompliance:     (c: { soc2: boolean; gdpr: boolean; hipaa: boolean }) => void;
  setEmployerProfile: (p: EmployerProfile) => void;
  setProjectCreatorHydrated: (v: boolean) => void;
  setProjectCreatorProfileCompleted: (v: boolean | null) => void;
  setProject:        (p: ProjectState) => void;
  /** Merge fields into the current project (e.g. saved landing page HTML). */
  patchProject:      (partial: Partial<ProjectState>) => void;
  toggleAssumption:  (id: string) => void;
  setToolApproval:   (toolId: string, approved: boolean) => void;
  setPromptsViewed:  (v: boolean) => void;
  clearProject:      () => void;
  incrementVersion:  () => void;
  reset:             () => void;
}

const defaultState = {
  authReady:            false,
  currentUser:          null as AuthUser | null,
  savedProjectId:       null as string | null,
  userRoles:            [] as UserRole[],
  developerProfile:     null as DeveloperProfile | null,
  devRegistrationStep:  1,
  role:                 null as Role,
  purpose:              null as Purpose,
  compliance:           { soc2: false, gdpr: false, hipaa: false },
  employerProfile:      {
    fullName: "",
    companyName: "",
    jobTitle: "",
    phone: "",
    website: "",
    experience: "",
    projectInterests: "",
    profileImage: null,
  } satisfies EmployerProfile,
  projectCreatorHydrated: false,
  projectCreatorProfileCompleted: null as boolean | null,
  project:              null as ProjectState | null,
  approvedTools:        {} as Record<string, boolean | undefined>,
  promptsViewed:        false,
};

export const useStore = create<BuildCraftStore>()(
  persist(
    (set) => ({
      ...defaultState,

      setAuthReady:      ()               => set({ authReady: true }),
      setCurrentUser:    (currentUser)    => set({ currentUser }),
      setSavedProjectId: (savedProjectId) => set({ savedProjectId }),

      addUserRole: (role) =>
        set((state) => ({
          userRoles: state.userRoles.includes(role) ? state.userRoles : [...state.userRoles, role],
        })),
      setDeveloperProfile:    (developerProfile)    => set({ developerProfile }),
      setDevRegistrationStep: (devRegistrationStep) => set({ devRegistrationStep }),
      patchDeveloperProfile: (partial) =>
        set((state) => ({
          developerProfile: state.developerProfile
            ? { ...state.developerProfile, ...partial }
            : ({ ...partial } as DeveloperProfile),
        })),

      setRole:           (role)           => set({ role }),
      setPurpose:        (purpose)        => set({ purpose }),
      setCompliance:     (compliance)     => set({ compliance }),
      setEmployerProfile: (employerProfile) => set({ employerProfile }),
      setProjectCreatorHydrated: (projectCreatorHydrated) => set({ projectCreatorHydrated }),
      setProjectCreatorProfileCompleted: (projectCreatorProfileCompleted) =>
        set({ projectCreatorProfileCompleted }),
      setProject:        (project)        => set({ project }),
      patchProject:      (partial) =>
        set((state) => ({
          project: state.project ? { ...state.project, ...partial } : null,
        })),
      toggleAssumption: (id) =>
        set((state) => ({
          project: state.project
            ? {
                ...state.project,
                assumptions: state.project.assumptions.map((a) =>
                  a.id === id ? { ...a, accepted: !a.accepted } : a
                ),
              }
            : null,
        })),
      setToolApproval: (toolId, approved) =>
        set((state) => ({
          approvedTools: { ...state.approvedTools, [toolId]: approved },
        })),
      lockProject: () =>
        set((state) => ({
          project: state.project ? { ...state.project, locked: true } : null,
        })),
      setPromptsViewed: (v) => set({ promptsViewed: v }),
      clearProject: () =>
        set(() => ({
          project: null,
          savedProjectId: null,
          approvedTools: {},
          promptsViewed: false,
        })),
      incrementVersion: () =>
        set((state) => {
          if (!state.project) return state;
          const currentVersion = parseFloat(state.project.version.replace("v", "")) || 1.0;
          const newVersion = `v${(currentVersion + 0.1).toFixed(1)}`;
          return {
            project: { ...state.project, version: newVersion },
          };
        }),
      reset: () => set(defaultState),
    }),
    {
      name: "buildcraft-store",
      storage: createJSONStorage(() => localStorage),
      // Don't persist currentUser — Firebase auth handles it via AuthProvider
      partialize: (state) => ({
        savedProjectId:      state.savedProjectId,
        userRoles:           state.userRoles,
        developerProfile:    state.developerProfile,
        devRegistrationStep: state.devRegistrationStep,
        role:                state.role,
        purpose:             state.purpose,
        compliance:          state.compliance,
        employerProfile:     state.employerProfile,
        project:             state.project,
        approvedTools:       state.approvedTools,
        promptsViewed:       state.promptsViewed,
        /** Survives refresh so returning creators are not re-prompted before Firestore responds */
        projectCreatorProfileCompleted: state.projectCreatorProfileCompleted,
      }),
    }
  )
);

/** Derive a project from free-text idea */
export function analyzeIdea(idea: string): ProjectState {
  const lower = idea.toLowerCase();
  const isFinance = /bank|financ|payment|wallet|invest|crypto|money|loan/.test(lower);
  const isHealth = /health|medical|fitness|hospital|patient|doctor|workout|diet/.test(lower);
  const isSocial = /social|chat|communit|friend|message|post|feed|network/.test(lower);
  const isEdu = /learn|educati|course|student|teach|quiz|school|tutor/.test(lower);
  const isEcom = /shop|ecommerce|store|product|cart|order|delivery|market/.test(lower);

  const words = idea.trim().split(/\s+/).length;
  const confidence = Math.min(95, 40 + words * 3 + (isFinance || isHealth || isSocial || isEdu || isEcom ? 15 : 0));

  let requirements: Requirement[] = [];
  let assumptions: Assumption[] = [];
  let uncertainties: string[] = [];
  let name = "New Project";

  if (isFinance) {
    name = "Finance Platform";
    requirements = [
      { id: "r1", title: "Secure Transactions", description: "End-to-end encrypted payment flows with PCI-DSS compliance and fraud detection.", type: "security" },
      { id: "r2", title: "Real-Time Balance Updates", description: "WebSocket-driven balance and transaction feeds so users see changes instantly.", type: "feature" },
      { id: "r3", title: "Regulatory Compliance", description: "Audit-ready logs, KYC verification, and SOC2 data handling for financial data.", type: "compliance" },
      { id: "r4", title: "High Availability", description: "99.99% uptime requirement with multi-region failover and zero-downtime deployments.", type: "performance" },
    ];
    assumptions = [
      { id: "a1", text: "We assume you need PCI-DSS compliance for handling card payments.", accepted: false },
      { id: "a2", text: "We assume the target market is global, requiring multi-currency support.", accepted: false },
      { id: "a3", text: "We assume a 6–12 month timeline for a production-ready finance app.", accepted: false },
    ];
    uncertainties = ["KYC provider preference (Stripe Identity vs. Jumio)", "Exact jurisdictions requiring separate compliance checks"];
  } else if (isHealth) {
    name = "Health Platform";
    requirements = [
      { id: "r1", title: "HIPAA-Compliant Data Storage", description: "All patient data encrypted at rest and in transit, with access audit logs.", type: "compliance" },
      { id: "r2", title: "Wearable Device Integration", description: "HealthKit/Google Fit API bridge to pull real-time biometric data.", type: "feature" },
      { id: "r3", title: "Secure Authentication", description: "MFA required for all users; biometric login for mobile apps.", type: "security" },
      { id: "r4", title: "Low-Latency Data Sync", description: "Near real-time sync for vitals and activity data across devices.", type: "performance" },
    ];
    assumptions = [
      { id: "a1", text: "We assume HIPAA compliance is required (US health data rules).", accepted: false },
      { id: "a2", text: "We assume this will have both mobile and web interfaces.", accepted: false },
      { id: "a3", text: "We assume your target users are general consumers, not medical professionals.", accepted: false },
    ];
    uncertainties = ["Whether you need a telemedicine video layer (adds significant scope)", "Medical device FDA clearance requirements if readings are used for diagnosis"];
  } else if (isSocial) {
    name = "Social Platform";
    requirements = [
      { id: "r1", title: "Real-Time Messaging", description: "WebSocket-powered live chat with read receipts and typing indicators.", type: "feature" },
      { id: "r2", title: "Content Feed Algorithm", description: "Personalized feed with engagement ranking and content moderation.", type: "feature" },
      { id: "r3", title: "Content Safety & Moderation", description: "AI-assisted moderation with human review queue for flagged content.", type: "security" },
      { id: "r4", title: "Horizontal Scaling", description: "Auto-scaling to handle viral traffic spikes without downtime.", type: "performance" },
    ];
    assumptions = [
      { id: "a1", text: "We assume you need to handle at least 10,000 concurrent users at launch.", accepted: false },
      { id: "a2", text: "We assume GDPR compliance is needed (European users).", accepted: false },
      { id: "a3", text: "We assume a 4–8 month timeline for core social features.", accepted: false },
    ];
    uncertainties = ["Whether end-to-end encryption is needed (significantly increases complexity)", "Monetization model (ads vs. subscription) changes the data architecture"];
  } else if (isEdu) {
    name = "EdTech Platform";
    requirements = [
      { id: "r1", title: "Video Content Delivery", description: "Adaptive bitrate streaming via CDN for course videos worldwide.", type: "feature" },
      { id: "r2", title: "Interactive Assessments", description: "Timed quizzes, assignments, and automated grading with plagiarism checks.", type: "feature" },
      { id: "r3", title: "Progress Tracking", description: "Learner analytics dashboard showing completion, scores, and time-on-task.", type: "feature" },
      { id: "r4", title: "FERPA Compliance", description: "Student data privacy protections following FERPA guidelines.", type: "compliance" },
    ];
    assumptions = [
      { id: "a1", text: "We assume you need a multi-role system: admins, instructors, and students.", accepted: false },
      { id: "a2", text: "We assume video is a primary content format requiring storage & streaming.", accepted: false },
      { id: "a3", text: "We assume 3–6 months is your target build timeline.", accepted: false },
    ];
    uncertainties = ["Whether live class sessions (video conferencing) are in scope", "Certification/credential issuance (blockchain badges add complexity)"];
  } else if (isEcom) {
    name = "E-Commerce Platform";
    requirements = [
      { id: "r1", title: "Product Catalog & Search", description: "Full-text + vector search across thousands of SKUs with faceted filters.", type: "feature" },
      { id: "r2", title: "Checkout & Payment", description: "Stripe-integrated secure checkout with 3D Secure and subscription support.", type: "feature" },
      { id: "r3", title: "Inventory Management", description: "Real-time stock levels with low-stock alerts and supplier integration.", type: "feature" },
      { id: "r4", title: "CDN-Delivered Assets", description: "Product images and assets served from global CDN for fast load times.", type: "performance" },
    ];
    assumptions = [
      { id: "a1", text: "We assume you are starting with fewer than 10,000 products.", accepted: false },
      { id: "a2", text: "We assume you need both web and mobile storefronts.", accepted: false },
      { id: "a3", text: "We assume PCI-DSS compliance via Stripe (not self-hosted payment processing).", accepted: false },
    ];
    uncertainties = ["Multi-vendor marketplace vs. single-seller changes data model significantly", "International shipping and tax calculation complexity"];
  } else {
    name = "Custom App";
    requirements = [
      { id: "r1", title: "User Authentication", description: "Secure sign-in with email, OAuth providers, and MFA support.", type: "security" },
      { id: "r2", title: "Real-Time Features", description: "Live data updates via WebSockets so users see changes without refreshing.", type: "feature" },
      { id: "r3", title: "Scalable API Layer", description: "RESTful + GraphQL API with rate limiting, caching, and versioning.", type: "performance" },
      { id: "r4", title: "Data Privacy Controls", description: "GDPR-ready data exports, deletion requests, and consent management.", type: "compliance" },
    ];
    assumptions = [
      { id: "a1", text: "We assume you need a professional-grade setup that scales to thousands of users.", accepted: false },
      { id: "a2", text: "We assume this needs to be built within 3–6 months.", accepted: false },
      { id: "a3", text: "We assume your users are global, requiring fast international servers.", accepted: false },
    ];
    uncertainties = ["We are unsure if you need special payment compliance forms", "Mobile app requirement (adds 40–60% to scope and timeline)"];
  }

  return {
    idea,
    name,
    confidence,
    requirements,
    assumptions,
    uncertainties,
    version: "v1.0",
    locked: false,
  };
}
