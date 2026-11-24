import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { API, compare, LEGACY, legacyPage, OUT, reactPage, settle, shot, type DiffResult } from "./harness";

// Baseline = live legacy GDS (vehicles-parity-v9 + vehicle-cards-v37 grid) on the same imported data.
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
    if (e.tagName === "svg") return `svg[${e.innerHTML.replace(/\s+/g, "").length}]`;
    return `${e.tagName.toLowerCase()}.${[...e.classList].sort().join(".")}(${[...e.children].map(walk).join("")})`;
  };
  const root = document.querySelector(sel);
  return root ? walk(root) : "";
};
const text = (sel: string) => [...document.querySelectorAll(sel)].map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ").trim());
// Rows created only by the modern e2e suite (not in legacy data) are removed from the React DOM before comparing.
const keepLegacy = async (L: Page, R: Page, attr: string, metricsSel: string) => {
  const ids = await L.locator(`[${attr}]`).evaluateAll((es, a) => es.map((e) => e.getAttribute(a)), attr);
  const extra = await R.evaluate(([keep, a]) => { let n = 0; document.querySelectorAll(`[${a}]`).forEach((e) => { if (!keep.includes(e.getAttribute(a))) { e.remove(); n++; } }); return n; }, [ids, attr] as const);
  return { ids, extra, metricsSel };
};

async function open(L: Page, R: Page, hash: string, card: string) {
  for (const p of [L, R]) await p.evaluate(() => { localStorage.removeItem("gds_vehicles_layout_v37"); localStorage.removeItem("gds_coaches_layout_v37"); }).catch(() => {});
  await L.goto(`${LEGACY}/${hash}`); await R.goto(`/${hash}`);
  for (const p of [L, R]) { await expect(p.locator(card).first()).toBeVisible({ timeout: 15000 }); await settle(p); }
}

test("vehicles: same fleet, identical DOM + text, regions match legacy pixels", async ({ browser, baseURL }) => {
  const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
  await open(L, R, "#/fleet/vehicles", ".vp37-vehicle-card");
  const k = await keepLegacy(L, R, "data-vp37-vehicle", "");
  test.skip(k.extra > 0, `React has ${k.extra} vehicles not present in legacy data — metrics would differ`);
  expect(await R.evaluate(text, ".vp37-vehicle-card")).toEqual(await L.evaluate(text, ".vp37-vehicle-card"));
  for (const sel of [".vp-areas", ".vp-metrics", ".vp-controls", ".vp-toolbar-actions", ".vp37-vehicle-card"])
    expect.soft(await R.evaluate(skeleton, sel), sel).toBe(await L.evaluate(skeleton, sel));
  const regions: [string, string][] = [["tabs", ".vp-areas"], ["toolbar", ".vp-toolbar-card"]];
  const n = await L.locator(".vp37-vehicle-card").count();
  for (let i = 0; i < n; i++) regions.push([`card-${i}`, `.vp37-vehicle-card >> nth=${i}`]);
  for (const [region, sel] of regions) {
    const r = compare("vehicles", region, await shot(L.locator(sel)), await shot(R.locator(sel)));
    results.push(r);
    expect.soft(r.sizeMatch, `${region} size legacy ${r.legacy} vs react ${r.react}`).toBeTruthy();
    expect.soft(r.diffRatio, `${region} pixel diff`).toBeLessThanOrEqual(0.01);
  }
});

test("coaches: same coaches, identical DOM + text, regions match legacy pixels", async ({ browser, baseURL }) => {
  const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
  await open(L, R, "#/fleet/coaches", ".vp37-coach-card");
  expect(await R.evaluate(text, ".vp37-coach-card")).toEqual(await L.evaluate(text, ".vp37-coach-card"));
  for (const sel of [".vp-areas", ".vp-coach-metrics", ".vp-coach-controls", ".vp37-coach-card"])
    expect.soft(await R.evaluate(skeleton, sel), sel).toBe(await L.evaluate(skeleton, sel));
  const regions: [string, string][] = [["tabs", ".vp-areas"], ["toolbar", ".vp-toolbar-card"]];
  const n = await L.locator(".vp37-coach-card").count();
  for (let i = 0; i < n; i++) regions.push([`card-${i}`, `.vp37-coach-card >> nth=${i}`]);
  for (const [region, sel] of regions) {
    const r = compare("coaches", region, await shot(L.locator(sel)), await shot(R.locator(sel)));
    results.push(r);
    expect.soft(r.sizeMatch, `${region} size legacy ${r.legacy} vs react ${r.react}`).toBeTruthy();
    expect.soft(r.diffRatio, `${region} pixel diff`).toBeLessThanOrEqual(0.01);
  }
});

test("vehicles + coaches: status switches persist in PostgreSQL and restore; list layout matches legacy", async ({ browser, baseURL, request }) => {
  const R = await reactPage(browser, baseURL!), L = await legacyPage(browser);
  const H = { "X-Admin-Key": "dev-owner-key" };
  const vs = async (id: number) => ((await (await request.get(`${API}/api/admin/vehicle-list`, { headers: H })).json()).vehicles as { id: number; status: string }[]).find((v) => v.id === id)!.status;
  const cs = async (id: number) => ((await (await request.get(`${API}/api/admin/coach-list`, { headers: H })).json()).coaches as { id: number; status: string }[]).find((v) => v.id === id)!.status;
  await R.goto("/#/fleet/vehicles");
  const v = R.locator(".vp-onoff [data-active]").first(); const vid = Number(await v.getAttribute("data-active"));
  const v0 = await vs(vid);
  await v.click({ force: true }); await expect.poll(() => vs(vid)).not.toBe(v0);
  await expect(R.locator(`.vp-onoff:has([data-active="${vid}"]) b`)).toHaveText(v0 === "active" ? "Inactive" : "Active");
  await R.locator(`.vp-onoff [data-active="${vid}"]`).click({ force: true }); await expect.poll(() => vs(vid)).toBe(v0);
  await R.goto("/#/fleet/coaches");
  const c = R.locator("[data-coach-status]").first(); const cid = Number(await c.getAttribute("data-coach-status"));
  const c0 = await cs(cid);
  await c.click({ force: true }); await expect.poll(() => cs(cid)).not.toBe(c0);
  await expect(R.locator(`.vp-onoff:has([data-coach-status="${cid}"]) b`)).toHaveText(c0 === "inactive" ? "Active" : "Inactive");
  await R.locator(`[data-coach-status="${cid}"]`).click({ force: true }); await expect.poll(() => cs(cid)).toBe(c0);
  // list layout (toggle) — header skeleton must match legacy
  await L.goto(`${LEGACY}/#/fleet/coaches`); await expect(L.locator(".vp37-coach-card").first()).toBeVisible({ timeout: 15000 });
  for (const p of [L, R]) { await p.locator('[data-layout="list"]').click(); await expect(p.locator(".vp-coach-table")).toBeVisible(); }
  expect(await R.evaluate(skeleton, ".vp-coach-table thead")).toBe(await L.evaluate(skeleton, ".vp-coach-table thead"));
  expect(await R.evaluate(text, ".vp-coach-table tbody tr")).toEqual(await L.evaluate(text, ".vp-coach-table tbody tr"));
  for (const p of [L, R]) await p.evaluate(() => localStorage.removeItem("gds_coaches_layout_v37"));
});
