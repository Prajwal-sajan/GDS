'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.GDS_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'reports-v23-'));
const db=require('../server/db'),U=require('../server/util');
require('../server/seed').seed();
const V21=require('../server/reports-suite-v21'),V22=require('../server/reports-performance-v22'),
Fleet=require('../server/fleet-operations-v20'),Pnl=require('../server/reports'),PDF=require('../server/report-suite-pdf-v21');
require('../public/js/report-suite-specs-v22');
const to=U.addDays(U.today(),-2),from=U.addDays(to,-6),range={from,to};
const near=(x,y,label)=>assert.ok(Math.abs(x-y)<.05,label+': '+x+' vs '+y);
try{
 const keys=['fleet-operations',...V21.keys,...V22.KEYS];
 assert.equal(keys.length,13);assert.equal(new Set(keys).size,13);
 assert.ok(Fleet.compute(range).summary.trips>=0);
 for(const key of V21.keys){
   const result=V21.compute(key,range);
   assert.ok(result.sections&&result.summary&&result.totals,'v21 report '+key);
   if(key!=='staff-duty')assert.ok(PDF.generate(key,result).subarray(0,8).toString().startsWith('%PDF'));
 }
 for(const key of V22.KEYS){
   const result=V22.compute(key,range);
   assert.ok(result.sections&&result.summary&&result.totals,'v22 report '+key);
   if(key!=='point-performance')assert.ok(PDF.generate(key,result).subarray(0,8).toString().startsWith('%PDF'));
 }
 const run=db.col('schedules').find(s=>s.status==='active'&&s.travel_date>=from&&s.travel_date<=to&&s.crew?.some(c=>/driver/i.test(c.role)));
 assert.ok(run);
 const route=db.col('routes').get(run.route_id),driver=run.crew.find(c=>/driver/i.test(c.role));
 const old=Pnl.tripPnl(run),line=old.expense_breakdown.items.find(x=>x.type==='running'&&/diesel|fuel/i.test(x.key||x.label||''));
 assert.ok(line);
 run.trip_status='completed';
 run.telemetry={...run.telemetry,diesel_cost:7777,idling_minutes:135,over_speed_minutes:7,max_speed_kmh:98,driving_score:93};
 const now=Pnl.tripPnl(run);
 near(now.expense,old.expense-line.per_day+7777,'Completed-trip diesel');
 assert.equal(now.expense_breakdown.items.find(x=>x.telemetry_diesel)?.source,'Intangles telematics');
 near(V21.compute('expenses',range).summary.total_expense,V22.compute('trip-pnl',range).summary.expense,'Shared expense');
 const fleet=Fleet.compute(range),category=V21.compute('expenses',range).sections.categories;
 near(fleet.summary.diesel,category.filter(x=>/diesel|fuel/i.test(x.label)).reduce((v,x)=>v+x.amount,0),'Fleet/Expense diesel');
 const oldOv=run.expense_overrides||{};
 run.expense_overrides={...oldOv,[line.edit_key]:8888};
 assert.equal(Pnl.tripPnl(run).expense_breakdown.items.find(x=>x.edit_key===line.edit_key).per_day,8888,'Operator override precedence');
 run.expense_overrides=oldOv;
 const scored=V21.compute('driver-behavior',range);
 const lineDriver=scored.sections.rows.find(x=>x.service===route.service_number&&x.date===run.travel_date);
 assert.equal(lineDriver.idling,135);assert.equal(lineDriver.top_speed,98);
 const driverPdf=PDF.generate('driver-behavior',scored).toString('latin1');
 assert.ok(driverPdf.includes('2h 15m')&&driverPdf.includes('98 km/h'),'Report PDF units');
 const savedTelemetry=run.telemetry;
 run.telemetry={over_speed:5,idling:9,hard_brake:2};
 const unscored=V21.compute('driver-behavior',range).sections.rows.find(x=>x.service===route.service_number&&x.date===run.travel_date);
 assert.equal(unscored.score,null);assert.equal(unscored.idling,null);assert.equal(unscored.over_speed,null);
 run.telemetry=savedTelemetry;
 const stop=route.stages.find(x=>x.type==='pickup'),local=U.toMin(stop.time)+11;
 run.stop_events={...(run.stop_events||{}),[stop.id]:{actual_time:U.fromMin(local)}};
 const staff=V21.compute('staff-duty',{...range,staff_id:driver.staff_id});
 assert.equal(staff.sections.rows.find(x=>x.schedule_id===run.id)?.late,1);
 assert.equal(U.clockDifference('2026-11-14T12:11:00Z','17:30'),11,'UTC converted to India local clock');
 const metroBooking=db.col('bookings').find(b=>b.status==='confirmed'&&b.travel_date>=from&&b.travel_date<=to&&/free\s*metro\s*pickup/i.test(
  db.col('routes').get(b.route_id)?.stages.find(x=>x.id===b.boarding_stage_id)?.name||''));
 assert.ok(metroBooking,'Metro fixture');
 const stage=db.col('routes').get(metroBooking.route_id).stages.find(x=>x.id===metroBooking.boarding_stage_id);
 stage.feeder_type='';stage.pickup_type='';stage.transport_type='';
 const t=db.col('metro_tickets').insert({pnr:metroBooking.pnr,leg:'pickup',ticket_no:'M-123',fare:55,link_sent:true,passenger_count:2,status:'Billed'});
 let result=V21.compute('metro-bookings',{...range,mode:'pickup'});
 const ticket=result.sections.rows.find(x=>x.pnr===metroBooking.pnr);
 assert.ok(ticket);assert.equal(ticket.metro_fare,55);assert.equal(ticket.metro_pax,2);
 assert.equal(ticket.billed_legs,1);
 const previous=metroBooking.status;metroBooking.status='cancelled';
 assert.ok(V21.compute('metro-bookings',{...range,mode:'pickup'}).sections.rows.some(x=>x.pnr===metroBooking.pnr&&x.charged_after_cancellation));
 metroBooking.status=previous;
 t.link_sent=false;t.status='Not billed';t.ticket_link='https://unsent.example.com/unused-link';
 const unbilled=V21.compute('metro-bookings',{...range,mode:'pickup'}).sections.rows.find(x=>x.pnr===metroBooking.pnr);
 assert.equal(unbilled.metro_fare,null);assert.equal(unbilled.billing_status,'Not billed','An unsent link URL is not a billed leg');
 // Distinct pickup and drop Metro tickets are charged as two legs, never two PNRs.
 t.link_sent=true;t.status='Billed';t.ticket_link='';
 const metroRoute=db.col('routes').get(metroBooking.route_id);
 const metroDrop=metroRoute.stages.find(x=>x.id===metroBooking.dropping_stage_id);
 const oldDropType=metroDrop.feeder_type;
 metroDrop.feeder_type='metro';
 db.col('metro_tickets').insert({pnr:metroBooking.pnr,leg:'drop',ticket_no:'M-124',fare:75,link_sent:true,passenger_count:2,status:'Billed'});
 const both=V21.compute('metro-bookings',{...range,mode:'both'}).sections.rows.find(x=>x.pnr===metroBooking.pnr);
 assert.equal(both.billed_legs,2);assert.equal(both.metro_fare,130,'Billed pickup + drop fares sum');
 metroDrop.feeder_type=oldDropType;
 // Same-seat resale requires the later booking timestamp, same run and same seat.
 const cancelled=db.col('bookings').find(x=>x.travel_date>=from&&x.travel_date<=to&&x.cancellations?.some(c=>c.seats?.length&&c.at));
 assert.ok(cancelled,'Cancelled booking fixture');
 const event=cancelled.cancellations.find(c=>c.seats?.length&&c.at);
 const oldSeat=cancelled.passengers.find(p=>event.seats.includes(p.seat));
 const {id:ignored,...cancelSource}=cancelled;
 db.col('bookings').insert({...cancelSource,pnr:'QA-RESOLD-13',status:'confirmed',
   cancellations:[],booked_at:new Date(new Date(event.at).getTime()+3600000).toISOString(),
   passengers:[{...oldSeat,status:'confirmed',fare:999}]});
 const resaleRow=V21.compute('cancellations',range).sections.rows.find(x=>x.pnr===cancelled.pnr&&x.cancelled_at===event.at);
 assert.ok(resaleRow?.resold>=1&&resaleRow.recovered>=999,'Cancellation after-event seat resale');
 // Exact explicit van marker is valid feeder evidence; do not invent an assignment.
 const stagePick=route.stages.find(x=>x.type==='pickup'&&!/metro/i.test(x.name||''));
 if(stagePick){
   const saved={name:stagePick.name,feeder_type:stagePick.feeder_type,pickup_type:stagePick.pickup_type,transport_type:stagePick.transport_type};
   stagePick.name=(stagePick.name||'Pickup')+' (Pickup Van)';stagePick.feeder_type='';stagePick.pickup_type='';stagePick.transport_type='';
   const v=V21.compute('van-bookings',range);
   assert.ok(v.sections.rows.some(x=>x.boarding===stagePick.name),'Explicit Pickup Van marker detected');
   Object.assign(stagePick,saved);
 }
 for(const key of ['cancellations','no-shows']){
  const x=V21.compute(key,range);
  near(x.summary[key==='no-shows'?'fare':'amount'],x.sections.rows.reduce((v,r)=>v+r[key==='no-shows'?'fare':'amount'],0),key+' reconciliation');
 }
 const usage=V21.compute('point-usage',range);
 near(usage.summary.seats,usage.sections.pairs.reduce((v,x)=>v+x.seats,0),'All point pairs');
 const station=V22.compute('station-performance',range);
 for(const key of ['pairs','boarding','dropping','by_schedule','sources','daily'])
  near(station.summary.seats,station.sections[key].reduce((v,x)=>v+x.seats,0),'Station '+key);
 const frequent=V22.compute('frequent-travellers',{...range,min_trips:1,top:'all'});
 near(frequent.summary.total_trips,frequent.sections.bands.reduce((v,x)=>v+x.trips_taken,0),'Complete trip distribution');
 assert.equal(V21.compute('van-bookings',range).sections.rows.length,0,'No fabricated van bookings');
 console.log('PASS all 13 engines, source-backed totals, UTC stop times, diesel source parity, driver scoring/units, Metro billing and cancellation');
}finally{
 fs.rmSync(process.env.GDS_DATA_DIR,{recursive:true,force:true});
}
