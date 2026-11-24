import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { expectRole, open, settingsMenu, signOut } from "./nav";

const API = process.env.JOURNEYOS_API ?? "http://localhost:5080";
const KEY = process.env.JOURNEYOS_ADMIN_KEY ?? "dev-owner-key";
const PASSWORD = "e2e-password-123";

/** Provisions a real user through the IAM API (service key), so the UI test signs in exactly like an operator. */
async function provision(request: APIRequestContext, role: string) {
  const phone = "7" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
  const u = await request.post(`${API}/api/admin/iam/users`, { headers: { "X-Admin-Key": KEY }, data: { phone, name: `E2E ${role}`, role, status: "ACTIVE", commissionPct: role === "agent" ? 5 : null } });
  expect(u.ok(), await u.text()).toBeTruthy();
  const id = (await u.json()).id;
  const p = await request.post(`${API}/api/admin/iam/users/${id}/password`, { headers: { "X-Admin-Key": KEY }, data: { password: PASSWORD } });
  expect(p.status()).toBe(204);
  return phone;
}

async function signInUser(page: Page, phone: string, password = PASSWORD) {
  await page.goto("/");
  await page.getByLabel("Phone").fill(phone);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("user sign-in: wrong password is rejected; role decides visible tabs", async ({ page, request }) => {
  const phone = await provision(request, "ops");
  await signInUser(page, phone, "definitely-wrong");
  await expect(page.getByRole("alert")).toContainText("Invalid phone or password");
  await signInUser(page, phone);
  await expectRole(page, "ops");
  await open(page, "schedules");
  await expect(page.locator(".sx-main-table tbody tr").first()).toBeVisible();
  await expect((await settingsMenu(page)).locator('[data-settings-link="team-access"]')).toHaveCount(0);
  // Hidden navigation is not the control: deep links are refused in the UI and the API rejects the call.
  await page.goto("/#/accounts/transactions");
  await expect(page.getByRole("alert")).toContainText("don’t have access");
  await page.goto("/#/settings/team-access/office-staff");
  await expect(page.getByRole("alert")).toContainText("don’t have access");
  await signOut(page);
  await expect(page.getByLabel("Phone")).toBeVisible();
});

test("agent sees only their own ledger", async ({ page, request }) => {
  const phone = await provision(request, "agent");
  await signInUser(page, phone);
  await expect(page.locator('nav.subnav a[href="#/accounts"]')).toBeVisible();
  await expect(page.locator('nav.subnav a[href="#/gds/schedules"]')).toHaveCount(0);
  await expect(page.locator('a[data-top="trips"]')).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "My ledger" })).toBeVisible();
  await expect(page.getByTestId("ledger-balance")).toBeVisible();
});

test("CRM search validates input and never lists customers without a query", async ({ page, request }) => {
  await signInUser(page, await provision(request, "admin"));
  await open(page, "crm");
  await page.locator("[data-cv8-mode=pnr]").click();
  await page.getByLabel("Passenger pnr").fill("AB");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("Enter at least four PNR characters")).toBeVisible();
  await page.getByLabel("Passenger pnr").fill("");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".cv8-customer")).toHaveCount(0);
  await expect(page.getByText("Find a passenger")).toBeVisible();
  await page.locator("[data-cv8-mode=phone]").click();
  await page.getByLabel("Passenger phone").fill("8853429780");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".cv8-customer")).toHaveCount(1);
  await expect(page.locator(".cv8-ticketrow").first()).toBeVisible();
});

test("reports, Sarathi and users render from live data", async ({ page, request }) => {
  await signInUser(page, await provision(request, "admin"));
  await open(page, "accounts");
  await expect(page.getByTestId("kpi-Seats")).toBeVisible();
  await page.getByLabel("Report").selectOption("daily-ops");
  await expect(page.getByRole("heading", { name: "Fleet" })).toBeVisible();

  await open(page, "sarathi");
  await page.getByRole("button", { name: "How many passengers travelled this week?" }).click();
  await expect(page.getByTestId("sarathi-answer")).toContainText("passengers travelled in the last 7 days");

  await open(page, "users");
  await expect(page.getByRole("cell", { name: "booking_executive" })).toBeVisible(); // imported legacy role shown alongside mapped role
});

test("admin issues invite; user activates with own password; code is single-use", async ({ page, browser, request }) => {
  const phone = "7" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
  const u = await request.post(`${API}/api/admin/iam/users`, { headers: { "X-Admin-Key": KEY }, data: { phone, name: `E2E Invitee ${phone}`, role: "accounts", status: "ACTIVE" } });
  expect(u.ok()).toBeTruthy();
  await signInUser(page, await provision(request, "admin"));
  await open(page, "users");
  await page.getByRole("row", { name: new RegExp(phone) }).getByRole("button", { name: "Issue invite" }).click();
  const code = ((await page.getByTestId("invite-code").locator("code").textContent()) ?? "").trim();
  expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

  const p2 = await (await browser.newContext()).newPage();
  const activateWith = async () => {
    await p2.goto("/");
    await p2.getByRole("button", { name: "Activate with invite code" }).click();
    await p2.getByLabel("Phone").fill(phone);
    await p2.getByLabel("Invite code").fill(code.toLowerCase().replace(/-/g, ""));
    await p2.getByLabel("Password", { exact: true }).fill("my-own-password-42");
    await p2.getByLabel("Confirm password").fill("my-own-password-42");
    await p2.getByRole("button", { name: "Activate & sign in" }).click();
  };
  await activateWith();
  await expectRole(p2, "accounts");
  await signOut(p2);
  await activateWith();
  await expect(p2.getByRole("alert")).toBeVisible();
  await signInUser(p2, phone, "my-own-password-42");
  await expectRole(p2, "accounts");
});

test("profit report states its expense basis", async ({ page, request }) => {
  await signInUser(page, await provision(request, "admin"));
  await open(page, "accounts");
  await expect(page.getByTestId("expense-basis")).toContainText("route-template estimate");
});

// ---------------------------------------------------------------- React regression snapshots
// These are React SELF-baselines: they catch unintended changes to interim screens and prove NOTHING about parity with the
// legacy GDS. Legacy↔React comparisons live in e2e/parity (playwright.parity.config.ts) and use the live legacy UI as baseline.
// Baselines live in e2e/business.spec.ts-snapshots (platform-suffixed). Data-dependent regions are masked so
// the snapshot guards layout/styling, not numbers. Regenerate intentionally with: npx playwright test --update-snapshots
test("visual: login screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("form.login")).toHaveScreenshot("login.png", { maxDiffPixelRatio: 0.01 });
});

test("visual: reports shell with data masked", async ({ page, request }) => {
  await signInUser(page, await provision(request, "viewer"));
  await open(page, "accounts");
  await expect(page.getByTestId("kpi-Seats")).toBeVisible();
  await expect(page).toHaveScreenshot("reports.png", {
    fullPage: false, maxDiffPixelRatio: 0.02,
    mask: [page.locator("table"), page.locator(".cards .value"), page.locator("p.muted"), page.getByTestId("whoami"), page.locator("input[type=date]")],
  });
});
