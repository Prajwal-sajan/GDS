import { expect, test } from "@playwright/test";
import { compare, LEGACY, legacyPage, reactPage, settle, shot } from "./harness";

// Daily ops / Sarathi / Chats / Calls are the vendored legacy screens (dailyops-parity-v12, sarathi-parity-v12,
// communications-v14) mounted by LegacyScreen. Data rows differ between the stores (e2e mutations, unseeded Sarathi
// history), so the chrome regions are compared on DOM skeleton, text and pixels.
const skeleton = (sel: string) => {
  const walk = (e: Element): string => e.tagName === "svg" ? `svg[${e.innerHTML.length}]` : `${e.tagName.toLowerCase()}.${[...e.classList].sort().join(".")}(${[...e.children].map(walk).join("")})`;
  const root = document.querySelector(sel);
  return root ? walk(root) : "";
};
const cases: [string, string, [string, string][]][] = [
  ["dailyops", "#/dailyops", [["subnav", ".ds-subnav"], ["head", ".ds-report-head"], ["thead", ".ds-table thead"]]],
  ["sarathi", "#/sarathi", [["chat", ".sa-chat"]]],
  ["chats", "#/chats", [["toolbar", ".cc14-chats-toolbar"]]],
  ["calls", "#/calls", [["note", ".cc14-call-note"]]],
];
for (const [id, hash, regions] of cases) {
  test(`${id}: legacy screen chrome matches`, async ({ browser, baseURL }) => {
    const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
    await L.goto(`${LEGACY}/${hash}`); await R.goto(`/${hash}`);
    for (const p of [L, R]) { await expect(p.locator(regions[0][1]).first()).toBeVisible({ timeout: 20000 }); await settle(p); }
    for (const [region, sel] of regions) {
      expect.soft(await R.evaluate(skeleton, sel), `${region} skeleton`).toBe(await L.evaluate(skeleton, sel));
      expect.soft(await R.locator(sel).first().innerText(), `${region} text`).toBe(await L.locator(sel).first().innerText());
      const r = compare(id, region, await shot(L.locator(sel).first()), await shot(R.locator(sel).first()));
      expect.soft(r.diffRatio, `${region} pixel diff`).toBeLessThanOrEqual(0.02);
    }
  });
}
