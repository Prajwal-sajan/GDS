'use strict';
const db=require('./db'),U=require('./util'),D=require('./domain'),Rp=require('./reports');
const KEYS=['frequent-travellers','point-performance','station-performance','trip-pnl'];
const num=x=>x===null||x===undefined||x===''?null:Number.isFinite(Number(x))?Number(x):null;
const n=x=>num(x)??0,round=x=>U.round2(x),arr=x=>Array.isArray(x)?x:[],sum=(a,fn)=>a.reduce((s,x)=>s+n(typeof fn==='function'?fn(x):x[fn]),0);
const unique=a=>[...new Set(a.filter(x=>x!==null&&x!==undefined&&x!=='').map(String))];
const eq=(a,b)=>String(a)===String(b);
const err=(status,message)=>{const e=new Error(message);e.status=status;throw e};
const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d))&&!Number.isNaN(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
const stage=(r,id)=>arr(r?.stages).find(x=>eq(x.id,id))||{};
const stageName=(r,id)=>stage(r,id).name||'Unknown';
const route=id=>db.col('routes').get(id)||{};
const vehicle=s=>db.col('vehicles').get(s?.vehicle_id)?.registration_number||null;
const city=id=>D.cityName(id)||'Unknown';
const seats=b=>arr(b.passengers).filter(x=>x.status!=='cancelled').length;
const live=b=>b.status==='confirmed'&&seats(b)>0;
const money=b=>{
 const fare=n(b.fare?.total),p=arr(b.passengers),denom=sum(p,x=>x.fare);
 return round(denom>0?fare*sum(p.filter(x=>x.status!=='cancelled'),x=>x.fare)/denom:fare*seats(b)/Math.max(p.length,1));
};
const group=(items,key,newRow,apply)=>{
 const m=new Map();
 for(const r of items){const k=key(r);if(!m.has(k))m.set(k,newRow(r));apply(m.get(k),r);}
 return [...m.values()];
};
const norm=s=>String(s||'').toLocaleLowerCase('en-IN').replace(/\s+/g,'').trim();
const dateOrder=(a,b)=>(a.date||'').localeCompare(b.date||'');
function params(key,q={}){
 if(!KEYS.includes(key))err(404,'Unknown performance report');
 const to=q.to||q.to_date||U.today(),from=q.from||q.from_date|| (key==='frequent-travellers'?U.addDays(to,-365):U.addDays(to,-6));
 if(!valid(from)||!valid(to)||from>to||U.daysBetween(from,to)>1120)err(400,'Choose a valid date range up to 3 years');
 const id=(name)=>{if(q[name]===undefined||q[name]==='')return null;
   if(!/^\d{1,10}$/.test(String(q[name])))err(400,'Invalid '+name);
   const table=name==='bus_id'?'vehicles':name==='staff_id'?'staff':'routes';
   if(!db.col(table).get(q[name]))err(404,name+' not found');
   return Number(q[name]);
 };
 const bus_id=id('bus_id'),staff_id=id('staff_id'),schedule_id=id('schedule_id');
 const mode=q.mode==='drop'?'drop':'pickup',selected_point=String(q.point||'').trim().slice(0,200);
 const min_trips=q.min_trips===undefined?2:Number(q.min_trips);
 const max_trips=q.max_trips===''||q.max_trips===undefined||q.max_trips==='any'?null:Number(q.max_trips);
 if(!Number.isInteger(min_trips)||min_trips<1||min_trips>10000)err(400,'Minimum trips must be at least 1');
 if(max_trips!==null&&(!Number.isInteger(max_trips)||max_trips<min_trips||max_trips>10000))err(400,'Invalid maximum trips');
 const sort=['trips','spend','recent'].includes(q.sort)?q.sort:'trips';
 const top=['50','100','500','1000','all'].includes(String(q.top))?String(q.top):'100';
 return {key,from,to,bus_id,staff_id,schedule_id,mode,selected_point,min_trips,max_trips,sort,top,search:String(q.search||'').trim().slice(0,100)};
}
function context(key,q){
 const p=params(key,q);
 let schedules=db.col('schedules').filter(s=>s.travel_date>=p.from&&s.travel_date<=p.to);
 if(p.bus_id)schedules=schedules.filter(s=>eq(s.vehicle_id,p.bus_id));
 if(p.schedule_id)schedules=schedules.filter(s=>eq(s.route_id,p.schedule_id));
 if(p.staff_id)schedules=schedules.filter(s=>arr(s.crew).some(c=>eq(c.staff_id,p.staff_id)));
 const ids=new Set(schedules.map(s=>String(s.id)));
 const bookings=db.col('bookings').filter(b=>b.travel_date>=p.from&&b.travel_date<=p.to&&ids.has(String(b.schedule_id)));
 const scheduledById=new Map(schedules.map(s=>[String(s.id),s]));
 return {...p,schedules,bookings,scheduledById,operator_name:db.meta('operator')?.operator_name||'Operator'};
}
function output(c,summary,sections,totals={},note='',more={}){
 const {key,from,to,bus_id,staff_id,schedule_id,mode,selected_point,min_trips,max_trips,sort,top,search,operator_name}=c;
 return {report:key,from,to,bus_id,staff_id,schedule_id,mode,point:selected_point,min_trips,max_trips,sort,top,search,operator_name,summary,sections,totals,methodology:note,...more};
}
function frequent(c){
 // Cohorts are by booking contact phone, across all channels, and are never keyed by display name.
 const map=new Map();
 for(const b of c.bookings){
   const phone=String(b.contact?.phone||'').trim();
   if(!phone)continue;
   const x=map.get(phone)||{phone,passenger:b.contact?.name||'',email:b.contact?.email||b.email||'',
     trips:0,travelled:0,upcoming:0,seats:0,spend:0,cancelled:0,first_trip:null,last_trip:null,channelSet:new Set()};
   if(b.cancellations?.length)x.cancelled++; // one cancelled PNR per booking, including partial cancellations
   if(live(b)){
     x.trips++;x.seats+=seats(b);x.spend+=money(b);x.channelSet.add(b.source||'Unknown');
     const trip=c.scheduledById.get(String(b.schedule_id));
     if(b.travel_date>U.today()&&trip?.trip_status!=='completed')x.upcoming++;
     else x.travelled++;
     x.first_trip=!x.first_trip||b.travel_date<x.first_trip?b.travel_date:x.first_trip;
     x.last_trip=!x.last_trip||b.travel_date>x.last_trip?b.travel_date:x.last_trip;
     if(!x.passenger)x.passenger=b.contact?.name||'';
     if(!x.email)x.email=b.contact?.email||b.email||'';
   }
   map.set(phone,x);
 }
 const all=[...map.values()].filter(x=>x.trips>0).map(x=>({...x,spend:round(x.spend),
    avg_trip:x.trips?round(x.spend/x.trips):0,channels:unique([...x.channelSet]).sort().join(', '),
    channelSet:undefined})),tripCount=sum(all,'trips');
 const bandsDef=[[1,1,'1 trip'],[2,2,'2 trips'],[3,5,'3–5 trips'],[6,10,'6–10 trips'],[11,20,'11–20 trips'],[21,Infinity,'21+ trips']];
 const bands=bandsDef.map(([lo,hi,label])=>{
   const a=all.filter(x=>x.trips>=lo&&x.trips<=hi),passengers=a.length,trips_taken=sum(a,'trips'),spend=round(sum(a,'spend'));
   return {band:label,passengers,share_pct:all.length?round(passengers/all.length*100):0,
     trips_taken,share_of_trips:tripCount?round(trips_taken/tripCount*100):0,spend};
 });
 const q=c.search.toLowerCase(),qualified=all.filter(x=>x.trips>=c.min_trips&&(c.max_trips===null||x.trips<=c.max_trips)
   &&(!q||(`${x.passenger} ${x.phone}`).toLowerCase().includes(q)));
 qualified.sort((a,b)=>{
   if(c.sort==='spend')return b.spend-a.spend||b.trips-a.trips;
   if(c.sort==='recent')return b.last_trip.localeCompare(a.last_trip)||b.trips-a.trips;
   return b.trips-a.trips||b.spend-a.spend;
 });
 const rows=(c.top==='all'?qualified:qualified.slice(0,Number(c.top))).map((x,i)=>({...x,rank:i+1}));
 const summary={passengers:qualified.length,all_passengers:all.length,trips:sum(qualified,'trips'),spend:round(sum(qualified,'spend')),
   avg_trip:sum(qualified,'trips')?round(sum(qualified,'spend')/sum(qualified,'trips')):0,
   upcoming:sum(qualified,'upcoming'),cancelled:sum(qualified,'cancelled'),shown:rows.length,
   total_trips:tripCount,total_spend:round(sum(all,'spend'))};
 const totals={rows:{rank:'Total',passenger:rows.length+' passengers',trips:sum(rows,'trips'),
     travelled:sum(rows,'travelled'),upcoming:sum(rows,'upcoming'),seats:sum(rows,'seats'),spend:round(sum(rows,'spend')),cancelled:sum(rows,'cancelled')},
   bands:{band:'Total',passengers:all.length,trips_taken:tripCount,spend:round(sum(all,'spend'))}};
 const desc=(c.max_trips===null?`${c.min_trips}+`:`${c.min_trips}–${c.max_trips}`)+' trips · ranked by '+({trips:'most trips',spend:'top spend',recent:'recent'}[c.sort])+' · '+(c.top==='all'?'all':'top '+c.top);
 return output(c,summary,{rows,bands},totals,'Trips = confirmed/completed bookings in the selected period across all channels including imported bookings, grouped by contact phone. Passenger cohorts are independent of the Top N table. Spend is the retained fare of booked seats.',{pdf_context:[['Trips:',desc]],report_options:{sort:c.sort,top:c.top,min_trips:c.min_trips,max_trips:c.max_trips}});
}
function point(c){
 const kind=c.mode==='pickup'?'pickup':'drop';
 const active=c.schedules.filter(s=>s.status==='active');
 const map=new Map(),allRows=[];
 const put=(raw,s)=>{
   const key=norm(raw);if(!key)return null;
   let x=map.get(key);
   if(!x){x={key,point:raw,bookings:0,seats:0,amount:0,cancelled:0,no_shows:0,
     booked:new Set(),serving:new Set(),on_time_count:0,gps_count:0,sources:new Map(),days:new Set()};map.set(key,x);}
   return x;
 };
 for(const s of active){
   const r=route(s.route_id);
   for(const st of arr(r.stages).filter(x=>x.type===kind)){
     const row=put(st.name);if(row)row.serving.add(String(s.id));
     if(!row)continue;
     const ev=s.stop_events?.[st.id];
     const scheduled=st.time;
     const actual=ev?.actual_arrival||ev?.arrived_at||ev?.actual_time||null;
     const asMinutes=value=>{
       if(!value)return null;
       if(/^\d{1,2}:\d{2}$/.test(String(value)))return U.toMin(value);
       if(/^\d{4}-\d{2}-\d{2}T/.test(String(value))){const date=new Date(value);return Number.isFinite(date.getTime())?date.getHours()*60+date.getMinutes():null;}
       return null;
     };
     const am=asMinutes(actual),sm=asMinutes(scheduled);
     if(am!==null&&sm!==null){row.gps_count++;const diff=((am-sm+720)%1440)-720;if(Math.abs(diff)<=8)row.on_time_count++;}
   }
 }
 for(const b of c.bookings){
   const r=route(b.route_id),st=stage(r,kind==='pickup'?b.boarding_stage_id:b.dropping_stage_id);
   if(st.type!==kind)continue;
   const entry=put(st.name);if(!entry)continue;
   const sold=live(b),v=sold?seats(b):0,amount=sold?money(b):0;
   if(sold){entry.bookings++;entry.seats+=v;entry.amount+=amount;entry.booked.add(String(b.schedule_id));
     entry.days.add(b.travel_date);entry.sources.set(b.source,(entry.sources.get(b.source)||0)+v);}
   if(arr(b.cancellations).length)entry.cancelled++;
   entry.no_shows+=arr(b.passengers).filter(p=>p.status==='no_show').length;
   allRows.push({date:b.travel_date,point:entry.point,point_key:entry.key,schedule_id:b.schedule_id,
     service:r.service_number||'',source:b.source||'',bookings:sold?1:0,seats:v,amount,cancelled:arr(b.cancellations).length?1:0,
     no_shows:arr(b.passengers).filter(p=>p.status==='no_show').length});
 }
 const eligible=[...map.values()].filter(x=>x.seats>0).sort((a,b)=>b.seats-a.seats||b.bookings-a.bookings||a.point.localeCompare(b.point));
 const allSeats=sum(eligible,'seats');
 const ranking=eligible.map((x,i)=>({rank:i+1,point:x.point,point_key:x.key,pnrs:x.bookings,seats:x.seats,
    share_pct:allSeats?round(x.seats/allSeats*100):0,trips_booked:x.booked.size,seats_per_trip:x.booked.size?round(x.seats/x.booked.size):0,
    revenue:round(x.amount),trips_serving:x.serving.size,cancelled:x.cancelled,no_shows:x.no_shows,
    on_time:x.gps_count?round(x.on_time_count/x.gps_count*100):null,gps_count:x.gps_count}));
 const choices=[...map.values()].sort((a,b)=>a.point.localeCompare(b.point)).map(x=>({key:x.key,point:x.point}));
 const selected=map.get(norm(c.selected_point))||null;
 const target=selected?ranking.find(x=>x.point_key===selected.key)||{
   rank:null,point:selected.point,point_key:selected.key,pnrs:0,seats:0,share_pct:0,trips_booked:0,seats_per_trip:0,
   revenue:0,trips_serving:selected.serving.size,cancelled:selected.cancelled,no_shows:selected.no_shows,on_time:null,gps_count:0}:null;
 const selRows=selected?allRows.filter(x=>x.point_key===selected.key):[];
 const byService=group(selRows,x=>x.service,r=>({service:r.service,pnrs:0,seats:0,revenue:0,trips:new Set()}),(x,r)=>{
   x.pnrs+=r.bookings;x.seats+=r.seats;x.revenue+=r.amount;if(r.bookings)x.trips.add(String(r.schedule_id));
 }).map(({trips,...x})=>({...x,trips_booked:trips.size,revenue:round(x.revenue),seats_per_trip:trips.size?round(x.seats/trips.size):0})).sort((a,b)=>b.seats-a.seats);
 const bySource=group(selRows,x=>x.source,r=>({source:r.source,pnrs:0,seats:0,revenue:0}),(x,r)=>{x.pnrs+=r.bookings;x.seats+=r.seats;x.revenue+=r.amount})
   .map(x=>({...x,revenue:round(x.revenue)})).sort((a,b)=>b.seats-a.seats);
 const daily=group(selRows,x=>x.date,r=>({date:r.date,pnrs:0,seats:0,revenue:0,cancelled:0,no_shows:0}),(x,r)=>{
   x.pnrs+=r.bookings;x.seats+=r.seats;x.revenue+=r.amount;x.cancelled+=r.cancelled;x.no_shows+=r.no_shows;
 }).map(x=>({...x,revenue:round(x.revenue)})).sort(dateOrder);
 const summary=target?{...target,point_name:target.point,rank_label:target.rank?target.rank+' of '+ranking.length:'—',
     cancellation_pct:target.pnrs+target.cancelled?round(target.cancelled/(target.pnrs+target.cancelled)*100):0,
     no_show_pct:target.seats?round(target.no_shows/target.seats*100):0}:{points:ranking.length};
 const totals={ranking:{rank:'Total',point:ranking.length+' points',pnrs:sum(ranking,'pnrs'),seats:allSeats,revenue:round(sum(ranking,'revenue'))},
   by_service:{service:byService.length+' schedules',pnrs:sum(byService,'pnrs'),seats:sum(byService,'seats'),revenue:round(sum(byService,'revenue'))},
   by_source:{source:bySource.length+' sources',pnrs:sum(bySource,'pnrs'),seats:sum(bySource,'seats'),revenue:round(sum(bySource,'revenue'))},
   daily:{date:daily.length+' days',pnrs:sum(daily,'pnrs'),seats:sum(daily,'seats'),revenue:round(sum(daily,'revenue'))}};
 return output(c,summary,{ranking,by_service:byService,by_source:bySource,daily},totals,
  'PNRs from every source (OTAs included), by travel date. Point names match ignoring case and spaces. Confirmed/completed are sold. Cancelled and no-shows use recorded events. Trips serving = running trips with a scheduled stop here; on time uses recorded GPS stop stamps within ±8 minutes; unrecorded stops are excluded.',
   {points:choices,selected_point:target,mode:c.mode,
    pdf_context:[['Point:',target?.point||'No point selected'],['Type:',c.mode==='pickup'?'Pickup':'Drop']]});
}
function station(c){
 const running=c.schedules.filter(s=>s.status==='active'),confirmed=c.bookings.filter(live);
 const byId=s=>route(s.route_id);
 const pairsMap=new Map(),cancelMap=new Map(),noMap=new Map();
 const pack=(key,b,ss)=>{
   const x=pairsMap.get(key)||{from:city(b.from_city_id),to:city(b.to_city_id),pnrs:0,seats:0,revenue:0,
     bookings:new Set(),schedules:new Set(),cancelled:0,no_shows:0};
   x.pnrs++;x.seats+=seats(b);x.revenue+=money(b);x.bookings.add(String(b.schedule_id));
   x.schedules.add(String(ss.route_id));pairsMap.set(key,x);
 };
 for(const b of confirmed){
   const s=c.scheduledById.get(String(b.schedule_id));if(!s)continue;
   pack(b.from_city_id+'|'+b.to_city_id,b,s);
 }
 for(const b of c.bookings){
   const k=b.from_city_id+'|'+b.to_city_id;
   if(arr(b.cancellations).length)cancelMap.set(k,(cancelMap.get(k)||0)+1);
   const missing=arr(b.passengers).filter(p=>p.status==='no_show').length;
   if(missing)noMap.set(k,(noMap.get(k)||0)+missing);
 }
 const serves=(s,from,to)=>{
   const r=byId(s);return D.cityOrder(r,from)<D.cityOrder(r,to)&&D.cityOrder(r,from)>=0&&D.cityOrder(r,to)>=0;
 };
 const cityIdsByName=new Map(db.col('cities').all().map(c=>[c.name,c.id]));
 const seatsTotal=sum(confirmed,seats),pnrs=confirmed.length,revenue=round(sum(confirmed,money));
 const pairs=[...pairsMap].map(([k,x])=>{
   const [from,to]=k.split('|');
   const tripsServing=running.filter(s=>serves(s,from,to)).length;
   return {from:x.from,to:x.to,pnrs:x.pnrs,seats:x.seats,share_pct:seatsTotal?round(x.seats/seatsTotal*100):0,
   avg_fare:x.seats?round(x.revenue/x.seats):0,revenue:round(x.revenue),trips_serving:tripsServing,trips_booked:x.bookings.size,
   seats_per_trip:tripsServing?round(x.seats/tripsServing):0,cancelled:cancelMap.get(k)||0,no_shows:noMap.get(k)||0,
   schedules:x.schedules.size};
 }).sort((a,b)=>b.seats-a.seats||b.revenue-a.revenue);
 const stationAgg=(which)=>{
   const isFrom=which==='boarding',keyFn=b=>String(isFrom?b.from_city_id:b.to_city_id),other=b=>city(isFrom?b.to_city_id:b.from_city_id);
   return group(confirmed,keyFn,b=>({station:city(isFrom?b.from_city_id:b.to_city_id),pnrs:0,seats:0,revenue:0,_other:new Map()}),(x,b)=>{
     x.pnrs++;x.seats+=seats(b);x.revenue+=money(b);x._other.set(other(b),(x._other.get(other(b))||0)+seats(b));
   }).map(({_other,...x})=>({...x,share_pct:seatsTotal?round(x.seats/seatsTotal*100):0,
     avg_fare:x.seats?round(x.revenue/x.seats):0,revenue:round(x.revenue),
     top_station:[..._other].sort((a,b)=>b[1]-a[1])[0]?.[0]||''})).sort((a,b)=>b.seats-a.seats);
 };
 const boarding=stationAgg('boarding'),dropping=stationAgg('dropping');
 const scheduleGroups=group(running,x=>String(x.route_id),s=>({route_id:s.route_id,route:byId(s),schedules:[],bookings:[]}),(x,s)=>{x.schedules.push(s);});
 const by_schedule=scheduleGroups.map(x=>{
   const records=confirmed.filter(b=>eq(b.route_id,x.route_id)),r=x.route,seatsN=sum(records,seats),spent=sum(records,money),
   byPairs=group(records,b=>b.from_city_id+'|'+b.to_city_id,b=>({pair:city(b.from_city_id)+' → '+city(b.to_city_id),n:0}),(y,b)=>{y.n+=seats(b)});
   const best=byPairs.sort((a,b)=>b.n-a.n)[0];
   const endSeats=sum(records.filter(b=>eq(b.from_city_id,r.origin_city_id)&&eq(b.to_city_id,r.destination_city_id)),seats);
   return {service:r.service_number,route:city(r.origin_city_id)+' → '+city(r.destination_city_id),dep:r.departure_time,
     trips:x.schedules.length,pnrs:records.length,seats:seatsN,seats_per_trip:x.schedules.length?round(seatsN/x.schedules.length):0,
     avg_fare:seatsN?round(spent/seatsN):0,revenue:round(spent),pairs:byPairs.length,top_pair:best?.pair||'',
     end_to_end_pct:seatsN?round(endSeats/seatsN*100):0,route_id:r.id};
 }).sort((a,b)=>b.revenue-a.revenue);
 const by_schedule_pairs=group(confirmed,b=>b.route_id+'|'+b.from_city_id+'|'+b.to_city_id,
 b=>({route_id:b.route_id,service:route(b.route_id).service_number,from:city(b.from_city_id),to:city(b.to_city_id),
   from_id:b.from_city_id,to_id:b.to_city_id,pnrs:0,seats:0,revenue:0,_booked:new Set()}),(x,b)=>{
   x.pnrs++;x.seats+=seats(b);x.revenue+=money(b);x._booked.add(String(b.schedule_id));
 }).map(({_booked,...x})=>{
   const tripsServing=running.filter(s=>eq(s.route_id,x.route_id)&&serves(s,x.from_id,x.to_id)).length;
   const k=x.from_id+'|'+x.to_id;
   const cancelled=c.bookings.filter(b=>eq(b.route_id,x.route_id)&&eq(b.from_city_id,x.from_id)&&eq(b.to_city_id,x.to_id)&&arr(b.cancellations).length).length;
   const no_shows=sum(c.bookings.filter(b=>eq(b.route_id,x.route_id)&&eq(b.from_city_id,x.from_id)&&eq(b.to_city_id,x.to_id)),b=>arr(b.passengers).filter(p=>p.status==='no_show').length);
   return {...x,revenue:round(x.revenue),avg_fare:x.seats?round(x.revenue/x.seats):0,
     trips_serving:tripsServing,trips_booked:_booked.size,seats_per_trip:tripsServing?round(x.seats/tripsServing):0,
     cancelled,no_shows,from_id:undefined,to_id:undefined};
 }).sort((a,b)=>a.from.localeCompare(b.from)||a.to.localeCompare(b.to)||a.service.localeCompare(b.service));
 const sources=group(confirmed,b=>b.source||'Unknown',b=>({source:b.source||'Unknown',pnrs:0,seats:0,revenue:0}),(x,b)=>{
   x.pnrs++;x.seats+=seats(b);x.revenue+=money(b);
 }).map(x=>({...x,revenue:round(x.revenue),share_pct:seatsTotal?round(x.seats/seatsTotal*100):0,avg_fare:x.seats?round(x.revenue/x.seats):0}))
   .sort((a,b)=>b.seats-a.seats);
 const daily=U.dateRange(c.from,c.to).map(date=>{
   const bs=confirmed.filter(b=>b.travel_date===date),ss=running.filter(s=>s.travel_date===date);
   const endToEnd=sum(bs.filter(b=>{const r=route(b.route_id);return eq(b.from_city_id,r.origin_city_id)&&eq(b.to_city_id,r.destination_city_id)}),seats);
   const cancelled=c.bookings.filter(b=>b.travel_date===date&&arr(b.cancellations).length).length;
   return {date,day:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][U.dow(date)],trips:ss.length,pnrs:bs.length,
     seats:sum(bs,seats),end_to_end:endToEnd,revenue:round(sum(bs,money)),cancelled};
 });
 const endToEnd=sum(confirmed.filter(b=>{const r=route(b.route_id);return eq(b.from_city_id,r.origin_city_id)&&eq(b.to_city_id,r.destination_city_id)}),seats);
 const cancelled=c.bookings.filter(b=>arr(b.cancellations).length).length;
 const noShows=sum(c.bookings,b=>arr(b.passengers).filter(x=>x.status==='no_show').length);
 const summary={seats:seatsTotal,pnrs,revenue,avg_fare:seatsTotal?round(revenue/seatsTotal):0,
   station_pairs:pairs.length,stations:unique([...boarding.map(x=>x.station),...dropping.map(x=>x.station)]).length,
   trips:running.length,schedules:by_schedule.length,seats_per_trip:running.length?round(seatsTotal/running.length):0,
   end_to_end:endToEnd,end_to_end_pct:seatsTotal?round(endToEnd/seatsTotal*100):0,
   cancelled,cancelled_pct:pnrs+cancelled?round(cancelled/(pnrs+cancelled)*100):0,
   no_shows:noShows,no_show_pct:seatsTotal?round(noShows/seatsTotal*100):0};
 const totals={};
 for(const [key,rows] of Object.entries({pairs,boarding,dropping,by_schedule,by_schedule_pairs,sources,daily})){
    totals[key]={};for(const k of ['pnrs','seats','revenue','cancelled','no_shows','end_to_end','trips'])totals[key][k]=round(sum(rows,k));
    totals[key][key==='pairs'?'from':key==='boarding'||key==='dropping'?'station':key==='by_schedule'||key==='by_schedule_pairs'?'service':key==='sources'?'source':'date']=
      key==='pairs'?pairs.length+' pairs':key==='boarding'||key==='dropping'?rows.length+' stations':key==='by_schedule'?rows.length+' schedules':key==='by_schedule_pairs'?rows.length+' pairs':key==='sources'?rows.length+' sources':rows.length+' days';
 }
 return output(c,summary,{pairs,boarding,dropping,by_schedule,by_schedule_pairs,sources,daily},totals,
   'All booking sources, by travel date. Station = stop city. Trips serving = running trips stopping at both cities in route order. End-to-end = schedule origin to destination. Cancelled = confirmed PNR subsequently cancelled; no-shows = seats marked no-show.',
   {pdf_context:[['Schedule:',c.schedule_id?route(c.schedule_id).service_number:'All schedules']]});
}
function tripPnl(c){
 const raw=c.schedules.map(s=>{
   const r=route(s.route_id),p=Rp.tripPnl(s),running=s.status==='active';
   const net=round(p.net_sales),expense=round(p.expense);
   return {date:s.travel_date,dep:s.departure_time||'',service:r.service_number||'',route:city(r.origin_city_id)+' → '+city(r.destination_city_id),
     bus:running?vehicle(s)||'Unassigned':'Turned off',running,seats_label:running?(p.seats+'/'+p.capacity):'—',
     occupancy_pct:running&&p.capacity?round(p.seats/p.capacity*100):null,
     net_sales:net,expense,profit:round(net-expense),seats:running?p.seats:0,capacity:running?p.capacity:0};
 }).sort((a,b)=>a.date.localeCompare(b.date)||a.dep.localeCompare(b.dep));
 const run=raw.filter(x=>x.running),totalSeats=sum(run,'seats'),capacity=sum(run,'capacity');
 const summary={trips:run.length,occupancy_pct:capacity?round(totalSeats/capacity*100):0,
   net_sales:round(sum(raw,'net_sales')),expense:round(sum(raw,'expense')),profit:round(sum(raw,'profit')),
   loss_trips:raw.filter(x=>x.profit<0).length,all_trips:raw.length};
 const totals={rows:{date:raw.length+' trips',seats_label:totalSeats+'/'+capacity,
   occupancy_pct:summary.occupancy_pct,net_sales:summary.net_sales,expense:summary.expense,profit:summary.profit}};
 return output(c,summary,{rows:raw},totals,'Net sales = retained confirmed ticket sales after offers and GST (as in Sales). A turned-off trip carries fixed costs only; profit here = net sales − expenses. Cancellation charges are excluded from this particular P&L report.');
}
function compute(key,q={}){const c=context(key,q);return ({
 'frequent-travellers':frequent,'point-performance':point,'station-performance':station,'trip-pnl':tripPnl
})[key](c);}
function options(){
 return {buses:db.col('vehicles').all().filter(x=>x.status!=='deleted').map(x=>({id:x.id,name:x.registration_number})),
   staff:db.col('staff').all().filter(x=>x.status!=='deleted').map(x=>({id:x.id,name:x.name,role:x.role})),
   schedules:db.col('routes').all().map(x=>({id:x.id,name:x.service_number+' · '+city(x.origin_city_id)+' → '+city(x.destination_city_id)}))};
}
module.exports={KEYS,params,compute,options};
