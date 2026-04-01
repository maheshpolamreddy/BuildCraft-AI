"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Logo from "@/components/Logo";
import {
  Code2,
  Database,
  Cloud,
  Cpu,
  Smartphone,
  Layers,
  Box,
  Server,
  Globe,
  Terminal,
  Activity,
  Zap
} from "lucide-react";

interface AnimatedLogoOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

const TOOLS = [
  { icon: Code2, color: "text-blue-400" },
  { icon: Database, color: "text-emerald-400" },
  { icon: Cloud, color: "text-purple-400" },
  { icon: Cpu, color: "text-red-400" },
  { icon: Smartphone, color: "text-yellow-400" },
  { icon: Layers, color: "text-pink-400" },
  { icon: Box, color: "text-indigo-400" },
  { icon: Server, color: "text-cyan-400" },
  { icon: Globe, color: "text-fuchsia-400" },
  { icon: Terminal, color: "text-lime-400" },
  { icon: Activity, color: "text-orange-400" },
  { icon: Zap, color: "text-teal-400" },
];

export default function AnimatedLogoOverlay({ isOpen, onClose }: AnimatedLogoOverlayProps) {
  // Automatically close after 5.5 seconds (allowing all animations to finish)
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        onClose();
      }, 5500);
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

  // Prevent scrolling when overlay is active
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
          transition={{ duration: 0.6 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md"
        >
          {/* Central Logo Container */}
          <div className="relative flex items-center justify-center w-[500px] h-[500px]">
            {/* The Logo itself expanding and glowing dynamically */}
            <motion.div
              initial={{ scale: 0.5, rotate: -45, filter: "blur(10px)", opacity: 0 }}
              animate={{ 
                scale: [0.5, 1.2, 1], 
                rotate: 0, 
                filter: ["blur(10px)", "blur(0px)", "blur(0px)"],
                opacity: 1
              }}
              exit={{ scale: 0.8, opacity: 0, filter: "blur(10px)" }}
              transition={{ duration: 1.2, ease: "easeOut" }}
              className="relative z-20 flex flex-col items-center gap-6"
            >
              <Logo className="w-40 h-40 drop-shadow-[0_0_60px_rgba(59,130,246,0.8)]" glow={false} />
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1, duration: 0.8 }}
              >
                <h1 className="text-4xl font-black tracking-[0.2em] shiny-silver-text uppercase">
                  BuildCraft AI
                </h1>
                <p className="text-blue-400/80 text-center tracking-widest text-xs uppercase font-bold mt-2">
                  System Orchestration
                </p>
              </motion.div>
            </motion.div>

            {/* A massive backdrop pulse underneath the core logo representing energy absorption */}
            <motion.div
              className="absolute inset-0 bg-blue-500/20 rounded-full blur-[80px] pointer-events-none z-0"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [1, 2.5, 1.5], opacity: [0, 0.5, 0] }}
              transition={{ duration: 3.5, delay: 1.5, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute inset-0 bg-purple-500/20 rounded-full blur-[80px] pointer-events-none z-0"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 2, 1], opacity: [0, 0.4, 0] }}
              transition={{ duration: 3.5, delay: 1.8, ease: "easeInOut" }}
            />

            {/* Technical Tool Icons swarming into the core */}
            {TOOLS.map((tool, i) => {
              const Icon = tool.icon;
              const angle = (i / TOOLS.length) * Math.PI * 2;
              
              // Start far outside the view circle
              const startRadius = window.innerWidth > window.innerHeight ? window.innerWidth * 0.7 : window.innerHeight * 0.7;
              const startX = Math.cos(angle) * startRadius;
              const startY = Math.sin(angle) * startRadius;

              // Arc path parameters
              const arcOffset = i % 2 === 0 ? 150 : -150;
              const midX = startX * 0.4 + Math.sin(angle) * arcOffset;
              const midY = startY * 0.4 + Math.cos(angle) * arcOffset;

              return (
                <motion.div
                  key={i}
                  className={`absolute z-10 p-4 rounded-2xl glass-panel border border-white/10 shadow-[0_0_30px_rgba(255,255,255,0.1)] backdrop-blur-md ${tool.color}`}
                  initial={{ x: startX, y: startY, scale: 0, rotate: -180, opacity: 0 }}
                  // Sequence:
                  // 1) Spawn far away and scale up
                  // 2) Curve towards the middle
                  // 3) Slam into (0,0) and scale down to 0
                  animate={{
                    x: [startX, midX, 0],
                    y: [startY, midY, 0],
                    scale: [0, 1.2, 0.5, 0],
                    rotate: [-180, 0, 180],
                    opacity: [0, 1, 1, 0],
                  }}
                  transition={{
                    duration: 2.2,
                    ease: "easeInOut",
                    delay: 1.2 + i * 0.15, // staggered entry starting 1.2s after logo spawns
                  }}
                >
                  <Icon className="w-10 h-10" strokeWidth={1.5} />
                </motion.div>
              );
            })}
            
            {/* The final pulse when all the tech stacks are absorbed */}
            <motion.div
              className="absolute w-32 h-32 bg-white rounded-full z-[100] blur-sm mix-blend-overlay"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 15], opacity: [0, 1, 0] }}
              transition={{ duration: 0.8, delay: 4.2, ease: "easeOut" }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
