'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><html><body><button id="launch">Manage</button></body></html>',{
  url:'https://localhost/#/gds/schedules',pretendToBeVisual:true,runScripts:'outside-only'
});
const w=dom.window,doc=w.document;
const requests=[],notifications=[],toasts=[],opens=[];
w.can=()=>true;
w.G={
 bookingModal:(pnr)=>opens.push(pnr),
 get:async path=>{requests.push(['GET',path]);if(path.includes('/trips/'))return {...data.trip,position:{lat:17.42,lng:78.47,address:'Latest GPS Observation',updated_at:'2026-11-20T14:00:00.000Z',speed_kmh:0}};throw Error('Unexpected GET '+path)},
 post:async(path,body)=>{requests.push(['POST',path,body]);notifications.push(body);return {recorded:body.pnrs?.length||0,delivery_verified:false}},
 confirm:async()=>true,
 prompt:async()=>null,
 toast:(message,level)=>toasts.push({message,level})
};
w.eval(fs.readFileSync('public/js/coach-2plus1-v46.js','utf8'));
w.eval(fs.readFileSync('public/js/schedule-manage-v48.js','utf8'));
const M=w.ScheduleManageV48;
const pax=[
 {pnr:'BOOK_001',ticket:'092901',status:'booked',name:'Asha',seat:'1L',gender:'F',age:27,source:'redbus',fare:920,phone:'9870000001',trips:3,from:'Hyderabad',to:'Bengaluru',booked_at:'2026-11-19T10:10:00Z',
  boarding:{id:1,name:'Victoria Memorial Metro Station',time:'17:47',day:1},dropping:{id:6,name:'Yelahanka',time:'06:15',day:2}},
 {pnr:'BOOK_002',ticket:'092902',status:'booked',name:'Siddhu',seat:'3U',gender:'M',age:31,source:'abhibus',fare:700,phone:'9870000002',trips:1,from:'Hyderabad',to:'Bengaluru',booked_at:'2026-11-19T11:00:00Z',
  boarding:{id:2,name:'Chaitanyapuri Metro Station',time:'17:49',day:1},dropping:{id:7,name:'TIN Factory',time:'06:50',day:2}}
];
const data={
 detail:{id:601,service_number:'NTHB1',origin:'Hyderabad',destination:'Bengaluru',travel_date:'2026-11-20',
  vehicle:{registration_number:'AR 01 Q 7827'}},
 trip:{passengers:pax,position:{lat:17.41,lng:78.46,address:'Hyderabad, Telangana',
  updated_at:'2026-11-20T13:55:00.000Z',speed_kmh:0},stops:[
   {id:1,name:'Victoria Memorial Metro Station',type:'pickup',time:'17:47',day:1,lat:17.4,lng:78.4,event:null},
   {id:2,name:'Chaitanyapuri Metro Station',type:'pickup',time:'17:49',day:1},
   {id:6,name:'Yelahanka',type:'drop',time:'06:15',day:2,event:{atime:'2026-11-21T00:45:00.000Z'}},
   {id:7,name:'TIN Factory',type:'drop',time:'06:50',day:2},
   {id:9,name:'Tea Break',type:'break',time:'00:30',day:2}
  ]},
 history:[
  {pnr:'BOOK_001',ticket_number:'092901',source:'redbus',contact_name:'Asha',status:'confirmed',booked_at:'2026-11-19T10:10:00Z',blocked_at:'2026-11-19T10:10:00Z',total_amount:920,passengers:[{seat:'1L',name:'Asha'}]},
  {pnr:'BOOK_002',ticket_number:'092902',source:'abhibus',contact_name:'Siddhu',status:'confirmed',booked_at:'2026-11-19T11:00:00Z',blocked_at:'2026-11-19T11:00:00Z',total_amount:700,passengers:[{seat:'3U',name:'Siddhu'}]},
  {pnr:'HOLD_003',ticket_number:'092903',source:'redbus',contact_name:'Pending',status:'hold',booked_at:'2026-11-19T12:00:00Z',blocked_at:'2026-11-19T12:00:00Z',total_amount:690,passengers:[{seat:'2U',name:'Pending'}]}
 ],
 map:{decks:[
  {deck:'LOWER',rows:12,cols:4,seats:[{code:'1L',row:0,col:3,w:1,h:2,type:'sleeper',status:'booked_female',fare:920,booking:{pnr:'BOOK_001'}}]},
  {deck:'UPPER',rows:12,cols:4,seats:[{code:'3U',row:0,col:3,w:1,h:2,type:'sleeper',status:'booked_male',fare:700,booking:{pnr:'BOOK_002'}},
   {code:'2U',row:0,col:1,w:1,h:2,type:'sleeper',status:'available',fare:690}]}
 ]},
 selectedSeats:new Set(),v48:{counts:{all:3,seat_blocks:0,bookings:3,confirmed:2,released:0,expired:0,blocked_active:0},
  events:[{id:'evt01',kind:'recorded',status:'confirmed',at:'2026-11-19T10:10:00.000Z',
   message:'Booking recorded',pnr:'BOOK_001',ticket:'092901',source:'redbus',
   passengers:[{seat:'1L',name:'Asha',age:27,gender:'F'}]},
   {id:'evt02',kind:'recorded',status:'expired',at:'2026-11-19T10:11:00.000Z',
   message:'Hold expired',pnr:'HOLD_003',ticket:'092903',source:'redbus',
   passengers:[{seat:'2U',name:'Pending',age:29,gender:'M'}]},
   {id:'evt03',kind:'recorded',status:'confirmed',at:'2026-11-19T11:00:00.000Z',
   message:'Booking recorded',pnr:'BOOK_002',ticket:'092902',source:'abhibus',
   passengers:[{seat:'3U',name:'Siddhu',age:31,gender:'M'}]}],
  seat_reservation_counts:{'1L':3,'3U':1}}
};
const close=()=>doc.querySelectorAll('.sx48-overlay').forEach(x=>x.querySelector('[data-sx48-close]')?.click());
test.after(()=>{close();dom.window.close()});
test('station summary shows exact source-backed corridor, seat chips, and ticket link',()=>{
 const launch=doc.getElementById('launch');launch.focus();
 const panel=M.summary(data,'stations');
 assert.ok(panel);
 assert.match(panel.el.textContent,/Multi-station/);
 assert.match(panel.el.textContent,/2 seats in 2 bookings/);
 assert.match(panel.el.textContent,/Hyderabad – Bengaluru/);
 assert.equal(panel.el.querySelectorAll('[data-sx48-pnr]').length,2);
 assert.equal(doc.activeElement.getAttribute('data-sx48-close'),'');
 panel.el.querySelector('[data-sx48-pnr="BOOK_001"]').click();
 assert.equal(doc.querySelector('.sx48-overlay'),null);
 assert.deepEqual(opens,['BOOK_001']);
 assert.equal(doc.activeElement,launch);
});
test('Pickup, Drop-off and Booked by groups retain real times and service source',()=>{
 const pick=M.summary(data,'pickups');
 assert.equal(pick.el.querySelectorAll('[data-sx48-filter]').length,2);
 assert.ok(pick.el.textContent.includes('05:47 PM'));
 assert.ok(pick.el.textContent.includes('Day 1'));
 assert.ok(pick.el.textContent.includes('Victoria Memorial Metro Station'));
 close();
 const drops=M.summary(data,'drops');
 assert.ok(drops.el.textContent.includes('Yelahanka'));
 assert.ok(drops.el.textContent.includes('TIN Factory'));
 assert.ok(drops.el.textContent.includes('Day 2'));
 close();
 const by=M.summary(data,'bookedby');
 assert.ok(by.el.textContent.includes('redBus'));
 assert.ok(by.el.textContent.includes('abhibus'));
 assert.equal(by.el.querySelectorAll('tbody tr').length,3); // 2 sources + total
 close();
});
test('Booking history popup supports source-backed HOLD, PNR and seat search',()=>{
 const panel=M.summary(data,'bookings');
 assert.ok(panel.el.querySelector('[data-sx48-search]'));
 assert.equal(panel.el.querySelectorAll('[data-sx48-filter]').length,3);
 assert.ok(panel.el.textContent.includes('HOLD'));
 assert.ok(panel.el.textContent.includes('₹920'));
 const search=panel.el.querySelector('[data-sx48-search]');
 search.value='HOLD_003';
 search.dispatchEvent(new w.Event('input',{bubbles:true}));
 assert.equal([...panel.el.querySelectorAll('[data-sx48-filter]')].filter(x=>!x.hidden).length,1);
 assert.ok([...panel.el.querySelectorAll('[data-sx48-filter]')].filter(x=>!x.hidden)[0].textContent.includes('092903'));
 close();
});
test('Timings includes a summary, correct type pills, true scheduled vs observed events',()=>{
 const panel=M.timings(data);
 assert.match(panel.el.textContent,/Timings/);
 for(const text of ['TRIP SUMMARY','Total 5','Pickups 2','Drops 2','Breaks 1','Sched:','Arr:','Dep:','Victoria Memorial Metro Station','Tea Break'])
  assert.ok(panel.el.textContent.includes(text),text);
 assert.ok(panel.el.textContent.includes('N/A'));
 const map=panel.el.querySelector('a[href*="openstreetmap"]');
 assert.ok(map);assert.equal(map.target,'_blank');assert.match(map.rel,/noopener/);
 assert.equal(panel.el.querySelectorAll('.sx48-stop').length,5);
 close();
});
test('Live Location displays real GPS, source status, refresh action and empty state',async()=>{
 const panel=M.location(data);
 assert.ok(panel.el.textContent.includes('Hyderabad, Telangana'));
 assert.ok(panel.el.textContent.includes('Stopped'));
 const iframe=panel.el.querySelector('iframe');
 assert.ok(iframe&&iframe.src.includes('openstreetmap.org'));
 assert.ok(iframe.src.includes('17.41'));
 panel.el.querySelector('[data-sx48-refresh]').click();
 await new Promise(resolve=>setTimeout(resolve,25));
 assert.ok(panel.el.textContent.includes('Latest GPS Observation'));
 assert.ok(requests.some(x=>x[0]==='GET'&&x[1]==='/trips/601'));
 close();
 const none=M.location({...data,trip:{...data.trip,position:null}});
 assert.match(none.el.textContent,/No verified GPS coordinates/);
 assert.equal(none.el.querySelector('iframe'),null);
 close();
});
test('History is an oldest-first timestamped timeline with working filter controls',()=>{
 const V={historyFilter:'all'};
 const all=M.historyPanel(data,V);
 assert.match(all,/Booking recorded/);
 assert.match(all,/Seat blocks 0/);
 assert.match(all,/Bookings 3/);
 assert.equal((all.match(/class="sx48-event /g)||[]).length,3);
 assert.ok(all.indexOf('evt01')<all.indexOf('evt03'));
 V.historyFilter='expired';
 const expired=M.historyPanel(data,V);
 assert.equal((expired.match(/class="sx48-event /g)||[]).length,1);
 assert.ok(expired.includes('HOLD_003'));assert.ok(!expired.includes('BOOK_001'));
 assert.ok(!all.includes('9870000001'),'Raw booking contact not in timeline');
});
test('two-deck layout preserves occupied blue/pink, nonbooked white and real price/count',()=>{
 const out=M.seatDiagram(data);
 assert.ok(out.includes('LOWER'));assert.ok(out.includes('UPPER'));
 assert.ok(out.includes('sx48-wheel'));assert.ok(out.includes('sx48-door'));
 assert.ok(out.includes('sx48-seat berth female'));
 assert.ok(out.includes('sx48-seat berth male'));
 assert.ok(out.includes('sx48-seat berth available'));
 assert.ok(out.includes('<span class="sx48-price">920</span>')&&out.includes('<span class="sx48-price">700</span>'),'Seat cards show data-driven visible numeric fares');
 assert.ok(out.includes('×3'));
 assert.ok(out.includes('data-sx-seat="1L"'));
 assert.ok(!out.includes('9870000001'));
 assert.ok(!out.includes('Asha'));
});
test('four Notification menu options and typed messages never assert delivery or cancel tickets',async()=>{
 const dropdown=M.notifyMenu();
 for(const code of ['ticket_confirmation','bus_details','bus_delay','bus_cancellation'])assert.ok(dropdown.includes(code));
 assert.ok(dropdown.includes('role="menu"'));
 await M.notify(data,[], 'ticket_confirmation');
 assert.ok(toasts.some(t=>t.message.includes('Select passengers')));
 await M.notify(data,['BOOK_001','BOOK_001'],'ticket_confirmation');
 const call=requests.filter(x=>x[0]==='POST').at(-1);
 assert.equal(call[1],'/trips/601/notify');
 assert.equal(Array.from(call[2].pnrs).join(','),'BOOK_001');
 assert.equal(call[2].template,'ticket_confirmation');
 assert.ok(toasts.some(t=>t.message.includes('external delivery remains unverified')));
 const previous=requests.length;
 await M.notify(data,['BOOK_001'],'bus_delay');
 assert.equal(requests.length,previous,'Prompt cancelled: no message record posted');
});
test('Delay/Early prompt uses authorized, validated API and expects only unreached stops updated',async()=>{
 const original=w.G.prompt;
 w.G.prompt=async()=>({direction:'Advance',hours:1,minutes:30,reason:'Road clearance'});
 const calls=requests.length;
 await M.delay(data,async()=>{requests.push(['AFTER'])});
 w.G.prompt=original;
 assert.ok(requests.length>=calls+2);
 const post=requests.findLast(x=>x[0]==='POST'&&x[1]==='/trips/601/delay');
 assert.equal(post[2].minutes,-90);
 assert.equal(post[2].reason,'Road clearance');
 assert.equal(post[2].notify,false);
 assert.ok(requests.some(x=>x[0]==='AFTER'));
});
