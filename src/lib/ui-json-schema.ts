/**
 * Structured UI JSON — AI output contract + validation for dynamic React rendering.
 */

export const UI_COMPONENT_TYPES = [
  "input",
  "button",
  "card",
  "navbar",
  "list",
  "form",
] as const;

export type UIComponentType = (typeof UI_COMPONENT_TYPES)[number];

export type UIComponent =
  | {
      type: "input";
      label?: string;
      placeholder?: string;
      name?: string;
      inputType?: "text" | "email" | "password" | "number" | "tel" | "url";
    }
  | {
      type: "button";
      text: string;
      action?: "submit" | "button" | "reset";
      variant?: "primary" | "outline" | "ghost";
    }
  | {
      type: "card";
      title?: string;
      content?: string;
      children?: UIComponent[];
    }
  | {
      type: "navbar";
      title?: string;
      logo?: string;
      links?: { label: string; href: string }[];
    }
  | {
      type: "list";
      items: Array<string | { title: string; desc?: string }>;
      ordered?: boolean;
    }
  | {
      type: "form";
      title?: string;
      children?: UIComponent[];
    };

export interface UIScreenJson {
  page: string;
  /** `"landing"` is normalized to `"grid"` for rendering. */
  layout?: "stack" | "grid" | "split" | "landing";
  components: UIComponent[];
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function isAllowedType(t: unknown): t is UIComponentType {
  return typeof t === "string" && (UI_COMPONENT_TYPES as readonly string[]).includes(t);
}

export function validateComponentShape(c: unknown, path: string): string[] {
  const errs: string[] = [];
  if (!isRecord(c)) {
    errs.push(`${path}: must be an object`);
    return errs;
  }
  const type = c.type;
  if (!isAllowedType(type)) {
    errs.push(`${path}.type: must be one of ${UI_COMPONENT_TYPES.join(", ")}`);
    return errs;
  }

  switch (type) {
    case "button":
      if (typeof c.text !== "string" || !c.text.trim()) {
        errs.push(`${path}: button requires non-empty string "text"`);
      }
      break;
    case "list":
      if (!Array.isArray(c.items) || c.items.length === 0) {
        errs.push(`${path}: list requires non-empty "items" array`);
      }
      break;
    case "card":
    case "form": {
      const ch = c.children;
      if (ch !== undefined) {
        if (!Array.isArray(ch)) {
          errs.push(`${path}.children: must be an array`);
        } else {
          ch.forEach((child, i) => errs.push(...validateComponentShape(child, `${path}.children[${i}]`)));
        }
      }
      break;
    }
    default:
      break;
  }
  return errs;
}

/** Validates a parsed object; returns typed screen or errors. */
export function validateUIScreenJson(
  raw: unknown,
): { ok: true; data: UIScreenJson } | { ok: false; errors: string[] } {
  if (!isRecord(raw)) {
    return { ok: false, errors: ["Root must be an object"] };
  }
  if (typeof raw.page !== "string" || !raw.page.trim()) {
    return { ok: false, errors: ['Missing or invalid string "page"'] };
  }
  if (!Array.isArray(raw.components)) {
    return { ok: false, errors: ['Missing or invalid "components" array'] };
  }
  if (raw.components.length === 0) {
    return { ok: false, errors: ["components must contain at least one item"] };
  }

  const layoutRaw = raw.layout;
  const layout =
    layoutRaw === "landing"
      ? "grid"
      : layoutRaw === "stack" || layoutRaw === "grid" || layoutRaw === "split"
        ? layoutRaw
        : undefined;
  if (layoutRaw !== undefined && layout === undefined) {
    return {
      ok: false,
      errors: ['layout must be "stack", "grid", "split", or "landing" if set'],
    };
  }

  const errors: string[] = [];
  raw.components.forEach((c, i) => {
    errors.push(...validateComponentShape(c, `components[${i}]`));
  });
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    data: {
      page: raw.page.trim(),
      layout: layout as UIScreenJson["layout"] | undefined,
      components: raw.components as UIComponent[],
    },
  };
}

/** Extract first JSON object from model output (may include markdown fences). */
export function extractJsonObjectFromModel(raw: string): string {
  const cleaned = raw.replace(/^```[\w]*\n?/gm, "").replace(/\n?```$/gm, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in model response");
  }
  return cleaned.slice(start, end + 1);
}
