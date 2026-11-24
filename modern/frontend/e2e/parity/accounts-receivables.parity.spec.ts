import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { compare, LEGACY, legacyPage, OUT, reactPage, settle, shot, type DiffResult } from "./harness";

// Accounts → Receivables (legacy accounts-parity-v10.js receivables() + ledgerDialog()) vs React ReceivablesTab / LedgerDialog.
// The import skipped 154 overlapping legacy PNRs, so OTA / website / branch amounts differ slightly → amounts are blanked (agent rows
// match exactly but are blanked too for one rule). The legacy branch channel key is branch:{phone}; modern keys branches by the booking
// clerk's name (no phone is stored) → data-channel attributes are not compared. Ledger history is compared on its first 12 lines.
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
  const money = /^[−-]?\s*[+-]?\s*₹[\d,.]+$|^\d[\d,]*$/;
  const blank = (root: Element) => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const nodes: Text[] = [];
    while (w.nextNode()) nodes.push(w.currentNode as Text);
    nodes.forEach((t) => { if (money.test(t.data.trim())) t.data = "#"; });
  };
  document.querySelectorAll(".ac10-recstats strong, .ac10-rec-table tbody td, .ac10-rec-table tfoot td, .ac10-ledstat b").forEach(blank);
  document.querySelectorAll(".ac10-led-history .ac10-led-line").forEach((l, i) => {
    if (i >= 12) return l.remove();
    l.querySelectorAll("b, small, strong").forEach((x) => { x.textContent = "#"; });
    l.querySelector("strong")!.className = "ac10-red";
  });
  // the history list is scrollable: keep it at the top on both sides
  document.querySelector(".ac10-led-history")?.scrollTo(0, 0);
});
const ready = async (p: Page, url: string) => {
  await p.goto(url);
  await expect(p.locator(".ac10-recstats")).toBeVisible({ timeout: 30000 });
  await settle(p);
};
const ledger = async (p: Page) => {
  await p.locator('[data-ac10="ledger-open"][data-channel="ota:abhibus"][data-ledtype="debit"]').click();
  await expect(p.locator(".ac10-overlay .ac10-led-history")).toBeVisible({ timeout: 30000 });
  await p.mouse.move(5, 5);
};
const cases: [string, ((p: Page) => Promise<void>)?, boolean?][] = [
  ["all"],
  ["agents", async (p) => { await p.locator('[data-ac10="receivables-kind"][data-value="agent"]').click(); await expect(p.locator(".ac10-rec-table tbody tr")).toHaveCount(3); }],
  ["ledger-dialog", ledger, true],
];
for (const [name, act, dialog] of cases) {
  test(`${name}: DOM, text and pixels match legacy`, async ({ browser, baseURL }) => {
    const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
    await ready(L, `${LEGACY}/#/accounts/receivables`); await ready(R, "/#/accounts/receivables");
    if (act) { await act(L); await act(R); await settle(L); await settle(R); }
    await mask(L); await mask(R);
    const regions: [string, string][] = dialog
      ? [["dialog", ".ac10-overlay .md"]]
      : [["filters", "[data-ac10-page] > .ac10-row-between"], ["kinds", "[data-ac10-page] > .ac10-segment"], ["stats", ".ac10-recstats"], ["table", "[data-ac10-restable]"]];
    for (const [region, sel] of regions) {
      expect.soft(await R.evaluate(skeleton, sel), `${region} skeleton`).toBe(await L.evaluate(skeleton, sel));
      expect.soft(await R.locator(sel).innerText(), `${region} text`).toBe(await L.locator(sel).innerText());
    }
    for (const [region, sel] of regions) {
      const r = compare(`accounts-rec-${name}`, region, await shot(L.locator(sel).first()), await shot(R.locator(sel).first()));
      results.push(r);
      expect.soft(r.sizeMatch, `${region} size legacy ${r.legacy} vs react ${r.react}`).toBeTruthy();
      expect.soft(r.diffRatio, `${region} pixel diff`).toBeLessThanOrEqual(0.01);
    }
  });
}
