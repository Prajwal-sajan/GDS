import { test, expect, type Page } from "@playwright/test";

/**
 * Isolated UI wiring tests against deterministic mock API responses.
 * They verify rendered interactions, NOT PostgreSQL transaction correctness
 * or legacy screenshot pixel parity. Those require the live .NET test stack.
 */
const trip = {id: 101, travelDate:"2026-11-22", status:"active", bookable:true,
  routeId:91,service:"NTHB1",name:"Hyderabad → Bengaluru",departure:"17:30",
  booked:4,held:0,blocked:0};
const stops = [{sequence:0,cityId:107258,name:"Hyderabad",day:1,time:"17:30"},
  {sequence:1,cityId:100101,name:"Kurnool",day:1,time:"22:30"},
  {sequence:2,cityId:102257,name:"Bengaluru",day:2,time:"07:55"}];
function seatMap() {
  const seats: {seatCode:string;deck:string;row:number;col:number;width:number;length:number;seatType:string;state:string;gender:string|null;ladiesOnly:boolean;malesOnly:boolean;fare:number}[] = [];
  const seat=(deck:string,seatCode:string,row:number,col:number,seatType:string,length=1) =>
    seats.push({seatCode,deck,row,col,width:1,length,seatType,state:"available",gender:null,ladiesOnly:false,malesOnly:false,fare:750});
  for(let i=0;i<6;i++)seat("LOWER",String(i+1)+"L",2*i,0,"sleeper",2);
  for(let i=0;i<22;i++)seat("LOWER",String(i+1),Math.floor(i/2),2+(i%2),"seater");
  for(let i=0;i<6;i++){seat("UPPER",String(3*i+3)+"U",2*i,0,"sleeper",2);
    seat("UPPER",String(3*i+2)+"U",2*i,2,"sleeper",2);
    seat("UPPER",String(3*i+1)+"U",2*i,3,"sleeper",2);}
  seats.find(s=>s.seatCode==="1L")!.state="booked";
  seats.find(s=>s.seatCode==="1L")!.gender="M";
  seats.find(s=>s.seatCode==="2L")!.state="booked";
  seats.find(s=>s.seatCode==="2L")!.gender="F";
  return seats;
}
async function setup(page:Page) {
  let from = 0, to = 2, blocked = false;
  let assigned = false;
  let blockBody: unknown = null;
  let assignmentBody: unknown = null;
  await page.addInitScript(() => sessionStorage.setItem("journeyos.adminKey", "synthetic-test-key"));
  await page.route("**/api/admin/me", route=>route.fulfill({status:200,contentType:"application/json",
    body:JSON.stringify({name:"QA Operator",role:"ops",tenant:"demo",auth:"service-key",phone:null})}));
  await page.route(/\/api\/admin\/trips\?date=/,route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify([trip])}));
  await page.route(/\/api\/admin\/integrations\/redbus\/status/,route=>route.fulfill({status:500,body:"Mocked and intentionally unavailable"}));
  await page.route(/\/api\/admin\/trips\/101\/seat-layout/,route=>{
    const url=new URL(route.request().url());
    from=Number(url.searchParams.get("fromSequence")??0);
    to=Number(url.searchParams.get("toSequence")??2);
    const seats=seatMap();
    if(blocked)seats.find(x=>x.seatCode==="3L")!.state="blocked";
    route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({
      tripId:101,travelDate:"2026-11-22",status:"active",bookable:true,serviceNumber:"NTHB1",
      routeName:"HYD BNG",coachName:"A/C Seater/Sleeper (2+1)",
      fromSequence:from,toSequence:to,stops,stages:[
        {id:1,kind:"pickup",name:"Hyderabad Central",stopSequence:0,day:1,time:"17:30"},
        {id:2,kind:"drop",name:"Bengaluru Terminal",stopSequence:2,day:2,time:"07:55"}],
      seats})});
  });
  await page.route("**/api/admin/trips/101/booking-chart",route=>route.fulfill({status:200,contentType:"application/json",
    body:JSON.stringify([{pnr:"PNR-TEST-1",status:"CONFIRMED",channel:"counter",totalFare:750,
      passengers:[{seatCode:"1L",name:"Test Passenger",status:"CONFIRMED",boardingStatus:"YET_TO_BOARD"}]}])}));
  await page.route("**/api/admin/trips/101/assignments",route=>route.fulfill({status:200,contentType:"application/json",
    body:JSON.stringify([{id:9,tripId:101,kind:"vehicle",role:"vehicle",vehicleId:19,staffId:null,isActive:true,
      assignedAt:"2026-11-22T09:00:00Z",replacedAt:null,replacedReason:null},
      {id:10,tripId:101,kind:"staff",role:"Driver",vehicleId:null,staffId:21,isActive:true,
        assignedAt:"2026-11-22T09:00:00Z",replacedAt:null,replacedReason:null},
      ...(assigned?[{id:11,tripId:101,kind:"staff",role:"Helper",vehicleId:null,staffId:22,isActive:true,
        assignedAt:"2026-11-22T09:00:00Z",replacedAt:null,replacedReason:null}]:[])])}));
  await page.route("**/api/admin/vehicles",route=>route.fulfill({status:200,contentType:"application/json",
    body:JSON.stringify([{id:19,registrationNumber:"AR 01 Q 7827",coachTemplateId:3,status:"active"}])}));
  await page.route("**/api/admin/staff",route=>route.fulfill({status:200,contentType:"application/json",
    body:JSON.stringify([{id:21,name:"Test Driver",role:"driver",status:"active",phone:"9000000000"},
      {id:22,name:"Test Helper",role:"helper",status:"active",phone:"9111111111"}])}));
  await page.route("**/api/admin/routes",route=>route.fulfill({status:200,contentType:"application/json",
    body:JSON.stringify([{id:91,name:"HYD BNG",serviceNumber:"NTHB1",status:"active",departureTime:"17:30",
      fares:[{fromSequence:0,toSequence:2,seater:600,sleeperLower:799,sleeperUpper:849}],
      stages:[]}])}));
  await page.route("**/api/admin/trips/101/blocks",async route=>{
    blockBody=route.request().postDataJSON();blocked=true;
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({blocked:["3L"]})});
  });
  await page.route("**/api/admin/trips/101/assignments", async route=>{
    if(route.request().method()==="POST"){
      assignmentBody=route.request().postDataJSON(); assigned=true;
      await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({id:11})});
    } else {
      await route.fallback();
    }
  });
  page.on("dialog",dialog=>void dialog.accept());
  return {getSegment:()=>[from,to],getBlock:()=>blockBody,getAssignment:()=>assignmentBody};
}
test("Manage Schedules renders reference-shaped lower/upper decks, booking chart and true selected segment",async({page})=>{
  const mock=await setup(page);
  await page.goto("/");
  await page.getByRole("button",{name:"Schedules"}).click();
  await expect(page.getByTestId("schedules-page")).toBeVisible();
  await page.getByRole("button",{name:"Manage"}).click();
  await expect(page.getByRole("dialog",{name:"Manage · NTHB1"})).toBeVisible();
  await expect(page.getByRole("region",{name:"LOWER deck"})).toBeVisible();
  await expect(page.getByRole("region",{name:"UPPER deck"})).toBeVisible();
  await expect(page.locator("[data-seat]")).toHaveCount(46);
  await expect(page.locator('[data-seat="1L"]')).toHaveClass(/sm-male/);
  await expect(page.locator('[data-seat="2L"]')).toHaveClass(/sm-female/);
  await page.getByRole("button",{name:"1L — booked male"}).count().then(c=>expect(c).toBe(1));
  await expect(page.getByTestId("booking-chart")).toContainText("PNR-TEST-1");
  await page.getByRole("combobox",{name:"From city"}).selectOption("1");
  await expect.poll(()=>mock.getSegment()[0]).toBe(1);
  await expect(page.getByRole("combobox",{name:"To city"})).toHaveValue("2");
  await expect(page.getByText("Seat availability is specific to the selected route segment.")).toBeVisible();
  await page.getByRole("button",{name:"Cities",exact:true}).click();
  await expect(page.getByText("Day 2")).toBeVisible();
  await page.getByRole("button",{name:"Pickups",exact:true}).click();
  await expect(page.getByText("Hyderabad Central")).toBeVisible();
  await page.getByRole("dialog").getByRole("button",{name:"Fares",exact:true}).click();
  await expect(page.getByText("₹799")).toBeVisible();
  await page.getByRole("button",{name:"✕ Close"}).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("seat action sends actual route segment; assignment editor posts selected real Staff and reason",async({page})=>{
  const mock=await setup(page);
  await page.goto("/");
  await page.getByRole("button",{name:"Schedules"}).click();
  await page.getByRole("button",{name:"Manage"}).click();
  await expect(page.locator("[data-seat]")).toHaveCount(46);
  await page.locator('[data-seat="3L"]').click();
  await page.getByRole("button",{name:"Apply seat action"}).click();
  await expect.poll(()=>mock.getBlock()).not.toBeNull();
  expect(mock.getBlock()).toMatchObject({seats:["3L"],fromSequence:0,toSequence:2});
  await page.getByRole("button",{name:"Update",exact:true}).click();
  await page.getByRole("button",{name:"✎ Edit"}).click();
  await page.getByRole("combobox",{name:"Assignment role"}).selectOption("Helper");
  await page.getByRole("combobox",{name:"Selected assignee"}).selectOption("22");
  await page.getByPlaceholder("Reason for assignment change").fill("Replacement requested");
  await page.getByRole("button",{name:"Update Assignment"}).click();
  await expect.poll(()=>mock.getAssignment()).not.toBeNull();
  expect(mock.getAssignment()).toMatchObject({role:"Helper",staffId:22,reason:"Replacement requested"});
});
