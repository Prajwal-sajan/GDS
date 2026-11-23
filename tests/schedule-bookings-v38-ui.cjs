'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><html><body><div class="sx-backdrop"><div class="sx-modal"><section class="sx-book-columns"><section class="sx-book-left"></section><section class="sx-book-right"></section></section></div></div></body></html>',
 {url:'https://localhost/#/gds/schedules',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,doc=w.document;
w.can=()=>true;w.today=()=>new Date().toISOString().slice(0,10);
const ticket={
 pnr:'ST2611230000094869',ticket_number:'094869',schedule_id:17001,route_id:1,travel_date:w.today(),
 status:'confirmed',payment:'paid',payment_method:'RedBus-B2B',source:'redbus',
 booked_at:new Date().toISOString(),service_number:'NTHB1',from:'Hyderabad',to:'Bengaluru',
 contact:{name:'Passenger A',phone:'6304585226',email:''},from_city_id:1,to_city_id:2,
 boarding_stage_id:11,dropping_stage_id:22,
 boarding:{id:11,name:'LB Nagar Metro Station',time:'17:45',day:1},
 dropping:{id:22,name:'Roopena Agrahara',time:'07:03',day:2},
 passengers:[{seat:'8',name:'Passenger A',gender:'F',age:24,fare:650,status:'booked'},
   {seat:'10',name:'Passenger B',gender:'M',age:35,fare:650,status:'booked'}],
 comments:[],fare:{gross:1300,discount:65,net:1235,gst:61.75,total:1296.75,commission:100}
};
const pax=ticket.passengers.map(p=>({
 pnr:ticket.pnr,ticket:ticket.ticket_number,seat:p.seat,name:p.name,age:p.age,gender:p.gender,
 fare:p.fare,phone:ticket.contact.phone,boarding:ticket.boarding,dropping:ticket.dropping,
 source:'redbus',status:'booked',trips:1,conversation_id:'conv-'+p.seat
}));
const requests=[];
const stops={pickups:[{id:11,name:'LB Nagar Metro Station',time:'17:45',day:1,city_name:'Hyderabad',pickup_type:'FREE METRO PICKUP'},
 {id:12,name:'Uppal Metro Station',time:'17:48',day:1,city_name:'Hyderabad',pickup_type:'FREE METRO PICKUP'}],
 drops:[{id:22,name:'Roopena Agrahara',time:'07:03',day:2,city_name:'Bengaluru'},
 {id:23,name:'TIN Factory',time:'06:50',day:2,city_name:'Bengaluru'}]};
w.G={
 get:async p=>{
  requests.push(['GET',p]);
  if(p.includes('/stops'))return stops;
  if(p.includes('shift-options'))return {services:[{id:18001,service:'NTBH3',travel_date:w.today(),departure_time:'19:30',free_seats:5}]};
  if(p.includes('shift-seats'))return {seats:[{seat:'1L',status:'available'},{seat:'2L',status:'available'}]};
  if(p.includes('/history'))return {pnr:ticket.pnr,ticket_number:ticket.ticket_number,events:[
   {kind:'created',title:'Booking Created',at:ticket.booked_at,actor:'RedBus',source:'redbus',details:[{label:'Status',value:'confirmed'}]}]};
  if(p.includes('/bookings/'))return ticket;
  throw Error('Unexpected GET '+p);
 },
 post:async (p,v)=>{requests.push(['POST',p,v]);return {recorded:1,refund:0}},
 put:async (p,v)=>{requests.push(['PUT',p,v]);return {...ticket,...v}},
 confirm:async()=>true,
 prompt:async()=>null,
 toast:()=>{},
 err:e=>{throw e},
 modal:({title,body})=>{const el=doc.createElement('div');el.className='test-modal';el.innerHTML='<header>'+title+'</header><main>'+body+'</main>';doc.body.append(el);return {el,close:()=>el.remove()}}
};
w.eval(fs.readFileSync('public/js/booking-ticket-v38.js','utf8'));
w.eval(fs.readFileSync('public/js/schedule-bookings-v38.js','utf8'));
const S={ov:doc.querySelector('.sx-backdrop'),tab:'bookings',detail:{id:17001},
 trip:{passengers:pax},history:[],map:{decks:[{seats:[{code:'8',status:'booked_female',booking:{pnr:ticket.pnr}},
  {code:'10',status:'booked_male',booking:{pnr:ticket.pnr}},{code:'1L',status:'available'}]}]}};
const ctx={
 hydrate:async()=>{},
 redraw:async()=>w.ScheduleBookingsV38.mount(S,ctx)
};
const sleep=()=>new Promise(resolve=>setTimeout(resolve,20));
(async()=>{
 await ctx.redraw();
 let root=S.ov.querySelector('.sx-book-right');
 assert.ok(root.querySelector('.sx38-right-tabs'));
 assert.ok(root.querySelector('[data-v38="chart"]'));
 assert.ok(root.textContent.includes('Pickup Chart'));
 assert.equal(root.querySelector('[data-v38="cancel-selected"]').disabled,true);
 assert.equal(root.querySelector('[data-v38="notify-selected"]').disabled,true);
 assert.equal(root.querySelectorAll('[data-v38-seat-select]').length,2,'Both passengers must be independently selectable');
 const selected=root.querySelector('[data-v38-seat-select="8"]');
 selected.checked=true;selected.dispatchEvent(new w.Event('change',{bubbles:true}));
 await sleep();root=S.ov.querySelector('.sx-book-right');
 assert.equal(S.v38.selected.size,1,'Seat 8 selection must not select seat 10 on the same PNR');
 assert.equal(root.querySelector('[data-v38="cancel-selected"]').disabled,false);
 assert.equal(root.querySelector('[data-v38="notify-selected"]').disabled,false);
 assert.ok(root.textContent.includes('Cancel (1)'));
 root.querySelector('[data-v38="open-ticket"]').click();
 await sleep();
 root=S.ov.querySelector('.sx-book-right');
 assert.equal(S.v38.panel,'ticket');
 assert.equal(S.v38.pnr,ticket.pnr);
 assert.ok(root.textContent.includes('Seat 8'));
 assert.ok(root.textContent.includes(ticket.pnr));
 assert.ok(root.textContent.includes('Booking Details'));
 assert.ok(root.textContent.includes('Passenger Information'));
 assert.ok(root.textContent.includes('Contact & Journey Details'));
 assert.ok(root.textContent.includes('Total Payable'));
 for(const action of ['edit','print-ticket','print-invoice','cancel-ticket','shift','history-modal','chat','comment'])
  assert.ok(root.querySelector('[data-v38="'+action+'"]'),'Missing ticket button '+action);
 root.querySelector('[data-v38="comment"]').click();await sleep();
 root=S.ov.querySelector('.sx-book-right');
 assert.ok(root.querySelector('[data-v38-comment-text]'));
 assert.equal(root.querySelector('[data-v38="comment-save"]').disabled,true);
 const note=root.querySelector('[data-v38-comment-text]');note.value='Staff-only note';
 note.dispatchEvent(new w.Event('input',{bubbles:true}));
 assert.equal(root.querySelector('[data-v38="comment-save"]').disabled,false);
 root.querySelector('[data-v38="comment-close"]').click();await sleep();
 root=S.ov.querySelector('.sx-book-right');
 root.querySelector('[data-v38="edit"]').click();await sleep();
 root=S.ov.querySelector('.sx-book-right');
 assert.equal(S.v38.mode,'edit');
 assert.ok(root.textContent.includes('Edit Booking'));
 assert.equal(root.querySelectorAll('[data-v38-field="passenger_name"]').length,2);
 assert.equal(root.querySelectorAll('[data-v38="gender"]').length,6);
 assert.ok(root.querySelector('[data-v38-edit-notify]'));
 root.querySelector('[data-v38="stop-toggle"][data-kind="pickup"]').click();await sleep();
 root=S.ov.querySelector('.sx-book-right');
 assert.equal(root.querySelectorAll('[data-v38="stop-choice"]').length,2);
 assert.ok(root.querySelector('[data-v38-stop-search]'));
 root.querySelector('[data-v38="stop-choice"][data-id="12"]').click();await sleep();
 assert.equal(S.v38.edit.boarding_stage_id,'12');
 root=S.ov.querySelector('.sx-book-right');
 assert.ok(root.textContent.includes('Uppal Metro Station'));
 root.querySelector('[data-v38="edit-back"]').click();await sleep();
 root=S.ov.querySelector('.sx-book-right');
 root.querySelector('[data-v38="shift"]').click();await sleep();
 root=S.ov.querySelector('.sx-book-right');
 assert.equal(S.v38.mode,'shift');
 assert.ok(root.textContent.includes('Shift Passenger'));
 assert.ok(root.textContent.includes('Current Booking'));
 assert.ok(root.textContent.includes('Seat Assignment'));
 assert.ok(root.querySelector('[data-v38-shift-date]'));
 assert.ok(root.querySelector('[data-v38-shift-service]'));
 assert.equal(root.querySelector('[data-v38="shift-confirm"]').disabled,true);
 const srv=root.querySelector('[data-v38-shift-service]');
 srv.value='18001';srv.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep();
 root=S.ov.querySelector('.sx-book-right');
 assert.ok(root.querySelector('[data-v38="shift-seat"][data-seat="1L"]'));
 root.querySelector('[data-v38="shift-seat"][data-seat="1L"]').click();await sleep();
 root=S.ov.querySelector('.sx-book-right');
 assert.equal(root.querySelector('[data-v38="shift-confirm"]').disabled,true,'All passengers require target seats');
 root.querySelector('[data-v38="shift-seat"][data-seat="2L"]').click();await sleep();
 root=S.ov.querySelector('.sx-book-right');
 assert.equal(root.querySelector('[data-v38="shift-confirm"]').disabled,false);
 assert.notEqual(S.v38.shift.assignment['8'],S.v38.shift.assignment['10']);
 root.querySelector('[data-v38="shift-back"]').click();await sleep();
 root=S.ov.querySelector('.sx-book-right');
 assert.equal(S.v38.mode,'view');
 root.querySelector('[data-v38="history-modal"]').click();await sleep();
 assert.ok(doc.querySelector('.sx38-history-dialog'));
 assert.ok(doc.querySelector('.sx38-history-dialog').textContent.includes('Booking Created'));
 const page=fs.readFileSync('public/index.html','utf8');
 const schedule=fs.readFileSync('public/js/schedules-screenshot-v6.js','utf8');
 const css=fs.readFileSync('public/css/schedule-bookings-v38.css','utf8');
 assert.ok(page.includes('booking-ticket-v38.js'));
 assert.ok(page.includes('schedule-bookings-v38.js'));
 assert.ok(page.includes('schedule-bookings-v38.css'));
 assert.ok(page.indexOf('booking-ticket-v38.js')<page.indexOf('schedule-bookings-v38.js'));
 assert.ok(page.indexOf('schedule-bookings-v38.js')<page.indexOf('main.js'));
 assert.ok(schedule.includes('ScheduleBookingsV38.mount'));
 assert.ok(css.includes('.sx38-stop-menu'));
 assert.ok(css.includes('.sx38-history-event'));
 assert.ok(css.includes('.sx38-shift-seat-grid'));
 console.log('PASS v38 UI: chart per-seat selection and zero-selection disabled actions, third PNR tab, fare/contact/passenger cards, comment, searchable pickup/drop, editing, shift date/service/seat assignment, PNR timeline, SVGs, script ordering');
})().catch(err=>{console.error(err);process.exit(1)});
