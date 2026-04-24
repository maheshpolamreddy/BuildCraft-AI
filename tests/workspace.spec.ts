import { test, expect } from "./fixtures";
import fs from "fs";
import path from "path";
import { readLastProjectId } from "./helpers/project-state";
import { readLastInviteToken } from "./helpers/invite-state";

const creatorAuth = path.join(process.cwd(), "tests", ".auth", "creator.json");
const developerAuth = path.join(process.cwd(), "tests", ".auth", "developer.json");

test.beforeEach(() => {
  test.skip(!fs.existsSync(creatorAuth) || !fs.existsSync(developerAuth), "Auth storage missing.");
  test.skip(!readLastProjectId(), "No project id.");
  test.skip(!readLastInviteToken(), "Run hiring.spec to produce invite token.");
});

test.describe.serial("Workspace task loop", () => {
  test("developer marks one task complete; creator approves; chat send", async ({ browser, baseURL }) => {
    const pid = readLastProjectId()!;

    const devCtx = await browser.newContext({
      storageState: developerAuth,
      baseURL: baseURL ?? undefined,
    });
    const devPage = await devCtx.newPage();
    await devPage.goto(`/developer/workspace/${encodeURIComponent(pid)}`);
    await devPage.getByTestId("project-room-tab-milestones").click();

    const markBtn = devPage.locator("[data-testid^=\"task-mark-complete-\"]").first();
    await expect(markBtn).toBeVisible({ timeout: 180_000 });
    await markBtn.click();
    await expect(devPage.getByText("Awaiting client", { exact: false }).first()).toBeVisible({
      timeout: 120_000,
    });

    const creatorCtx = await browser.newContext({
      storageState: creatorAuth,
      baseURL: baseURL ?? undefined,
    });
    const creatorPage = await creatorCtx.newPage();
    await creatorPage.goto(`/project-room?projectId=${encodeURIComponent(pid)}`);
    await creatorPage.getByTestId("project-room-tab-milestones").click();
    const approve = creatorPage.locator("[data-testid^=\"task-approve-\"]").first();
    await expect(approve).toBeVisible({ timeout: 120_000 });
    await approve.click();

    await creatorPage.getByTestId("project-room-tab-chat").click();
    await creatorPage.getByTestId("chat-message-input").fill(`E2E ping ${Date.now()}`);
    await creatorPage.getByTestId("chat-send").click();
    await expect(creatorPage.getByText(/E2E ping/, { exact: false }).first()).toBeVisible({
      timeout: 60_000,
    });

    await devPage.getByTestId("project-room-tab-chat").click();
    await expect(devPage.getByText(/E2E ping/, { exact: false }).first()).toBeVisible({ timeout: 120_000 });

    await devCtx.close();
    await creatorCtx.close();
  });
});
