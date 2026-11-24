import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { compare, LEGACY, legacyPage, OUT, reactPage, settle, shot, type DiffResult } from "./harness";

// Accounts → OTA Invoice Verifier (legacy ota-reconciliation-v43.js) vs React ReconciliationTab.
// Legacy holds no uploaded payment advices. The modern store can hold leftovers from business e2e uploads
// (e.g. statement.csv), which are removed through the same delete API first so both ledgers show the empty state.
test.describe.configure({ mode: "serial" });
const results: DiffResult[] = [];
test.afterAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, "results.json");
  const prev: DiffResult[] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
  const merged = [...prev.filter((p) => !results.some((r) => r.id === p.id && r.region === p.region)), ...results].sort((a, b) => (a.id + a.region).localeCompare(b.id + b.region));
  fs.writeFileSync(file, JSON.stringify(merged, null, 2));
});
test.beforeAll(async ({ request }) => {
  const headers = { "X-Admin-Key": "dev-owner-key", "X-Tenant": "demo" };
  const list = await (await request.get("http://localhost:5080/api/admin/reconciliation/v43/invoices", { headers })).json();
  for (const d of list.imports ?? []) await request.delete(`http://localhost:5080/api/admin/reconciliation/v43/invoices/${d.id}`, { headers, data: { confirm: d.invoice_number } });
});
const skeleton = (sel: string) => {
  const walk = (e: Element): string => {
    if (e.tagName === "svg") return `svg[${e.innerHTML.length}]`;
    return `${e.tagName.toLowerCase()}.${[...e.classList].sort().join(".")}(${[...e.children].map(walk).join("")})`;
  };
  const root = document.querySelector(sel);
  return root ? walk(root) : "";
};
const ready = async (p: Page, url: string) => { await p.goto(url); await expect(p.locator(".ota43-ledger")).toBeVisible({ timeout: 30000 }); await settle(p); await p.mouse.move(5, 5); };
const cases: [string, [string, string][], ((p: Page) => Promise<void>)?][] = [
  ["ledger", [["ledger", ".ota43-ledger"], ["nav", ".ac10-nav"]]],
  ["upload-dialog", [["dialog", ".ota43-upload-dialog"]], async (p) => { await p.locator('[data-ota43="upload"]').click(); await expect(p.locator(".ota43-upload-dialog")).toBeVisible(); await p.mouse.move(5, 5); }],
];
for (const [name, regions, act] of cases) {
  test(`ota verifier ${name}: DOM, text and pixels match legacy`, async ({ browser, baseURL }) => {
    const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
    await ready(L, `${LEGACY}/#/accounts/reconciliation`); await ready(R, "/#/accounts/reconciliation");
    if (act) { await act(L); await act(R); await settle(L); await settle(R); }
    for (const [region, sel] of regions) {
      expect.soft(await R.evaluate(skeleton, sel), `${region} skeleton`).toBe(await L.evaluate(skeleton, sel));
      expect.soft(await R.locator(sel).innerText(), `${region} text`).toBe(await L.locator(sel).innerText());
    }
    for (const [region, sel] of regions) {
      const r = compare(`ota-verifier-${name}`, region, await shot(L.locator(sel).first()), await shot(R.locator(sel).first()));
      results.push(r);
      expect.soft(r.sizeMatch, `${region} size legacy ${r.legacy} vs react ${r.react}`).toBeTruthy();
      expect.soft(r.diffRatio, `${region} pixel diff`).toBeLessThanOrEqual(0.01);
    }
  });
}
