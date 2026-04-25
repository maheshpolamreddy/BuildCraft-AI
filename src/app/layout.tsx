import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "lenis/dist/lenis.css";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import AnimatedFavicon from "@/components/AnimatedFavicon";
import NextTopLoader from "nextjs-toploader";
import {
  DocumentScrollGlowRail,
  ScrollToTopOnRoute,
  SmoothScrollProvider,
} from "@/components/scroll-glow/ScrollGlowRail";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "BuildCraft AI | Universal Explainer & Builder",
  description: "Enterprise Architectural Precision and execution strategy in real-time.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} antialiased dark min-h-screen`}>
      <body suppressHydrationWarning className="bg-black text-on-surface font-body selection:bg-primary selection:text-on-primary min-h-screen threads-bg relative overflow-x-hidden">
        <NextTopLoader color="#4f46e5" showSpinner={false} />
        <AnimatedFavicon />
        <SmoothScrollProvider>
          <ScrollToTopOnRoute />
          <AuthProvider>
            <DocumentScrollGlowRail />
            {children}
          </AuthProvider>
        </SmoothScrollProvider>
      </body>
    </html>
  );
}
