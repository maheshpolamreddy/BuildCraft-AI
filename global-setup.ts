import { chromium, type FullConfig } from "@playwright/test";
import fs from "fs";
import path from "path";

async function mintCustomToken(baseURL: string, email: string): Promise<string> {
  const secret = process.env.E2E_SETUP_SECRET;
  if (!secret?.trim()) {
    throw new Error("E2E_SETUP_SECRET is required to mint custom tokens.");
  }
  const res = await fetch(new URL("/api/e2e/custom-token", baseURL), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-e2e-secret": secret,
    },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`custom-token ${res.status}: ${t}`);
  }
  const data = (await res.json()) as { customToken?: string };
  if (!data.customToken) throw new Error("No customToken in response");
  return data.customToken;
}

async function saveStorageFromCustomToken(
  baseURL: string,
  email: string,
  returnTo: string,
  outFile: string,
): Promise<void> {
  const token = await mintCustomToken(baseURL, email);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript((t: string) => {
    (window as unknown as { __E2E_CUSTOM_TOKEN__: string }).__E2E_CUSTOM_TOKEN__ = t;
  }, token);
  const url = new URL("/e2e/sign-in", baseURL);
  url.searchParams.set("returnTo", returnTo);
  await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForURL(
    (u) => {
      try {
        const p = new URL(u);
        const okPath =
          p.pathname.startsWith("/discovery") ||
          p.pathname.startsWith("/employee-dashboard") ||
          p.pathname.startsWith("/architecture");
        return okPath && !p.pathname.startsWith("/e2e/");
      } catch {
        return false;
      }
    },
    { timeout: 120_000 },
  );
  await context.storageState({ path: outFile });
  await browser.close();
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL =
    process.env.PLAYWRIGHT_BASE_URL ||
    (typeof config.projects?.[0]?.use?.baseURL === "string" ? config.projects[0].use.baseURL : "");

  if (!baseURL?.trim()) {
    console.warn("[e2e global-setup] PLAYWRIGHT_BASE_URL missing — skip generating storage state.");
    return;
  }

  const authDir = path.join(__dirname, "tests", ".auth");
  const creatorEmail = process.env.E2E_CREATOR_EMAIL?.trim();
  const developerEmail = process.env.E2E_DEVELOPER_EMAIL?.trim();

  if (!process.env.E2E_SETUP_SECRET?.trim()) {
    console.warn("[e2e global-setup] E2E_SETUP_SECRET missing — skip auth files (set for CI / test env).");
    return;
  }

  try {
    if (creatorEmail) {
      await saveStorageFromCustomToken(
        baseURL,
        creatorEmail,
        "/discovery",
        path.join(authDir, "creator.json"),
      );
      console.log("[e2e global-setup] Wrote tests/.auth/creator.json");
    }
    if (developerEmail) {
      await saveStorageFromCustomToken(
        baseURL,
        developerEmail,
        "/employee-dashboard",
        path.join(authDir, "developer.json"),
      );
      console.log("[e2e global-setup] Wrote tests/.auth/developer.json");
    }
  } catch (e) {
    console.error("[e2e global-setup] Failed:", e);
    throw e;
  }
}
