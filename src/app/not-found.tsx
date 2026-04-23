import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#030303] px-6 text-center">
      <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/35">404</p>
      <h1 className="mt-3 text-3xl font-black tracking-tight text-white">Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-white/45 font-light">
        That URL does not exist in BuildCraft. Check the link or go back to a known area of the app.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-xs font-bold uppercase tracking-widest text-white hover:bg-white/10"
        >
          Home
        </Link>
        <Link
          href="/auth"
          className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-6 py-3 text-xs font-bold uppercase tracking-widest text-indigo-200 hover:bg-indigo-500/20"
        >
          Sign in
        </Link>
        <Link
          href="/discovery"
          className="rounded-xl border border-white/15 px-6 py-3 text-xs font-bold uppercase tracking-widest text-white/70 hover:text-white hover:border-white/30"
        >
          Discovery
        </Link>
        <Link
          href="/employee-dashboard"
          className="rounded-xl border border-white/15 px-6 py-3 text-xs font-bold uppercase tracking-widest text-white/70 hover:text-white hover:border-white/30"
        >
          Developer dashboard
        </Link>
      </div>
    </div>
  );
}