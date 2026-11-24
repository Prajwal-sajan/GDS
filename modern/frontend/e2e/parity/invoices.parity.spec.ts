import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { compare, LEGACY, legacyPage, OUT, reactPage, settle, shot, type DiffResult } from "./harness";

// Accounts → Invoices (legacy invoices-v24.js over platform-billing-v25 data) vs React InvoicesTab.
// Both stores hold no platform-issued documents (legacy lists only status=issued, platform-generated statements), so the page
// shows the empty balance + empty month list; the Pay button opens the "No payment due" dialog.
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
const ready = async (p: Page, url: string) => { await p.goto(url); await expect(p.locator(".inv24-root")).toBeVisible({ timeout: 30000 }); await settle(p); await p.mouse.move(5, 5); };
const cases: [string, [string, string][], ((p: Page) => Promise<void>)?][] = [
  ["page", [["outstanding", ".inv24-outstanding"], ["toolbar", ".inv24-toolbar"], ["list", ".inv24-month-list"], ["footnote", ".inv24-footnote"], ["nav", ".ac10-nav"]]],
  ["pay-dialog", [["dialog", ".inv24-dialog"]], async (p) => { await p.locator('[data-inv24="pay"]').click(); await expect(p.locator(".inv24-dialog")).toBeVisible(); await p.mouse.move(5, 5); }],
];
for (const [name, regions, act] of cases) {
  test(`invoices ${name}: DOM, text and pixels match legacy`, async ({ browser, baseURL }) => {
    const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
    await ready(L, `${LEGACY}/#/accounts/invoices`); await ready(R, "/#/accounts/invoices");
    if (act) { await act(L); await act(R); await settle(L); await settle(R); }
    for (const [region, sel] of regions) {
      expect.soft(await R.evaluate(skeleton, sel), `${region} skeleton`).toBe(await L.evaluate(skeleton, sel));
      expect.soft(await R.locator(sel).innerText(), `${region} text`).toBe(await L.locator(sel).innerText());
    }
    for (const [region, sel] of regions) {
      const r = compare(`invoices-${name}`, region, await shot(L.locator(sel).first()), await shot(R.locator(sel).first()));
      results.push(r);
      expect.soft(r.sizeMatch, `${region} size legacy ${r.legacy} vs react ${r.react}`).toBeTruthy();
      expect.soft(r.diffRatio, `${region} pixel diff`).toBeLessThanOrEqual(0.01);
    }
  });
}
