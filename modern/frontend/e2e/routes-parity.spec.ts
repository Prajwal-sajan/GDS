import { test, expect, type Page } from "@playwright/test";

/** Deterministic UI wiring tests (not a substitute for real .NET tests). */
async function setup(page:Page) {
  let created = false, locked = false, lastSave:any = null;
  let lastGenerate:any = null;
  const towns=[
    {id:101,name:"Hyderabad",state:"Telangana",countryName:"India"},
    {id:102,name:"Bengaluru",state:"Karnataka",countryName:"India"},
    {id:103,name:"Kurnool",state:"Andhra Pradesh",countryName:"India"}
  ];
  const coaches=[
    {id:10,name:"A/C Seater/Sleeper (2+1)",pattern:"2+1",busType:"Seater/Sleeper",
      isAc:true,seatCount:46,seaterCount:22,sleeperCount:24}
  ];
  const full=() => ({
    ...lastSave,id:1000001,coachName:coaches[0].name,structuralLocked:locked,
    stops:lastSave.stops.map((x:any,index:number)=>({...x,sequence:index,
      cityName:towns.find(v=>v.id===x.cityId)?.name||"Unknown"})),
    stages:lastSave.stages.map((x:any,i:number)=>({...x,id:999+i}))
  });
  await page.addInitScript(()=>sessionStorage.setItem("journeyos.adminKey","fixture-only"));
  await page.route("**/api/admin/me",r=>r.fulfill({status:200,contentType:"application/json",
    body:JSON.stringify({role:"ops",name:"Route QA",tenant:"demo",auth:"service-key",phone:null})}));
  await page.route("**/api/admin/integrations/redbus/status",r=>r.fulfill({status:500,body:"isolated mocked app"}));
  await page.route("**/api/admin/cities",r=>r.fulfill({status:200,contentType:"application/json",body:JSON.stringify(towns)}));
  await page.route("**/api/admin/coaches",r=>r.fulfill({status:200,contentType:"application/json",body:JSON.stringify(coaches)}));
  await page.route("**/api/admin/routes",async r=>{
    if(r.request().method()==="POST"){
      lastSave=r.request().postDataJSON();created=true;
      await r.fulfill({status:201,contentType:"application/json",body:JSON.stringify({id:1000001})});
    } else await r.fulfill({status:200,contentType:"application/json",
      body:JSON.stringify(created?[{id:1000001,name:lastSave.name,status:lastSave.status,
        serviceNumber:lastSave.serviceNumber,departureTime:lastSave.departureTime,
        fares:lastSave.fares,stages:lastSave.stages}]:[])});
  });
  await page.route("**/api/admin/routes/1000001/full",r=>r.fulfill({status:200,contentType:"application/json",body:JSON.stringify(full())}));
  await page.route("**/api/admin/routes/1000001/generate",async r=>{
    lastGenerate=r.request().postDataJSON();locked=true;
    await r.fulfill({status:200,contentType:"application/json",body:JSON.stringify({created:1})});
  });
  page.on("dialog",dialog=>void dialog.accept());
  return {lastSave:()=>lastSave,lastGenerate:()=>lastGenerate,locked:()=>locked};
}
test("Routes: create audited contract with real city/coach IDs, timings, stages and fares; generate and clone locked service",async({page})=>{
  const fake=await setup(page);
  await page.goto("/");
  await page.getByRole("button",{name:"Routes",exact:true}).click();
  await expect(page.getByTestId("routes-page")).toBeVisible();
  await page.getByRole("button",{name:"+ Add Route"}).click();
  await page.getByRole("textbox",{name:"Service number"}).fill("HYDBNG91");
  await page.getByRole("textbox",{name:"Route name"}).fill("Hyderabad → Bengaluru");
  await page.getByRole("combobox",{name:"Route status"}).selectOption("active");

  await page.getByRole("navigation",{name:"Route editor sections"}).getByRole("button",{name:"Pickups"}).click();
  await page.getByRole("textbox",{name:"Stage name 0"}).fill("Hyderabad boarding stand");
  await page.getByRole("navigation",{name:"Route editor sections"}).getByRole("button",{name:"Drops"}).click();
  await page.getByRole("textbox",{name:"Stage name 1"}).fill("Bengaluru drop stand");
  await page.getByRole("navigation",{name:"Route editor sections"}).getByRole("button",{name:"Fares"}).click();
  await page.getByRole("spinbutton",{name:"seater fare 0 1"}).fill("600");
  await page.getByRole("spinbutton",{name:"sleeperLower fare 0 1"}).fill("799");
  await page.getByRole("spinbutton",{name:"sleeperUpper fare 0 1"}).fill("849");
  await page.getByRole("button",{name:"Save Route",exact:true}).first().click();
  await expect.poll(()=>fake.lastSave()).not.toBeNull();
  expect(fake.lastSave()).toMatchObject({serviceNumber:"HYDBNG91",name:"Hyderabad → Bengaluru",
    coachTemplateId:10,status:"active",departureTime:"17:30:00",
    stages:[{stopSequence:0,kind:"pickup",name:"Hyderabad boarding stand"},{stopSequence:1,kind:"drop",name:"Bengaluru drop stand"}],
    fares:[{fromSequence:0,toSequence:1,seater:600,sleeperLower:799,sleeperUpper:849}]});
  await expect(page.getByRole("status")).toContainText("Route created");
  await page.getByRole("navigation",{name:"Route editor sections"}).getByRole("button",{name:"Generate"}).click();
  await page.getByPlaceholder("Schedule publishing request").fill("Approved operational roster");
  await page.getByRole("button",{name:"Generate Services"}).click();
  await expect.poll(()=>fake.lastGenerate()).not.toBeNull();
  await expect(page.getByRole("status")).toContainText("Created 1 scheduled services");
  await expect(page.getByText("Read-only: generated trips exist")).toBeVisible();
  await page.getByRole("button",{name:"Clone route version"}).first().click();
  await expect(page.getByRole("textbox",{name:"Service number"})).toHaveValue("HYDBNG91-NEW");
  await expect(page.getByRole("combobox",{name:"Route status"})).toHaveValue("draft");
});
test("Routes: refuse client-side duplicate city and non-chronological night stops",async({page})=>{
  const fake=await setup(page);
  await page.goto("/");
  await page.getByRole("button",{name:"Routes",exact:true}).click();
  await page.getByRole("button",{name:"+ Add Route"}).click();
  await page.getByRole("textbox",{name:"Service number"}).fill("HYDBNG92");
  await page.getByRole("textbox",{name:"Route name"}).fill("Night Route");
  await page.getByRole("navigation",{name:"Route editor sections"}).getByRole("button",{name:"Cities & Schedule"}).click();
  await page.getByRole("combobox",{name:"City 2"}).selectOption("101");
  await page.getByRole("button",{name:"Save Route",exact:true}).first().click();
  await expect(page.getByRole("alert")).toContainText("All route cities must be different");
  expect(fake.lastSave()).toBeNull();
  await page.getByRole("combobox",{name:"City 2"}).selectOption("102");
  await page.getByRole("spinbutton",{name:"Day 2"}).fill("1");
  await page.getByRole("button",{name:"Save Route",exact:true}).first().click();
  await expect(page.getByRole("alert")).toContainText("Route city times must be chronological");
  expect(fake.lastSave()).toBeNull();
});
