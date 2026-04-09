"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  History, Layers, CheckCircle2, ShieldAlert, Cpu, Database, Cloud, FileCode,
  ThumbsUp, ThumbsDown, ArrowRight, Lock, Eye, Copy, Check, Terminal, FolderOpen,
  GitBranch, AlertTriangle, Info, Code2, Sparkles, LayoutDashboard, Trash2,
  LogIn, Home, User, Bell, Loader2, RefreshCw, ChevronDown, ChevronUp, Users,
  ImageIcon, X, ZoomIn, Wand2, ExternalLink, Monitor, Settings, Link as LinkIcon, KeyRound,
  BookOpen, Zap, Globe, Server, ShieldCheck, Package, CreditCard, Mail, Wifi,
  BrainCircuit, LayoutGrid, Activity
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/store/useStore";
import { updateProject, getUserProjects, deleteProject, restoreProject, firestoreTimestampSeconds, type SavedProject } from "@/lib/firestore";
import { logAction } from "@/lib/auditLog";
import { parseApiJson } from "@/lib/parse-api-json";
import { getUserFacingError } from "@/lib/user-facing-error";
import Logo from "@/components/Logo";
import { DynamicUIRenderer } from "@/components/ui-json/DynamicUIRenderer";
import type { UIScreenJson } from "@/lib/ui-json-schema";
import { isDeveloperRegistrationComplete, shouldDefaultToDeveloperDashboard } from "@/lib/developerProfile";
import { Timestamp } from "firebase/firestore";
import type { GeneratedPromptRow, ProjectBlueprint as StoreProjectBlueprint } from "@/lib/plan-orchestration";
import { useAutoSave } from "@/hooks/useAutoSave";
import { CreatorFlowBreadcrumb } from "@/components/FlowNavigation";
import { parseToDate, formatDateBadge } from "@/lib/dateDisplay";

type Tab = "architecture" | "tools" | "risks" | "prompts" | "code" | "config";

/** Shown while AI analysis runs (two-phase API + rotating status copy). */
const ANALYSIS_PHASE_LABELS = [
  "Reading your project description…",
  "Mapping architecture layers & system boundaries…",
  "Running deep-dive architecture pass (phase 1)…",
  "Selecting tools, integrations & compliance posture…",
  "Analyzing security & operational risks (phase 2)…",
  "Synthesizing recommendations…",
] as const;

/** Extra status labels when both analysis + prompts requests are in flight (two-step orchestration). */
const FULL_PLAN_EXTRA_LABELS = [
  "Drafting blueprint: pages, features, data models…",
  "Writing six phase-by-phase build prompts…",
  "Finalizing your technical plan…",
] as const;

const PROMPT_PHASE_COLORS: Record<string, string> = {
  indigo: "border-indigo-500/30 bg-indigo-500/5",
  blue: "border-blue-500/30 bg-blue-500/5",
  emerald: "border-emerald-500/30 bg-emerald-500/5",
  yellow: "border-yellow-500/30 bg-yellow-500/5",
  pink: "border-pink-500/30 bg-pink-500/5",
  orange: "border-orange-500/30 bg-orange-500/5",
};

const PROMPT_PHASE_BADGE: Record<string, string> = {
  indigo: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  yellow: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  pink: "text-pink-400 bg-pink-500/10 border-pink-500/20",
  orange: "text-orange-400 bg-orange-500/10 border-orange-500/20",
};

interface ComponentTemplate {
  id: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  color: string;
  componentDesc: string;
}

const COMPONENT_TEMPLATES: ComponentTemplate[] = [
  {
    id: "landing",
    label: "Landing Page Hero",
    desc: "Hero section with headline, CTA buttons, and feature highlights",
    icon: <Home className="w-5 h-5" />,
    color: "blue",
    componentDesc: "A stunning hero section with a bold headline, subheading, two CTA buttons (primary silver and secondary glass), animated background gradient, feature badge pill, and 3 feature cards below. Include a sticky navigation bar at the top with logo and sign-in button.",
  },
  {
    id: "dashboard",
    label: "User Dashboard",
    desc: "Full dashboard layout with sidebar, stats, and content area",
    icon: <LayoutDashboard className="w-5 h-5" />,
    color: "purple",
    componentDesc: "A full-width dashboard with a collapsible left sidebar (nav links, user avatar, role badge), a top stats row with 4 KPI cards (animated numbers), a data table below, and a right-side activity feed. Dark glass-morphism style.",
  },
  {
    id: "auth",
    label: "Auth / Sign In Screen",
    desc: "Login and sign-up flow with social auth buttons",
    icon: <LogIn className="w-5 h-5" />,
    color: "emerald",
    componentDesc: "A centered authentication card with logo, GitHub/Google/Email sign-in buttons, an email+password form with validation states, a role selector (two cards: Employer / Developer), and a 3-step progress bar. Include smooth AnimatePresence transitions between steps.",
  },
  {
    id: "profile",
    label: "User Profile Card",
    desc: "Profile with skills, stats, verification badges, and portfolio",
    icon: <User className="w-5 h-5" />,
    color: "yellow",
    componentDesc: "A detailed user profile card with avatar, name, role badge, verification tier indicator (Tier 1/2/3), skill tags with colored badges, portfolio project list, performance stats row (projects, rating, on-time %), and an 'Invite to Project' CTA button.",
  },
  {
    id: "notifications",
    label: "Notifications Panel",
    desc: "Real-time notification feed with read/unread states",
    icon: <Bell className="w-5 h-5" />,
    color: "orange",
    componentDesc: "A slide-in notification panel with a bell icon badge, filter tabs (All / Unread / Important), a list of notification cards each with avatar, action description, timestamp, colored left border by type (info/success/warning/error), and mark-all-read button.",
  },
  {
    id: "project-card",
    label: "Project Card Grid",
    desc: "Grid of project cards with match scores and tool badges",
    icon: <Layers className="w-5 h-5" />,
    color: "pink",
    componentDesc: "A responsive 2-column grid of project cards, each with project name, short description, match percentage badge (color-coded), employer trust score with stars, required tool tags, a risk warning banner (if applicable), team fit progress bar, and two action buttons.",
  },
];

const colorMap: Record<string, string> = {
  blue:   "text-blue-400 bg-blue-500/10 border-blue-500/20",
  purple: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  emerald:"text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  yellow: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  orange: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  pink:   "text-pink-400 bg-pink-500/10 border-pink-500/20",
};

const TOOLS = [
  {
    id: "vercel",
    name: "Vercel + Next.js",
    category: "Hosting",
    compliance: "SOC2 Verified",
    complianceColor: "green",
    icon: <span className="text-black font-bold text-xs">▲</span>,
    iconBg: "bg-white",
    why: "Based on 127+ similar projects, Vercel is the best choice for Next.js apps — global edge network, zero-config deployments, and instant rollbacks.",
    warning: "If your site exceeds ~1M monthly page views, Vercel's pricing scales quickly. Plan for a migration path.",
    skillGap: null,
    prompt: `# Vercel + Next.js Setup Prompt (Architecture v1.0)\n\nYou are building a production-ready Next.js application deployed on Vercel.\n\n**Scope boundary:** This prompt assumes Architecture v1.0 as locked on {{date}}.\n\n## Instructions\n1. Initialize a Next.js 14+ project with App Router: \`npx create-next-app@latest --typescript\`\n2. Install Tailwind CSS and configure \`tailwind.config.ts\`\n3. Set up environment variables in \`.env.local\` and Vercel dashboard\n4. Configure \`next.config.ts\` for image optimization and security headers\n5. Deploy to Vercel: \`vercel --prod\`\n\n## Security Headers (add to next.config.ts)\n\`\`\`ts\nheaders: [{ source: "/(.*)", headers: [\n  { key: "X-Frame-Options", value: "DENY" },\n  { key: "X-Content-Type-Options", value: "nosniff" },\n  { key: "Strict-Transport-Security", value: "max-age=31536000" }\n]}]\n\`\`\`\n\n**Validated with:** Next.js 16.x, Vercel CLI 37.x`,
  },
  {
    id: "supabase",
    name: "Supabase",
    category: "Database + Auth",
    compliance: "GDPR Ready",
    complianceColor: "blue",
    icon: <Database className="w-5 h-5 text-white" />,
    iconBg: "bg-blue-600",
    why: "Supabase provides PostgreSQL with Row-Level Security (RLS), ensuring User A can never see User B's data — enforced at the database level, not just the API.",
    warning: null,
    skillGap: null,
    prompt: `# Supabase Setup Prompt (Architecture v1.0)\n\nYou are configuring Supabase as the database and auth layer.\n\n**Scope boundary:** This prompt assumes Architecture v1.0 as locked on {{date}}.\n\n## Instructions\n1. Create a new Supabase project at supabase.com\n2. Enable Row-Level Security on all tables: \`ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;\`\n3. Create auth policies:\n\`\`\`sql\nCREATE POLICY "Users can only see their own data"\nON profiles FOR ALL\nUSING (auth.uid() = user_id);\n\`\`\`\n4. Install the client: \`npm install @supabase/supabase-js\`\n5. Initialize in your app:\n\`\`\`ts\nimport { createClient } from "@supabase/supabase-js";\nconst supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);\n\`\`\`\n\n**Validated with:** Supabase JS v2.x`,
  },
  {
    id: "pinecone",
    name: "Pinecone",
    category: "Vector DB",
    compliance: null,
    complianceColor: null,
    icon: <span className="text-white font-bold text-sm">🌲</span>,
    iconBg: "bg-emerald-600",
    why: "Pinecone is the most reliable managed vector database for AI-powered search. No infrastructure to manage, 99.99% uptime SLA, and sub-10ms query latency.",
    warning: "Your team will need Pinecone experience. The developers we match will be vetted for this skill.",
    skillGap: "Team Skill Warning: Your matched developers should be verified for vector DB experience.",
    prompt: `# Pinecone Setup Prompt (Architecture v1.0)\n\nYou are integrating Pinecone as the vector database for AI search features.\n\n**Scope boundary:** This prompt assumes Architecture v1.0 as locked on {{date}}.\n\n## Instructions\n1. Create a Pinecone account and get your API key\n2. Install the SDK: \`npm install @pinecone-database/pinecone\`\n3. Initialize and create an index:\n\`\`\`ts\nimport { Pinecone } from "@pinecone-database/pinecone";\nconst pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });\nawait pc.createIndex({ name: "my-index", dimension: 1536, metric: "cosine" });\n\`\`\`\n4. Upsert vectors:\n\`\`\`ts\nconst index = pc.index("my-index");\nawait index.upsert([{ id: "doc-1", values: embeddingVector, metadata: { text: "..." } }]);\n\`\`\`\n5. Query:\n\`\`\`ts\nconst results = await index.query({ vector: queryEmbedding, topK: 5, includeMetadata: true });\n\`\`\`\n\n**Validated with:** Pinecone SDK v3.x + your chosen embedding model`,
  },
];

// ─── Per-service configuration guide ───────────────────────────────────────
const CONFIG_SERVICES = [
  {
    id: "vercel",
    name: "Vercel",
    category: "Hosting & Deployment",
    tagline: "Deploy your Next.js app to a global edge network in seconds.",
    color: "text-white bg-white/10 border-white/20",
    dot: "bg-white",
    getKeyUrl: "https://vercel.com/account/tokens",
    docsUrl: "https://vercel.com/docs",
    dashboardUrl: "https://vercel.com/dashboard",
    envVar: "VERCEL_TOKEN",
    steps: [
      "Go to vercel.com → Sign up / Log in",
      "Install Vercel CLI: npm install -g vercel",
      "Run vercel in your project folder and follow prompts",
      "For CI/CD: create a token at vercel.com/account/tokens",
      "Add VERCEL_TOKEN to your CI environment",
    ],
    snippet: `# Install and deploy
npm install -g vercel
vercel login
vercel --prod`,
    envBlock: `VERCEL_TOKEN=your_token_here`,
  },
  {
    id: "supabase",
    name: "Supabase",
    category: "Database + Auth",
    tagline: "PostgreSQL database with built-in auth and real-time subscriptions.",
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    dot: "bg-emerald-500",
    getKeyUrl: "https://supabase.com/dashboard/project/_/settings/api",
    docsUrl: "https://supabase.com/docs",
    dashboardUrl: "https://supabase.com/dashboard",
    envVar: "NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY",
    steps: [
      "Go to supabase.com → New Project → set name and password",
      "Settings → API → copy Project URL and anon/public key",
      "Install SDK: npm install @supabase/supabase-js",
      "Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local",
      "Enable Row-Level Security on all tables in the Table Editor",
    ],
    snippet: `npm install @supabase/supabase-js

// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)`,
    envBlock: `NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key`,
  },
  {
    id: "pinecone",
    name: "Pinecone",
    category: "Vector Database",
    tagline: "Managed vector DB for AI-powered semantic search.",
    color: "text-green-400 bg-green-500/10 border-green-500/20",
    dot: "bg-green-500",
    getKeyUrl: "https://app.pinecone.io/organizations/-/projects/-/keys",
    docsUrl: "https://docs.pinecone.io",
    dashboardUrl: "https://app.pinecone.io",
    envVar: "PINECONE_API_KEY",
    steps: [
      "Go to app.pinecone.io → Create account",
      "Create a new Project, then click API Keys → Create API Key",
      "Note your API key and environment (e.g. us-east-1)",
      "Install: npm install @pinecone-database/pinecone",
      "Add PINECONE_API_KEY to .env.local (server-side only, no NEXT_PUBLIC prefix)",
    ],
    snippet: `npm install @pinecone-database/pinecone

// lib/pinecone.ts
import { Pinecone } from '@pinecone-database/pinecone'
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! })
export const index = pc.index('your-index-name')`,
    envBlock: `PINECONE_API_KEY=your_api_key_here
PINECONE_INDEX=your-index-name`,
  },
  {
    id: "llm-api",
    name: "BuildCraft AI (orchestrated LLM)",
    category: "AI / LLM",
    tagline: "Primary NVIDIA NIM endpoint plus optional fallback model, fast tier, and secondary OpenAI-compatible API.",
    color: "text-teal-400 bg-teal-500/10 border-teal-500/20",
    dot: "bg-teal-500",
    getKeyUrl: "https://build.nvidia.com",
    docsUrl: "https://docs.nvidia.com/nim/",
    dashboardUrl: "https://build.nvidia.com",
    envVar: "NVIDIA_API_KEY (+ optional AI_MODEL_ID, AI_FALLBACK_MODEL_ID, AI_FAST_MODEL_ID, AI_SECONDARY_*)",
    steps: [
      "Set NVIDIA_API_KEY in .env.local (server-only) — required for all AI routes",
      "Optional: AI_MODEL_ID for your default instruct model; AI_FAST_MODEL_ID for matching & validation (lower latency)",
      "Optional: AI_FALLBACK_MODEL_ID on the same endpoint when the primary model errors or returns empty output",
      "Optional: AI_SECONDARY_API_URL + AI_SECONDARY_API_KEY (+ AI_SECONDARY_MODEL_ID) for a second provider or region",
      "Tune AI_UPSTREAM_TIMEOUT_MS if you hit gateway timeouts on long generations",
    ],
    snippet: `// Server routes use src/lib/ai-orchestrator.ts — no per-route provider branching.
// Keys and model IDs are read from process.env (never NEXT_PUBLIC_*).
await orchestrateChatCompletion("structured_json", {
  messages: [{ role: "user", content: "..." }],
  temperature: 0.35,
  max_tokens: 1200,
});`,
    envBlock: `NVIDIA_API_KEY=your_key_here
# Optional orchestration tuning:
# AI_MODEL_ID=meta/llama-3.3-70b-instruct
# AI_FAST_MODEL_ID=meta/llama-3.1-8b-instruct
# AI_FALLBACK_MODEL_ID=meta/llama-3.1-70b-instruct
# AI_SECONDARY_API_URL=https://api.openai.com/v1
# AI_SECONDARY_API_KEY=sk-...
# AI_SECONDARY_MODEL_ID=gpt-4o-mini`,
  },
  {
    id: "stripe",
    name: "Stripe",
    category: "Payments",
    tagline: "Secure payment processing and subscription billing.",
    color: "text-violet-400 bg-violet-500/10 border-violet-500/20",
    dot: "bg-violet-500",
    getKeyUrl: "https://dashboard.stripe.com/apikeys",
    docsUrl: "https://stripe.com/docs",
    dashboardUrl: "https://dashboard.stripe.com",
    envVar: "STRIPE_SECRET_KEY + NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    steps: [
      "Go to stripe.com → Create account or log in",
      "Developers → API Keys → copy Publishable key (public) and Secret key",
      "For webhooks: Developers → Webhooks → Add endpoint → copy Signing secret",
      "Install: npm install stripe @stripe/stripe-js",
      "Add keys to .env.local — publishable key gets NEXT_PUBLIC_ prefix, others do not",
    ],
    snippet: `npm install stripe @stripe/stripe-js

// lib/stripe.ts (server)
import Stripe from 'stripe'
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia'
})`,
    envBlock: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...`,
  },
  {
    id: "brevo",
    name: "Brevo",
    category: "Email",
    tagline:
      "Transactional email: Brevo API → Brevo SMTP → Resend — hire invites & notifications.",
    color: "text-orange-400 bg-orange-500/10 border-orange-500/20",
    dot: "bg-orange-500",
    getKeyUrl: "https://app.brevo.com/settings/keys/api",
    docsUrl: "https://developers.brevo.com/reference/send-transac-email",
    dashboardUrl: "https://app.brevo.com",
    envVar: "BREVO_API_KEY + BREVO_FROM (or SMTP vars), or RESEND_API_KEY + RESEND_FROM",
    steps: [
      "Go to brevo.com → create account",
      "SMTP & API → API Keys & MCP → create key (xkeysib-…) — preferred when set",
      "Senders & domains → verify your sender or domain",
      "Set BREVO_API_KEY + BREVO_FROM in Vercel / .env.local",
      "Optional: SMTP tab → xsmtpsib key + BREVO_SMTP_LOGIN + BREVO_SMTP_KEY + BREVO_FROM",
      "Alternative: Resend (resend.com) — RESEND_API_KEY + RESEND_FROM if Brevo is unset",
    ],
    snippet: `// src/lib/email.ts — Brevo API → Brevo SMTP → Resend

BREVO_API_KEY=xkeysib-...
BREVO_FROM="BuildCraft AI <noreply@yourdomain.com>"

# Or SMTP only (omit BREVO_API_KEY):
BREVO_SMTP_LOGIN=you@example.com
BREVO_SMTP_KEY=xsmtpsib-...

# Or Resend only (omit Brevo):
RESEND_API_KEY=re_...
RESEND_FROM="BuildCraft AI <onboarding@resend.dev>"`,
    envBlock: `BREVO_API_KEY=xkeysib_...
BREVO_FROM=BuildCraft AI <noreply@yourdomain.com>

# Optional SMTP fallback:
BREVO_SMTP_LOGIN=your_smtp_login
BREVO_SMTP_KEY=xsmtpsib_...

# Or Resend:
RESEND_API_KEY=re_...
RESEND_FROM=BuildCraft AI <onboarding@resend.dev>`,
  },
  {
    id: "clerk",
    name: "Clerk",
    category: "Authentication",
    tagline: "Drop-in auth UI with social logins, MFA, and user management.",
    color: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    dot: "bg-purple-500",
    getKeyUrl: "https://dashboard.clerk.com",
    docsUrl: "https://clerk.com/docs/nextjs",
    dashboardUrl: "https://dashboard.clerk.com",
    envVar: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY",
    steps: [
      "Go to clerk.com → Create application",
      "Choose your sign-in methods (Google, GitHub, Email, etc.)",
      "API Keys → copy Publishable Key and Secret Key",
      "Install: npm install @clerk/nextjs",
      "Wrap your app in <ClerkProvider> in layout.tsx and add middleware",
    ],
    snippet: `npm install @clerk/nextjs

// middleware.ts
import { clerkMiddleware } from '@clerk/nextjs/server'
export default clerkMiddleware()
export const config = { matcher: ['/((?!_next|.*\\..*).*)'] }`,
    envBlock: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`,
  },
  {
    id: "cloudinary",
    name: "Cloudinary",
    category: "Media Storage",
    tagline: "Image and video upload, transformation, and CDN delivery.",
    color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    dot: "bg-blue-400",
    getKeyUrl: "https://console.cloudinary.com/settings/api-keys",
    docsUrl: "https://cloudinary.com/documentation",
    dashboardUrl: "https://console.cloudinary.com",
    envVar: "CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET",
    steps: [
      "Go to cloudinary.com → Sign up for free",
      "Dashboard → Copy Cloud Name, API Key, and API Secret",
      "Install: npm install cloudinary next-cloudinary",
      "Add credentials to .env.local",
      "Use CldUploadWidget or CldImage components in your Next.js app",
    ],
    snippet: `npm install next-cloudinary

// Use in your component
import { CldUploadWidget, CldImage } from 'next-cloudinary'

<CldUploadWidget uploadPreset="your_preset">
  {({ open }) => <button onClick={() => open()}>Upload</button>}
</CldUploadWidget>`,
    envBlock: `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret`,
  },
];

// ─── Full project AI prompts generator ──────────────────────────────────────
function buildProjectPrompts(name: string, idea: string, toolNames: string[]) {
  const stack = toolNames.join(", ") || "Next.js, Supabase, Tailwind CSS";
  const date  = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return [
    {
      phase: "Phase 1",
      title: "Full Project Bootstrap",
      icon: "🚀",
      color: "indigo",
      target: "Cursor / AI assistant",
      desc: "Complete project initialization from zero — folder structure, dependencies, environment, and config.",
      prompt: `You are an expert Next.js full-stack engineer. Build the complete project scaffold for "${name}".

PROJECT: ${name}
DESCRIPTION: ${idea || `A modern web application called ${name}`}
TECH STACK: ${stack}
DATE: ${date}

## Task: Initialize the complete project structure

1. Create a Next.js 14+ App Router project with TypeScript and Tailwind CSS.
2. Install all required dependencies for: ${stack}
3. Set up the following folder structure:
   src/
     app/            — Next.js pages and API routes
     components/     — Reusable UI components
     lib/            — Utility functions and service clients
     hooks/          — Custom React hooks
     types/          — TypeScript type definitions
     store/          — Global state (Zustand)

4. Create src/lib/config.ts with all environment variable exports and runtime validation.
5. Create src/types/index.ts with all core data model interfaces for ${name}.
6. Set up tailwind.config.ts with a custom color palette:
   - Primary: indigo/violet
   - Background: #09090b (dark)
   - Glass: rgba(255,255,255,0.05)
7. Configure next.config.ts with security headers, image domains, and redirects.
8. Create a .env.local.example listing every required environment variable with descriptions.
9. Write a src/lib/utils.ts with: cn() for class merging, formatDate(), formatCurrency(), truncate().

Return the complete file contents for each file, ready to copy-paste. Use only production-quality patterns.`,
    },
    {
      phase: "Phase 2",
      title: "Database Schema & API Design",
      icon: "🗄️",
      color: "blue",
      target: "Cursor / Supabase",
      desc: "Complete database schema, migrations, API routes, and data access layer for the full feature set.",
      prompt: `You are a senior database architect. Design the complete database schema for "${name}".

PROJECT: ${name}
DESCRIPTION: ${idea || `A web application called ${name}`}
DATABASE: PostgreSQL via Supabase
DATE: ${date}

## Task: Create the complete data model

1. Write SQL CREATE TABLE statements for ALL entities in the system.
   - Every table needs: id UUID PRIMARY KEY DEFAULT gen_random_uuid(), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
   - Add appropriate foreign keys with ON DELETE CASCADE/RESTRICT
   - Add indexes on frequently queried columns

2. Enable Row-Level Security (RLS) on every table:
   CREATE POLICY "users_own_data" ON table_name FOR ALL USING (auth.uid() = user_id);

3. Create a database trigger to auto-update updated_at:
   CREATE TRIGGER set_updated_at BEFORE UPDATE ON table_name
   FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

4. Write a Next.js API route file at app/api/[entity]/route.ts for each main entity:
   - GET /api/[entity]         — list with pagination, filtering, sorting
   - POST /api/[entity]        — create with Zod validation
   - GET /api/[entity]/[id]    — get single record
   - PATCH /api/[entity]/[id]  — partial update
   - DELETE /api/[entity]/[id] — soft delete (set deleted_at)

5. Write a Zod schema file at src/lib/validations/[entity].ts for request validation.

6. Write a data access layer at src/lib/db/[entity].ts with typed query functions.

Make schemas match the full feature requirements of "${name}". Include comments explaining every design decision.`,
    },
    {
      phase: "Phase 3",
      title: "Authentication & Authorization",
      icon: "🔐",
      color: "emerald",
      target: "Cursor / AI assistant",
      desc: "Complete auth flow — sign-up, sign-in, session management, protected routes, and role-based access.",
      prompt: `You are a security-focused full-stack engineer. Implement complete authentication for "${name}".

PROJECT: ${name}
AUTH PROVIDER: ${toolNames.find(t => t.toLowerCase().includes("supabase") || t.toLowerCase().includes("clerk")) ?? "Supabase Auth"}
DATE: ${date}

## Task: Build the full auth system

1. Sign-up flow:
   - Email + password registration with email confirmation
   - OAuth providers: Google, GitHub (configure in Supabase dashboard)
   - Post-registration: create a profile record in the users/profiles table
   - Welcome email via transactional email service

2. Sign-in flow:
   - Email/password with "remember me" option
   - OAuth (redirect-based)
   - Rate limiting: max 5 failed attempts per 15 minutes per IP

3. Session management:
   - Server-side session validation in middleware.ts
   - Refresh token rotation every 1 hour
   - Secure httpOnly cookies (not localStorage)

4. Protected routes:
   - src/middleware.ts — redirect unauthenticated users to /sign-in
   - Return to the original URL after login (callbackUrl pattern)

5. Role-based access (RBAC):
   - Roles: ADMIN, USER (add more if needed for ${name})
   - Store role in user_metadata or a separate profiles table
   - Create a requireRole(role) server utility for API route protection

6. Create these pages with complete form logic and error handling:
   - app/(auth)/sign-in/page.tsx
   - app/(auth)/sign-up/page.tsx
   - app/(auth)/forgot-password/page.tsx
   - app/(auth)/reset-password/page.tsx
   - components/auth/AuthGuard.tsx — wrapper for protected content

Write complete, production-ready TypeScript code with full error handling.`,
    },
    {
      phase: "Phase 4",
      title: "Core Feature Implementation",
      icon: "⚡",
      color: "yellow",
      target: "Cursor / AI assistant",
      desc: "Build all primary features of the application end-to-end — UI, state, API calls, and real-time updates.",
      prompt: `You are a senior React engineer. Implement the core features of "${name}" end-to-end.

PROJECT: ${name}
DESCRIPTION: ${idea || `A web application called ${name}`}
STACK: ${stack}
DATE: ${date}

## Task: Build all primary features

Analyse the project description and implement EVERY feature mentioned. For each feature:

1. UI LAYER (React components):
   - Create a feature folder: src/components/[feature-name]/
   - Build all required components using Tailwind CSS dark theme
   - Add loading states (skeleton UI, not spinners everywhere)
   - Add empty states with clear call-to-action
   - Add error states with retry buttons

2. STATE LAYER (Zustand):
   - Create src/store/[feature]Store.ts with typed state + actions
   - Optimistic updates: update local state before API confirms
   - Rollback on error: revert optimistic update if API fails

3. DATA FETCHING:
   - Use React Query (TanStack Query) for server state
   - Implement: useQuery for reads, useMutation for writes
   - Add proper cache invalidation after mutations
   - Add pagination with cursor-based pagination (not page numbers)

4. REAL-TIME (if applicable):
   - Subscribe to Supabase Realtime channels for live updates
   - Handle presence (online users) if relevant to ${name}

5. KEY PAGES to build:
   - Main dashboard/home page (authenticated)
   - Core feature pages specific to ${name}
   - Settings page at /settings
   - Account/profile page at /account

Write every component with TypeScript generics, proper prop interfaces, and comprehensive JSDoc comments. Focus on accessibility: add ARIA labels, keyboard navigation, and focus management.`,
    },
    {
      phase: "Phase 5",
      title: "UI/UX Polish & Responsive Design",
      icon: "🎨",
      color: "pink",
      target: "Cursor / design tool",
      desc: "Complete visual design pass — animations, responsive breakpoints, dark mode, accessibility, and performance.",
      prompt: `You are a world-class UI engineer. Polish the complete UI for "${name}".

PROJECT: ${name}
DESIGN SYSTEM: Dark theme, indigo/violet accents, glass morphism panels
DATE: ${date}

## Task: Full UI/UX polish pass

1. DESIGN TOKENS — add to tailwind.config.ts:
   - Colors: bg-app (#09090b), surface (white/5), border (white/8), accent (indigo-500)
   - Typography: display (5xl/black), heading (2xl/bold), body (sm/normal), caption (xs/light)
   - Shadows: card (0 4px 24px rgba(0,0,0,0.4)), glow (0 0 40px rgba(99,102,241,0.2))

2. COMPONENT LIBRARY — create these shared components:
   - components/ui/Button.tsx — variants: primary, outline, ghost, destructive; sizes: sm, md, lg
   - components/ui/Card.tsx — glass morphism card with optional hover/click states
   - components/ui/Input.tsx — dark styled input with label, error, hint states
   - components/ui/Badge.tsx — status badges with semantic colors
   - components/ui/Modal.tsx — accessible dialog with AnimatePresence
   - components/ui/Toast.tsx — notification toasts (success, error, warning, info)
   - components/ui/Skeleton.tsx — loading placeholder with shimmer animation
   - components/layout/PageHeader.tsx — consistent page titles with breadcrumbs

3. ANIMATIONS (Framer Motion):
   - Page transitions: fade-up on enter, fade-down on exit
   - List items: stagger children with 50ms delay each
   - Modals: scale from 0.95 + fade
   - Buttons: subtle scale(0.97) on press
   - Cards: lift (translateY -2px) on hover

4. RESPONSIVE DESIGN — test and fix all breakpoints:
   - Mobile (< 640px): stack everything vertically, 16px padding
   - Tablet (640–1024px): 2-column grids, collapsible sidebar
   - Desktop (> 1024px): full layout as designed

5. PERFORMANCE:
   - Add next/image for all images with proper width/height
   - Lazy-load below-fold sections with dynamic imports
   - Add loading.tsx and error.tsx for all route segments

Return all updated component files, ready to use.`,
    },
    {
      phase: "Phase 6",
      title: "Testing & Production Deployment",
      icon: "🚢",
      color: "orange",
      target: "Cursor / AI assistant",
      desc: "Write tests, configure CI/CD, set up monitoring, and deploy to production with proper environment config.",
      prompt: `You are a senior DevOps / QA engineer. Prepare "${name}" for production deployment.

PROJECT: ${name}
HOSTING: Vercel
DATE: ${date}

## Task: Full production readiness checklist

1. TESTING SETUP:
   - Install: npm install -D vitest @testing-library/react @testing-library/user-event jsdom
   - Configure vitest.config.ts for React + jsdom
   - Write unit tests for all utility functions in src/lib/
   - Write component tests for: Button, Input, AuthGuard, and 2 core feature components
   - Write API route tests with mocked Supabase client
   - Target: >80% coverage on business logic

2. ENVIRONMENT CONFIGURATION:
   Create the following files with proper validation:
   - .env.local         — local development (never commit)
   - .env.example       — template with all required vars and descriptions
   - src/lib/env.ts     — Zod schema validating all env vars at startup; throw on missing

3. VERCEL DEPLOYMENT:
   - vercel.json with build settings and function max duration (30s for AI routes)
   - Add all environment variables in Vercel dashboard (Settings → Environment Variables)
   - Configure production domain and SSL
   - Enable Vercel Analytics and Speed Insights
   - Set up preview deployments for all PR branches

4. ERROR MONITORING (Sentry):
   - npm install @sentry/nextjs
   - Run npx @sentry/wizard@latest -i nextjs
   - Capture unhandled exceptions, API errors, and slow transactions
   - Configure source maps upload in CI

5. CI/CD (GitHub Actions) — create .github/workflows/ci.yml:
   - On push/PR: type-check (tsc --noEmit), lint (eslint), unit tests (vitest)
   - On merge to main: auto-deploy to Vercel production

6. PRODUCTION CHECKLIST before going live:
   □ Remove all console.log statements
   □ Set NODE_ENV=production
   □ Enable Supabase RLS on all tables
   □ Add rate limiting to all public API routes (Upstash Ratelimit)
   □ Verify CORS headers on API routes
   □ Enable Supabase Point-In-Time Recovery backup
   □ Set up uptime monitoring (Better Uptime or Checkly)

Return all config files and test files, production-ready.`,
    },
  ];
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handle} className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10">
      {copied ? <><Check className="w-3 h-3 text-green-500" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
    </button>
  );
}

interface GeneratedCode {
  templateId: string;
  code: string;
  expanded: boolean;
}

interface GeneratedPreview {
  templateId: string;
  html: string;
  lightboxOpen: boolean;
  source: "buildcraft-ai";
}

interface AiPrompt {
  phase:  string;
  title:  string;
  icon:   string;
  color:  string;
  target: string;
  desc:   string;
  prompt: string;
}

interface ProjectBlueprint {
  pages:         string[];
  features:      string[];
  userRoles:     string[];
  dataModels:    string[];
  primaryAction: string;
  brandTone:     string;
  colorHint:     string;
}

// ── AI Project Analysis types ────────────────────────────────────────────────
type ArchIconKey = "frontend"|"backend"|"database"|"ai"|"auth"|"storage"|"realtime"|"payment"|"email";
type ArchColor   = "blue"|"purple"|"emerald"|"indigo"|"yellow"|"pink"|"orange"|"cyan";

interface ArchLayer {
  icon:  ArchIconKey;
  color: ArchColor;
  title: string;
  desc:  string;
}

interface AiTool {
  name:             string;
  category:         string;
  compliance?:      string;
  complianceColor?: "green"|"blue"|"yellow"|"red";
  why:              string;
  warning?:         string;
  skillGap?:        string;
  iconLabel:        string;
}

interface AiRisk {
  level:  "High Risk"|"Medium Risk"|"Low Risk";
  color:  "red"|"yellow"|"orange"|"white";
  title:  string;
  body:   string;
  fix:    string;
}

interface ProjectAnalysis {
  overview: { summary: string; architecture: ArchLayer[] };
  tools:    AiTool[];
  risks:    AiRisk[];
}

const ARCH_ICONS: Record<ArchIconKey, React.ElementType> = {
  frontend: Monitor,
  backend:  Server,
  database: Database,
  ai:       BrainCircuit,
  auth:     ShieldCheck,
  storage:  Package,
  realtime: Wifi,
  payment:  CreditCard,
  email:    Mail,
};

const ARCH_COLOR_BG: Record<ArchColor, string> = {
  blue:    "bg-blue-500/10 border-blue-500/20",
  purple:  "bg-purple-500/10 border-purple-500/20",
  emerald: "bg-emerald-500/10 border-emerald-500/20",
  indigo:  "bg-indigo-500/10 border-indigo-500/20",
  yellow:  "bg-yellow-500/10 border-yellow-500/20",
  pink:    "bg-pink-500/10 border-pink-500/20",
  orange:  "bg-orange-500/10 border-orange-500/20",
  cyan:    "bg-cyan-500/10 border-cyan-500/20",
};

const ARCH_COLOR_ICON: Record<ArchColor, string> = {
  blue:    "text-blue-400",
  purple:  "text-purple-400",
  emerald: "text-emerald-400",
  indigo:  "text-indigo-400",
  yellow:  "text-yellow-400",
  pink:    "text-pink-400",
  orange:  "text-orange-400",
  cyan:    "text-cyan-400",
};

const RISK_ICONS: Record<string, React.ElementType> = {
  red:    ShieldAlert,
  yellow: AlertTriangle,
  orange: AlertTriangle,
  white:  CheckCircle2,
};

function aiToolId(name: string) {
  return "ai-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export default function ArchitectureView() {
  const router = useRouter();
  const { authReady, project, setProject, approvedTools, setToolApproval, setPromptsViewed, promptsViewed, currentUser, savedProjectId, setSavedProjectId, patchProject, clearProject, incrementVersion, developerProfile, userRoles, role } =
    useStore();
  const [activeTab, setActiveTab] = useState<Tab>("architecture");
  const version = project?.version ?? "v1.0";

  // ── Route Guard (waits for Firebase auth before redirecting) ────────────────
  useEffect(() => {
    if (!authReady) return;
    if (!currentUser) {
       router.push("/auth?return=/architecture");
    } else if (!project && !savedProjectId) {
       if (
         isDeveloperRegistrationComplete(developerProfile) &&
         shouldDefaultToDeveloperDashboard(userRoles, developerProfile, role)
       ) {
         router.push("/employee-dashboard");
       } else {
         router.push("/discovery");
       }
    }
  }, [authReady, currentUser, project, savedProjectId, router, developerProfile, userRoles, role]);

  useAutoSave();

  // History state
  const [history, setHistory] = useState<SavedProject[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyOpen,    setHistoryOpen]    = useState(true);
  const [deletingId,     setDeletingId]     = useState<string | null>(null);
  const [searchQuery,    setSearchQuery]    = useState("");
  const [showDeleted,    setShowDeleted]    = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    setHistoryLoading(true);
    getUserProjects(currentUser.uid)
      .then(projects => setHistory(projects.sort((a, b) =>
        firestoreTimestampSeconds(b.updatedAt) - firestoreTimestampSeconds(a.updatedAt),
      )))
      .catch(console.error)
      .finally(() => setHistoryLoading(false));
  }, [currentUser, savedProjectId]);

  function loadFromHistory(saved: SavedProject) {
    setProject(saved.project);
    setSavedProjectId(saved.id);
    Object.entries(saved.approvedTools ?? {}).forEach(([toolId, val]) => {
      if (val !== undefined) setToolApproval(toolId, val as boolean);
    });
    setActiveTab("architecture");

    // Smart navigate based on project state
    if (saved.project.locked) {
      router.push("/project-room");
    } else if (saved.project.assumptions?.every(a => a.accepted)) {
      // already in architecture, do nothing since it's correctly open
    } else {
      router.push("/discovery");
    }
  }

  async function handleDeleteHistory(id: string) {
    setDeletingId(id);
    await deleteProject(id).catch(() => {});
    setHistory(prev => prev.map(p => p.id === id ? { ...p, deletedAt: Timestamp.fromMillis(Date.now()) } : p));
    setDeletingId(null);
  }

  async function handleRestoreHistory(id: string) {
    setDeletingId(id);
    await restoreProject(id).catch(() => {});
    setHistory(prev => prev.map(p => p.id === id ? { ...p, deletedAt: null } : p));
    setDeletingId(null);
  }

  const filteredHistory = history.filter(h => {
    const isMatch = h.project.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                    (h.project.idea && h.project.idea.toLowerCase().includes(searchQuery.toLowerCase()));
    const isDeleted = !!h.deletedAt;
    return isMatch && (showDeleted ? isDeleted : !isDeleted);
  });

  // Code generation state
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generatedCodes, setGeneratedCodes] = useState<Record<string, GeneratedCode>>({});
  const [codeError, setCodeError] = useState<string | null>(null);

  // Preview HTML state
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [generatedPreviews, setGeneratedPreviews] = useState<Record<string, GeneratedPreview>>({});
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewFullscreenId, setPreviewFullscreenId] = useState<string | null>(null);
  const [previewCollapsed, setPreviewCollapsed] = useState<Record<string, boolean>>({});
  const [expandedServices, setExpandedServices] = useState<Record<string, boolean>>({});

  // AI-generated prompts state
  const [aiPrompts, setAiPrompts]               = useState<AiPrompt[] | null>(null);
  const [aiBlueprint, setAiBlueprint]           = useState<ProjectBlueprint | null>(null);
  const [promptsLoading, setPromptsLoading]     = useState(false);
  const [promptsError, setPromptsError]         = useState<string | null>(null);
  // AI project analysis state (Overview + Tools + Risks)
  const [aiAnalysis, setAiAnalysis]             = useState<ProjectAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading]   = useState(false);
  const [analysisError, setAnalysisError]       = useState<string | null>(null);
  const [analysisPhaseIndex, setAnalysisPhaseIndex] = useState(0);

  // Restore persisted analysis from project for deterministic retrieval
  useEffect(() => {
    if (project?.aiAnalysis) setAiAnalysis(project.aiAnalysis);
    if (project?.aiPrompts) setAiPrompts(project.aiPrompts as AiPrompt[]);
    if (project?.aiBlueprint) setAiBlueprint(project.aiBlueprint);
  }, [project?.aiAnalysis, project?.aiPrompts, project?.aiBlueprint]);

  // Stitch full-project UI state
  const [stitchStep, setStitchStep] = useState<0 | 1 | 2 | 3 | 4>(0);
  // 0=idle 1=creating project 2=generating screens 3=polling for HTML 4=done
  const [stitchResult, setStitchResult] = useState<{
    html: string;
    palette?: string;
    visualVariant?: string;
  } | null>(null);
  const [stitchError, setStitchError] = useState<string | null>(null);
  const [stitchFullscreen, setStitchFullscreen] = useState(false);
  const [stitchShowSource, setStitchShowSource] = useState(false);
  const [stitchElapsed, setStitchElapsed] = useState(0);

  // Structured UI JSON → dynamic React preview (orchestrated AI pipeline)
  const [uiJsonPrompt, setUiJsonPrompt] = useState("");
  const [uiJsonLoading, setUiJsonLoading] = useState(false);
  const [uiJsonError, setUiJsonError] = useState<string | null>(null);
  const [uiJsonScreen, setUiJsonScreen] = useState<UIScreenJson | null>(null);
  const [uiJsonVersions, setUiJsonVersions] = useState<{ ui: UIScreenJson; savedAt: number }[]>([]);
  const [uiJsonShowRaw, setUiJsonShowRaw] = useState(false);

  // Derived tool state — computed after all useState calls to avoid TDZ errors
  // If AI returns no tools, fall back to static list so locking is never blocked by an empty array.
  const effectiveToolIds =
    aiAnalysis?.tools?.length
      ? aiAnalysis.tools.map(t => aiToolId(t.name))
      : TOOLS.map(t => t.id);
  const decidedCount    = effectiveToolIds.filter(id => id in approvedTools).length;
  const allToolsDecided = effectiveToolIds.length > 0 && decidedCount === effectiveToolIds.length;
  const canProceed = allToolsDecided && promptsViewed;

  const toolNamesForPrompts = useMemo(() => {
    if (aiAnalysis?.tools?.length) {
      return aiAnalysis.tools.map((t) => t.name);
    }
    return TOOLS.filter((t) => approvedTools[t.id] !== false).map((t) => t.name);
  }, [aiAnalysis, approvedTools]);

  const orchestrationLabels = useMemo(() => {
    if (analysisLoading && promptsLoading) {
      return [...ANALYSIS_PHASE_LABELS, ...FULL_PLAN_EXTRA_LABELS];
    }
    if (analysisLoading) {
      return [...ANALYSIS_PHASE_LABELS];
    }
    if (promptsLoading) {
      return ["Generating build prompts…", "Polishing your prompt pack…"];
    }
    return [...ANALYSIS_PHASE_LABELS];
  }, [analysisLoading, promptsLoading]);

  useEffect(() => {
    if (!analysisLoading && !promptsLoading) {
      setAnalysisPhaseIndex(0);
      return;
    }
    setAnalysisPhaseIndex(0);
    let i = 0;
    const id = setInterval(() => {
      i = Math.min(i + 1, orchestrationLabels.length - 1);
      setAnalysisPhaseIndex(i);
    }, 1000);
    return () => clearInterval(id);
  }, [analysisLoading, promptsLoading, orchestrationLabels.length]);

  const autoOrchestrateAttempted = useRef(false);

  const runFullPlanOrchestration = useCallback(async () => {
    if (!project) return;
    autoOrchestrateAttempted.current = true;
    setAnalysisLoading(true);
    setPromptsLoading(true);
    setAnalysisError(null);
    setPromptsError(null);
    setAnalysisPhaseIndex(0);

    let analysis: ProjectAnalysis | null = null;
    try {
      const res = await fetch("/api/analyze-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName: project.name ?? "My App",
          projectIdea: project.idea ?? "",
        }),
      });
      const data = await parseApiJson<Record<string, unknown>>(res);
      analysis = data as unknown as ProjectAnalysis;
      if (!analysis?.overview?.summary) {
        throw new Error(typeof data.error === "string" ? data.error : "Analysis failed.");
      }
      setAiAnalysis(analysis);
    } catch (err) {
      setAnalysisError(getUserFacingError(err));
      autoOrchestrateAttempted.current = false;
      setAnalysisLoading(false);
      setPromptsLoading(false);
      return;
    }

    setAnalysisLoading(false);

    try {
      const res2 = await fetch("/api/generate-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName: project.name ?? "My App",
          projectIdea: project.idea ?? "",
          tools: analysis.tools.map((t) => t.name),
        }),
      });
      const data2 = await parseApiJson<Record<string, unknown>>(res2);
      const prompts = data2.prompts as AiPrompt[] | undefined;
      const blueprint = data2.blueprint as ProjectBlueprint | undefined;
      if (!Array.isArray(prompts) || prompts.length === 0) {
        throw new Error(
          typeof data2.error === "string" ? data2.error : "Prompts generation failed.",
        );
      }
      setAiPrompts(prompts);
      if (blueprint && typeof blueprint === "object") {
        setAiBlueprint(blueprint);
      }
      if (project.autoPlanPipelineDone) {
        incrementVersion();
      }
      const partialUpdate = { 
        aiAnalysis: analysis, 
        aiPrompts: prompts as GeneratedPromptRow[], 
        aiBlueprint: blueprint as StoreProjectBlueprint | undefined, 
        autoPlanPipelineDone: true 
      };
      patchProject(partialUpdate);
      setPromptsViewed(true);
      if (currentUser) {
        logAction(currentUser.uid, "project.updated", { action: "architecture_regenerated" }).catch(() => {});
      }

      const st = useStore.getState();
      if (st.currentUser && st.savedProjectId && st.project) {
        updateProject(st.savedProjectId, { ...st.project, ...partialUpdate }, st.approvedTools).catch((err) =>
          console.warn("[Firestore] auto orchestration save failed:", err)
        );
      }
    } catch (err) {
      setPromptsError(getUserFacingError(err));
      autoOrchestrateAttempted.current = false;
    } finally {
      setPromptsLoading(false);
    }
  }, [project, patchProject, setPromptsViewed]);

  const generateBuildPrompts = useCallback(async () => {
    setPromptsLoading(true);
    setPromptsError(null);
    try {
      const res = await fetch("/api/generate-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName: project?.name ?? "My App",
          projectIdea: project?.idea ?? "",
          tools: toolNamesForPrompts,
        }),
      });
      const data = await parseApiJson(res);
      const prompts = data.prompts;
      if (!Array.isArray(prompts) || prompts.length === 0) {
        throw new Error(
          typeof data.error === "string" ? data.error : "No prompts returned. Please try again.",
        );
      }
      setAiPrompts(prompts as AiPrompt[]);
      if (data.blueprint && typeof data.blueprint === "object") {
        setAiBlueprint(data.blueprint as ProjectBlueprint);
      }
      
      const partialUpdate = {
        aiPrompts: prompts as GeneratedPromptRow[],
        aiBlueprint: data.blueprint as StoreProjectBlueprint | undefined,
      };
      patchProject(partialUpdate);
      const st = useStore.getState();
      if (st.currentUser && st.savedProjectId && st.project) {
        updateProject(st.savedProjectId, { ...st.project, ...partialUpdate }, st.approvedTools).catch((err) =>
          console.warn("[Firestore] generateBuildPrompts save failed:", err)
        );
      }
    } catch (err) {
      setPromptsError(getUserFacingError(err));
    } finally {
      setPromptsLoading(false);
    }
  }, [project?.name, project?.idea, toolNamesForPrompts]);

  const requirementsReadyForOrchestration =
    !!project &&
    project.requirements.length >= 1 &&
    (project.idea?.trim().length ?? 0) >= 8;

  useEffect(() => {
    if (!requirementsReadyForOrchestration) return;

    if (project?.aiAnalysis && project?.aiPrompts) {
      // Deterministic retrieval: Data is already in the project, bypass orchestration
      return;
    }

    if (project?.autoPlanPipelineDone) return;
    if (analysisLoading || promptsLoading) return;
    if (autoOrchestrateAttempted.current) return;

    const t = window.setTimeout(() => {
      void runFullPlanOrchestration();
    }, 450);
    return () => clearTimeout(t);
  }, [
    requirementsReadyForOrchestration,
    project?.autoPlanPipelineDone,
    project?.requirements?.length,
    project?.idea,
    analysisLoading,
    promptsLoading,
    runFullPlanOrchestration,
  ]);

  useEffect(() => {
    autoOrchestrateAttempted.current = false;
  }, [project?.name]);

  // Restore saved premium landing page when returning to Architecture
  useEffect(() => {
    const lp = project?.landingPage;
    if (lp?.html?.trim() && lp.savedAt) {
      setStitchResult({
        html: lp.html,
        palette: lp.palette,
        visualVariant: lp.visualVariant,
      });
      setStitchStep(4);
    }
  }, [project?.landingPage?.savedAt]);

  const handleLockAndProceed = async () => {
    patchProject({ locked: true });

    // Persist the locked plan to Firestore
    if (currentUser && project && savedProjectId) {
      try {
        const lockedProject = { ...project, locked: true };
        await updateProject(savedProjectId, lockedProject, approvedTools);
        await logAction(currentUser.uid, "project.locked", {
          projectName: project.name,
          docId: savedProjectId,
          approvedToolCount: Object.values(approvedTools).filter(Boolean).length,
        });
      } catch (err) {
        console.warn("[Firestore] lock update failed:", err);
      }
    }

    router.push("/project-room");
  };

  const generateCode = async (template: ComponentTemplate) => {
    setGeneratingId(template.id);
    setCodeError(null);
    try {
      const res = await fetch("/api/generate-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectIdea: project?.idea ?? "a modern web application",
          projectName: project?.name ?? "My App",
          componentType: template.label,
          componentDesc: template.componentDesc,
        }),
      });
      const data = await parseApiJson(res);
      const code = typeof data.code === "string" ? data.code : "";
      if (!code.trim()) throw new Error(typeof data.error === "string" ? data.error : "Generation failed");
      setGeneratedCodes((prev) => ({
        ...prev,
        [template.id]: { templateId: template.id, code, expanded: true },
      }));
    } catch (err) {
      setCodeError(getUserFacingError(err));
    } finally {
      setGeneratingId(null);
    }
  };

  const toggleExpand = (id: string) => {
    setGeneratedCodes((prev) => ({
      ...prev,
      [id]: { ...prev[id], expanded: !prev[id].expanded },
    }));
  };

  const generatePreview = async (template: ComponentTemplate) => {
    setPreviewingId(template.id);
    setPreviewError(null);
    try {
      const res = await fetch("/api/generate-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: template.id,
          projectName: project?.name ?? "My App",
          projectIdea: project?.idea ?? "",
        }),
      });
      const data = await parseApiJson(res);
      const html = typeof data.html === "string" ? data.html : "";
      if (!html) throw new Error(typeof data.error === "string" ? data.error : "Preview generation failed");
      setGeneratedPreviews((prev) => ({
        ...prev,
        [template.id]: {
          templateId: template.id,
          html,
          lightboxOpen: false,
          source: "buildcraft-ai",
        },
      }));
    } catch (err) {
      setPreviewError(getUserFacingError(err));
    } finally {
      setPreviewingId(null);
    }
  };


  const generateFullUI = async () => {
    setStitchStep(2);
    setStitchError(null);
    setStitchResult(null);
    setStitchShowSource(false);
    setStitchElapsed(0);

    const start = Date.now();
    const tick  = setInterval(() => setStitchElapsed(Math.floor((Date.now() - start) / 1000)), 1000);

    try {
      const res  = await fetch("/api/generate-stitch-ui", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          projectName: project?.name ?? "My App",
          projectIdea: project?.idea ?? "",
        }),
      });
      const data = await parseApiJson<Record<string, unknown>>(res);
      const html = typeof data.html === "string" ? data.html : "";
      if (!html.trim()) throw new Error(typeof data.error === "string" ? data.error : "Generation failed");
      const palette = typeof data.palette === "string" ? data.palette : undefined;
      const visualVariant = typeof data.visualVariant === "string" ? data.visualVariant : undefined;
      setStitchResult({ html, palette, visualVariant });
      setStitchStep(4);
      patchProject({
        landingPage: {
          html,
          palette,
          visualVariant,
          savedAt: Date.now(),
        },
      });
      const st = useStore.getState();
      if (st.project && st.savedProjectId && st.currentUser) {
        try {
          await updateProject(st.savedProjectId, st.project, st.approvedTools);
        } catch (e) {
          console.warn("[architecture] persist landing page failed", e);
        }
      }
    } catch (err) {
      setStitchError(getUserFacingError(err));
      setStitchStep(0);
    } finally {
      clearInterval(tick);
    }
  };

  const generateUiJsonScreen = async () => {
    setUiJsonLoading(true);
    setUiJsonError(null);
    try {
      const res = await fetch("/api/generate-ui-json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt:
            uiJsonPrompt.trim() ||
            `Design a responsive main screen for ${project?.name ?? "my app"} with clear hierarchy and primary actions.`,
          projectName: project?.name ?? "My App",
          projectIdea: project?.idea ?? "",
        }),
      });
      const data = await parseApiJson<Record<string, unknown>>(res);
      const ui = data.ui as UIScreenJson | undefined;
      if (!ui || typeof ui.page !== "string") throw new Error("Invalid UI JSON response");
      setUiJsonScreen(ui);
      setUiJsonVersions((v) => [{ ui, savedAt: Date.now() }, ...v].slice(0, 8));
    } catch (err) {
      setUiJsonError(getUserFacingError(err));
    } finally {
      setUiJsonLoading(false);
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "architecture", label: "Overview" },
    { id: "tools",        label: "Tools" },
    { id: "risks",        label: "Risks" },
    { id: "prompts",      label: "AI Prompts" },
    { id: "config",       label: "Configurations" },
    { id: "code",         label: "UI/UX Code" },
  ];

  return (
    <div className="min-h-screen relative flex">
      {/* Ambient background glows */}
      <div className="fixed top-0 left-0 w-[600px] h-[600px] bg-indigo-500/[0.04] rounded-full blur-[200px] pointer-events-none -z-10" />
      <div className="fixed bottom-0 right-0 w-[700px] h-[700px] bg-purple-500/[0.04] rounded-full blur-[200px] pointer-events-none -z-10" />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-blue-500/[0.02] rounded-full blur-[150px] pointer-events-none -z-10" />

      {/* Sidebar */}
      <aside className="w-64 border-r border-white/5 bg-[#030303]/90 backdrop-blur-2xl flex flex-col p-6 sticky top-0 h-screen shadow-[inset_-1px_0_0_rgba(255,255,255,0.03)]">
        <div className="mb-8">
          <Link href="/" className="flex items-center gap-2 group w-fit hover:scale-105 transition-transform">
            <Logo className="w-9 h-9 group-hover:drop-shadow-[0_0_15px_rgba(59,130,246,0.8)] transition-all" />
            <span className="text-xl font-black tracking-tighter text-white uppercase group-hover:text-white/90 transition-colors">BuildCraft AI</span>
          </Link>
          <div className="flex items-center gap-1.5 mt-3">
            <span className="flex h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse shadow-[0_0_6px_rgba(99,102,241,0.8)]" />
            <span className="text-indigo-400/80 text-[10px] uppercase tracking-[0.2em] font-bold">Architecture</span>
          </div>
          {project && <div className="mt-1 text-white/30 text-[10px] truncate font-light">{project.name}</div>}
        </div>

        <nav className="flex-grow space-y-1">
          {/* Home */}
          <Link href="/" className="flex items-center gap-3 w-full px-3 py-2.5 text-white/40 hover:text-white hover:bg-white/5 rounded-xl transition-all text-sm group">
            <Home className="w-4 h-4 group-hover:text-blue-400 transition-colors" />
            <span className="text-xs font-medium">Home</span>
          </Link>

          {/* Requirements */}
          <button onClick={() => router.push("/discovery")} className="flex items-center gap-3 w-full px-3 py-2.5 text-white/40 hover:text-white hover:bg-white/5 transition-all rounded-xl group">
            <Layers className="w-4 h-4 group-hover:text-blue-400 transition-colors" />
            <span className="text-xs font-medium">Requirements</span>
            {project && (
              <span className="ml-auto text-[9px] text-white/20 bg-white/5 px-1.5 py-0.5 rounded-full uppercase tracking-widest">{project.version || "v1.0"}</span>
            )}
          </button>

          {/* Architecture — active */}
          <button className="flex items-center gap-3 w-full px-3 py-2.5 text-white font-bold bg-gradient-to-r from-indigo-500/15 to-transparent rounded-xl border border-indigo-500/20 text-sm shadow-[0_0_20px_rgba(99,102,241,0.05)] relative overflow-hidden group">
            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-indigo-500 rounded-full" />
            <Activity className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-bold text-indigo-300">Architecture ({version})</span>
          </button>

          {/* Regenerate Analysis (if not locked) */}
          {!project?.locked && (
            <button
              type="button"
              onClick={() => { if(confirm("Regenerate entire technical plan? Current choices may be reset.")) runFullPlanOrchestration(); }}
              disabled={analysisLoading || promptsLoading}
              className="flex items-center gap-3 w-full px-3 py-2.5 text-white/40 hover:text-white hover:bg-white/5 rounded-xl transition-all text-[10px] uppercase font-bold tracking-widest group"
            >
              {analysisLoading || promptsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              <span>Regenerate Analysis</span>
            </button>
          )}

          {/* Project Workspace / lock — always visible */}
          {project?.locked ? (
            <button
              type="button"
              onClick={() => router.push("/project-room")}
              className="flex items-center gap-3 w-full px-3 py-2.5 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-xl transition-all border border-indigo-500/20 group"
            >
              <Users className="w-4 h-4" />
              <span className="text-xs font-bold">Project Workspace</span>
            </button>
          ) : allToolsDecided ? (
            <button
              type="button"
              onClick={handleLockAndProceed}
              disabled={!promptsViewed}
              title={!promptsViewed ? "Open the AI Prompts tab once, then you can lock." : undefined}
              className={`flex flex-col items-stretch gap-1 w-full px-3 py-2.5 rounded-xl transition-all border ${
                promptsViewed
                  ? "text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 border-indigo-500/20"
                  : "text-white/25 border-white/5 cursor-not-allowed opacity-80"
              }`}
            >
              <span className="flex items-center gap-3">
                <Lock className="w-4 h-4 shrink-0" />
                <span className="text-xs font-bold text-left">Lock technical plan</span>
              </span>
              {!promptsViewed && (
                <span className="text-[9px] text-white/35 font-light pl-7 leading-snug">Review AI Prompts tab first →</span>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setActiveTab("tools")}
              className="flex flex-col items-stretch gap-1 w-full px-3 py-2.5 text-amber-400/90 hover:text-amber-300 hover:bg-amber-500/10 rounded-xl transition-all border border-amber-500/20"
            >
              <span className="flex items-center gap-3">
                <Lock className="w-4 h-4 shrink-0" />
                <span className="text-xs font-bold text-left">Lock technical plan</span>
              </span>
              <span className="text-[9px] text-white/40 font-light pl-7 leading-snug">
                Approve tools ({decidedCount}/{effectiveToolIds.length})
              </span>
            </button>
          )}
        </nav>

        {/* ── Project History in Sidebar ─────────────────────────────────────── */}
        {currentUser && (
          <div className="mt-4 flex-shrink-0">
            <button
              onClick={() => setHistoryOpen(v => !v)}
              className="flex items-center justify-between w-full mb-2 text-[10px] font-bold uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <History className="w-3 h-3" /> Past Projects
                {filteredHistory.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-[9px]">{filteredHistory.length}</span>
                )}
              </span>
              <ChevronDown className={`w-3 h-3 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
            </button>

            <AnimatePresence>
              {historyOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <button
                    onClick={() => {
                      clearProject();
                      router.push("/discovery");
                    }}
                    className="w-full flex items-center justify-center gap-2 mb-3 py-2 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 hover:from-indigo-500/20 hover:to-purple-500/20 border border-indigo-500/20 rounded-xl text-[10px] font-bold uppercase tracking-widest text-indigo-300 transition-all"
                  >
                    + Start New Project
                  </button>

                  <div className="mb-2 relative">
                    <input 
                      type="text" 
                      placeholder="Search projects..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] text-white placeholder:text-white/30 focus:outline-none focus:border-indigo-500/40"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-[9px] text-white/30 uppercase tracking-widest">{showDeleted ? "Deleted Projects" : "Active Projects"}</span>
                    <button 
                      onClick={() => setShowDeleted(!showDeleted)}
                      className="text-[9px] text-indigo-400 hover:text-indigo-300 uppercase tracking-widest transition-colors"
                    >
                      {showDeleted ? "Show Active" : "Show Deleted"}
                    </button>
                  </div>
                  {historyLoading && (
                     <div className="flex items-center gap-2 py-3 text-white/20">
                       <RefreshCw className="w-3 h-3 animate-spin" />
                       <span className="text-[10px]">Loading…</span>
                     </div>
                  )}

                  {!historyLoading && filteredHistory.length === 0 && (
                    <p className="text-[10px] text-white/20 font-light py-2">
                       {searchQuery ? "No matching projects." : (showDeleted ? "No deleted projects." : "No projects yet.")}
                    </p>
                  )}

                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                    {filteredHistory.map(saved => {
                      const isActive = saved.id === savedProjectId;
                      return (
                        <div key={saved.id}
                          className={`group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all ${isActive ? "bg-indigo-500/15 border border-indigo-500/20" : "hover:bg-white/5 border border-transparent"}`}
                          onClick={() => loadFromHistory(saved)}
                        >
                          <div className="shrink-0">
                            {saved.project.locked
                              ? <Lock className="w-3 h-3 text-emerald-400" />
                              : <FolderOpen className="w-3 h-3 text-white/30" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold text-white/70 truncate leading-tight">{saved.project.name}</p>
                            <p className="text-[9px] text-white/20 truncate">
                              {(() => {
                                const d = parseToDate(saved.createdAt);
                                return d ? formatDateBadge(d) : "—";
                              })()}
                            </p>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (showDeleted) void handleRestoreHistory(saved.id);
                              else void handleDeleteHistory(saved.id);
                            }}
                            disabled={deletingId === saved.id}
                            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-white/40 hover:text-white p-1"
                            title={showDeleted ? "Restore Project" : "Delete Project"}
                          >
                            {deletingId === saved.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : (showDeleted ? <RefreshCw className="w-3 h-3 text-emerald-400" /> : <Trash2 className="w-3 h-3 text-red-400" />)}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <div className="mt-auto space-y-2">
          <div className="p-4 bg-gradient-to-b from-white/[0.04] to-white/[0.01] border border-white/8 rounded-2xl space-y-3">
            <div className="text-[9px] uppercase tracking-widest text-white/40 font-bold flex items-center gap-2">
              <GitBranch className="w-3 h-3" /> Version History
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-white font-bold">{version}</span>
              <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-widest px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">Current</span>
            </div>
            <p className="text-[10px] text-white/30 font-light">Immutable snapshot on approval.</p>
          </div>
          <div className="flex items-center gap-2 p-3 bg-gradient-to-r from-emerald-500/10 to-transparent border border-emerald-500/15 rounded-2xl">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
            <span className="text-[10px] text-emerald-400/80 font-bold tracking-wide">Confidence: {project?.confidence ?? 72}%</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-grow p-8 lg:p-10 overflow-y-auto bg-[#030303]">
        <div className="max-w-5xl space-y-8">
          <CreatorFlowBreadcrumb />

          <motion.header 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b border-white/5 pb-8"
          >
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 shadow-[0_0_20px_rgba(99,102,241,0.1)]">
                <span className="flex h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse shadow-[0_0_6px_rgba(99,102,241,0.8)]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">Technical Blueprint</span>
              </div>
              <h1 className="text-5xl md:text-6xl font-black tracking-tighter text-white leading-tight">
                Technical{" "}
                <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">Plan</span>
              </h1>
              <p className="text-white/40 text-lg font-light max-w-2xl">
                Complete architecture, tools, risks, AI prompts, and UI code for your project.
              </p>
            </div>

            {/* Premium Tab Bar */}
            <div className="flex bg-white/[0.03] rounded-2xl p-1.5 border border-white/8 shrink-0 flex-wrap gap-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveTab(t.id);
                    if (t.id === "prompts") setPromptsViewed(true);
                  }}
                  className={`relative px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all duration-300 ${
                    activeTab === t.id 
                      ? "bg-white text-black shadow-[0_2px_12px_rgba(255,255,255,0.15)]" 
                      : "text-white/40 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {t.label}
                  {t.id === "prompts" && !promptsViewed && allToolsDecided && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                  )}
                  {t.id === "config" && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  )}
                  {t.id === "code" && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                  )}
                </button>
              ))}
            </div>
          </motion.header>

          {aiAnalysis && promptsLoading && (
            <div className="flex items-center gap-3 rounded-2xl border border-purple-500/25 bg-purple-500/10 px-4 py-3.5 text-xs text-purple-100/95">
              <Loader2 className="w-4 h-4 animate-spin shrink-0 text-purple-300" />
              <span>
                <strong className="text-white font-semibold">Overview, tools &amp; risks are ready.</strong>{" "}
                Generating AI build prompts in the background…
              </span>
            </div>
          )}

          <AnimatePresence mode="wait">

            {/* OVERVIEW TAB */}
            {activeTab === "architecture" && (
              <motion.section key="arch" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.4 }} className="space-y-6">

                {/* AI Analyze CTA */}
                {!aiAnalysis && !analysisLoading && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative overflow-hidden p-6 bg-[#040404] border border-indigo-500/25 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center gap-5 shadow-[0_0_40px_rgba(99,102,241,0.08)]"
                  >
                    {/* Ambient gradient */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />
                    <div className="relative z-10 flex-1 space-y-2">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <div className="w-8 h-8 bg-indigo-500/20 border border-indigo-500/30 rounded-xl flex items-center justify-center">
                          <BrainCircuit className="w-4 h-4 text-indigo-400" />
                        </div>
                        <span className="text-sm font-bold text-white">Analyze with AI</span>
                        <span className="text-[9px] uppercase tracking-widest text-indigo-300 bg-indigo-500/15 border border-indigo-500/25 px-2.5 py-1 rounded-full font-bold">BuildCraft AI</span>
                      </div>
                      <p className="text-white/35 text-xs font-light leading-relaxed">
                        When your requirements are saved, we run this automatically (overview, tools, risks, and AI prompts in one pass). You can also trigger it here: project-specific architecture, tools, and risk analysis for{" "}
                        <span className="text-white/60 font-medium">{project?.name ?? "your project"}</span>.
                      </p>
                    </div>
                    <button 
                      onClick={runFullPlanOrchestration} 
                      className="relative z-10 shrink-0 px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all flex items-center gap-2 shadow-[0_0_30px_rgba(99,102,241,0.4)] hover:shadow-[0_0_50px_rgba(99,102,241,0.6)] hover:scale-[1.02]"
                    >
                      <Sparkles className="w-4 h-4" /> Analyze Project
                    </button>
                  </motion.div>
                )}

                {/* Loading state */}
                {analysisLoading && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-8 bg-[#040404] border border-indigo-500/20 rounded-3xl flex items-center gap-6"
                  >
                    <div className="relative w-12 h-12 shrink-0">
                      <div className="absolute inset-0 rounded-full bg-indigo-500/20 blur-lg animate-pulse" />
                      <div className="absolute inset-0 border-2 border-transparent border-t-indigo-400 rounded-full animate-spin" />
                      <div className="absolute inset-2 border border-transparent border-t-purple-400 rounded-full animate-spin" style={{ animationDirection: "reverse", animationDuration: "0.8s" }} />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <BrainCircuit className="w-4 h-4 text-indigo-400/60" />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white">Analyzing {project?.name ?? "your project"}…</p>
                      <p className="text-xs text-indigo-300/90 font-medium mt-2 leading-snug">
                        {orchestrationLabels[Math.min(analysisPhaseIndex, orchestrationLabels.length - 1)]}
                      </p>
                      <p className="text-[10px] text-white/35 font-light mt-2">
                        Merged architecture pass (overview, tools, risks) then AI prompts in a second request — you’ll see results as each step completes.
                      </p>
                    </div>
                  </motion.div>
                )}

                {analysisError && (
                  <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-2xl flex items-center gap-3 text-xs text-red-400">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> {analysisError}
                    <button onClick={runFullPlanOrchestration} className="ml-auto text-[10px] font-bold uppercase tracking-widest underline hover:no-underline">Retry</button>
                  </div>
                )}

                {/* AI Summary banner */}
                {aiAnalysis && (
                  <motion.div 
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-5 bg-gradient-to-r from-indigo-500/10 to-purple-500/5 border border-indigo-500/20 rounded-3xl flex gap-4 items-start"
                  >
                    <div className="w-10 h-10 bg-indigo-500/20 border border-indigo-500/30 rounded-xl flex items-center justify-center shrink-0">
                      <BrainCircuit className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300">AI Analysis — {project?.name}</span>
                        <span className="text-[9px] text-white/30 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">BuildCraft AI</span>
                      </div>
                      <p className="text-sm text-white/70 font-light leading-relaxed">{aiAnalysis.overview.summary}</p>
                    </div>
                    <button onClick={runFullPlanOrchestration} title="Re-analyze" className="shrink-0 p-2 hover:bg-white/8 rounded-xl transition-colors text-white/25 hover:text-white group">
                      <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                    </button>
                  </motion.div>
                )}

                {/* Architecture layers — premium bento grid */}
                <div className="grid grid-cols-1 gap-4">
                  {(aiAnalysis ? aiAnalysis.overview.architecture.map((layer, i) => {
                    const Icon = ARCH_ICONS[layer.icon] ?? Server;
                    const colorBg = ARCH_COLOR_BG[layer.color] ?? "bg-white/5 border-white/10";
                    const colorIcon = ARCH_COLOR_ICON[layer.color] ?? "text-white/60";
                    return (
                      <motion.div 
                        key={layer.title}
                        initial={{ opacity: 0, x: -16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.08 }}
                        className="group relative bg-[#040404] p-6 rounded-3xl border border-white/8 hover:border-white/18 transition-all duration-500 flex gap-6 items-center overflow-hidden cursor-default"
                      >
                        <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 ${colorBg.replace("border-", "bg-").split(" ")[0]} blur-3xl`} />
                        <div className={`relative z-10 w-16 h-16 rounded-2xl ${colorBg} border flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300`}>
                          <Icon className={`w-7 h-7 ${colorIcon}`} />
                        </div>
                        <div className="relative z-10">
                          <h3 className="text-white text-base font-bold mb-1.5 tracking-tight">{layer.title}</h3>
                          <p className="text-white/40 text-sm leading-relaxed font-light group-hover:text-white/60 transition-colors duration-300">{layer.desc}</p>
                        </div>
                      </motion.div>
                    );
                  }) : [
                    { Icon: Cpu,      color: "blue",    title: "Website Frontend", desc: "Built using Next.js on Vercel. Loads instantly from global edge servers, with server-side rendering for security and SEO." },
                    { Icon: Cloud,    color: "purple",  title: "Backend Servers",  desc: "API routes running on serverless Node.js. Isolated per-request execution — no shared state, no cascading failures." },
                    { Icon: Database, color: "emerald", title: "Database Layer",    desc: "PostgreSQL via Supabase handles all structured data with row-level security. Pinecone powers AI-driven search features." },
                  ].map(({ Icon, color, title, desc }, i) => (
                    <motion.div 
                      key={title}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08 }}
                      className="relative bg-[#040404] p-6 rounded-3xl border border-white/5 flex gap-6 items-center opacity-40"
                    >
                      <div className={`w-16 h-16 rounded-2xl bg-${color}-500/10 border border-${color}-500/20 flex items-center justify-center shrink-0`}>
                        <Icon className={`w-7 h-7 text-${color}-400`} />
                      </div>
                      <div>
                        <h3 className="text-white text-base font-bold mb-1">{title}</h3>
                        <p className="text-white/40 text-sm leading-relaxed font-light">{desc}</p>
                      </div>
                    </motion.div>
                  )))
                  }
                </div>

                {/* AI Orchestration Brain — platform architecture (not project-specific) */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45 }}
                  className="relative overflow-hidden rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.07] via-[#040404] to-indigo-500/[0.06] p-6 sm:p-8"
                >
                  <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
                  <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl" />
                  <div className="relative z-10 space-y-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-2 rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-cyan-200">
                            <BrainCircuit className="h-3.5 w-3.5" /> Orchestration Brain
                          </span>
                          <span className="text-[9px] font-bold uppercase tracking-widest text-white/35">Central AI layer</span>
                        </div>
                        <h3 className="text-lg font-bold tracking-tight text-white sm:text-xl">
                          Multi-model engine — accurate, low-latency, fault-tolerant
                        </h3>
                        <p className="max-w-3xl text-sm font-light leading-relaxed text-white/45">
                          BuildCraft routes every AI workload through a centralized orchestration layer that selects the right model for each task,
                          validates outputs, retries transient failures, and falls back to alternate models or a secondary API when needed. Keys stay
                          server-side only; you can add providers over time without rewriting product code.
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {[
                        {
                          title: "Intelligent routing",
                          body: "Architecture analysis, code generation, matching, and validation each use task-tuned models — quality where it matters, speed where it counts.",
                          icon: <Layers className="h-4 w-4 text-cyan-400" />,
                        },
                        {
                          title: "Resilience & fallbacks",
                          body: "Automatic retries on flaky connections, alternate model IDs on the same endpoint, and optional secondary OpenAI-compatible APIs for redundancy.",
                          icon: <RefreshCw className="h-4 w-4 text-indigo-400" />,
                        },
                        {
                          title: "Consistent quality",
                          body: "Structured JSON and long-form outputs trigger minimum-length checks so empty or truncated responses can recover via fallbacks before reaching your UI.",
                          icon: <ShieldCheck className="h-4 w-4 text-emerald-400" />,
                        },
                        {
                          title: "Secure configuration",
                          body: "Primary key via NVIDIA_API_KEY; optional AI_FALLBACK_MODEL_ID, AI_FAST_MODEL_ID, and secondary URL/key pairs — all server-side, rotatable per environment.",
                          icon: <KeyRound className="h-4 w-4 text-yellow-400/90" />,
                        },
                        {
                          title: "Latency-aware",
                          body: "Fast model IDs for routing and validation reduce round-trip time; heavy passes stay on full-capability models with tunable upstream timeouts.",
                          icon: <Zap className="h-4 w-4 text-amber-400" />,
                        },
                        {
                          title: "Future-proof integrations",
                          body: "OpenAI-compatible surface area means new providers or upgraded models are mostly configuration — swap IDs or endpoints without branching business logic in every route.",
                          icon: <Globe className="h-4 w-4 text-sky-400" />,
                        },
                      ].map((item) => (
                        <div
                          key={item.title}
                          className="rounded-2xl border border-white/[0.08] bg-black/30 p-4 backdrop-blur-sm transition-colors hover:border-white/[0.14]"
                        >
                          <div className="mb-2 flex items-center gap-2">
                            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                              {item.icon}
                            </span>
                            <span className="text-xs font-bold text-white/90">{item.title}</span>
                          </div>
                          <p className="text-[11px] font-light leading-relaxed text-white/40">{item.body}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>

                {/* Version info */}
                <div className="p-5 bg-gradient-to-r from-blue-500/8 to-transparent border border-blue-500/15 rounded-3xl flex items-start gap-4">
                  <div className="w-8 h-8 bg-blue-500/15 border border-blue-500/20 rounded-xl flex items-center justify-center shrink-0">
                    <Info className="w-4 h-4 text-blue-400" />
                  </div>
                  <p className="text-xs text-white/50 font-light leading-relaxed">
                    <strong className="text-blue-300 font-bold">Version {version} — Immutable Snapshot.</strong> This architecture plan is saved permanently. Changes require creating a new version (v1.1+).
                  </p>
                </div>
              </motion.section>
            )}

            {/* RISKS TAB */}
            {activeTab === "risks" && (
              <motion.section key="risks" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.4 }} className="space-y-6">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Risk Register</h2>
                    <p className="text-white/25 text-[10px] font-light mt-0.5">Version {version}</p>
                  </div>
                  {aiAnalysis && (
                    <span className="text-[9px] text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-full font-bold uppercase tracking-widest flex items-center gap-1.5">
                      <BrainCircuit className="w-3 h-3" /> AI Analyzed
                    </span>
                  )}
                </div>

                {!aiAnalysis && !analysisLoading && (
                  <div className="relative overflow-hidden p-5 bg-[#040404] border border-indigo-500/20 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-transparent pointer-events-none" />
                    <div className="relative z-10 flex-1">
                      <p className="text-sm font-bold text-white mb-1">Get project-specific risks</p>
                      <p className="text-xs text-white/35 font-light">Placeholder risks shown below. Analyze to get tailored risks for <span className="text-white/60">{project?.name ?? "your project"}</span>.</p>
                    </div>
                    <button onClick={runFullPlanOrchestration} className="relative z-10 shrink-0 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(99,102,241,0.3)]">
                      <Sparkles className="w-3.5 h-3.5" /> Analyze
                    </button>
                  </div>
                )}

                {analysisLoading && (
                  <div className="p-5 bg-[#040404] border border-indigo-500/15 rounded-3xl flex items-start gap-4">
                    <Loader2 className="w-4 h-4 text-indigo-400 animate-spin shrink-0 mt-0.5" />
                    <div>
                      <span className="text-sm text-white/70">
                        Identifying risks for <span className="text-white font-medium">{project?.name ?? "your project"}</span>…
                      </span>
                      <p className="text-xs text-indigo-300/90 font-medium mt-2">{orchestrationLabels[Math.min(analysisPhaseIndex, orchestrationLabels.length - 1)]}</p>
                    </div>
                  </div>
                )}

                {analysisError && (
                  <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-2xl flex items-center gap-3 text-xs text-red-400">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> {analysisError}
                    <button onClick={runFullPlanOrchestration} className="ml-auto text-[10px] font-bold uppercase tracking-widest underline hover:no-underline">Retry</button>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(aiAnalysis?.risks ?? [
                    { level: "High Risk",   color: "red",    title: "Connection Limits Under Heavy Load", body: "If too many users connect simultaneously, the database connection pool may be exhausted, causing timeouts.", fix: "Use Supabase connection pooling (PgBouncer) and implement queue-based writes for peak traffic." },
                    { level: "Medium Risk", color: "yellow", title: "AI Privacy Compliance",              body: "Some third-party AI APIs may route data through regions that conflict with your users’ privacy expectations (for example GDPR).", fix: "Choose a provider with EU data residency and a data-processing agreement that matches your policy." },
                    { level: "Medium Risk", color: "orange", title: "Timeline Risk",                      body: "Vector DB integration and AI features are often underestimated. They typically add 3–4 weeks to the timeline.", fix: "Scope Pinecone as Phase 2. Launch without AI search first, add it in the second sprint." },
                    { level: "Low Risk",    color: "white",  title: "Vendor Lock-in (Vercel)",            body: "Next.js is tightly integrated with Vercel. Migrating to another host requires configuration changes.", fix: "Next.js is open source and can be self-hosted. Vercel is the best choice for this stage." },
                  ] as AiRisk[]).map(({ level, color, title, body, fix }, i) => {
                    const RiskIcon = RISK_ICONS[color] ?? AlertTriangle;
                    const borderColor = color === "red" ? "border-red-500/25" : color === "yellow" ? "border-yellow-500/25" : color === "orange" ? "border-orange-500/25" : "border-white/10";
                    const glowColor  = color === "red" ? "bg-red-500/5" : color === "yellow" ? "bg-yellow-500/5" : color === "orange" ? "bg-orange-500/5" : "bg-white/[0.02]";
                    const iconColor  = color === "red" ? "text-red-400" : color === "yellow" ? "text-yellow-400" : color === "orange" ? "text-orange-400" : "text-white/50";
                    const badgeBg    = color === "red" ? "bg-red-500/15 text-red-300 border-red-500/30" : color === "yellow" ? "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" : color === "orange" ? "bg-orange-500/15 text-orange-300 border-orange-500/30" : "bg-white/10 text-white/50 border-white/15";
                    return (
                      <motion.div 
                        key={title}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.07 }}
                        className={`relative bg-[#040404] p-6 rounded-3xl border ${borderColor} ${!aiAnalysis ? "opacity-45" : ""} overflow-hidden group hover:border-opacity-50 transition-all duration-500`}
                      >
                        <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20 ${glowColor}`} />
                        <div className="relative z-10">
                          <div className="flex items-center justify-between mb-4">
                            <span className={`px-2.5 py-1 border rounded-full text-[9px] font-black uppercase tracking-widest ${badgeBg}`}>{level}</span>
                            <RiskIcon className={`w-5 h-5 ${iconColor}`} />
                          </div>
                          <h3 className="text-white text-base font-bold mb-2 tracking-tight">{title}</h3>
                          <p className="text-white/35 text-sm font-light leading-relaxed mb-4">{body}</p>
                          <div className="p-3.5 bg-white/[0.03] border border-white/8 rounded-2xl text-xs text-white/55 leading-relaxed">
                            <span className="text-white/30 font-bold uppercase tracking-widest text-[9px] block mb-1">Mitigation</span>
                            {fix}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.section>
            )}

            {/* TOOLS TAB */}
            {activeTab === "tools" && (
              <motion.section key="tools" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.4 }} className="space-y-6">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Approve Recommended Tools</h2>
                    <p className="text-white/25 text-[10px] font-light mt-0.5">Version {version}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {aiAnalysis && (
                      <span className="text-[9px] text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-full font-bold uppercase tracking-widest flex items-center gap-1.5">
                        <BrainCircuit className="w-3 h-3" /> AI Picked
                      </span>
                    )}
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-full">
                      <div className={`w-1.5 h-1.5 rounded-full ${decidedCount === effectiveToolIds.length ? "bg-emerald-400" : "bg-amber-400"} animate-pulse`} />
                      <span className="text-[10px] text-white/50 font-bold tracking-widest">{decidedCount} / {effectiveToolIds.length}</span>
                    </div>
                  </div>
                </div>

                {!aiAnalysis && !analysisLoading && (
                  <div className="relative overflow-hidden p-5 bg-[#040404] border border-indigo-500/20 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-transparent pointer-events-none" />
                    <div className="relative z-10 flex-1">
                      <p className="text-sm font-bold text-white mb-1">Get AI-recommended tools for <span className="text-indigo-300">{project?.name ?? "your project"}</span></p>
                      <p className="text-xs text-white/35 font-light">Generic tools shown below. Run AI analysis to get tools selected for your exact project type, scale, and requirements.</p>
                    </div>
                    <button onClick={runFullPlanOrchestration} className="relative z-10 shrink-0 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(99,102,241,0.3)]">
                      <Sparkles className="w-3.5 h-3.5" /> Analyze
                    </button>
                  </div>
                )}

                {analysisLoading && (
                  <div className="p-5 bg-[#040404] border border-indigo-500/15 rounded-3xl flex items-start gap-4">
                    <Loader2 className="w-4 h-4 text-indigo-400 animate-spin shrink-0 mt-0.5" />
                    <div>
                      <span className="text-sm text-white/70">
                        Selecting the best tools for <span className="text-white font-medium">{project?.name ?? "your project"}</span>…
                      </span>
                      <p className="text-xs text-indigo-300/90 font-medium mt-2">{orchestrationLabels[Math.min(analysisPhaseIndex, orchestrationLabels.length - 1)]}</p>
                    </div>
                  </div>
                )}

                {analysisError && (
                  <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-2xl flex items-center gap-3 text-xs text-red-400">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> {analysisError}
                    <button onClick={runFullPlanOrchestration} className="ml-auto text-[10px] font-bold uppercase tracking-widest underline hover:no-underline">Retry</button>
                  </div>
                )}

                <div className="space-y-4">
                  {/* AI-generated tools */}
                  {aiAnalysis && aiAnalysis.tools.map((tool, i) => {
                    const id = aiToolId(tool.name);
                    const isApproved = approvedTools[id] === true;
                    const isRejected = approvedTools[id] === false;
                    return (
                      <motion.div 
                        key={id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06 }}
                        className={`relative bg-[#040404] p-6 rounded-3xl border transition-all duration-300 ${
                          isApproved ? "border-emerald-500/30 shadow-[0_0_25px_rgba(16,185,129,0.06)]" 
                          : isRejected ? "border-red-500/20 opacity-50" 
                          : "border-white/8 hover:border-white/15"
                        } flex flex-col lg:flex-row gap-6 overflow-hidden`}
                      >
                        {isApproved && <div className="absolute inset-0 bg-emerald-500/[0.03] pointer-events-none" />}
                        <div className="relative z-10 flex-1 space-y-4">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center shrink-0 text-base font-bold text-indigo-300 select-none">
                              {tool.iconLabel}
                            </div>
                            <div>
                              <h3 className="text-white text-lg font-bold tracking-tight">{tool.name}</h3>
                              <div className="flex gap-2 mt-1.5 flex-wrap">
                                <span className="text-[9px] uppercase tracking-wider text-white/35 border border-white/8 px-2.5 py-0.5 rounded-full">{tool.category}</span>
                                {tool.compliance && tool.complianceColor && (
                                  <span className={`text-[9px] uppercase tracking-wider text-${tool.complianceColor}-400 border border-${tool.complianceColor}-500/25 px-2.5 py-0.5 rounded-full bg-${tool.complianceColor}-500/10 font-bold`}>{tool.compliance}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="p-4 bg-white/[0.025] rounded-2xl border border-white/8 space-y-2.5">
                            <div className="flex items-center gap-2 text-white/40 text-[10px] font-bold uppercase tracking-widest">
                              <Eye className="w-3.5 h-3.5" /> Why This Tool?
                            </div>
                            <p className="text-white/50 text-sm font-light leading-relaxed">{tool.why}</p>
                            {tool.warning  && <p className="text-yellow-400/70 text-xs font-light border-t border-white/5 pt-2"><strong className="text-yellow-400/90">⚠ Watch out:</strong> {tool.warning}</p>}
                            {tool.skillGap && <p className="text-red-400/70 text-xs font-light"><strong>🔴 {tool.skillGap}</strong></p>}
                          </div>
                        </div>
                        <div className="relative z-10 w-full lg:w-40 flex flex-col justify-center gap-2.5 shrink-0">
                          <button 
                            onClick={() => { setToolApproval(id, true);  if (currentUser) logAction(currentUser.uid, "tool.approved",  { tool: tool.name }); }} 
                            className={`py-3 rounded-2xl border font-bold text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                              isApproved 
                                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.15)]" 
                                : "bg-white/[0.03] border-white/10 text-white/50 hover:text-white hover:border-white/25 hover:bg-white/5"
                            }`}
                          >
                            <ThumbsUp className="w-3.5 h-3.5" /> Approve
                          </button>
                          <button 
                            onClick={() => { setToolApproval(id, false); if (currentUser) logAction(currentUser.uid, "tool.rejected", { tool: tool.name }); }} 
                            className={`py-3 rounded-2xl border font-bold text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                              isRejected 
                                ? "bg-red-500/20 border-red-500/40 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.15)]" 
                                : "bg-white/[0.03] border-white/10 text-white/50 hover:text-white hover:border-white/25 hover:bg-white/5"
                            }`}
                          >
                            <ThumbsDown className="w-3.5 h-3.5" /> Reject
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}

                  {/* Static fallback tools */}
                  {!aiAnalysis && TOOLS.map((tool, i) => (
                    <motion.div 
                      key={tool.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                      className={`relative bg-[#040404] p-6 rounded-3xl border transition-all duration-300 ${
                        approvedTools[tool.id] === true ? "border-emerald-500/30 shadow-[0_0_25px_rgba(16,185,129,0.06)]" 
                        : approvedTools[tool.id] === false ? "border-red-500/20 opacity-50" 
                        : "border-white/8 hover:border-white/15"
                      } flex flex-col lg:flex-row gap-6`}
                    >
                      {approvedTools[tool.id] === true && <div className="absolute inset-0 bg-emerald-500/[0.03] pointer-events-none rounded-3xl" />}
                      <div className="relative z-10 flex-1 space-y-4">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-2xl ${tool.iconBg} flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(255,255,255,0.08)]`}>{tool.icon}</div>
                          <div>
                            <h3 className="text-white text-lg font-bold tracking-tight">{tool.name}</h3>
                            <div className="flex gap-2 mt-1.5 flex-wrap">
                              <span className="text-[9px] uppercase tracking-wider text-white/35 border border-white/8 px-2.5 py-0.5 rounded-full">{tool.category}</span>
                              {tool.compliance && (
                                <span className={`text-[9px] uppercase tracking-wider text-${tool.complianceColor}-400 border border-${tool.complianceColor}-500/25 px-2.5 py-0.5 rounded-full bg-${tool.complianceColor}-500/10 font-bold`}>{tool.compliance}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="p-4 bg-white/[0.025] rounded-2xl border border-white/8 space-y-2.5">
                          <div className="flex items-center gap-2 text-white/40 text-[10px] font-bold uppercase tracking-widest">
                            <Eye className="w-3.5 h-3.5" /> Why This Tool?
                          </div>
                          <p className="text-white/50 text-sm font-light leading-relaxed">{tool.why}</p>
                          {tool.warning  && <p className="text-yellow-400/70 text-xs font-light border-t border-white/5 pt-2"><strong className="text-yellow-400/90">⚠ Watch out:</strong> {tool.warning}</p>}
                          {tool.skillGap && <p className="text-red-400/70 text-xs font-light"><strong>🔴 {tool.skillGap}</strong></p>}
                        </div>
                      </div>
                      <div className="relative z-10 w-full lg:w-40 flex flex-col justify-center gap-2.5 shrink-0">
                        <button 
                          onClick={() => { setToolApproval(tool.id, true);  if (currentUser) logAction(currentUser.uid, "tool.approved",  { tool: tool.name }); }} 
                          className={`py-3 rounded-2xl border font-bold text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                            approvedTools[tool.id] === true 
                              ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.15)]" 
                              : "bg-white/[0.03] border-white/10 text-white/50 hover:text-white hover:border-white/25 hover:bg-white/5"
                          }`}
                        >
                          <ThumbsUp className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button 
                          onClick={() => { setToolApproval(tool.id, false); if (currentUser) logAction(currentUser.uid, "tool.rejected", { tool: tool.name }); }} 
                          className={`py-3 rounded-2xl border font-bold text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                            approvedTools[tool.id] === false 
                              ? "bg-red-500/20 border-red-500/40 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.15)]" 
                              : "bg-white/[0.03] border-white/10 text-white/50 hover:text-white hover:border-white/25 hover:bg-white/5"
                          }`}
                        >
                          <ThumbsDown className="w-3.5 h-3.5" /> Reject
                        </button>
                      </div>
                    </motion.div>
                  ))}

                  {allToolsDecided && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                      <div className="p-5 bg-gradient-to-r from-blue-500/8 to-transparent border border-blue-500/15 rounded-3xl flex items-start gap-4">
                        <div className="w-8 h-8 bg-blue-500/15 border border-blue-500/20 rounded-xl flex items-center justify-center shrink-0">
                          <Info className="w-4 h-4 text-blue-400" />
                        </div>
                        <p className="text-xs text-white/50 font-light leading-relaxed">All tools decided. <strong className="text-blue-300 font-bold">Review the AI Prompts tab</strong> before locking the plan.</p>
                      </div>
                    </motion.div>
                  )}
                </div>
              </motion.section>
            )}

            {/* PROMPTS TAB */}
            {activeTab === "prompts" && (
                <motion.section key="prompts" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.4 }} className="space-y-6">

                  {/* Header */}
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">AI Build Prompts</h2>
                      <p className="text-white/25 text-[10px] font-light mt-0.5">Version {version}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {aiPrompts && (
                        <span className="text-[9px] text-emerald-300 border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 rounded-full uppercase tracking-widest font-bold flex items-center gap-1.5">
                          <Check className="w-3 h-3" /> Generated for {project?.name ?? "Your Project"}
                        </span>
                      )}
                      <span className="text-[9px] text-blue-300 border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 rounded-full uppercase tracking-widest font-bold">
                        Architecture {version}
                      </span>
                    </div>
                  </div>

                  {/* Generate card */}
                  <div className={`relative overflow-hidden rounded-3xl border transition-all ${
                    aiPrompts ? "bg-[#040404] border-white/8" : "bg-[#040404] border-indigo-500/25 shadow-[0_0_40px_rgba(99,102,241,0.08)]"
                  }`}>
                    {!aiPrompts && <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />}
                    {!aiPrompts && <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />}
                    <div className="relative z-10 p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 text-2xl border ${
                        aiPrompts ? "bg-emerald-500/15 border-emerald-500/25" : "bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border-indigo-500/30"
                      }`}>
                        {promptsLoading ? "⏳" : aiPrompts ? "✅" : "🤖"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-black text-base tracking-tight">
                          {aiPrompts
                            ? `Prompts ready for "${project?.name ?? "your project"}"`
                            : `Generate Build Prompts for "${project?.name ?? "your project"}"`}
                        </h3>
                        <p className="text-white/35 text-xs mt-1 font-light leading-relaxed max-w-xl">
                          {aiPrompts
                            ? "6 website-building prompts — each one covers a specific page or feature. Follow them in order."
                            : "AI will analyze your project description, extract every page, feature, and component needed, then generate 6 complete build prompts specific enough for direct implementation."}
                        </p>

                        {promptsLoading && (
                          <div className="mt-4 flex items-center gap-2 text-indigo-300/90 text-[10px] font-bold uppercase tracking-wider">
                            <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                            Generating build prompts…
                          </div>
                        )}
                      </div>
                      <button
                        onClick={generateBuildPrompts}
                        disabled={promptsLoading}
                        className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 ${
                          promptsLoading
                            ? "bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 cursor-wait"
                            : aiPrompts
                            ? "border border-white/12 bg-white/[0.04] text-white/50 hover:text-white hover:bg-white/8"
                            : "bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-500 hover:to-purple-500 shadow-[0_0_30px_rgba(99,102,241,0.4)] hover:shadow-[0_0_50px_rgba(99,102,241,0.6)] hover:scale-[1.02]"
                        }`}
                      >
                        {promptsLoading
                          ? <><Loader2 className="w-4 h-4 animate-spin" /> Working...</>
                          : aiPrompts
                          ? <><RefreshCw className="w-4 h-4" /> Regenerate</>
                          : <><Sparkles className="w-4 h-4" /> Generate Prompts</>}
                      </button>
                    </div>
                  </div>

                  {/* Blueprint analysis result — shown after generation */}
                  {aiBlueprint && !promptsLoading && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden"
                    >
                      <div className="flex items-center gap-2 px-5 py-3 border-b border-white/5 bg-black/20">
                        <BookOpen className="w-4 h-4 text-indigo-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Project Blueprint — Extracted by AI</span>
                      </div>
                      <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                          { label: "Pages", items: aiBlueprint.pages,      color: "text-blue-400" },
                          { label: "Features", items: aiBlueprint.features, color: "text-purple-400" },
                          { label: "Data Models", items: aiBlueprint.dataModels, color: "text-emerald-400" },
                          { label: "User Roles",  items: aiBlueprint.userRoles,  color: "text-yellow-400" },
                        ].map(({ label, items, color }) => (
                          <div key={label}>
                            <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">{label}</p>
                            <ul className="space-y-1">
                              {items.slice(0, 5).map((item, i) => (
                                <li key={i} className={`text-[11px] font-medium ${color} flex items-center gap-1.5`}>
                                  <span className="w-1 h-1 rounded-full bg-current opacity-60 shrink-0" />
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-4 px-5 py-3 border-t border-white/5 bg-black/10">
                        <span className="text-[10px] text-white/30">Primary action: <strong className="text-white/60">{aiBlueprint.primaryAction}</strong></span>
                        <span className="text-[10px] text-white/30">Brand tone: <strong className="text-white/60">{aiBlueprint.brandTone}</strong></span>
                      </div>
                    </motion.div>
                  )}

                  {/* Error state */}
                  {promptsError && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                      <p className="text-xs text-red-300 font-light">{promptsError}</p>
                    </div>
                  )}

                  {/* Empty state */}
                  {!aiPrompts && !promptsLoading && (
                    <motion.div 
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col items-center justify-center gap-6 py-24 border border-dashed border-white/8 rounded-3xl bg-[#040404]"
                    >
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/15 to-purple-500/15 border border-indigo-500/20 flex items-center justify-center text-3xl">
                        📋
                      </div>
                      <div className="text-center space-y-2 max-w-sm">
                        <p className="text-white/60 font-bold text-sm tracking-tight">Your AI prompts will appear here</p>
                        <p className="text-white/25 text-xs font-light leading-relaxed">
                          Prompts are generated automatically with your architecture plan after requirements are complete. You can also run &ldquo;Generate Prompts&rdquo; above to refresh them.
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {/* Loading skeleton */}
                  {promptsLoading && (
                    <div className="space-y-4">
                      {[1,2,3,4,5,6].map(i => (
                        <div key={i} className="rounded-2xl border border-white/8 overflow-hidden animate-pulse">
                          <div className="flex items-center gap-4 p-5 border-b border-white/5">
                            <div className="w-11 h-11 rounded-xl bg-white/8" />
                            <div className="flex-1 space-y-2">
                              <div className="h-3 bg-white/8 rounded w-1/3" />
                              <div className="h-2.5 bg-white/5 rounded w-1/2" />
                            </div>
                          </div>
                          <div className="p-5 space-y-2">
                            <div className="h-2.5 bg-white/5 rounded w-full" />
                            <div className="h-2.5 bg-white/5 rounded w-5/6" />
                            <div className="h-2.5 bg-white/5 rounded w-4/6" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* AI-generated prompt cards */}
                  {aiPrompts && !promptsLoading && (
                    <div className="space-y-4">
                      {/* Section label */}
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-white/8" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">
                          6 prompts · build &ldquo;{project?.name ?? 'your project'}&rdquo; from start to finish
                        </span>
                        <div className="flex-1 h-px bg-white/8" />
                      </div>

                      {aiPrompts.map((p, idx) => (
                        <motion.div
                          key={p.phase}
                          initial={{ opacity: 0, y: 14 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.06 }}
                          className={`rounded-2xl border overflow-hidden ${PROMPT_PHASE_COLORS[p.color] ?? PROMPT_PHASE_COLORS.indigo}`}
                        >
                          {/* Header */}
                          <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-white/5 bg-black/10">
                            <div className="flex items-start gap-3">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 mt-0.5 border ${PROMPT_PHASE_COLORS[p.color]?.includes("indigo") ? "bg-indigo-500/15 border-indigo-500/25" : PROMPT_PHASE_COLORS[p.color]?.includes("blue") ? "bg-blue-500/15 border-blue-500/25" : "bg-white/5 border-white/10"}`}>
                                {p.icon}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border shrink-0 ${PROMPT_PHASE_BADGE[p.color] ?? PROMPT_PHASE_BADGE.indigo}`}>
                                    {p.phase}
                                  </span>
                                  <h3 className="text-white font-black text-sm leading-tight">{p.title}</h3>
                                </div>
                                <p className="text-[11px] text-white/40 mt-1 font-light leading-relaxed max-w-2xl">{p.desc}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="flex flex-col items-end gap-1">
                                <span className="text-[9px] font-bold text-white/25 whitespace-nowrap">
                                  ~{p.prompt.split(/\s+/).length} words
                                </span>
                                <span className="text-[9px] border border-white/10 bg-white/5 px-2 py-0.5 rounded text-white/35 hidden sm:block whitespace-nowrap">
                                  {p.target}
                                </span>
                              </div>
                              <CopyButton text={p.prompt} />
                            </div>
                          </div>

                          {/* Prompt body */}
                          <div className="relative">
                            <pre className="p-5 text-[11.5px] text-white/70 leading-[1.75] overflow-x-auto font-mono whitespace-pre-wrap bg-black/25 max-h-[520px] overflow-y-auto">
                              {p.prompt}
                            </pre>
                            {/* Paste hint */}
                            <div className="flex items-center justify-between px-5 py-2.5 bg-black/30 border-t border-white/5">
                              <span className="text-[9px] text-white/20 uppercase tracking-widest font-bold">Paste into {p.target}</span>
                              <CopyButton text={p.prompt} />
                            </div>
                          </div>
                        </motion.div>
                      ))}

                      {/* Tip */}
                      <div className="p-4 bg-yellow-500/5 border border-yellow-500/15 rounded-2xl flex items-start gap-3">
                        <Zap className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-white/45 leading-relaxed font-light">
                          <strong className="text-white">How to use:</strong> Open your editor or AI coding assistant, paste Prompt 1 and implement it fully before moving to Prompt 2. Add{" "}
                          <code className="text-yellow-400 bg-yellow-500/10 px-1 rounded">@codebase</code> in Cursor so the AI sees your existing code. By Prompt 6 your complete website is built.
                        </p>
                      </div>
                    </div>
                  )}
                </motion.section>
            )}

            {/* CONFIGURATIONS TAB */}
            {activeTab === "config" && (() => {
              const approvedToolIds = TOOLS.filter(t => approvedTools[t.id] !== false).map(t => t.id);
              // Always show Vercel + Supabase; add others based on approved tools
              const relevantIds = Array.from(new Set([
                "vercel", "supabase",
                ...approvedToolIds,
                "brevo", // transactional email (hire invites, notifications)
              ]));
              const services = CONFIG_SERVICES.filter(s => relevantIds.includes(s.id));
              const allEnvBlock = services.map(s =>
                `# ${s.name} — ${s.category}\n${s.envBlock}`
              ).join("\n\n");

              return (
                <motion.section key="config" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.4 }} className="space-y-6">

                  {/* Header */}
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Project Configurations</h2>
                      <p className="text-white/25 text-[10px] font-light mt-0.5">Environment variables & service setup</p>
                    </div>
                    <span className="text-[9px] text-emerald-300 border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 rounded-full uppercase tracking-widest font-bold flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {services.length} Services Required
                    </span>
                  </div>

                  {/* Banner */}
                  <div className="p-5 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-2xl flex items-start gap-4">
                    <Settings className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-white">Everything you need to configure for <span className="text-emerald-400">{project?.name ?? "your project"}</span></p>
                      <p className="text-xs text-white/50 font-light">
                        For each service: click the direct link to get your API key, copy the setup code, and add the environment variables to your <code className="text-emerald-400 bg-emerald-500/10 px-1 rounded">.env.local</code> file.
                      </p>
                    </div>
                  </div>

                  {/* Combined .env.local block */}
                  <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 bg-black/30">
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                          <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                        </div>
                        <span className="text-[10px] text-white/40 font-mono">.env.local</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-yellow-400 border border-yellow-500/20 bg-yellow-500/10 px-2 py-0.5 rounded uppercase tracking-widest font-bold">Never commit</span>
                        <CopyButton text={allEnvBlock} />
                      </div>
                    </div>
                    <pre className="p-5 text-[11px] text-emerald-300/80 font-mono leading-relaxed overflow-x-auto bg-[#0a0a0a] max-h-64 overflow-y-auto whitespace-pre">
                      {allEnvBlock}
                    </pre>
                  </div>

                  {/* Service cards */}
                  <div className="space-y-4">
                    {services.map((svc, idx) => {
                      const isOpen = !!expandedServices[svc.id];
                      return (
                        <motion.div
                          key={svc.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.06 }}
                          className="glass-panel rounded-2xl border border-white/10 overflow-hidden"
                        >
                          {/* Card header — always visible */}
                          <div className="flex items-center justify-between p-5">
                            <div className="flex items-center gap-4">
                              <div className={`w-2 h-10 rounded-full ${svc.dot}`} />
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="text-white font-black text-sm">{svc.name}</h3>
                                  <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${svc.color}`}>
                                    {svc.category}
                                  </span>
                                </div>
                                <p className="text-[11px] text-white/40 mt-0.5 font-light">{svc.tagline}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {/* Direct link to get API key */}
                              <a
                                href={svc.getKeyUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                              >
                                <KeyRound className="w-3 h-3" /> Get API Key
                              </a>
                              <a
                                href={svc.dashboardUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/10 bg-white/5 text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                              >
                                <Globe className="w-3 h-3" /> Dashboard
                              </a>
                              <button
                                onClick={() => setExpandedServices(prev => ({ ...prev, [svc.id]: !prev[svc.id] }))}
                                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-colors"
                              >
                                {isOpen ? <ChevronUp className="w-4 h-4 text-white/50" /> : <ChevronDown className="w-4 h-4 text-white/50" />}
                              </button>
                            </div>
                          </div>

                          {/* Expanded detail */}
                          <AnimatePresence initial={false}>
                            {isOpen && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25 }}
                                className="overflow-hidden"
                              >
                                <div className="border-t border-white/5 grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-white/5">

                                  {/* Left: Setup steps */}
                                  <div className="p-5 space-y-4">
                                    <div className="flex items-center gap-2">
                                      <Server className="w-4 h-4 text-white/40" />
                                      <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Step-by-Step Setup</span>
                                    </div>
                                    <ol className="space-y-3">
                                      {svc.steps.map((step, i) => (
                                        <li key={i} className="flex items-start gap-3">
                                          <span className="w-5 h-5 rounded-full bg-white/8 border border-white/10 text-[10px] font-bold text-white/50 flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                                          <span className="text-xs text-white/60 leading-relaxed font-light">{step}</span>
                                        </li>
                                      ))}
                                    </ol>
                                    <div className="flex gap-2 pt-2">
                                      <a
                                        href={svc.docsUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors"
                                      >
                                        <BookOpen className="w-3 h-3" /> Official Docs <ExternalLink className="w-2.5 h-2.5" />
                                      </a>
                                    </div>
                                  </div>

                                  {/* Right: Code snippet + env block */}
                                  <div className="p-5 space-y-4">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <Package className="w-4 h-4 text-white/40" />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Install & Init</span>
                                      </div>
                                      <CopyButton text={svc.snippet} />
                                    </div>
                                    <pre className="text-[11px] text-emerald-300/80 font-mono leading-relaxed p-4 bg-[#0a0a0a] rounded-xl border border-white/5 overflow-x-auto whitespace-pre">
                                      {svc.snippet}
                                    </pre>

                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <ShieldCheck className="w-4 h-4 text-white/40" />
                                          <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Environment Variables</span>
                                        </div>
                                        <CopyButton text={svc.envBlock} />
                                      </div>
                                      <pre className="text-[11px] text-yellow-300/70 font-mono p-4 bg-[#0a0a0a] rounded-xl border border-yellow-500/10 overflow-x-auto whitespace-pre">
                                        {svc.envBlock}
                                      </pre>
                                    </div>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Security tip */}
                  <div className="p-4 bg-yellow-500/5 border border-yellow-500/15 rounded-2xl flex items-start gap-3">
                    <ShieldAlert className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-white/50 leading-relaxed font-light">
                      <strong className="text-yellow-400">Security reminder:</strong> Never commit <code className="text-yellow-300 bg-yellow-500/10 px-1 rounded">.env.local</code> to git. Add it to <code className="text-white/60 bg-white/5 px-1 rounded">.gitignore</code>. Keys prefixed with <code className="text-yellow-300 bg-yellow-500/10 px-1 rounded">NEXT_PUBLIC_</code> are exposed to the browser — only use them for non-sensitive config.
                    </p>
                  </div>
                </motion.section>
              );
            })()}

            {/* UI/UX CODE TAB */}
            {activeTab === "code" && (
              <motion.section key="code" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">

                {/* Header */}
                <div className="flex items-center justify-between">
                  <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">AI-Generated UI/UX Code</h2>
                  <div className="flex items-center gap-2 text-[10px] text-purple-400 border border-purple-500/20 bg-purple-500/10 px-3 py-1 rounded-full uppercase tracking-widest font-bold">
                    <Sparkles className="w-3 h-3" /> BuildCraft AI
                  </div>
                </div>

                <div className="p-5 bg-purple-500/5 border border-purple-500/10 rounded-2xl flex items-start gap-4">
                  <Code2 className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-white/70 font-light leading-relaxed">
                      <strong className="text-purple-400">Real AI code generation for your project.</strong> Each component is generated by BuildCraft AI and tailored to <strong className="text-white">{project?.name ?? "your app"}</strong> using React + TypeScript + Tailwind CSS. Copy the code directly into your project.
                    </p>
                  </div>
                </div>

                {/* Structured UI JSON → validated → live React preview (orchestration brain) */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="relative overflow-hidden rounded-3xl border border-teal-500/25 bg-gradient-to-br from-teal-500/[0.07] via-[#060606] to-cyan-500/[0.05] p-6 sm:p-7"
                >
                  <div className="pointer-events-none absolute -right-20 top-0 h-48 w-48 rounded-full bg-teal-500/10 blur-3xl" />
                  <div className="relative z-10 space-y-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-teal-500/30 bg-teal-500/10">
                          <LayoutGrid className="h-6 w-6 text-teal-400" />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-black tracking-tight text-white">Structured UI JSON</h3>
                            <span className="rounded-full border border-teal-500/25 bg-teal-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-teal-200">
                              Idea → AI → JSON → React
                            </span>
                          </div>
                          <p className="mt-1 max-w-2xl text-xs font-light leading-relaxed text-white/45">
                            Describe any screen in plain language. The orchestration layer returns <strong className="text-white/70">validated JSON</strong> only
                            (input, button, card, navbar, list, form), then this page renders it live — edit your prompt and regenerate to iterate.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <div className="min-w-0 flex-1">
                        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-white/35">
                          What should this screen look like?
                        </label>
                        <textarea
                          value={uiJsonPrompt}
                          onChange={(e) => setUiJsonPrompt(e.target.value)}
                          placeholder='e.g. "Create a signup page with email, password, and a primary CTA"'
                          rows={3}
                          className="w-full resize-y rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white/90 placeholder:text-white/25 outline-none focus:border-teal-500/40 focus:ring-1 focus:ring-teal-500/20"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={generateUiJsonScreen}
                        disabled={uiJsonLoading}
                        className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-teal-500/15 transition-all hover:from-teal-500 hover:to-cyan-500 disabled:cursor-wait disabled:opacity-60"
                      >
                        {uiJsonLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Generating…
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4" /> Generate live UI
                          </>
                        )}
                      </button>
                    </div>

                    {uiJsonError && (
                      <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        {uiJsonError}
                      </div>
                    )}

                    {uiJsonVersions.length > 1 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-white/30">Versions</span>
                        {uiJsonVersions.slice(0, 5).map((v, i) => (
                          <button
                            key={v.savedAt}
                            type="button"
                            onClick={() => setUiJsonScreen(v.ui)}
                            className={`rounded-lg border px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                              uiJsonScreen === v.ui
                                ? "border-teal-500/50 bg-teal-500/15 text-teal-200"
                                : "border-white/10 bg-white/5 text-white/45 hover:border-white/20"
                            }`}
                          >
                            v{uiJsonVersions.length - i}
                          </button>
                        ))}
                      </div>
                    )}

                    {uiJsonScreen && (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setUiJsonShowRaw((x) => !x)}
                            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white/50 hover:text-white"
                          >
                            {uiJsonShowRaw ? "Hide JSON" : "View JSON"}
                          </button>
                          <CopyButton text={JSON.stringify(uiJsonScreen, null, 2)} />
                        </div>
                        {uiJsonShowRaw && (
                          <pre className="max-h-56 overflow-auto rounded-xl border border-white/10 bg-black/60 p-4 text-[11px] leading-relaxed text-emerald-300/80">
                            {JSON.stringify(uiJsonScreen, null, 2)}
                          </pre>
                        )}
                        <DynamicUIRenderer ui={uiJsonScreen} />
                      </div>
                    )}
                  </div>
                </motion.div>

                {(codeError || previewError) && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                    <p className="text-xs text-red-300 font-light">{codeError ?? previewError}</p>
                  </div>
                )}

                {/* ── Generate Full Project UI with Stitch ─────────────── */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass-panel rounded-2xl border border-purple-500/25 overflow-hidden bg-gradient-to-br from-purple-500/5 to-indigo-500/5"
                >
                  {/* Card header */}
                  <div className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/30 flex items-center justify-center shrink-0">
                          <Wand2 className="w-7 h-7 text-purple-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-white font-black text-lg tracking-tight">Generate Landing Page UI</h3>
                            <span className="text-[9px] text-purple-400 border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 rounded-full uppercase tracking-widest font-bold">
                              {stitchResult?.palette ?? "Auto palette"} · {stitchResult?.visualVariant ?? "premium"} · BuildCraft AI
                            </span>
                          </div>
                          <p className="text-white/50 text-sm mt-1 font-light">
                            AI designs a complete, interactive HTML UI for <strong className="text-white/80">{project?.name ?? "your project"}</strong> — render it live in a preview frame.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Action row */}
                    <div className="flex gap-3 mt-5 flex-wrap">
                      <button
                        onClick={generateFullUI}
                        disabled={stitchStep > 0 && stitchStep < 4}
                        className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                          stitchStep > 0 && stitchStep < 4
                            ? "bg-purple-500/10 border border-purple-500/20 text-purple-400 cursor-wait"
                            : "bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500 shadow-lg shadow-purple-500/20"
                        }`}
                      >
                        {stitchStep > 0 && stitchStep < 4 ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Generating... {stitchElapsed}s</>
                        ) : stitchResult ? (
                          <><RefreshCw className="w-4 h-4" /> Regenerate Landing Page</>
                        ) : (
                          <><Sparkles className="w-4 h-4" /> Generate Landing Page UI</>
                        )}
                      </button>

                      {stitchResult && (
                        <>
                          <button
                            onClick={() => setStitchShowSource((v) => !v)}
                            className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-widest glass-panel border border-white/10 text-white/60 hover:text-white transition-all"
                          >
                            <Code2 className="w-4 h-4" />
                            {stitchShowSource ? "Hide Source" : "View HTML"}
                          </button>
                          <button
                            onClick={() => setStitchFullscreen(true)}
                            className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-widest glass-panel border border-white/10 text-white/60 hover:text-white transition-all"
                          >
                            <Monitor className="w-4 h-4" /> Fullscreen
                          </button>
                          <CopyButton text={stitchResult.html} />
                        </>
                      )}
                    </div>

                    {stitchError && (
                      <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-red-300 font-light">{stitchError}</p>
                      </div>
                    )}
                  </div>

                  {/* Loading state */}
                  <AnimatePresence>
                    {stitchStep > 0 && stitchStep < 4 && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t border-purple-500/10"
                      >
                        <div className="flex flex-col items-center justify-center gap-4 py-14 px-6 bg-black/20">
                          <div className="relative w-16 h-16">
                            <div className="absolute inset-0 rounded-full border-2 border-purple-500/20 animate-ping" />
                            <div className="absolute inset-0 rounded-full border-2 border-purple-400/60 animate-spin border-t-transparent" />
                            <Wand2 className="absolute inset-0 m-auto w-7 h-7 text-purple-400" />
                          </div>
                          <div className="text-center space-y-1">
                            <p className="text-sm text-white/70 font-medium">Generating your landing page UI...</p>
                            <p className="text-[10px] text-white/30 uppercase tracking-widest">{stitchElapsed}s · usually under ~2 min; retries automatically on slow responses</p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Live iframe preview */}
                  <AnimatePresence>
                    {stitchResult && stitchStep === 4 && !stitchShowSource && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t border-purple-500/15"
                      >
                        {/* Browser chrome */}
                        <div className="flex items-center justify-between px-4 py-2.5 bg-black/50 border-b border-white/5">
                          <div className="flex items-center gap-2">
                            <div className="flex gap-1.5">
                              <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                              <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                            </div>
                            <div className="ml-2 flex-1 max-w-xs bg-white/5 border border-white/10 rounded-md px-3 py-1 text-[10px] text-white/30 font-mono">
                              {project?.name?.toLowerCase().replace(/\s+/g, "-") ?? "my-app"}.buildcraft.preview
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-purple-400 border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 rounded uppercase tracking-widest font-bold">
                              Live · Stitch
                            </span>
                            <button onClick={() => setStitchFullscreen(true)} className="text-white/30 hover:text-white transition-colors">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <iframe
                          srcDoc={stitchResult.html}
                          sandbox="allow-scripts allow-same-origin"
                          className="w-full bg-white"
                          style={{ height: "600px", border: "none" }}
                          title={`${project?.name ?? "Project"} UI Preview`}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* HTML source viewer */}
                  <AnimatePresence>
                    {stitchResult && stitchStep === 4 && stitchShowSource && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t border-purple-500/15"
                      >
                        <div className="flex items-center justify-between px-5 py-3 bg-black/40 border-b border-white/5">
                          <div className="flex items-center gap-2">
                            <div className="flex gap-1.5">
                              <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                              <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                            </div>
                            <span className="text-[10px] text-white/30 font-mono ml-2">
                              {project?.name?.toLowerCase().replace(/\s+/g, "-") ?? "app"}-ui.html
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-purple-400 border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 rounded uppercase tracking-widest font-bold">HTML · Stitch</span>
                            <CopyButton text={stitchResult.html} />
                          </div>
                        </div>
                        <pre className="p-5 text-[11px] text-emerald-300/80 leading-relaxed overflow-x-auto font-mono whitespace-pre-wrap bg-[#0a0a0a] max-h-[500px] overflow-y-auto">
                          <code>{stitchResult.html}</code>
                        </pre>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>

                {/* Fullscreen modal */}
                <AnimatePresence>
                  {stitchFullscreen && stitchResult && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col"
                    >
                      {/* Fullscreen toolbar */}
                      <div className="flex items-center justify-between px-6 py-3 bg-black/80 border-b border-white/10 shrink-0">
                        <div className="flex items-center gap-3">
                          <div className="flex gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-red-500/70" />
                            <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
                            <div className="w-3 h-3 rounded-full bg-green-500/70" />
                          </div>
                          <div className="ml-2 bg-white/5 border border-white/10 rounded-md px-4 py-1.5 text-xs text-white/40 font-mono">
                            {project?.name?.toLowerCase().replace(/\s+/g, "-") ?? "my-app"}.buildcraft.preview
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-purple-400 border border-purple-500/20 bg-purple-500/10 px-3 py-1 rounded-full uppercase tracking-widest font-bold">
                            {stitchResult?.palette ?? "Auto palette"} · {stitchResult?.visualVariant ?? "premium"} · BuildCraft AI
                          </span>
                          <button
                            onClick={() => setStitchFullscreen(false)}
                            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                          >
                            <X className="w-4 h-4 text-white" />
                          </button>
                        </div>
                      </div>
                      {/* Full iframe */}
                      <iframe
                        srcDoc={stitchResult.html}
                        sandbox="allow-scripts allow-same-origin"
                        className="flex-1 w-full bg-white"
                        style={{ border: "none" }}
                        title="Fullscreen UI Preview"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Component Template Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
                  {COMPONENT_TEMPLATES.map((tmpl, cardIdx) => {
                    const isGenerating  = generatingId  === tmpl.id;
                    const isPreviewing  = previewingId  === tmpl.id;
                    const generated     = generatedCodes[tmpl.id];
                    const preview       = generatedPreviews[tmpl.id];
                    const cls           = colorMap[tmpl.color] ?? colorMap.blue;

                    return (
                      <motion.div
                        key={tmpl.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: cardIdx * 0.05 }}
                        className="glass-panel rounded-2xl border border-white/10 overflow-hidden"
                      >
                        {/* ── Card header ── */}
                        <div className="p-5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${cls}`}>
                                {tmpl.icon}
                              </div>
                              <div>
                                <h3 className="text-white font-bold text-sm">{tmpl.label}</h3>
                                <p className="text-[#888] text-[10px] font-light mt-0.5">{tmpl.desc}</p>
                              </div>
                            </div>
                            {generated && (
                              <button
                                onClick={() => toggleExpand(tmpl.id)}
                                className="text-white/40 hover:text-white transition-colors shrink-0"
                              >
                                {generated.expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            )}
                          </div>

                          {/* Action buttons row */}
                          <div className="flex gap-2 mt-4 flex-wrap">
                            {/* Code button */}
                            <button
                              onClick={() => generateCode(tmpl)}
                              disabled={isGenerating}
                              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                                isGenerating
                                  ? "bg-purple-500/10 border border-purple-500/20 text-purple-400 cursor-wait"
                                  : "silver-gradient text-black hover:shadow-[0_0_20px_rgba(255,255,255,0.15)]"
                              }`}
                            >
                              {isGenerating ? (
                                <><Loader2 className="w-3 h-3 animate-spin" /> Generating...</>
                              ) : generated ? (
                                <><RefreshCw className="w-3 h-3" /> Regenerate</>
                              ) : (
                                <><Sparkles className="w-3 h-3" /> Generate Code</>
                              )}
                            </button>

                            {generated && <CopyButton text={generated.code} />}
                          </div>
                        </div>

                        {/* ── AI HTML Preview ── */}
                        <AnimatePresence>
                          {(isPreviewing || preview) && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.35 }}
                              className="overflow-hidden border-t border-white/10"
                            >
                              {isPreviewing && !preview && (
                                <div className="flex flex-col items-center justify-center gap-3 py-12 bg-black/30">
                                  <div className="relative w-12 h-12">
                                    <div className="absolute inset-0 rounded-full border-2 border-pink-500/30 animate-ping" />
                                    <div className="absolute inset-0 rounded-full border-2 border-pink-500/60 animate-spin border-t-transparent" />
                                    <Monitor className="absolute inset-0 m-auto w-5 h-5 text-pink-400" />
                                  </div>
                                  <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Building UI preview...</p>
                                  <p className="text-[9px] text-white/20">Typically ~5–15 seconds</p>
                                </div>
                              )}

                              {preview && (
                                <div className="relative group bg-black/50">
                                  {/* Preview toolbar */}
                                  <div className="flex items-center justify-between px-4 py-2 bg-black/70 border-b border-white/5">
                                    <div className="flex items-center gap-2">
                                      <div className="flex gap-1">
                                        <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                                        <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                                      </div>
                                      <div className="flex items-center gap-1.5 ml-1">
                                        <div className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse" />
                                        <span className="text-[9px] text-white/35 uppercase tracking-widest font-bold">BuildCraft AI</span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      {/* Minimize toggle */}
                                      <button
                                        onClick={() => setPreviewCollapsed((prev) => ({ ...prev, [tmpl.id]: !prev[tmpl.id] }))}
                                        title={previewCollapsed[tmpl.id] ? "Expand preview" : "Collapse preview"}
                                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-colors"
                                      >
                                        {previewCollapsed[tmpl.id]
                                          ? <ChevronDown className="w-3.5 h-3.5 text-white/50" />
                                          : <ChevronUp className="w-3.5 h-3.5 text-white/50" />}
                                      </button>
                                      {/* Fullscreen */}
                                      <button
                                        onClick={() => setPreviewFullscreenId(tmpl.id)}
                                        title="Open fullscreen"
                                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-purple-500/20 border border-white/10 hover:border-purple-500/30 flex items-center justify-center transition-colors"
                                      >
                                        <Monitor className="w-3.5 h-3.5 text-white/50 hover:text-purple-400" />
                                      </button>
                                    </div>
                                  </div>
                                  {/* Iframe — collapsible */}
                                  <AnimatePresence initial={false}>
                                    {!previewCollapsed[tmpl.id] && (
                                      <motion.div
                                        initial={{ height: 0 }}
                                        animate={{ height: "auto" }}
                                        exit={{ height: 0 }}
                                        transition={{ duration: 0.25 }}
                                        className="overflow-hidden"
                                      >
                                        <div className="relative" style={{ paddingBottom: "56.25%" }}>
                                          <iframe
                                            srcDoc={preview.html}
                                            title={`Preview of ${tmpl.label}`}
                                            className="absolute inset-0 w-full h-full border-0 pointer-events-none"
                                            sandbox="allow-scripts allow-same-origin"
                                          />
                                          {/* Hover CTA */}
                                          <div className="absolute inset-0 bg-transparent hover:bg-black/20 transition-colors flex items-end justify-end p-3 opacity-0 group-hover:opacity-100">
                                            <button
                                              onClick={() => setPreviewFullscreenId(tmpl.id)}
                                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/80 backdrop-blur text-[10px] text-white/80 border border-white/15 hover:bg-purple-500/20 hover:border-purple-500/30 transition-colors"
                                            >
                                              <ExternalLink className="w-3 h-3" /> Fullscreen
                                            </button>
                                          </div>
                                        </div>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                  {previewCollapsed[tmpl.id] && (
                                    <div className="px-4 py-2.5 bg-black/40">
                                      <span className="text-[10px] text-white/30 italic">Preview collapsed — click ▼ to expand</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* ── Generated Code Block ── */}
                        <AnimatePresence>
                          {generated && generated.expanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3 }}
                              className="overflow-hidden"
                            >
                              <div className="border-t border-white/10">
                                <div className="flex items-center justify-between px-5 py-3 bg-black/40 border-b border-white/5">
                                  <div className="flex items-center gap-2">
                                    <div className="flex gap-1.5">
                                      <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                                      <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                                      <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                                    </div>
                                    <span className="text-[10px] text-white/30 font-mono ml-2">{tmpl.label.toLowerCase().replace(/\s+/g, "-")}.tsx</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[9px] text-purple-400 border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 rounded uppercase tracking-widest font-bold">React + TSX</span>
                                    <CopyButton text={generated.code} />
                                  </div>
                                </div>
                                <pre className="p-5 text-[11px] text-emerald-300/80 leading-relaxed overflow-x-auto font-mono whitespace-pre-wrap bg-[#0a0a0a] max-h-[500px] overflow-y-auto">
                                  <code>{generated.code}</code>
                                </pre>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* Fullscreen handled globally below */}
                      </motion.div>
                    );
                  })}
                </div>

                {/* ── Global component preview fullscreen modal ── */}
                <AnimatePresence>
                  {previewFullscreenId && generatedPreviews[previewFullscreenId] && (
                    <motion.div
                      key="preview-fs"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-xl flex flex-col"
                    >
                      {/* Toolbar */}
                      <div className="flex items-center justify-between px-5 py-3 bg-black/80 border-b border-white/10 shrink-0">
                        <div className="flex items-center gap-3">
                          <div className="flex gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-red-500/70" />
                            <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
                            <div className="w-3 h-3 rounded-full bg-green-500/70" />
                          </div>
                          <div className="ml-1 bg-white/5 border border-white/10 rounded-md px-4 py-1.5 text-xs text-white/40 font-mono">
                            {COMPONENT_TEMPLATES.find(t => t.id === previewFullscreenId)?.label ?? previewFullscreenId} — Live Preview
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-purple-400 border border-purple-500/20 bg-purple-500/10 px-3 py-1 rounded-full uppercase tracking-widest font-bold">
                            BuildCraft AI
                          </span>
                          <button
                            onClick={() => setPreviewFullscreenId(null)}
                            className="w-8 h-8 rounded-full bg-white/10 hover:bg-red-500/20 hover:border-red-500/30 border border-white/10 flex items-center justify-center transition-colors"
                            title="Close fullscreen"
                          >
                            <X className="w-4 h-4 text-white" />
                          </button>
                        </div>
                      </div>
                      <iframe
                        srcDoc={generatedPreviews[previewFullscreenId].html}
                        title="Fullscreen component preview"
                        className="flex-1 w-full border-0"
                        sandbox="allow-scripts allow-same-origin"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Usage note */}
                <div className="p-5 bg-white/5 border border-white/10 rounded-2xl flex items-start gap-4">
                  <Info className="w-5 h-5 text-white/40 shrink-0 mt-0.5" />
                  <p className="text-xs text-white/50 font-light leading-relaxed">
                    Generated code uses <strong className="text-white">React 18 + TypeScript + Tailwind CSS + Lucide Icons + Framer Motion</strong>. Copy any component into your <code className="text-purple-400 bg-purple-500/10 px-1 rounded">src/components/</code> folder and import it. Each component is tailored to your <strong className="text-white">{project?.name ?? "project"}</strong> context.
                  </p>
                </div>
              </motion.section>
            )}

          </AnimatePresence>

          {/* ── Developer Hiring Path ──────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="p-6 bg-gradient-to-r from-indigo-500/8 to-blue-500/5 border border-indigo-500/20 rounded-2xl space-y-4"
          >
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-indigo-400" />
              <div>
                <span className="text-sm font-bold text-white">Developer Hiring Workflow</span>
                <span className="ml-2 text-[9px] uppercase tracking-widest text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">Available after plan lock</span>
              </div>
            </div>
            <p className="text-[#888] text-xs font-light leading-relaxed">
              Once you lock your technical plan, the <strong className="text-white">Project Workspace</strong> unlocks with:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { icon: "🤖", label: "AI Developer Matching", desc: "Ranked list of developers matched to your project requirements." },
                { icon: "📩", label: "Hire Request Emails",   desc: "Send invitation emails with accept/decline links in one click." },
                { icon: "📄", label: "Auto-Generated PRD",    desc: "AI writes your Project Requirement Document after acceptance." },
                { icon: "💬", label: "Real-Time Chat",        desc: "Chat with Developer and Chat with Client sections activated." },
              ].map(f => (
                <div key={f.label} className="group relative flex items-start gap-4 p-4 rounded-2xl bg-gradient-to-br from-[#111] to-[#080808] border border-white/5 hover:border-indigo-500/30 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(79,70,229,0.15)] overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-lg shadow-inner transition-transform duration-300 group-hover:scale-110 group-hover:border-indigo-500/30 group-hover:bg-indigo-500/10 group-hover:shadow-[0_0_15px_rgba(79,70,229,0.3)]">
                    {f.icon}
                  </div>
                  <div className="relative z-10 pt-0.5">
                    <p className="text-white text-xs font-black tracking-wide group-hover:text-indigo-300 transition-colors">{f.label}</p>
                    <p className="text-[#888] text-[10px] font-medium mt-1 leading-relaxed group-hover:text-white/60 transition-colors">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            {project?.locked ? (
              <button
                onClick={() => router.push("/project-room?tab=talent")}
                className="w-full py-3 bg-indigo-500 hover:bg-indigo-400 text-white font-bold uppercase tracking-widest text-xs rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <Users className="w-4 h-4" /> Go to Developer Matching →
              </button>
            ) : (
              <p className="text-[10px] text-white/30 font-light text-center">Lock the technical plan below to activate the Project Workspace and developer hiring.</p>
            )}
          </motion.div>

          {/* Lock Plan CTA — always visible so users can find it; disabled until requirements met */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-6 border-t border-white/10 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 flex items-center gap-2">
                <Lock className="w-3.5 h-3.5" /> Finalize plan
              </h3>
              {!allToolsDecided && (
                <button
                  type="button"
                  onClick={() => setActiveTab("tools")}
                  className="text-[10px] font-bold uppercase tracking-widest text-amber-400 hover:text-amber-300"
                >
                  Go to Tools tab →
                </button>
              )}
            </div>
            {!allToolsDecided && (
              <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-white/70 font-light leading-relaxed">
                  To unlock <strong className="text-white">Lock technical plan</strong>, open the <button type="button" onClick={() => setActiveTab("tools")} className="text-amber-400 font-bold underline">Tools</button> tab and tap <strong className="text-white">Approve</strong> or <strong className="text-white">Reject</strong> on{" "}
                  <strong className="text-white">every</strong> recommended tool ({decidedCount} of {effectiveToolIds.length} decided).
                </p>
              </div>
            )}
            {allToolsDecided && !promptsViewed && (
              <div className="p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-xl flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0" />
                <p className="text-xs text-white/70 font-light">
                  Open the <button type="button" onClick={() => { setActiveTab("prompts"); setPromptsViewed(true); }} className="text-yellow-400 font-bold underline">AI Prompts</button> tab once (required before lock).
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={handleLockAndProceed}
              disabled={!canProceed}
              className={`w-full flex items-center justify-center gap-2 py-5 font-black uppercase tracking-[0.2em] text-xs transition-all rounded-xl ${canProceed ? "silver-gradient text-black silver-glow" : "glass-panel text-white/20 cursor-not-allowed"}`}
            >
              <Lock className="w-4 h-4" /> Lock Technical Plan {version} & Open Project Workspace <ArrowRight className="w-5 h-5" />
            </button>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
