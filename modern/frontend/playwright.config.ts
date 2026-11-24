import { defineConfig } from "@playwright/test";

// Requires the API on JOURNEYOS_API (default http://localhost:5080) — start with modern/scripts/restart-api.ps1.
export default defineConfig({
  testDir: "./e2e",
  testIgnore: "parity/**", // legacy↔React comparisons need the legacy server: playwright.parity.config.ts
  timeout: 30_000,
  use: { baseURL: "http://localhost:5173", trace: "retain-on-failure" },
  webServer: { command: "npm run dev -- --strictPort", url: "http://localhost:5173", reuseExistingServer: true, timeout: 60_000 },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
