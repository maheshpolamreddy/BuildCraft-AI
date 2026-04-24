import { test, expect } from "./fixtures";
import fs from "fs";
import path from "path";
import { readLastProjectId } from "./helpers/project-state";

const creatorAuth = path.join(process.cwd(), "tests", ".auth", "creator.json");
const developerAuth = path.join(process.cwd(), "tests", ".auth", "developer.json");

test.beforeEach(() => {
  test.skip(process.env.E2E_SKIP_COMPLETION === "1", "E2E_SKIP_COMPLETION=1");
  test.skip(!fs.existsSync(creatorAuth) || !fs.existsSync(developerAuth), "Auth storage missing.");
  test.skip(!readLastProjectId(), "No project id.");
});

/**
 * Completes all milestone tasks (dev submit → creator approve), then runs completion workflow.
 * Long-running: depends on AI-generated milestone count.
 */
test.describe.serial("Completion & Tier 3", () => {
  test("all tasks approved → deploy → dev submit → creator approve → tier banner", async ({
    browser,
    baseURL,
  }) => {
    const pid = readLastProjectId()!;
    test.setTimeout(900_000);

    const devCtx = await browser.newContext({
      storageState: developerAuth,
      baseURL: baseURL ?? undefined,
    });
    const creatorCtx = await browser.newContext({
      storageState: creatorAuth,
      baseURL: baseURL ?? undefined,
    });
    const devPage = await devCtx.newPage();
    const creatorPage = await creatorCtx.newPage();

    async function syncAllTasks() {
      for (let round = 0; round < 80; round++) {
        await devPage.bringToFront();
        await devPage.goto(`/developer/workspace/${encodeURIComponent(pid)}`);
        await devPage.getByTestId("project-room-tab-milestones").click();
        const mark = devPage.locator("[data-testid^=\"task-mark-complete-\"]").first();
        if ((await mark.count()) === 0) break;
        await mark.click();
        await devPage.waitForTimeout(400);

        await creatorPage.bringToFront();
        await creatorPage.goto(`/project-room?projectId=${encodeURIComponent(pid)}`);
        await creatorPage.getByTestId("project-room-tab-milestones").click();
        const appr = creatorPage.locator("[data-testid^=\"task-approve-\"]").first();
        if ((await appr.count()) === 0) continue;
        await appr.click();
        await creatorPage.waitForTimeout(400);
      }
    }

    await syncAllTasks();

    await devPage.goto(`/developer/workspace/${encodeURIComponent(pid)}`);
    await devPage.getByTestId("project-room-tab-completion").click();

    await expect(devPage.getByTestId("completion-deployment-url")).toBeVisible({ timeout: 180_000 });
    await devPage.getByTestId("completion-deployment-url").fill("https://e2e-example.vercel.app");
    await devPage.getByTestId("completion-deployment-save").click();

    const checklist = devPage.locator("div").filter({ hasText: "Deliverables checklist" }).first();
    const devBoxes = checklist.locator('input[type="checkbox"]');
    const dc = await devBoxes.count();
    for (let i = 0; i < dc; i++) {
      await devBoxes.nth(i).check();
    }

    await devPage.getByTestId("completion-dev-submit").click();

    await creatorPage.goto(`/project-room?projectId=${encodeURIComponent(pid)}`);
    await creatorPage.getByTestId("project-room-tab-completion").click();
    await creatorPage.getByRole("checkbox", { name: /confirm acceptance/i }).check();
    await creatorPage.getByTestId("completion-creator-approve").click();

    await expect(creatorPage.getByTestId("completion-tier3-reward")).toBeVisible({ timeout: 300_000 });

    await devCtx.close();
    await creatorCtx.close();
  });
});
