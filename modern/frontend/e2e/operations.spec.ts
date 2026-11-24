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

test("OTA invoice verifier: ledger renders, upload dialog accepts only PDF and the server rejects an unparseable advice", async ({ page }) => {
  await signIn(page);
  await page.goto("/#/accounts/reconciliation");
  await expect(page.locator(".ota43-ledger")).toBeVisible();
  await page.locator('[data-ota43="upload"]').click();
  const dlg = page.locator(".ota43-upload-dialog");
  await dlg.locator("[data-upload-submit]").click();
  await expect(page.locator("#toasts")).toContainText("Choose a PDF");
  await dlg.locator("[data-upload-pdf]").setInputFiles({ name: "statement.csv", mimeType: "text/csv", buffer: Buffer.from("pnr,fare\n") });
  await dlg.locator("[data-upload-submit]").click();
  await expect(page.locator("#toasts")).toContainText("PDF required, max 7MB");
  await dlg.locator("[data-upload-pdf]").setInputFiles({ name: "advice.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a pdf") });
  await dlg.locator("[data-upload-submit]").click();
  await expect(page.locator("#toasts .toast.bad").last()).toBeVisible();
  await expect(dlg.locator("[data-upload-submit]")).toHaveText("Upload & Verify"); // re-enabled after the failure
  await expect(page).toHaveURL(/accounts\/reconciliation$/);
});
