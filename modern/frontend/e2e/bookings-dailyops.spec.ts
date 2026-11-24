import { expect, test, type Page } from "@playwright/test";

/** Browser wiring only: PostgreSQL contract and role tests must also run in .NET CI. */
async function setup(page: Page) {
  const requests: { quote?: unknown; cancel?: unknown; boarding?: unknown } = {};
  const booking = {
    pnr: "ABC123", status: "CONFIRMED", channel: "counter", tripId: 14, totalFare: 1600,
    passengers: [{seatCode: "L1", name: "Alice", status: "CONFIRMED", boardingStatus: "Yet-To-Board"},
      {seatCode: "L2", name: "Bob", status: "CONFIRMED", boardingStatus: "Yet-To-Board"}],
    payments: [{id: 4, method: "cash", amount: 1600, status: "PAID", createdAt: "2026-11-24T08:00:00Z", reference: null}],
    finance: null
  };
  let cancelled = false;
  await page.addInitScript(() => sessionStorage.setItem("journeyos.adminKey", "mock-token"));
  await page.route("**/api/admin/me", r => r.fulfill({json: {role:"ops",name:"Desk QA",tenant:"demo",auth:"key",phone:null}}));
  await page.route("**/api/admin/integrations/redbus/status", r => r.fulfill({status:503,body:"offline fixture"}));
  await page.route("**/api/admin/bookings/ABC123", r => r.fulfill({json: cancelled ? {...booking,status:"PARTIALLY_CANCELLED",
    passengers: [{...booking.passengers[0],status:"CANCELLED"},booking.passengers[1]]} : booking}));
  await page.route("**/api/admin/bookings/ABC123/cancellation-quote", r => {
    requests.quote = r.request().postDataJSON();
    return r.fulfill({json:{pnr:"ABC123",seats:["L1"],fare:800,chargePercent:25,charge:200,refund:600,
      boardingAtUtc:"2026-11-30T11:00:00Z",quotedAtUtc:"2026-11-24T08:00:00Z",
      settlementNotice:"Refund is an accounting obligation only; no gateway payout executed."}});
  });
  await page.route("**/api/admin/bookings/ABC123/cancel", r => {
    requests.cancel = r.request().postDataJSON(); cancelled = true;
    return r.fulfill({json:{pnr:"ABC123",status:"PARTIALLY_CANCELLED",charge:200,refund:600,
      at:"2026-11-24T08:00:00Z",settlementStatus:"PENDING_EXTERNAL_SETTLEMENT",
      notice:"No payment-gateway payout has been made."}});
  });
  await page.route("**/api/admin/bookings/ABC123/boarding", r => {
    requests.boarding = r.request().postDataJSON(); return r.fulfill({json:{}});
  });
  await page.route("**/api/admin/bookings/REDBUS1", r => r.fulfill({json:{...booking,pnr:"REDBUS1",channel:"redbus"}}));
  await page.route("**/api/admin/reports/daily-ops?*", r => r.fulfill({json:{
    date:"2026-11-24",
    fleet:{summary:{trips:2,running:2,withoutBus:1,seats:25,capacity:80},trips:[
      {tripId:14,service:"AB100",route:"Hyderabad–Bengaluru",status:"active",vehicle:null,
        crew:[],seats:10,capacity:40,occupancyPct:25,netSales:2000},
      {tripId:15,service:"CD200",route:"Chennai–Bengaluru",status:"active",vehicle:"KA01AB1234",
        crew:[{role:"Driver",name:"Prakash",phone:"9000000000"}],seats:15,capacity:40,occupancyPct:37.5,netSales:5000}]},
    earnings:{bookings:4,seats:6,amount:5600,cancelledToday:1,byChannel:[{channel:"counter",bookings:4,amount:5600}],
      next7:[{date:"2026-11-24",trips:2,seats:25,capacity:80,occupancyPct:31.25}]},
    passengers:{noShowsYesterday:[{pnr:"ABC123",service:"AB100",seat:"L1",passenger:"Alice",contact:null}]},
    compliance:{vehicleDocuments:[{vehicle:"KA01AB1234",document:"Insurance",expiryDate:"2026-11-25",state:"EXPIRING_SOON"}],licences:[]},
    ratings:{average:4.2,count:20,low:[]}
  }}));
  return requests;
}

test("Ticket desk requests an authoritative quote and explicitly records a refund obligation", async ({page}) => {
  const calls=await setup(page);
  page.on("dialog", d => void d.accept());
  await page.goto("/");
  await page.getByRole("button",{name:"Tickets",exact:true}).click();
  await page.getByRole("textbox",{name:"Find PNR"}).fill("ABC123");
  await page.getByRole("button",{name:"Find Ticket"}).click();
  await expect(page.getByText("Alice", {exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Cancel / Refund"}).click();
  await page.getByRole("checkbox",{name:/L1 — Alice/}).check();
  await page.getByRole("button",{name:"Calculate Refund"}).click();
  await expect(page.getByText("₹600.00")).toBeVisible();
  expect(calls.quote).toEqual({seats:["L1"]});
  await page.getByRole("textbox",{name:"Cancellation reason"}).fill("Passenger requested cancellation");
  await page.getByRole("button",{name:"Confirm Cancellation"}).click();
  await expect(page.getByRole("status").filter({hasText:"Refund settlement remains pending"})).toBeVisible();
  expect(calls.cancel).toEqual({seats:["L1"],notes:"Passenger requested cancellation"});
  await expect(page.getByText("PARTIALLY_CANCELLED", {exact:true}).first()).toBeVisible();
});

test("OTA ticket cancellation is not exposed in the operator ticket desk",async({page})=>{
  await setup(page);await page.goto("/");
  await page.getByRole("button",{name:"Tickets",exact:true}).click();
  await page.getByRole("textbox",{name:"Find PNR"}).fill("REDBUS1");
  await page.getByRole("button",{name:"Find Ticket"}).click();
  await page.getByRole("button",{name:"Cancel / Refund"}).click();
  await expect(page.getByText(/authorized booking channel/)).toBeVisible();
  await expect(page.getByRole("button",{name:"Calculate Refund"})).toHaveCount(0);
});

test("Daily operations filters fleet and opens a no-show's real PNR desk", async ({page})=>{
  await setup(page);await page.goto("/");
  await page.getByRole("button",{name:"Daily Ops",exact:true}).click();
  await expect(page.getByTestId("dailyops-page")).toBeVisible();
  await expect(page.getByText("Unassigned buses")).toBeVisible();
  await page.getByRole("combobox",{name:"Fleet status"}).selectOption("unassigned");
  await expect(page.getByText("AB100")).toBeVisible();
  await expect(page.getByText("CD200")).toHaveCount(0);
  await page.getByRole("button",{name:"Compliance & No-Shows"}).click();
  await expect(page.getByText("Insurance")).toBeVisible();
  await page.getByRole("button",{name:"Open ticket"}).click();
  await expect(page.getByTestId("booking-desk")).toBeVisible();
  await expect(page.getByText("ABC123", {exact:true}).first()).toBeVisible();
});
