import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { compare, LEGACY, legacyPage, OUT, reactPage, settle, shot, type DiffResult } from "./harness";

// Baseline = live legacy GDS settings layers (settings-complete, team-access v26–v29, configuration v30/v31,
// whatsapp v33, about v32, loyalty-switch v34) on the same imported data. Read-only: no settings are saved.
test.describe.configure({ mode: "default" });
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

// [id, hash, root selector, ready selector]
const SCREENS: [string, string, string, string][] = [
  ["settings-team-office", "#/settings/team-access/office-staff", "main[data-content] > *", ".ta26-shell, .ta26-root, .stp-shell"],
  ["settings-team-branches", "#/settings/team-access/branches", "main[data-content] > *", ".ta26-shell, .ta26-root, .stp-shell"],
  ["settings-team-roles", "#/settings/team-access/access/roles/viewer", "main[data-content] > *", ".ta26-shell, .ta26-root, .stp-shell"],
  ["settings-team-bus", "#/settings/team-access/bus-staff", "main[data-content] > *", ".ta26-shell, .ta26-root, .stp-shell"],
  ["settings-team-agents", "#/settings/team-access/agents", "main[data-content] > *", ".ta26-shell, .ta26-root, .stp-shell"],
  ["settings-team-access", "#/settings/team-access/access", "main[data-content] > *", ".ta26-shell, .ta26-root, .stp-shell"],
  ["settings-team-test-access", "#/settings/team-access/access/test-access/viewer", "main[data-content] > *", ".ta26-shell, .ta26-root, .stp-shell"],
  ["settings-team-groups", "#/settings/team-access/access/groups/viewer", "main[data-content] > *", ".ta26-shell, .ta26-root, .stp-shell"],
  ["settings-team-advanced", "#/settings/team-access/access/advanced/viewer", "main[data-content] > *", ".ta26-shell, .ta26-root, .stp-shell"],
  ["settings-config-business", "#/settings/configuration/business", ".cfg30-root", ".cfg30-root"],
  ["settings-config-notifications", "#/settings/configuration/notifications", ".cfg30-root", ".cfg30-root"],
  ["settings-config-seats", "#/settings/configuration/seats", ".cfg30-root", ".cfg30-root"],
  ["settings-branding", "#/settings/branding", ".stp-shell", ".stp-brand-shell"],
  ["settings-whatsapp", "#/settings/whatsapp", ".wa33-page, .wa33-error", ".wa33-page, .wa33-error"],
  ["settings-password", "#/settings/change-password", ".stp-shell", ".stp-shell .stp-brand-card"],
  ["settings-about", "#/settings/about", "[data-ab32-page]", "[data-ab32-page]"],
];

const open = async (p: Page, base: string, hash: string, ready: string) => {
  await p.goto(`${base}/${hash}`);
  await expect(p.locator(ready).first()).toBeVisible({ timeout: 15000 });
  await settle(p);
};

for (const [id, hash, root, ready] of SCREENS) {
  test(`${id}: DOM skeleton, text and pixels match legacy`, async ({ browser, baseURL }) => {
    const L = await legacyPage(browser), R = await reactPage(browser, baseURL!);
    await open(L, LEGACY, hash, ready); await open(R, baseURL!, hash, ready);
    if (id.startsWith("settings-team")) {
      // Regular e2e suites create extra users ("Smoke …") in PostgreSQL only. Drop table rows the legacy copy does not
      // have and copy its tab counts, so both screens lay out the same data set (data normalisation, not styling).
      // Rows are matched by identity name; the LAST LOGIN cell reflects per-backend session history, so it is copied.
      const rowKey = "tbody tr";
      const keep = await L.locator(rowKey).evaluateAll((rs) => rs.map((r) => {
        const ths = [...(r.closest("table")?.querySelectorAll("thead th") ?? [])].map((t) => (t as HTMLElement).innerText.trim().toUpperCase());
        const li = ths.indexOf("LAST LOGIN");
        return [(r as HTMLElement).querySelector("strong")?.textContent ?? (r as HTMLElement).innerText, li, li >= 0 ? r.children[li]?.innerHTML ?? "" : ""] as [string, number, string];
      }));
      await R.evaluate(([sel, k]) => document.querySelectorAll(sel as string).forEach((r) => {
        const name = (r as HTMLElement).querySelector("strong")?.textContent ?? (r as HTMLElement).innerText;
        const m = (k as [string, number, string][]).find((x) => x[0] === name);
        if (!m) { r.remove(); return; }
        if (m[1] >= 0 && r.children[m[1]]) r.children[m[1]].innerHTML = m[2];
      }), [rowKey, keep] as const);
      const counts = await L.locator(".ta26-tab em").allTextContents();
      await R.evaluate((c) => document.querySelectorAll(".ta26-tab em").forEach((n, i) => { if (c[i] != null) n.textContent = c[i]; }), counts);
      await settle(R);
    }
    // The About page prints location.host; the two apps are served from different ports.
    await R.evaluate((h) => document.querySelectorAll("main[data-content] *").forEach((n) => { if (n.childNodes.length === 1 && n.textContent === location.host) n.textContent = h; }), new URL(LEGACY).host);
    if (id === "settings-about") {
      // Build metadata (env label, version+commit, commit date) describes each running build, not the UI.
      const leaves = (sel: string) => { const w = document.createTreeWalker(document.querySelector(sel)!, NodeFilter.SHOW_TEXT); const o: string[] = []; while (w.nextNode()) o.push(w.currentNode.nodeValue ?? ""); return o; };
      const lt = await L.evaluate(leaves, root);
      await R.evaluate(([sel, lt]) => {
        const meta = /^[\w.-]+:\d{2,5}$|^(LOCAL|DEV|DEVELOPMENT|PRODUCTION|STAGING)$|^\d+\.\d+\.\d+\+[0-9a-f]+$|^[0-9a-f]{7,40}$|^[A-Z][a-z]{2} \d{1,2}, \d{4}, /;
        const w = document.createTreeWalker(document.querySelector(sel as string)!, NodeFilter.SHOW_TEXT); let i = 0;
        while (w.nextNode()) { const v = (w.currentNode.nodeValue ?? "").trim(), l = ((lt as string[])[i] ?? "").trim(); if (v !== l && meta.test(v) && meta.test(l)) w.currentNode.nodeValue = (lt as string[])[i]; i++; }
      }, [root, lt] as const);
    }
    const [sr, sl] = [await R.evaluate(skeleton, root), await L.evaluate(skeleton, root)];
    const first = (a: string, b: string) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return i; };
    if (sr !== sl) { const i = first(sr, sl); console.log(`[${id}] skeleton@${i}\n L: ${sl.slice(Math.max(0, i - 80), i + 120)}\n R: ${sr.slice(Math.max(0, i - 80), i + 120)}`); }
    expect.soft(sr, "skeleton").toBe(sl);
    const text = (p: Page) => p.locator(root).first().innerText();
    const [tr, tl] = [await text(R), await text(L)];
    if (tr !== tl) { const a = tl.split("\n"), b = tr.split("\n"); const k = a.findIndex((x, j) => x !== b[j]); console.log(`[${id}] text line ${k}: L=${JSON.stringify(a.slice(k, k + 3))} R=${JSON.stringify(b.slice(k, k + 3))}`); }
    expect.soft(tr, "text").toBe(tl);
    const r = compare(id, "page", await shot(L.locator(root).first()), await shot(R.locator(root).first()));
    results.push(r);
    expect.soft(r.sizeMatch, `size legacy ${r.legacy} vs react ${r.react}`).toBeTruthy();
    expect.soft(r.diffRatio, "pixel diff").toBeLessThanOrEqual(0.01);
  });
}
