import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { API, compare, LEGACY, legacyPage, OUT, reactPage, settle, shot, type DiffResult } from "./harness";

// Staff → Attendance / Advances / Reimbursements / Payouts. Baseline = live legacy GDS (fleet.js + staff-parity-v11 otherPage)
// on the same imported data. Serial: the mutation test must not change rows while the visual tests capture them.
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
const H = { "X-Admin-Key": "dev-owner-key" };
const TABS = ["attendance", "advances", "reimbursements", "payouts"] as const;
const open = async (L: Page, R: Page, tab: string) => {
  await L.goto(`${LEGACY}/#/fleet/${tab}`); await R.goto(`/#/fleet/${tab}`);
  for (const p of [L, R]) { await expect(p.locator(".sp-native-body .tw, .sp-native-body .empty").first()).toBeVisible({ timeout: 15000 }); await settle(p); }
};

for (const tab of TABS) {
  test(`${tab}: identical DOM skeleton and text`, async ({ browser, baseURL }) => {
    const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
    await open(L, R, tab);
    expect(await R.evaluate(skeleton, ".sp-workspace-head"), "head").toBe(await L.evaluate(skeleton, ".sp-workspace-head"));
    expect(await R.locator(".sp-workspace-head").innerText()).toBe(await L.locator(".sp-workspace-head").innerText());
    expect(await R.evaluate(skeleton, ".sp-native-body"), "body").toBe(await L.evaluate(skeleton, ".sp-native-body"));
    expect(await R.locator(".sp-native-body").innerText()).toBe(await L.locator(".sp-native-body").innerText());
  });

  test(`${tab}: header, KPIs, toolbar and table match legacy pixels`, async ({ browser, baseURL }) => {
    const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
    await open(L, R, tab);
    const regions: [string, string][] = [["head", ".sp-workspace-head"], ["toolbar", ".sp-native-body > .row.between"], ["thead", ".sp-native-body table.t thead"]];
    if (tab !== "attendance") regions.push(["kpis", ".sp-native-body > .grid"]);
    for (let i = 0; i < 3; i++) regions.push([`row-${i}`, `.sp-native-body table.t tbody tr >> nth=${i}`]);
    for (const [region, sel] of regions) {
      if (!(await L.locator(sel).count())) continue;
      const r = compare(`staff-${tab}`, region, await shot(L.locator(sel)), await shot(R.locator(sel)));
      results.push(r);
      expect.soft(r.sizeMatch, `${region} size legacy ${r.legacy} vs react ${r.react}`).toBeTruthy();
      expect.soft(r.diffRatio, `${region} pixel diff`).toBeLessThanOrEqual(0.01);
    }
  });
}

test("advances & reimbursements: create / recover / approve round-trip through PostgreSQL, then clean up", async ({ browser, baseURL, request }) => {
  const R = await reactPage(browser, baseURL!);
  const adv = async () => (await (await request.get(`${API}/api/admin/payroll/advances`, { headers: H })).json()) as { advances: { id: number; amount: number; amount_recovered: number; status: string; reason: string | null }[] };
  await R.goto("/#/fleet/advances");
  await R.locator("[data-new]").click();
  await R.locator('.md input[name="amount"]').fill("750");
  await R.locator('.md input[name="reason"]').fill("parity-check");
  await R.locator(".md [data-y]").click();
  await expect(R.locator("#toasts")).toContainText("Advance recorded");
  const a = (await adv()).advances.find((x) => x.reason === "parity-check")!;
  expect(a.amount).toBe(750);
  try {
    await R.locator(`[data-rec="${a.id}"]`).click();
    await R.locator('.md input[name="amount"]').fill("750");
    await R.locator(".md [data-y]").click();
    await expect.poll(async () => (await adv()).advances.find((x) => x.id === a.id)?.status).toBe("recovered");
  } finally {
    await request.delete(`${API}/api/admin/payroll/advances/${a.id}`, { headers: H });
  }

  const reimb = async () => (await (await request.get(`${API}/api/admin/payroll/reimbursements`, { headers: H })).json()) as { reimbursements: { id: number; status: string; description: string }[] };
  await R.goto("/#/fleet/reimbursements");
  await R.locator("[data-new]").click();
  await R.locator('.md input[name="amount"]').fill("120");
  await R.locator('.md input[name="description"]').fill("parity-claim");
  await R.locator(".md [data-y]").click();
  await expect.poll(async () => (await reimb()).reimbursements.some((x) => x.description === "parity-claim")).toBeTruthy();
  const c = (await reimb()).reimbursements.find((x) => x.description === "parity-claim")!;
  try {
    await R.locator(`[data-act="${c.id}|approve"]`).click();
    await expect.poll(async () => (await reimb()).reimbursements.find((x) => x.id === c.id)?.status).toBe("approved");
  } finally {
    await request.delete(`${API}/api/admin/payroll/reimbursements/${c.id}`, { headers: H });
  }
});
