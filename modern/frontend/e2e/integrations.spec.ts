import { expect, test } from "@playwright/test";

const KEY = process.env.JOURNEYOS_ADMIN_KEY ?? "dev-owner-key";

async function signIn(page: import("@playwright/test").Page, key = KEY) {
  await page.goto("/");
  await page.getByLabel("Admin key").fill(key);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("rejects an invalid admin key", async ({ page }) => {
  await signIn(page, "not-a-key");
  await expect(page.getByLabel("Admin key")).toBeVisible();
});

test("RedBus status is honest about verification and outbound state", async ({ page }) => {
  await signIn(page);
  await expect(page.getByTestId("verification")).toContainText("Not RedBus-certified");
  await expect(page.getByTestId("outbound")).toHaveText(/Enabled|Disabled/);
  await expect(page.getByText("Published inventories")).toBeVisible();
});

test("outbox list filters and opens message details", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Outbox" }).click();
  await page.getByLabel("Status filter").selectOption("Pending");
  await expect(page.locator("tbody tr").first()).toBeVisible();
  const details = page.getByRole("button", { name: "Details" }).first();
  if (await details.count()) {
    await details.click();
    await expect(page.getByRole("dialog", { name: "Message details" })).toContainText("action_type");
  } else {
    await expect(page.getByText("No messages")).toBeVisible();
  }
});

test("trips view lists services for a date", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Trips" }).click();
  const d = new Date(Date.now() + 5.5 * 3600_000 + 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel("Travel date").fill(d);
  await expect(page.locator("tbody tr").first()).toBeVisible();
});
