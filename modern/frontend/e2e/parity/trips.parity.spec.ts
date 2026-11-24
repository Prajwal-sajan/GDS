import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { compare, LEGACY, legacyPage, OUT, reactPage, settle, shot, type DiffResult } from "./harness";

// Trips (legacy trip-parity-v13.js) vs React TripsPage on the same imported data: HB1 on 2026-11-24.
// Data-only normalisation (never markup): the per-passenger trip count ("nT" in RTG) differs where the import skipped
// legacy PNRs that overlap seats (exclusion constraint) — the count is blanked on both sides. Legacy-only loyalty upgrade
// offer records (lv39 badge next to the seat) have no modern store yet → removed from legacy.
test.describe.configure({ mode: "serial" });
const results: DiffResult[] = [];
test.afterAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, "results.json");
  const prev: DiffResult[] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
  const merged = [...prev.filter((p) => !results.some((r) => r.id === p.id && r.region === p.region)), ...results].sort((a, b) => (a.id + a.region).localeCompare(b.id + b.region));
  fs.writeFileSync(file, JSON.stringify(merged, null, 2));
});
const skeleton = (sel: string) => {
  const walk = (e: Element): string => {
    if (e.tagName === "svg") return `svg[${e.innerHTML.length}]`;
    return `${e.tagName.toLowerCase()}.${[...e.classList].sort().join(".")}(${[...e.children].map(walk).join("")})`;
  };
  const root = document.querySelector(sel);
  return root ? walk(root) : "";
};
const DATE = "2026-11-24";
const normalise = (p: Page) => p.evaluate(() => {
  document.querySelectorAll(".tp13-rtg").forEach((b) => { b.textContent = b.textContent!.replace(/^\d+T/, "nT"); });
  document.querySelectorAll(".tp13-seat .lv39-upgrade-badge").forEach((b) => b.remove());
  // Route "break" stops (meal/rest) are not imported into PostgreSQL yet (LegacyImporter, tracked gap) → drop them from legacy.
  const breaks = document.querySelectorAll(".tp13-timing-table tbody tr:has(.tp13-stoptype.break)");
  if (breaks.length) {
    breaks.forEach((tr) => tr.remove());
    document.querySelectorAll(".tp13-summary.timings .tp13-metric").forEach((m) => {
      const b = m.querySelector("b")!, label = m.firstChild!.textContent!.trim();
      if (label === "Total") b.textContent = String(Number(b.textContent) - breaks.length);
      if (label === "Breaks") b.textContent = "0";
    });
  }
});
const pick = async (p: Page) => {
  await expect(p.locator("[data-trip-main] .tp13-crew, [data-trip-main] .tp13-empty").first()).toBeVisible({ timeout: 20000 });
  await p.locator("[data-trip-cal-toggle]").click();
  for (let i = 0; i < 36 && !(await p.locator(`[data-trip-cal-day="${DATE}"]`).count()); i++) {
    const head = await p.locator(".tp13-cal-head b").innerText();
    await p.locator(`[data-trip-cal-nav="${new Date(head) < new Date(DATE) ? 1 : -1}"]`).click();
  }
  await p.locator(`[data-trip-cal-day="${DATE}"]`).click();
  await expect(p.locator(".tp13-date-display")).toHaveText("24-11-2026");
  await expect(p.locator("[data-trip-main] .tp13-crew")).toBeVisible({ timeout: 20000 });
};
const open = async (L: Page, R: Page, tab: string) => {
  await L.goto(`${LEGACY}/#/trips`); await R.goto(`/#/trips`);
  for (const p of [L, R]) {
    await pick(p);
    await p.locator(`[data-trip-tab="${tab}"]`).click();
    await expect(p.locator(`[data-trip-tab="${tab}"]`)).toHaveAttribute("aria-selected", "true");
    await settle(p);
    await normalise(p);
  }
};

for (const tab of ["pickup", "drop", "timings", "docs"]) {
  test(`${tab}: filterbar, crew, tabs and body match legacy DOM and text`, async ({ browser, baseURL }) => {
    const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
    await open(L, R, tab);
    for (const sel of [".tp13-filterbar", ".tp13-crew", ".tp13-tabs", ".tp13-summary", ".tp13-body"]) {
      if (!(await L.locator(sel).count())) continue;
      expect.soft(await R.evaluate(skeleton, sel), `${sel} skeleton`).toBe(await L.evaluate(skeleton, sel));
      expect.soft(await R.locator(sel).innerText(), `${sel} text`).toBe(await L.locator(sel).innerText());
    }
  });

  test(`${tab}: matches legacy pixels`, async ({ browser, baseURL }) => {
    const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
    await open(L, R, tab);
    const regions: [string, string][] = [["filterbar", ".tp13-filterbar"], ["crew", ".tp13-crew"], ["tabs", ".tp13-tabs"], ["summary", ".tp13-summary"]];
    if (tab === "pickup" || tab === "drop") regions.push(["stop-0", ".tp13-stop >> nth=0"], ["stop-1", ".tp13-stop >> nth=1"]);
    if (tab === "timings") regions.push(["table", ".tp13-timing-table"]);
    if (tab === "docs") regions.push(["docs", ".tp13-docpanel"]);
    for (const [region, sel] of regions) {
      if (!(await L.locator(sel).count())) continue;
      const r = compare(`trips-${tab}`, region, await shot(L.locator(sel)), await shot(R.locator(sel)));
      results.push(r);
      expect.soft(r.sizeMatch, `${region} size legacy ${r.legacy} vs react ${r.react}`).toBeTruthy();
      expect.soft(r.diffRatio, `${region} pixel diff`).toBeLessThanOrEqual(0.01);
    }
  });
}
