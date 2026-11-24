import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API = process.env.JOURNEYOS_API ?? "http://localhost:5080";
const KEY = process.env.JOURNEYOS_ADMIN_KEY ?? "dev-owner-key";
const PASSWORD = "e2e-password-123";

async function provision(request: APIRequestContext, role: string) {
  const phone = "7" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
  const u = await request.post(`${API}/api/admin/iam/users`, { headers: { "X-Admin-Key": KEY }, data: { phone, name: `E2E settings ${role}`, role, status: "ACTIVE" } });
  expect(u.ok(), await u.text()).toBeTruthy();
  const id = (await u.json()).id;
  expect((await request.post(`${API}/api/admin/iam/users/${id}/password`, { headers: { "X-Admin-Key": KEY }, data: { password: PASSWORD } })).status()).toBe(204);
  return phone;
}

async function signIn(page: Page, phone: string) {
  await page.goto("/");
  await page.getByLabel("Phone").fill(phone);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("whoami")).toHaveAttribute("data-role", /.+/, { timeout: 15000 });
}

/** Collects every failing API call so each screen proves it is fully backed by the .NET API. */
function apiFailures(page: Page) {
  const bad: string[] = [];
  page.on("response", (r) => { if (r.url().includes("/api/") && r.status() >= 400) bad.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`); });
  return bad;
}
const go = (page: Page, hash: string) => page.evaluate((h) => { location.hash = h; }, hash);

test("settings pages render from the API without failing calls", async ({ page, request }) => {
  const bad = apiFailures(page);
  await signIn(page, await provision(request, "admin"));
  const screens: [string, string][] = [
    ["#/settings/team-access/office-staff", ".ta26-shell"],
    ["#/settings/team-access/branches", ".ta26-shell"],
    ["#/settings/team-access/access/roles/viewer", ".ta26-shell"],
    ["#/settings/team-access/access/test-access", ".ta26-shell"],
    ["#/settings/team-access/access/groups", ".ta26-shell"],
    ["#/settings/team-access/access/advanced", ".ta26-shell"],
    ["#/settings/configuration/business", ".cfg30-root"],
    ["#/settings/configuration/notifications", ".cfg30-root"],
    ["#/settings/branding", ".stp-brand-shell"],
    ["#/settings/change-password", ".stp-shell"],
    ["#/settings/my-devices", ".stp-shell"],
    ["#/settings/whatsapp", ".wa33-page, .wa33-error"],
    ["#/settings/about", "[data-ab32-page]"],
  ];
  for (const [hash, ready] of screens) {
    await go(page, hash);
    await expect(page.locator(ready).first(), hash).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState("networkidle");
  }
  expect(bad).toEqual([]);
});

test("team access groups: create, rename and delete through the UI", async ({ page, request }) => {
  const bad = apiFailures(page);
  await signIn(page, await provision(request, "admin"));
  await go(page, "#/settings/team-access/access/groups");
  const name = `E2E group ${Date.now()}`;
  const form = page.locator("[data-v28-group-create]");
  await form.locator("input[name=name]").fill(name);
  await form.locator("input[name=name]").press("Enter");
  const card = page.locator(".ta28-group-card", { hasText: name });
  await expect(card).toBeVisible({ timeout: 10000 });
  await card.locator("[data-v28-edit-group]").click();
  await card.locator("[data-v28-group-editor] input[name=name]").fill(name + " renamed");
  await card.locator("[data-v28-group-editor] button[type=submit]").click();
  const renamed = page.locator(".ta28-group-card", { hasText: name + " renamed" });
  await expect(renamed).toBeVisible({ timeout: 10000 });
  await renamed.locator("[data-v28-delete-group]").click();
  await page.getByRole("button", { name: "Delete", exact: true }).last().click();
  await expect(renamed).toHaveCount(0, { timeout: 10000 });
  const groups = await request.get(`${API}/api/admin/team-access/v28/groups`, { headers: { "X-Admin-Key": KEY } });
  expect((await groups.json()).groups.some((g: { name: string }) => g.name.startsWith(name)), "group removed").toBeFalsy();
  expect(bad).toEqual([]);
});
