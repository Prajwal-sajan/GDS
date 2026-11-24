// Dev probe: dumps legacy vs React DOM + computed geometry for a selector, to explain pixel diffs.
// Usage: node e2e/parity/probe.mjs "#/gds/schedules" "header.iconic-app-header"
import { chromium } from "@playwright/test";
const [hash = "#/trips", sel = "header.iconic-app-header"] = process.argv.slice(2);
const LEGACY = process.env.LEGACY_URL ?? "http://localhost:3100";
const b = await chromium.launch();
const geo = (s) => [...document.querySelectorAll(s)].map((root) => [root, ...root.querySelectorAll("*")].slice(0, 60).map((e) => {
  const r = e.getBoundingClientRect(), c = getComputedStyle(e);
  return `${e.tagName.toLowerCase()}.${[...e.classList].join(".")} ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)} font=${c.fontFamily.split(",")[0]} ${c.fontSize} ${c.fontWeight} color=${c.color} bg=${c.backgroundColor} pad=${c.padding}`;
}).join("\n")).join("\n---\n");
async function legacy() {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const otp = await (await ctx.request.post(`${LEGACY}/api/auth/request-otp`, { data: { phone: "9999999999" } })).json();
  const v = await (await ctx.request.post(`${LEGACY}/api/auth/verify-otp`, { data: { phone: "9999999999", otp: otp.dev_hint } })).json();
  await ctx.addInitScript((t) => localStorage.setItem("token", t), v.token);
  const p = await ctx.newPage(); await p.goto(`${LEGACY}/${hash}`); await p.waitForTimeout(1500); return p;
}
async function react() {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => sessionStorage.setItem("journeyos.adminKey", "dev-owner-key"));
  const p = await ctx.newPage(); await p.goto(`http://localhost:5173/${hash}`); await p.waitForTimeout(1500); return p;
}
const L = await legacy(), R = await react();
console.log("=== LEGACY\n" + await L.evaluate(geo, sel));
console.log("=== REACT\n" + await R.evaluate(geo, sel));
await b.close();
