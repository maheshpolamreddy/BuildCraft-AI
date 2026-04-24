import { defineConfig, devices } from "@playwright/test";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

const envDir = __dirname;
const dotenvOpts = { quiet: true as const };
dotenv.config({ path: path.join(envDir, ".env"), ...dotenvOpts });
dotenv.config({ path: path.join(envDir, ".env.local"), ...dotenvOpts });
dotenv.config({ path: path.join(envDir, ".env.e2e.local"), override: true, ...dotenvOpts });

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
  /* Retries double wall time on flakes; re-enable locally if needed. */
  retries: 0,
  /* Independent projects (e.g. auth ∥ creator-bootstrap; hiring ∥ navigation) run in parallel. */
  workers: process.env.CI ? 2 : 4,
  timeout: 480_000,
  expect: { timeout: 45_000 },
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    headless: process.env.CI ? true : process.env.PLAYWRIGHT_HEADLESS !== "0",
    actionTimeout: 35_000,
    navigationTimeout: 90_000,
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
      name: "hiring",
      dependencies: ["creator-bootstrap"],
      testMatch: "**/hiring.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        storageState: storageIfExists(creatorState),
      },
    },
    {
      name: "workspace-after-hire",
      dependencies: ["hiring"],
      testMatch: "**/workspace.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        storageState: storageIfExists(creatorState),
      },
    },
    {
      name: "completion-after-workspace",
      dependencies: ["workspace-after-hire"],
      testMatch: "**/completion.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        storageState: storageIfExists(creatorState),
      },
    },
    {
      name: "navigation",
      dependencies: ["creator-bootstrap"],
      testMatch: "**/navigation.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        storageState: storageIfExists(creatorState),
      },
    },
  ],
});
