import { test, expect } from "./fixtures";
import fs from "fs";
import path from "path";
import {
  writeLastProjectId,
  readSavedProjectIdFromZustandLocalStorage,
} from "./helpers/project-state";

const creatorAuth = path.join(process.cwd(), "tests", ".auth", "creator.json");

test.beforeEach(() => {
  test.skip(!fs.existsSync(creatorAuth), "Missing tests/.auth/creator.json — run global setup with E2E_SETUP_SECRET.");
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

    await expect(page.getByTestId("discovery-accept-tools-cta")).toBeEnabled({ timeout: 420_000 });

    const assumptions = page.locator("[data-testid^=\"discovery-assumption-\"]");
    const n = await assumptions.count();
    for (let i = 0; i < n; i++) {
      const row = assumptions.nth(i);
      const check = row.locator(".bg-emerald-500");
      if ((await check.count()) === 0) await row.click();
    }

    await page.getByTestId("discovery-accept-tools-cta").click();
    await page.waitForURL("**/architecture**", { timeout: 120_000 });

    await expect(page.getByTestId("arch-tab-tools")).toBeVisible({ timeout: 180_000 });
    await page.getByTestId("arch-tab-tools").click();

    const toolsHeader = page.getByText("Approve Recommended Tools", { exact: false });
    await expect(toolsHeader).toBeVisible({ timeout: 300_000 });

    const toolsPanel = page.locator("section").filter({ hasText: "Approve Recommended Tools" });
    for (let k = 0; k < 40; k++) {
      const lock = page.getByTestId("arch-lock-plan");
      if ((await lock.count()) > 0 && (await lock.isEnabled())) break;
      const btn = toolsPanel.getByRole("button", { name: /^Approve$/i }).first();
      if ((await btn.count()) === 0) break;
      await btn.click();
      await page.waitForTimeout(250);
    }

    await page.getByTestId("arch-tab-prompts").click();
    await expect(page.getByTestId("arch-lock-plan")).toBeEnabled({ timeout: 120_000 });
    await page.getByTestId("arch-lock-plan").click();

    await expect(page.getByTestId("arch-open-project-room")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("arch-open-project-room").click();
    await page.waitForURL("**/project-room**", { timeout: 120_000 });

    const raw = await page.evaluate(() => localStorage.getItem("buildcraft-store"));
    const pid = readSavedProjectIdFromZustandLocalStorage(raw);
    expect(pid, "savedProjectId in zustand").toBeTruthy();
    writeLastProjectId(pid!);

    await page.getByTestId("project-room-tab-talent").click();
    await page.getByTestId("talent-rerun-match").click();
    await expect(page.locator("[data-testid^=\"talent-hire-\"]").first()).toBeVisible({
      timeout: 180_000,
    });
  });
});
