"use client";

import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from "react";

export type ScrollRailMetrics = { pctTop: number; pctHeight: number; scrollable: boolean };

export function useScrollRailMetrics(scrollRef: RefObject<HTMLElement | null>): ScrollRailMetrics {
  const [m, setM] = useState<ScrollRailMetrics>({ pctTop: 0, pctHeight: 0, scrollable: false });
  const update = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 2) {
      setM({ pctTop: 0, pctHeight: 0, scrollable: false });
      return;
    }
    const maxScroll = scrollHeight - clientHeight;
    const visibleRatio = clientHeight / scrollHeight;
    const thumbPct = Math.max(visibleRatio * 100, 10);
    const scrollRatio = maxScroll > 0 ? scrollTop / maxScroll : 0;
    const pctTop = scrollRatio * (100 - thumbPct);
    setM({ pctTop, pctHeight: thumbPct, scrollable: true });
  }, [scrollRef]);
  useEffect(() => {
    const el = scrollRef.current;
    const raf = requestAnimationFrame(() => {
      update();
    });
    if (!el) {
      return () => cancelAnimationFrame(raf);
    }
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", update);
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [scrollRef, update]);
  return m;
}

export function useWindowScrollRailMetrics(): ScrollRailMetrics {
  const [m, setM] = useState<ScrollRailMetrics>({ pctTop: 0, pctHeight: 0, scrollable: false });
  const update = useCallback(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const el = document.documentElement;
    const scrollTop = window.scrollY || el.scrollTop;
    const scrollHeight = el.scrollHeight;
    const clientHeight = window.innerHeight;
    if (scrollHeight <= clientHeight + 2) {
      setM({ pctTop: 0, pctHeight: 0, scrollable: false });
      return;
    }
    const maxScroll = scrollHeight - clientHeight;
    const visibleRatio = clientHeight / scrollHeight;
    const thumbPct = Math.max(visibleRatio * 100, 10);
    const scrollRatio = maxScroll > 0 ? scrollTop / maxScroll : 0;
    const pctTop = scrollRatio * (100 - thumbPct);
    setM({ pctTop, pctHeight: thumbPct, scrollable: true });
  }, []);
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      update();
    });
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const ro = new ResizeObserver(update);
    ro.observe(document.documentElement);
    if (document.body) ro.observe(document.body);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      ro.disconnect();
    };
  }, [update]);
  return m;
}

export type ScrollGlowVariant = "sidebar" | "panel" | "viewport";

export function ScrollGlowRail({
  metrics,
  variant,
}: {
  metrics: ScrollRailMetrics;
  variant: ScrollGlowVariant;
}) {
  const thumbGradient =
    variant === "sidebar"
      ? "from-cyan-200/95 via-indigo-400/90 to-violet-500/85"
      : variant === "panel"
        ? "from-sky-300/90 via-indigo-400/95 to-fuchsia-400/80"
        : "from-slate-200/80 via-indigo-300/85 to-slate-200/75";
  const shimmerGradient =
    variant === "sidebar"
      ? "from-transparent via-indigo-400/55 to-transparent"
      : variant === "panel"
        ? "from-transparent via-cyan-400/45 to-transparent"
        : "from-transparent via-indigo-400/35 to-transparent";
  return (
    <div
      className="pointer-events-none absolute right-0 top-0 z-20 flex h-full w-3 shrink-0 justify-center"
      aria-hidden
    >
      <div className="relative h-full w-full overflow-hidden rounded-full opacity-90">
        <div className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 rounded-full bg-gradient-to-b from-white/[0.03] via-white/15 to-white/[0.03]" />
        <div
          className={`scroll-rail-shimmer absolute left-1/2 top-0 h-[42%] w-[5px] -translate-x-1/2 rounded-full bg-gradient-to-b ${shimmerGradient} blur-[1px] shadow-[0_0_18px_rgba(129,140,248,0.35)]`}
        />
        {metrics.scrollable ? (
          <div
            className={`absolute left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-gradient-to-b ${thumbGradient} shadow-[0_0_16px_rgba(99,102,241,0.75),0_0_28px_rgba(34,211,238,0.25)] transition-[top,height] duration-150 ease-out`}
            style={{ top: `${metrics.pctTop}%`, height: `${metrics.pctHeight}%` }}
          />
        ) : null}
      </div>
    </div>
  );
}

export function DocumentScrollGlowRail() {
  const metrics = useWindowScrollRailMetrics();
  useLayoutEffect(() => {
    document.documentElement.classList.add("no-scrollbar");
    document.body.classList.add("no-scrollbar");
    return () => {
      document.documentElement.classList.remove("no-scrollbar");
      document.body.classList.remove("no-scrollbar");
    };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-y-0 right-0 z-[45] w-3" aria-hidden>
      <div className="relative h-full w-full">
        <ScrollGlowRail metrics={metrics} variant="viewport" />
      </div>
    </div>
  );
}
