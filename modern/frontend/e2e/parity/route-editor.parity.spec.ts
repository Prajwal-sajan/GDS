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

test("route editor: general and cancellation settings persist to PostgreSQL and are restored", async ({ browser, baseURL, request }) => {
  const R = await reactPage(browser, baseURL!);
  type D = { updateCutoffMinutes: number; distanceKm: number | null; settings: Record<string, any>; refundSlabs: { hoursBefore: number; refundPercent: number }[] };
  const detail = async () => (await (await request.get(`${API}/api/admin/route-detail/1`, { headers: H })).json()) as D;
  const before = await detail();
  try {
    await R.goto("/#/gds/routes/1?rvtab=general&rvmode=edit");
    for (const t of ["Hub*", "KMs", "Allow Gents Next to Ladies", "Seat Sharing", "Boarding Check", "Call Routing", "Autos & Cabs", "Staff & Vehicle Assignment", "PICKUP VANS", "Tags"])
      await expect(R.locator("[data-rv-tab-body]")).toContainText(t);
    await R.getByLabel("Hub*").fill("Test Hub");
    await R.getByLabel("KMs").fill("777");
    await R.locator('[data-rv-rule="seat_sharing"]').selectOption("Full Journey");
    await R.locator(".rv-segment button", { hasText: "Both" }).click();
    await R.getByPlaceholder("Name, e.g. corridor").fill("corridor");
    await R.getByPlaceholder("Value, e.g. mumbai").fill("mumbai");
    await R.locator(".rv-inline-add button").click();
    await R.locator('[data-rv="save"]').click();
    await expect(R.locator("#toasts")).toContainText("Route saved");
    const g = await detail();
    expect(g.distanceKm).toBe(777);
    expect(g.settings).toMatchObject({ hub: "Test Hub", cabs: "Both", tags: { corridor: "mumbai" }, business_rules: { seat_sharing: "Full Journey" } });

    await R.waitForLoadState("networkidle");
    await R.locator('[data-rv-tab="cancellation"]').click();
    await R.getByLabel("Update cut-off (minutes before boarding)").fill(String(before.updateCutoffMinutes + 15));
    await R.locator(".rv-slab").first().getByLabel("Refund percentage").fill("85");
    await R.locator('[data-rv="save"]').click();
    await expect(R.locator("#toasts")).toContainText("Cancellation policy saved");
    const c = await detail();
    expect(c.refundSlabs.find((x) => x.hoursBefore === before.refundSlabs[0].hoursBefore)?.refundPercent, JSON.stringify(c.refundSlabs)).toBe(85);
    expect(c.updateCutoffMinutes).toBe(before.updateCutoffMinutes + 15);
  } finally {
    const s = before.settings ?? {};
    const res = await request.put(`${API}/api/admin/routes/1/settings`, { headers: H, data: { updateCutoffMinutes: before.updateCutoffMinutes, refundSlabs: before.refundSlabs, distanceKm: before.distanceKm,
      settings: { hub: s.hub ?? null, cabs: s.cabs ?? null, tags: s.tags ?? {}, business_rules: s.business_rules ?? {}, call_settings: s.call_settings ?? null, assignments: s.assignments ?? null, escalation_contacts: s.escalation_contacts ?? null } } });
    expect(res.ok()).toBeTruthy();
  }
  expect(await detail()).toMatchObject({ updateCutoffMinutes: before.updateCutoffMinutes, refundSlabs: before.refundSlabs });
});

test("route editor: view mode is read-only; viewer cannot open edit", async ({ browser, baseURL }) => {
  const R = await reactPage(browser, baseURL!);
  await R.goto("/#/gds/routes/1?rvtab=fares&rvmode=view");
  await expect(R.getByTestId("route-fares").locator("input").first()).toBeDisabled();
  await expect(R.locator('[data-rv="save"]')).toHaveCount(0);
  await expect(R.locator('.rv-tabbar [data-rv-tab="update"]')).toHaveCount(0);
});

type Detail = { seatBlocks: { id: number; reason: string; seats: string[] }[]; stages: { id: number; kind: string; name: string }[] };
const detailOf = async (request: import("@playwright/test").APIRequestContext) => (await (await request.get(`${API}/api/admin/route-detail/1`, { headers: H })).json()) as Detail;

test("route editor: standing seat block is created from the seat map and removed", async ({ browser, baseURL, request }) => {
  const R = await reactPage(browser, baseURL!);
  R.on("dialog", (d) => void d.accept());
  await R.goto("/#/gds/routes/1?rvtab=block&rvmode=edit");
  const before = await detailOf(request);
  const taken = new Set(before.seatBlocks.flatMap((b) => b.seats));
  const seats = R.getByTestId("route-seatmap").locator("button[data-seat]");
  await expect(seats.first()).toBeVisible();
  const codes = await seats.evaluateAll((els) => els.map((e) => e.getAttribute("data-seat")!));
  const code = codes.find((c) => !taken.has(c))!;
  try {
    await R.locator(`[data-seat="${code}"]`).click();
    await R.getByLabel("Reason").fill("E2E crew");
    await R.locator('[data-rv="block-save"]').click();
    await expect(R.locator("#toasts")).toContainText("Block saved");
    await expect(R.getByTestId("route-seat-blocks")).toContainText("E2E crew");
    expect((await detailOf(request)).seatBlocks.some((b) => b.reason === "E2E crew" && b.seats.includes(code))).toBeTruthy();
    await R.getByRole("button", { name: "Remove block E2E crew" }).click();
    await R.locator(".confirm-ok, [data-confirm-ok], button:has-text('Release')").last().click({ timeout: 3000 }).catch(() => undefined);
    await expect(R.locator("#toasts")).toContainText("Block removed");
  } finally {
    for (const b of (await detailOf(request)).seatBlocks.filter((x) => x.reason === "E2E crew")) await request.delete(`${API}/api/admin/routes/1/seat-blocks/${b.id}`, { headers: H });
  }
  expect((await detailOf(request)).seatBlocks.some((b) => b.reason === "E2E crew")).toBeFalsy();
});

test("route editor: a break point is added through the modal and deleted", async ({ browser, baseURL, request }) => {
  const R = await reactPage(browser, baseURL!);
  await R.goto("/#/gds/routes/1?rvtab=breaks&rvmode=edit");
  try {
    await R.locator('[data-rv="add-point"]').click();
    const dlg = R.getByRole("dialog", { name: /Add break/ });
    await dlg.getByLabel("Name*").fill("E2E Tea Halt");
    await dlg.getByLabel("Time*").fill("23:15");
    await dlg.locator('[data-rv="point-save"]').click();
    await expect(R.locator("#toasts")).toContainText("Point added");
    await expect(R.locator(".rv-stopcard h3")).toContainText(["E2E Tea Halt"]);
    expect((await detailOf(request)).stages.some((s) => s.kind === "break" && s.name === "E2E Tea Halt")).toBeTruthy();
    await R.getByRole("button", { name: "Delete E2E Tea Halt" }).click();
    await R.locator(".confirm-ok, [data-confirm-ok], button:has-text('Delete')").last().click({ timeout: 3000 }).catch(() => undefined);
    await expect(R.locator("#toasts")).toContainText("Point deleted");
  } finally {
    for (const s of (await detailOf(request)).stages.filter((x) => x.name === "E2E Tea Halt")) await request.delete(`${API}/api/admin/routes/1/stages/${s.id}`, { headers: H });
  }
});

test("route editor: update tab previews a timetable shift without changing it", async ({ browser, baseURL, request }) => {
  const R = await reactPage(browser, baseURL!);
  const times = async () => (await (await request.get(`${API}/api/admin/route-detail/1`, { headers: H })).json()).stops.map((s: { time: string }) => s.time);
  const before = await times();
  await R.goto("/#/gds/routes/1?rvtab=update&rvmode=edit");
  await R.getByLabel("Minutes").fill("20");
  await expect(R.locator('[data-rv="shift-apply"]')).toBeDisabled();
  await R.locator('[data-rv="shift-preview"]').click();
  // Either the before/after table, or the guard that a departure is on the road right now.
  await expect(R.getByTestId("shift-impact").or(R.locator("#toasts").getByText(/on the road/))).toBeVisible();
  expect(await times()).toEqual(before);
});
