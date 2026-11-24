import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { compare, LEGACY, legacyPage, OUT, reactPage, settle, shot, type DiffResult } from "./harness";

// CRM passenger search (legacy crm-screenshot-v8.js) vs React CrmPage on the same imported data.
// Data-only normalisation: the import skipped legacy PNRs that overlap seats, so per-customer counts / spend / the
// skipped booking rows can differ → compared rows are the PNRs present on both sides; KPI numbers blanked.
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
const PHONE = "8853429780";
const pnrs = (p: Page) => p.locator(".cv8-ticketrow .cv8-link").allInnerTexts().then((x) => x.map((t) => t.trim()));
const keepOnly = (p: Page, keep: string[]) => p.evaluate((keep) => {
  document.querySelectorAll(".cv8-ticketrow").forEach((tr) => { if (!keep.includes((tr.querySelector(".cv8-link") as HTMLElement).innerText.trim())) tr.remove(); });
  document.querySelectorAll(".cv8-stat strong, .cv8-stat label, .cv8-countbar > span > strong, .cv8-status-tabs em").forEach((e) => { e.textContent = "#"; });
  document.querySelectorAll(".cv8-countbar > span").forEach((s) => { s.childNodes[1].textContent = " trips for "; });
}, keep);
const run = async (p: Page, url: string, mode: string, q: string) => {
  await p.goto(url);
  await expect(p.locator(".cv8-searchpanel")).toBeVisible({ timeout: 20000 });
  if (!q) return;
  await p.locator(`[data-cv8-mode=${mode}]`).click();
  await p.locator("[data-cv8-q]").fill(q);
  await p.locator(".cv8-searchform .cv8-primary").click();
  await expect(p.locator(".cv8-customer, .cv8-unsearched").first()).toBeVisible({ timeout: 20000 });
  await settle(p);
};
const both = async (browser: Parameters<typeof legacyPage>[0], baseURL: string, mode: string, q: string) => {
  const L = await legacyPage(browser), R = await reactPage(browser, baseURL);
  await run(L, `${LEGACY}/#/crm`, mode, q); await run(R, "/#/crm", mode, q);
  if (q) { const r = new Set(await pnrs(R)); const keep = (await pnrs(L)).filter((x) => r.has(x)); await keepOnly(L, keep); await keepOnly(R, keep); }
  return { L, R };
};

for (const [name, mode, q] of [["empty", "pnr", ""], ["phone", "phone", PHONE], ["none", "phone", "9000012345"]] as const) {
  test(`${name}: DOM, text and pixels match legacy`, async ({ browser, baseURL }) => {
    const { L, R } = await both(browser, baseURL!, mode, q);
    for (const sel of [".cv8-searchpanel", "[data-cv8-results]"]) {
      expect.soft(await R.evaluate(skeleton, sel), `${sel} skeleton`).toBe(await L.evaluate(skeleton, sel));
      expect.soft(await R.locator(sel).innerText(), `${sel} text`).toBe(await L.locator(sel).innerText());
    }
    const regions: [string, string][] = [["search", ".cv8-search-main"], ["results", "[data-cv8-results] > * >> nth=0"]];
    if (name === "phone") regions.push(["countbar", ".cv8-countbar"], ["thead", ".cv8-tickets thead"], ["row-0", ".cv8-ticketrow >> nth=0"]);
    for (const [region, sel] of regions) {
      if (!(await L.locator(sel).count())) continue;
      const r = compare(`crm-${name}`, region, await shot(L.locator(sel)), await shot(R.locator(sel)));
      results.push(r);
      expect.soft(r.sizeMatch, `${region} size legacy ${r.legacy} vs react ${r.react}`).toBeTruthy();
      expect.soft(r.diffRatio, `${region} pixel diff`).toBeLessThanOrEqual(0.01);
    }
  });
}

const OPNR = "ST261120214051098630";
test("booking overlay: DOM, text and pixels match legacy", async ({ browser, baseURL }) => {
  const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
  for (const [p, url] of [[L, `${LEGACY}/#/crm`], [R, "/#/crm"]] as const) {
    await run(p, url, "pnr", OPNR);
    await p.locator(".cv8-ticketrow .cv8-link").first().click();
    await expect(p.locator(".cv8-overlay .cv8-busmaps .cv8-seat").first()).toBeVisible({ timeout: 20000 });
    await settle(p);
    // seat reservation counts / booked-on-other-leg states depend on legacy PNRs skipped at import, and the booked-at time
    await p.evaluate(() => {
      document.querySelectorAll(".cv8-seat-count").forEach((e) => e.remove());
      // live legacy store has released the route-level "Crew berth" block (6U) still present in the imported snapshot
      document.querySelectorAll(".cv8-seat.blocked").forEach((e) => { e.classList.replace("blocked", "available"); e.setAttribute("data-cv8-seat-status", "available"); });
      document.querySelectorAll(".cv8-booking-main .cv8-muted").forEach((e) => { e.textContent = "Booked: #"; });
    });
  }
  const parts: [string, string][] = [["header", ".cv8-dialog-hd"], ["actionbar", ".cv8-actionbar"], ["ticket", ".cv8-detailcard.booking"],
    ["contact", ".cv8-detailcard.contact"], ["fare", ".cv8-detailcard.fare"], ["map", ".cv8-busmaps"]];
  for (const [region, sel] of parts) {
    expect.soft(await R.evaluate(skeleton, sel), `${region} skeleton`).toBe(await L.evaluate(skeleton, sel));
    expect.soft(await R.locator(sel).innerText(), `${region} text`).toBe(await L.locator(sel).innerText());
    if (region === "map") continue; // seat states compared via DOM; fare labels identical
    const r = compare("crm-overlay", region, await shot(L.locator(sel)), await shot(R.locator(sel)));
    results.push(r);
    expect.soft(r.sizeMatch, `${region} size legacy ${r.legacy} vs react ${r.react}`).toBeTruthy();
    expect.soft(r.diffRatio, `${region} pixel diff`).toBeLessThanOrEqual(0.01);
  }
});
