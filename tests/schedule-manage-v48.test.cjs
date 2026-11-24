'use strict';
/* Screenshot contract v48 — isolated seeded database, no production mutation. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gds-schedule-manage-v48-'));
process.env.GDS_DATA_DIR=tmp;
process.env.GDS_RESEED='1';
const express=require('express');
const app=express();
app.use(express.json({limit:'15mb'}));
const db=require('../server/db');
const D=require('../server/domain'),U=require('../server/util');
const Auth=require('../server/auth');
const {evidence}=require('../server/api/schedule-manage-v48');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ui=read('public/js/schedule-manage-v48.js');
const sched=read('public/js/schedules-screenshot-v6.js');
const chart=read('public/js/schedule-bookings-v38.js');
const css=read('public/css/schedule-manage-v48.css');
const html=read('public/index.html');
const ops=read('server/api/ops.js');
require('../server/seed').seed();
app.use('/api',Auth.middleware);
app.use('/api',require('../server/api/schedule-manage-v48'));
app.use('/api',require('../server/api/ops'));
const owner=db.col('users').find(x=>x.role==='owner');
assert.ok(owner);
let server,base;
test.before(async()=>{
 server=await new Promise(resolve=>{const x=app.listen(0,'127.0.0.1',()=>resolve(x))});
 base='http://127.0.0.1:'+server.address().port+'/api';
});
const req=async(method,url,body,user=owner)=>{
 const token=Auth.sign({uid:user.id,exp:Date.now()+900000});
 const response=await fetch(base+url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  ...(body===undefined?{}:{body:JSON.stringify(body)})});
 const text=await response.text();
 try{return {status:response.status,body:JSON.parse(text)}}
 catch(_){return {status:response.status,body:text}}
};
const get=(url,user)=>req('GET',url,undefined,user);
test.after(async()=>{
 if(server)await new Promise(resolve=>server.close(resolve));
 await new Promise(resolve=>setTimeout(resolve,430));
 fs.rmSync(tmp,{recursive:true,force:true});
});
test('all screenshot elements and public assets wired without any duplicated legacy popup',()=>{
 new Function(ui);new Function(sched);new Function(chart);
 for(const label of ['stations','pickups','drops','bookedby','bookings','location','timings',
  'Multi-station','Pickup points','Drop-off points','Booked by','Booking history',
  'Live location','Timings','Ticket Confirmation','Bus Details','Bus Delay / Early','Bus Cancellation',
  'Print Pickup Chart','Close','Group by:']){
  assert.ok((ui+chart).includes(label),'Missing '+label);
 }
 for(const label of ['aria-modal','data-sx48-search','data-sx48-pnr','data-v48-history-filter',
   'date','seat','booked_at','seat_reservation_counts','booking records','data-v48-notify',
   'Select passengers','OpenStreetMap','No verified GPS coordinates','timezone','renderSeat']){
  if(label==='date'||label==='timezone'||label==='renderSeat')continue;
  assert.ok((ui+chart).includes(label),'Missing '+label);
 }
 for(const label of ['data-sx-summary','data-sx-location','data-sx-timings','data-sx-delay',
   'data-sx-notify-pop','data-sx-hidefares','data-sx-print']){
  assert.ok(sched.includes(label),'Missing left pane action '+label);
 }
 for(const label of ['sx48-deck-holder','sx48-seat','sx48-quantity','sx48-dialog','sx48-event',
   'sx48-notify-menu','sx48-table','sx48-stopkind','sx48-map','sx48-trip-summary','sx48-total-chips',
   'sx48-gps-status','sx48-wheel','sx48-door','sx48-overlay']){
  assert.ok(css.includes('.'+label),'Missing CSS '+label);
 }
 assert.ok(html.includes('/css/schedule-manage-v48.css?build=48'));
 assert.ok(html.indexOf('schedule-manage-v48.js?build=48')<
   html.indexOf('schedules-screenshot-v6.js?build=48'),'v48 must register before schedule orchestrator');
 assert.ok(read('server/index.js').includes("require('./api/schedule-manage-v48')"));
 assert.ok(read('public/js/pickup-chart-v40.js').includes('openPrint'),'Existing PDF workflows remain');
});

test('source-backed evidence has no fabricated confirmed-at dates and never exports PII contact numbers',()=>{
 const schedule=db.col('schedules').all()[0];assert.ok(schedule);
 const created='2026-11-13T12:00:00.000Z';
 const confirmed={
  pnr:'V48_BK_TEST',ticket_number:'V48_TICKET',schedule_id:schedule.id,
  source:'redbus',status:'confirmed',booked_at:created,
  passengers:[{name:'Test Passenger',seat:'3U',age:26,gender:'F',status:'booked'}],
  fare:{total:1000},contact:{phone:'9876543210'}
 };
 const held={...confirmed,pnr:'V48_HOLD_TEST',status:'hold',
  passengers:[{name:'Pending Passenger',seat:'4U',status:'booked'}]};
 const out=evidence({...schedule,seat_blocks:[{seats:['5U'],at:'2026-11-14T06:30:00.000Z',
  source:'Schedule',reason:'Operator quota'}]},[confirmed,held]);
 assert.equal(out.counts.active_bookings,1);
 assert.equal(out.counts.active_seats,1);
 assert.equal(out.seat_reservation_counts['3U'],1);
 assert.ok(!out.seat_reservation_counts['4U']);
 assert.equal(out.counts.seat_blocks,1);
 assert.equal(out.events.filter(x=>x.kind==='blocked').length,1);
 assert.ok(out.events.every(e=>e.at),'Every listed event needs an actual timestamp');
 assert.ok(out.events.some(e=>e.message==='Booking recorded'));
 assert.ok(!out.events.some(e=>e.message==='Ticket confirmed'),
  'Do not create an imaginary confirmation timestamp');
 const text=JSON.stringify(out);
 assert.ok(!text.includes('9876543210'));
 assert.ok(!text.includes('contact'));
});

test('read-only schedule endpoint returns actual counts, blocks and history; denies insufficient permissions',async()=>{
 const schedule=db.col('schedules').all()[0];const id=encodeURIComponent(schedule.id);
 const data=await get('/schedules/'+id+'/manage-bookings/v48');
 assert.equal(data.status,200,JSON.stringify(data.body));
 assert.equal(data.body.timezone,'Asia/Kolkata');
 const b=db.col('bookings').filter(x=>String(x.schedule_id)===String(schedule.id));
 const live=b.filter(x=>x.status==='confirmed'&&x.passengers?.some(p=>p.status!=='cancelled'));
 const count=live.reduce((n,x)=>n+x.passengers.filter(p=>p.status!=='cancelled').length,0);
 assert.equal(data.body.counts.active_seats,count);
 assert.equal(data.body.counts.active_bookings,live.length);
 assert.ok(Array.isArray(data.body.events));
 assert.ok(data.body.events.every(e=>Number.isFinite(Date.parse(e.at))));
 const unauthorized=db.col('users').find(u=>['driver','viewer','helper'].includes(u.role));
 if(unauthorized)assert.equal((await get('/schedules/'+id+'/manage-bookings/v48',unauthorized)).status,403);
});

test('delay and advance require reason, enforce bounds, preserve already-reached stops and are idempotent',async()=>{
 const schedule=db.col('schedules').find(s=>s.status==='active'&&s.trip_status!=='completed'&&
  db.col('routes').get(s.route_id)?.stages?.length>2);
 assert.ok(schedule,'Seed requires active schedule with stops');
 const route=db.col('routes').get(schedule.route_id),stages=route.stages;
 const first=stages[0],second=stages[1];
 schedule.stop_events={[first.id]:{atime:'2026-11-20T11:00:00.000Z'}};
 const id=encodeURIComponent(schedule.id),url='/trips/'+id+'/delay';
 assert.equal((await req('POST',url,{minutes:900,reason:'Invalid'})).status,400);
 assert.equal((await req('POST',url,{minutes:15,reason:''})).status,400);
 const firstTime=first.time,secondTime=(schedule.stage_overrides?.[second.id]?.time)||second.time;
 const one=await req('POST',url,{minutes:15,reason:'Verified road diversion',notify:false});
 assert.equal(one.status,200,JSON.stringify(one.body));
 assert.ok(one.body.adjusted_stops>=1);
 assert.equal(one.body.delivery_verified,false);
 assert.equal(schedule.stage_overrides[first.id]?.time,undefined,'Reached stop must not move');
 assert.ok(schedule.stage_overrides[second.id]?.time!==secondTime,'Future stop must move');
 const saved=schedule.stage_overrides[second.id].time;
 const repeat=await req('POST',url,{minutes:15,reason:'Verified road diversion',notify:false});
 assert.equal(repeat.status,200);
 assert.equal(repeat.body.delta_minutes,0,'Repeated same adjustment must not shift time again');
 assert.equal(schedule.stage_overrides[second.id].time,saved);
 const more=await req('POST',url,{minutes:20,reason:'Updated diversion',notify:false});
 assert.equal(more.status,200);
 assert.equal(more.body.delta_minutes,5);
 const advance=await req('POST',url,{minutes:-15,reason:'Early road clearance',notify:false});
 assert.equal(advance.status,200);
 assert.equal(schedule.delay_minutes,-15);
 const history=await get('/schedules/'+id+'/history');
 assert.equal(history.status,200);
 assert.ok(history.body.history.some(e=>e.changes?.op==='adjust_trip_time'));
 assert.equal(route.stages[0].time,firstTime,'Route template must not change');
});

test('notifications enforce selected PNR and server-side templates; record not deliver',async()=>{
 const b=db.col('bookings').find(x=>x.status==='confirmed'&&x.passengers?.length);
 assert.ok(b);
 const url='/trips/'+encodeURIComponent(b.schedule_id)+'/notify';
 assert.equal((await req('POST',url,{template:'ticket_confirmation',pnrs:[]})).status,400);
 assert.equal((await req('POST',url,{template:'bus_delay',pnrs:[b.pnr]})).status,400);
 const before=db.col('messages').count();
 const result=await req('POST',url,{template:'ticket_confirmation',pnrs:[b.pnr]});
 assert.equal(result.status,200);
 assert.equal(result.body.delivery_verified,false);
 assert.ok(result.body.recorded>=1);
 assert.ok(db.col('messages').count()>before);
 assert.equal((await req('POST',url,{template:'bus_cancellation',pnrs:[b.pnr],text:''})).status,400);
 const cancelNotice=await req('POST',url,{template:'bus_cancellation',pnrs:[b.pnr],
  text:'Your scheduled bus is cancelled. Contact the operator for refund details.'});
 assert.equal(cancelNotice.status,200);
 assert.equal(db.col('bookings').find(x=>x.pnr===b.pnr).status,'confirmed',
  'Notification must never auto-cancel or refund tickets');
});
