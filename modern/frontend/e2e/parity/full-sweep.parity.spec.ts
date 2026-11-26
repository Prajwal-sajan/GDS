import fs from "node:fs";
import path from "node:path";
import { test } from "@playwright/test";
import { compare, LEGACY, legacyPage, OUT, reactPage, settle, type DiffResult } from "./harness";

// Whole-page sweep: every legacy route, full viewport (not regions), both systems signed in as owner.
// Report only (no assertion): docs/modernization/qa/parity/full-sweep.json ranks screens by pixel difference
// and records the visible text that exists in one system and not the other.
const ROUTES = [
  "#/trips", "#/gds/schedules", "#/gds/routes", "#/gds/deleted", "#/gds/routes/1?rvtab=general&rvmode=view", "#/crm", "#/dailyops", "#/sarathi", "#/chats", "#/calls",
  "#/fleet/vehicles", "#/fleet/coaches", "#/fleet/staff", "#/fleet/attendance", "#/fleet/payouts",
  "#/accounts", "#/accounts/analytics", "#/accounts/transactions", "#/accounts/receivables", "#/accounts/reports", "#/accounts/reports/fleet-operations",
  "#/accounts/invoices", "#/accounts/reconciliation",
  "#/settings/team-access/office-staff", "#/settings/users", "#/settings/roles", "#/settings/branches", "#/settings/configuration/office", "#/settings/configuration/seats",
  "#/settings/configuration/vehicle", "#/settings/configuration/expenses", "#/settings/configuration/notifications", "#/settings/configuration/monitoring",
  "#/settings/configuration/bot", "#/settings/loyalty-program/miles", "#/settings/whatsapp", "#/settings/about", "#/settings/change-password", "#/settings/my-devices",
];
type Row = DiffResult & { route: string; onlyLegacy: string[]; onlyReact: string[] };
const rows: Row[] = [];
test.afterAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "full-sweep.json"), JSON.stringify(rows.sort((a, b) => b.diffRatio - a.diffRatio), null, 2));
});

const texts = (p: import("@playwright/test").Page) => p.evaluate(() => {
  const out = new Set<string>();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const el = n.parentElement!; const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || !el.getClientRects().length) continue;
    const t = n.textContent!.replace(/\s+/g, " ").trim();
    if (t && !/\d/.test(t) && t.length < 60) out.add(t);   // labels only; numbers are live data
  }
  return [...out];
});

for (const route of ROUTES) {
  test(`sweep ${route}`, async ({ browser, baseURL }) => {
    test.setTimeout(60000);
    const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
    await L.goto(`${LEGACY}/${route}`); await R.goto(`/${route}`);
    for (const p of [L, R]) { await p.waitForTimeout(2500); await settle(p); }
    const id = "sweep" + route.replace(/[#/?=&]+/g, "-");
    const r = compare(id, "viewport", await L.screenshot({ animations: "disabled", caret: "hide" }), await R.screenshot({ animations: "disabled", caret: "hide" }));
    const [lt, rt] = [await texts(L), await texts(R)];
    rows.push({ ...r, route, onlyLegacy: lt.filter((t) => !rt.includes(t)).slice(0, 40), onlyReact: rt.filter((t) => !lt.includes(t)).slice(0, 40) });
    await L.context().close(); await R.context().close();
  });
}
