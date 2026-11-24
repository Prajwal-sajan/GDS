import { expect, type Page } from "@playwright/test";

/** Navigates the way an operator does in the legacy-parity shell: top pills, GDS sub-pills, the Settings menu. */
type Screen = "trips" | "schedules" | "routes" | "crm" | "vehicles" | "accounts" | "staff" | "dailyops" | "sarathi" | "chats" | "calls"
  | "ledger" | "reconciliation" | "integrations" | "outbox" | "users";
const SUB: Record<string, string> = { schedules: "#/gds/schedules", routes: "#/gds/routes", crm: "#/crm", vehicles: "#/fleet/vehicles", accounts: "#/accounts", staff: "#/fleet/staff", dailyops: "#/dailyops", sarathi: "#/sarathi" };

export async function settingsMenu(page: Page) {
  const pop = page.locator("[data-settings-pop]");
  if (!(await pop.isVisible())) await page.locator("[data-settings-btn]").click();
  await expect(pop).toBeVisible();
  return pop;
}
export async function open(page: Page, screen: Screen) {
  if (["trips", "chats", "calls"].includes(screen)) return page.locator(`a[data-top="${screen}"]`).click();
  if (screen in SUB) {
    await page.locator('a[data-top="gds"]').click();
    return page.locator(`nav.subnav a[href="${SUB[screen]}"]`).click();
  }
  if (screen === "ledger") {
    await open(page, "accounts");
    return page.locator('.ac10-nav [data-ac10-tab="transactions"], .ac10-nav a[href="#/accounts/transactions"]').first().click();
  }
  if (screen === "reconciliation") {
    // not a legacy Accounts tab; reached by URL like the legacy OTA verifier deep link
    await open(page, "accounts");
    return page.evaluate(() => { location.hash = "#/accounts/reconciliation"; });
  }
  const pop = await settingsMenu(page);
  if (screen === "users") return pop.locator('[data-settings-link="team-access"]').click();
  await pop.locator('[data-settings-link="integrations"]').click();
  if (screen === "outbox") await page.getByRole("navigation", { name: "Integration sections" }).getByRole("link", { name: "Outbox" }).click();
}
export async function signOut(page: Page) {
  await (await settingsMenu(page)).locator("[data-settings-logout]").click();
}
export const expectRole = (page: Page, role: string) => expect(page.getByTestId("whoami")).toHaveAttribute("data-role", role);
