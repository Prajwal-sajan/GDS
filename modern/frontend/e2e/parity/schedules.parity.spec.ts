import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { compare, legacyPage, OUT, reactPage, settle, shot, LEGACY, API, type DiffResult } from "./harness";

// GDS → Schedules list: React vs the LIVE legacy screen (never a React self-baseline).
const results: DiffResult[] = [];
test.afterAll(() => {
  const file = path.join(OUT, "results.json");
  const prev: DiffResult[] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
  fs.writeFileSync(file, JSON.stringify([...prev.filter((p) => !results.some((r) => r.id === p.id && r.region === p.region)), ...results].sort((a, b) => (a.id + a.region).localeCompare(b.id + b.region)), null, 2));
});

/** Structure only: tag, classes, SVG geometry and the names of data-sx hooks — no business values. (React adds aria-* labels on purpose.) */
const skeleton = (sel: string) => {
  const walk = (e: Element): string => {
    if (e.tagName === "svg") return `svg[${e.querySelector("path")?.getAttribute("d")}]`;
    const attrs = e.getAttributeNames().filter((a) => a.startsWith("data-sx")).sort().join(",");
    return `${e.tagName.toLowerCase()}.${[...e.classList].filter((c) => c !== "on").sort().join(".")}{${attrs}}(${[...e.children].map(walk).join("")})`;
  };
  const root = document.querySelector(sel);
  return root ? walk(root) : "";
};

test("schedules: controls and table header match legacy pixel-for-pixel", async ({ browser, baseURL }) => {
  const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
  await L.goto(`${LEGACY}/#/gds/schedules`); await R.goto("/#/gds/schedules");
  for (const p of [L, R]) { await expect(p.locator(".sx-main-table tbody tr").first()).toBeVisible(); await settle(p); }
  for (const [region, sel] of [["date-controls", ".sx-date-controls"], ["table-head", ".sx-main-table thead"]] as const) {
    const r = compare("schedules-list", region, await shot(L.locator(sel)), await shot(R.locator(sel)));
    results.push(r);
    expect.soft(r.sizeMatch, `${region} size legacy ${r.legacy} vs react ${r.react}`).toBeTruthy();
    expect.soft(r.diffRatio, `${region} pixel diff`).toBeLessThanOrEqual(0.01);
  }
});

test("schedules: row structure, labels and geometry match legacy", async ({ browser, baseURL }) => {
  const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
  await L.goto(`${LEGACY}/#/gds/schedules`); await R.goto("/#/gds/schedules");
  for (const p of [L, R]) { await expect(p.locator(".sx-main-table tbody tr").first()).toBeVisible(); await settle(p); }
  // Same services listed (both systems hold the same imported routes).
  const svc = (p: typeof L) => p.locator(".sx-main-table tbody tr td:first-child b").allTextContents();
  expect((await svc(R)).sort()).toEqual((await svc(L)).sort());
  // Identical DOM skeleton for the first row and for the controls.
  expect(await R.evaluate(skeleton, ".sx-date-controls")).toBe(await L.evaluate(skeleton, ".sx-date-controls"));
  expect(await R.evaluate(skeleton, ".sx-main-table tbody tr")).toBe(await L.evaluate(skeleton, ".sx-main-table tbody tr"));
  // Column geometry.
  const widths = (p: typeof L) => p.locator(".sx-main-table thead th").evaluateAll((ths) => ths.map((t) => Math.round(t.getBoundingClientRect().width)));
  const lw = await widths(L), rw = await widths(R);
  lw.forEach((w, i) => expect.soft(Math.abs(w - rw[i]), `column ${i} width legacy ${w} vs react ${rw[i]}`).toBeLessThanOrEqual(6));
  // Report-only pixel diff of the whole list (business figures legitimately differ between the two data stores).
  results.push(compare("schedules-list", "table", await shot(L.locator(".sx-grid-scroll")), await shot(R.locator(".sx-grid-scroll"))));
});

test("schedules: disable → persisted in PostgreSQL → re-enable", async ({ browser, baseURL, request }) => {
  const R = await reactPage(browser, baseURL!);
  const H = { "X-Admin-Key": "dev-owner-key" };
  const day = async () => { const d = new Date(Date.now() + 6 * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const date = await day();
  const state = async (id: number) => (await (await request.get(`${API}/api/admin/schedules?from=${date}&to=${date}`, { headers: H })).json()).schedules.find((s: { id: number }) => s.id === id);
  await R.goto("/#/gds/schedules");
  await R.locator(`[data-sx-date="${date}"]`).click();
  const row = R.locator(".sx-main-table tbody tr").first();
  const id = Number(await row.getAttribute("data-sx-row"));
  expect((await state(id)).bookable).toBe(true);
  // Cancel in the confirm dialog leaves it untouched.
  await row.locator(".sx-switch").click();
  await expect(R.getByRole("dialog")).toContainText("Disable");
  await R.getByRole("button", { name: "Cancel" }).click();
  expect((await state(id)).bookable).toBe(true);
  // Confirm → persisted, survives reload.
  await row.locator(".sx-switch").click(); await R.getByRole("dialog").getByRole("button", { name: "Disable" }).click();
  await expect(R.locator("#toasts")).toContainText("Schedule status updated");
  expect((await state(id)).bookable).toBe(false);
  await R.reload(); await R.locator(`[data-sx-date="${date}"]`).click();
  await expect(R.locator(`[data-sx-toggle="${id}"]`)).not.toBeChecked();
  await expect(R.locator(`[data-sx-book="${id}"]`)).toBeDisabled();
  await R.locator(`[data-sx-row="${id}"] .sx-switch`).click(); await R.getByRole("dialog").getByRole("button", { name: "Activate" }).click();
  await expect(R.locator(`[data-sx-toggle="${id}"]`)).toBeChecked();
  expect((await state(id)).bookable).toBe(true);
});

test("schedules: viewer cannot toggle (UI disabled and API rejects)", async ({ browser, baseURL, request }) => {
  const H = { "X-Admin-Key": "dev-owner-key" };
  const phone = "7" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
  const u = await (await request.post(`${API}/api/admin/iam/users`, { headers: H, data: { phone, name: "Parity viewer", role: "viewer", status: "ACTIVE" } })).json();
  await request.post(`${API}/api/admin/iam/users/${u.id}/password`, { headers: H, data: { password: "parity-password-1" } });
  const token = (await (await request.post(`${API}/api/auth/login`, { data: { tenant: "demo", phone, password: "parity-password-1" } })).json()).token;
  const ctx = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((t) => sessionStorage.setItem("journeyos.adminKey", t), token);
  const p = await ctx.newPage(); await p.goto("/#/gds/schedules");
  const row = p.locator(".sx-main-table tbody tr").first(); await expect(row).toBeVisible();
  await expect(row.locator("[data-sx-toggle]")).toBeDisabled();
  const id = await row.getAttribute("data-sx-row");
  const res = await request.post(`${API}/api/admin/schedules/${id}/toggle`, { headers: { Authorization: `Bearer ${token}` }, data: { active: false } });
  expect(res.status()).toBe(403);
});
