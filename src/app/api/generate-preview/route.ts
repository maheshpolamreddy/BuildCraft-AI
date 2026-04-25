import { NextRequest } from "next/server";
import { getNimClient } from "@/lib/nim-client";
import { orchestrateChatCompletion } from "@/lib/ai-orchestrator";
import { readJsonBody } from "@/lib/read-json-body";
import { MAX_TOKENS_GENERATE_PREVIEW } from "@/lib/ai-limits";
import { isCompactServerlessAiChain } from "@/lib/vercel-ai";
import { aiSuccessJson } from "@/lib/ai-response-envelope";

export const maxDuration = 180;

const COMPONENT_SPECS: Record<string, string> = {
  landing: `Landing page hero section:
- Sticky nav: logo left, "Sign In" + "Get Started" buttons right
- Big gradient headline, subtext paragraph, two CTA buttons (primary + outline)
- 3 feature cards in a row below (glass cards with inline SVG icons)`,

  dashboard: `App dashboard screen:
- Top bar: "Dashboard" title left, search box + notification bell + avatar right
- 4 KPI metric cards in a row: Users (2,847 ↑12%), Revenue ($48.2k ↑8%), Projects (142 ↑5%), Satisfaction (4.9★)
- Activity table: 5 rows with status badge (green/yellow/red pill), user name, action, time-ago`,

  auth: `Sign-in authentication screen:
- Centered card (max 420px wide) with logo + "Welcome back" heading
- Google OAuth button (Google G SVG icon), GitHub OAuth button (Octocat SVG icon)
- "or continue with email" divider line
- Email input, Password input with eye toggle, "Sign In" button, "Forgot password?" link`,

  profile: `User profile page:
- Large 96px circle avatar (gradient background initials "AJ"), name "Alex Johnson", "Senior Developer" badge
- Colored skill tags: React · Node.js · TypeScript · Figma · AWS
- Stats row: 24 Projects | 4.9★ Rating | 98% On-time | $12k Earned
- 2×2 project portfolio grid: each card has a colored thumbnail, project title, 2–3 tech tags`,

  notifications: `Notifications panel:
- Header "Notifications" + "Mark all read" button
- Filter tab row: All (14) | Unread (3) | Important
- 5 notification list items: colored left-border accent, avatar circle, message, "2h ago" timestamp
- 2 items have a subtle highlighted background (unread state)`,

  "project-card": `Project discovery / listings page:
- Page heading "Discover Projects" + search bar + filter dropdown
- 2-column grid of 4 project cards; each card:
  title, 2-line description, 3 tech tags (React/Node/AWS), "92% Match" purple badge, "View" + "Apply" buttons`,
};

const SYSTEM_PROMPT = `You are a world-class UI engineer. Return ONLY a complete <!DOCTYPE html> document.
NO markdown, NO explanation, NO backticks — raw HTML only.

CRITICAL RULE: ALL styling MUST be inside a single <style> block. NO Tailwind, NO Bootstrap, NO external CDN links.
The page must render with zero network requests — fully self-contained.

Use this CSS design system in your <style> block:

:root {
  --bg: #09090b;
  --bg2: #111113;
  --surface: rgba(255,255,255,0.04);
  --surface-hover: rgba(255,255,255,0.07);
  --border: rgba(255,255,255,0.08);
  --text: #f4f4f5;
  --muted: #71717a;
  --accent: #6366f1;
  --accent-soft: rgba(99,102,241,0.15);
  --purple: #8b5cf6;
  --cyan: #06b6d4;
  --green: #22c55e;
  --red: #ef4444;
  --yellow: #f59e0b;
  --radius: 14px;
  --radius-sm: 8px;
}
* { margin:0; padding:0; box-sizing:border-box; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
  line-height: 1.6;
  min-height: 100vh;
}

/* Utility classes — use these */
.glass {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  backdrop-filter: blur(12px);
}
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
}
.badge {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700;
}
.badge-purple { background: rgba(99,102,241,0.15); color: #a5b4fc; border: 1px solid rgba(99,102,241,0.25); }
.badge-green  { background: rgba(34,197,94,0.12);  color: #4ade80; border: 1px solid rgba(34,197,94,0.2); }
.badge-red    { background: rgba(239,68,68,0.12);  color: #f87171; border: 1px solid rgba(239,68,68,0.2); }
.badge-yellow { background: rgba(245,158,11,0.12); color: #fbbf24; border: 1px solid rgba(245,158,11,0.2); }
.tag {
  display: inline-block; padding: 3px 10px; border-radius: 6px;
  font-size: 11px; font-weight: 600;
  background: rgba(99,102,241,0.1); color: #a5b4fc;
  border: 1px solid rgba(99,102,241,0.2);
}
.btn {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 20px; border-radius: var(--radius-sm);
  font-size: 13px; font-weight: 600; cursor: pointer; border: none; transition: all .15s;
}
.btn-primary {
  background: linear-gradient(135deg, var(--accent), var(--purple));
  color: white; box-shadow: 0 4px 14px rgba(99,102,241,0.35);
}
.btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(99,102,241,0.45); }
.btn-ghost {
  background: var(--surface); color: var(--text);
  border: 1px solid var(--border);
}
.btn-ghost:hover { background: var(--surface-hover); border-color: rgba(255,255,255,0.15); }
.gradient-text {
  background: linear-gradient(135deg, #818cf8, #a78bfa, #67e8f9);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
}
.divider { border: none; border-top: 1px solid var(--border); margin: 16px 0; }
input, select {
  background: var(--surface); border: 1px solid var(--border);
  color: var(--text); border-radius: var(--radius-sm); padding: 10px 14px;
  font-size: 13px; outline: none; width: 100%; transition: border-color .15s;
}
input:focus, select:focus { border-color: var(--accent); }
input::placeholder { color: var(--muted); }
@keyframes fade-in { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
.page { animation: fade-in .35s ease both; }`;

export async function POST(req: NextRequest) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const b = parsed.body as Record<string, unknown>;
  const { templateId, projectName, projectIdea } = b;

  const appName  = (typeof projectName === "string" ? projectName : "") || "My App";
  const idea     = typeof projectIdea === "string" ? projectIdea : "";
  const template = typeof templateId === "string" ? templateId : "landing";

  const spec = (COMPONENT_SPECS[template] ?? COMPONENT_SPECS.landing)
    .replace(/\{\{APP\}\}/g, appName);

  const userPrompt = [
    `Build this UI screen for app "${appName}" as a self-contained HTML file:`,
    spec,
    idea ? `App context: ${idea.slice(0, 150)}` : "",
    ``,
    `RULES:`,
    `1. Put ALL CSS inside a <style> block — no Tailwind, no Bootstrap, no CDN links.`,
    `2. Use the design system variables (:root) and utility classes from the system prompt.`,
    `3. Make it look production-ready: compact layout, 16–20px gaps, clear hierarchy, minimal mock copy.`,
    `4. The page renders at 1200×680 viewport — fill the space without overflow; avoid redundant sections.`,
  ].filter(Boolean).join("\n");

  const minHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Preview</title><style>body{background:#09090b;color:#f4f4f5;font-family:system-ui;padding:24px;}</style></head><body><p>Preview ready. Keep editing the template.</p></body></html>`;

  try {
    if (!getNimClient()) {
      return aiSuccessJson({ html: minHtml }, "fallback");
    }

    const compact = isCompactServerlessAiChain();
    let html = await orchestrateChatCompletion(
      "code_generation",
      {
        messages: [
          {
            role: "system",
            content: compact
              ? `${SYSTEM_PROMPT}\n\nSTRICT: You are in an ultra-fast generation mode. Be EXTREMELY concise. Generate only the core UI layout. No extra sub-pages or elaborate mock copy.`
              : SYSTEM_PROMPT,
          },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.48,
        max_tokens: compact ? 800 : MAX_TOKENS_GENERATE_PREVIEW,
      },
      { minContentLength: 200 },
    );
    html = html.replace(/^```[\w]*\n?/gm, "").replace(/\n?```$/gm, "").trim();

    if (!html.toLowerCase().includes("<!doctype")) {
      return aiSuccessJson({ html: minHtml }, "fallback");
    }

    return aiSuccessJson({ html }, "ai");
  } catch (err) {
    console.error("[generate-preview]", err);
    return aiSuccessJson({ html: minHtml }, "fallback");
  }
}
