'use strict';
/* V39: isolated booking notice feed, eligibility window, consent-confirmed upgrades */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.GDS_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'gds-loyalty-v39-'));
process.env.GDS_RESEED='1';
const app=require('../server/index'),db=require('../server/db'),
 A=require('../server/auth'),D=require('../server/domain'),U=require('../server/util'),
 upgrade=require('../server/api/loyalty-upgrades-v39');
const owner=db.col('users').find(x=>x.role==='owner');
const viewer=db.col('users').find(x=>x.role==='viewer')||db.col('users').insert({phone:'8999888777',name:'Restricted viewer',role:'viewer',status:'ACTIVE'});
assert.ok(owner&&viewer);
const server=app.listen(0),host='http://127.0.0.1:'+server.address().port+'/api';
async function call(method,url,body,user=owner){
 const r=await fetch(host+url,{method,headers:{Authorization:'Bearer '+A.sign({uid:user.id,exp:Date.now()+300000}),
  ...(body!==undefined?{'Content-Type':'application/json'}:{})},
  ...(body!==undefined?{body:JSON.stringify(body)}:{})});
 return {code:r.status,data:await r.json()};
}
const get=(u,user)=>call('GET',u,undefined,user),post=(u,body,user)=>call('POST',u,body,user);
const dateIST=d=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day};
const timeIST=(d)=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(d);
(async()=>{
 try{
  const todayDate=new Date(),now=Date.now();
  // New event feed baselines without replaying seeded bookings.
  const first=await get('/bookings/live-events-v39');
  assert.equal(first.code,200);
  assert.deepEqual(first.data.events,[]);
  assert.ok(Number.isInteger(first.data.cursor));
  assert.equal((await get('/bookings/live-events-v39',viewer)).code,403);
  assert.equal((await get('/bookings/live-events-v39?since_id=oops')).code,400);
  const sample=db.col('bookings').find(b=>b.status==='confirmed'&&b.payment==='paid'&&b.passengers.some(p=>p.status!=='cancelled'));
  assert.ok(sample);
  D.notify('booking.created',sample);
  const feed=await get('/bookings/live-events-v39?since_id='+first.data.cursor);
  assert.equal(feed.code,200);
  assert.ok(feed.data.events.some(e=>e.pnr===sample.pnr&&e.seats.length>=1));
  const e=feed.data.events.find(e=>e.pnr===sample.pnr);
  assert.ok(e.boarding&&e.dropping&&e.passenger_name&&e.ticket_number);
  assert.ok(['new_booking','in_trip_booking'].includes(e.kind));
  assert.ok((await get('/bookings/live-events-v39?since_id='+feed.data.cursor)).data.events.length===0);

  // Set up isolated real in-memory route, trip, booking and loyalty record.
  const source=db.col('routes').all().find(r=>{
   const s=db.col('schedules').find(x=>x.route_id===r.id);
   if(!s)return false;
   const map=D.seatMap(s);
   return map.decks.flatMap(d=>d.seats).some(x=>String(x.type)==='seater')&&
     map.decks.flatMap(d=>d.seats).some(x=>String(x.type)==='sleeper');
  });
  assert.ok(source,'Expected a mixed-coach route in fixture');
  const copy=JSON.parse(JSON.stringify(source));
  const from=D.routeCities(copy)[0],to=D.routeCities(copy).slice(-1)[0];
  assert.ok(from&&to);
  const boarding=copy.stages.find(x=>x.type==='pickup'&&String(x.city_id)===String(from.city_id));
  const dropping=copy.stages.find(x=>x.type==='drop'&&String(x.city_id)===String(to.city_id));
  assert.ok(boarding&&dropping,'Fixture route needs pickup and drop stages');
  const future=new Date(now+10*60000);
  const t0=dateIST(todayDate),t1=dateIST(future);
  const day=t0===t1?1:2;
  const rt=db.col('routes').insert({...copy,id:987654,service_number:'QA39',status:'active',
    stages:copy.stages.map(x=>String(x.id)===String(boarding.id)?
     {...x,time:timeIST(future),day}:x)});
  const baseS=db.col('schedules').find(x=>x.route_id===source.id);
  const s=db.col('schedules').insert({...JSON.parse(JSON.stringify(baseS)),
   id:987650001,route_id:rt.id,travel_date:t0,departure_time:timeIST(new Date(now+5*60000)),
   status:'active',trip_status:'live',seat_blocks:[],unblocked:[]});
  const map=D.seatMap(s,from.city_id,to.city_id);
  const seats=map.decks.flatMap(d=>d.seats);
  const initial=seats.find(x=>String(x.type)==='seater'&&x.status==='available');
  const better=seats.find(x=>String(x.type)==='sleeper'&&x.status==='available');
  assert.ok(initial&&better);
  const phone='9876503333';
  db.col('customers').insert({phone,name:'v39 Loyalty QA',tier:'Gold',miles:3000});
  const booking=db.col('bookings').insert({pnr:'STV39-TEST-1',ticket_number:'993939',
   schedule_id:s.id,route_id:rt.id,travel_date:t0,source:'branch',status:'confirmed',payment:'paid',
   from_city_id:from.city_id,to_city_id:to.city_id,boarding_stage_id:boarding.id,
   dropping_stage_id:dropping.id,booked_at:U.nowIso(),contact:{phone,name:'v39 Loyalty QA',email:''},
   passengers:[{seat:initial.code,name:'v39 Loyalty QA',gender:'M',age:30,fare:1000,status:'booked'}],
   fare:{net:1000,total:1050,gross:1000,discount:0,gst:50,commission:0}});
  const prefix='/trips/'+s.id+'/loyalty-upgrades/'+encodeURIComponent(booking.pnr)+'/'+encodeURIComponent(initial.code);
  let opt=await get(prefix);
  assert.equal(opt.code,200,JSON.stringify(opt.data));
  assert.equal(opt.data.requires_passenger_consent,true);
  assert.ok(opt.data.options.some(x=>x.seat===better.code));
  assert.equal((await get(prefix,viewer)).code,403);
  assert.equal((await post(prefix+'/offer',{target_seat:better.code},viewer)).code,403);
  assert.throws(()=>upgrade.checkEligible(booking,booking.passengers[0],now-40*60000),/within 20 minutes/);
  const unknown=await post(prefix+'/offer',{target_seat:'NONEXIST'});
  assert.equal(unknown.code,409);
  const offered=await post(prefix+'/offer',{target_seat:better.code});
  assert.equal(offered.code,200,JSON.stringify(offered.data));
  assert.equal(offered.data.offer.status,'offered');
  assert.equal(booking.passengers[0].seat,initial.code,'Offer must not move the passenger');
  assert.equal((await post(prefix+'/offer',{target_seat:better.code})).code,409,'Duplicate offer rejected');
  const trip=await get('/trips/'+s.id);
  assert.equal(trip.code,200);
  assert.ok(trip.data.passengers.some(p=>p.pnr===booking.pnr&&p.seat_upgrade?.status==='offered'));
  assert.equal((await post(prefix+'/accept',{consent_confirmed:false,consent_method:'phone',consent_reference:'call-12'})).code,400);
  assert.equal((await post(prefix+'/accept',{consent_confirmed:true,consent_method:'phone',consent_reference:''})).code,400);
  const done=await post(prefix+'/accept',{consent_confirmed:true,consent_method:'phone',
   consent_reference:'customer-callback-2026-11-23'});
  assert.equal(done.code,200,JSON.stringify(done.data));
  assert.equal(done.data.new_seat,better.code);
  assert.equal(done.data.offer.status,'applied');
  const occupancy=D.seatMap(s,from.city_id,to.city_id).decks.flatMap(d=>d.seats);
  assert.ok(occupancy.some(x=>x.code===better.code&&x.booking?.pnr===booking.pnr));
  assert.ok(occupancy.some(x=>x.code===initial.code&&x.status==='available'));
  assert.equal((await post(prefix+'/accept',{consent_confirmed:true,consent_method:'phone',consent_reference:'again'})).code,409);
  assert.ok(db.col('edit_history').filter(x=>x.changes?.op==='loyalty_upgrade_offer').length>=1);
  assert.ok(db.col('edit_history').filter(x=>x.changes?.op==='loyalty_upgrade_apply').length>=1);
  const altered=await get('/trips/'+s.id);
  assert.ok(altered.data.passengers.some(p=>p.pnr===booking.pnr&&p.seat===better.code&&p.seat_upgrade?.status==='applied'));
  console.log('PASS v39 API: feed baseline/cursor/permission, real event display, eligible offers within window, offer not moving seat, explicit consent gate, inventory application, audit and read-after-write');
 }finally{
  server.closeAllConnections?.();server.close();
  db.persistNow();fs.rmSync(process.env.GDS_DATA_DIR,{recursive:true,force:true});
 }
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
