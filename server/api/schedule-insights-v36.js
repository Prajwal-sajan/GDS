'use strict';
/* v36 schedule search/monthly occupancy and GPS-provenance halt reporting.
 * No synthetic GPS corrections; screenshot figures must never be seeded into analytics.
 * 2026 holidays are date-bounded, sourced calendar entries, not an auto-updating
 * government calendar or an assertion of state-specific office closure. */
const express=require('express');
const db=require('../db'),D=require('../domain'),U=require('../util'),Auth=require('../auth');
const router=express.Router();
const err=(message,status=400)=>{const e=new Error(message);e.status=status;return e;};
const handler=fn=>async(req,res)=>{
 try{res.set('Cache-Control','private, no-store');res.set('Vary','Authorization');
  res.json(await fn(req,res));
 }catch(e){res.status(e.status||500).json({success:false,message:e.status?e.message:'Unable to load service insights'});}
};
const MONTH_RE=/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/;
function daysInMonth(month){const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m,0)).getUTCDate();}
function monthEnd(month){return month+'-'+String(daysInMonth(month)).padStart(2,'0');}
function dateEntries(year){
 if(year!==2026)return [];
 const GOV='https://cgca.gov.in/ccadl/list-of-holiday';
 const RESTRICTED='https://cdaguwahati.gov.in/pages/restrictedholidays2026.aspx';
 const SOURCE_AP='https://www.cgca.gov.in/ccaap/list-of-holiday';
 const list=[
  ['01-01','New Year’s Day','restricted',RESTRICTED],
  ['01-26','Republic Day','gazetted',GOV],
  ['03-04','Holi','gazetted',GOV],
  ['03-21','Id-ul-Fitr','gazetted',GOV],
  ['03-26','Ram Navami','gazetted',GOV],
  ['03-31','Mahavir Jayanti','gazetted',GOV],
  ['04-03','Good Friday','gazetted',GOV],
  ['05-01','Buddha Purnima','gazetted',GOV],
  ['05-27','Id-ul-Zuha (Bakrid)','gazetted',GOV],
  ['06-26','Muharram','gazetted',GOV],
  ['08-15','Independence Day','gazetted',GOV],
  ['08-26','Milad-un-Nabi','gazetted',GOV],
  ['09-04','Janmashtami','gazetted',GOV],
  ['10-02','Gandhi Jayanti','gazetted',GOV],
  ['10-20','Dussehra','gazetted',GOV],
  ['11-01','Andhra Pradesh Formation Day','observance',SOURCE_AP],
  ['11-08','Diwali','gazetted',GOV],
  ['11-09','Govardhan Puja','restricted',RESTRICTED],
  ['11-14','Children’s Day','observance','https://dpl.rashtrapatibhavan.gov.in/public/'],
  ['11-24','Guru Nanak Jayanti','gazetted',GOV],
  ['12-25','Christmas Day','gazetted',GOV]
 ];
 return list.map(([day,name,kind,source_url])=>({date:year+'-'+day,name,kind,source_url}));
}
function holidayMonth(month){
 const year=Number(month.slice(0,4));return dateEntries(year).filter(x=>x.date.startsWith(month));
}
router.get('/schedules/month-insights',Auth.can('schedules.view'),handler(req=>{
 const month=String(req.query.month||'');
 if(!MONTH_RE.test(month))throw err('Use a valid month in YYYY-MM format');
 const from=month+'-01',to=monthEnd(month);
 D.ensureSchedules(from,to);
 const byDay=new Map(),dates=daysInMonth(month);
 for(let i=1;i<=dates;i++){
  const date=month+'-'+String(i).padStart(2,'0');
  byDay.set(date,{date,booked_seats:0,capacity:0,services:0,percent:null});
 }
 const bookings=db.col('bookings');
 for(const schedule of db.col('schedules').all()){
  if(schedule.travel_date<from||schedule.travel_date>to||schedule.status==='inactive')continue;
  const route=db.col('routes').get(schedule.route_id);
  if(!route)continue;
  const coach=D.coachForSchedule(schedule);
  const capacity=Number(coach?.layout?.capacity)||0;
  if(capacity<=0)continue;
  const day=byDay.get(schedule.travel_date);
  if(!day)continue;
  const paid=bookings.filter(b=>String(b.schedule_id)===String(schedule.id)&&
   !['cancelled','released','expired','hold'].includes(b.status));
  let count=0;
  for(const b of paid)for(const p of b.passengers||[])if(
    !['cancelled','no_show'].includes(p.status))count++;
  day.services++;day.capacity+=capacity;day.booked_seats+=Math.min(capacity,count);
 }
 for(const day of byDay.values())if(day.capacity>0)
  day.percent=Math.round(Math.min(100,day.booked_seats/day.capacity*100));
 const holidayCatalogAvailable=Number(month.slice(0,4))===2026;
 return {month,timezone:'Asia/Kolkata',metric:'booked_seats / available_scheduled_capacity',
  daily:[...byDay.values()],holidays:holidayMonth(month),holiday_catalog_year:2026,
  holidays_verified_for_year:holidayCatalogAvailable,
  holiday_disclaimer:holidayCatalogAvailable?
  'Central government gazetted/restricted dates and selected observances for 2026. State-specific closures vary; observances are not statutory holidays.':
  'Verified government-holiday catalog is not available for this year. No events are inferred.'};
}));
function haversine(a,b,c,d){
 const R=6371000,rad=Math.PI/180,dy=(c-a)*rad,dx=(d-b)*rad;
 const t=Math.sin(dy/2)**2+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin(dx/2)**2;
 return 2*R*Math.asin(Math.min(1,Math.sqrt(t)));
}
function median(input){
 const s=input.filter(Number.isFinite).sort((a,b)=>a-b);
 if(!s.length)return null;
 const n=s.length;return n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2;
}
function dateValid(str){return /^\d{4}-\d{2}-\d{2}$/.test(str)&&Number.isFinite(Date.parse(str+'T00:00:00Z'));}
function clockTime(str){
 const m=/^([01]\d|2[0-3]):([0-5]\d)/.exec(String(str||''));
 return m?Number(m[1])*60+Number(m[2]):null;
}
function observationFor(record,route,schedule,stage){
 if(!record||record.provider_verified!==true||record.source!=='gps_provider'||record.kind!=='halt')return null;
 if(String(record.route_id)!==String(route.id)||String(record.schedule_id)!==String(schedule.id)||
  String(record.stage_id)!==String(stage.id))return null;
 const at=Date.parse(record.observed_at),base=Date.parse(schedule.travel_date+'T00:00:00+05:30');
 const minutes=clockTime(stage.time),day=Math.round(Number(stage.day)||1);
 if(!Number.isFinite(at)||!Number.isFinite(base)||minutes===null||day<1||day>5)return null;
 const expected=base+((day-1)*1440+minutes)*60000;
 const delta=(at-expected)/60000;
 if(!Number.isFinite(delta)||Math.abs(delta)>720)return null;
 const lat=Number(record.lat),lng=Number(record.lng),plat=Number(stage.lat),plng=Number(stage.lng);
 const hasPin=stage.lat!=null&&stage.lng!=null&&Number.isFinite(plat)&&Number.isFinite(plng)&&Math.abs(plat)<=90&&Math.abs(plng)<=180;
 if(record.lat==null||record.lng==null||!Number.isFinite(lat)||!Number.isFinite(lng)||
   Math.abs(lat)>90||Math.abs(lng)>180)return null;
 const accuracy=Number(record.accuracy_m);
 if(!Number.isFinite(accuracy)||accuracy<=0||accuracy>100)return null;
 const dwell=Number(record.dwell_seconds);
 if(!Number.isFinite(dwell)||dwell<45)return null;
 return {delta_min:delta,offset_m:hasPin?haversine(plat,plng,lat,lng):null,
  observed_at:record.observed_at,schedule_id:String(schedule.id),has_pin:hasPin,
  accuracy_m:accuracy};
}
function routeSummary(route,schedules,observations,days){
 const eligible=schedules.filter(s=>String(s.route_id)===String(route.id)&&
  s.trip_status==='completed'&&s.travel_date>=U.addDays(U.today(),-(days-1))&&s.travel_date<=U.today());
 const map=new Map(eligible.map(s=>[String(s.id),s]));
 const evidence=new Map();
 const allStages=(route.stages||[]).filter(st=>st.type==='pickup'||st.type==='drop');
 for(const stage of allStages)evidence.set(String(stage.id),new Map());
 for(const raw of observations){
  const s=map.get(String(raw.schedule_id)),st=allStages.find(x=>String(x.id)===String(raw.stage_id));
  if(!s||!st)continue;
  const o=observationFor(raw,route,s,st);if(!o)continue;
  const table=evidence.get(String(st.id));
  const prev=table.get(String(s.id));
  if(!prev||Math.abs(o.delta_min)<Math.abs(prev.delta_min))table.set(String(s.id),o);
 }
 const allTripIds=new Set(),stats={pins_to_move:0,times_to_change:0,fine:0,waiting:0};
 const stops=allStages.map(st=>{
  const observed=[...evidence.get(String(st.id)).values()];
  observed.forEach(x=>allTripIds.add(x.schedule_id));
  const medPin=median(observed.map(o=>o.offset_m)),medTime=median(observed.map(o=>o.delta_min));
  const enough=observed.length>=3;
  const pin=enough&&medPin!==null&&medPin>50;
  const time=enough&&medTime!==null&&Math.abs(medTime)>10;
  if(!enough)stats.waiting++;
  else{if(pin)stats.pins_to_move++;if(time)stats.times_to_change++;if(!pin&&!time)stats.fine++;}
  return {stage_id:st.id,name:st.name,kind:st.type,observed_trips:observed.length,
   median_offset_m:enough&&medPin!==null?Math.round(medPin):null,
   median_time_delta_min:enough&&medTime!==null?Math.round(medTime):null,
   status:!enough?'waiting':pin&&time?'pin_and_time':pin?'move_pin':time?'change_time':'fine'};
 });
 const dates=eligible.filter(s=>allTripIds.has(String(s.id))).map(s=>s.travel_date).sort();
 return {id:route.id,service_number:route.service_number,
  origin:D.cityName(route.origin_city_id),destination:D.cityName(route.destination_city_id),
  trips:allTripIds.size,from_date:dates[0]||null,to_date:dates.at(-1)||null,
  stop_count:stops.length,...stats,stops,provider_evidence:allTripIds.size>0,
  data_status:allTripIds.size?'gps_evidence':'awaiting_verified_gps'};
}
const ALLOWED=new Set([7,15,30]);
router.get('/routes/halts-overview',Auth.can('routes.view'),handler(req=>{
 const days=Number(req.query.days||15);
 if(!ALLOWED.has(days))throw err('Choose 7, 15 or 30 days');
 const routes=db.col('routes').filter(r=>r.status==='active');
 const schedules=db.col('schedules').all();
 // The simulation-only /routes/:id/halts endpoint is deliberately not used.
 // This collection must be filled by an authorized GPS provider adapter.
 const observations=db.col('gps_halt_observations').all();
 const rows=routes.map(r=>routeSummary(r,schedules,observations,days));
 const totals={trips:rows.reduce((n,r)=>n+r.trips,0),
  pins_to_move:rows.reduce((n,r)=>n+r.pins_to_move,0),
  times_to_change:rows.reduce((n,r)=>n+r.times_to_change,0),
  fine:rows.reduce((n,r)=>n+r.fine,0),waiting:rows.reduce((n,r)=>n+r.waiting,0)};
 return {days,minimum_agreeing_trips:3,pin_threshold_m:50,time_threshold_minutes:10,
  routes:rows,totals,data_status:rows.some(r=>r.provider_evidence)?'partial_or_verified':'awaiting_verified_gps',
  disclosure:'Only completed trips with provider-verified halt events and acceptable location accuracy count as GPS evidence. Demo/synthetic positions and manually recorded stop events are excluded. Counts for pin and time corrections may overlap.'};
}));
router.get('/routes/:id/halt-evidence',Auth.can('routes.view'),handler(req=>{
 const route=db.col('routes').get(req.params.id);if(!route)throw err('Route not found',404);
 const days=Number(req.query.days||15);if(!ALLOWED.has(days))throw err('Choose 7, 15 or 30 days');
 return {days,...routeSummary(route,db.col('schedules').all(),db.col('gps_halt_observations').all(),days)};
}));
module.exports=router;
module.exports.__test={dateEntries,holidayMonth,haversine,median,observationFor,routeSummary};
