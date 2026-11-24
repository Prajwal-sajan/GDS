import {test,expect,type Page} from "@playwright/test";
async function setup(page:Page){
 let follow:any=null,reply:any=null;
 const data={
   date:"2026-11-24",
   fleet:{trips:[{
     tripId:101,service:"NTHB1",route:"Hyderabad - Bengaluru",status:"active",
     vehicle:"AR 01 Q 7827",crew:[{role:"Driver",name:"Test Driver",phone:"9000000000"}],
     seats:38,capacity:46,occupancyPct:82.61,netSales:34000
   }],summary:{trips:1,running:1,withoutBus:0,seats:38,capacity:46}},
   earnings:{
     bookings:8,seats:10,amount:12000,cancelledToday:1,
     byChannel:[{channel:"counter",bookings:5,amount:7000},{channel:"redbus",bookings:3,amount:5000}],
     next7:[{date:"2026-11-24",trips:1,seats:38,capacity:46,occupancyPct:82.61},
       {date:"2026-11-25",trips:2,seats:30,capacity:90,occupancyPct:33.33}]
   },
   passengers:{noShowsYesterday:[]},
   compliance:{
     vehicleDocuments:[{vehicle:"AR 01 Q 7827",document:"Insurance",
       expiryDate:"2026-11-30",state:"EXPIRING_SOON"}],
     licences:[{name:"Test Driver",role:"driver",phone:"9000000000",
       licenseExpiry:"2026-11-29",state:"EXPIRING_SOON"}]
   },
   ratings:{average:3,count:2,low:[{id:2,ota:"redbus",pnr:"PNR001",rating:1,
     review:"Late departure",ratedAt:"2026-11-23",operatorReply:null}]}
 };
 const reviews=[
   {id:1,ota:"redbus",pnr:"PNR000",passengerName:"Test Positive",rating:5,
     ratedAt:"2026-11-22",review:"Excellent bus",operatorReply:null},
   {id:2,ota:"redbus",pnr:"PNR001",passengerName:"Test Low",rating:1,
     ratedAt:"2026-11-23",review:"Late departure",operatorReply:null}
 ];
 const json=(x:unknown)=>({status:200,contentType:"application/json",body:JSON.stringify(x)});
 await page.addInitScript(()=>sessionStorage.setItem("journeyos.adminKey","qa-ops"));
 await page.route("**/api/admin/me",r=>r.fulfill(json({name:"Operations QA",role:"ops",tenant:"demo",auth:"service-key",phone:null})));
 await page.route(/\/api\/admin\/reports\/daily-ops\?/,r=>r.fulfill(json(data)));
 await page.route(/\/api\/admin\/ratings(?:\?.*)?$/,r=>r.fulfill(json({
   rows:reviews,avg:3,distribution:[1,0,0,0,1]
 })));
 await page.route("**/api/admin/ratings/2/follow-up",r=>{
   follow=r.request().postDataJSON();r.fulfill(json({id:2,...follow}));
 });
 await page.route("**/api/admin/ratings/2/reply",r=>{
   reply=r.request().postDataJSON();r.fulfill(json({notice:"Reply stored, not published to OTA"}));
 });
 return {follow:()=>follow,reply:()=>reply};
}
test("Daily Report: fleet, summary, sales, compliance and date-scoped source evidence",async({page})=>{
 await setup(page);
 await page.goto("/");
 await page.getByRole("button",{name:"Daily Ops",exact:true}).click();
 const ui=page.getByTestId("daily-ops-page");
 await expect(ui).toBeVisible();
 await expect(ui.getByTestId("daily-ops-report")).toContainText("AR 01 Q 7827");
 await expect(ui).toContainText("₹12,000");
 await expect(ui).toContainText("Test Driver");
 await expect(ui).toContainText("Insurance");
 await ui.getByRole("navigation",{name:"Daily report categories"}).getByRole("button",{name:"Earnings"}).click();
 await expect(ui).toContainText("Forward 7-day occupancy");
 await ui.getByRole("navigation",{name:"Daily report categories"}).getByRole("button",{name:"Compliance"}).click();
 await expect(ui).toContainText("30 days");
});
test("OTA reviews: source-derived 1–2 star list and audited operator follow-up/reply",async({page})=>{
 const mock=await setup(page);
 await page.goto("/");
 await page.getByRole("button",{name:"Daily Ops",exact:true}).click();
 const ui=page.getByTestId("daily-ops-page");
 await ui.getByRole("navigation",{name:"Daily Ops sections"}).getByRole("button",{name:"OTA Ratings"}).click();
 await expect(ui.getByTestId("daily-ops-ratings")).toContainText("OTA Ratings");
 await ui.getByRole("navigation",{name:"Rating tabs"}).getByRole("button",{name:/Needs action/}).click();
 await expect(ui).toContainText("Late departure");
 await ui.getByRole("textbox",{name:"Follow-up note 2"}).fill("Called passenger about boarding delay");
 await ui.getByRole("button",{name:"Save Follow-up"}).click();
 await expect.poll(()=>mock.follow()).toMatchObject({
   status:"Open",note:"Called passenger about boarding delay"
 });
 await expect(ui.getByRole("status")).toContainText("Passenger follow-up recorded");
 await ui.getByRole("textbox",{name:"Rating reply 2"}).fill("Recorded in GDS and passed to operations");
 await ui.getByRole("button",{name:"Save GDS Reply"}).click();
 await expect.poll(()=>mock.reply()).toMatchObject({
   reply:"Recorded in GDS and passed to operations"
 });
 await expect(ui.getByRole("status")).toContainText("not published to RedBus");
});
