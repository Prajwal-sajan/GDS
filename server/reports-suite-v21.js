'use strict';
const db=require('./db'),U=require('./util'),D=require('./domain'),Rp=require('./reports');
const keys=['staff-duty','point-usage','cancellations','driver-behavior','expenses','metro-bookings','no-shows','van-bookings'];
const num=x=>x===null||x===undefined||x===''?null:Number.isFinite(Number(x))?Number(x):null;
const n=x=>num(x)??0;
const round=(v,d=2)=>Number(n(v).toFixed(d));
const sum=(arr,k)=>arr.reduce((a,x)=>a+n(typeof k==='function'?k(x):x[k]),0);
const unique=a=>[...new Set(a.filter(x=>x!==null&&x!==undefined&&x!==''))];
const arr=x=>Array.isArray(x)?x:[];
const obj=x=>x&&typeof x==='object'?x:{};
const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d))&&!Number.isNaN(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
const err=(status,message)=>{const e=new Error(message);e.status=status;throw e};
const within=(x,from,to)=>x>=from&&x<=to;
const staffInfo=id=>db.col('staff').get(id)||{};
const vehInfo=id=>db.col('vehicles').get(id)||{};
const routeInfo=id=>db.col('routes').get(id)||{};
const scheduled=from=>db.col('schedules').all();
const titleCase=s=>String(s||'').replace(/\b\w/g,c=>c.toUpperCase());
const stage=(r,id)=>arr(r?.stages).find(x=>String(x.id)===String(id))||{};
const stageName=(r,id)=>stage(r,id).name||'—';
const crewOf=(s)=>arr(s?.crew).map(c=>({id:c.staff_id,role:c.role||'',name:staffInfo(c.staff_id).name||'Unassigned',phone:staffInfo(c.staff_id).phone||''}));
const assigned=(s,staffId)=>!staffId||crewOf(s).some(x=>String(x.id)===String(staffId));
const vehi=(s)=>vehInfo(s?.vehicle_id).registration_number||'—';
const routeLabel=r=>r?.id?`${D.cityName(r.origin_city_id)} → ${D.cityName(r.destination_city_id)}`:'—';
const passengerCount=b=>arr(b.passengers).filter(p=>p.status!=='cancelled').length;
const fare=b=>n(b.fare?.total);
function filter(q={}){
 const from=q.from||q.from_date||U.addDays(U.today(),-6),to=q.to||q.to_date||U.today();
 if(!valid(from)||!valid(to)||from>to||U.daysBetween(from,to)>365)err(400,'Choose a valid date range of up to 366 days');
 const bus_id=q.bus_id||q.vehicle_id||null,staff_id=q.staff_id||q.driver_id||null;
 if(bus_id&&!/^\d{1,12}$/.test(String(bus_id)))err(400,'Invalid bus ID');
 if(staff_id&&!/^\d{1,12}$/.test(String(staff_id)))err(400,'Invalid staff ID');
 if(bus_id&&!db.col('vehicles').get(bus_id))err(404,'Bus not found');
 if(staff_id&&!db.col('staff').get(staff_id))err(404,'Staff member not found');
 const mode=['both','pickup','drop'].includes(q.mode)?q.mode:'both';
 return {from,to,bus_id:bus_id?Number(bus_id):null,staff_id:staff_id?Number(staff_id):null,mode};
}
function options(){
 return {buses:db.col('vehicles').filter(x=>x.status!=='deleted').map(x=>({id:x.id,name:x.registration_number})).sort((a,b)=>a.name.localeCompare(b.name)),
 staff:db.col('staff').filter(x=>x.status!=='deleted').map(x=>({id:x.id,name:x.name,phone:x.phone,role:x.role})).sort((a,b)=>a.name.localeCompare(b.name))};
}
function base(key,q){
 const p=filter(q),{from,to,bus_id,staff_id}=p;
 const schedules=db.col('schedules').filter(s=>within(s.travel_date,from,to)&&(!bus_id||Number(s.vehicle_id)===bus_id)&&assigned(s,staff_id));
 const allowed=new Set(schedules.map(s=>String(s.id)));
 const bookings=db.col('bookings').filter(b=>within(b.travel_date,from,to)&&allowed.has(String(b.schedule_id)));
 return {...p,key,schedules,bookings,operator_name:db.meta('operator')?.operator_name||'Operator'};
}
function output(ctx,summary,sections,totals={},note=''){
 const {key,from,to,bus_id,staff_id,mode,operator_name}=ctx;
 return {report:key,from,to,bus_id,staff_id,mode,operator_name,summary,sections,totals,methodology:note};
}
function group(rows,groupKey,create,add){
 const m=new Map();
 for(const row of rows){const k=groupKey(row);if(!m.has(k))m.set(k,create(row));add(m.get(k),row);}
 return [...m.values()];
}
function ownBookings(bs){
 return bs.filter(b=>['website','app','staff','agent','branch','operator','offline','counter'].includes(String(b.source||'').toLowerCase())&&b.status==='confirmed'&&passengerCount(b)>0);
}
function pointUsage(ctx){
 const bookings=ownBookings(ctx.bookings);
 const raw=bookings.map(b=>{
   const route=routeInfo(b.route_id),boarding=stageName(route,b.boarding_stage_id),dropping=stageName(route,b.dropping_stage_id);
   return {boarding,dropping,date:b.travel_date,seats:passengerCount(b),amount:fare(b),pnr:b.pnr};
 });
 const build=(fn,field)=>group(raw,fn,r=>({[field]:fn(r),bookings:0,seats:0,amount:0,_dates:new Set()}),(x,r)=>{x.bookings++;x.seats+=r.seats;x.amount+=r.amount;x._dates.add(r.date);})
 .map(({_dates,...x})=>({...x,days_used:_dates.size,amount:round(x.amount),share_pct:raw.length?round(x.seats/(sum(raw,'seats')||1)*100,1):0}))
 .sort((a,b)=>b.seats-a.seats||b.bookings-a.bookings);
 const boarding=build(r=>r.boarding,'point'),dropping=build(r=>r.dropping,'point');
 const pairs=group(raw,r=>r.boarding+'|'+r.dropping,r=>({boarding:r.boarding,dropping:r.dropping,bookings:0,seats:0,amount:0}),(x,r)=>{x.bookings++;x.seats+=r.seats;x.amount+=r.amount})
 .map(x=>({...x,amount:round(x.amount)})).sort((a,b)=>b.seats-a.seats||b.bookings-a.bookings);
 const summary={bookings:raw.length,seats:sum(raw,'seats'),amount:round(sum(raw,'amount')),boarding_points:boarding.length,dropping_points:dropping.length};
 const totals={boarding:{point:boarding.length+' points',bookings:summary.bookings,seats:summary.seats,amount:summary.amount},
 dropping:{point:dropping.length+' points',bookings:summary.bookings,seats:summary.seats,amount:summary.amount},
 pairs:{boarding:pairs.length+' pairs',bookings:summary.bookings,seats:summary.seats,amount:summary.amount}};
 return output(ctx,summary,{boarding,dropping,pairs},totals,'Own-channel confirmed bookings only. Share = point seats ÷ all eligible seats; days used = distinct travel dates. Rows preserve each source point name without merging aliases.');
}
function resaleIndex(bookings){
 const idx=new Map();
 for(const b of bookings.filter(b=>b.status==='confirmed'||arr(b.passengers).some(p=>p.status!=='cancelled'))){
   for(const p of arr(b.passengers).filter(p=>p.status!=='cancelled')){
     const k=String(b.schedule_id)+'|'+p.seat;
     const a=idx.get(k)||[];
     a.push({at:b.booked_at||'',pnr:b.pnr,seat:p.seat,amount:n(p.fare)||fare(b)/Math.max(1,arr(b.passengers).length)});
     idx.set(k,a);
   }
 }
 for(const a of idx.values())a.sort((x,y)=>x.at.localeCompare(y.at));
 return idx;
}
function resale(index,sid,seat,after,except){
 if(!after)return null;
 return (index.get(String(sid)+'|'+seat)||[]).find(x=>x.at>after&&x.pnr!==except)||null;
}
function cancellation(ctx){
 const idx=resaleIndex(ctx.bookings),out=[];
 for(const b of ctx.bookings){const r=routeInfo(b.route_id);
   for(const c of arr(b.cancellations)){
     const seats=arr(c.seats),resold=seats.map(seat=>resale(idx,b.schedule_id,seat,c.at,b.pnr)).filter(Boolean);
     const originals=arr(b.passengers).filter(p=>seats.includes(p.seat));
     const amount=originals.length?sum(originals,p=>p.fare??fare(b)/Math.max(1,arr(b.passengers).length)):
       fare(b)*seats.length/Math.max(1,arr(b.passengers).length);
     out.push({date:b.travel_date,cancelled_at:c.at||'',service:r.service_number||'',pnr:b.pnr,passenger:b.contact?.name||'',phone:b.contact?.phone||'',
       boarding:stageName(r,b.boarding_stage_id),source:b.source,by:titleCase(c.by),seats:seats.length,
       amount:round(amount),charge:round(c.charge),resold:resold.length,resold_label:resold.length?resold.length+'/'+seats.length:'—',
       recovered:round(sum(resold,'amount')),resale_verified:resold.length>0});
   }
 }
 out.sort((a,b)=>a.date.localeCompare(b.date)||a.pnr.localeCompare(b.pnr));
 const resoldRows=out.filter(x=>x.resold>0);
 const summary={cancellations:out.length,seats:sum(out,'seats'),amount:round(sum(out,'amount')),charges_kept:round(sum(out,'charge')),
 by_operator:out.filter(x=>x.by.toLowerCase()==='operator').length,bookings_resold:resoldRows.length,
 resale_pct:out.length?round(resoldRows.length/out.length*100,1):0,seats_resold:sum(out,'resold'),recovered:round(sum(out,'recovered'))};
 const totals={rows:{date:out.length+' cancellations',seats:summary.seats,amount:summary.amount,charge:summary.charges_kept,
   resold_label:summary.seats_resold+'/'+summary.seats,recovered:summary.recovered}};
 return output(ctx,summary,{rows:out},totals,'Cancelled bookings by travel date. Resold = same seat on same trip booked after cancellation; recovered is the later seat fare. Without later booking evidence, resale is not assumed.');
}
function noShows(ctx){
 const idx=resaleIndex(ctx.bookings),out=[];
 for(const b of ctx.bookings){
   const r=routeInfo(b.route_id),s=db.col('schedules').get(b.schedule_id);
   for(const p of arr(b.passengers).filter(x=>x.status==='no_show')){
     const marked=p.no_show_at||p.status_at||b.no_show_at||null;
     const res=marked?resale(idx,b.schedule_id,p.seat,marked,b.pnr):null;
     out.push({date:b.travel_date,service:r.service_number||'',bus:vehi(s),pnr:b.pnr,passenger:p.name,
       phone:b.contact?.phone||'',boarding:stageName(r,b.boarding_stage_id),source:b.source,seat:p.seat,
       fare:round(p.fare??fare(b)/Math.max(1,arr(b.passengers).length)),resold:res?1:0,
       resold_label:res?'1/1':'—',recovered:res?round(res.amount):0,verified:!!res});
   }
 }
 out.sort((a,b)=>a.date.localeCompare(b.date)||a.pnr.localeCompare(b.pnr));
 const summary={no_shows:out.length,fare:round(sum(out,'fare')),seats_resold:sum(out,'resold'),
 resale_pct:out.length?round(sum(out,'resold')/out.length*100,1):0,recovered:round(sum(out,'recovered'))};
 const totals={rows:{date:out.length+' no-shows',fare:summary.fare,resold_label:summary.seats_resold+' resold',recovered:summary.recovered}};
 return output(ctx,summary,{rows:out},totals,'A no-show is a passenger marked no_show. Resale requires a recorded no-show timestamp and a later sale of the same seat on the same trip; where timing evidence is missing, resale is unknown rather than presumed.');
}
function behavior(ctx){
 const active=ctx.schedules.filter(s=>s.status==='active');
 const recorded=active.filter(s=>s.trip_status!=='running'&&s.trip_status!=='scheduled'&&s.telemetry&&[s.telemetry.driving_score,s.telemetry.hard_brake,s.telemetry.harsh_accel,s.telemetry.over_speed_minutes,s.telemetry.idling_minutes].some(v=>num(v)!==null));
 const out=recorded.map(s=>{
   const t=obj(s.telemetry),r=routeInfo(s.route_id),crew=crewOf(s).filter(c=>/driver/i.test(c.role)),drivers=crew;
   const km=n(s.km??t.km);
   const hard=n(t.hard_brake),harsh=n(t.harsh_accel??t.harsh_acceleration),freerun=n(t.free_run??t.freerun);
   const over=num(t.over_speed_minutes??t.overspeed_minutes??t.over_speed_duration_minutes);
   const idle=num(t.idling_minutes??t.idle_minutes??t.idling_duration_minutes);
   const scoreSource=num(t.driving_score);
   const completePenaltyData=km>0&&[t.hard_brake,t.harsh_accel??t.harsh_acceleration,t.free_run??t.freerun,over,idle].every(v=>num(v)!==null);
   const score=scoreSource??(completePenaltyData?Math.max(0,Math.round(100-5*(hard+harsh+freerun+.5*over/10+.2*idle/10)*100/km)):null);
   return {date:s.travel_date,dep:s.departure_time||r.departure_time||'',service:r.service_number||'',route:routeLabel(r),
   bus:vehi(s),drivers:drivers.map(c=>c.name+(c.phone?' ('+c.phone+')':'' )).join(', ')+(drivers.length>1?' · Shared':''),
   driver_ids:drivers.map(x=>x.id),staff:drivers,km:round(km,1),score,hard_brake:hard,harsh_accel:harsh,
   over_speed:over,over_speed_events:num(t.over_speed),top_speed:num(t.max_speed_kmh),
   idling:idle,idling_events:num(t.idling),freerun,shared:drivers.length>1?1:0};
 });
 const agg=group(out,r=>r.staff.map(c=>c.id).join('|'),r=>({}),()=>{});void agg;
 const m=new Map();
 for(const row of out)for(const st of row.staff){
   const k=String(st.id),x=m.get(k)||{driver:st.name,driver_id:st.id,phone:st.phone,trips:0,shared:0,km:0,
     score_weight:0,score_count:0,hard_brake:0,harsh_accel:0,over_speed:0,idling:0,freerun:0,top_speed:null,buses:new Set(),overspeed_available:0,idle_available:0};
   x.trips++;x.shared+=row.shared;x.km+=row.km;x.hard_brake+=row.hard_brake;x.harsh_accel+=row.harsh_accel;
   if(row.over_speed!==null){x.over_speed+=row.over_speed;x.overspeed_available++;}
   if(row.idling!==null){x.idling+=row.idling;x.idle_available++;}
   x.freerun+=row.freerun;x.top_speed=Math.max(x.top_speed??0,row.top_speed??0);
   if(row.score!==null){x.score_weight+=row.score;x.score_count++;}
   x.buses.add(row.bus);m.set(k,x);
 }
 const drivers=[...m.values()].map(x=>({...x,km:round(x.km,1),score:x.score_count?Math.round(x.score_weight/x.score_count):null,
   over_speed:x.overspeed_available?x.over_speed:null,idling:x.idle_available?x.idling:null,
   buses:[...x.buses].sort().join(', '),top_speed:x.top_speed||null}))
   .sort((a,b)=>(a.score??101)-(b.score??101)||a.driver.localeCompare(b.driver));
 const available=drivers.filter(x=>x.score!==null);
 const summary={trips_recorded:out.length,trips:active.length,drivers:drivers.length,avg_driver_score:available.length?Math.round(sum(available,'score')/available.length):null,
 below_65:available.filter(x=>x.score<65).length,trips_without_driver:active.filter(s=>!crewOf(s).some(c=>/driver/i.test(c.role))).length};
 const totals={drivers:{driver:drivers.length+' drivers',trips:sum(drivers,'trips'),shared:sum(drivers,'shared'),km:round(sum(drivers,'km'),1),
 hard_brake:sum(drivers,'hard_brake'),harsh_accel:sum(drivers,'harsh_accel'),over_speed:sum(drivers,'over_speed'),
 idling:sum(drivers,'idling'),freerun:sum(drivers,'freerun')},
 rows:{date:out.length+' trips',km:round(sum(out,'km'),1),hard_brake:sum(out,'hard_brake'),harsh_accel:sum(out,'harsh_accel'),
 over_speed:sum(out,'over_speed'),idling:sum(out,'idling'),freerun:sum(out,'freerun')}};
 return output(ctx,summary,{drivers,rows:out},totals,'Telemetry only for trips with recorded readings; every assigned driver receives all alerts on shared trips. Score uses recorded provider score when available, else the reference penalty formula. Duration fields are shown only where actual minutes exist; raw event counts are not mislabeled as minutes.');
}
function expenses(ctx){
 const all=ctx.schedules.slice().sort((a,b)=>a.travel_date.localeCompare(b.travel_date)||(a.departure_time||'').localeCompare(b.departure_time||''));
 const rows=[],cmap=new Map();let fixed=0,running=0,channel_commission=0;
 const addItem=(entry,row)=>{
   if(!entry||!Number.isFinite(Number(entry.amount)))return;
   const key=entry.key,label=entry.label,type=entry.type,amount=n(entry.amount);
   row._cats[key]=round(n(row._cats[key])+amount);
   const cat=cmap.get(key)||{key,label,type,amount:0,trips:0};
   cat.amount+=amount;cat.trips++;cmap.set(key,cat);
 };
 for(const s of all){
   const r=routeInfo(s.route_id),on=s.status==='active',p=Rp.tripPnl(s);
   const row={date:s.travel_date,dep:s.departure_time||'',service:r.service_number||'',route:routeLabel(r),
     bus:on?vehi(s):'Turned off',vehicle_id:s.vehicle_id||null,off:!on,trips:on?1:0,_cats:{},total:0};
   for(const it of arr(p.expense_breakdown?.items))addItem({key:(it.key||it.label||'Other').toLowerCase().replace(/\W+/g,'_'),label:it.label||it.key||'Other',type:it.type||'running',amount:it.per_day},row);
   if(on)addItem({key:'channel_commission',label:'Channel commission',type:'running',amount:p.commission},row);
   row.total=round(p.expense);
   rows.push(row);
 }
 const categories=[...cmap.values()].map(x=>({...x,amount:round(x.amount),share_pct:0,avg_per_trip:x.trips?round(x.amount/x.trips):0})).sort((a,b)=>b.amount-a.amount);
 const total=round(sum(rows,'total'));
 categories.forEach(x=>x.share_pct=total?round(x.amount/total*100,1):0);
 categories.forEach(x=>x.type=titleCase(x.type));
 fixed=round(sum(categories.filter(x=>x.type==='Fixed'),'amount'));
 channel_commission=round(categories.find(x=>x.key==='channel_commission')?.amount||0);
 running=round(total-fixed);
 const top=categories.slice(0,8).map(x=>({key:x.key,label:x.label}));const keys=new Set(top.map(x=>x.key));
 for(const row of rows){
   for(const item of top)row[item.key]=round(row._cats[item.key]||0);
   row.other=round(Object.entries(row._cats).filter(([k])=>!keys.has(k)).reduce((x,[,v])=>x+n(v),0));
   delete row._cats;
 }
 const by_bus=group(rows,r=>String(r.vehicle_id||'none'),r=>({bus:r.vehicle_id?vehInfo(r.vehicle_id).registration_number:'Unassigned',trips:0,off:0,total:0,other:0,...Object.fromEntries(top.map(x=>[x.key,0]))}),(x,r)=>{
   x.trips+=r.trips;x.off+=r.off?1:0;x.total+=r.total;x.other+=r.other;for(const col of top)x[col.key]+=n(r[col.key]);
 }).map(x=>({...x,total:round(x.total),other:round(x.other),trips_label:x.trips+(x.off?' (+'+x.off+' off)':'')})).sort((a,b)=>b.total-a.total);
 const summary={total_expense:total,fixed,running,channel_commission,per_trip:sum(rows,'trips')?round(total/sum(rows,'trips')):0,
 trips:sum(rows,'trips'),trips_turned_off:rows.filter(x=>x.off).length,buses:unique(rows.filter(x=>x.trips).map(x=>x.vehicle_id)).length};
 const totals={categories:{label:categories.length+' categories',amount:total,share_pct:100},
 by_bus:{bus:by_bus.length+' buses',trips_label:summary.trips,total,other:round(sum(by_bus,'other'))},
 rows:{date:rows.length+' trips',total,other:round(sum(rows,'other'))}};
 for(const x of top){totals.by_bus[x.key]=round(sum(by_bus,x.key));totals.rows[x.key]=round(sum(rows,x.key));}
 return {...output(ctx,summary,{categories,by_bus,rows},totals,'Trip expense categories follow the GDS trip P&L breakdown including commission; turned-off trips include configured fixed costs only. Category names without records are omitted. Actual diesel telemetry changes P&L only when it is part of the persisted expense breakdown.'),top_categories:top};
}
function staffDuty(ctx){
 const st=ctx.staff_id?staffInfo(ctx.staff_id):null;
 if(!st?.id)return {...output(ctx,{}, {rows:[],daily:[]},{},'Select a driver or staff member to see their statement.'),staff:null};
 const ss=ctx.schedules.filter(s=>assigned(s,ctx.staff_id)),rows=[];
 for(const s of ss){
   const r=routeInfo(s.route_id),driver=crewOf(s).find(c=>String(c.id)===String(ctx.staff_id)),all=crewOf(s);
   const bp=arr(r.stages).find(x=>x.type==='pickup')||{},drop=arr(r.stages).filter(x=>x.type==='drop').at(-1)||{};
   const start=bp.id?s.stop_events?.[bp.id]:null,end=drop.id?s.stop_events?.[drop.id]:null;
   const firstActual=start?.actual_time||start?.time_actual||null,lastActual=end?.actual_time||end?.time_actual||null;
   const pGps=num(s.km),pFuel=num(s.fuel_l);
   const bus_avg=(()=>{const other=db.col('schedules').filter(z=>z.status==='active'&&within(z.travel_date,ctx.from,ctx.to)&&String(z.vehicle_id)===String(s.vehicle_id)&&n(z.km)>0&&n(z.fuel_l)>0);
     return other.length?round(sum(other,'km')/sum(other,'fuel_l')):null;})();
   const efficiency=pGps>0&&pFuel>0?round(pGps/pFuel):null;
   const minutes=x=>{const m=String(x||'').match(/(?:^|T|\s)(\d{1,2}):(\d{2})(?::\d{2})?/);
     return m?(Number(m[1])*60+Number(m[2])):null;};
   const arrival=minutes(firstActual),expected=minutes(bp.time);
   const observedDelay=arrival!==null&&expected!==null?((arrival-expected+720+1440)%1440)-720:null;
   const delay=num(start?.delay_minutes)??observedDelay,late=delay!==null&&delay>=8;
   rows.push({date:s.travel_date,dep:s.departure_time||r.departure_time||'',service:r.service_number||'',route:routeLabel(r),
     bus:vehi(s),status:s.status==='active'?'Worked':'Halt',crew_role:driver?.role||'',
     pickup_scheduled:bp.time||null,pickup_actual:firstActual,drop_scheduled:drop.time||null,drop_actual:lastActual,
     late:delay===null?null:late?1:0,km:pGps,fuel_l:pFuel,kmpl:efficiency,bus_avg_kmpl:bus_avg,
     vs_bus_avg_pct:efficiency!==null&&bus_avg>0?round((efficiency/bus_avg-1)*100,1):null,
     other_crew:all.filter(x=>String(x.id)!==String(st.id)).map(x=>x.name).join(', '),schedule_id:s.id});
 }
 rows.sort((a,b)=>a.date.localeCompare(b.date)||a.dep.localeCompare(b.dep));
 const daily=group(rows,r=>r.date,r=>({date:r.date,trips:0,worked:0,halts:0,status:'',km:0,fuel_l:0}),(x,r)=>{
   x.trips++;if(r.status==='Worked')x.worked++;else x.halts++;
   x.km+=n(r.km);x.fuel_l+=n(r.fuel_l);
 }).map(x=>({...x,status:x.worked?'Worked':'Halt',km:round(x.km,1),fuel_l:round(x.fuel_l,1)}));
 const working=daily.filter(x=>x.worked).length,halts=daily.filter(x=>!x.worked&&x.halts).length;
 const summary={trips:rows.filter(x=>x.status==='Worked').length,working_days:working,halt_days:halts,
 km:round(sum(rows,'km'),1),fuel_l:round(sum(rows,'fuel_l'),1),
 mileage:sum(rows.filter(x=>x.km>0&&x.fuel_l>0),'fuel_l')>0?round(sum(rows.filter(x=>x.km>0&&x.fuel_l>0),'km')/sum(rows.filter(x=>x.km>0&&x.fuel_l>0),'fuel_l')):null,
 late_pickups:rows.filter(x=>x.late===1).length,trips_turned_off:rows.filter(x=>x.status==='Halt').length};
 const totals={rows:{date:rows.length+' assigned',km:summary.km,fuel_l:summary.fuel_l},daily:{date:daily.length+' days',trips:sum(daily,'trips'),km:summary.km,fuel_l:summary.fuel_l}};
 return {...output(ctx,summary,{rows,daily},totals,'Assigned trip = passenger bus service with staff/driver on its crew roster. Halt day only if all assigned trips were off. Actual pickup/drop fields show dash when no timestamp exists. Late at 8+ minutes where measured; bus average uses the selected period.'),staff:{id:st.id,name:st.name,role:st.role,phone:st.phone}};
}
function legType(st){
 const declared=String(st.pickup_type||st.drop_type||st.feeder_type||st.transport_type||'').toLowerCase().trim();
 if(declared)return declared;
 // Explicit imported feeder labels are evidence. A generic Metro Station is not enough.
 const label=String(st.name||'').toLowerCase().replace(/\s+/g,' ');
 if(/\bfree\s+metro\s+(?:pickup|drop)\b|\(\s*metro\s+(?:pickup|drop)\s*\)/i.test(label))return 'metro';
 if(/\(\s*(?:pickup\s+van|van\s+(?:pickup|drop))\s*\)/i.test(label))return 'van';
 return '';
}
function ticketRecord(b,leg){
 const norm=x=>String(x||'').toLowerCase().replace(/[-_ ]/g,'');
 const match=[...db.col('metro_tickets').all(),...db.col('metro_bookings').all()]
 .filter(t=>String(t.pnr)===String(b.pnr)&&[norm(leg),'metro'+norm(leg)].includes(norm(t.leg||t.leg_type)));
 const local=obj(b.metro);
 const val=match.sort((a,b)=>String(b.updated_at||b.created_at||'').localeCompare(String(a.updated_at||a.created_at||'')))[0]||local[leg]||{};
 const present=x=>x===true||x===1||x==='1'||String(x).toLowerCase()==='true';
 const link=!!(val.ticket_link||val.tracking_link||val.ticket_link_sent_at||val.link_sent_at||val.tracking_link_sent_at)||present(val.link_sent);
 const status=String(val.billing_status||val.status||'').trim().toLowerCase();
 const billed=link||['billed','charged','paid','settled','completed'].includes(status);
 const price=num(val.fare??val.ticket_fare??val.metro_fare??val.billed_fare);
 const count=num(val.passenger_count??val.metro_pax??val.pax??val.seats);
 return {fare:billed?price:null,billed,link_sent:link,ticket_issued:!!(val.ticket_no||val.ticket_number),
   pax:billed?(count??arr(b.passengers).length):null,status:billed?(val.status||'Billed'):'Not billed'};
}
function feeder(ctx,type){
 const rows=[];
 for(const b of ctx.bookings){
   const r=routeInfo(b.route_id),s=db.col('schedules').get(b.schedule_id),bs=stage(r,b.boarding_stage_id),ds=stage(r,b.dropping_stage_id);
   const pickTicket=type==='metro'?ticketRecord(b,'pickup'):null;
   const dropTicket=type==='metro'?ticketRecord(b,'drop'):null;
   const pick=legType(bs).includes(type)||!!pickTicket?.billed;
   const drop=legType(ds).includes(type)||!!dropTicket?.billed;
   if(!pick&&!drop)continue;
   // A link-issued Metro ticket stays chargeable even if its booking was later cancelled.
   const confirmed=b.status==='confirmed'&&passengerCount(b)>0;
   if(!confirmed&&!(type==='metro'&&(pickTicket.billed||dropTicket.billed)))continue;
   if(ctx.mode==='pickup'&&!pick||ctx.mode==='drop'&&!drop)continue;
   const legPick=pick&&ctx.mode!=='drop',legDrop=drop&&ctx.mode!=='pickup';
   const billedPick=legPick&&!!pickTicket?.billed,billedDrop=legDrop&&!!dropTicket?.billed;
   const billedLegs=Number(billedPick)+Number(billedDrop);
   const billedPax=(billedPick?num(pickTicket.pax)??0:0)+(billedDrop?num(dropTicket.pax)??0:0);
   const metroFare=(billedPick?num(pickTicket.fare)??0:0)+(billedDrop?num(dropTicket.fare)??0:0);
   const vans=type==='van'?unique([...arr(s?.pickup_van_ids),...arr(s?.feeder_van_ids),...arr(s?.van_ids)]
      .map(id=>vehInfo(id).registration_number||'')):[];
   const seatCount=confirmed?passengerCount(b):arr(b.passengers).length;
   rows.push({date:b.travel_date,service:r.service_number||'',bus:vehi(s),pnr:b.pnr,source:b.source,
     leg:legPick&&legDrop?'Pickup + Drop':legPick?'Pickup':'Drop',pickup:legPick,drop:legDrop,
     boarding:stageName(r,b.boarding_stage_id),dropping:stageName(r,b.dropping_stage_id),
     exchange_point:bs.exchange_point||ds.exchange_point||null,seats:seatCount,
     metro_pax:type==='metro'?(billedLegs?billedPax:null):null,
     metro_fare:type==='metro'?(billedLegs?round(metroFare):null):null,metro_billed:billedLegs>0,
     billed_legs:billedLegs,billing_status:type==='metro'?(billedLegs?'Billed':'Not billed'):'—',
     van:vans.join(', ')||null,amount:fare(b),type:type==='metro'?'Metro':'Van',
     charged_after_cancellation:type==='metro'&&!confirmed&&billedLegs>0});
 }
 rows.sort((a,b)=>a.date.localeCompare(b.date)||a.service.localeCompare(b.service)||a.pnr.localeCompare(b.pnr));
 const picked=rows.filter(x=>x.pickup),dropped=rows.filter(x=>x.drop);
 const byPoint=(items,key)=>group(items,r=>r[key],r=>({point:r[key],pnrs:0,seats:0,revenue:0}),
   (x,r)=>{x.pnrs++;x.seats+=r.seats;x.revenue+=r.amount;}).map(x=>({...x,revenue:round(x.revenue)}))
   .sort((a,b)=>b.seats-a.seats||b.pnrs-a.pnrs);
 const pickup_points=byPoint(picked,'boarding'),drop_points=byPoint(dropped,'dropping');
 const daily=group(rows,r=>r.date,r=>({date:r.date,pnrs:0,seats:0,revenue:0}),
   (x,r)=>{x.pnrs++;x.seats+=r.seats;x.revenue+=r.amount}).map(x=>({...x,revenue:round(x.revenue)})).sort((a,b)=>a.date.localeCompare(b.date));
 const base={seats:sum(rows,'seats'),revenue:round(sum(rows,'amount')),with_pickup:picked.length,
   with_drop:dropped.length,both_legs:rows.filter(x=>x.pickup&&x.drop).length};
 const summary=type==='metro'?{metro_pnrs:rows.length,...base,billed_metro_legs:sum(rows,'billed_legs'),
   metro_pax:sum(rows,'metro_pax'),metro_fare:round(sum(rows,'metro_fare')),
   charged_after_cancellation:rows.filter(x=>x.charged_after_cancellation).length}:
   {van_pnrs:rows.length,...base,vans_used:unique(rows.flatMap(r=>r.van?r.van.split(', '):[])).length,
    pnrs_without_van:rows.filter(r=>!r.van).length};
 const totals={
   pickup_points:{point:pickup_points.length+' points',pnrs:sum(pickup_points,'pnrs'),seats:sum(pickup_points,'seats'),revenue:round(sum(pickup_points,'revenue'))},
   drop_points:{point:drop_points.length+' points',pnrs:sum(drop_points,'pnrs'),seats:sum(drop_points,'seats'),revenue:round(sum(drop_points,'revenue'))},
   daily:{date:daily.length+' days',pnrs:rows.length,seats:base.seats,revenue:base.revenue},
   rows:{date:rows.length+' PNRs',seats:base.seats,metro_pax:sum(rows,'metro_pax'),metro_fare:round(sum(rows,'metro_fare')),amount:base.revenue}};
 return output(ctx,summary,{pickup_points,drop_points,daily,rows},totals,
 type==='metro'?'Metro stages are identified by explicit feeder markers or ticket-billing evidence. Each PNR counts once in Pickup + Drop; billed pickup and drop count as two charged legs. Fare/pax require linked or billed ticket evidence, including cancellations after ticket billing.':'Pickup Van stages require declared feeder type or explicit Pickup Van marker; a PNR counts once for both legs, and only assigned vans are shown.');
}

function compute(key,q={}){
 if(!keys.includes(key))err(404,'Unknown report');
 const ctx=base(key,q);
 return ({
  'staff-duty':staffDuty,'point-usage':pointUsage,'cancellations':cancellation,
  'driver-behavior':behavior,'expenses':expenses,'metro-bookings':c=>feeder(c,'metro'),
  'no-shows':noShows,'van-bookings':c=>feeder(c,'van')
 })[key](ctx);
}
module.exports={keys,filter,options,compute};
