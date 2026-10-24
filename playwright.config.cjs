const { defineConfig } = require("@playwright/test");

const railFlag = process.env.RAIL_FLAG ?? "1";

module.exports = defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.cjs",
  fullyParallel: false,
  workers: 1,
  // Keep CI failures visible; do not let a retry turn a flaky run green.
  retries: 0,
  // The rail's client-only navigation can mount late after repeated WebGL contexts
  // in hosted Chromium. Allow a slow fixture setup while keeping retries disabled.
  timeout: 180_000,
  expect: {
    timeout: 8_000,
  },
  reporter: "list",
  outputDir: "test-results",
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    baseURL: "http://127.0.0.1:3002",
    browserName: "chromium",
    headless: true,
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      args: [
        "--enable-webgl",
        "--ignore-gpu-blocklist",
        "--use-gl=angle",
        "--use-angle=swiftshader",
      ],
    },
  },
  webServer: {
    command: "npm run start -- -H 127.0.0.1 -p 3002",
    url: "http://127.0.0.1:3002",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_ENABLE_RAIL: railFlag,
      NEXT_PUBLIC_SPOTIFY_MOCK: "1",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
