import { defineConfig } from "@playwright/test";

// Legacy ↔ React visual parity harness. Needs:
//   * the .NET API on :5080 (modern/scripts/restart-api.ps1) and Vite (auto-started below)
//   * the legacy GDS on LEGACY_URL (default :3100) started against a COPY of data/db.json:
//       $env:GDS_DATA_DIR="$env:TEMP\gds-legacy-ref"; $env:PORT="3100"; node server/index.js
// Run: npx playwright test -c playwright.parity.config.ts
// Artifacts: docs/modernization/qa/parity/<case>/{legacy,react,diff,side-by-side}.png + results.json
export default defineConfig({
  testDir: "./e2e/parity",
  timeout: 60_000,
  workers: 1,
  use: { baseURL: "http://localhost:5173", viewport: { width: 1440, height: 900 }, trace: "retain-on-failure" },
  webServer: { command: "npm run dev -- --strictPort", url: "http://localhost:5173", reuseExistingServer: true, timeout: 60_000 },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
