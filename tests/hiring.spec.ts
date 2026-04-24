import { test, expect } from "./fixtures";
import fs from "fs";
import path from "path";
import { readLastProjectId } from "./helpers/project-state";

const creatorAuth = path.join(process.cwd(), "tests", ".auth", "creator.json");
const developerAuth = path.join(process.cwd(), "tests", ".auth", "developer.json");

test.beforeEach(() => {
  test.skip(!fs.existsSync(creatorAuth), "Missing creator storage state.");
  test.skip(!fs.existsSync(developerAuth), "Missing developer storage state.");
  test.skip(!readLastProjectId(), "Run project.spec first to create a project.");
  test.skip(!process.env.E2E_DEVELOPER_EMAIL?.trim(), "E2E_DEVELOPER_EMAIL required for hire target.");
});

test.describe.serial("Hiring", () => {
  test("creator sends invite; developer accepts; workspace loads", async ({ browser, baseURL }) => {
    const pid = readLastProjectId()!;
    let inviteToken: string | null = null;

    const creatorCtx = await browser.newContext({
      storageState: creatorAuth,
      baseURL: baseURL ?? undefined,
    });
    const creatorPage = await creatorCtx.newPage();
    creatorPage.on("response", async (res) => {
      if (!res.url().includes("/api/hire-request")) return;
      if (!res.ok()) return;
      try {
        const j = (await res.json()) as { token?: string };
        if (j.token) inviteToken = j.token;
      } catch {
        /* */
      }
    });

    await creatorPage.goto(`/project-room?projectId=${encodeURIComponent(pid)}`);
    await creatorPage.getByTestId("project-room-tab-talent").click();
    await creatorPage.getByTestId("talent-rerun-match").click();
    const hireBtn = creatorPage.locator("[data-testid^=\"talent-hire-\"]").first();
    await expect(hireBtn).toBeVisible({ timeout: 180_000 });
    await hireBtn.click();
    await creatorPage.getByTestId("hire-send-invitation").click();
    await expect(creatorPage.getByText("Invitation sent successfully", { exact: false })).toBeVisible({
      timeout: 120_000,
    });

    await expect.poll(() => inviteToken, { timeout: 30_000 }).toBeTruthy();
    const stateDir = path.join(process.cwd(), "tests", ".state");
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, "last-invite-token.txt"), inviteToken!, "utf8");

    const devCtx = await browser.newContext({
      storageState: developerAuth,
      baseURL: baseURL ?? undefined,
    });
    const devPage = await devCtx.newPage();
    await devPage.goto(`/invite/${inviteToken!}`);
    await expect(devPage.getByTestId("invite-accept")).toBeVisible({ timeout: 60_000 });
    await devPage.getByTestId("invite-accept").click();
    await devPage.waitForURL(/\/(workspace|developer\/workspace)/, { timeout: 180_000 });

    await devCtx.close();
    await creatorCtx.close();
  });
});
