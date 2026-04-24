import { defineConfig, devices } from "@playwright/test";
import fs from "fs";
import path from "path";

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL?.trim() ||
  "http://localhost:3000";

const creatorState = path.join(__dirname, "tests", ".auth", "creator.json");
const developerState = path.join(__dirname, "tests", ".auth", "developer.json");

function storageIfExists(file: string): string | undefined {
  return fs.existsSync(file) ? file : undefined;
}

export default defineConfig({
  testDir: "./tests",
  globalSetup: require.resolve("./global-setup.ts"),
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : 2,
  timeout: 600_000,
  expect: { timeout: 60_000 },
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    headless: process.env.CI ? true : process.env.PLAYWRIGHT_HEADLESS !== "0",
    actionTimeout: 45_000,
    navigationTimeout: 120_000,
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "auth",
      testMatch: "**/auth.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "creator-bootstrap",
      testMatch: "**/project.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        storageState: storageIfExists(creatorState),
      },
    },
    {
      name: "downstream",
      dependencies: ["creator-bootstrap"],
      testMatch: "**/{hiring,workspace,completion,navigation}.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        storageState: storageIfExists(creatorState),
      },
    },
  ],
});
