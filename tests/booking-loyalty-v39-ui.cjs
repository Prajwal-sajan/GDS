'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>',{
 url:'http://localhost/#/gds/schedules',runScripts:'outside-only',pretendToBeVisual:true
});
const w=dom.window,d=w.document;
const methods=[];
const pnr='ST261123-3939',seat='21';
let status='offered';
let offered={status:'offered',from_seat:'21',to_seat:'17U',
 offered_at:new Date().toISOString(),expires_at:new Date(Date.now()+120000).toISOString()};
w.G={
 user:{permissions:['bookings.view_all','bookings.modify']},
 get:async u=>{
  methods.push(['GET',u]);
  if(u.includes('/loyalty-upgrades/'))return {pnr,current_seat:status==='applied'?'17U':'21',
    offer:offered,options:[{seat:'17U',deck:'UPPER'}],requires_passenger_consent:true};
  if(u.includes('live-events-v39'))return {events:[],cursor:100};
  throw Error('Unknown '+u);
 },
 post:async (u,b)=>{
  methods.push(['POST',u,b]);
  if(u.endsWith('/offer')){status='offered';return {offer:offered}}
  if(u.endsWith('/accept')){
   assert.equal(b.consent_confirmed,true);assert.equal(b.consent_method,'phone');
   status='applied';offered={...offered,status:'applied',applied_at:new Date().toISOString()};
   return {offer:offered,new_seat:'17U'};
  }
  return {};
 },
 prompt:async()=>({method:'phone',reference:'callback-ABC-123'}),
 confirm:async()=>true,
 toast:()=>{},err:e=>{throw e},
 bookingModal:async()=>{methods.push(['OPEN PNR'])},
 modal:({title,body})=>{
  const el=d.createElement('div');el.className='ov';el.innerHTML='<section class="md"><h2>'+title+'</h2><div class="bd">'+body+'</div></section>';
  d.body.appendChild(el);
  return {el,$:q=>el.querySelector(q),close:()=>el.remove()};
 }
};
w.eval(fs.readFileSync('public/js/booking-notices-v39.js','utf8'));
w.eval(fs.readFileSync('public/js/trips-loyalty-v39.js','utf8'));
const badge=w.G.loyaltyUpgradeBadgeV39({seat:'21',seat_upgrade:offered});
assert.ok(badge.includes('OFFERED 21 → 17U'),badge);
assert.ok(badge.includes('<svg'));
assert.ok(badge.includes('offered'));
assert.ok(!w.G.loyaltyUpgradeBadgeV39({seat:'21'}));
const applied=w.G.loyaltyUpgradeBadgeV39({seat:'17U',seat_upgrade:{...offered,status:'applied'}});
assert.ok(applied.includes('UPGRADED 21 → 17U'));
assert.ok(applied.includes('applied'));
assert.ok(w.G.loyaltyUpgradeControlV39({seat:'21',name:'Test Passenger'}).includes('data-trip-loyalty-upgrade'));
w.BookingNoticeV39.start();
await new Promise(r=>setTimeout(r,20));
w.BookingNoticeV39.queueEvent({id:1,pnr:'ST-ONE',ticket_number:'095348',
 kind:'in_trip_booking',vehicle_registration:'AR 01 R 8318',
 passenger_name:'Passenger',passenger_count:1,seats:['18U'],
 boarding:'TIN Factory',dropping:'Gachibowli'});
let card=d.querySelector('.b39-card');
assert.ok(card,'Global card must render');
for(const phrase of ['In-trip booking — AR 01 R 8318','Passenger · 1 seat','Seat: 18U',
 'Board: TIN Factory','Drop: Gachibowli','PNR: 095348'])assert.ok(card.textContent.includes(phrase),phrase);
assert.ok(card.querySelector('[data-b39-close]'));
assert.ok(card.querySelector('.b39-progress-fill'));
assert.ok(card.querySelector('.b39-progress-rail[role=progressbar]'));
w.BookingNoticeV39.queueEvent({id:1,pnr:'ST-ONE'});
assert.equal(w.BookingNoticeV39.visible(),1,'Duplicate event must not create duplicate notification');
w.BookingNoticeV39.queueEvent({id:2,pnr:'ST-TWO',ticket_number:'094992',
 kind:'new_booking',vehicle_registration:'KA 10 R 1999',passenger_name:'Other',
 passenger_count:2,seats:['1L','2L'],boarding:'Central',dropping:'Terminal'});
w.BookingNoticeV39.queueEvent({id:3,pnr:'ST-THREE',ticket_number:'094993',
 kind:'new_booking',vehicle_registration:'KA 20 R 1999',passenger_name:'Third',
 passenger_count:1,seats:['3L'],boarding:'Central',dropping:'Terminal'});
assert.equal(w.BookingNoticeV39.visible(),2,'Queue capped at two simultaneous cards');
card.querySelector('[data-b39-close]').click();
await new Promise(r=>setTimeout(r,250));
assert.equal(w.BookingNoticeV39.visible(),2,'Queued third event should show after dismissal');
assert.ok(d.body.textContent.includes('ST-THREE')===false,'PNR may be shown only as ticket number');
assert.ok(d.body.textContent.includes('094993'));
const firstCard=d.querySelector('.b39-card');
firstCard.querySelector('[data-b39-pnr]').click();
await Promise.resolve();
assert.ok(methods.some(x=>x[0]==='OPEN PNR'));
w.BookingNoticeV39.stop();
assert.equal(w.BookingNoticeV39.visible(),0);

let count=0;
const m=await w.G.openLoyaltyUpgradeV39({sid:987650001,pnr,seat,onDone:async()=>count++});
assert.ok(m.el.textContent.includes('OFFERED'));
assert.ok(m.el.textContent.includes('17U'));
assert.ok(m.el.textContent.includes('passenger consent'));
m.el.querySelector('[data-lv39-accept]').click();
await new Promise(r=>setTimeout(r,30));
assert.equal(status,'applied');
assert.ok(m.el.textContent.includes('UPGRADED'));
assert.ok(count===1);
assert.ok(methods.some(x=>x[0]==='POST'&&x[1].endsWith('/accept')));
m.close();

const page=fs.readFileSync('public/index.html','utf8');
const main=fs.readFileSync('public/js/main.js','utf8');
const trips=fs.readFileSync('public/js/trip-parity-v13.js','utf8');
const css=fs.readFileSync('public/css/booking-loyalty-v39.css','utf8');
assert.ok(page.includes('booking-notices-v39.js'));
assert.ok(page.includes('trips-loyalty-v39.js'));
assert.ok(page.includes('booking-loyalty-v39.css'));
assert.ok(page.indexOf('booking-notices-v39.js')<page.indexOf('main.js'));
assert.ok(main.includes('BookingNoticeV39?.start()'));
assert.ok(main.includes('BookingNoticeV39?.stop()'));
assert.ok(trips.includes('G.loyaltyUpgradeBadgeV39(p)'));
assert.ok(trips.includes('data-trip-loyalty-upgrade'));
assert.ok(css.includes('@keyframes lv39-upgrade-pulse'));
assert.ok(css.includes('@media(prefers-reduced-motion:reduce)'));
console.log('PASS v39 UI: global timed queue/cursor/dismiss/progress/PNR, screenshot content, upgrade offered/applied badges + SVG and animation, consent workflow, responsive css/wiring');
w.close();
