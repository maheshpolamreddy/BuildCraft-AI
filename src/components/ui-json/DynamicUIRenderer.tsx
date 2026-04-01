"use client";

import type { ReactNode } from "react";
import type { UIComponent, UIScreenJson } from "@/lib/ui-json-schema";
import { clsx } from "clsx";

/** Premium dark UI shell — gradients, glass cards, consistent radii & depth */
const shell = {
  canvas:
    "relative overflow-hidden rounded-[1.75rem] border border-white/[0.09] bg-zinc-950 text-left shadow-[0_24px_80px_-12px_rgba(0,0,0,0.65)]",
  mesh: "pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(99,102,241,0.22),transparent),radial-gradient(ellipse_60%_40%_at_100%_50%,rgba(168,85,247,0.12),transparent),radial-gradient(ellipse_50%_30%_at_0%_80%,rgba(34,211,238,0.08),transparent)]",
  grain:
    "pointer-events-none absolute inset-0 opacity-[0.35] mix-blend-overlay [background-image:url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")]",
  inner: "relative z-10 p-6 sm:p-8",
};

function CardShell({
  children,
  className,
  depth = 0,
}: {
  children: ReactNode;
  className?: string;
  depth?: number;
}) {
  const tint =
    depth === 0
      ? "from-violet-500/[0.07] via-white/[0.04] to-cyan-500/[0.03]"
      : "from-indigo-500/[0.06] via-white/[0.03] to-fuchsia-500/[0.02]";
  return (
    <div
      className={clsx(
        "group relative overflow-hidden rounded-2xl border border-white/[0.1] bg-gradient-to-br p-5 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-white/[0.06] transition-shadow duration-300 hover:shadow-[0_16px_48px_-8px_rgba(79,70,229,0.15)]",
        tint,
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gradient-to-br from-indigo-400/20 to-purple-500/5 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-gradient-to-tr from-cyan-400/10 to-transparent blur-xl" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

function ComponentNode({ comp, depth = 0 }: { comp: UIComponent; depth?: number }) {
  const nest = depth > 0 ? "mt-1 border-l-2 border-indigo-500/30 pl-4" : "";

  switch (comp.type) {
    case "input":
      return (
        <label className={clsx("flex flex-col gap-2", nest)}>
          {comp.label && (
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/40">{comp.label}</span>
          )}
          <div className="relative">
            <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-500/20 via-transparent to-purple-500/10 opacity-0 transition-opacity group-focus-within:opacity-100" />
            <input
              type={comp.inputType ?? "text"}
              name={comp.name}
              placeholder={comp.placeholder}
              readOnly
              className="relative w-full rounded-xl border border-white/[0.12] bg-black/40 px-4 py-3 text-sm text-white/95 shadow-inner shadow-black/20 outline-none ring-0 placeholder:text-white/30 backdrop-blur-sm transition-all focus:border-indigo-400/40 focus:bg-black/50 focus:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
            />
          </div>
        </label>
      );

    case "button": {
      const v = comp.variant ?? "primary";
      const cls =
        v === "primary"
          ? "bg-gradient-to-r from-indigo-500 via-violet-600 to-purple-600 text-white shadow-lg shadow-indigo-500/25 ring-1 ring-white/10 hover:brightness-110 hover:shadow-indigo-500/35 active:scale-[0.98]"
          : v === "outline"
            ? "border border-white/20 bg-white/[0.04] text-white/95 shadow-lg shadow-black/20 backdrop-blur-sm hover:border-white/30 hover:bg-white/[0.08]"
            : "bg-white/[0.06] text-white/85 shadow-inner shadow-black/30 hover:bg-white/[0.1]";
      return (
        <button
          type={comp.action === "submit" ? "submit" : "button"}
          className={clsx(
            "group relative inline-flex items-center justify-center overflow-hidden rounded-xl px-5 py-3 text-sm font-semibold tracking-tight transition-all duration-200",
            cls,
            nest,
          )}
        >
          {v === "primary" && (
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-transparent via-white/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          )}
          <span className="relative">{comp.text}</span>
        </button>
      );
    }

    case "card":
      return (
        <CardShell depth={depth} className={nest}>
          {comp.title && (
            <h3 className="mb-1 bg-gradient-to-r from-white via-white to-white/70 bg-clip-text text-base font-bold tracking-tight text-transparent">
              {comp.title}
            </h3>
          )}
          {comp.content && (
            <p className="mb-4 text-sm leading-relaxed text-white/55 [text-wrap:pretty]">{comp.content}</p>
          )}
          {comp.children?.length ? (
            <div className="flex flex-col gap-4 border-t border-white/[0.06] pt-4">
              {comp.children.map((ch, i) => (
                <ComponentNode key={i} comp={ch} depth={depth + 1} />
              ))}
            </div>
          ) : null}
        </CardShell>
      );

    case "navbar":
      return (
        <header
          className={clsx(
            "flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/[0.1] bg-gradient-to-r from-black/50 via-zinc-900/60 to-black/50 px-5 py-4 shadow-xl shadow-black/30 backdrop-blur-xl",
            nest,
          )}
        >
          <div className="flex items-center gap-3">
            {comp.logo && (
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/30 to-purple-600/20 text-lg shadow-inner ring-1 ring-white/10">
                {comp.logo}
              </span>
            )}
            <span className="bg-gradient-to-r from-white to-white/80 bg-clip-text text-base font-bold tracking-tight text-transparent">
              {comp.title ?? "App"}
            </span>
          </div>
          {comp.links && comp.links.length > 0 && (
            <nav className="flex flex-wrap items-center gap-1">
              {comp.links.map((l, i) => (
                <span
                  key={i}
                  className="cursor-default rounded-lg px-3 py-1.5 text-xs font-medium text-white/45 transition-colors hover:bg-white/[0.06] hover:text-indigo-200"
                >
                  {l.label}
                </span>
              ))}
            </nav>
          )}
        </header>
      );

    case "list": {
      const Tag = comp.ordered ? "ol" : "ul";
      return (
        <Tag
          className={clsx(
            "space-y-2.5",
            comp.ordered ? "list-decimal" : "list-none",
            nest,
          )}
        >
          {comp.items.map((item, i) => (
            <li
              key={i}
              className={clsx(
                "rounded-xl border border-white/[0.06] bg-gradient-to-r from-white/[0.04] to-transparent px-4 py-3 text-sm text-white/75 shadow-sm backdrop-blur-sm transition-colors hover:border-white/10 hover:from-white/[0.06]",
                !comp.ordered && "flex flex-col gap-0.5",
              )}
              style={comp.ordered ? { listStylePosition: "inside" } : undefined}
            >
              {typeof item === "string" ? (
                <span className="text-white/80">{item}</span>
              ) : (
                <>
                  <span className="font-semibold text-white/95">{item.title}</span>
                  {item.desc && (
                    <span className="mt-0.5 block text-xs font-light leading-relaxed text-white/45">{item.desc}</span>
                  )}
                </>
              )}
            </li>
          ))}
        </Tag>
      );
    }

    case "form":
      return (
        <form
          className={clsx(
            "relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-b from-indigo-500/[0.08] via-black/40 to-black/60 p-6 shadow-2xl ring-1 ring-inset ring-white/[0.05]",
            nest,
          )}
          onSubmit={(e) => e.preventDefault()}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/40 to-transparent" />
          {comp.title && (
            <h3 className="mb-5 bg-gradient-to-r from-indigo-200 via-white to-purple-200/80 bg-clip-text text-lg font-bold tracking-tight text-transparent">
              {comp.title}
            </h3>
          )}
          <div className="flex flex-col gap-5">{comp.children?.map((ch, i) => <ComponentNode key={i} comp={ch} depth={depth + 1} />)}</div>
        </form>
      );

    default:
      return null;
  }
}

export function DynamicUIRenderer({ ui, className }: { ui: UIScreenJson; className?: string }) {
  const layout = ui.layout ?? "stack";
  const layoutCls =
    layout === "grid" || layout === "landing"
      ? "grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6"
      : layout === "split"
        ? "grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-10"
        : "flex flex-col gap-5";

  return (
    <div className={clsx(shell.canvas, className)}>
      <div className={shell.mesh} aria-hidden />
      <div className={shell.grain} aria-hidden />
      <div className={shell.inner}>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.08] pb-6">
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.35em] text-indigo-400/80">Screen</p>
            <h2 className="max-w-xl bg-gradient-to-r from-white via-indigo-100 to-purple-200 bg-clip-text text-xl font-black tracking-tight text-transparent sm:text-2xl">
              {ui.page}
            </h2>
          </div>
          <span className="rounded-full border border-emerald-500/25 bg-gradient-to-r from-emerald-500/15 to-cyan-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-300/90 shadow-lg shadow-emerald-900/20">
            Live preview
          </span>
        </div>
        <div className={layoutCls}>
          {ui.components.map((comp, i) => (
            <ComponentNode key={i} comp={comp} />
          ))}
        </div>
      </div>
    </div>
  );
}
