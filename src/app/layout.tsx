import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import AnimatedFavicon from "@/components/AnimatedFavicon";

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
        <AnimatedFavicon />
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
