import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { API, compare, LEGACY, legacyPage, OUT, reactPage, settle, shot, type DiffResult } from "./harness";

// Baseline = live legacy route editor (routes-screenshot-v5 editor()) for the same imported route.
const results: DiffResult[] = [];
test.afterAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, "results.json");
  const prev: DiffResult[] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
  const merged = [...prev.filter((p) => !results.some((r) => r.id === p.id && r.region === p.region)), ...results].sort((a, b) => (a.id + a.region).localeCompare(b.id + b.region));
  fs.writeFileSync(file, JSON.stringify(merged, null, 2));
});
const H = { "X-Admin-Key": "dev-owner-key" };
const open = async (L: Page, R: Page, q: string) => {
  await L.goto(`${LEGACY}/#/gds/routes/1?${q}`); await R.goto(`/#/gds/routes/1?${q}`);
  for (const p of [L, R]) { await expect(p.locator(".rv-editor .rv-tabbar")).toBeVisible({ timeout: 15000 }); await settle(p); }
};

for (const mode of ["view", "edit"] as const) {
  test(`route editor (${mode}): header and tab bar match legacy`, async ({ browser, baseURL }) => {
    const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
    await open(L, R, `rvtab=pickups&rvmode=${mode}`);
    expect(await R.locator(".rv-tabbar button").allTextContents()).toEqual(await L.locator(".rv-tabbar button").allTextContents());
    for (const [region, sel] of [["header", ".rv-editor .rv-gradient"], ["tabbar", ".rv-editor .rv-tabbar"]] as const) {
      const r = compare(`route-editor-${mode}`, region, await shot(L.locator(sel)), await shot(R.locator(sel)));
      results.push(r);
      expect.soft(r.sizeMatch, `${region} size legacy ${r.legacy} vs react ${r.react}`).toBeTruthy();
      expect.soft(r.diffRatio, `${region} pixel diff`).toBeLessThanOrEqual(0.01);
    }
  });
}

test("route editor: pickups show the same points per city as legacy", async ({ browser, baseURL }) => {
  const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
  await open(L, R, "rvtab=pickups&rvmode=view");
  expect(await R.locator(".rv-citytabs button").allTextContents()).toEqual(await L.locator(".rv-citytabs button").allTextContents());
  const names = (p: Page) => p.locator(".rv-stopcard h3").allTextContents();
  expect((await names(R)).map((s) => s.trim())).toEqual((await names(L)).map((s) => s.trim()));
  const times = (p: Page) => p.locator(".rv-stoptime").allTextContents();
  expect(await times(R)).toEqual(await times(L));
  // Info column: identical markup, and pixel-identical title/description. The card height itself is driven by the
  // neighbouring GPS-evidence column, which legacy fills with simulated data (documented gap), so it is not compared.
  const html = (p: Page) => p.evaluate(() => document.querySelector(".rv-stopcard .rv-stopinfo")!.outerHTML);
  expect(await html(R)).toBe(await html(L));
  for (const [region, sel] of [["pickup-title", ".rv-stopcard .rv-stopinfo h3"], ["pickup-metro", ".rv-stopcard .rv-metro-desc"]] as const) {
    const r = compare("route-editor-view", region, await shot(L.locator(sel).first()), await shot(R.locator(sel).first()));
    results.push(r);
    expect.soft(r.sizeMatch, `${region} size`).toBeTruthy();
    expect.soft(r.diffRatio, `${region} pixel diff`).toBeLessThanOrEqual(0.01);
  }
});

test("route editor: fares edit persists to PostgreSQL and is restored", async ({ browser, baseURL, request }) => {
  const R = await reactPage(browser, baseURL!);
  const fares = async () => (await (await request.get(`${API}/api/admin/route-detail/1`, { headers: H })).json()).fares as { seater: number }[];
  const before = (await fares())[0].seater;
  await R.goto("/#/gds/routes/1?rvtab=fares&rvmode=edit");
  const cell = R.getByTestId("route-fares").locator("tbody tr").first().locator("input").first();
  await expect(cell).toHaveValue(String(before));
  await cell.fill(String(before + 10));
  await R.locator('[data-rv="save"]').click();
  await expect(R.locator("#toasts")).toContainText("Fares saved");
  expect((await fares())[0].seater).toBe(before + 10);
  await R.reload();
  await expect(R.getByTestId("route-fares").locator("tbody tr").first().locator("input").first()).toHaveValue(String(before + 10));
  await R.getByTestId("route-fares").locator("tbody tr").first().locator("input").first().fill(String(before));
  await R.locator('[data-rv="save"]').click();
  await expect(R.locator("#toasts")).toContainText("Fares saved");
  expect((await fares())[0].seater).toBe(before);
});

test("route editor: view mode is read-only; viewer cannot open edit", async ({ browser, baseURL }) => {
  const R = await reactPage(browser, baseURL!);
  await R.goto("/#/gds/routes/1?rvtab=fares&rvmode=view");
  await expect(R.getByTestId("route-fares").locator("input").first()).toBeDisabled();
  await expect(R.locator('[data-rv="save"]')).toHaveCount(0);
  await expect(R.locator('.rv-tabbar [data-rv-tab="update"]')).toHaveCount(0);
});
