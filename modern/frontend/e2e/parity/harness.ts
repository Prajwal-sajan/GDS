import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

export const LEGACY = process.env.LEGACY_URL ?? "http://localhost:3100";
export const API = process.env.JOURNEYOS_API ?? "http://localhost:5080";
export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
export const OUT = path.join(REPO, "docs/modernization/qa/parity");

/** Every context opened by legacyPage/reactPage; specs call closePages() in afterEach so browsers never accumulate. */
const opened: BrowserContext[] = [];
export async function closePages() { await Promise.all(opened.splice(0).map((c) => c.close().catch(() => {}))); }
// registered for every spec file that imports the harness
test.afterEach(closePages);
// one legacy OTP login per worker: the token is reused by every legacyPage() call
const tokens = new Map<string, string>();

/** Signs into the legacy GDS through its real OTP endpoints (dev OTP hint is only returned by the legacy dev server). */
export async function legacyPage(browser: Browser, phone = "9999999999"): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  opened.push(ctx);
  let token = tokens.get(phone);
  if (!token) {
    const req = ctx.request;
    const otp = await (await req.post(`${LEGACY}/api/auth/request-otp`, { data: { phone } })).json();
    if (!otp.dev_hint) throw new Error("Legacy server did not return a dev OTP — is it the local dev server?");
    token = (await (await req.post(`${LEGACY}/api/auth/verify-otp`, { data: { phone, otp: otp.dev_hint } })).json()).token as string;
    tokens.set(phone, token);
  }
  await ctx.addInitScript((t) => { localStorage.setItem("token", t); localStorage.setItem("stp_language", "English"); }, token);
  return ctx.newPage();
}
/** Signs into React with the dev service key (owner-equivalent) — same role as the legacy owner above. */
export async function reactPage(browser: Browser, baseURL: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL });
  opened.push(ctx);
  await ctx.addInitScript(() => { sessionStorage.setItem("journeyos.adminKey", "dev-owner-key"); localStorage.setItem("stp_language", "English"); });
  return ctx.newPage();
}

export interface DiffResult { id: string; region: string; legacy: [number, number]; react: [number, number]; sizeMatch: boolean; diffPixels: number; diffRatio: number }

const pad = (img: PNG, w: number, h: number) => {
  const out = new PNG({ width: w, height: h }); out.data.fill(255);
  PNG.bitblt(img, out, 0, 0, Math.min(img.width, w), Math.min(img.height, h), 0, 0);
  return out;
};
/** Pixel diff on the common canvas (size mismatch itself is reported, never hidden) + side-by-side composite for human review. */
export function compare(id: string, region: string, legacyPng: Buffer, reactPng: Buffer): DiffResult {
  const dir = path.join(OUT, id); fs.mkdirSync(dir, { recursive: true });
  const a = PNG.sync.read(legacyPng), b = PNG.sync.read(reactPng);
  const w = Math.max(a.width, b.width), h = Math.max(a.height, b.height);
  const A = pad(a, w, h), B = pad(b, w, h), D = new PNG({ width: w, height: h });
  const diffPixels = pixelmatch(A.data, B.data, D.data, w, h, { threshold: 0.1 });
  const S = new PNG({ width: w * 2 + 12, height: h }); S.data.fill(0xcc);
  PNG.bitblt(A, S, 0, 0, w, h, 0, 0); PNG.bitblt(B, S, 0, 0, w, h, w + 12, 0);
  fs.writeFileSync(path.join(dir, `${region}.legacy.png`), legacyPng);
  fs.writeFileSync(path.join(dir, `${region}.react.png`), reactPng);
  fs.writeFileSync(path.join(dir, `${region}.diff.png`), PNG.sync.write(D));
  fs.writeFileSync(path.join(dir, `${region}.side-by-side.png`), PNG.sync.write(S));
  const r: DiffResult = { id, region, legacy: [a.width, a.height], react: [b.width, b.height], sizeMatch: a.width === b.width && a.height === b.height, diffPixels, diffRatio: +(diffPixels / (w * h)).toFixed(4) };
  fs.writeFileSync(path.join(dir, `${region}.json`), JSON.stringify(r, null, 2));
  return r;
}

export const shot = (l: Locator) => l.screenshot({ animations: "disabled", caret: "hide" });
/** Freeze things that legitimately differ between two live systems (clock text, unread counters) — never structure. */
export async function settle(p: Page) {
  // both apps poll continuously (booking notices, alerts) → "networkidle" may never arrive; never wait more than 5s for it
  await p.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  await p.addStyleTag({ content: "*{transition:none!important;animation:none!important} .badge.bad[data-cnt]{display:none!important}" });
  await p.evaluate(() => document.fonts.ready);
}
