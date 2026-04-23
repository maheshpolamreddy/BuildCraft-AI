import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#030303] text-white/80 px-6 py-16 max-w-2xl mx-auto">
      <p className="text-[10px] font-black uppercase tracking-widest text-white/35">Legal</p>
      <h1 className="mt-2 text-3xl font-black text-white tracking-tight">Terms of use</h1>
      <p className="mt-4 text-sm font-light leading-relaxed">
        By using BuildCraft you agree to use the service lawfully and respect other users&apos; data and intellectual
        property. Generated plans and code are tools to assist you; you are responsible for review, security, and
        compliance before shipping. The operator of this deployment may update these terms; continued use constitutes
        acceptance.
      </p>
      <Link href="/" className="mt-10 inline-block text-xs font-bold uppercase tracking-widest text-indigo-400 hover:text-indigo-300">
        Back to home
      </Link>
    </main>
  );
}