import {test,expect,type Page} from "@playwright/test";
async function setup(page:Page){
 const inv={id:34,invoiceNumber:"RB-2026-0725",fileName:"statement.csv",
   periodStart:"2026-07-01",periodEnd:"2026-07-07",status:"review",
   uploadedAt:"2026-07-09T09:00:00Z",uploadedBy:"Accounts QA",lines:3,outstanding:2};
 let upload:any=null,resolution:any=null,rechecked=0,exported=0;
 const rows=[
   {id:1,pnr:"PNR-QA-001",section:"sold",status:"matched",differences:[],why:"Exact source evidence",
     fare:799,expectedFare:799,takeHome:700,expectedTakeHome:700,delta:0,
     doj:"2026-07-05",expectedDoj:"2026-07-05",resolutionAction:null,resolutionNote:null},
   {id:2,pnr:"PNR-QA-002",section:"cancelled",status:"mismatched",differences:["commission","fare"],
     why:"Cancellation commission differs from saved GDS booking",
     fare:700,expectedFare:650,takeHome:600,expectedTakeHome:550,delta:50,
     doj:"2026-07-05",expectedDoj:"2026-07-05",resolutionAction:null,resolutionNote:null},
   {id:3,pnr:"PNR-QA-003",section:"bus_cancelled",status:"unmatched_ota",
     differences:["missing_in_gds"],why:"No authoritative booking record in GDS",
     fare:750,expectedFare:null,takeHome:650,expectedTakeHome:null,delta:null,
     doj:"2026-07-06",expectedDoj:null,resolutionAction:null,resolutionNote:null}
 ];
 const body=(x:unknown)=>({status:200,contentType:"application/json",body:JSON.stringify(x)});
 await page.addInitScript(()=>sessionStorage.setItem("journeyos.adminKey","recon-test-key"));
 await page.route("**/api/admin/me",r=>r.fulfill(body({name:"Accounting QA",role:"accounts",tenant:"demo",auth:"service-key",phone:null})));
 await page.route("**/api/admin/reconciliation/invoices",async r=>{
   if(r.request().method()==="POST"){
     upload=r.request().postDataJSON();
     await r.fulfill(body({id:34,duplicate:false}));
   }else await r.fulfill(body([inv]));
 });
 await page.route("**/api/admin/reconciliation/invoices/34",r=>r.fulfill(body({
   id:34,invoiceNumber:inv.invoiceNumber,status:"review",warningsJson:"[]",
   totals:{lines:3,matched:1,mismatched:1,needsReview:0,missingInGds:1,missingInOta:0,
     outstanding:2,atRisk:50,otaTakeHome:700,resolved:0,disputed:0,
     bySection:{sold:1,cancelled:1,bus_cancelled:1},issues:{commission:1,fare:1,missing_in_gds:1}}
 })));
 await page.route(/\/api\/admin\/reconciliation\/invoices\/34\/lines/,r=>r.fulfill(body(rows)));
 await page.route("**/api/admin/reconciliation/invoices/34/recheck",r=>{
   rechecked++;r.fulfill(body({notice:"Rechecked"}));
 });
 await page.route("**/api/admin/reconciliation/invoices/34/resolve",r=>{
   resolution=r.request().postDataJSON();
   const target=rows.find(x=>x.id===resolution.lineId)!;
   target.resolutionAction=resolution.action;
   target.resolutionNote=resolution.note;
   r.fulfill(body({notice:"Saved"}));
 });
 await page.route("**/api/admin/reconciliation/invoices/34/export",r=>{
   exported++;
   r.fulfill({status:200,contentType:"text/csv",
     headers:{"Content-Disposition":"attachment; filename=reconciliation.csv"},
     body:"PNR,DOJ,Status\nPNR-QA-001,2026-07-05,Matched\n"});
 });
 return {upload:()=>upload,resolution:()=>resolution,rechecked:()=>rechecked,exported:()=>exported};
}
async function open(page:Page){
 await page.goto("/");
 await page.getByRole("button",{name:"Reconciliation",exact:true}).click();
 const ui=page.getByTestId("ota-invoice-verifier");
 await expect(ui).toBeVisible();
 await ui.getByRole("button",{name:"View",exact:true}).click();
 await expect(ui.getByText("RB-2026-0725").first()).toBeVisible();
 return ui;
}
test("source-backed dashboard, ticket filters/cards, recheck, reviewer audit and export",async({page})=>{
 const mock=await setup(page),ui=await open(page);
 await expect(ui).toContainText("₹700.00");
 await expect(ui).toContainText("Matched events");
 await ui.getByRole("button",{name:"Browse all tickets"}).first().click();
 await expect(ui.locator("tbody tr")).toHaveCount(3);
 await ui.getByRole("combobox",{name:"Ticket status filter"}).selectOption("mismatched");
 await expect(ui.locator("tbody tr")).toHaveCount(1);
 await ui.getByRole("button",{name:"Cards",exact:true}).click();
 await expect(ui).toContainText("Cancellation commission differs");
 await ui.getByRole("button",{name:"Dispute",exact:true}).click();
 const modal=page.getByRole("dialog",{name:"Resolve invoice difference"});
 await expect(modal).toBeVisible();
 await modal.getByRole("textbox",{name:"Review note"}).fill("Disputed commission: document discrepancy");
 await modal.getByRole("button",{name:"Save Reviewer Decision"}).click();
 await expect.poll(()=>mock.resolution()).toMatchObject({
   lineId:2,action:"dispute",note:"Disputed commission: document discrepancy"
 });
 await ui.getByRole("button",{name:"↻ Recheck against GDS"}).click();
 await expect.poll(()=>mock.rechecked()).toBe(1);
 const promise=page.waitForEvent("download");
 await ui.getByRole("button",{name:"Export CSV"}).click();
 await promise;
 expect(mock.exported()).toBe(1);
});
test("PDF/CSV upload modal sends actual document bytes and explicit provider metadata",async({page})=>{
 const mock=await setup(page);
 await page.goto("/");
 await page.getByRole("button",{name:"Reconciliation",exact:true}).click();
 const ui=page.getByTestId("ota-invoice-verifier");
 await ui.getByRole("button",{name:"+ Upload Invoice"}).click();
 const dialog=page.getByRole("dialog",{name:"Upload invoice"});
 await dialog.getByRole("textbox",{name:"Invoice number"}).fill("RB-2026-0725");
 await dialog.getByRole("textbox",{name:"Operator code"}).fill("QA-OP");
 await dialog.getByRole("textbox",{name:"Statement file"}).setInputFiles({
   name:"statement.csv",mimeType:"text/csv",buffer:Buffer.from(
     "section,pnr,doj,fare,tax,commission,commission_tax,operator_offer,cancellation_charge,take_home\nsold,PNR-QA-001,2026-07-05,799,39,30,5,0,0,700")
 });
 await dialog.getByRole("button",{name:"Upload & Verify"}).click();
 await expect.poll(()=>mock.upload()).not.toBeNull();
 const sent=mock.upload() as any;
 expect(sent.invoiceNumber).toBe("RB-2026-0725");
 expect(sent.operatorCode).toBe("QA-OP");
 expect(sent.csv).toContain("PNR-QA-001");
 await expect(ui).toContainText("Payment advice parsed and reconciled");
});
