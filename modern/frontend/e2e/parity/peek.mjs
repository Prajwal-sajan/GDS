// Dumps the main content (class skeleton + first text) of a hash on legacy and React. Usage: node e2e/parity/peek.mjs "#/settings"
import { chromium } from "@playwright/test";
const hashes = process.argv.slice(2);
const LEGACY = process.env.LEGACY_URL ?? "http://localhost:3100";
const b = await chromium.launch();
const dump = () => {
  const m = document.querySelector("main[data-content]") ?? document.body;
  const walk = (e, d) => d > 3 ? "" : `${"  ".repeat(d)}${e.tagName.toLowerCase()}.${[...e.classList].join(".")}\n${[...e.children].slice(0, 8).map((c) => walk(c, d + 1)).join("")}`;
  return `url=${location.hash}\n${walk(m, 0)}\nTEXT: ${m.innerText.slice(0, 600).replace(/\n+/g, " | ")}`;
};
const lc = await b.newContext({ viewport: { width: 1440, height: 900 } });
const otp = await (await lc.request.post(`${LEGACY}/api/auth/request-otp`, { data: { phone: "9999999999" } })).json();
const v = await (await lc.request.post(`${LEGACY}/api/auth/verify-otp`, { data: { phone: "9999999999", otp: otp.dev_hint } })).json();
await lc.addInitScript((t) => { localStorage.setItem("token", t); localStorage.setItem("stp_language", "English"); }, v.token);
const rc = await b.newContext({ viewport: { width: 1440, height: 900 } });
await rc.addInitScript(() => { sessionStorage.setItem("journeyos.adminKey", "dev-owner-key"); localStorage.setItem("stp_language", "English"); });
for (const h of hashes) {
  for (const [name, ctx, base] of [["LEGACY", lc, LEGACY], ["REACT", rc, "http://localhost:5173"]]) {
    const p = await ctx.newPage(); await p.goto(`${base}/${h}`); await p.waitForTimeout(2500);
    console.log(`===== ${name} ${h}\n${await p.evaluate(dump)}`); await p.close();
  }
}
await b.close();
