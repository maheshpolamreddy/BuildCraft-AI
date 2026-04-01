"use client";

import { motion } from "framer-motion";

interface LogoProps {
  className?: string;
  glow?: boolean;
}

export default function Logo({ className = "w-6 h-6", glow = true }: LogoProps) {
  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {glow && (
        <motion.div
          className="absolute inset-0 bg-blue-500 rounded-full blur-[10px]"
          animate={{
            opacity: [0.2, 0.5, 0.2],
            scale: [0.8, 1.1, 0.8],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <motion.svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full relative z-10 drop-shadow-lg"
      >
        {/* Top Face */}
        <motion.path
          d="M 50 15 L 85 35 L 50 55 L 15 35 Z"
          stroke="url(#blue-gradient)"
          strokeWidth="4"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0, y: -20 }}
          animate={{ pathLength: 1, opacity: 1, y: 0 }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.1 }}
        />
        {/* Left Face */}
        <motion.path
          d="M 15 35 L 50 55 L 50 95 L 15 75 Z"
          stroke="url(#blue-gradient)"
          strokeWidth="4"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0, x: -20, y: 10 }}
          animate={{ pathLength: 1, opacity: 1, x: 0, y: 0 }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.4 }}
        />
        {/* Right Face */}
        <motion.path
          d="M 85 35 L 50 55 L 50 95 L 85 75 Z"
          stroke="url(#emerald-gradient)"
          strokeWidth="4"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0, x: 20, y: 10 }}
          animate={{ pathLength: 1, opacity: 1, x: 0, y: 0 }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.7 }}
        />

        {/* Inner network connections (AI) */}
        <motion.path
          d="M 50 55 L 50 25 M 50 55 L 25 70 M 50 55 L 75 70"
          stroke="url(#white-gradient)"
          strokeWidth="2"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.8 }}
          transition={{ duration: 1.5, ease: "easeInOut", delay: 1.2 }}
        />

        {/* Center glowing node */}
        <motion.circle
          cx="50"
          cy="55"
          r="4"
          fill="#ffffff"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [1, 1.3, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2, repeat: Infinity, delay: 1.8 }}
        />

        {/* Outer rotating nodes ring */}
        <motion.g
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, rotate: 360 }}
          transition={{
            opacity: { duration: 1, delay: 1.5 },
            rotate: { duration: 15, repeat: Infinity, ease: "linear" },
          }}
          style={{ transformOrigin: "50% 55%" }}
        >
          <circle cx="50" cy="55" r="35" stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="4 8" />
          <circle cx="85" cy="55" r="3" fill="#34d399" />
          <circle cx="15" cy="55" r="3" fill="#4facfe" />
          <circle cx="50" cy="20" r="3" fill="#ffffff" />
        </motion.g>

        {/* Floating tech crosshairs */}
        <motion.path
          d="M 5 15 L 15 15 M 10 10 L 10 20"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="1"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 3, repeat: Infinity, delay: 2 }}
        />
        <motion.path
          d="M 85 85 L 95 85 M 90 80 L 90 90"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="1"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 3, repeat: Infinity, delay: 3.5 }}
        />

        <defs>
          <linearGradient id="blue-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4facfe" />
            <stop offset="100%" stopColor="#00f2fe" />
          </linearGradient>
          <linearGradient id="emerald-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
          <linearGradient id="white-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>
      </motion.svg>
    </div>
  );
}
