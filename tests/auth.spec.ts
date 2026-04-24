import { test, expect } from "./fixtures";
import fs from "fs";
import path from "path";

test.describe("Auth surfaces", () => {
  test("unauthenticated user is redirected from discovery to auth", async ({ page }) => {
    await page.goto("/discovery");
    await page.waitForURL(/\/auth/, { timeout: 60_000 });
    await expect(page.getByTestId("auth-email")).toBeVisible();
  });

  test("auth page exposes email sign-in controls", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.getByTestId("auth-email")).toBeVisible();
    await expect(page.getByTestId("auth-password")).toBeVisible();
    await expect(page.getByTestId("auth-email-submit")).toBeVisible();
  });
});

test.describe("Optional password login (no secret)", () => {
  test.beforeEach(() => {
    test.skip(
      !process.env.E2E_CREATOR_EMAIL?.trim() ||
        !process.env.E2E_CREATOR_PASSWORD?.trim() ||
        fs.existsSync(path.join(process.cwd(), "tests", ".auth", "creator.json")),
      "Needs E2E_CREATOR_EMAIL, E2E_CREATOR_PASSWORD, and no tests/.auth/creator.json.",
    );
  });

  test("email/password sign-in reaches discovery or role step", async ({ page }) => {
    await page.goto("/auth");
    await page.getByTestId("auth-email").fill(process.env.E2E_CREATOR_EMAIL!);
    await page.getByTestId("auth-password").fill(process.env.E2E_CREATOR_PASSWORD!);
    await page.getByTestId("auth-email-submit").click();
    await expect(page).toHaveURL(/\/(discovery|auth)/, { timeout: 120_000 });
  });
});
