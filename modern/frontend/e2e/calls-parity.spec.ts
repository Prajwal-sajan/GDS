import { expect, test } from "@playwright/test";

test("Calls restores its own top-level navigation, filters persisted records and never claims phone dialing", async ({page}) => {
  let post: Record<string,unknown>|undefined;
  let saved = false;
  await page.addInitScript(() => sessionStorage.setItem("journeyos.adminKey","mock-key"));
  await page.route("**/api/admin/me", r => r.fulfill({json:{name:"Call Desk",role:"ops",tenant:"demo",auth:"key",phone:null}}));
  await page.route("**/api/admin/calls", r => {
    if (r.request().method()==="POST") {
      post=r.request().postDataJSON();
      saved=true;
      return r.fulfill({json:{notice:"Call record saved (no telephony provider connected)."}});
    }
    const base=[{id:1,phone:"9876543210",passengerName:"Passenger A",pnr:"ABC123",direction:"incoming",kind:"manual",
      status:"missed",durationS:0,agent:"Desk",ts:"2026-11-23T09:10:00Z",notes:null},
      {id:2,phone:"9876500000",passengerName:"Passenger B",pnr:null,direction:"outgoing",kind:"manual",
        status:"answered",durationS:57,agent:"Desk",ts:"2026-11-23T10:10:00Z",notes:"Verified"}];
    const added=saved ? [{id:3,phone:"9876543219",passengerName:"Passenger C",pnr:null,direction:"outgoing",kind:"manual",
      status:"logged",durationS:0,agent:"Call Desk",ts:"2026-11-24T10:10:00Z",notes:null}] : [];
    return r.fulfill({json:{stats:{total:base.length+added.length,answered:1,missed:1,avgDuration:29},calls:[...added,...base]}});
  });
  await page.route("**/api/admin/bookings/ABC123",r=>r.fulfill({json:{pnr:"ABC123",status:"CONFIRMED",channel:"counter",totalFare:800,
    tripId:14,passengers:[{seatCode:"L1",name:"Passenger A",status:"CONFIRMED",boardingStatus:"Yet-To-Board"}],payments:[],finance:null}}));
  await page.goto("/");
  await expect(page.getByRole("navigation",{name:"Main navigation"}).getByRole("button",{name:"Calls"})).toBeVisible();
  await page.getByRole("navigation",{name:"Main navigation"}).getByRole("button",{name:"Calls"}).click();
  await expect(page.getByTestId("calls-console")).toBeVisible();
  await expect(page.getByText(/Telephony is not connected/)).toBeVisible();
  await page.getByRole("combobox",{name:"Call status filter"}).selectOption("missed");
  await expect(page.getByText("Passenger A")).toBeVisible();
  await expect(page.getByText("Passenger B")).toHaveCount(0);
  await page.getByRole("combobox",{name:"Call status filter"}).selectOption("all");
  await page.getByRole("textbox",{name:"Call phone"}).fill("9876543219");
  await page.getByRole("textbox",{name:"Call passenger name"}).fill("Passenger C");
  await page.getByRole("button",{name:"Log call (manual record only)"}).click();
  await expect(page.getByRole("status").filter({hasText:"no telephony provider connected"})).toBeVisible();
  expect(post).toMatchObject({phone:"9876543219",name:"Passenger C",direction:"outgoing",kind:"manual",status:"logged"});
  await page.getByRole("button",{name:"ABC123"}).click();
  await expect(page.getByTestId("booking-desk")).toBeVisible();
});
