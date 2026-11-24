import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { compare, LEGACY, legacyPage, OUT, reactPage, settle, shot, type DiffResult } from "./harness";

// Accounts → Transactions (legacy accounts-parity-v10.js transactions()) vs React TransactionsTab on the same data.
// Legacy always filtered by the UTC booking day (its Travel Date / Booked On toggle was inert); React honours the toggle, so the
// React side is opened with basis=booked. The import skipped 154 overlapping legacy PNRs and legacy buckets by UTC vs React by IST,
// so unfiltered lists differ: those cases blank amounts / text and compare the first rows structurally. The "pnr" case searches one
// PNR present on both sides and compares real content.
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
const mask = (p: Page) => p.evaluate(() => {
  document.querySelectorAll(".ac10-txstats strong, .ac10-transactionmini strong").forEach((e) => { e.textContent = "#"; });
  const c = document.querySelector("[data-ac10-count]"); if (c) c.textContent = "# rows";
  document.querySelectorAll("[data-ac10-tbody] tr").forEach((tr, i) => {
    if (i >= 8) return tr.remove();
    tr.removeAttribute("data-pnr");
    tr.querySelectorAll(".ac10-type").forEach((x) => { x.className = "ac10-type ok"; });
    tr.querySelectorAll(".ac10-status").forEach((x) => { x.className = "ac10-status ok"; });
    tr.querySelectorAll(".ac10-txamount").forEach((x) => { x.className = "ac10-txamount "; });
    const w = document.createTreeWalker(tr, NodeFilter.SHOW_TEXT); const nodes: Text[] = [];
    while (w.nextNode()) nodes.push(w.currentNode as Text);
    nodes.forEach((t) => { if (t.data.trim()) t.data = "#"; });
  });
});
const ready = async (p: Page, url: string) => {
  await p.goto(url);
  await expect(p.locator(".ac10-txstats")).toBeVisible({ timeout: 30000 });
  await expect(p.locator("[data-ac10-count]")).toHaveText(/rows/);
  await settle(p);
};
const kind = (v: string) => async (p: Page) => { await p.locator(`[data-ac10="transaction-kind"][data-value="${v}"]`).click(); await expect(p.locator(`[data-ac10="transaction-kind"][data-value="${v}"]`)).toHaveClass(/selected/); };
const PNR = "ST261120214051098692";
const cases: [string, boolean, ((p: Page) => Promise<void>)?][] = [
  ["all", true],
  ["debits", true, kind("debits")],
  ["pnr", false, async (p) => { await p.locator("[data-live-search]").fill(PNR); await expect(p.locator("[data-ac10-tbody] tr")).toHaveCount(1); }],
];
for (const [name, masked, act] of cases) {
  test(`${name}: DOM, text and pixels match legacy`, async ({ browser, baseURL }) => {
    const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
    await ready(L, `${LEGACY}/#/accounts/transactions`); await ready(R, "/#/accounts/transactions?basis=booked");
    // the basis toggle is real in React: show the legacy-equivalent "Travel Date" selection state for the visual comparison
    await R.evaluate(() => { const [a, b] = document.querySelectorAll(".ac10-saleshead .ac10-segment:first-of-type .ac10-btn"); a.className = "ac10-btn selected"; b.className = "ac10-btn "; });
    if (act) { await act(L); await act(R); await settle(L); await settle(R); }
    if (masked) { await mask(L); await mask(R); } else {
      for (const p of [L, R]) await p.evaluate(() => document.querySelectorAll(".ac10-txstats strong, .ac10-transactionmini strong").forEach((e) => { e.textContent = "#"; }));
    }
    const regions: [string, string][] = [["head", ".ac10-saleshead"], ["lower", ".ac10-saleslower"], ["stats", ".ac10-txstats"], ["mini", ".ac10-transactionmini"], ["list", "[data-ac10-page] > .ac10-section"]];
    for (const [region, sel] of regions) {
      expect.soft(await R.evaluate(skeleton, sel), `${region} skeleton`).toBe(await L.evaluate(skeleton, sel));
      expect.soft(await R.locator(sel).innerText(), `${region} text`).toBe(await L.locator(sel).innerText());
    }
    for (const [region, sel] of regions) {
      const r = compare(`accounts-tx-${name}`, region, await shot(L.locator(sel).first()), await shot(R.locator(sel).first()));
      results.push(r);
      expect.soft(r.sizeMatch, `${region} size legacy ${r.legacy} vs react ${r.react}`).toBeTruthy();
      expect.soft(r.diffRatio, `${region} pixel diff`).toBeLessThanOrEqual(0.01);
    }
  });
}
