import {test,expect,type Page} from "@playwright/test";

/** Real React browser interactions on deterministic mocked backend DTOs. */
async function setup(page:Page){
 let updated:any=null,shift:any=null,cancel:any=null,comment:any=null,boarding:any=null;
 let cancelled=false;
 const tripId=101, pnr="PNR-REACT-QA-101";
 const passenger={id:701,seatCode:"1L",name:"Sample Traveler",title:"Mr",gender:"M",
   age:35,status:"CONFIRMED",boardingStatus:"Yet-To-Board",fare:799,
   baseFare:760.95,gst:38.05,isPrimary:true,cancellationCharge:0,refundAmount:0, cancelledAt:null};
 const stages={
   boarding:{id:11,name:"Hyderabad Central",address:"Central Terminal",landmark:"Main",contactNumber:null,
     day:1,time:"17:30:00",stopSequence:0},
   dropping:{id:12,name:"Bengaluru Majestic",address:"City bus stand",landmark:null,contactNumber:null,
     day:2,time:"07:30:00",stopSequence:2}
 };
 const detail=()=>({
   id:987,pnr,status:cancelled?"CANCELLED":"CONFIRMED",channel:"counter",tripId,fromSeq:0,toSeq:2,
   totalFare:799,currency:"INR",dateOfIssue:"2026-11-20T12:00:00Z",dateOfCancellation:null,
   cancellationPolicy:"10% cancellation charge prior to departure",contactMobile:"9876543210",contactEmail:"sample@example.test",
   boardingStageId:updated?.boardingAt||11,droppingStageId:updated?.dropOff||12,
   travelDate:"2026-12-03",routeId:91,routeName:"HYD BNG",serviceNumber:"NTHB1",
   coachName:"A/C Seater/Sleeper (2+1)",fromCity:"Hyderabad",toCity:"Bengaluru",
   fromCityId:107258,toCityId:102257,...stages,
   availableBoarding:[{id:11,name:"Hyderabad Central",day:1,time:"17:30:00"},
     {id:13,name:"Hyderabad Kukatpally",day:1,time:"18:30:00"}],
   availableDropping:[{id:12,name:"Bengaluru Majestic",day:2,time:"07:30:00"},
     {id:14,name:"Bengaluru Silk Board",day:2,time:"07:15:00"}],
   passengers:[{...passenger,status:cancelled?"CANCELLED":"CONFIRMED"}],
   refunds:cancelled?[{amount:719,status:"PENDING_SETTLEMENT",
     createdAt:"2026-11-24T11:00:00Z",seats:["1L"],charge:80,refund:719}]:[]
 });
 const json=(body:unknown)=>({status:200,contentType:"application/json",body:JSON.stringify(body)});
 await page.addInitScript(()=>sessionStorage.setItem("journeyos.adminKey","sample-operator-key"));
 await page.route("**/api/admin/me",r=>r.fulfill(json({name:"Ops QA",role:"ops",tenant:"demo",auth:"service-key",phone:null})));
 await page.route(/\/api\/admin\/bookings\?/,r=>r.fulfill(json([{
   pnr,tripId,status:cancelled?"CANCELLED":"CONFIRMED",channel:"counter",
   totalFare:799,dateOfIssue:"2026-11-20T12:00:00Z",seatCount:cancelled?0:1,
   passengers:[{seatCode:"1L",name:"Sample Traveler",status:cancelled?"CANCELLED":"CONFIRMED",boardingStatus:"Yet-To-Board"}]
 }])));
 await page.route("**/api/admin/bookings/"+pnr+"/workspace",r=>r.fulfill(json(detail())));
 await page.route("**/api/admin/bookings/"+pnr+"/history",r=>r.fulfill(json([
   {id:0,at:"2026-11-20T12:00:00Z",actor:"Booking system",action:"BOOKING_CREATED",comment:null},
   ...(comment?[{id:100,at:"2026-11-24T11:00:00Z",actor:"Ops QA",action:"BOOKING_COMMENT",comment:comment.text}]:[])
 ])));
 await page.route(/\/api\/admin\/bookings\/PNR-REACT-QA-101\/shift-options\?/,r=>r.fulfill(json([{
   id:202,travelDate:"2026-12-04",routeId:91,serviceNumber:"NTHB2",
   routeName:"HYD BNG",coachName:"A/C Seater/Sleeper (2+1)",fromSequence:0,toSequence:2,
   departure:"17:45",stagesOkay:true
 }])));
 await page.route(/\/api\/admin\/trips\/202\/seat-layout/,r=>r.fulfill(json({
   tripId:202,travelDate:"2026-12-04",status:"active",bookable:true,
   serviceNumber:"NTHB2",routeName:"HYD BNG",coachName:"A/C Seater/Sleeper (2+1)",
   fromSequence:0,toSequence:2,
   stops:[{sequence:0,cityId:107258,name:"Hyderabad",day:1,time:"17:45"},
     {sequence:2,cityId:102257,name:"Bengaluru",day:2,time:"07:45"}],
   stages:[],seats:[{seatCode:"1L",deck:"LOWER",row:0,col:0,width:1,length:2,
     seatType:"sleeper",state:"available",gender:null,ladiesOnly:false,malesOnly:false,fare:799},
     {seatCode:"2L",deck:"LOWER",row:2,col:0,width:1,length:2,
       seatType:"sleeper",state:"available",gender:null,ladiesOnly:false,malesOnly:false,fare:799}]
 })));
 await page.route(/\/api\/admin\/bookings\/PNR-REACT-QA-101\/cancellation-quote\?/,r=>r.fulfill(json({
   pnr,percent:10,totalFare:799,charge:79.90,refund:719.10,
   breakdown:[{seatCode:"1L",name:"Sample Traveler",fare:799,charge:79.90,refund:719.10}],
   subjectToRevalidation:true,payoutStatus:"PENDING_SETTLEMENT_IF_CONFIRMED"
 })));
 await page.route("**/api/admin/bookings/"+pnr+"/update",r=>{
   updated=r.request().postDataJSON();
   r.fulfill(json({pnr,notice:"Booking updated"}));
 });
 await page.route("**/api/admin/bookings/"+pnr+"/comments",r=>{
   comment=r.request().postDataJSON();r.fulfill(json({notice:"Internal note saved"}));
 });
 await page.route("**/api/admin/bookings/"+pnr+"/shift",r=>{
   shift=r.request().postDataJSON();r.fulfill(json({pnr,tripId:202,seats:["2L"]}));
 });
 await page.route("**/api/admin/bookings/"+pnr+"/cancel",r=>{
   cancel=r.request().postDataJSON();cancelled=true;
   r.fulfill(json({pnr,status:"CANCELLED",charge:79.90,refund:719.10,
     at:"2026-11-24T11:00:00Z",refundPaymentCompleted:false,refundObligation:"PENDING_SETTLEMENT"}));
 });
 await page.route("**/api/admin/bookings/"+pnr+"/boarding",r=>{
   boarding=r.request().postDataJSON();r.fulfill(json(null));
 });
 page.on("dialog",d=>void d.accept());
 return {updated:()=>updated,comment:()=>comment,shift:()=>shift,cancel:()=>cancel,boarding:()=>boarding};
}
async function open(page:Page) {
 await page.goto("/");
 await page.getByRole("button",{name:"Bookings",exact:true}).click();
 await expect(page.getByTestId("bookings-page")).toBeVisible();
 await page.getByRole("button",{name:"View Ticket"}).click();
 return page.getByRole("dialog",{name:"Booking PNR-REACT-QA-101"});
}
test("PNR ticket, actual itinerary, fare, and boarding status are wired",async({page})=>{
 const m=await setup(page),dialog=await open(page);
 await expect(dialog.getByTestId("booking-ticket")).toContainText("Sample Traveler");
 await expect(dialog.getByTestId("booking-ticket")).toContainText("₹799.00");
 await expect(dialog.getByTestId("booking-ticket")).toContainText("Hyderabad Central");
 await dialog.getByRole("combobox",{name:"Boarding status 1L"}).selectOption("Boarded");
 await expect.poll(()=>m.boarding()).toMatchObject({seat:"1L",status:"Boarded"});
 await dialog.getByRole("button",{name:"Update Ticket"}).click();
 await dialog.getByRole("textbox",{name:"Booking mobile"}).fill("9123456789");
 await dialog.getByRole("combobox",{name:"Pickup point"}).selectOption("13");
 await dialog.getByRole("button",{name:"Save Changes"}).click();
 await expect.poll(()=>m.updated()).toMatchObject({mobile:"9123456789",boardingAt:13,dropOff:12});
});
test("staff note is audited and appears on booking history timeline",async({page})=>{
 const m=await setup(page),dialog=await open(page);
 await dialog.getByRole("button",{name:"Comment",exact:true}).click();
 await dialog.getByRole("textbox",{name:"Internal PNR comment"}).fill("Passenger requested rear pickup");
 await dialog.getByRole("button",{name:"Save Comment"}).click();
 await expect.poll(()=>m.comment()).toMatchObject({text:"Passenger requested rear pickup"});
 await dialog.getByRole("button",{name:"Show History"}).click();
 await expect(dialog).toContainText("Passenger requested rear pickup");
});
test("shift target service and live available seat assignment are submitted to .NET",async({page})=>{
 const m=await setup(page),dialog=await open(page);
 await dialog.getByRole("button",{name:"Shift Passenger"}).click();
 await dialog.getByRole("combobox",{name:"Shift target service"}).selectOption("202");
 await expect(dialog.getByRole("region",{name:"LOWER deck"})).toBeVisible();
 await dialog.getByRole("combobox",{name:"New seat for 1L"}).selectOption("2L");
 await dialog.getByRole("button",{name:"Confirm Shift"}).click();
 await expect.poll(()=>m.shift()).toMatchObject({tripId:202,seats:["2L"]});
});
test("cancellation shows quote and records pending refund rather than payout",async({page})=>{
 const m=await setup(page),dialog=await open(page);
 await dialog.getByRole("button",{name:"Cancel Ticket"}).click();
 await dialog.getByRole("checkbox",{name:/1L/}).check();
 await expect(dialog).toContainText("₹719.10");
 await dialog.getByRole("textbox",{name:"Cancellation note"}).fill("Customer telephoned the counter");
 await dialog.getByRole("button",{name:"Confirm Cancellation"}).click();
 await expect.poll(()=>m.cancel()).toMatchObject({seats:["1L"],reason:"customer",
   notes:"Customer telephoned the counter"});
 await expect(dialog).toContainText("PENDING_SETTLEMENT");
});
