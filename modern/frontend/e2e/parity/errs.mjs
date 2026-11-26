import { chromium } from "@playwright/test";
// usage: node e2e/parity/errs.mjs '#/dailyops'  — prints console/page errors and failed requests in the React app.
const b = await chromium.launch();
const p = await b.newPage();
p.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
p.on("pageerror", (e) => console.log("pageerror:", e.message, e.stack?.split("\n")[1]));
p.on("response", (r) => r.status() >= 400 && console.log("http", r.status(), r.url()));
await p.addInitScript(() => { sessionStorage.setItem("journeyos.adminKey", "dev-owner-key"); localStorage.setItem("stp_language", "English"); });
for (const h of process.argv.slice(2)) { console.log("==", h); await p.goto("http://localhost:5173/" + h); await p.waitForTimeout(Number(process.env.WAIT ?? 3000)); console.log((await p.locator("main").innerText()).slice(0, 300)); }
await b.close();
