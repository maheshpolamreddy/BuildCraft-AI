/**
 * Transactional email via **Brevo** — HTTP API (preferred) or SMTP.
 *
 * **Option A — Transactional API** (same key as Brevo “API Keys & MCP”, not xsmtpsib SMTP key):
 *   BREVO_API_KEY — v3 API key (often starts with xkeysib-)
 *   BREVO_FROM    — verified sender: "BuildCraft AI <you@verified.com>" or email only
 *   https://developers.brevo.com/reference/send-transac-email
 *
 * **Option B — SMTP** (if you do not set BREVO_API_KEY):
 *   BREVO_SMTP_LOGIN, BREVO_SMTP_KEY (xsmtpsib-…), BREVO_FROM
 *   BREVO_SMTP_PORT optional: 587 (default), 465, 2525
 *
 * If both are set, the **API** is used first (avoids SMTP 535 login issues).
 *
 * Note: Brevo’s Python `EmailCampaignsApi` / marketing campaigns are a different product;
 * hire invites use transactional send only.
 *
 *   NEXT_PUBLIC_APP_URL — site URL for invite links
 *
 * **Option C — Gmail SMTP** (send to anyone; no Resend domain needed):
 *   GMAIL_USER, GMAIL_APP_PASSWORD — Google Account → App passwords (2FA required)
 *   EMAIL_FROM_NAME — optional display name (default `BUILDCRAFT AI`)
 *
 * **Option D — Resend** (requires verified domain to mail arbitrary recipients; test mode only mails your account):
 *   RESEND_API_KEY — https://resend.com/api-keys
 *   RESEND_FROM    — e.g. `BUILDCRAFT AI <onboarding@resend.dev>` or your verified domain
 *   If RESEND_FROM is unset, falls back to BREVO_FROM or GMAIL_USER (plain email).
 *
 * Send order: Brevo API → Brevo SMTP → Gmail → Resend.
 */

import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { loadEnvConfig } from "@next/env";

/**
 * Find the Next app root (folder whose package.json has `"name": "buildcraft"`),
 * walking up from cwd. Covers: dev from `buildcraft/`, from the repo parent, or odd IDE terminals.
 * Then load `.env.local` there so BREVO_* are available in API routes.
 * On Vercel there is no file — env comes from the platform only.
 */
function resolveBuildcraftDir(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string };
        if (pkg.name === "buildcraft") return dir;
      } catch {
        /* ignore */
      }
    }
    const nestedRoot = join(dir, "buildcraft");
    const nestedPkg = join(nestedRoot, "package.json");
    if (existsSync(nestedPkg)) {
      try {
        const pkg = JSON.parse(readFileSync(nestedPkg, "utf8")) as { name?: string };
        if (pkg.name === "buildcraft") return nestedRoot;
      } catch {
        /* ignore */
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

let brevoEnvLoaded = false;
function loadBrevoEnvOnce(): void {
  if (brevoEnvLoaded) return;
  brevoEnvLoaded = true;
  const root = resolveBuildcraftDir();
  if (root) {
    loadEnvConfig(root);
    return;
  }
  const cwd = process.cwd();
  const nestedEnv = join(cwd, "buildcraft", ".env.local");
  if (existsSync(nestedEnv)) {
    loadEnvConfig(join(cwd, "buildcraft"));
    return;
  }
  const localEnv = join(cwd, ".env.local");
  if (existsSync(localEnv)) {
    loadEnvConfig(cwd);
  }
}

loadBrevoEnvOnce();

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** Trim, strip BOM, strip accidental wrapping quotes from Vercel/UI pastes */
function cleanEnv(s: string | undefined): string {
  if (!s) return "";
  let t = s.replace(/^\ufeff/, "").trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

/** Display name for Gmail / Resend plain-email wraps / Brevo default when only an address is given */
function fromDisplayName(): string {
  return cleanEnv(process.env.EMAIL_FROM_NAME) || "BUILDCRAFT AI";
}

function brevoApiConfigured(): boolean {
  return !!(cleanEnv(process.env.BREVO_API_KEY) && cleanEnv(process.env.BREVO_FROM));
}

function brevoSmtpConfigured(): boolean {
  return !!(
    cleanEnv(process.env.BREVO_SMTP_LOGIN) &&
    cleanEnv(process.env.BREVO_SMTP_KEY) &&
    cleanEnv(process.env.BREVO_FROM)
  );
}

/** `From` header for Resend: explicit RESEND_FROM, else BREVO_FROM, else plain GMAIL_USER */
function resendFromHeader(): string {
  const name = fromDisplayName();
  const explicit = cleanEnv(process.env.RESEND_FROM);
  if (explicit) {
    if (/^[^\s<]+@[^\s>]+\.[^\s>]+$/.test(explicit)) {
      return `${name} <${explicit}>`;
    }
    return explicit;
  }
  const brevo = cleanEnv(process.env.BREVO_FROM);
  if (brevo) {
    return brevo.includes("<") ? brevo : `${name} <${brevo}>`;
  }
  const gmail = cleanEnv(process.env.GMAIL_USER);
  if (/^[^\s<]+@[^\s>]+\.[^\s>]+$/.test(gmail)) {
    return `${name} <${gmail}>`;
  }
  return "";
}

function resendConfigured(): boolean {
  return !!(cleanEnv(process.env.RESEND_API_KEY) && resendFromHeader());
}

function gmailConfigured(): boolean {
  const user = cleanEnv(process.env.GMAIL_USER);
  const pass = cleanEnv(process.env.GMAIL_APP_PASSWORD);
  return !!user && !!pass && /^[^\s<]+@[^\s>]+\.[^\s>]+$/.test(user);
}

/** True if Brevo, Gmail SMTP, or Resend can send transactional mail */
export function transactionalEmailConfigured(): boolean {
  return (
    brevoApiConfigured() ||
    brevoSmtpConfigured() ||
    gmailConfigured() ||
    resendConfigured()
  );
}

/** @deprecated Use transactionalEmailConfigured — name kept for existing imports */
export function brevoEmailConfigured(): boolean {
  return transactionalEmailConfigured();
}

/** Parse `Name <email@x.com>` or plain `email@x.com` for Brevo API sender */
function parseSender(fromRaw: string): { name: string; email: string } {
  const from = cleanEnv(fromRaw);
  const m = from.match(/^(.+?)\s*<([^>]+)>$/);
  if (m) {
    return {
      name: m[1].trim().replace(/^["']|["']$/g, ""),
      email: m[2].trim(),
    };
  }
  if (/^[^\s<]+@[^\s>]+\.[^\s>]+$/.test(from)) {
    return { name: fromDisplayName(), email: from };
  }
  return { name: fromDisplayName(), email: from };
}

export type SendEmailResult = { ok: true } | { ok: false; error: string };

interface SendOptions {
  to:      string;
  subject: string;
  html:    string;
}

async function sendViaBrevoApi(opts: SendOptions): Promise<SendEmailResult> {
  const apiKey = cleanEnv(process.env.BREVO_API_KEY);
  const sender = parseSender(cleanEnv(process.env.BREVO_FROM));

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender: { name: sender.name, email: sender.email },
        to: [{ email: opts.to }],
        subject: opts.subject,
        htmlContent: opts.html,
      }),
    });

    if (res.ok) {
      return { ok: true };
    }

    const raw = await res.text();
    let detail = raw.slice(0, 500);
    try {
      const j = JSON.parse(raw) as { message?: string };
      if (typeof j.message === "string") detail = j.message;
    } catch {
      /* keep detail */
    }
    console.error("[Brevo API] send failed:", res.status, detail);
    return { ok: false, error: `${detail || `HTTP ${res.status}`}`.slice(0, 800) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[Brevo API] send failed:", msg);
    return { ok: false, error: msg.slice(0, 800) };
  }
}

async function sendViaBrevoSmtp(opts: SendOptions): Promise<SendEmailResult> {
  const user = cleanEnv(process.env.BREVO_SMTP_LOGIN);
  const pass = cleanEnv(process.env.BREVO_SMTP_KEY);
  const from = cleanEnv(process.env.BREVO_FROM);
  const portRaw = cleanEnv(process.env.BREVO_SMTP_PORT);
  const port = [465, 587, 2525].includes(Number(portRaw))
    ? Number(portRaw)
    : 587;
  const secure = port === 465;

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: "smtp-relay.brevo.com",
      port,
      secure,
      auth: { user, pass },
      requireTLS: !secure,
    });
    await transporter.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[Brevo SMTP] send failed:", msg);
    const hint =
      /535|Invalid login|Authentication failed/i.test(msg)
        ? " BREVO_SMTP_LOGIN must be the exact SMTP user from Brevo (Settings - SMTP and API - SMTP tab; not always your Gmail). BREVO_SMTP_KEY must be the SMTP key (xsmtpsib-...), not an API key. Regenerate both on that page if unsure. Optional: set BREVO_SMTP_PORT=2525 in Vercel."
        : "";
    return {
      ok: false,
      error: `${msg}.${hint} Verify BREVO_FROM is a verified sender.`.slice(0, 800),
    };
  }
}

async function sendViaResend(opts: SendOptions): Promise<SendEmailResult> {
  const apiKey = cleanEnv(process.env.RESEND_API_KEY);
  const from = resendFromHeader();
  if (!apiKey || !from) {
    return { ok: false, error: "Resend is not fully configured (RESEND_API_KEY and a From address)." };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
      }),
    });
    if (res.ok) {
      return { ok: true };
    }
    const raw = await res.text();
    let detail = raw.slice(0, 500);
    try {
      const j = JSON.parse(raw) as { message?: string; error?: { message?: string } };
      if (typeof j.message === "string") detail = j.message;
      else if (j.error && typeof j.error.message === "string") detail = j.error.message;
    } catch {
      /* keep detail */
    }
    console.error("[Resend] send failed:", res.status, detail);
    let out = `${detail || `HTTP ${res.status}`}`;
    if (/only send testing emails|verify a domain at resend/i.test(out)) {
      out +=
        " To send to any recipient without a domain: set GMAIL_USER + GMAIL_APP_PASSWORD (Gmail App Password) in .env.local — Gmail is used before Resend.";
    }
    return { ok: false, error: out.slice(0, 800) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[Resend] send failed:", msg);
    return { ok: false, error: msg.slice(0, 800) };
  }
}

async function sendViaGmail(opts: SendOptions): Promise<SendEmailResult> {
  const user = cleanEnv(process.env.GMAIL_USER);
  const pass = cleanEnv(process.env.GMAIL_APP_PASSWORD);
  const from = `${fromDisplayName()} <${user}>`;
  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user, pass },
    });
    await transporter.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[Gmail SMTP] send failed:", msg);
    const hint =
      /Invalid login|535|Username and Password not accepted/i.test(msg)
        ? " Use a Google App Password (not your normal password): Google Account → Security → 2-Step Verification → App passwords."
        : "";
    return { ok: false, error: `${msg}.${hint}`.slice(0, 800) };
  }
}

async function send(opts: SendOptions): Promise<SendEmailResult> {
  if (brevoApiConfigured()) {
    return sendViaBrevoApi(opts);
  }
  if (brevoSmtpConfigured()) {
    return sendViaBrevoSmtp(opts);
  }
  if (gmailConfigured()) {
    return sendViaGmail(opts);
  }
  if (resendConfigured()) {
    return sendViaResend(opts);
  }
  return {
    ok: false,
    error:
      "Email is not configured. Set GMAIL_USER + GMAIL_APP_PASSWORD (recommended to reach any inbox), or BREVO_* / RESEND_* as in .env.example.",
  };
}

// ── Hire invitation ────────────────────────────────────────────────────────────
export async function sendHireInvitation(opts: {
  developerEmail: string;
  developerName:  string;
  creatorName:    string;
  projectName:    string;
  projectSummary: string;
  token:          string;
}): Promise<SendEmailResult> {
  const acceptUrl = `${APP_URL}/invite/${opts.token}?action=accept`;
  const rejectUrl = `${APP_URL}/invite/${opts.token}?action=reject`;

  return send({
    to:      opts.developerEmail,
    subject: `🚀 Project Invitation: ${opts.projectName}`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;background:#09090b;color:#fff;padding:32px;border-radius:16px;">
        <div style="text-align:center;margin-bottom:32px;">
          <h1 style="font-size:28px;font-weight:900;letter-spacing:-1px;margin:0;">BuildCraft AI</h1>
          <p style="color:#888;font-size:12px;letter-spacing:.2em;text-transform:uppercase;margin:4px 0 0;">Project Invitation</p>
        </div>

        <h2 style="font-size:22px;font-weight:700;margin-bottom:8px;">Hi ${opts.developerName},</h2>
        <p style="color:#aaa;line-height:1.6;">
          <strong style="color:#fff;">${opts.creatorName}</strong> wants to hire you for their project on BuildCraft AI.
        </p>

        <div style="background:#18181b;border:1px solid #27272a;border-radius:12px;padding:20px;margin:24px 0;">
          <p style="font-size:11px;text-transform:uppercase;letter-spacing:.2em;color:#888;margin:0 0 8px;">Project</p>
          <h3 style="font-size:20px;font-weight:800;margin:0 0 12px;letter-spacing:-0.5px;">${opts.projectName}</h3>
          <p style="color:#aaa;font-size:14px;line-height:1.6;margin:0;">${opts.projectSummary}</p>
        </div>

        <p style="color:#aaa;font-size:13px;">Please respond within <strong style="color:#fff;">48 hours</strong>. This invitation expires automatically.</p>

        <div style="display:flex;gap:12px;margin-top:28px;">
          <a href="${acceptUrl}" style="flex:1;display:block;background:#fff;color:#000;font-weight:900;font-size:13px;text-transform:uppercase;letter-spacing:.15em;text-align:center;padding:14px 24px;border-radius:10px;text-decoration:none;">
            ✅ Accept Invitation
          </a>
          <a href="${rejectUrl}" style="flex:1;display:block;background:transparent;color:#888;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.15em;text-align:center;padding:14px 24px;border-radius:10px;text-decoration:none;border:1px solid #27272a;">
            Decline
          </a>
        </div>

        <p style="color:#555;font-size:11px;margin-top:32px;text-align:center;">
          BuildCraft AI · Secure Developer Hiring Platform
        </p>
      </div>
    `,
  });
}

// ── Hire accepted ──────────────────────────────────────────────────────────────
export async function sendHireAccepted(opts: {
  creatorEmail:  string;
  creatorName:   string;
  developerName: string;
  projectName:   string;
  dashboardUrl:  string;
}): Promise<SendEmailResult> {
  return send({
    to:      opts.creatorEmail,
    subject: `✅ ${opts.developerName} accepted your invitation — ${opts.projectName}`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;background:#09090b;color:#fff;padding:32px;border-radius:16px;">
        <div style="text-align:center;margin-bottom:32px;">
          <h1 style="font-size:28px;font-weight:900;letter-spacing:-1px;margin:0;">BuildCraft AI</h1>
        </div>

        <h2 style="font-size:22px;font-weight:700;">Great news, ${opts.creatorName}! 🎉</h2>
        <p style="color:#aaa;line-height:1.6;">
          <strong style="color:#fff;">${opts.developerName}</strong> has accepted your project invitation for
          <strong style="color:#fff;">${opts.projectName}</strong>.
        </p>

        <div style="background:#052e16;border:1px solid #166534;border-radius:12px;padding:20px;margin:24px 0;">
          <p style="color:#86efac;font-weight:700;margin:0 0 8px;">🤖 AI is generating your Project Requirement Document…</p>
          <p style="color:#aaa;font-size:13px;margin:0;">The PRD will be available in both your dashboard and the developer's dashboard shortly.</p>
        </div>

        <a href="${opts.dashboardUrl}" style="display:block;background:#fff;color:#000;font-weight:900;font-size:13px;text-transform:uppercase;letter-spacing:.15em;text-align:center;padding:14px 24px;border-radius:10px;text-decoration:none;margin-top:20px;">
          Open Project Room →
        </a>

        <p style="color:#555;font-size:11px;margin-top:32px;text-align:center;">
          BuildCraft AI · Secure Developer Hiring Platform
        </p>
      </div>
    `,
  });
}

// ── New chat message notification ──────────────────────────────────────────────
export async function sendChatNotification(opts: {
  recipientEmail: string;
  recipientName:  string;
  senderName:     string;
  projectName:    string;
  messagePreview: string;
  chatUrl:        string;
}): Promise<SendEmailResult> {
  return send({
    to:      opts.recipientEmail,
    subject: `💬 New message on ${opts.projectName}`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;background:#09090b;color:#fff;padding:32px;border-radius:16px;">
        <div style="text-align:center;margin-bottom:32px;">
          <h1 style="font-size:28px;font-weight:900;letter-spacing:-1px;margin:0;">BuildCraft AI</h1>
        </div>

        <h2 style="font-size:20px;font-weight:700;">Hi ${opts.recipientName},</h2>
        <p style="color:#aaa;line-height:1.6;">
          <strong style="color:#fff;">${opts.senderName}</strong> sent you a message on
          <strong style="color:#fff;">${opts.projectName}</strong>.
        </p>

        <div style="background:#18181b;border-left:3px solid #3b82f6;border-radius:0 12px 12px 0;padding:16px 20px;margin:24px 0;">
          <p style="color:#d1d5db;font-size:14px;font-style:italic;margin:0;">"${opts.messagePreview}"</p>
        </div>

        <a href="${opts.chatUrl}" style="display:block;background:#fff;color:#000;font-weight:900;font-size:13px;text-transform:uppercase;letter-spacing:.15em;text-align:center;padding:14px 24px;border-radius:10px;text-decoration:none;margin-top:20px;">
          Reply Now →
        </a>

        <p style="color:#555;font-size:11px;margin-top:32px;text-align:center;">
          BuildCraft AI · You are receiving this because you have an active project.
        </p>
      </div>
    `,
  });
}

/** Optional: notify both parties when a project is marked completed in the app */
export async function sendProjectCompletionBroadcast(opts: {
  creatorEmail: string | null | undefined;
  developerEmail: string | null | undefined;
  projectName: string;
  projectUrl: string;
}): Promise<{ creatorSent: boolean; developerSent: boolean }> {
  const subject = `Project completed — ${opts.projectName}`;
  const html = (greeting: string) => `
      <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;background:#09090b;color:#fff;padding:32px;border-radius:16px;">
        <h2 style="font-size:20px;font-weight:800;">${greeting}</h2>
        <p style="color:#aaa;line-height:1.6;">The project <strong style="color:#fff;">${opts.projectName}</strong> has been marked <strong style="color:#86efac;">completed</strong> with dual approval.</p>
        <a href="${opts.projectUrl}" style="display:inline-block;margin-top:20px;background:#fff;color:#000;font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:.15em;padding:12px 20px;border-radius:10px;text-decoration:none;">Open workspace</a>
        <p style="color:#555;font-size:11px;margin-top:28px;">BuildCraft AI</p>
      </div>`;

  let creatorSent = false;
  let developerSent = false;
  const ce = typeof opts.creatorEmail === "string" && opts.creatorEmail.includes("@") ? opts.creatorEmail : null;
  const de = typeof opts.developerEmail === "string" && opts.developerEmail.includes("@") ? opts.developerEmail : null;

  if (ce) {
    const r = await send({ to: ce, subject, html: html("Project update") });
    creatorSent = r.ok;
  }
  if (de && de !== ce) {
    const r = await send({ to: de, subject, html: html("Project update") });
    developerSent = r.ok;
  }
  return { creatorSent, developerSent };
}

export { APP_URL };
