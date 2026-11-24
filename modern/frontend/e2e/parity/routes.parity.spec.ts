import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { API, compare, LEGACY, legacyPage, OUT, reactPage, settle, shot, type DiffResult } from "./harness";

// Baseline = live legacy GDS (routes-screenshot-v5) on the same imported data — never a React self-baseline.
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
    if (e.tagName === "svg") return `svg[${e.querySelector("path")?.getAttribute("d")}]`;
    return `${e.tagName.toLowerCase()}.${[...e.classList].filter((c) => c !== "current").sort().join(".")}(${[...e.children].map(walk).join("")})`;
  };
  const root = document.querySelector(sel);
  return root ? walk(root) : "";
};
const open = async (L: Page, R: Page) => {
  await L.goto(`${LEGACY}/#/gds/routes`); await R.goto("/#/gds/routes");
  for (const p of [L, R]) { await expect(p.locator(".rv-route-row").first()).toBeVisible({ timeout: 15000 }); await settle(p); }
};

test("routes: toolbar and list header match legacy pixel-for-pixel", async ({ browser, baseURL }) => {
  const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
  await open(L, R);
  for (const [region, sel] of [["top", ".rv-list .rv-top"], ["list-head", ".rv-listhead"]] as const) {
    const r = compare("routes-list", region, await shot(L.locator(sel)), await shot(R.locator(sel)));
    results.push(r);
    expect.soft(r.sizeMatch, `${region} size legacy ${r.legacy} vs react ${r.react}`).toBeTruthy();
    expect.soft(r.diffRatio, `${region} pixel diff`).toBeLessThanOrEqual(0.01);
  }
});

test("routes: same routes, identical row DOM, row pixels", async ({ browser, baseURL }) => {
  const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
  await open(L, R);
  const svc = (p: Page) => p.locator(".rv-route-row .rv-service-no").allTextContents();
  expect(await svc(R)).toEqual(await svc(L));
  expect(await R.evaluate(skeleton, ".rv-route-row")).toBe(await L.evaluate(skeleton, ".rv-route-row"));
  expect(await R.evaluate(skeleton, ".rv-statusfilters")).toBe(await L.evaluate(skeleton, ".rv-statusfilters"));
  const n = await L.locator(".rv-route-row").count();
  for (let i = 0; i < n; i++) {
    const r = compare("routes-list", `row-${i}`, await shot(L.locator(".rv-route-row").nth(i)), await shot(R.locator(".rv-route-row").nth(i)));
    results.push(r);
    expect.soft(r.sizeMatch, `row ${i} size legacy ${r.legacy} vs react ${r.react}`).toBeTruthy();
    expect.soft(r.diffRatio, `row ${i} pixel diff`).toBeLessThanOrEqual(0.02);
  }
});

test("routes: deactivate → persisted in PostgreSQL → filters → reactivate", async ({ browser, baseURL, request }) => {
  const R = await reactPage(browser, baseURL!);
  const H = { "X-Admin-Key": "dev-owner-key" };
  const status = async (id: number) => (await (await request.get(`${API}/api/admin/route-list`, { headers: H })).json()).routes.find((r: { id: number }) => r.id === id).status;
  await R.goto("/#/gds/routes");
  const row = R.locator(".rv-route-row").last();
  const id = Number(await row.getAttribute("data-rv-route-id"));
  const sw = R.locator(`[data-rv-field="active_${id}"]`);
  await sw.click({ force: true });
  await R.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  expect(await status(id)).toBe("active");
  await sw.click({ force: true });
  await R.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
  await expect(R.locator("#toasts")).toContainText("Route inactive");
  expect(await status(id)).toBe("inactive");
  await expect(R.locator(`[data-rv-route-id="${id}"]`)).toHaveCount(0);
  await R.locator('[data-rv="filter:inactive"]').click();
  await expect(R.locator(`[data-rv-route-id="${id}"]`)).toBeVisible();
  await R.locator(`[data-rv-field="active_${id}"]`).click({ force: true });
  await R.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
  await expect(R.locator("#toasts")).toContainText("Route active");
  expect(await status(id)).toBe("active");
});
