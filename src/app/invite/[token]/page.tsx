"use client";

import { useEffect, useState, Suspense, useCallback } from "react";
import { useSearchParams, useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  CheckCircle2, XCircle, Loader2, Briefcase,
  User, AlertTriangle, ArrowRight, Lock,
} from "lucide-react";
import { getHireRequest, type HireRequest } from "@/lib/hireRequests";
import {
  createOrGetChat,
  sendChatMessage,
  chatStorageKey,
} from "@/lib/chat";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import Link from "next/link";

type PageState =
  | "loading"
  | "ready"
  | "submitting"
  | "rejected"
  | "expired"
  | "already-responded"
  | "need-sign-in"
  | "wrong-account"
  | "error";

function InvitePageInner() {
  const params       = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const router       = useRouter();
  const action       = searchParams.get("action") as "accept" | "reject" | null;

  const [state, setState]   = useState<PageState>("loading");
  const [request, setRequest] = useState<HireRequest | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<FirebaseUser | null | undefined>(undefined);

  const token = params.token;

  // Firebase auth (source of truth for “which account is this?”)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setAuthUser(u));
    return unsub;
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const req = await getHireRequest(token);
        if (!req) {
          setState("error");
          return;
        }
        if (req.status === "expired") {
          setState("expired");
          return;
        }
        if (req.status !== "pending") {
          setState("already-responded");
          setRequest(req);
          return;
        }
        setRequest(req);
        setState("ready");
      } catch {
        setState("error");
      }
    }
    load();
  }, [token]);

  const runPostAcceptForDeveloper = useCallback(
    async (req: HireRequest) => {
      const u = auth.currentUser;
      if (!u || u.uid !== req.developerUid) return;
      try {
        await createOrGetChat({
          chatId:         req.token,
          projectName:    req.projectName,
          creatorUid:     req.creatorUid,
          creatorName:    req.creatorName,
          creatorEmail:   req.creatorEmail,
          developerUid:   req.developerUid,
          developerName:  req.developerName,
          developerEmail: req.developerEmail,
        });
        const line = `${req.developerName} accepted your hire invitation for “${req.projectName}”. Let’s align on next steps here in chat.`;
        await sendChatMessage(req.token, {
          text:       line,
          senderUid:  u.uid,
          senderName: req.developerName,
        });
        try {
          sessionStorage.setItem(
            chatStorageKey("developer", u.uid, req.projectId),
            req.token,
          );
        } catch {
          /* */
        }
      } catch (e) {
        console.warn("[invite] post-accept chat:", e);
      }
      if (req.projectId) {
        router.replace(`/developer/workspace/${encodeURIComponent(req.projectId)}?tab=chat`);
      } else {
        router.push("/discovery");
      }
    },
    [router],
  );

  async function respond(act: "accept" | "reject") {
    const u = auth.currentUser;
    if (!request) return;
    if (!u) {
      setError("Please sign in to respond to this invitation.");
      setState("need-sign-in");
      return;
    }
    if (u.uid !== request.developerUid) {
      setError(
        `This invite is for the developer account tied to this hire. You’re signed in as a different user. Sign out and sign in with the invited account.`,
      );
      setState("wrong-account");
      return;
    }

    setState("submitting");
    setError(null);
    try {
      const res = await fetch("/api/hire-respond", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token, action: act }),
      });
      if (!res.ok) {
        try {
          sessionStorage.removeItem(`buildcraft:inviteAuto:${token}:${act}`);
        } catch {
          /* */
        }
        const d = (await res.json().catch(() => ({}))) as {
          error?: string;
          hint?: string;
        };
        const err = typeof d.error === "string" ? d.error : "Something went wrong";
        const hint = typeof d.hint === "string" ? d.hint : "";
        setError([err, hint].filter(Boolean).join("\n\n"));
        setState("error");
        return;
      }
      if (act === "accept") {
        const fresh = await getHireRequest(token);
        if (fresh) await runPostAcceptForDeveloper(fresh);
        else await runPostAcceptForDeveloper(request);
        return;
      }
      setState("rejected");
    } catch {
      try {
        sessionStorage.removeItem(`buildcraft:inviteAuto:${token}:accept`);
        sessionStorage.removeItem(`buildcraft:inviteAuto:${token}:reject`);
      } catch {
        /* */
      }
      setError("Network error. Please try again.");
      setState("error");
    }
  }

  // Email deep-link: auto accept/reject only when the signed-in user is the invited developer
  useEffect(() => {
    if (state !== "ready" || !action || !request) return;
    if (authUser === undefined) return;
    const onceKey = `buildcraft:inviteAuto:${token}:${action}`;
    try {
      if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(onceKey)) return;
    } catch {
      /* */
    }
    if (!authUser) {
      setState("need-sign-in");
      return;
    }
    if (authUser.uid !== request.developerUid) {
      setState("wrong-account");
      return;
    }
    try {
      sessionStorage.setItem(onceKey, "1");
    } catch {
      /* */
    }
    void respond(action);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- respond closes over latest request/token
  }, [authUser, state, action, request, token]);

  const returnToInvite = `/invite/${token}${action ? `?action=${action}` : ""}`;
  const signInHref     = `/auth?return=${encodeURIComponent(returnToInvite)}`;

  const bg = (
    <div className="fixed inset-0 -z-10 bg-[#09090b]">
      <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-blue-500/[0.04] rounded-full blur-[150px]" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-indigo-500/[0.03] rounded-full blur-[150px]" />
    </div>
  );

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center text-white">
        {bg}
        <Loader2 className="w-10 h-10 animate-spin text-white/30" />
      </div>
    );
  }

  if (state === "submitting") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-white">
        {bg}
        <Loader2 className="w-12 h-12 animate-spin text-white/40" />
        <p className="text-white/50 font-light">Processing your response…</p>
      </div>
    );
  }

  if (state === "expired") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        {bg}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
            <AlertTriangle className="w-10 h-10 text-yellow-400" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tighter">Invitation Expired</h1>
          <p className="text-[#888] font-light">This invitation has expired (48-hour window). The project creator can send a new invitation.</p>
          <Link href="/" className="inline-block text-white/40 hover:text-white text-sm font-bold transition-colors">← Go to BuildCraft</Link>
        </motion.div>
      </div>
    );
  }

  if (state === "already-responded") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        {bg}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center">
            {request?.status === "accepted"
              ? <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              : <XCircle className="w-10 h-10 text-red-400" />}
          </div>
          <h1 className="text-3xl font-black text-white tracking-tighter">Already Responded</h1>
          <p className="text-[#888] font-light">
            You already {request?.status} this invitation for <strong className="text-white">{request?.projectName}</strong>.
          </p>
          <Link
            href={request?.status === "accepted" && request.token
              ? `/employee-dashboard?tab=chat&chat=${encodeURIComponent(request.token)}`
              : "/employee-dashboard"}
            className="inline-flex items-center gap-2 px-6 py-3 silver-gradient text-black font-black uppercase tracking-widest text-xs rounded-xl">
            Open Dashboard <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </div>
    );
  }

  if (state === "need-sign-in") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        {bg}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <Lock className="w-10 h-10 text-indigo-400" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tighter">Sign in to continue</h1>
          <p className="text-[#888] font-light">
            This hire invitation must be accepted from the <strong className="text-white">invited developer account</strong> so your dashboard, PRD, and chat stay linked to you.
          </p>
          <Link href={signInHref}
            className="inline-flex items-center gap-2 px-8 py-4 silver-gradient text-black font-black uppercase tracking-widest text-xs rounded-2xl">
            Sign in / Create account <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="text-[10px] text-white/25 font-light">After signing in you’ll return to this invite automatically.</p>
        </motion.div>
      </div>
    );
  }

  if (state === "wrong-account") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        {bg}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <AlertTriangle className="w-10 h-10 text-amber-400" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tighter">Wrong account</h1>
          <p className="text-[#888] font-light text-sm leading-relaxed">
            This invitation is for the developer who received the email (BuildCraft user ID on the hire).
            You’re signed in as a different user, which is why you were seeing the wrong dashboard or data.
          </p>
          {error && <p className="text-xs text-amber-200/80 whitespace-pre-wrap">{error}</p>}
          <Link href={signInHref}
            className="inline-flex items-center gap-2 px-8 py-4 silver-gradient text-black font-black uppercase tracking-widest text-xs rounded-2xl">
            Switch account (sign in again) <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </div>
    );
  }

  if (state === "rejected") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        {bg}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <XCircle className="w-10 h-10 text-red-400" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tighter">Invitation Declined</h1>
          <p className="text-[#888] font-light">You declined the invitation. The project creator has been notified.</p>
          <Link href="/employee-dashboard" className="inline-flex items-center gap-2 px-6 py-3 border border-white/10 text-white/60 hover:text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all">
            Go to Dashboard
          </Link>
        </motion.div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        {bg}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <AlertTriangle className="w-10 h-10 text-red-400" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tighter">Something Went Wrong</h1>
          <p className="text-[#888] font-light whitespace-pre-wrap text-left max-w-md mx-auto">
            {error ?? "This invitation link is invalid or has expired."}
          </p>
          <Link href="/" className="inline-block text-white/40 hover:text-white text-sm font-bold transition-colors">← Go to BuildCraft</Link>
        </motion.div>
      </div>
    );
  }

  // ── Ready: show invite details ─────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      {bg}
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        className="max-w-lg w-full space-y-6">

        <div className="text-center space-y-2">
          <h1 className="text-4xl font-black text-white tracking-tighter">Project Invitation</h1>
          <p className="text-[#888] font-light">You have received a project hire request on BuildCraft AI</p>
        </div>

        {authUser && authUser.uid !== request?.developerUid && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-200/90 text-xs font-light">
            You’re signed in, but <strong className="text-white">not as the invited developer</strong>. Sign out and use the account that received this invite, or you’ll open the wrong dashboard.
          </div>
        )}

        <div className="glass-panel p-8 rounded-3xl border border-white/10 space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
              <User className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <p className="text-[10px] text-white/30 uppercase tracking-widest font-bold mb-0.5">From</p>
              <p className="text-white font-bold">{request?.creatorName}</p>
            </div>
          </div>

          <div className="p-5 bg-white/5 rounded-2xl border border-white/5 space-y-3">
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-white/40" />
              <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Project</span>
            </div>
            <h2 className="text-2xl font-black text-white tracking-tighter">{request?.projectName}</h2>
            <p className="text-[#888] text-sm font-light leading-relaxed">{request?.projectSummary || request?.projectIdea}</p>
          </div>

          <p className="text-xs text-yellow-400/70 font-light flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5" />
            This invitation expires in 48 hours. Please respond promptly.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => respond("accept")}
            className="flex-1 py-4 silver-gradient text-black font-black uppercase tracking-widest text-xs rounded-2xl flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.15)] hover:shadow-[0_0_30px_rgba(255,255,255,0.25)] transition-all"
          >
            <CheckCircle2 className="w-4 h-4" /> Accept Invitation
          </button>
          <button
            onClick={() => respond("reject")}
            className="flex-1 py-4 border border-white/10 text-white/50 hover:text-white hover:border-white/30 font-bold uppercase tracking-widest text-xs rounded-2xl flex items-center justify-center gap-2 transition-all"
          >
            <XCircle className="w-4 h-4" /> Decline
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-white/30" />
      </div>
    }>
      <InvitePageInner />
    </Suspense>
  );
}
