import { test, expect } from "./fixtures";
import fs from "fs";
import path from "path";
import {
  writeLastProjectId,
  readSavedProjectIdFromZustandLocalStorage,
} from "./helpers/project-state";

const creatorAuth = path.join(process.cwd(), "tests", ".auth", "creator.json");

test.beforeEach(() => {
  test.skip(
    !fs.existsSync(creatorAuth),
    "Missing tests/.auth/creator.json — run global setup with E2E_SETUP_SECRET."
  );
});

test.describe.serial("Creator bootstrap", () => {
  test("discovery → architecture → tools → prompts → lock → project room → matching UI", async ({
    page,
  }) => {
    const suffix = Date.now();
    const idea = `E2E ${suffix}: Task list PWA with Firebase auth and offline support. Minimal UI.`;

    await page.goto("/discovery");
    await expect(page.getByTestId("discovery-idea-input")).toBeVisible({ timeout: 60_000 });

    await page.getByTestId("discovery-idea-input").fill(idea);
    await page.getByTestId("discovery-analyze").click();

    const acceptCta = page.getByTestId("discovery-accept-tools-cta");
    const assumptions = page.locator('[data-testid^="discovery-assumption-"]');

    // Analyze must finish before assumptions exist or the CTA enables (zero assumptions).
    await page.waitForFunction(
      () => {
        const cta = document.querySelector(
          '[data-testid="discovery-accept-tools-cta"]'
        ) as HTMLButtonElement | null;
        if (cta && !cta.disabled) return true;
        return document.querySelectorAll('[data-testid^="discovery-assumption-"]').length > 0;
      },
      { timeout: 420_000 }
    );

    const n = await assumptions.count();
    for (let i = 0; i < n; i++) {
      const row = assumptions.nth(i);
      const check = row.locator(".bg-emerald-500");
      if ((await check.count()) === 0) await row.click();
    }

    await expect(acceptCta).toBeEnabled({ timeout: 120_000 });
    await acceptCta.click();
    await page.waitForURL("**/architecture**", { timeout: 120_000 });

    await expect(page.getByTestId("arch-tab-tools")).toBeVisible({ timeout: 180_000 });
    await page.getByTestId("arch-tab-tools").click();

    const toolsHeader = page.getByText("Approve Recommended Tools", { exact: false });
    await expect(toolsHeader).toBeVisible({ timeout: 300_000 });

    const toolsPanel = page.locator("section").filter({ hasText: "Approve Recommended Tools" });
    // Approve every tool card — the UI lists multiple "Approve" buttons; clicking only .first()
    // leaves other tools undecided so "Lock technical plan" never appears in the sidebar.
    for (let k = 0; k < 60; k++) {
      const lock = page.getByTestId("arch-lock-plan");
      if ((await lock.count()) > 0) break;
      const approveButtons = toolsPanel.getByRole("button", { name: /^Approve$/i });
      const n = await approveButtons.count();
      if (n === 0) break;
      for (let i = 0; i < n; i++) {
        await approveButtons.nth(i).click();
        await page.waitForTimeout(80);
      }
      await page.waitForTimeout(200);
    }
    await expect(page.getByTestId("arch-lock-plan")).toBeVisible({ timeout: 120_000 });

    await page.getByTestId("arch-tab-prompts").click();
    await expect(page.getByTestId("arch-lock-plan")).toBeEnabled({ timeout: 120_000 });
    await page.getByTestId("arch-lock-plan").click();

    await expect(page.getByTestId("arch-open-project-room")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("arch-open-project-room").click();
    await page.waitForURL("**/project-room**", { timeout: 120_000 });

    await expect
      .poll(
        async () => {
          const raw = await page.evaluate(() => localStorage.getItem("buildcraft-store"));
          return readSavedProjectIdFromZustandLocalStorage(raw) ?? "";
        },
        { timeout: 120_000 }
      )
      .not.toBe("");
    const raw = await page.evaluate(() => localStorage.getItem("buildcraft-store"));
    const pid = readSavedProjectIdFromZustandLocalStorage(raw);
    expect(pid, "savedProjectId in zustand").toBeTruthy();
    writeLastProjectId(pid!);

    await page.getByTestId("project-room-tab-talent").click();
    await page.getByTestId("talent-rerun-match").click();
    await expect(page.locator('[data-testid^="talent-hire-"]').first()).toBeVisible({
      timeout: 180_000,
    });
  });
});
