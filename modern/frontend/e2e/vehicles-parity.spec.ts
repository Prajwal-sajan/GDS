import {test,expect,type Page} from "@playwright/test";
async function setup(page:Page){
 let saved:any=null,saveCount=0;
 let vehicles:any[]=[{id:19,registrationNumber:"AR 01 Q 7827",coachTemplateId:3,
   status:"active",modelName:"BharatBenz",manufactureYear:2024,ownershipType:"owned",
   phoneNumber:"9000000000",gpsEnabled:false,insuranceExpiry:"2026-12-03",
   permitExpiry:"2027-05-10",fitnessExpiry:"2027-01-01",pucExpiry:"2027-02-01"}];
 const coaches=[{id:3,name:"A/C Seater/Sleeper (2+1)",pattern:"2+1",busType:"sleeper",
   isAc:true,seatCount:46,seaterCount:22,sleeperCount:24}];
 const json=(x:unknown)=>({status:200,contentType:"application/json",body:JSON.stringify(x)});
 await page.addInitScript(()=>sessionStorage.setItem("journeyos.adminKey","fleet-test-key"));
 await page.route("**/api/admin/me",r=>r.fulfill(json({name:"Fleet QA",role:"ops",tenant:"demo",auth:"service-key",phone:null})));
 await page.route("**/api/admin/vehicles",async r=>{
   if(r.request().method()==="POST"){
     saved=r.request().postDataJSON();saveCount++;
     const next={...saved,id:20};vehicles=[...vehicles,next];
     await r.fulfill(json(next));
   }else await r.fulfill(json(vehicles));
 });
 await page.route("**/api/admin/vehicles/19",async r=>{
   saved=r.request().postDataJSON();saveCount++;
   vehicles=vehicles.map(v=>v.id===19?{...v,...saved}:v);
   await r.fulfill(json(vehicles[0]));
 });
 await page.route("**/api/admin/coaches",r=>r.fulfill(json(coaches)));
 await page.route("**/api/admin/vehicles/19/documents",r=>r.fulfill(json([{
   id:901,documentType:"INSURANCE",documentName:"Insurance policy",
   expiryDate:"2026-12-03",category:"vehicle",verificationStatus:"REVIEW_REQUIRED",
   source:"metadata_only",downloadAvailable:false
 }])));
 return {save:()=>saved,count:()=>saveCount};
}
test("Fleet detail tabs expose real compliance metadata; GPS/provider remains clearly unconnected",async({page})=>{
 await setup(page);
 await page.goto("/");
 await page.getByRole("button",{name:"Fleet",exact:true}).click();
 const ui=page.getByTestId("vehicles-page");
 await expect(ui).toBeVisible();
 await expect(ui).toContainText("AR 01 Q 7827");
 await ui.getByRole("button",{name:"View",exact:true}).click();
 const dialog=page.getByRole("dialog",{name:"Vehicle AR 01 Q 7827"});
 await expect(dialog).toContainText("BharatBenz");
 await dialog.getByRole("button",{name:"Documents & Compliance"}).click();
 await expect(dialog).toContainText("Insurance policy");
 await expect(dialog).toContainText("metadata");
 await expect(dialog.getByRole("button",{name:"Upload document"})).toBeDisabled();
 await dialog.getByRole("button",{name:"Location"}).click();
 await expect(dialog).toContainText("No authorized live GPS feed");
 await expect(dialog.getByRole("button",{name:"Open live map"})).toBeDisabled();
 await dialog.getByRole("button",{name:"Close",exact:true}).click();
 await ui.getByRole("button",{name:"List",exact:true}).click();
 await expect(ui.locator("tbody tr")).toHaveCount(1);
});
test("Fleet edit, validation, coach selector and duplicate save do not reuse registration",async({page})=>{
 const mock=await setup(page);
 await page.goto("/");
 await page.getByRole("button",{name:"Fleet",exact:true}).click();
 const ui=page.getByTestId("vehicles-page");
 await ui.getByRole("button",{name:"Edit",exact:true}).first().click();
 const dialog=page.getByRole("dialog",{name:"Edit vehicle"});
 await dialog.getByRole("combobox",{name:"Vehicle status"}).selectOption("maintenance");
 await dialog.getByRole("textbox",{name:"Vehicle contact mobile"}).fill("9111111111");
 await dialog.getByRole("button",{name:"Save Vehicle"}).click();
 await expect.poll(()=>mock.save()).toMatchObject({registrationNumber:"AR 01 Q 7827",
   status:"maintenance",phoneNumber:"9111111111",coachTemplateId:3});
 await expect(ui.getByRole("status")).toContainText("saved");
 await ui.getByRole("button",{name:"Duplicate"}).first().click();
 const duplicate=page.getByRole("dialog",{name:"Add vehicle"});
 await expect(duplicate.getByRole("textbox",{name:"Vehicle registration"})).toHaveValue("");
 await duplicate.getByRole("textbox",{name:"Vehicle registration"}).fill("AR 01 Q 7828");
 await duplicate.getByRole("button",{name:"Save Vehicle"}).click();
 await expect.poll(()=>mock.count()).toBe(2);
 expect(mock.save()).toMatchObject({registrationNumber:"AR 01 Q 7828",coachTemplateId:3});
});
