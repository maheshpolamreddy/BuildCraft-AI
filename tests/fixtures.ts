import { test as base, expect, type Page } from "@playwright/test";

type ConsoleCollector = { errors: string[]; pages: string[] };

function attachStrictListeners(page: Page, bucket: ConsoleCollector, origin: string) {
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const t = msg.text();
      if (t.includes("favicon")) return;
      if (t.includes("ResizeObserver")) return;
      bucket.errors.push(`[console.error] ${t}`);
    }
  });
  page.on("pageerror", (err) => {
    bucket.errors.push(`[pageerror] ${err.message}`);
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
