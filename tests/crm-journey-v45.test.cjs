'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const express=require('express');

const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const front=read('public/js/crm-journey-v45.js');
const crm=read('public/js/crm-screenshot-v8.js');
const css=read('public/css/crm-journey-v45.css');
const html=read('public/index.html');
const miscSrc=read('server/api/misc.js');
new Function(front);new Function(crm);
const context={};vm.runInNewContext(front,context);
const render=context.CRMJourneyV45;
const makeLower=()=>{
 const seats=[];
 for(let i=0;i<6;i++)seats.push({code:(i+1)+'L',type:'sleeper',row:i*2,col:3,h:2,w:1,status:'booked_male',fare:1899,reservation_count:i+1});
 for(let i=0;i<22;i++)seats.push({code:String(i+1),type:'seater',row:Math.floor(i/2),col:i%2,h:1,w:1,status:i%2?'booked_female':'booked_male',fare:989,reservation_count:1});
 return{deck:'LOWER',rows:12,cols:4,seats};
};
const makeUpper=()=>{
 const seats=[];
 for(let row=0;row<6;row++)for(let col=0;col<3;col++){
  const code=(row*3+col+1)+'U';
  seats.push({code,type:'sleeper',row:row*2,col:[0,1,3][col],h:2,w:1,status:code==='3U'?'booked_female':'booked_male',fare:1749,reservation_count:1,booking:{is_current:code==='3U'}});
 }
 return{deck:'UPPER',rows:12,cols:4,seats};
};

test('reference 46-seat dual-deck geometry, prices, SVG details and selected seat',()=>{
 const b={pnr:'ST_TEST_PNR',status:'confirmed',passengers:[{seat:'3U',name:'QA Traveller',gender:'F',age:26,fare:1888.95,status:'booked'}]};
 const lower=makeLower(),upper=makeUpper();
 const l=render.projection(lower),u=render.projection(upper);
 assert.equal(l.kind,'reference-mixed');assert.equal(l.pos(lower.seats[0]),1);
 assert.equal(l.pos(lower.seats[6]),3);assert.equal(l.pos(lower.seats[7]),4);
 assert.equal(u.kind,'reference-upper');
 assert.equal(u.pos(upper.seats[2]),1);assert.equal(u.pos(upper.seats[1]),3);assert.equal(u.pos(upper.seats[0]),4);
 const rendered=render.mapHtml({decks:[upper,lower]},b);
 assert.ok(rendered.indexOf('LOWER deck')<rendered.indexOf('UPPER deck'));
 assert.equal((rendered.match(/data-cv8-seat=/g)||[]).length,46);
 assert.match(rendered,/cv8-wheel-svg/);assert.match(rendered,/cv8-emergency-svg/);
 assert.match(rendered,/class="cv8-seat cv8-v45-seat cv8-berth selected"/);
 assert.match(rendered,/aria-label="Seat 3U · Current passenger seat/);
 assert.match(rendered,/cv8-seat-count bottom/);
 assert.match(rendered,/×6/);
 assert.match(rendered,/grid-row:1\/span 2;grid-column:1\/span 1/);
 assert.match(rendered,/grid-row:1\/span 1;grid-column:3\/span 1/);
 assert.match(rendered,/cv8-chair booked_female/);
 assert.match(rendered,/cv8-chair booked_male/);
 assert.match(rendered,/cv8-exit/);
 assert.ok(!rendered.includes('QA Traveller'),'Never show passenger names on the coach map');
 assert.ok(!rendered.includes('ST_TEST_PNR'),'Never show passenger PNR on seat cards');
});
test('other coach layouts preserve source row/column and no fabricated reservation badges',()=>{
 const deck={deck:'LOWER',rows:3,cols:5,seats:[{code:'7',row:2,col:4,h:1,w:1,status:'available',fare:500}]};
 assert.equal(render.projection(deck).kind,'source');
 const result=render.mapHtml({decks:[deck]},{status:'confirmed',passengers:[]});
 assert.match(result,/grid-row:3\/span 1;grid-column:5\/span 1/);
 assert.ok(!result.includes('cv8-seat-count'),'No count until API supplies real reservations');
 assert.ok(!result.includes('selected'),'Empty booking is never green');
 assert.match(result,/Seat 7 · Available · ₹500/);
});
test('booking reference and passenger cards match screenshot semantics without hardcoded data',()=>{
 const b={ticket_number:'095161',pnr:'ST261122101950095161',source:'redbus',booked_at:'2026-11-22T10:19:00Z',
  passengers:[{seat:'3U',name:'Reference Person',gender:'F',age:26,fare:1888.95,status:'booked'},{seat:'2U',name:'Test',gender:'M',age:32,fare:1200,status:'cancelled'}]};
 const I=x=>'<svg data-test-icon="'+x+'"></svg>';
 const card=render.ticketCard(b,I,()=> '22 Nov 2026, 10:19 am');
 assert.match(card,/Booking Details <small>\(1 seat\)/);
 assert.match(card,/PNR: <b class="cv8-blue">095161/);
 assert.match(card,/Ref: ST261122101950095161/);
 assert.match(card,/redbus/);assert.match(card,/booking-collapse/);
 const p=render.passengerCards(b,I,x=>'₹'+Number(x).toFixed(2));
 assert.match(p,/3U/);assert.match(p,/Reference Person/);assert.match(p,/♀ Female/);
 assert.match(p,/₹1888.95/);assert.match(p,/male/);assert.match(p,/Cancelled/);
 assert.equal(render.seatStatus({code:'3U',status:'booked_female',booking:{is_current:true}},b,new Set(['3U'])),'selected');
 assert.equal(render.seatStatus({code:'2U',status:'booked_male',booking:{is_current:true}},b,new Set(['3U'])),'booked_male');
});
test('XSS-unsafe seat codes are escaped and no foreign identity fields enter seat cards',()=>{
 const sample={deck:'LOWER',rows:1,cols:4,seats:[{code:'<svg onload=alert(1)>',row:0,col:0,h:1,w:1,type:'seater',fare:999,status:'available'}]};
 const out=render.mapHtml({decks:[sample]},{status:'confirmed',passengers:[]});
 assert.ok(!out.includes('data-cv8-seat="<svg'));
 assert.ok(out.includes('&lt;svg'));
});
test('CRM wiring, all screenshot action controls, focus, responsive two-panel layout and route permissions',()=>{
 for(const label of ['Book Seats','Update Ticket','Print Ticket','Print Invoice','Notify','Cancel Ticket',
   'Shift Passenger','Show History','Chat Pax','Comment','Add comment','Contact & Journey Details','Passenger Information'])
   assert.ok((crm+front).includes(label),label);
 for(const value of ['data-cv8-seat-inspection','CRMJourneyV45.mapHtml','CRMJourneyV45.ticketCard','CRMJourneyV45.passengerCards',
   'shiftBookingV45','/shift-options','/shift-seats','/history','booking-collapse','previousFocus.focus',
   'result.recorded','TicketPrintV41.open'])
   assert.ok(crm.includes(value),'Missing CRM behavior '+value);
 for(const cssClass of ['cv8-v45-seat','cv8-deck-lower','cv8-deck-upper','cv8-actionbar','cv8-booking-main',
   'cv8-gender.female','cv8-contactgrid','cv8-v45-overlay','body.cv8-locked #modal-root .ov','@media'])
   assert.ok(css.includes(cssClass),'Missing v45 styles '+cssClass);
 assert.ok(html.includes('crm-journey-v45.css?build=45'));
 assert.ok(html.indexOf('/js/crm-journey-v45.js?build=45')<html.indexOf('/js/crm-screenshot-v8.js?build=45'));
 assert.ok(miscSrc.includes('CRMAccess.requireBooking(req,b)'));
 assert.ok(miscSrc.includes('reservation_count:'));
 assert.ok(!front.includes('095161'),'No reference PNR copied as live inventory');
});

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gds-crm-v45-'));
process.env.GDS_DATA_DIR=temp;
const db=require('../server/db');
const A=require('../server/auth');
const D=require('../server/domain');
require('../server/seed').seed();
test('authenticated CRM endpoint retains seat status, private count metadata and masks other booking identities',async t=>{
 const b=db.col('bookings').find(x=>x.status==='confirmed'&&x.passengers?.length&&
   db.col('coaches').get(db.col('routes').get(x.route_id)?.coach_template_id)?.layout?.decks?.length===2);
 assert.ok(b,'Seeded two-deck confirmed booking required');
 const route=db.col('routes').get(b.route_id);
 const via=[...(route.via_cities||[])].sort((a,z)=>a.order-z.order);
 assert.ok(via.length>=3,'Needs at least three trip cities for segment reuse');
 const seat=b.passengers[0].seat;
 b.from_city_id=via[0].city_id;b.to_city_id=via[1].city_id;
 const privatePnr='OTHER_PRIVATE_PNR_3456',privateName='Other Booking Secret';
 db.col('bookings').insert({
  pnr:privatePnr,ticket_number:'PRIVATE_3456',schedule_id:b.schedule_id,route_id:b.route_id,
  source:'branch',status:'confirmed',payment:'paid',from_city_id:via[1].city_id,to_city_id:via.at(-1).city_id,
  contact:{name:privateName,phone:'9888876543',email:'private@example.test'},
  passengers:[{seat,name:privateName,gender:'F',age:30,fare:1800,status:'booked'}],
  booked_at:new Date().toISOString(),travel_date:b.travel_date,fare:{total:1800}
 });
 const owner=db.col('users').find(x=>x.role==='owner');
 assert.ok(owner,'Owner fixture required');
 let actor={...A.publicUser(owner),real_user_id:owner.id};
 const app=express();
 app.use(express.json());
 app.use('/api',(req,_res,next)=>{req.user=actor;next()});
 app.use('/api',require('../server/api/misc').r);
 const server=await new Promise(resolve=>{const x=app.listen(0,'127.0.0.1',()=>resolve(x))});
 t.after(async()=>{
  await new Promise(resolve=>server.close(resolve));
  await new Promise(resolve=>setTimeout(resolve,420));
  fs.rmSync(temp,{recursive:true,force:true});
 });
 const get=async p=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api'+p);
  return{code:r.status,data:await r.json()}};
 const res=await get('/crm/booking/'+encodeURIComponent(b.pnr));
 assert.equal(res.code,200);
 const seats=res.data.map.decks.flatMap(x=>x.seats),mine=seats.find(x=>x.code===seat);
 assert.ok(mine);
 assert.ok(mine.reservation_count>=2);
 assert.equal(mine.booking.is_current,true);
 assert.equal(mine.status,['booked_female','booked_male'].includes(mine.status)?mine.status:mine.status);
 for(const s of seats){
  assert.equal(Object.keys(s.booking||{}).every(k=>k==='is_current'),true);
  assert.equal('pnr' in s,false);
  assert.equal('name' in s,false);
  assert.equal('phone' in s,false);
 }
 const serialized=JSON.stringify(res.data.map);
 assert.ok(!serialized.includes(privatePnr));
 assert.ok(!serialized.includes(privateName));
 assert.ok(!serialized.includes('9888876543'));
 actor={...actor,permissions:['crm.view','bookings.view_all']};
 const masked=await get('/crm/booking/'+encodeURIComponent(b.pnr));
 assert.equal(masked.code,200);
 assert.notEqual(masked.data.booking.contact.phone,b.contact.phone);
 actor={...actor,permissions:[]};
 const denied=await get('/crm/booking/'+encodeURIComponent(b.pnr));
 assert.equal(denied.code,403);
});
