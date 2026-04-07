"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Shield, Zap, Search, Layers, UserCheck, ShieldCheck, Code2 as Code2Icon, LogOut, ChevronUp, Command } from "lucide-react";
import Link from "next/link";
import type { SVGProps } from "react";
import Threads from "@/components/Threads";
import Logo from "@/components/Logo";
import AnimatedLogoOverlay from "@/components/AnimatedLogoOverlay";
import { useRouter } from "next/navigation";
import { useStore } from "@/store/useStore";
import { signOutUser } from "@/lib/auth";

// Smooth-scroll back to the very top of the page
function GoHome() {
  return (
    <div className="flex justify-end pt-6">
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/20 hover:text-white/60 transition-colors group"
      >
        <ChevronUp className="w-3.5 h-3.5 group-hover:-translate-y-0.5 transition-transform" />
        Back to top
      </button>
    </div>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const { currentUser, developerProfile, project, reset } = useStore();
  const [showLogoEasterEgg, setShowLogoEasterEgg] = useState(false);

  // True when the developer has completed registration
  const isDeveloper = !!(developerProfile && developerProfile.profileStatus === "active");

  /** Decide where "Start Building" should go based on the user's current progress */
  function getStartBuildingHref(): string {
    if (!currentUser) return "/auth";
    if (project?.locked)           return "/project-room";
    if (project?.assumptions?.every(a => a.accepted)) return "/architecture";
    if (project)                   return "/discovery";
    return "/discovery";
  }

  /** Label for the CTA based on progress */
  function getStartBuildingLabel(): string {
    if (!currentUser) return "Start Building";
    if (project?.locked)           return "Continue Workspace";
    if (project)                   return "Continue Project";
    return "Start Building";
  }

  async function handleLogout() {
    try {
      await signOutUser();
    } catch (err) {
      console.warn("Logout failed:", err);
    } finally {
      reset();
      router.push("/");
    }
  }

  return (
    <div id="top" className="min-h-screen relative flex flex-col font-body overflow-x-hidden">
      <AnimatedLogoOverlay isOpen={showLogoEasterEgg} onClose={() => setShowLogoEasterEgg(false)} />
      {/* Dynamic Backgrounds */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] z-50 bg-[url('/noise.svg')]" />
      <div className="fixed top-0 left-1/4 w-[800px] h-[800px] bg-white/[0.02] rounded-full blur-[150px] pointer-events-none -z-10" />
      <div className="fixed bottom-0 right-1/4 w-[600px] h-[600px] bg-blue-500/[0.01] rounded-full blur-[150px] pointer-events-none -z-10" />

      {/* WebGL Threads Fixed Background */}
      <div className="fixed inset-0 -z-20 opacity-80 pointer-events-none">
        <Threads amplitude={2} distance={0} enableMouseInteraction={true} color={[0.2, 0.4, 0.9]} />
      </div>

      {/* ── Refined Sleek Floating Header ────────────────────────────────────────── */}
      <div className="fixed top-0 left-0 right-0 z-50 flex justify-center p-6 pointer-events-none">
        <motion.header 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="glass-panel pointer-events-auto max-w-6xl w-full border border-white/10 bg-[#0A0A0A]/60 backdrop-blur-3xl px-8 py-3.5 rounded-[2.5rem] flex justify-between items-center shadow-2xl shadow-indigo-500/10 relative group transition-all duration-700 hover:border-white/20 hover:shadow-indigo-500/20"
        >
          {/* Visual Highlight Beam & Grain */}
          <div className="absolute inset-x-20 -top-px h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
          <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[url('/noise.svg')] rounded-[2.5rem]" />
          
          <div className="flex items-center gap-5">
            <button 
              onClick={() => setShowLogoEasterEgg(true)}
              className="flex items-center gap-3 group/logo shrink-0"
            >
              <div className="relative">
                <Logo className="w-10 h-10 group-hover/logo:scale-110 transition-transform duration-700 ease-[0.23,1,0.32,1]" />
                <div className="absolute inset-0 bg-blue-500/30 blur-2xl rounded-full opacity-0 group-hover/logo:opacity-100 transition-opacity duration-1000" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-lg font-black tracking-tighter text-white uppercase leading-none">
                  BuildCraft <span className="text-blue-500">AI</span>
                </span>
                <span className="text-[7px] font-black tracking-[0.5em] text-white/40 uppercase mt-1 ml-0.5">Intelligence Engine</span>
              </div>
            </button>
          </div>

          {/* Premium Nav Links */}
          <nav className="hidden lg:flex items-center justify-center gap-12">
            {[
              { label: "Features", href: "#features" },
              { label: "How it Works", href: "#" },
              { label: "Trust Center", href: "#compliance" },
            ].map((link) => (
              <Link 
                key={link.label} 
                href={link.href} 
                className="relative text-[9px] font-black uppercase tracking-[0.3em] text-white/30 hover:text-white transition-all duration-500 group/link whitespace-nowrap"
              >
                {link.label}
                <motion.span 
                  className="absolute -bottom-1 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500 to-transparent scale-x-0 group-hover/link:scale-x-100 transition-transform duration-500" 
                />
              </Link>
            ))}
          </nav>

          <div className="flex items-center justify-end gap-6">
            <div className="flex items-center gap-4 border-l border-white/10 pl-6">
              {currentUser ? (
                <button
                  onClick={handleLogout}
                  className="p-2.5 rounded-xl border border-white/5 bg-white/5 text-white/20 hover:text-white hover:border-white/20 hover:bg-white/10 transition-all"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              ) : (
                <Link 
                  href="/auth" 
                  className="px-6 py-3 bg-white/10 border border-white/10 text-white font-black uppercase tracking-[0.2em] text-[9px] rounded-[1.2rem] transition-all hover:bg-white hover:text-black hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-black/20"
                >
                  Sign In
                </Link>
              )}

              {/* Dynamic Sleek CTA */}
              <button
                onClick={() => router.push(getStartBuildingHref())}
                className="px-7 py-3 bg-white text-black font-black uppercase tracking-[0.2em] text-[10px] rounded-[1.2rem] shadow-xl shadow-white/10 hover:bg-blue-50 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 group/cta"
              >
                {getStartBuildingLabel()}
                <ArrowRight className="w-3.5 h-3.5 group-hover/cta:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </motion.header>
      </div>

      {/* ── Hero Section ──────────────────────────────────────────────────────── */}
      <section className="pt-32 pb-20 px-6 relative flex flex-col items-center justify-center text-center min-h-[80vh]">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-5xl space-y-8 relative z-10"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-panel border border-white/10 mb-4">
            <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/70">BuildCraft AI</span>
          </div>
          
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter shiny-silver-text leading-[1.1] pb-2">
            From Idea To Reality<br/>
            In Minutes.
          </h1>
          
          <p className="text-[#888] text-xl md:text-2xl font-light tracking-wide max-w-3xl mx-auto leading-relaxed">
            Describe your app idea, and our AI will recommend the best tools, plan the structure, and connect you with top developers—all in a secure workspace.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
            <button
              onClick={() => router.push(getStartBuildingHref())}
              className="w-full sm:w-auto px-8 py-5 silver-gradient text-black font-black uppercase tracking-[0.15em] text-xs rounded-xl shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_40px_rgba(255,255,255,0.2)] transition-all flex items-center justify-center gap-3 group"
            >
              {getStartBuildingLabel()} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
            {/* Developer CTA only shown to non-developers (logged out or not yet registered) */}
            {!isDeveloper && (
              <Link href="/auth?as=developer" className="w-full sm:w-auto px-8 py-5 glass-panel font-bold uppercase tracking-[0.15em] text-xs rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/50 transition-all flex items-center justify-center gap-3">
                <Code2Icon className="w-4 h-4" /> I&apos;m a Developer
              </Link>
            )}
            {isDeveloper && (
              <Link href="/employee-dashboard" className="w-full sm:w-auto px-8 py-5 glass-panel font-bold uppercase tracking-[0.15em] text-xs rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/50 transition-all flex items-center justify-center gap-3">
                <UserCheck className="w-4 h-4" /> Go to My Dashboard
              </Link>
            )}
          </div>
        </motion.div>

        <GoHome />
      </section>

      {/* ── Core Pillars / Features ───────────────────────────────────────────── */}
      <section id="features" className="py-32 px-8 relative z-10 border-t border-white/5 bg-gradient-to-b from-black/0 via-[#020202] to-black">
        <div className="max-w-7xl mx-auto">
          {/* Section header */}
          <div className="text-center mb-20 space-y-4">
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-500 flex items-center justify-center gap-2">
              <Zap className="w-4 h-4" /> The Engine
            </h2>
            <h3 className="text-4xl md:text-6xl font-black shiny-silver-text tracking-tighter pb-2">
              Everything you need to ship.<br/>Zero guesswork.
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="group relative h-full flex flex-col p-[1px] rounded-[2.5rem] bg-gradient-to-b from-white/10 to-transparent hover:from-blue-500/50 transition-colors duration-700 overflow-hidden"
            >
              <div className="absolute inset-0 bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-2xl z-0" />
              <div className="relative z-10 flex-1 bg-[#050505] p-10 rounded-[2.5rem] flex flex-col justify-between overflow-hidden">
                <div className="absolute -right-10 -top-10 w-48 h-48 bg-blue-500/10 rounded-full blur-[50px] group-hover:bg-blue-500/20 transition-colors duration-700" />
                
                <div className="relative z-10">
                  <div className="w-14 h-14 bg-gradient-to-br from-blue-500/20 to-blue-500/5 border border-blue-500/20 rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500 shadow-[0_0_20px_rgba(59,130,246,0.1)] group-hover:shadow-[0_0_40px_rgba(59,130,246,0.4)]">
                    <Search className="w-6 h-6 text-blue-400 group-hover:text-white transition-colors" />
                  </div>
                  <h3 className="text-2xl font-black text-white mb-4 tracking-tight">Smart Idea Extraction</h3>
                  <p className="text-[#888] text-sm leading-relaxed group-hover:text-white/80 transition-colors duration-300">
                    Just explain your app in plain English. We instantly figure out the exact features, timeline, and tools you need.
                  </p>
                </div>

                {/* UI Micro-interaction */}
                <div className="mt-12 h-28 border border-white/5 bg-black/50 rounded-2xl p-5 flex flex-col gap-3 relative overflow-hidden group-hover:border-blue-500/30 transition-colors duration-500">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-500/10 to-transparent -translate-x-full group-hover:translate-x-full duration-1000 transition-transform" />
                  <div className="w-4/5 h-2.5 bg-white/10 rounded-full" />
                  <div className="w-1/2 h-2.5 bg-white/5 rounded-full" />
                  <div className="flex items-center gap-2 mt-auto">
                    <div className="w-4 h-4 rounded-md bg-blue-500/20 border border-blue-500/50 flex items-center justify-center">
                      <Zap className="w-2.5 h-2.5 text-blue-400" />
                    </div>
                    <div className="h-2.5 flex-1 bg-white/5 rounded-full" />
                  </div>
                  <div className="absolute bottom-5 right-5 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-500 delay-100">
                    <span className="flex h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                    <span className="text-[9px] font-bold uppercase tracking-widest text-blue-400">Parsing</span>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="group relative h-full flex flex-col p-[1px] rounded-[2.5rem] bg-gradient-to-b from-white/10 to-transparent hover:from-emerald-500/50 transition-colors duration-700 overflow-hidden"
            >
              <div className="absolute inset-0 bg-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-2xl z-0" />
              <div className="relative z-10 flex-1 bg-[#050505] p-10 rounded-[2.5rem] flex flex-col justify-between overflow-hidden">
                <div className="absolute -left-10 -bottom-10 w-48 h-48 bg-emerald-500/10 rounded-full blur-[50px] group-hover:bg-emerald-500/20 transition-colors duration-700" />
                
                <div className="relative z-10">
                  <div className="w-14 h-14 bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/20 rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-500 shadow-[0_0_20px_rgba(16,185,129,0.1)] group-hover:shadow-[0_0_40px_rgba(16,185,129,0.4)]">
                    <Layers className="w-6 h-6 text-emerald-400 group-hover:text-white transition-colors" />
                  </div>
                  <h3 className="text-2xl font-black text-white mb-4 tracking-tight">Automated Planning & Tools</h3>
                  <p className="text-[#888] text-sm leading-relaxed group-hover:text-white/80 transition-colors duration-300">
                    We create a complete, step-by-step technical plan for your app. We&apos;ll even tell you exactly why we chose each tool and any risks involved.
                  </p>
                </div>

                {/* UI Micro-interaction */}
                <div className="mt-12 h-28 border border-white/5 bg-black/50 rounded-2xl p-5 flex items-center justify-between relative overflow-hidden group-hover:border-emerald-500/30 transition-colors duration-500">
                  <div className="flex flex-col gap-2 w-full z-10">
                    <div className="flex justify-between items-center text-[9px] uppercase tracking-widest font-bold text-[#555] group-hover:text-emerald-500/50 transition-colors">
                      <span>Architecture</span>
                      <span className="text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity">100%</span>
                    </div>
                    {/* Progress bar effect */}
                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 w-[20%] group-hover:w-full transition-all duration-1000 ease-out" />
                    </div>
                    <div className="flex gap-2 mt-2 opacity-30 group-hover:opacity-100 transition-opacity duration-700 delay-200">
                      <div className="w-6 h-6 rounded bg-white/10 flex items-center justify-center"><Code2Icon className="w-3 h-3 text-white" /></div>
                      <div className="w-6 h-6 rounded bg-white/10 flex items-center justify-center"><ShieldCheck className="w-3 h-3 text-white" /></div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="group relative h-full flex flex-col p-[1px] rounded-[2.5rem] bg-gradient-to-b from-white/10 to-transparent hover:from-purple-500/50 transition-colors duration-700 overflow-hidden"
            >
              <div className="absolute inset-0 bg-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-2xl z-0" />
              <div className="relative z-10 flex-1 bg-[#050505] p-10 rounded-[2.5rem] flex flex-col justify-between overflow-hidden">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-purple-500/5 rounded-full blur-[50px] group-hover:bg-purple-500/20 transition-colors duration-700" />
                
                <div className="relative z-10">
                  <div className="w-14 h-14 bg-gradient-to-br from-purple-500/20 to-purple-500/5 border border-purple-500/20 rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 group-hover:rotate-6 transition-transform duration-500 shadow-[0_0_20px_rgba(168,85,247,0.1)] group-hover:shadow-[0_0_40px_rgba(168,85,247,0.4)]">
                    <UserCheck className="w-6 h-6 text-purple-400 group-hover:text-white transition-colors" />
                  </div>
                  <h3 className="text-2xl font-black text-white mb-4 tracking-tight">Find Proven Developers</h3>
                  <p className="text-[#888] text-sm leading-relaxed group-hover:text-white/80 transition-colors duration-300">
                    Our system matches you only with developers who have proven experience with the exact tools your project needs.
                  </p>
                </div>

                {/* UI Micro-interaction */}
                <div className="mt-12 h-28 border border-white/5 bg-black/50 rounded-2xl p-5 flex items-center gap-4 relative overflow-hidden group-hover:border-purple-500/30 transition-colors duration-500 translate-y-0">
                  {/* Mock profile picture */}
                  <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 p-[2px] shrink-0 opacity-50 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="w-full h-full bg-[#111] rounded-full flex items-center justify-center">
                      <UserCheck className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 w-full">
                    <div className="h-2.5 w-24 bg-white/10 rounded-full" />
                    <div className="h-2 w-16 bg-white/5 rounded-full" />
                    <div className="flex gap-1 mt-1">
                      {[1,2,3,4,5].map((star) => (
                        <span key={star} className="text-yellow-500/20 group-hover:text-yellow-500 transition-colors text-[10px]" style={{ transitionDelay: `${star * 50}ms` }}>★</span>
                      ))}
                    </div>
                  </div>
                  {/* Verified badge slide in */}
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 translate-x-10 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-500 delay-100">
                    <div className="w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/50 flex items-center justify-center text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.5)]">
                      ✓
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          <GoHome />
        </div>
      </section>

      {/* ── Trust & Safety Section ────────────────────────────────────────────── */}
      <section id="compliance" className="py-32 px-8 border-y border-white/5 bg-[#020202] relative z-10 overflow-hidden">
        {/* Background glow effects */}
        <div className="absolute top-0 right-1/4 w-[800px] h-[800px] bg-yellow-500/5 rounded-full blur-[120px] pointer-events-none -z-10" />
        <div className="absolute bottom-0 left-1/4 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none -z-10" />

        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-20">
          
          {/* Left Hero Text & Chips */}
          <div className="flex-1 space-y-10 relative z-10">
            <motion.div 
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="space-y-6"
            >
              <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-yellow-500 flex items-center gap-2 bg-yellow-500/10 w-fit px-4 py-2 rounded-full border border-yellow-500/20 shadow-[0_0_15px_rgba(234,179,8,0.2)]">
                <ShieldCheck className="w-4 h-4" /> Enterprise-Grade Security
              </h2>
              <h3 className="text-5xl md:text-6xl font-black shiny-silver-text tracking-tight leading-[1.1] pb-2">
                Safe, Secure,<br/>and Built for Trust.
              </h3>
              <p className="text-[#888] text-lg font-light leading-relaxed max-w-lg">
                You stay in absolute control. You approve every step, review every algorithm&apos;s decision, and all project funds are protected by smart milestones.
              </p>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="flex flex-wrap gap-3"
            >
              {[
                { icon: Shield, text: "SOC2 Type II", color: "text-blue-400", border: "border-blue-500/30", bg: "bg-blue-500/10" },
                { icon: Layers, text: "GDPR Compliant", color: "text-emerald-400", border: "border-emerald-500/30", bg: "bg-emerald-500/10" },
                { icon: Zap, text: "End-to-End Encrypted", color: "text-purple-400", border: "border-purple-500/30", bg: "bg-purple-500/10" },
                { icon: UserCheck, text: "Milestone Escrow", color: "text-yellow-400", border: "border-yellow-500/30", bg: "bg-yellow-500/10" },
                { icon: Search, text: "Automated Dispute Res", color: "text-pink-400", border: "border-pink-500/30", bg: "bg-pink-500/10" },
              ].map((chip, i) => {
                const Icon = chip.icon;
                return (
                  <div key={i} className={`flex items-center gap-2 px-4 py-2.5 rounded-full border ${chip.border} ${chip.bg} backdrop-blur-md hover:scale-105 transition-transform cursor-default group shadow-[0_0_15px_rgba(0,0,0,0.5)]`}>
                    <Icon className={`w-3.5 h-3.5 ${chip.color} group-hover:scale-110 transition-transform`} />
                    <span className="text-white text-xs font-bold uppercase tracking-widest">{chip.text}</span>
                  </div>
                );
              })}
            </motion.div>
          </div>

          {/* Right Live Action Tracker (Cyber-Vault Look) */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, rotateY: -15 }}
            whileInView={{ opacity: 1, scale: 1, rotateY: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="flex-1 w-full perspective-[1000px]"
          >
            <div className="relative bg-[#050505] rounded-[3rem] p-[1px] overflow-hidden shadow-[0_0_100px_rgba(234,179,8,0.15)] group transform-gpu transition-all duration-700 hover:shadow-[0_0_120px_rgba(234,179,8,0.25)]">
              {/* Animated metallic border */}
              <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/50 via-white/5 to-blue-500/50 opacity-50 group-hover:opacity-100 transition-opacity duration-700" />
              
              {/* Inner card body */}
              <div className="relative h-full bg-[#030303]/95 backdrop-blur-3xl p-10 rounded-[3rem] overflow-hidden flex flex-col">
                {/* Simulated Radar Scanline */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-[3rem]">
                  <motion.div 
                    className="w-[200%] h-[1px] bg-gradient-to-r from-transparent via-yellow-500/30 to-transparent absolute top-1/2 -left-1/2"
                    animate={{ y: [-300, 300] }}
                    transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                  />
                </div>

                <div className="absolute -right-20 -top-20 w-64 h-64 bg-yellow-500/10 rounded-full blur-[80px]" />
                <div className="absolute -left-20 -bottom-20 w-64 h-64 bg-blue-500/10 rounded-full blur-[80px]" />
                
                <div className="relative z-10 space-y-6">
                  <div className="flex items-center justify-between border-b border-white/10 pb-6 mb-8">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse shadow-[0_0_10px_rgba(234,179,8,0.8)]" />
                      <span className="text-xs font-black uppercase tracking-[0.2em] text-[#888]">Live Audit Log</span>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[9px] font-bold text-white/50 uppercase tracking-widest">
                      Secured
                    </span>
                  </div>

                  <div className="space-y-4">
                    {/* Log Item 1 */}
                    <motion.div 
                      initial={{ opacity: 0, x: 20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.3 }}
                      className="p-5 bg-gradient-to-r from-blue-500/10 to-transparent rounded-2xl border border-blue-500/20 backdrop-blur-sm relative overflow-hidden"
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />
                      <div className="flex justify-between items-start mb-2">
                        <div className="text-[10px] text-blue-400 font-bold uppercase tracking-widest flex items-center gap-1.5"><Code2Icon className="w-3 h-3"/> Override Complete</div>
                        <span className="text-[10px] text-blue-500/50 font-mono">14:02:44</span>
                      </div>
                      <p className="text-white/90 text-sm font-medium">
                        {"You forced 'Vercel + Next.js' architecture over the AI's 'AWS' recommendation."}
                      </p>
                    </motion.div>

                    {/* Log Item 2 */}
                    <motion.div 
                      initial={{ opacity: 0, x: 20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.5 }}
                      className="p-5 bg-gradient-to-r from-emerald-500/10 to-transparent rounded-2xl border border-emerald-500/20 backdrop-blur-sm relative overflow-hidden"
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />
                      <div className="flex justify-between items-start mb-2">
                        <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest flex items-center gap-1.5"><ShieldCheck className="w-3 h-3"/> Milestone Activated</div>
                        <span className="text-[10px] text-emerald-500/50 font-mono">14:03:12</span>
                      </div>
                      <p className="text-white/90 text-sm font-medium">Top-Rated Developer perfectly matched. Escrow funds secured.</p>
                    </motion.div>

                    {/* Log Item 3 */}
                    <motion.div 
                      initial={{ opacity: 0, x: 20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.7 }}
                      className="p-5 bg-gradient-to-r from-white/5 to-transparent rounded-2xl border border-white/10 backdrop-blur-sm relative overflow-hidden opacity-50"
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-white/20" />
                      <div className="flex justify-between items-start mb-2">
                        <div className="text-[10px] text-white/40 font-bold uppercase tracking-widest flex items-center gap-1.5"><Layers className="w-3 h-3"/> Blueprint Save</div>
                        <span className="text-[10px] text-white/30 font-mono">14:03:45</span>
                      </div>
                      <p className="text-white/60 text-sm font-medium">Immutable blueprint saved to the secure vault.</p>
                    </motion.div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="max-w-7xl mx-auto">
          <GoHome />
        </div>
      </section>

      {/* ── Call to Action ────────────────────────────────────────────────────── */}
      <section className="py-32 px-8 text-center relative z-10">
        <div className="max-w-4xl mx-auto space-y-8">
          <h2 className="text-5xl md:text-7xl font-black shiny-silver-text tracking-tighter pb-2">Ready to Start Your Project?</h2>
          <p className="text-[#888] text-xl font-light">Join the platform that turns simple ideas into real, scalable apps.</p>
          <div className="pt-8">
            <button
              onClick={() => router.push(getStartBuildingHref())}
              className="inline-flex items-center justify-center gap-3 px-10 py-5 silver-gradient text-black font-black uppercase tracking-[0.2em] text-sm rounded-2xl shadow-[0_0_30px_rgba(255,255,255,0.15)] hover:shadow-[0_0_50px_rgba(255,255,255,0.3)] transition-all transform hover:-translate-y-1"
            >
              {project ? "Continue Your Project" : "Create Your First Project"} <Zap className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="max-w-4xl mx-auto">
          <GoHome />
        </div>
      </section>

      {/* ── Modernized Premium Footer ────────────────────────────────────────────── */}
      <footer className="bg-[#050505] border-t border-white/5 pt-20 pb-10 px-8 relative z-10">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-20">
          
          {/* Branding & Mission */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 group/logo-footer">
              <Logo className="w-9 h-9 group-hover/logo-footer:drop-shadow-[0_0_15px_rgba(59,130,246,0.6)] transition-all" />
              <div className="flex flex-col">
                <span className="text-xl font-black tracking-tighter text-white uppercase leading-none">BuildCraft</span>
                <span className="text-[8px] font-black tracking-[0.4em] text-blue-500 uppercase mt-0.5 ml-0.5">Intelligence</span>
              </div>
            </div>
            <p className="text-[#888] text-xs font-light leading-relaxed max-w-xs">
              Empowering the next generation of builders with autonomous project orchestration and top-tier verified talent matching.
            </p>
            <div className="flex items-center gap-3">
              <div className="px-3 py-1.5 rounded-full border border-white/5 bg-white/5 text-white/40 font-bold text-[9px] uppercase tracking-widest hover:text-white hover:bg-white/10 transition-all cursor-default flex items-center gap-1.5">
                <Shield className="w-3 h-3" /> SOC2 COMPLIANT
              </div>
            </div>
          </div>

          {/* Platform Navigation */}
          <div className="space-y-6">
            <h4 className="text-[10px] font-black text-white uppercase tracking-[0.3em]">Platform</h4>
            <nav className="flex flex-col gap-4">
              <Link href="/discovery" className="text-[10px] font-black uppercase tracking-[0.2em] text-[#555] hover:text-white transition-colors">Discovery Hub</Link>
              <Link href="/architecture" className="text-[10px] font-black uppercase tracking-[0.2em] text-[#555] hover:text-white transition-colors">Architecture</Link>
              <Link href="/project-room" className="text-[10px] font-black uppercase tracking-[0.2em] text-[#555] hover:text-white transition-colors">Project Room</Link>
              <Link href="/employee-dashboard" className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500/50 hover:text-blue-400 transition-colors">Developer Portal</Link>
            </nav>
          </div>

          {/* Resources & Support */}
          <div className="space-y-6">
            <h4 className="text-[10px] font-black text-white uppercase tracking-[0.3em]">Resources</h4>
            <nav className="flex flex-col gap-4">
              <Link href="#" className="text-[10px] font-black uppercase tracking-[0.2em] text-[#555] hover:text-white transition-colors">API Docs</Link>
              <Link href="#" className="text-[10px] font-black uppercase tracking-[0.2em] text-[#555] hover:text-white transition-colors">Trust Center</Link>
              <Link href="#" className="text-[10px] font-black uppercase tracking-[0.2em] text-[#555] hover:text-white transition-colors">Dispute Resolution</Link>
              <Link href="#" className="text-[10px] font-black uppercase tracking-[0.2em] text-[#555] hover:text-white transition-colors">Brand Assets</Link>
            </nav>
          </div>

          {/* Company & Legal */}
          <div className="space-y-6">
            <h4 className="text-[10px] font-black text-white uppercase tracking-[0.3em]">Company</h4>
            <nav className="flex flex-col gap-4">
              <Link href="#" className="text-[10px] font-black uppercase tracking-[0.2em] text-[#555] hover:text-white transition-colors">About Us</Link>
              <Link href="#" className="text-[10px] font-black uppercase tracking-[0.2em] text-[#555] hover:text-white transition-colors">Privacy Policy</Link>
              <Link href="#" className="text-[10px] font-black uppercase tracking-[0.2em] text-[#555] hover:text-white transition-colors">Terms of Service</Link>
              <button 
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/30 hover:text-white transition-all group/bt"
              >
                Back To Top <ChevronUp className="w-3.5 h-3.5 group-hover/bt:-translate-y-0.5 transition-transform" />
              </button>
            </nav>
          </div>
        </div>

        {/* Global Status & Legal Row */}
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6 pt-10 border-t border-white/5">
          <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em]">
            © 2025 – BuildCraft AI. ALL SYSTEM RIGHTS RESERVED.
          </p>
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2 group/status">
              <span className="text-[9px] font-black text-white/30 uppercase tracking-widest group-hover:text-white/60 transition-colors">Status</span>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-emerald-500/10 bg-emerald-500/5">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse blur-[1px]" />
                <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Operational</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
