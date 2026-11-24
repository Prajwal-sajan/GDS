// Dev probe: evaluate an expression in the legacy app after load. Usage: node e2e/parity/eval-legacy.mjs "#/trips" "expr"
import { chromium } from "@playwright/test";
import fs from "node:fs";
const [hash, arg] = process.argv.slice(2);
const expr = arg.startsWith("@") ? fs.readFileSync(arg.slice(1), "utf8") : arg; // "@file.js" avoids shell quoting
const LEGACY = process.env.LEGACY_URL ?? "http://localhost:3100";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const otp = await (await ctx.request.post(`${LEGACY}/api/auth/request-otp`, { data: { phone: "9999999999" } })).json();
const v = await (await ctx.request.post(`${LEGACY}/api/auth/verify-otp`, { data: { phone: "9999999999", otp: otp.dev_hint } })).json();
await ctx.addInitScript((t) => localStorage.setItem("token", t), v.token);
const p = await ctx.newPage(); p.on("console", (m) => m.type() === "error" && console.log("console:", m.text())); p.on("pageerror", (e) => console.log("pageerror:", e.message)); p.on("response", (r) => r.status() >= 400 && console.log("http", r.status(), r.url())); await p.goto(`${LEGACY}/${hash}`); await p.waitForTimeout(+(process.env.WAIT ?? 2000));
console.log(JSON.stringify(await p.evaluate(expr), null, 1));
await b.close();
