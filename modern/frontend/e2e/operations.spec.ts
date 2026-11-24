import { expect, test, type Page } from "@playwright/test";
import { open } from "./nav";

const KEY = process.env.JOURNEYOS_ADMIN_KEY ?? "dev-owner-key";
const day = (offset: number) => new Date(Date.now() + 5.5 * 3600_000 + offset * 86_400_000).toISOString().slice(0, 10);

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Service key" }).click();
  await page.getByLabel("Admin key").fill(KEY);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("fleet and staff lists render imported legacy data", async ({ page }) => {
  await signIn(page);
  await open(page, "vehicles");
  await expect(page.locator(".vp37-vehicle-card").first()).toBeVisible();
  await page.locator('.vp-areas a[href="#/fleet/coaches"]').click();
  await expect(page.locator(".vp37-coach-card").first()).toBeVisible();
  await open(page, "staff");
  await expect(page.locator("[data-staff-rows] tr").first()).toBeVisible();
});

test("dispatch: realtime connects, seat block then release round-trips", async ({ page }) => {
  await signIn(page);
  await open(page, "schedules");
  const d = day(5);
  await page.locator(`[data-sx-date="${d}"]`).click();
  // Manage opens the schedule workspace on that exact departure (trip ids embed yyMMdd).
  const row = page.locator(`.sx-main-table tbody tr[data-sx-row^="1000${d.slice(2).replaceAll("-", "")}"]`).first();
  await row.getByRole("button", { name: "Manage" }).click();
  await expect(page.getByTestId("schedule-workspace")).toBeVisible();
  await expect(page.getByTestId("seatmap")).toBeVisible();
  await expect(page.getByTestId("live")).toHaveText("live", { timeout: 10_000 });
  const free = page.locator(".seat.s-free").first();
  const code = (await free.textContent())!;
  await free.click();
  await page.getByRole("button", { name: "Block selected" }).click();
  await expect(page.getByRole("status")).toContainText("Blocked 1 seat");
  const blocked = page.locator(".seat.s-blocked", { hasText: new RegExp(`^${code}$`) });
  await expect(blocked).toBeVisible();
  await blocked.click();
  await page.getByRole("button", { name: "Release selected" }).click();
  await expect(page.getByRole("status")).toContainText("Released 1 seat");
  await expect(page.locator(".seat.s-free", { hasText: new RegExp(`^${code}$`) })).toBeVisible();
});

test("reconciliation: upload CSV, see missing-in-GDS row, dispute requires reason", async ({ page }) => {
  await signIn(page);
  await open(page, "reconciliation");
  const n = `E2E-${Date.now()}`;
  await page.getByLabel("Invoice number").fill(n);
  await page.getByLabel("Period start").fill(day(1));
  await page.getByLabel("Period end").fill(day(1));
  const csv = `section,pnr,doj,fare,tax,commission,commission_tax,operator_offer,cancellation_charge,take_home\nsold,${n}-UNKNOWN,${day(1)},500,25,50,9,0,,466\n`;
  await page.getByLabel("Statement file").setInputFiles({ name: "statement.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Upload & compare" }).click();
  await expect(page.getByRole("status")).toContainText("Invoice uploaded");
  await expect(page.getByTestId("recon-totals")).toBeVisible();
  const row = page.locator("tr", { hasText: `${n}-UNKNOWN` });
  await expect(row).toContainText("Missing in GDS");
  page.once("dialog", (d) => d.accept(""));
  await row.getByRole("button", { name: "Dispute" }).click();
  await expect(row).toContainText("—"); // empty reason → nothing recorded
  page.once("dialog", (d) => d.accept("Not our PNR"));
  await row.getByRole("button", { name: "Dispute" }).click();
  await expect(row).toContainText("dispute: Not our PNR");
});
