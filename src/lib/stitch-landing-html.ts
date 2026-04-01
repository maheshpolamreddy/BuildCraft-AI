/**
 * Stitch landing: server-injected premium CSS + Google Fonts + visual variants.
 * Model outputs body HTML only — keeps generation fast for serverless limits.
 */

export type StitchPalette = {
  p: string;
  p2: string;
  glow: string;
  name: string;
};

/** Visual theme — derived from project name so repeat visits stay on-brand but not identical every time. */
export type StitchVisualVariant = "aurora" | "noir" | "ember" | "lattice";

export function deriveStitchVariant(seed: string): StitchVisualVariant {
  const h = Array.from(seed).reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return (["aurora", "noir", "ember", "lattice"] as const)[h % 4];
}

const NOISE_SVG = encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.5'/></svg>`,
);

/** Injected in <head> before <style> — distinctive font pairing (Outfit + DM Sans). */
export const STITCH_HEAD_LINKS = `<link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/><link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=Outfit:wght@500;600;700;800&display=swap" rel="stylesheet"/>`;

function variantLayerCss(v: StitchVisualVariant, glow: string): string {
  const g = `rgba(${glow},`;
  switch (v) {
    case "aurora":
      return `html.theme-aurora .hero{background:radial-gradient(ellipse 85% 55% at 50% -28%,${g}0.22),transparent 70%),radial-gradient(ellipse 50% 45% at 100% 20%,rgba(139,92,246,0.14),transparent)}html.theme-aurora .feature-card{border-color:rgba(255,255,255,0.1);box-shadow:0 0 0 1px rgba(255,255,255,0.04),0 24px 48px -12px rgba(0,0,0,0.55)}`;
    case "noir":
      return `html.theme-noir{--border:rgba(255,255,255,0.12)}html.theme-noir .hero{background:linear-gradient(180deg,rgba(0,0,0,0.45) 0%,transparent 45%),radial-gradient(ellipse 70% 50% at 50% 0%,${g}0.08),transparent 70%)}html.theme-noir .section-title{letter-spacing:-0.04em;font-weight:800}html.theme-noir .btn-outline{border-width:2px}`;
    case "ember":
      return `html.theme-ember .hero{background:radial-gradient(ellipse 80% 50% at 50% -20%,${g}0.2),transparent 70%),linear-gradient(165deg,rgba(20,12,8,0.9) 0%,transparent 55%)}html.theme-ember .btn-primary{box-shadow:0 4px 24px ${g}0.45),0 0 40px ${g}0.15)}html.theme-ember .feature-card:hover{box-shadow:0 20px 50px -10px rgba(0,0,0,0.6)}`;
    case "lattice":
      return `html.theme-lattice .section-alt{background-color:var(--bg2);background-image:linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px);background-size:48px 48px}html.theme-lattice .hero{background:radial-gradient(ellipse 60% 40% at 70% 30%,${g}0.1),transparent 70%)}`;
    default:
      return "";
  }
}

/** Full theme stylesheet (injected); palette + variant drive accents. */
export function getStitchBaseCss(pal: StitchPalette, variant: StitchVisualVariant): string {
  const vcss = variantLayerCss(variant, pal.glow);
  const base = `:root{--p:${pal.p};--p2:${pal.p2};--glow:${pal.glow};--bg:#070708;--bg2:#0c0c0f;--bg3:#121218;--text:#f8f8fc;--muted:#a8a8b8;--dim:#6b6b7a;--border:rgba(255,255,255,0.09);--radius:16px;--radius-sm:10px;--font-display:'Outfit',system-ui,sans-serif;--font-body:'DM Sans',system-ui,sans-serif}
html,body{height:100%}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html{scroll-behavior:smooth}body.stitch-premium{background:var(--bg);color:var(--text);font-family:var(--font-body);font-size:16px;line-height:1.65;overflow-x:hidden;letter-spacing:-0.01em;-webkit-font-smoothing:antialiased}
body.stitch-premium::before{content:"";position:fixed;inset:0;pointer-events:none;z-index:9997;opacity:.04;background-image:url("data:image/svg+xml,${NOISE_SVG}");background-repeat:repeat;background-size:280px 280px}
a{color:inherit;text-decoration:none}ul{list-style:none}
.container{max-width:1180px;margin:0 auto;padding:0 clamp(20px,4vw,40px)}
nav{position:sticky;top:0;z-index:100;height:72px;background:rgba(6,6,8,0.78);backdrop-filter:saturate(160%) blur(20px);-webkit-backdrop-filter:saturate(160%) blur(20px);border-bottom:1px solid var(--border);box-shadow:0 1px 0 rgba(255,255,255,0.04)}
.nav-inner{display:flex;align-items:center;justify-content:space-between;height:100%;max-width:1180px;margin:0 auto;padding:0 clamp(20px,4vw,40px);gap:20px}
.nav-logo{font-family:var(--font-display);font-size:19px;font-weight:800;letter-spacing:-0.03em;color:var(--text);white-space:nowrap;flex-shrink:0}
.nav-logo span{background:linear-gradient(135deg,var(--p),var(--p2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.nav-links{display:flex;align-items:center;gap:clamp(16px,3vw,36px);flex-shrink:0}
.nav-links a{font-size:13.5px;font-weight:600;color:var(--muted);transition:color .2s;white-space:nowrap;text-transform:uppercase;letter-spacing:0.06em}
.nav-links a:hover{color:var(--text)}.nav-cta{flex-shrink:0}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:none;outline:none;cursor:pointer;font-family:var(--font-body);font-weight:700;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;border-radius:var(--radius-sm);transition:transform .2s,box-shadow .2s,border-color .2s;white-space:nowrap;line-height:1;padding:12px 26px}
.btn-primary{background:linear-gradient(135deg,var(--p),var(--p2));color:#fff;box-shadow:0 4px 24px rgba(var(--glow),0.38),inset 0 1px 0 rgba(255,255,255,0.12)}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(var(--glow),0.5),inset 0 1px 0 rgba(255,255,255,0.15)}
.btn-outline{background:rgba(255,255,255,0.03);color:var(--text);border:1.5px solid rgba(255,255,255,0.14)}
.btn-outline:hover{background:rgba(255,255,255,0.07);border-color:rgba(255,255,255,0.28)}
.btn-lg{padding:15px 34px;font-size:14px;border-radius:var(--radius)}
.hero{position:relative;text-align:center;padding:clamp(72px,14vw,132px) 24px clamp(64px,10vw,104px);overflow:hidden;isolation:isolate}
.hero-orb{position:absolute;border-radius:50%;filter:blur(120px);pointer-events:none;animation:pulse 8s ease-in-out infinite;z-index:0}
@keyframes pulse{0%,100%{transform:scale(1);opacity:.35}50%{transform:scale(1.08);opacity:.65}}
@keyframes fade-up{from{opacity:0;transform:translateY(32px)}to{opacity:1;transform:translateY(0)}}
.hero-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(var(--glow),0.12);border:1px solid rgba(var(--glow),0.28);color:var(--p);padding:8px 18px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;margin-bottom:28px;animation:fade-up .55s ease both;z-index:1;position:relative}
.hero h1{font-family:var(--font-display);font-size:clamp(2.25rem,5.5vw,3.75rem);font-weight:800;letter-spacing:-0.045em;line-height:1.05;margin-bottom:22px;animation:fade-up .58s .04s ease both;position:relative;z-index:1}
.hero h1 .gradient{background:linear-gradient(135deg,var(--p),var(--p2),#fff 95%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.hero p{font-size:clamp(1rem,2vw,1.2rem);color:var(--muted);max-width:34rem;margin:0 auto 36px;line-height:1.75;animation:fade-up .62s .08s ease both;position:relative;z-index:1;font-weight:500}
.hero-btns{display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;animation:fade-up .66s .12s ease both;position:relative;z-index:1}
.hero-trust{margin-top:52px;display:flex;align-items:center;justify-content:center;gap:10px;font-size:12px;color:var(--dim);letter-spacing:0.02em;animation:fade-up .7s .16s ease both;position:relative;z-index:1}
.section{padding:clamp(72px,12vw,112px) 0;position:relative;z-index:1}
.section-label{display:inline-block;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.2em;color:var(--p);margin-bottom:14px;font-family:var(--font-display)}
.section-title{font-family:var(--font-display);font-size:clamp(1.75rem,3.5vw,2.5rem);font-weight:800;letter-spacing:-0.035em;line-height:1.12;margin-bottom:14px}
.section-sub{font-size:1.05rem;color:var(--muted);max-width:36rem;line-height:1.75;font-weight:500}
.features-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:48px}
@media(max-width:900px){.features-grid{grid-template-columns:1fr;max-width:420px;margin-left:auto;margin-right:auto}}
.feature-card{background:linear-gradient(145deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015));border:1px solid var(--border);border-radius:var(--radius);padding:30px 26px;transition:border-color .25s,transform .25s,box-shadow .25s;backdrop-filter:blur(8px)}
.feature-card:hover{border-color:rgba(var(--glow),0.35);transform:translateY(-5px);box-shadow:0 20px 48px -12px rgba(0,0,0,0.5)}
.feature-icon{width:52px;height:52px;border-radius:14px;background:rgba(var(--glow),0.14);border:1px solid rgba(var(--glow),0.25);display:flex;align-items:center;justify-content:center;margin-bottom:18px}
.feature-card h3{font-family:var(--font-display);font-size:1.05rem;font-weight:700;margin-bottom:10px;letter-spacing:-0.02em}
.feature-card p{font-size:14px;color:var(--muted);line-height:1.68}
.steps-row{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:48px}
@media(max-width:900px){.steps-row{grid-template-columns:1fr}}
.step-card{background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:var(--radius);padding:30px 24px;position:relative}
.step-num{width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,var(--p),var(--p2));color:#fff;font-family:var(--font-display);font-size:18px;font-weight:800;display:flex;align-items:center;justify-content:center;margin-bottom:18px;box-shadow:0 8px 20px rgba(var(--glow),0.35)}
.step-card h3{font-family:var(--font-display);font-size:1rem;font-weight:700;margin-bottom:10px}
.step-card p{font-size:14px;color:var(--muted);line-height:1.65}
footer{border-top:1px solid var(--border);padding:52px 0 36px;position:relative;z-index:1;background:linear-gradient(180deg,transparent,rgba(0,0,0,0.35))}
.footer-inner{max-width:1180px;margin:0 auto;padding:0 clamp(20px,4vw,40px)}
.footer-top{display:flex;align-items:flex-start;justify-content:space-between;gap:40px;flex-wrap:wrap;margin-bottom:40px}
.footer-brand p{font-size:14px;color:var(--dim);margin-top:12px;max-width:280px;line-height:1.65}
.footer-links h4{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.14em;color:var(--muted);margin-bottom:14px;font-family:var(--font-display)}
.footer-links ul{display:flex;flex-direction:column;gap:10px}
.footer-links ul a{font-size:14px;color:var(--dim);transition:color .2s}
.footer-links ul a:hover{color:var(--text)}
.footer-bottom{display:flex;align-items:center;justify-content:space-between;padding-top:26px;border-top:1px solid var(--border);font-size:13px;color:var(--dim);flex-wrap:wrap;gap:14px;font-weight:500}
.section-alt{background:var(--bg2)}
.section-divider{width:52px;height:3px;background:linear-gradient(90deg,var(--p),var(--p2));border-radius:3px;margin:16px 0 0}
.icon-svg{width:24px;height:24px;fill:none;stroke:var(--p);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.stat-strip{display:flex;justify-content:center;gap:clamp(24px,6vw,56px);flex-wrap:wrap;margin-top:40px;padding:20px 0;border-top:1px solid rgba(255,255,255,0.06);border-bottom:1px solid rgba(255,255,255,0.06)}
.stat-strip strong{font-family:var(--font-display);font-size:1.35rem;font-weight:800;background:linear-gradient(135deg,var(--p),var(--p2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;display:block}
.stat-strip span{font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:var(--dim);margin-top:4px;display:block}`;
  return base + vcss;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function variantCopyHint(v: StitchVisualVariant): string {
  switch (v) {
    case "aurora":
      return "Voice: ethereal, confident, future-forward — avoid clichés like 'revolutionize' or 'leverage'.";
    case "noir":
      return "Voice: minimal, editorial, punchy — short clauses, high contrast messaging.";
    case "ember":
      return "Voice: warm, energetic, human — bold benefits, conversational subheads.";
    case "lattice":
      return "Voice: precise, trustworthy, structured — metrics-friendly, clear outcomes.";
    default:
      return "";
  }
}

/** System prompt — compact; CSS/fonts are server-side. */
export function buildStitchSystemPrompt(pal: StitchPalette, variant: StitchVisualVariant): string {
  return `Elite product marketer + front-end fragment writer. Server injects CSS/fonts (Outfit + DM Sans). Output ONLY raw inner-<body> HTML — no doctype/html/head/style, no markdown.

Theme: ${pal.name}. Visual mood: ${variant}. ${variantCopyHint(variant)}

Structure (required): nav(.nav-inner,.nav-logo+span,.nav-links×4 Features/How It Works/Pricing/About,.nav-cta .btn-primary) → hero(.container,.hero-orb×2 with inline style width/height/top/left and background var(--p)/var(--p2),.hero-badge,.hero h1+.gradient,.hero p,.hero-btns .btn-lg,.hero-trust) → OPTIONAL .stat-strip with 3 metrics (made-up but plausible for the product) → section features(.section-label,.section-title,.section-sub,.section-divider,.features-grid 3×.feature-card with svg.icon-svg) → section.section-alt steps(3×.step-card) → footer(.footer-inner,.footer-brand,.footer-links×2,.footer-bottom with © year + Built with BuildCraft AI).

Differentiate from generic AI landing pages: specific product nouns, one memorable hero line, SVG icons with real path d= (not empty). Buttons: .btn.btn-primary / .btn-outline only. Compact HTML.`;
}

export function buildStitchUserPrompt(name: string, idea: string, palette: StitchPalette, variant: StitchVisualVariant): string {
  return `Product: "${name}". ${idea}

Palette ${palette.name}. Mood ${variant}. Include nav, hero, features(3), steps(3), footer; add .stat-strip only if it fits the story. HTML body fragment only.`;
}

/**
 * Wrap model output in a full document with injected fonts + premium CSS.
 */
export function finalizeStitchHtml(
  name: string,
  raw: string,
  pal: StitchPalette,
  variant: StitchVisualVariant,
): string | null {
  let t = raw.replace(/^```[\w]*\n?/gm, "").replace(/\n?```$/gm, "").trim();
  t = t.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  let inner = t;
  const bm = t.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bm) {
    inner = bm[1].trim();
  } else if (/<!DOCTYPE|<html/i.test(t)) {
    inner = t
      .replace(/<!DOCTYPE[^>]*>/gi, "")
      .replace(/<html[^>]*>/gi, "")
      .replace(/<\/html>/gi, "")
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
      .replace(/<body[^>]*>/i, "")
      .replace(/<\/body>/i, "")
      .trim();
  }

  inner = inner.trim();
  if (inner.length < 200) return null;
  const lower = inner.toLowerCase();
  if (!lower.includes("nav") && !lower.includes("hero")) return null;

  const title = escapeHtml(name);
  const css = getStitchBaseCss(pal, variant);
  return `<!DOCTYPE html><html lang="en" class="theme-${variant}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="color-scheme" content="dark"/><title>${title}</title>${STITCH_HEAD_LINKS}<style>${css}</style></head><body class="stitch-premium">${inner}</body></html>`;
}
