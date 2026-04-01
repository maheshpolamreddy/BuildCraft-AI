/**
 * Standardizes AI output: `layout` + `sections[]` → `UIScreenJson` (page, layout, components).
 * Auto-fixes common validation gaps before `validateUIScreenJson`.
 */

import type { UIComponent, UIScreenJson } from "@/lib/ui-json-schema";
import { validateUIScreenJson } from "@/lib/ui-json-schema";

export const LANDING_SECTION_TYPES = [
  "hero",
  "features",
  "pricing",
  "footer",
  "cta",
  "testimonials",
  "logos",
  "navbar",
] as const;

export type LandingSectionType = (typeof LANDING_SECTION_TYPES)[number];

type SectionRecord = Record<string, unknown> & { type?: string };

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function featureItems(v: unknown): Array<string | { title: string; desc?: string }> {
  if (!Array.isArray(v)) return [];
  const out: Array<string | { title: string; desc?: string }> = [];
  for (const item of v) {
    if (typeof item === "string") {
      out.push(item);
    } else if (isRecord(item) && typeof item.title === "string") {
      out.push({ title: item.title, desc: typeof item.desc === "string" ? item.desc : undefined });
    }
  }
  return out.length ? out : [{ title: "Ship faster", desc: "Purpose-built workflows." }];
}

/**
 * Maps a landing-style section to one or more UI components (Tailwind-backed renderer).
 */
export function sectionToComponents(section: unknown, index: number): UIComponent[] {
  if (!isRecord(section)) {
    return [
      {
        type: "card",
        title: `Section ${index + 1}`,
        content: "Generated content.",
      },
    ];
  }

  const t = (section.type as string | undefined)?.toLowerCase() ?? "";

  switch (t) {
    case "hero": {
      const headline = str(section.headline, str(section.title, "Build something remarkable"));
      const sub = str(section.subhead, str(section.subtitle, "Premium experience — fast, clear, and delightful."));
      const cta = str(section.primaryCta, "Get started");
      const navTitle = str(section.brand, "Product");
      const links = Array.isArray(section.navLinks)
        ? (section.navLinks as unknown[])
            .filter(isRecord)
            .map((l) => ({
              label: str(l.label, "Link"),
              href: str(l.href, "#"),
            }))
            .filter((l) => l.label)
        : [
            { label: "Product", href: "#" },
            { label: "Pricing", href: "#" },
            { label: "Docs", href: "#" },
          ];
      return [
        {
          type: "navbar",
          title: navTitle,
          logo: str(section.logo, "◆"),
          links,
        },
        {
          type: "card",
          title: headline,
          content: sub,
          children: [
            { type: "button", text: cta, variant: "primary" },
            { type: "button", text: str(section.secondaryCta, "View demo"), variant: "outline" },
          ],
        },
      ];
    }
    case "features": {
      const title = str(section.title, "Everything you need");
      const items = featureItems(section.items ?? section.features);
      return [
        {
          type: "card",
          title,
          content: str(section.description, "Thoughtful defaults and crisp hierarchy."),
          children: [{ type: "list", items, ordered: false }],
        },
      ];
    }
    case "pricing": {
      const title = str(section.title, "Simple pricing");
      const tiers = Array.isArray(section.tiers) ? section.tiers : [];
      const listItems: Array<string | { title: string; desc?: string }> =
        tiers.length > 0
          ? tiers
              .filter(isRecord)
              .map((tier) => ({
                title: `${str(tier.name, "Plan")} — ${str(tier.price, "")}`,
                desc: str(tier.blurb, ""),
              }))
          : [
              { title: "Starter", desc: "For individuals and small teams." },
              { title: "Pro", desc: "Most popular — scale with confidence." },
              { title: "Enterprise", desc: "Security, SSO, and dedicated support." },
            ];
      return [
        {
          type: "card",
          title,
          content: str(section.description, "Transparent tiers. Upgrade anytime."),
          children: [{ type: "list", items: listItems, ordered: false }],
        },
      ];
    }
    case "footer": {
      const title = str(section.title, str(section.brand, "Company"));
      const cols = Array.isArray(section.links)
        ? strArr(section.links)
        : ["Privacy", "Terms", "Status", "Contact"];
      return [
        {
          type: "card",
          title,
          content: str(section.note, "© All rights reserved."),
          children: [{ type: "list", items: cols, ordered: false }],
        },
      ];
    }
    case "cta": {
      const title = str(section.title, "Ready to ship?");
      return [
        {
          type: "form",
          title,
          children: [
            { type: "input", label: "Work email", placeholder: "you@company.com", inputType: "email" },
            { type: "button", text: str(section.buttonText, "Request access"), variant: "primary" },
          ],
        },
      ];
    }
    case "testimonials": {
      const items = featureItems(section.items ?? section.quotes);
      return [
        {
          type: "card",
          title: str(section.title, "Loved by teams"),
          content: str(section.description, "Real outcomes from real builders."),
          children: [{ type: "list", items, ordered: false }],
        },
      ];
    }
    case "logos": {
      const items = strArr(section.logos ?? section.items);
      return [
        {
          type: "card",
          title: str(section.title, "Trusted by"),
          content: str(section.description, "Logos are illustrative; swap with your brand set."),
          children: [
            {
              type: "list",
              items: items.length ? items : ["Acme", "Globex", "Umbrella", "Stark"],
              ordered: false,
            },
          ],
        },
      ];
    }
    case "navbar": {
      return [
        {
          type: "navbar",
          title: str(section.title, "App"),
          logo: str(section.logo, "◆"),
          links: Array.isArray(section.links)
            ? (section.links as unknown[])
                .filter(isRecord)
                .map((l) => ({ label: str(l.label, "Link"), href: str(l.href, "#") }))
            : [
                { label: "Home", href: "#" },
                { label: "Pricing", href: "#" },
              ],
        },
      ];
    }
    default: {
      const title = str(section.title, t ? `${t} section` : `Section ${index + 1}`);
      const content = str(section.content, str(section.body, "A polished block with strong typography."));
      return [{ type: "card", title, content }];
    }
  }
}

/**
 * If the model returned `sections`, converts to `components` and normalizes `layout`.
 */
export function normalizeRawJsonToUIScreenShape(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;

  if (raw.layout === "landing" && Array.isArray(raw.components)) {
    return { ...raw, layout: "grid" };
  }

  const sections = raw.sections;
  if (Array.isArray(sections) && sections.length > 0) {
    const page = typeof raw.page === "string" && raw.page.trim() ? raw.page.trim() : "Landing";
    const layoutRaw = raw.layout;
    let layout: UIScreenJson["layout"] = "grid";
    if (layoutRaw === "stack" || layoutRaw === "grid" || layoutRaw === "split") {
      layout = layoutRaw;
    } else if (layoutRaw === "landing") {
      layout = "grid";
    }
    const components: UIComponent[] = [];
    sections.forEach((sec, i) => {
      components.push(...sectionToComponents(sec as SectionRecord, i));
    });
    return { page, layout, components };
  }

  return raw;
}

export function autoFixComponents(components: unknown[]): UIComponent[] {
  const fixed: UIComponent[] = [];
  for (const c of components) {
    if (!isRecord(c) || typeof c.type !== "string") continue;
    const t = c.type;
    if (t === "button" && (typeof c.text !== "string" || !c.text.trim())) {
      fixed.push({ ...c, type: "button", text: "Continue" });
      continue;
    }
    if (t === "list" && (!Array.isArray(c.items) || c.items.length === 0)) {
      fixed.push({ type: "list", items: [{ title: "First item", desc: "Supporting detail." }], ordered: false });
      continue;
    }
    fixed.push(c as UIComponent);
  }
  return fixed;
}

/**
 * Normalize → validate → optional auto-fix pass.
 */
export function normalizeValidateAndFix(
  raw: unknown,
): { ok: true; data: UIScreenJson } | { ok: false; errors: string[] } {
  const n1 = normalizeRawJsonToUIScreenShape(raw);
  let v = validateUIScreenJson(n1);
  if (v.ok) return v;

  if (isRecord(n1) && Array.isArray(n1.components)) {
    const fixed = autoFixComponents(n1.components as unknown[]);
    const n2 = { ...n1, components: fixed };
    v = validateUIScreenJson(n2);
    if (v.ok) return v;
  }

  return v;
}
