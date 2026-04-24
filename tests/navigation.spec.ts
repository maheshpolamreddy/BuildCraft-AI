import { test, expect } from "./fixtures";
import fs from "fs";
import path from "path";
import { readLastProjectId } from "./helpers/project-state";

const creatorAuth = path.join(process.cwd(), "tests", ".auth", "creator.json");

test.beforeEach(() => {
  test.skip(!fs.existsSync(creatorAuth), "Missing creator storage.");
});

test("refresh preserves session on discovery", async ({ page }) => {
  await page.goto("/discovery");
  await expect(page.getByTestId("discovery-idea-input")).toBeVisible({ timeout: 60_000 });
  await page.reload();
  await expect(page.getByTestId("discovery-idea-input")).toBeVisible({ timeout: 60_000 });
  await expect(page).not.toHaveURL(/\/auth/);
});

test("refresh project room with deep-linked project", async ({ page }) => {
  const pid = readLastProjectId();
  test.skip(!pid, "Requires project.spec to write last-project-id.");
  await page.goto(`/project-room?projectId=${encodeURIComponent(pid!)}`);
  await expect(page.getByTestId("project-room-tab-milestones")).toBeVisible({ timeout: 120_000 });
  await page.reload();
  await expect(page.getByTestId("project-room-tab-milestones")).toBeVisible({ timeout: 120_000 });
});
