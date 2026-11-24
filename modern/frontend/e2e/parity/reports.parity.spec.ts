import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { compare, LEGACY, legacyPage, OUT, reactPage, settle, shot, type DiffResult } from "./harness";

// Accounts → Reports: catalogue (accounts-parity-v10.js reportCatalogue) and report screens (report-suite-v21/v22, fleet-operations-v20)
// vs React ReportsTab. Header + controls + notes are compared for every report; full bodies only where imported data matches legacy
// exactly (van bookings). Elsewhere the import window (bookings since 2026-11-24 are re-imported from the legacy store with slightly
// different status mapping) shifts counts by a few percent, so figures in stats / table cells are blanked before comparing.
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
const PERIOD = "from=2026-10-01&to=2026-10-31";
async function check(id: string, L: Page, R: Page, regions: [string, string][], pixels = true) {
  for (const [region, sel] of regions) {
    expect.soft(await R.evaluate(skeleton, sel), `${region} skeleton`).toBe(await L.evaluate(skeleton, sel));
    expect.soft(await R.locator(sel).first().innerText(), `${region} text`).toBe(await L.locator(sel).first().innerText());
  }
  if (!pixels) return;
  for (const [region, sel] of regions) {
    const r = compare(id, region, await shot(L.locator(sel).first()), await shot(R.locator(sel).first()));
    results.push(r);
    expect.soft(r.sizeMatch, `${region} size legacy ${r.legacy} vs react ${r.react}`).toBeTruthy();
    expect.soft(r.diffRatio, `${region} pixel diff`).toBeLessThanOrEqual(0.01);
  }
}
const open = async (p: Page, url: string, sel: string) => {
  await p.goto(url); await expect(p.locator(sel).first()).toBeVisible({ timeout: 60000 }); await settle(p); await p.mouse.move(5, 5);
  // regular e2e suites create "Smoke Relief …" staff in PostgreSQL only (see staff.parity.spec.ts) — data normalisation
  await p.evaluate(() => document.querySelectorAll("option").forEach((o) => { if (/^Smoke Relief/.test(o.textContent || "")) o.remove(); }));
};

test("catalogue: DOM, text and pixels match legacy", async ({ browser, baseURL }) => {
  const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
  await open(L, `${LEGACY}/#/accounts/reports`, ".ac10-reports-home"); await open(R, "/#/accounts/reports", ".ac10-reports-home");
  await check("reports-catalogue", L, R, [["catalogue", ".ac10-reports-home"]]);
  for (const p of [L, R]) { await p.locator("[data-report-find]").fill("metro"); await settle(p); }
  expect(await R.locator(".ac10-report:not([hidden])").count()).toBe(await L.locator(".ac10-report:not([hidden])").count());
  await check("reports-catalogue-search", L, R, [["catalogue", ".ac10-reports-home"]]);
});

const v21 = ["staff-duty", "driver-behavior", "point-usage", "metro-bookings", "van-bookings", "no-shows", "cancellations", "expenses"];
for (const key of v21) {
  test(`${key}: header, controls and note match legacy`, async ({ browser, baseURL }) => {
    const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
    const sel = `[data-report-v21="${key}"]`;
    await open(L, `${LEGACY}/#/accounts/reports/${key}?${PERIOD}`, sel); await open(R, `/#/accounts/reports/${key}?${PERIOD}`, sel);
    await check(`report-${key}`, L, R, [["top", `${sel} .rpt21-top`], ["controls", `${sel} .rpt21-controls`], ["note", `${sel} .rpt21-note`]]);
    // section skeleton (titles + headers) — row counts may differ with imported data
    const heads = (s: string) => [...document.querySelectorAll(`${s} .rpt21-section`)].map((x) => x.querySelector("h3")!.firstChild!.textContent + "|" + [...x.querySelectorAll("thead th")].map((t) => t.textContent).join(","));
    expect.soft(await R.evaluate(heads, sel)).toEqual(await L.evaluate(heads, sel));
    if (key === "van-bookings" || key === "staff-duty") await check(`report-${key}`, L, R, [["body", sel]], false);
  });
}

const v22 = ["frequent-travellers", "point-performance", "station-performance", "trip-pnl"];
for (const key of v22) {
  test(`${key}: header, controls and note match legacy`, async ({ browser, baseURL }) => {
    const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
    const sel = `[data-report-v22="${key}"]`;
    await open(L, `${LEGACY}/#/accounts/reports/${key}?${PERIOD}`, sel); await open(R, `/#/accounts/reports/${key}?${PERIOD}`, sel);
    const regions: [string, string][] = [["top", `${sel} > .rpt21-top`], ["note", `${sel} > .rpt21-note`]];
    if (key !== "point-performance") regions.push(["controls", `${sel} > .rpt22-controls`]);
    await check(`report-${key}`, L, R, regions);
    const heads = (s: string) => [...document.querySelectorAll(`${s} .rpt21-section`)].map((x) => [...x.querySelectorAll("thead th")].map((t) => t.textContent).join(","));
    expect.soft(await R.evaluate(heads, sel)).toEqual(await L.evaluate(heads, sel));
  });
}

test("fleet-operations: header, controls and notes match legacy", async ({ browser, baseURL }) => {
  const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
  await open(L, `${LEGACY}/#/accounts/reports/fleet-operations?${PERIOD}`, ".fop-v20"); await open(R, `/#/accounts/reports/fleet-operations?${PERIOD}`, ".fop-v20");
  await check("report-fleet", L, R, [["title", ".fop-title-row"], ["methodology", ".fop-methodology"], ["footnote", ".fop-footnote"]]);
  await check("report-fleet", L, R, [["controls", ".fop-control-row"]], false);
  const heads = () => [...document.querySelectorAll(".fop-report-section")].map((x) => [...x.querySelectorAll("thead th")].map((t) => t.textContent).join(","));
  expect.soft(await R.evaluate(heads)).toEqual(await L.evaluate(heads));
  const tiles = () => [...document.querySelectorAll(".fop-tile span")].map((t) => t.textContent);
  expect.soft(await R.evaluate(tiles)).toEqual(await L.evaluate(tiles));
});
