import { defineConfig } from "@playwright/test";

// TEST_EMAIL / TEST_PASSWORD for the dedicated test account.
try {
  process.loadEnvFile(".env.test.local");
} catch {}

export default defineConfig({
  testDir: "e2e",
  // One shared account: parallel specs would see each other's data.
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Production build: Next does not prefetch in dev, so tab speed is untestable there.
  webServer: {
    command: "npm run build && npx next start -p 3100",
    url: "http://localhost:3100/login",
    // Never reuse: a server left from an older build 500s on the new chunks.
    reuseExistingServer: false,
    timeout: 300_000,
  },
  use: {
    baseURL: "http://localhost:3100",
    channel: "chrome",
    viewport: { width: 390, height: 844 },
    hasTouch: false,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "phone",
      testMatch: /.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { storageState: "e2e/.auth/user.json" },
    },
    {
      // Only the layout and paint rules differ by width; the flows are the same.
      name: "desktop",
      testMatch: /(rules|a11y)\.spec\.ts/,
      dependencies: ["setup"],
      use: { storageState: "e2e/.auth/user.json", viewport: { width: 1440, height: 900 } },
    },
  ],
});
