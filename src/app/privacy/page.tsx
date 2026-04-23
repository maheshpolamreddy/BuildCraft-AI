import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#030303] text-white/80 px-6 py-16 max-w-2xl mx-auto">
      <p className="text-[10px] font-black uppercase tracking-widest text-white/35">Legal</p>
      <h1 className="mt-2 text-3xl font-black text-white tracking-tight">Privacy</h1>
      <p className="mt-4 text-sm font-light leading-relaxed">
        BuildCraft processes account and usage data needed to run the product (authentication, project data you
        create in the app, and communications you initiate). See your Firebase and hosting providers for their
        respective privacy terms. For product-specific privacy questions, contact the team running this deployment.
      </p>
      <Link href="/" className="mt-10 inline-block text-xs font-bold uppercase tracking-widest text-indigo-400 hover:text-indigo-300">
        Back to home
      </Link>
    </main>
  );
}