import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { compare, LEGACY, legacyPage, OUT, reactPage, settle, shot, type DiffResult } from "./harness";

// Accounts → Agent Settings and Loyalty (legacy accounts-parity-v10.js) vs React AgentLoyaltyTabs.
// Two deliberate legacy display bugs are fixed in React, so legacy text is normalised before comparing:
//  * OTA card "Tax on Fare" printed gst_on_commission_percent (18%) instead of tax_on_fare_percent (5% for every seeded OTA);
//  * "percentage" coupons (SAVE10, WELCOME15) were shown as "₹N flat" because legacy only recognised discount_type "percent".
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
const fixLegacy = (t: string) => t.replaceAll("Tax on Fare\n18%", "Tax on Fare\n5%").replace("₹10 flat", "10% off").replace("₹15 flat", "15% off");
// Business e2e runs create throw-away "E2E agent" users in Postgres only; drop them from the React DOM (cards + tab count).
let e2eAgents = 0;
test.beforeAll(async ({ request }) => {
  const d = await (await request.get("http://localhost:5080/api/admin/accounts/agent-settings", { headers: { "X-Admin-Key": "dev-owner-key", "X-Tenant": "demo" } })).json();
  e2eAgents = d.agents.filter((a: { name: string }) => a.name === "E2E agent").length;
});
const stripE2E = (p: Page) => p.evaluate((extra) => {
  document.querySelectorAll(".ac10-agentcard").forEach((c) => { if (c.querySelector("strong")?.textContent === "E2E agent") c.remove(); });
  document.querySelectorAll(".ac10-coupontable tbody tr").forEach((r) => { if (/^E2E\d+$/.test(r.querySelector("td")?.textContent ?? "")) r.remove(); });
  const b = document.querySelector('[data-ac10="agent-tab"][data-value="agents"]');
  if (b) b.textContent = b.textContent!.replace(/\d+$/, (n) => String(Number(n) - extra));
}, e2eAgents);
type Case = [string, string, string, [string, string][], ((p: Page) => Promise<void>)?, boolean?];
const DLG = ".ov.ac10-overlay .md";
const cases: Case[] = [
  ["agent-otas", "agent-settings", ".ac10-agentcard", [["nav", ".ac10-nav"], ["page", "[data-ac10-page]"]]],
  ["agent-agents", "agent-settings", ".ac10-agentcard", [["page", "[data-ac10-page]"]], async (p) => { await p.locator('[data-ac10="agent-tab"][data-value="agents"]').click(); await expect(p.locator(".ac10-agentcard .ac10-note").first()).toBeVisible(); }],
  ["agent-ota-edit", "agent-settings", ".ac10-agentcard", [["dialog", DLG]], async (p) => { await p.locator('[data-ac10="agent-edit"]').first().click(); await expect(p.locator(DLG)).toBeVisible(); }],
  ["agent-terms", "agent-settings", ".ac10-agentcard", [["dialog", DLG]], async (p) => {
    await p.locator('[data-ac10="agent-tab"][data-value="agents"]').click(); await expect(p.locator(".ac10-agentcard .ac10-note").first()).toBeVisible();
    await p.locator('[data-ac10="agent-add"]').click(); await expect(p.locator(DLG)).toBeVisible();
  }],
  ["loyalty", "coupons", ".ac10-coupontable", [["page", "[data-ac10-page]"]], undefined, true],
  ["coupon-new", "coupons", ".ac10-coupontable", [["dialog", DLG]], async (p) => { await p.locator('[data-ac10="coupon-new"]').click(); await expect(p.locator(DLG)).toBeVisible(); }],
];
for (const [name, tab, waitFor, regions, act, noPixels] of cases) {
  test(`accounts ${name}: DOM, text and pixels match legacy`, async ({ browser, baseURL }) => {
    const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
    for (const [p, url] of [[L, `${LEGACY}/#/accounts/${tab}`], [R, `/#/accounts/${tab}`]] as const) {
      await p.goto(url); await expect(p.locator(waitFor).first()).toBeVisible({ timeout: 30000 });
      if (act) await act(p);
      if (p === R) await stripE2E(R);
      await settle(p); await p.mouse.move(5, 5);
    }
    for (const [region, sel] of regions) {
      expect.soft(await R.evaluate(skeleton, sel), `${region} skeleton`).toBe(await L.evaluate(skeleton, sel));
      expect.soft(await R.locator(sel).first().innerText(), `${region} text`).toBe(fixLegacy(await L.locator(sel).first().innerText()));
    }
    if (noPixels) return; // loyalty: the two fixed discount cells legitimately differ in pixels
    for (const [region, sel] of regions) {
      const r = compare(`accounts-${name}`, region, await shot(L.locator(sel).first()), await shot(R.locator(sel).first()));
      results.push(r);
      expect.soft(r.sizeMatch, `${region} size legacy ${r.legacy} vs react ${r.react}`).toBeTruthy();
      expect.soft(r.diffRatio, `${region} pixel diff`).toBeLessThanOrEqual(0.01);
    }
  });
}
