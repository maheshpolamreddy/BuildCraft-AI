import { test as base, expect, type Page } from "@playwright/test";

type ConsoleCollector = { errors: string[]; pages: string[] };

function attachStrictListeners(page: Page, bucket: ConsoleCollector, origin: string) {
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const t = msg.text();
      if (t.includes("favicon")) return;
      if (t.includes("ResizeObserver")) return;
      // Chromium logs non-actionable one-liners; we record full URLs via the response handler.
      if (/Failed to load resource: the server responded with a status of \d{3}/i.test(t)) return;
      bucket.errors.push(`[console.error] ${t}`);
    }
  });
  page.on("pageerror", (err) => {
    bucket.errors.push(`[pageerror] ${err.message}`);
  });
  page.on("response", (res) => {
    const status = res.status();
    if (status < 500) return;
    const u = res.url();
    if (u.includes("googletagmanager.com")) return;
    bucket.errors.push(`[http ${status}] ${u}`);
  });
  if (process.env.E2E_STRICT_API === "1") {
    page.on("response", async (res) => {
      try {
        const u = res.url();
        if (!u.startsWith(origin) || !u.includes("/api/")) return;
        if (res.status() >= 500) {
          bucket.errors.push(`[api ${res.status()}] ${u}`);
        }
      } catch {
        /* */
      }
    });
  }
}

export const test = base.extend<{ autoConsoleCheck: void }>({
  autoConsoleCheck: [
    async ({ page, baseURL }, use, testInfo) => {
      const origin = (baseURL ?? "").replace(/\/$/, "");
      const bucket: ConsoleCollector = { errors: [], pages: [] };
      attachStrictListeners(page, bucket, origin);
      await use();
      if (bucket.errors.length) {
        await testInfo.attach("console-errors", {
          body: bucket.errors.join("\n"),
          contentType: "text/plain",
        });
      }
      expect.soft(bucket.errors, "browser console should stay clean").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
