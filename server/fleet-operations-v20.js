'use strict';
// Fleet Operations v20: one deterministic, filterable dataset for screen/print/PDF.
const db=require('./db');
const U=require('./util');
const D=require('./domain');

const datePattern=/^\d{4}-\d{2}-\d{2}$/;
const dayOk=s=>typeof s==='string'&&datePattern.test(s)&&
  Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
const safeNum=n=>n!==null&&n!==undefined&&n!==''&&Number.isFinite(Number(n))?Number(n):null;
const round=(v,n=2)=>Number(Number(v||0).toFixed(n));
const amount=x=>round(x,2);
const sum=(rows,k)=>rows.reduce((a,r)=>a+(Number(r[k])||0),0);
const list=(v)=>Array.isArray(v)?v:[];
const unique=(xs)=>[...new Set(xs.filter(x=>x!==null&&x!==undefined&&x!==''))];
const safeRatio=(km,fuel)=>fuel>0?round(km/fuel,2):null;
const duration=(from,to)=>U.daysBetween(from,to)+1;
const isMain=v=>v?.vehicle_role==='main'||v?.vehicle_role==='main_bus'||v?.vehicle_role==null;
const isTemp=v=>['temporary','attached','leased'].includes(String(v?.ownership_type||'').toLowerCase());
function query(q={}){
 const from=q.from||q.from_date||U.addDays(U.today(),-6),to=q.to||q.to_date||U.today();
 if(!dayOk(from)||!dayOk(to)||from>to||duration(from,to)>366)throw D.httpErr(400,'Choose valid dates (maximum 366 days)');
 const staff_id=q.staff_id||q.driver_id||'',bus_id=q.bus_id||q.vehicle_id||'';
 if((staff_id&&!/^\d{1,12}$/.test(String(staff_id)))||(bus_id&&!/^\d{1,12}$/.test(String(bus_id))))throw D.httpErr(400,'Invalid staff or bus filter');
 if(staff_id&&!db.col('staff').get(staff_id))throw D.httpErr(404,'Staff member not found');
 if(bus_id&&!db.col('vehicles').get(bus_id))throw D.httpErr(404,'Bus not found');
 return {from,to,staff_id:staff_id?Number(staff_id):null,bus_id:bus_id?Number(bus_id):null};
}
function options(){
 return {
  buses:db.col('vehicles').all().filter(v=>v.status!=='deleted')
    .map(v=>({id:v.id,registration_number:v.registration_number,vehicle_role:v.vehicle_role||'main'}))
    .sort((a,b)=>String(a.registration_number).localeCompare(String(b.registration_number))),
  staff:db.col('staff').all()
    .filter(p=>/driver|helper|conductor|crew|attendant/i.test(p.role||''))
    .map(p=>({id:p.id,name:p.name,phone:p.phone||'',role:p.role||''}))
    .sort((a,b)=>String(a.name).localeCompare(String(b.name)))
 };
}
function compute(input={}){
 const q=query(input),{from,to,staff_id,bus_id}=q,days=U.dateRange(from,to);
 const vehicles=db.col('vehicles').all().filter(v=>v.status!=='deleted');
 const vm=new Map(vehicles.map(v=>[Number(v.id),v]));
 const staff=new Map(db.col('staff').all().map(v=>[Number(v.id),v]));
 const routes=new Map(db.col('routes').all().map(v=>[Number(v.id),v]));
 const allSchedules=db.col('schedules').filter(s=>s.travel_date>=from&&s.travel_date<=to);
 const forSelection=s=>(!bus_id||Number(s.vehicle_id)===bus_id)&&
   (!staff_id||list(s.crew).some(c=>Number(c.staff_id)===staff_id));
 const filtered=allSchedules.filter(forSelection);
 const disabled=filtered.filter(s=>s.status!=='active');
 const active=filtered.filter(s=>s.status==='active').sort((a,b)=>a.travel_date.localeCompare(b.travel_date)||
    String(a.departure_time||'').localeCompare(String(b.departure_time||''))||Number(a.id)-Number(b.id));
 const nameForId=id=>staff.get(Number(id))||{};
 const crewInfo=(s,drivers)=>list(s.crew).filter(c=>drivers?/driver/i.test(c.role||''):
   !/driver/i.test(c.role||'')).map(c=>{
     const person=nameForId(c.staff_id);
     return {id:Number(c.staff_id),role:c.role||'',name:person.name||'Unassigned',
       phone:person.phone||''};
   });
 const dieselFor=(s,r)=>{
   // Source precedence: explicit per-trip telemetry/cost, then trip override, then configured route diesel.
   const observed=s.telemetry?.diesel_cost??s.diesel_cost??s.diesel_amount;
   if(safeNum(observed)!==null)return {amount:amount(observed),source:'telemetry'};
   const override=s.expense_overrides||{};
   for(const [k,val] of Object.entries(override))
     if(/^running:diesel(?:$|_)/i.test(k)&&safeNum(val)!==null)return {amount:amount(val),source:'trip override'};
   const routeItem=list(r?.expenses?.running).find(x=>/diesel|fuel/i.test(String(x.key||x.label||'')));
   return {amount:amount(routeItem?.per_day||0),source:routeItem?'route fallback':'unavailable'};
 };
 const rows=active.map(s=>{
   const v=vm.get(Number(s.vehicle_id)),r=routes.get(Number(s.route_id)),drivers=crewInfo(s,true),crew=crewInfo(s,false);
   const km=safeNum(s.km??s.telemetry?.km??s.telemetry?.distance_km);
   const fuel=safeNum(s.fuel_l??s.telemetry?.fuel_l??s.telemetry?.fuel_consumed_l);
   const cost=dieselFor(s,r);
   return {
     schedule_id:s.id,date:s.travel_date,departure_time:s.departure_time||r?.departure_time||'',
     service:r?.service_number||'',route:r?D.cityName(r.origin_city_id)+' → '+D.cityName(r.destination_city_id):'—',
     vehicle_id:s.vehicle_id||null,vehicle:v?.registration_number||'',vehicle_role:v?.vehicle_role||'',
     drivers,crew,km:km??0,km_reported:km!==null&&km>0,
     km_route:round(s.route_distance_km??r?.distance_km??0,1),
     fuel_l:fuel??0,fuel_reported:fuel!==null&&fuel>0,
     kmpl:km>0&&fuel>0?safeRatio(km,fuel):null,
     diesel:cost.amount,diesel_source:cost.source
   };
 });
 // Mileage is calculated only over trips where both GPS km and litres exist.
 const pair=(items)=>{let km=0,fuel=0;for(const r of items)if(r.km_reported&&r.fuel_reported){km+=r.km;fuel+=r.fuel_l;}
   return {km:round(km,2),fuel_l:round(fuel,2),kmpl:safeRatio(km,fuel)};};
 const members=unique(rows.map(x=>x.vehicle_id));
 const allMain=vehicles.filter(isMain);
 const eligible=(v,day,ran)=>!isTemp(v)||ran.has(day+'|'+v.id);
 const usedMain=new Set(rows.filter(r=>isMain(vm.get(Number(r.vehicle_id)))).map(r=>r.date+'|'+r.vehicle_id));
 const fleetForDay=day=>allMain.filter(v=>(!bus_id||Number(v.id)===bus_id)&&eligible(v,day,usedMain));
 const allFleetBusDays=days.reduce((total,day)=>total+fleetForDay(day).length,0);
 const tripsWithMainBus=rows.filter(r=>r.vehicle_id&&isMain(vm.get(Number(r.vehicle_id)))).length;
 const utilization=staff_id?null:allFleetBusDays?round(tripsWithMainBus/allFleetBusDays*100,1):null;
 const busRows=vehicles.filter(v=>!bus_id||Number(v.id)===bus_id).filter(v=>!staff_id||members.includes(v.id))
   .filter(v=>isMain(v)||rows.some(r=>Number(r.vehicle_id)===Number(v.id)));
 const by_bus=busRows.map(v=>{
   const own=rows.filter(r=>Number(r.vehicle_id)===Number(v.id)),ran=unique(own.map(r=>r.date)).length,
     eligibleDays=isMain(v)?days.filter(day=>eligible(v,day,usedMain)).length:ran;
   const p=pair(own),km=sum(own,'km'),fuel=sum(own,'fuel_l');
   return {vehicle_id:v.id,vehicle:v.registration_number,trips:own.length,days_ran:ran,
     days_idle:Math.max(0,eligibleDays-ran),util_pct:staff_id?null:eligibleDays?round(ran/eligibleDays*100,1):null,
     km:round(km,1),km_route:round(sum(own,'km_route'),1),fuel_l:round(fuel,1),
     kmpl:p.kmpl,diesel:round(sum(own,'diesel')),rs_per_km:km>0?round(sum(own,'diesel')/km,2):null,
     drivers:unique(own.flatMap(r=>r.drivers.map(d=>d.name))).sort((a,b)=>a.localeCompare(b)).join(', ')};
 }).sort((a,b)=>a.vehicle.localeCompare(b.vehicle));
 const baseByBus=new Map();
 // Unfiltered trips for each bus in the selected date range provide the benchmark.
 for(const s of allSchedules.filter(s=>s.status==='active')){
   const km=safeNum(s.km??s.telemetry?.km??s.telemetry?.distance_km);
   const f=safeNum(s.fuel_l??s.telemetry?.fuel_l??s.telemetry?.fuel_consumed_l);
   if(!(km>0&&f>0)||!s.vehicle_id)continue;
   const k=Number(s.vehicle_id),base=baseByBus.get(k)||{km:0,fuel:0};
   base.km+=km;base.fuel+=f;baseByBus.set(k,base);
 }
 const busAvg=id=>{const b=baseByBus.get(Number(id));return b?safeRatio(b.km,b.fuel):null;};
 const delta=(actual,base)=>actual!==null&&base!==null&&base>0?round((actual/base-1)*100,1):null;
 const driversData=new Map(),byPair=new Map();
 for(const r of rows)for(const d of r.drivers){
   const id=d.id;
   const a=driversData.get(id)||{driver_id:id,driver:d.name,phone:d.phone,trips:0,dates:new Set(),buses:new Set(),samples:[]};
   a.trips++;a.dates.add(r.date);if(r.vehicle_id)a.buses.add(r.vehicle);a.samples.push(r);driversData.set(id,a);
   const key=id+'|'+r.vehicle_id,x=byPair.get(key)||{driver_id:id,driver:d.name,vehicle:r.vehicle,vehicle_id:r.vehicle_id,trips:0,samples:[]};
   x.trips++;x.samples.push(r);byPair.set(key,x);
 }
 const driverSummary=x=>{
   const p=pair(x.samples);
   // A driver's comparison baseline combines all period trips of the buses they drove.
   const vehicleIds=unique(x.samples.map(r=>r.vehicle_id));
   const base=vehicleIds.reduce((a,id)=>{const item=baseByBus.get(Number(id));if(item){a.km+=item.km;a.fuel+=item.fuel;}return a;},{km:0,fuel:0});
   const avg=base.fuel?safeRatio(base.km,base.fuel):null;
   return {driver_id:x.driver_id,driver:x.driver,phone:x.phone,
     trips:x.trips,days:x.dates.size,km:round(sum(x.samples,'km'),1),
     fuel_l:round(sum(x.samples,'fuel_l'),1),kmpl:p.kmpl,vs_bus_avg_pct:delta(p.kmpl,avg),
     buses:[...x.buses].sort((a,b)=>a.localeCompare(b)).join(', ')};
 };
 const by_driver=[...driversData.values()].map(driverSummary).sort((a,b)=>b.trips-a.trips||a.driver.localeCompare(b.driver));
 const driver_by_bus=[...byPair.values()].map(x=>{
   const p=pair(x.samples),avg=busAvg(x.vehicle_id);
   return {driver_id:x.driver_id,driver:x.driver,vehicle:x.vehicle,vehicle_id:x.vehicle_id,
     trips:x.trips,km:round(sum(x.samples,'km'),1),fuel_l:round(sum(x.samples,'fuel_l'),1),
     kmpl:p.kmpl,bus_avg_kmpl:avg,vs_bus_avg_pct:delta(p.kmpl,avg)};
 }).sort((a,b)=>a.driver.localeCompare(b.driver)||a.vehicle.localeCompare(b.vehicle));
 const daily=days.map(day=>{
   const a=rows.filter(r=>r.date===day),turned=disabled.filter(s=>s.travel_date===day);
   const fleet=fleetForDay(day).length,usedSet=new Set(a.filter(r=>r.vehicle_id&&isMain(vm.get(Number(r.vehicle_id)))).map(r=>r.vehicle_id)),
     idle= fleetForDay(day).filter(v=>!usedSet.has(v.id)).map(v=>v.registration_number);
   const p=pair(a);
   return {date:day,fleet,used:usedSet.size,trips:a.length,util_pct:staff_id?null:fleet?round(a.filter(r=>r.vehicle_id&&isMain(vm.get(Number(r.vehicle_id)))).length/fleet*100,1):null,
     no_bus:a.filter(r=>!r.vehicle_id||!r.vehicle).length,turned_off:turned.length,
     km:round(sum(a,'km'),1),fuel_l:round(sum(a,'fuel_l'),1),kmpl:p.kmpl,
     diesel:amount(sum(a,'diesel')),idle_buses:idle.join(', '),idle_count:idle.length};
 });
 const p=pair(rows),diesel=amount(sum(rows,'diesel'));
 const summary={
   fleet_util_pct:utilization,trips:rows.length,buses:members.filter(id=>!!vm.get(Number(id))).length,
   drivers:driversData.size,km:round(sum(rows,'km'),1),fuel_l:round(sum(rows,'fuel_l'),1),kmpl:p.kmpl,
   diesel,idle_bus_days:daily.reduce((a,d)=>a+d.idle_count,0),
   trips_without_bus:rows.filter(r=>!r.vehicle_id||!r.vehicle).length,
   trips_turned_off:disabled.length,trips_without_driver:rows.filter(r=>!r.drivers.length).length,
   fleet_bus_days:allFleetBusDays,all_buses:by_bus.length,
   diesel_route_fallback_trips:rows.filter(r=>r.diesel_source==='route fallback').length,
   gps_fuel_paired_trips:rows.filter(r=>r.km_reported&&r.fuel_reported).length
 };
 const totals={
   by_bus:{vehicle:by_bus.length+' buses',trips:sum(by_bus,'trips'),days_ran:sum(by_bus,'days_ran'),
     days_idle:sum(by_bus,'days_idle'),util_pct:utilization,
     km:round(sum(by_bus,'km'),1),km_route:round(sum(by_bus,'km_route'),1),
     fuel_l:round(sum(by_bus,'fuel_l'),1),kmpl:p.kmpl,diesel,rs_per_km:summary.km?round(diesel/summary.km,2):null},
   by_driver:{driver:by_driver.length+' drivers',trips:sum(by_driver,'trips'),days:sum(by_driver,'days'),
     km:round(sum(by_driver,'km'),1),fuel_l:round(sum(by_driver,'fuel_l'),1),
     kmpl:safeRatio(sum(by_driver,'km'),sum(by_driver,'fuel_l'))},
   driver_by_bus:{driver:'Total',trips:sum(driver_by_bus,'trips'),
     km:round(sum(driver_by_bus,'km'),1),fuel_l:round(sum(driver_by_bus,'fuel_l'),1)},
   daily:{date:days.length+' days',fleet:allFleetBusDays+' bus-days',
     used:sum(daily,'used'),trips:sum(daily,'trips'),util_pct:utilization,
     no_bus:sum(daily,'no_bus'),turned_off:sum(daily,'turned_off'),
     km:summary.km,fuel_l:summary.fuel_l,kmpl:summary.kmpl,diesel,
     idle_buses:summary.idle_bus_days+' idle bus-days'},
   rows:{date:rows.length+' trips',drivers:summary.trips_without_driver+' without driver',
     km:summary.km,fuel_l:summary.fuel_l,kmpl:summary.kmpl,diesel}
 };
 const operator=db.meta('operator')||{};
 return {report:'fleet-operations',from,to,staff_id,bus_id,operator_name:operator.operator_name||'Operator',
   summary,by_bus,by_driver,driver_by_bus,daily,rows,totals,
   methodology:{
     fleet_util:'Trips ÷ eligible main-bus days; temporary buses count only on days operated',
     measurements:'Km / fuel use recorded trip readings; km/L uses only trips with both measurements',
     driver:'Both drivers receive full trip credit; driver totals can exceed fleet totals',
     diesel:'Reported diesel cost, then trip override; otherwise configured route diesel estimate',
     caveat:'GPS readings are unverified unless connected to a real tracking provider'
   }};
}
module.exports={query,options,compute};
