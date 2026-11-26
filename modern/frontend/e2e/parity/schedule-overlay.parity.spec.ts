import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { compare, LEGACY, legacyPage, OUT, reactPage, settle, shot, type DiffResult } from "./harness";

// Schedules → schedule management overlay (legacy schedules-screenshot-v6.js openModal). Baseline = live legacy GDS on the
// same imported data, HB1 Rajahamsa 2026-11-24. Known data-only differences are normalised below, never the markup:
//  - bookings created by the e2e suite (PNR prefix JOS…) exist only in PostgreSQL → removed from the React history table;
//  - legacy route stops carry no state, PostgreSQL does → state text blanked on both sides before the text comparison.
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
// HB1 departure on the first day shown by the Schedules list (today); both apps use the same id scheme 1000yyMMdd001.
const today = new Date();
const TRIP = `1000${String(today.getFullYear()).slice(2)}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}001`;
const normalise = (p: Page) => p.evaluate(() => {
  document.querySelectorAll(".sx-history-ui tbody tr").forEach((tr) => { if (tr.querySelector("[data-sx-pnr^='JOS']")) tr.remove(); });
  const b = document.querySelector(".sx-timeline-badges");
  if (b) b.innerHTML = "";
  document.querySelectorAll(".sx48-city-endpoints p").forEach((p) => { if (p.firstChild?.nodeType === 3) p.firstChild.textContent = " "; });
  document.querySelectorAll(".sx-cities-editor tbody tr td:first-child").forEach((td) => { if (!td.querySelector("small")) td.textContent = "—"; });
  // per-stop passenger counts include e2e bookings that exist only in PostgreSQL (data, not markup)
  document.querySelectorAll(".sx-stop-count > span").forEach((s) => { s.textContent = "N passengers"; });
});
const open = async (L: Page, R: Page, tab: string) => {
  await L.goto(`${LEGACY}/#/gds/schedules`); await R.goto(`/#/gds/schedules`);
  for (const p of [L, R]) {
    await p.locator(`[data-sx-open="${TRIP}"][data-sx-open-tab]`).first().click({ timeout: 20000 });
    await p.locator(`.sx-modal [data-sx-tab="${tab}"]`).click();
    await expect(p.locator(".sx-modal [data-sx-modal-body] > *").first()).toBeVisible({ timeout: 15000 });
    await expect(p.locator(".sx-modal [data-sx-modal-body] .sx-loading")).toHaveCount(0, { timeout: 15000 });
    await settle(p);
    await normalise(p);
  }
};

for (const tab of ["history", "pickups", "drops", "cities"]) {
  test(`${tab}: overlay header, tabs, body and footer match legacy DOM and text`, async ({ browser, baseURL }) => {
    const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
    await open(L, R, tab);
    for (const sel of ["[data-sx-modal-head]", "[data-sx-modal-tabs]", "[data-sx-modal-body]", ".sx-modal-footer"]) {
      expect.soft(await R.evaluate(skeleton, sel), `${sel} skeleton`).toBe(await L.evaluate(skeleton, sel));
      expect.soft(await R.locator(sel).innerText(), `${sel} text`).toBe(await L.locator(sel).innerText());
    }
  });

  test(`${tab}: overlay matches legacy pixels`, async ({ browser, baseURL }) => {
    const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
    await open(L, R, tab);
    const regions: [string, string][] = [["head", "[data-sx-modal-head]"], ["tabs", "[data-sx-modal-tabs]"], ["footer", ".sx-modal-footer"]];
    if (tab === "history") regions.push(["table", ".sx-history-ui .sx-table-outer"]);
    if (tab === "pickups" || tab === "drops") regions.push(["cities", ".sx-stop-cities"], ["card-0", ".sx-stop-card >> nth=0"], ["card-1", ".sx-stop-card >> nth=1"]);
    if (tab === "cities") regions.push(["adjust", ".sx48-adjust"], ["routes", ".sx48-route-pairs"]);
    for (const [region, sel] of regions) {
      if (!(await L.locator(sel).count())) continue;
      const r = compare(`schedule-overlay-${tab}`, region, await shot(L.locator(sel)), await shot(R.locator(sel)));
      results.push(r);
      expect.soft(r.sizeMatch, `${region} size legacy ${r.legacy} vs react ${r.react}`).toBeTruthy();
      expect.soft(r.diffRatio, `${region} pixel diff`).toBeLessThanOrEqual(0.01);
    }
  });
}

// P&L tab (legacy schedule-pnl-v18.js, vendored verbatim). Amounts differ because PostgreSQL also holds e2e bookings, so
// the structure (skeleton) and the fixed labels are compared; figures are checked by the backend P&L tests.
test("pnl: legacy P&L layout, labels and footer match", async ({ browser, baseURL }) => {
  const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
  await open(L, R, "pnl");
  for (const p of [L, R]) await expect(p.locator(".sxp-v18")).toBeVisible({ timeout: 15000 });
  for (const sel of ["[data-sx-modal-head]", "[data-sx-modal-tabs]", ".sxp-banner-title", ".sxp-cost-footer", ".sxp-revenue > header", ".sx-modal-footer"]) {
    expect.soft(await R.evaluate(skeleton, sel), `${sel} skeleton`).toBe(await L.evaluate(skeleton, sel));
  }
  const labels = (p: Page) => p.locator(".sxp-expense-group header b, .sxp-income-total b, .sxp-profit strong, .sxp-chip small, .sxp-cost-total span").allInnerTexts();
  expect.soft(await labels(R), "P&L labels").toEqual(await labels(L));
  const routeItems = (p: Page) => p.locator(".sxp-item:not([data-sxp-item^='manual']) .sxp-name span").allInnerTexts();
  expect.soft(await routeItems(R), "route expense lines").toEqual(await routeItems(L));
  const r = compare("schedule-overlay-pnl", "banner-title", await shot(L.locator(".sxp-banner-title")), await shot(R.locator(".sxp-banner-title")));
  results.push(r);
  expect.soft(r.diffRatio, "banner pixel diff").toBeLessThanOrEqual(0.01);
});

// Update tab (legacy schedule-update-v51.js, vendored verbatim). Crew / vehicle values come from each store, so structure
// and fixed labels of the cards are compared, plus header/tabs/footer.
test("update: legacy Update layout, labels and footer match", async ({ browser, baseURL }) => {
  const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
  await open(L, R, "update");
  for (const p of [L, R]) await expect(p.locator(".u51-root")).toBeVisible({ timeout: 15000 });
  for (const sel of ["[data-sx-modal-head]", "[data-sx-modal-tabs]", ".u51-assignment > header", ".u51-sync", ".u51-ota", ".sx-modal-footer"]) {
    expect.soft(await R.evaluate(skeleton, sel), `${sel} skeleton`).toBe(await L.evaluate(skeleton, sel));
  }
  const labels = (p: Page) => p.locator(".u51-section-label, .u51-cardhead h3, .u51-call-row > span:not(.u51-icon):not(.u51-chip-state), .u51-summary-item small").allInnerTexts();
  expect.soft(await labels(R), "Update labels").toEqual(await labels(L));
  expect.soft(await R.locator(".sx-modal-footer").innerText(), "footer text").toBe(await L.locator(".sx-modal-footer").innerText());
});

// Fares tab (legacy faresTab()). Seat groups / prices come from each store; layout blocks and labels are compared.
test("fares: legacy Fares layout, labels and footer match", async ({ browser, baseURL }) => {
  const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
  await open(L, R, "fares");
  for (const p of [L, R]) await expect(p.locator(".sx-fares-ui")).toBeVisible({ timeout: 15000 });
  for (const sel of ["[data-sx-modal-head]", "[data-sx-modal-tabs]", ".sx-pricing-top", ".sx-modal-footer"]) {
    expect.soft(await R.evaluate(skeleton, sel), `${sel} skeleton`).toBe(await L.evaluate(skeleton, sel));
  }
  const labels = (p: Page) => p.locator(".sx-fares-ui th, .sx-fare-controlbar button, .sx-fare-route > span, .sx-fare-rules h3").allInnerTexts();
  expect.soft(await labels(R), "Fares labels").toEqual(await labels(L));
  expect.soft(await R.locator(".sx-modal-footer").innerText(), "footer text").toBe(await L.locator(".sx-modal-footer").innerText());
});

// Block tab (legacy bookingTab() + blockPanel()). Seat states differ per store (e2e bookings), so the right-hand block panel
// and the legend / layout header structure and text are compared.
test("block: legacy Block panel, legend and footer match", async ({ browser, baseURL }) => {
  const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
  await open(L, R, "block");
  for (const p of [L, R]) await expect(p.locator(".sx-book-right")).toBeVisible({ timeout: 15000 });
  for (const sel of [".sx-book-head", ".sx-station-tools", ".sx-legend", ".sx-seat-bottom", ".sx-control-grid", ".sx-block-hint", ".sx-modal-footer"]) {
    expect.soft(await R.evaluate(skeleton, sel), `${sel} skeleton`).toBe(await L.evaluate(skeleton, sel));
    expect.soft(await R.locator(sel).first().innerText(), `${sel} text`).toBe(await L.locator(sel).first().innerText());
  }
});

// Bookings tab (legacy schedule-bookings-v38 chart()). Passenger counts differ per store, so static chrome is compared
// by skeleton + text and the dynamic toolbar by skeleton only.
test("bookings: legacy Pickup Chart toolbar, grouping and footer match", async ({ browser, baseURL }) => {
  const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
  await open(L, R, "bookings");
  for (const p of [L, R]) await expect(p.locator(".sx38-toolbar")).toBeVisible({ timeout: 15000 });
  for (const sel of [".sx38-right-tabs", ".sx38-groupcontrols", ".sx-modal-footer"]) {
    expect.soft(await R.evaluate(skeleton, sel), `${sel} skeleton`).toBe(await L.evaluate(skeleton, sel));
    expect.soft(await R.locator(sel).first().innerText(), `${sel} text`).toBe(await L.locator(sel).first().innerText());
  }
  for (const sel of [".sx38-toolbar", ".sx38-stats"]) expect.soft(await R.evaluate(skeleton, sel), `${sel} skeleton`).toBe(await L.evaluate(skeleton, sel));
  expect.soft(await R.locator(".sx38-selection input[type=search]").getAttribute("placeholder")).toBe("Search passenger / PNR / seat");
});
