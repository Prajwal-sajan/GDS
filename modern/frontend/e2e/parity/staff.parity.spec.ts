import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { API, compare, LEGACY, legacyPage, OUT, reactPage, settle, shot, type DiffResult } from "./harness";

// Baseline = live legacy GDS (staff-parity-v11) on the same imported data — never a React self-baseline.
// Serial: the mutation test must not toggle rows while the visual tests capture them.
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
const open = async (L: Page, R: Page) => {
  await L.goto(`${LEGACY}/#/fleet/staff`); await R.goto("/#/fleet/staff");
  for (const p of [L, R]) { await expect(p.locator("[data-staff-rows] tr").first()).toBeVisible({ timeout: 15000 }); await settle(p); }
  // Regular e2e suites create extra staff ("Smoke Relief …") in PostgreSQL only. Remove rows whose id the legacy copy
  // does not have so both tables lay out the same data set (data normalisation, not a styling change).
  const ids = await L.locator("[data-staff-rows] tr").evaluateAll((rs) => rs.map((r) => r.getAttribute("data-staff-id")));
  await R.evaluate((keep) => document.querySelectorAll("[data-staff-rows] tr").forEach((r) => { if (!keep.includes(r.getAttribute("data-staff-id"))) r.remove(); }), ids);
  await R.evaluate((n) => { const c = document.querySelector("[data-staff-count]"); if (c) c.textContent = `${n} Staff`; }, ids.length);
};

test("staff: same people, identical DOM skeleton", async ({ browser, baseURL }) => {
  const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
  await open(L, R);
  const names = (p: Page) => p.locator("[data-staff-rows] .sp-person strong").allTextContents();
  expect(await names(R)).toEqual(await names(L));
  for (const sel of [".sp-staff-top", ".sp-filter-bar", ".sp-staff-table thead", "[data-staff-rows] tr"])
    expect(await R.evaluate(skeleton, sel), sel).toBe(await L.evaluate(skeleton, sel));
  const cells = (p: Page) => p.locator("[data-staff-rows] tr").evaluateAll((rs) => rs.map((r) => (r as HTMLElement).innerText));
  expect(await cells(R)).toEqual(await cells(L));
});

test("staff: header, filter bar, table head and rows match legacy pixels", async ({ browser, baseURL }) => {
  const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
  await open(L, R);
  const regions: [string, string][] = [["top", ".sp-staff-top"], ["filters", ".sp-filter-bar"], ["thead", ".sp-staff-table thead"]];
  for (let i = 0; i < 5; i++) regions.push([`row-${i}`, `[data-staff-rows] tr >> nth=${i}`]);
  for (const [region, sel] of regions) {
    const r = compare("staff-list", region, await shot(L.locator(sel)), await shot(R.locator(sel)));
    results.push(r);
    expect.soft(r.sizeMatch, `${region} size legacy ${r.legacy} vs react ${r.react}`).toBeTruthy();
    expect.soft(r.diffRatio, `${region} pixel diff`).toBeLessThanOrEqual(0.01);
  }
});

test("staff: status switch persists in PostgreSQL and restores; editor saves email", async ({ browser, baseURL, request }) => {
  const R = await reactPage(browser, baseURL!);
  const H = { "X-Admin-Key": "dev-owner-key" };
  const get = async (id: number) => ((await (await request.get(`${API}/api/admin/staff`, { headers: H })).json()) as { id: number; status: string; email: string | null }[]).find((s) => s.id === id)!;
  await R.goto("/#/fleet/staff");
  const row = R.locator("[data-staff-rows] tr").first();
  const id = Number(await row.getAttribute("data-staff-id"));
  const start = (await get(id)).status, flipped = start === "active" ? "inactive" : "active";
  await R.locator(`[data-switch="${id}"]`).click();
  await expect.poll(async () => (await get(id)).status).toBe(flipped);
  await R.locator(`[data-switch="${id}"]`).click();
  await expect.poll(async () => (await get(id)).status).toBe(start);
  const before = (await get(id)).email;
  await R.locator(`[data-staff-id="${id}"] [data-action="edit"]`).click();
  await R.locator('.sp-dialog input[name="email"]').fill("parity.check@example.com");
  await R.locator("[data-modal-save]").click();
  await expect(R.locator("#toasts")).toContainText("Staff changes saved");
  expect((await get(id)).email).toBe("parity.check@example.com");
  await request.put(`${API}/api/admin/staff/${id}`, { headers: H, data: { ...(await get(id)), email: before ?? "" } });
});
