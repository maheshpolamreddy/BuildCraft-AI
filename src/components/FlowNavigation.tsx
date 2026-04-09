"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import clsx from "clsx";
import { useStore } from "@/store/useStore";

export function CreatorFlowBreadcrumb() {
  const pathname = usePathname();
  const project = useStore((s) => s.project);
  const allAccepted = project?.assumptions?.every((a) => a.accepted) ?? false;
  const locked = !!project?.locked;

  if (!["/discovery", "/architecture", "/project-room"].includes(pathname)) {
    return null;
  }

  const steps = [
    { key: "discovery", label: "Discovery", href: "/discovery", ok: true, current: pathname === "/discovery" },
    { key: "architecture", label: "Architecture", href: "/architecture", ok: allAccepted, current: pathname === "/architecture" },
    { key: "workspace", label: "Workspace", href: "/project-room", ok: locked, current: pathname === "/project-room" },
  ] as const;

  return (
    <nav
      aria-label="Project creator flow"
      className="flex flex-wrap items-center gap-x-0.5 gap-y-2 py-3 px-4 rounded-2xl border border-white/10 bg-white/[0.03] mb-6"
    >
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-white/45 hover:text-white transition-colors shrink-0"
      >
        <Home className="w-3.5 h-3.5" />
        Home
      </Link>
      {steps.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-0.5 shrink-0">
          <ChevronRight className="w-3.5 h-3.5 text-white/25" />
          {s.ok ? (
            <Link
              href={s.href}
              className={clsx(
                "text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-lg transition-colors border",
                s.current
                  ? "bg-blue-500/20 text-blue-200 border-blue-500/35"
                  : "text-white/55 hover:text-white border-transparent hover:bg-white/5 hover:border-white/10",
              )}
            >
              {s.label}
            </Link>
          ) : (
            <span
              className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-lg text-white/25 border border-transparent cursor-not-allowed"
              title={
                s.key === "architecture"
                  ? "Accept all assumptions on Discovery first"
                  : "Lock your plan from Architecture to open the workspace"
              }
            >
              {s.label}
            </span>
          )}
        </span>
      ))}
      {project && (
        <span
          className="w-full sm:w-auto sm:ml-auto text-[10px] text-white/35 truncate max-w-full sm:max-w-[240px] font-medium normal-case tracking-normal border-t border-white/5 sm:border-t-0 pt-2 sm:pt-0 mt-1 sm:mt-0"
          title={project.name}
        >
          {project.name} / {project.version || "v1.0"}
        </span>
      )}
    </nav>
  );
}

export type DeveloperFlowBreadcrumbProps = {
  className?: string;
  /**
   * Set when this nav is shown on `/project-room` for a hired developer.
   * That route is shared with creators; without this flag the breadcrumb would not render.
   */
  includeProjectRoomPath?: boolean;
};

export function DeveloperFlowBreadcrumb({
  className,
  includeProjectRoomPath = false,
}: DeveloperFlowBreadcrumbProps) {
  const pathname = usePathname();
  const userRoles = useStore((s) => s.userRoles);

  const onDeveloperProjectRoom =
    includeProjectRoomPath && pathname === "/project-room";

  const devRoot =
    pathname.startsWith("/employee-dashboard") ||
    pathname.startsWith("/developer") ||
    onDeveloperProjectRoom;

  if (!devRoot) {
    return null;
  }

  const linkCls = (active: boolean) =>
    clsx(
      "text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-lg transition-colors border",
      active
        ? "bg-indigo-500/20 text-indigo-200 border-indigo-500/35"
        : "text-white/50 hover:text-white border-transparent hover:bg-white/5 hover:border-white/10",
    );

  return (
    <nav
      aria-label="Developer navigation"
      className={clsx(
        "flex flex-wrap items-center gap-x-0.5 gap-y-2 py-2.5 px-4 border-b border-white/5 bg-black/20",
        className,
      )}
    >
      <Link href="/" className={linkCls(false)}>
        Home
      </Link>
      <ChevronRight className="w-3.5 h-3.5 text-white/25 shrink-0" />
      <Link href="/employee-dashboard" className={linkCls(pathname === "/employee-dashboard")}>
        Dashboard
      </Link>
      <ChevronRight className="w-3.5 h-3.5 text-white/25 shrink-0" />
      <Link href="/developer/profile" className={linkCls(pathname === "/developer/profile")}>
        Profile
      </Link>
      {(pathname.startsWith("/developer/workspace") || onDeveloperProjectRoom) && (
        <>
          <ChevronRight className="w-3.5 h-3.5 text-white/25 shrink-0" />
          <span className={linkCls(true)}>Project workspace</span>
        </>
      )}
      {pathname.startsWith("/developer/register") && (
        <>
          <ChevronRight className="w-3.5 h-3.5 text-white/25 shrink-0" />
          <span className={linkCls(true)}>Register</span>
        </>
      )}
      {userRoles.includes("employer") && (
        <>
          <span className="w-px h-4 bg-white/10 mx-1 hidden sm:block" aria-hidden />
          <Link
            href="/discovery"
            className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-lg text-emerald-300/90 border border-emerald-500/25 bg-emerald-500/10 hover:bg-emerald-500/15 transition-colors"
          >
            Employer / Discovery
          </Link>
        </>
      )}
      {userRoles.includes("developer") && userRoles.includes("employer") && (
        <span className="ml-auto text-[9px] text-white/30 uppercase tracking-widest hidden md:inline">
          Multi-role
        </span>
      )}
    </nav>
  );
}
