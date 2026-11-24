import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { compare, legacyPage, OUT, reactPage, REPO, settle, shot, type DiffResult } from "./harness";

// Baselines are ALWAYS the live legacy GDS rendering — never a React self-baseline.
const results: DiffResult[] = [];
test.afterAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, "results.json");
  const prev: DiffResult[] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
  const merged = [...prev.filter((p) => !results.some((r) => r.id === p.id && r.region === p.region)), ...results].sort((a, b) => (a.id + a.region).localeCompare(b.id + b.region));
  fs.writeFileSync(file, JSON.stringify(merged, null, 2));
});

/** Shell acceptance: header + GDS sub-navigation must match the legacy rendering. */
const SHELL_CASES = [
  { id: "shell-trips", hash: "#/trips" },
  { id: "shell-gds-schedules", hash: "#/gds/schedules" },
  { id: "shell-fleet-vehicles", hash: "#/fleet/vehicles" },
  { id: "shell-accounts", hash: "#/accounts" },
];
// Max differing-pixel ratio allowed for the shell regions (anti-aliasing / font hinting between two pages).
const SHELL_TOLERANCE = 0.01;

for (const c of SHELL_CASES) {
  test(`shell parity ${c.hash}`, async ({ browser, baseURL }) => {
    const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
    await L.goto(`${LEGACY_BASE()}/${c.hash}`); await R.goto(`/${c.hash}`);
    await expect(L.locator("header.iconic-app-header")).toBeVisible(); await expect(R.locator("header.iconic-app-header")).toBeVisible();
    await settle(L); await settle(R);
    const h = compare(c.id, "header", await shot(L.locator("header.iconic-app-header")), await shot(R.locator("header.iconic-app-header")));
    results.push(h);
    expect.soft(h.sizeMatch, `header size legacy ${h.legacy} vs react ${h.react}`).toBeTruthy();
    expect.soft(h.diffRatio, "header pixel diff").toBeLessThanOrEqual(SHELL_TOLERANCE);
    if (await L.locator("nav.subnav").count()) {
      await expect(R.locator("nav.subnav")).toBeVisible();
      const s = compare(c.id, "subnav", await shot(L.locator("nav.subnav")), await shot(R.locator("nav.subnav")));
      results.push(s);
      expect.soft(s.sizeMatch, `subnav size legacy ${s.legacy} vs react ${s.react}`).toBeTruthy();
      expect.soft(s.diffRatio, "subnav pixel diff").toBeLessThanOrEqual(SHELL_TOLERANCE);
    } else await expect(R.locator("nav.subnav")).toHaveCount(0);
  });
}

test("shell parity: settings menu open", async ({ browser, baseURL }) => {
  const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
  await L.goto(`${LEGACY_BASE()}/#/trips`); await R.goto("/#/trips");
  for (const p of [L, R]) { await settle(p); await p.locator("[data-settings-btn]").click(); await expect(p.locator("[data-settings-pop]")).toBeVisible(); }
  // Structure: same legacy entries in the same order (React adds Integrations + Sign out — documented deviations).
  const legacyItems = await L.locator("[data-settings-link]").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.settingsLink));
  const reactItems = await R.locator("[data-settings-link]").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.settingsLink));
  expect(reactItems.filter((k) => k !== "integrations")).toEqual(legacyItems);
  results.push(compare("shell-settings-menu", "menu", await shot(L.locator("[data-settings-pop]")), await shot(R.locator("[data-settings-pop]"))));
});

test("shell parity: language menu open", async ({ browser, baseURL }) => {
  const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
  await L.goto(`${LEGACY_BASE()}/#/trips`); await R.goto("/#/trips");
  for (const p of [L, R]) { await settle(p); await p.locator("[data-language-btn]").click(); await expect(p.locator("[data-lang-pop]")).toBeVisible(); }
  const r = compare("shell-language-menu", "menu", await shot(L.locator("[data-lang-pop]")), await shot(R.locator("[data-lang-pop]")));
  results.push(r);
  expect.soft(r.diffRatio).toBeLessThanOrEqual(SHELL_TOLERANCE);
});

/** Full-page capture of every legacy view vs its React route — REPORT ONLY (feeds VISUAL_PARITY_REPORT.md; no pass/fail claim). */
const views: { id: string; hash: string }[] = JSON.parse(fs.readFileSync(path.join(REPO, "docs/modernization/qa/legacy/views.json"), "utf8")).views;
for (const v of views.filter((x) => !x.hash.includes(":id"))) {
  test(`page capture ${v.id} ${v.hash}`, async ({ browser, baseURL }) => {
    const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
    await L.goto(`${LEGACY_BASE()}/${v.hash}`); await R.goto(`/${v.hash}`);
    await settle(L); await settle(R); await L.waitForTimeout(800); await R.waitForTimeout(800);
    results.push(compare(`page-${v.id}`, "viewport", await L.screenshot({ animations: "disabled" }), await R.screenshot({ animations: "disabled" })));
  });
}

function LEGACY_BASE() { return process.env.LEGACY_URL ?? "http://localhost:3100"; }
