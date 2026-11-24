import { test, expect, type Page } from "@playwright/test";
import type { CoachDraft } from "../src/api";
import { seatPosterSvg, type ScheduleSeatLayout } from "../src/features/schedules/seatLayoutModel";

async function fixture(page: Page) {
  let saved:CoachDraft | undefined;
  let created=false;
  let lastMethod="";
  const locked = {
    id:100,name:"Existing 2+1",busType:"A/C Seater",pattern:"2+1",isAc:true,
    amenities:[], structuralLocked:true, routeReferences:2,vehicleReferences:1,seatCount:2,
    seats:[{code:"1",deck:"LOWER",row:1,col:0,width:1,length:1,seatType:"seater",isWindow:true},
      {code:"2",deck:"LOWER",row:1,col:1,width:1,length:1,seatType:"seater",isWindow:false}],
    fixtures:[{kind:"emergency_exit",label:"Emergency Exit",deck:"LOWER",row:2,col:4,width:1,length:1}]
  };
  await page.addInitScript(()=>sessionStorage.setItem("journeyos.adminKey","fixture-key"));
  await page.route("**/api/admin/me", r=>r.fulfill({json:{name:"Coach QA",role:"ops",tenant:"demo",auth:"key",phone:null}}));
  await page.route("**/api/admin/coaches",async r=>{
    if(r.request().method()==="POST"){
      saved=r.request().postDataJSON() as CoachDraft;created=true;lastMethod="POST";
      return r.fulfill({status:201,json:{id:101}});
    }
    return r.fulfill({json:[{id:100,name:"Existing 2+1",pattern:"2+1",busType:"A/C Seater",isAc:true,
      seatCount:2,seaterCount:2,sleeperCount:0},...(created?[{id:101,name:saved!.name,
      pattern:saved!.pattern,busType:saved!.busType,isAc:saved!.isAc,
      seatCount:saved!.seats.length,seaterCount:saved!.seats.filter(s=>s.seatType==="seater").length,
      sleeperCount:saved!.seats.filter(s=>s.seatType==="sleeper").length}]:[])]});
  });
  await page.route("**/api/admin/coaches/100/full",r=>r.fulfill({json:locked}));
  await page.route("**/api/admin/coaches/101/full",r=>r.fulfill({json:{
    ...saved,id:101,structuralLocked:false,routeReferences:0,vehicleReferences:0,seatCount:saved?.seats.length
  }}));
  await page.route("**/api/admin/coaches/100/clone", r=>{
    created=true;saved={name:"Existing 2+1 Copy",busType:locked.busType,
      pattern:"2+1",isAc:true,amenities:[],seats:locked.seats as CoachDraft["seats"],
      fixtures:locked.fixtures as CoachDraft["fixtures"]};
    return r.fulfill({status:201,json:{id:101}});
  });
  return {getSaved:()=>saved,getLastMethod:()=>lastMethod};
}

test("Coach editor builds and persists a custom two-deck cabin with a non-bookable fixture",async({page})=>{
  const f=await fixture(page);
  await page.goto("/");
  await page.getByRole("button",{name:"Coaches",exact:true}).click();
  await expect(page.getByTestId("coach-editor-page")).toBeVisible();
  await page.getByRole("button",{name:"+ New Coach"}).click();
  await page.getByRole("textbox",{name:"Coach name"}).fill("QA Coach 2+1");
  await page.getByRole("button",{name:"+ Fixture"}).click();
  await page.getByRole("button",{name:"Empty row 8 column 5"}).click();
  await expect(page.getByRole("textbox",{name:"Selected fixture label"})).toBeVisible();
  await page.getByRole("textbox",{name:"Selected fixture label"}).fill("Emergency Side Exit");
  await expect(page.getByText("No seat-code or geometry conflicts detected.")).toBeVisible();
  await page.getByRole("button",{name:"Save Coach"}).click();
  await expect(page.getByRole("status").filter({hasText:"Coach geometry"})).toBeVisible();
  expect(f.getLastMethod()).toBe("POST");
  expect(f.getSaved()).toMatchObject({name:"QA Coach 2+1",pattern:"2+1"});
  expect(f.getSaved()?.seats.length).toBe(12);
  expect(f.getSaved()?.fixtures).toEqual([{kind:"emergency_exit",label:"Emergency Side Exit",
    deck:"LOWER",row:7,col:4,width:1,length:1}]);
});

test("Coach editor detects physical overlap and refuses to submit it",async({page})=>{
  const f=await fixture(page);
  await page.goto("/");
  await page.getByRole("button",{name:"Coaches",exact:true}).click();
  await page.getByRole("button",{name:"+ New Coach"}).click();
  await page.getByRole("button",{name:"Seat 1",exact:true}).click();
  await page.getByRole("spinbutton",{name:"Selected col"}).fill("1");
  await expect(page.getByRole("alert")).toContainText("Overlapping geometry");
  await expect(page.getByRole("button",{name:"Save Coach"})).toBeDisabled();
  expect(f.getSaved()).toBeUndefined();
});

test("Referenced coach is immutable and can be cloned without changing assigned routes",async({page})=>{
  await fixture(page);
  await page.goto("/");
  await page.getByRole("button",{name:"Coaches",exact:true}).click();
  await page.getByRole("button",{name:"Open coach Existing 2+1"}).click();
  await expect(page.getByTestId("coach-locked")).toContainText("Linked to 2 route(s) and 1 vehicle(s).");
  await expect(page.getByRole("textbox",{name:"Coach name"})).toBeDisabled();
  await expect(page.getByRole("button",{name:"Save Coach"})).toBeDisabled();
  await page.getByRole("button",{name:"Clone version"}).click();
  await expect(page.getByRole("textbox",{name:"Coach name"})).toHaveValue("Existing 2+1 Copy");
  await expect(page.getByRole("textbox",{name:"Coach name"})).toBeEnabled();
});

test("Schedule seat-copy SVG shows physical fixtures without pretending they are sellable seats", () => {
  const layout: ScheduleSeatLayout = {
    tripId:17, travelDate:"2026-12-10",status:"active",bookable:true,
    serviceNumber:"QA-COACH",routeName:"Route",coachName:"Coach",fromSequence:0,toSequence:1,
    stops:[{sequence:0,cityId:1,name:"City A",day:1,time:"10:00"},
      {sequence:1,cityId:2,name:"City B",day:1,time:"16:00"}],
    stages:[],seats:[{seatCode:"1L",deck:"LOWER",row:1,col:0,width:1,length:1,
      seatType:"sleeper",state:"available",gender:null,ladiesOnly:false,malesOnly:false,fare:600}],
    fixtures:[{kind:"toilet",label:"Cabin Toilet",deck:"LOWER",row:1,col:2,width:1,length:1}]
  };
  const svg=seatPosterSvg(layout);
  expect(svg).toContain('data-fixture="toilet"');
  expect(svg).toContain("Cabin Toilet");
  expect(svg).toContain('data-seat="1L"');
});
