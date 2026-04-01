/**
 * Deterministic landing templates when the multi-model chain cannot produce valid JSON.
 */

import type { UIScreenJson } from "@/lib/ui-json-schema";

export type UiTemplateKind = "saas" | "startup" | "portfolio";

function basePage(title: string): UIScreenJson {
  return {
    page: title,
    layout: "grid",
    components: [],
  };
}

export function getSaaSTemplate(projectName: string): UIScreenJson {
  const name = projectName.trim() || "SaaS";
  return {
    ...basePage(`${name} — modern landing`),
    components: [
      {
        type: "navbar",
        title: name,
        logo: "◆",
        links: [
          { label: "Product", href: "#" },
          { label: "Features", href: "#" },
          { label: "Pricing", href: "#" },
          { label: "Docs", href: "#" },
        ],
      },
      {
        type: "card",
        title: "Ship faster with confidence",
        content:
          "A focused hero with crisp hierarchy, strong CTA, and proof that your product is built for serious teams.",
        children: [
          { type: "button", text: "Start free trial", variant: "primary" },
          { type: "button", text: "Talk to sales", variant: "outline" },
        ],
      },
      {
        type: "card",
        title: "Why teams choose us",
        content: "Everything you need to launch, iterate, and scale — without the busywork.",
        children: [
          {
            type: "list",
            ordered: false,
            items: [
              { title: "Fast setup", desc: "Go live in minutes with guided onboarding." },
              { title: "Enterprise-ready", desc: "Security, SSO, and audit logs." },
              { title: "Delightful UX", desc: "Polished UI that feels expensive." },
            ],
          },
        ],
      },
      {
        type: "card",
        title: "Pricing",
        content: "Transparent tiers. Upgrade anytime.",
        children: [
          {
            type: "list",
            ordered: false,
            items: [
              { title: "Starter — $0", desc: "For individuals and small teams." },
              { title: "Pro — $29", desc: "Most popular — scale with confidence." },
              { title: "Enterprise", desc: "Security reviews and dedicated support." },
            ],
          },
        ],
      },
      {
        type: "form",
        title: "Get started",
        children: [
          { type: "input", label: "Work email", placeholder: "you@company.com", inputType: "email" },
          { type: "button", text: "Request access", variant: "primary" },
        ],
      },
      {
        type: "card",
        title: "Footer",
        content: "© BuildCraft template — swap with your legal links.",
        children: [
          { type: "list", items: ["Privacy", "Terms", "Status", "Contact"], ordered: false },
        ],
      },
    ],
  };
}

export function getStartupTemplate(projectName: string): UIScreenJson {
  const name = projectName.trim() || "Startup";
  return {
    page: `${name} — launch page`,
    layout: "split",
    components: [
      {
        type: "navbar",
        title: name,
        logo: "⚡",
        links: [
          { label: "Story", href: "#" },
          { label: "Team", href: "#" },
          { label: "Investors", href: "#" },
        ],
      },
      {
        type: "card",
        title: "We’re building the future",
        content:
          "A bold narrative block with a tight pitch — ideal for early-stage traction and waitlists.",
        children: [{ type: "list", items: [{ title: "Traction", desc: "Weekly growth." }], ordered: false }],
      },
      {
        type: "card",
        title: "Join the waitlist",
        content: "Be first to get access — we’ll email you when the doors open.",
        children: [
          { type: "input", label: "Email", placeholder: "founder@startup.com", inputType: "email" },
          { type: "button", text: "Join waitlist", variant: "primary" },
        ],
      },
    ],
  };
}

export function getPortfolioTemplate(projectName: string): UIScreenJson {
  const name = projectName.trim() || "Portfolio";
  return {
    page: `${name} — showcase`,
    layout: "grid",
    components: [
      {
        type: "navbar",
        title: name,
        logo: "✦",
        links: [
          { label: "Work", href: "#" },
          { label: "About", href: "#" },
          { label: "Contact", href: "#" },
        ],
      },
      {
        type: "card",
        title: "Selected work",
        content: "A curated grid of case studies — swap items with your real projects.",
        children: [
          {
            type: "list",
            ordered: false,
            items: [
              { title: "Brand identity", desc: "Visual system + guidelines." },
              { title: "Product UI", desc: "High-fidelity screens." },
              { title: "Prototyping", desc: "Fast iteration loops." },
            ],
          },
        ],
      },
      {
        type: "card",
        title: "Let’s collaborate",
        content: "Tell me about your project — I’ll respond within 2 business days.",
        children: [
          { type: "input", label: "Name", placeholder: "Your name", inputType: "text" },
          { type: "input", label: "Email", placeholder: "you@email.com", inputType: "email" },
          { type: "button", text: "Send message", variant: "primary" },
        ],
      },
    ],
  };
}

export function pickTemplateByKeywords(projectName: string, projectIdea: string): UiTemplateKind {
  const t = `${projectName} ${projectIdea}`.toLowerCase();
  if (/portfolio|designer|creative|photography|showcase|studio/.test(t)) return "portfolio";
  if (/startup|waitlist|founder|seed|venture|mvp/.test(t)) return "startup";
  return "saas";
}

export function getTemplateByKind(kind: UiTemplateKind, projectName: string): UIScreenJson {
  switch (kind) {
    case "portfolio":
      return getPortfolioTemplate(projectName);
    case "startup":
      return getStartupTemplate(projectName);
    default:
      return getSaaSTemplate(projectName);
  }
}
