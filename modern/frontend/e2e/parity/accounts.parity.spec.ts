import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { compare, LEGACY, legacyPage, OUT, reactPage, settle, shot, type DiffResult } from "./harness";

// Accounts → Sales (legacy accounts-parity-v10.js sales() + accounts-sales-v37.js) vs React AccountsPage on the same data.
// Data-only normalisation: the import skipped 154 legacy PNRs that overlap seats, so every amount / count can differ slightly
// → numbers are blanked; legacy's ui-common fillServices() appends duplicate service options keyed by service number
// (HB1…, which match no route) → removed; channel options / columns present on one side only (modern "counter") → removed.
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
const channels = (p: Page) => p.$$eval("select[name=source] option", (o) => o.map((x) => (x as HTMLOptionElement).value));
const normalise = (p: Page, keep: string[], sortChannels = false) => p.evaluate(([keep, sortChannels]) => {
  document.querySelectorAll("select[name=service] option").forEach((o) => { if (!/^(all|\d+)$/.test((o as HTMLOptionElement).value)) o.remove(); });
  document.querySelectorAll("select[name=source] option").forEach((o) => { if (!keep.includes((o as HTMLOptionElement).value)) o.remove(); });
  const ths = [...document.querySelectorAll("#ac10-salesgrid thead th")];
  const drop = ths.map((th, i) => (th.classList.contains("ac10-purple") && !keep.includes(th.textContent!.toLowerCase()) ? i : -1)).filter((i) => i >= 0);
  document.querySelectorAll("#ac10-salesgrid tr").forEach((tr) => drop.slice().reverse().forEach((i) => tr.children[i]?.remove()));
  if (sortChannels) {
    // booking-date basis: legacy buckets by UTC date of booked_at, React by the operator's local (IST) issue date, so the
    // first booking of each channel differs at day edges → compare channel columns as a set (names sorted, values blanked).
    const head = document.querySelector("#ac10-salesgrid thead tr")!;
    const idx = [...head.children].map((th, i) => (th.classList.contains("ac10-purple") ? i : -1)).filter((i) => i >= 0);
    const names = idx.map((i) => head.children[i].textContent!).sort();
    idx.forEach((i, j) => { head.children[i].textContent = names[j]; });
  }
  document.querySelectorAll(".ac10-stat strong").forEach((e) => { e.textContent = "#"; });
  document.querySelectorAll("#ac10-salesgrid tbody td, #ac10-salesgrid tfoot td").forEach((td, i) => {
    if (td.parentElement!.firstElementChild !== td && td.textContent!.trim()) td.textContent = "#";
    else if (/^Total \(/.test(td.textContent!)) td.textContent = "Total (#)";
    void i;
  });
}, [keep, sortChannels] as const);
const ready = async (p: Page, url: string) => {
  await p.goto(url);
  await expect(p.locator(".ac10-salesstats")).toBeVisible({ timeout: 30000 });
  await settle(p);
};
const both = async (browser: Parameters<typeof legacyPage>[0], baseURL: string, hash: string, act?: (p: Page) => Promise<void>) => {
  const L = await legacyPage(browser), R = await reactPage(browser, baseURL);
  await ready(L, `${LEGACY}/${hash}`); await ready(R, `/${hash}`);
  if (act) { await act(L); await act(R); await settle(L); await settle(R); }
  const r = new Set(await channels(R)); const keep = (await channels(L)).filter((x) => r.has(x));
  const sort = hash.includes("booking_date");
  await normalise(L, keep, sort); await normalise(R, keep, sort);
  return { L, R };
};
const pivot = (v: string) => async (p: Page) => { await p.locator(`[data-ac10="change-pivot"][data-value="${v}"]`).click(); await expect(p.locator(".ac10-table-label")).toHaveText(`BY ${v.toUpperCase()}`); };
const cases: [string, string, ((p: Page) => Promise<void>)?][] = [
  ["by-date", "#/accounts/analytics"],
  ["by-service", "#/accounts/analytics", pivot("service")],
  ["by-sector", "#/accounts/analytics", pivot("sector")],
  ["pnl", "#/accounts/analytics", pivot("pnl")],
  ["booking-basis-sector", "#/accounts/analytics?basis=booking_date&sector=102257%3A107258"],
  ["sector-menu", "#/accounts/analytics", async (p) => {
    await p.locator("[data-ac37-sector-trigger]").click();
    await expect(p.locator("[data-ac37-sector-menu]")).toBeVisible();
    // the pointer rests on the trigger after the click: move it off so Chromium's native title tooltip is not captured
    await p.mouse.move(5, 5);
  }],
];
for (const [name, hash, act] of cases) {
  test(`${name}: DOM, text and pixels match legacy`, async ({ browser, baseURL }) => {
    const { L, R } = await both(browser, baseURL!, hash, act);
    for (const sel of [".ac10-nav", ".ac10-saleshead", ".ac10-saleslower", ".ac10-salesstats", ".ac10-gst", "#ac10-salesgrid"]) {
      expect.soft(await R.evaluate(skeleton, sel), `${sel} skeleton`).toBe(await L.evaluate(skeleton, sel));
      expect.soft(await R.locator(sel).innerText(), `${sel} text`).toBe(await L.locator(sel).innerText());
    }
    const regions: [string, string][] = [["nav", ".ac10-nav"], ["head", ".ac10-saleshead"], ["lower", ".ac10-saleslower"], ["stats", ".ac10-salesstats"], ["gst", ".ac10-gst"], ["grid", "#ac10-salesgrid"]];
    // capture the open menu first: screenshotting the other regions scrolls the page, which repositions legacy's anchored menu
    if (name === "sector-menu") regions.unshift(["menu", "[data-ac37-sector-menu]"]);
    for (const [region, sel] of regions) {
      const r = compare(`accounts-${name}`, region, await shot(L.locator(sel)), await shot(R.locator(sel)));
      results.push(r);
      expect.soft(r.sizeMatch, `${region} size legacy ${r.legacy} vs react ${r.react}`).toBeTruthy();
      expect.soft(r.diffRatio, `${region} pixel diff`).toBeLessThanOrEqual(0.01);
    }
  });
}
