import { test, expect, type Page } from "@playwright/test";

/** Browser wiring tests against deterministic API mocks; .NET tests validate real PostgreSQL state. */
async function setup(page:Page){
  let coach:any=null;
  let saved:unknown=null;
  let revisions=0;
  await page.addInitScript(()=>sessionStorage.setItem("journeyos.adminKey","coach-ui-qa-key"));
  await page.route("**/api/admin/me",r=>r.fulfill({status:200,contentType:"application/json",
    body:JSON.stringify({name:"Coach Test",role:"ops",tenant:"demo",auth:"service-key",phone:null})}));
  await page.route("**/api/admin/coaches/detailed",r=>r.fulfill({status:200,contentType:"application/json",
    body:JSON.stringify(coach?[{id:444,name:coach.name,busType:coach.busType,
      pattern:coach.pattern,isAc:coach.isAc,seatCount:coach.seats.length,
      seaterCount:coach.seats.filter((s:any)=>s.seatType==="seater").length,
      sleeperCount:coach.seats.filter((s:any)=>s.seatType==="sleeper").length,
      vehicles:0,routes:0}]:[])}));
  await page.route("**/api/admin/coaches/444/full",r=>r.fulfill({status:200,contentType:"application/json",
    body:JSON.stringify({...coach,id:444,capacity:coach?.seats.length||0,
      vehicles:0,routes:0,structuralLocked:false})}));
  await page.route("**/api/admin/coaches",async r=>{
    if(r.request().method()==="POST"){
      coach=r.request().postDataJSON();saved=coach;revisions++;
      await r.fulfill({status:201,contentType:"application/json",body:JSON.stringify({id:444})});
    }else await r.fallback();
  });
  await page.route("**/api/admin/coaches/444",async r=>{
    if(r.request().method()==="PUT"){
      coach=r.request().postDataJSON();saved=coach;revisions++;
      await r.fulfill({status:200,contentType:"application/json",body:JSON.stringify({id:444})});
    }else await r.fallback();
  });
  page.on("dialog",dialog=>void dialog.accept());
  return {saved:()=>saved,count:()=>revisions};
}
test("46-seat 2+1 coach: tabs, real lower/upper geometry, editable alias, add controls and save",async({page})=>{
  const mock=await setup(page);
  await page.goto("/");
  await page.getByRole("button",{name:"Coaches",exact:true}).click();
  await expect(page.getByTestId("coaches-page")).toBeVisible();
  await page.getByRole("button",{name:"+ Add 2+1 Coach"}).click();
  const dialog=page.getByRole("dialog",{name:"Add Coach"});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("region",{name:"LOWER coach deck"})).toBeVisible();
  await expect(dialog.getByRole("region",{name:"UPPER coach deck"})).toBeVisible();
  await expect(dialog.locator("[data-seat-code]")).toHaveCount(46);
  await expect(dialog.locator('[data-seat-code="3U"]')).toBeVisible();
  await expect(dialog.locator('[data-seat-code="1L"]')).toBeVisible();
  await dialog.getByRole("textbox",{name:"Display name 1L"}).fill("L Sleeper");
  await expect(dialog.locator('[data-seat-code="1L"]')).toContainText("L Sleeper");
  await dialog.getByRole("navigation",{name:"Coach editor tabs"}).getByRole("button",{name:"Amenities"}).click();
  await dialog.getByRole("checkbox",{name:"Charging Points"}).check();
  await dialog.getByRole("navigation",{name:"Coach editor tabs"}).getByRole("button",{name:"Coach Type"}).click();
  await dialog.getByRole("textbox",{name:"Coach name"}).fill("Intercity 2+1 Coach");
  await dialog.getByRole("button",{name:"Create Coach"}).click();
  await expect.poll(()=>mock.count()).toBe(1);
  expect(mock.saved()).toMatchObject({name:"Intercity 2+1 Coach",
    pattern:"2+1",amenities:["Charging Points"]});
  const payload=mock.saved() as any;
  expect(payload.seats).toHaveLength(46);
  expect(payload.seats.find((x:any)=>x.code==="1L").displayName).toBe("L Sleeper");
  await expect(page.getByRole("status")).toContainText("saved to PostgreSQL");
});
test("44+4 A/C Seater 2+2 coach shows side exit, toilet and reserved numbering, then persists",async({page})=>{
  const mock=await setup(page);
  await page.goto("/");
  await page.getByRole("button",{name:"Coaches",exact:true}).click();
  await page.getByRole("button",{name:"+ Add 2+2 Coach"}).click();
  const dialog=page.getByRole("dialog",{name:"Add Coach"});
  await expect(dialog.locator("[data-seat-code]")).toHaveCount(44);
  await expect(dialog.getByText("Side Exit").first()).toBeVisible();
  await expect(dialog.getByText("Toilet").first()).toBeVisible();
  await expect(dialog.getByText("Roof Exit").first()).toBeVisible();
  await expect(dialog.getByText("Back Exit").first()).toBeVisible();
  await expect(dialog.locator('[data-seat-code="19"]')).toHaveCount(0);
  await expect(dialog.locator('[data-seat-code="20"]')).toHaveCount(0);
  await dialog.getByRole("button",{name:"Create Coach"}).click();
  await expect.poll(()=>mock.count()).toBe(1);
  const payload=mock.saved() as any;
  expect(payload.pattern).toBe("2+2");
  expect(payload.seats).toHaveLength(44);
  expect(payload.fixtures).toHaveLength(4);
  await page.getByRole("button",{name:"Edit coach A/C Seater (2+2)"}).click();
  const edit=page.getByRole("dialog",{name:"Edit Coach"});
  await edit.getByRole("textbox",{name:"Display name 1"}).fill("Front Aisle");
  await edit.getByRole("button",{name:"Update Coach"}).click();
  await expect.poll(()=>mock.count()).toBe(2);
  expect((mock.saved() as any).seats.find((x:any)=>x.code==="1").displayName).toBe("Front Aisle");
});
