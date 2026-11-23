'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.GDS_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'gds-insights-v36-'));
process.env.GDS_RESEED='1';
const app=require('../server/index'),db=require('../server/db'),Auth=require('../server/auth'),D=require('../server/domain'),U=require('../server/util');
const helpers=require('../server/api/schedule-insights-v36').__test;
const owner=db.col('users').find(x=>x.role==='owner');
const agent=db.col('users').find(x=>x.role==='agent');
assert.ok(owner&&agent);
const server=app.listen(0);
const base='http://127.0.0.1:'+server.address().port+'/api';
async function req(url,user=owner){
 const token=Auth.sign({uid:user.id,exp:Date.now()+600000});
 const res=await fetch(base+url,{headers:{Authorization:'Bearer '+token}});
 return {status:res.status,body:await res.json(),headers:res.headers};
}
(async()=>{
 try{
  const r=await req('/schedules/month-insights?month=2026-11');
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(r.body.month,'2026-11');
  assert.equal(r.body.timezone,'Asia/Kolkata');
  assert.equal(r.body.daily.length,30);
  assert.equal(r.body.daily[0].date,'2026-11-01');
  assert.equal(r.body.daily[29].date,'2026-11-30');
  assert.ok(r.body.holidays.some(x=>x.date==='2026-11-08'&&x.name==='Diwali'&&x.kind==='gazetted'));
  assert.ok(r.body.holidays.some(x=>x.date==='2026-11-24'&&x.name==='Guru Nanak Jayanti'));
  assert.ok(r.body.holidays.some(x=>x.date==='2026-11-09'&&x.name==='Govardhan Puja'&&x.kind==='restricted'));
  assert.ok(!r.body.holidays.some(x=>x.date==='2026-11-10'&&x.name==='Govardhan Puja'),
   'Official government 2026 holiday date is November 9, not screenshot 10');
  assert.ok(r.body.holidays.some(x=>x.date==='2026-11-14'&&x.kind==='observance'));
  assert.ok(r.body.holidays.every(x=>x.source_url.startsWith('https://')));
  assert.equal(r.headers.get('cache-control'),'private, no-store');
  const s=await req('/schedules?from=2026-11-22&to=2026-11-22');
  assert.equal(s.status,200);
  const day=r.body.daily.find(x=>x.date==='2026-11-22');
  const valid=s.body.schedules.filter(x=>x.status!=='inactive'&&x.capacity>0);
  const cap=valid.reduce((a,x)=>a+x.capacity,0);
  assert.equal(day.capacity,cap,'Calendar inventory is actual schedule inventory');
  assert.equal(day.services,valid.length);
  assert.equal(day.booked_seats,valid.reduce((a,x)=>a+x.seats_booked,0));
  assert.equal(day.percent,cap?Math.round(day.booked_seats/cap*100):null);
  let bad=await req('/schedules/month-insights?month=2026-13');assert.equal(bad.status,400);
  bad=await req('/schedules/month-insights?month=2026-1');assert.equal(bad.status,400);
  const dec=await req('/schedules/month-insights?month=2026-12');
  assert.equal(dec.status,200);assert.equal(dec.body.daily.length,31);
  assert.ok(dec.body.holidays.find(x=>x.date==='2026-12-25'));
  const y=await req('/schedules/month-insights?month=2027-11');
  assert.equal(y.status,200);assert.equal(y.body.holidays_verified_for_year,false);
  assert.equal(y.body.holidays.length,0,'Do not infer unverified future holidays');
  const route=db.col('routes').find(x=>x.status==='active'&&(x.stages||[]).some(st=>st.type==='pickup'&&st.lat!=null&&st.lng!=null));
  assert.ok(route,'Seed requires at least one GPS-pinnable route');
  const overview=await req('/routes/halts-overview?days=15');
  assert.equal(overview.status,200);
  assert.equal(overview.body.data_status,'awaiting_verified_gps');
  assert.ok(overview.body.routes.every(x=>x.trips===0&&!x.provider_evidence));
  assert.ok(overview.body.routes.every(x=>x.pins_to_move===0&&x.times_to_change===0));
  assert.ok(overview.body.routes.some(x=>x.waiting>0));
  // The pre-existing /routes/:id/halts route is synthetic: never treat as evidence.
  const simulated=await req('/routes/'+route.id+'/halts?days=15');
  assert.equal(simulated.status,200);
  assert.ok(simulated.body.stops?.length);
  assert.equal((await req('/routes/halts-overview?days=15')).body.data_status,'awaiting_verified_gps');
  for(const invalid of [0,10,31,366]){
   const x=await req('/routes/halts-overview?days='+invalid);if(invalid!==0)assert.equal(x.status,400);
  }
  D.ensureSchedules(U.addDays(U.today(),-5),U.addDays(U.today(),-1));
  const schedules=db.col('schedules').filter(x=>String(x.route_id)===String(route.id)&&
   x.travel_date>=U.addDays(U.today(),-5)&&x.travel_date<U.today()).slice(0,3);
  assert.equal(schedules.length,3);
  const st=route.stages.find(x=>x.type==='pickup'&&x.lat!=null&&x.lng!=null);
  assert.ok(st);
  const expectedAt=s=>{
   const [h,m]=st.time.split(':').map(Number);
   return new Date(Date.parse(s.travel_date+'T00:00:00+05:30')+
    ((Number(st.day||1)-1)*1440+h*60+m+13)*60000).toISOString();
  };
  const lat=Number(st.lat),lng=Number(st.lng);
  for(const schedule of schedules){
   schedule.trip_status='completed';
   db.col('gps_halt_observations').insert({source:'gps_provider',provider_verified:true,
    kind:'halt',route_id:route.id,schedule_id:schedule.id,stage_id:st.id,
    lat:lat+0.0009,lng,accuracy_m:14,dwell_seconds:80,observed_at:expectedAt(schedule)});
  }
  // Forged/unqualified events must not affect alerts or trip counts.
  db.col('gps_halt_observations').insert({source:'gps_provider',provider_verified:false,
    kind:'halt',route_id:route.id,schedule_id:schedules[0].id,stage_id:st.id,
    lat:lat+1,lng,accuracy_m:4,dwell_seconds:80,observed_at:expectedAt(schedules[0])});
  const hydrated=await req('/routes/halts-overview?days=15');
  assert.equal(hydrated.status,200);
  const monitored=hydrated.body.routes.find(x=>String(x.id)===String(route.id));
  assert.equal(monitored.trips,3);
  assert.equal(monitored.provider_evidence,true);
  assert.ok(monitored.pins_to_move>=1,'Three good GPS samples produce pin warning');
  assert.ok(monitored.times_to_change>=1,'Three good GPS samples produce time warning');
  const stop=monitored.stops.find(x=>String(x.stage_id)===String(st.id));
  assert.equal(stop.observed_trips,3);
  assert.equal(stop.status,'pin_and_time');
  assert.ok(stop.median_offset_m>50&&stop.median_time_delta_min===13);
  assert.ok(monitored.waiting>=0);
  const one=await req('/routes/'+route.id+'/halt-evidence?days=15');
  assert.equal(one.status,200);assert.equal(one.body.trips,3);
  assert.equal((await req('/routes/'+route.id+'/halt-evidence?days=5')).status,400);
  assert.equal((await req('/routes/bad/halt-evidence')).status,404);
  assert.equal((await req('/routes/halts-overview',agent)).status,403);
  assert.equal((await req('/schedules/month-insights?month=2026-11',agent)).status,403);
  assert.equal(helpers.median([1,9,3]),3);
  assert.ok(Math.abs(helpers.haversine(0,0,0,0))<0.01);
  assert.equal(helpers.observationFor({source:'demo',provider_verified:true},route,schedules[0],st),null);
  console.log('PASS v36 API: actual booked-seat ratios, all 30/31 days, documented holidays, 9 Nov Govardhan, safe missing-year behavior, city-permission gates, no fake GPS, and 3-trip verified 50m/10m halt thresholds');
 }finally{server.closeAllConnections?.();server.close();db.persistNow();fs.rmSync(process.env.GDS_DATA_DIR,{recursive:true,force:true});}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
