import {test,expect,type Page} from "@playwright/test";
async function setup(page:Page){
  let staff=[{id:21,name:"Test Driver",phone:"9000000000",role:"driver",
    status:"active",designation:"Senior Driver",licenseNumber:"DL1001",
    licenseExpiry:"2027-02-02",salaryType:"per_trip",salaryAmount:500,bataPerTrip:150}];
  let saved:any=null,count=0, dutyCalls=0,docCalls=0;
  const json=(data:unknown)=>({status:200,contentType:"application/json",body:JSON.stringify(data)});
  await page.addInitScript(()=>sessionStorage.setItem("journeyos.adminKey","staff-qasession"));
  await page.route("**/api/admin/me",r=>r.fulfill(json({name:"Admin QA",role:"ops",tenant:"demo",auth:"service-key",phone:null})));
  await page.route("**/api/admin/staff",async r=>{
    if(r.request().method()==="POST"){
      saved=r.request().postDataJSON();count++;
      staff=[...staff,{id:22,...saved}];
      await r.fulfill(json({id:22,...saved}));
    }else await r.fulfill(json(staff));
  });
  await page.route("**/api/admin/staff/21",r=>{
    saved=r.request().postDataJSON();count++;
    staff=staff.map(x=>x.id===21?{...x,...saved}:x);
    r.fulfill(json({id:21,...saved}));
  });
  await page.route("**/api/admin/staff/21/documents",r=>{
    docCalls++;
    r.fulfill(json([{id:901,documentType:"LICENSE",documentName:"Driver licence",
      category:"staff",expiryDate:"2027-02-02",verificationStatus:"REVIEW_REQUIRED",
      source:"metadata_only",downloadAvailable:false}]));
  });
  await page.route("**/api/admin/staff/21/duties",r=>{
    dutyCalls++;
    r.fulfill(json([{id:70,tripId:101,travelDate:"2026-12-05",status:"active",
      serviceNumber:"NTHB1",routeName:"HYD BNG",role:"Driver",
      isActive:true,assignedAt:"2026-12-04T12:00:00Z",replacedAt:null,replacedReason:null}]));
  });
  return {saved:()=>saved,count:()=>count,docs:()=>docCalls,duties:()=>dutyCalls};
}
test("Staff five submenus and source-bound staff editor five tabs",async({page})=>{
 const m=await setup(page);
 await page.goto("/");
 await page.getByRole("button",{name:"Staff",exact:true}).click();
 const ui=page.getByTestId("staff-workspace");
 await expect(ui).toBeVisible();
 const nav=ui.getByRole("navigation",{name:"Staff module sections"});
 for(const title of ["Staff","Attendance","Advances","Reimbursements","Payouts"])
  await expect(nav.getByRole("button",{name:title,exact:true})).toBeVisible();
 await nav.getByRole("button",{name:"Attendance"}).click();
 await expect(ui.getByRole("region",{name:"Attendance workspace"})).toContainText("not yet been migrated");
 await expect(ui.getByRole("button",{name:"+ Add Attendance"})).toBeDisabled();
 await nav.getByRole("button",{name:"Staff",exact:true}).click();
 await ui.getByRole("button",{name:"View / Edit"}).click();
 const editor=page.getByRole("dialog",{name:"Staff member Test Driver"});
 await expect(editor).toBeVisible();
 await expect(editor.getByRole("textbox",{name:"Staff full name"})).toHaveValue("Test Driver");
 const tabs=editor.getByRole("navigation",{name:"Staff editor tabs"});
 await tabs.getByRole("button",{name:"Payables"}).click();
 await expect(editor.getByRole("spinbutton",{name:"Staff salary amount"})).toHaveValue("500");
 await tabs.getByRole("button",{name:"Bank Details"}).click();
 await expect(editor.getByRole("button",{name:"Add verified bank account"})).toBeDisabled();
 await tabs.getByRole("button",{name:"Ledger"}).click();
 await expect(editor).toContainText("NTHB1");
 await expect.poll(()=>m.duties()).toBeGreaterThan(0);
 await tabs.getByRole("button",{name:"Documents"}).click();
 await expect(editor).toContainText("Driver licence");
 await expect(editor.getByRole("button",{name:"View / Upload"}).first()).toBeDisabled();
 await tabs.getByRole("button",{name:"Personal Info"}).click();
 await editor.getByRole("textbox",{name:"Staff full name"}).fill("Test Driver Updated");
 await editor.getByRole("button",{name:"Update Staff"}).click();
 await expect.poll(()=>m.count()).toBe(1);
 expect(m.saved()).toMatchObject({name:"Test Driver Updated",phone:"9000000000",
   role:"driver",salaryAmount:500,bataPerTrip:150});
});
test("New staff with monthly salary and license metadata is persisted",async({page})=>{
 const m=await setup(page);
 await page.goto("/");
 await page.getByRole("button",{name:"Staff",exact:true}).click();
 const ui=page.getByTestId("staff-workspace");
 await ui.getByRole("button",{name:"Add Staff",exact:true}).first().click();
 const editor=page.getByRole("dialog",{name:"Add staff member"});
 await editor.getByRole("textbox",{name:"Staff full name"}).fill("Test Attendant");
 await editor.getByRole("textbox",{name:"Staff phone number"}).fill("9888888888");
 await editor.getByRole("combobox",{name:"Staff role"}).selectOption("attendant");
 await editor.getByRole("navigation",{name:"Staff editor tabs"}).getByRole("button",{name:"Payables"}).click();
 await editor.getByRole("button",{name:"Monthly Salary"}).click();
 await editor.getByRole("spinbutton",{name:"Staff salary amount"}).fill("19000");
 await editor.getByRole("button",{name:"Add Staff"}).last().click();
 await expect.poll(()=>m.count()).toBe(1);
 expect(m.saved()).toMatchObject({name:"Test Attendant",phone:"9888888888",role:"attendant",
   salaryType:"monthly",salaryAmount:19000});
 await expect(ui).toContainText("Test Attendant");
});
