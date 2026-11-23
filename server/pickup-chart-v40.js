'use strict';
/* Pickup Chart v40 — operator-scoped source data, not a screenshot fixture. */
const db=require('./db'),D=require('./domain'),Policy=require('./access-runtime-v27');
const COLS=[
 ['seat','Seat',.50],['mobile','Mobile',1.05],['pnr','PNR',.80],
 ['name','Name',2.08],['gender','G',.29],['age','Age',.37],
 ['contact_name','Contact Name',1.32],['trips','Trips',.43],
 ['from_city','From City',1.12],['to_city','To City',1.12],
 ['pickup','Pickup',1.79],['drop','Drop',1.60],
 ['fare','Fare',.72],['source','Source',.74],['booked_on','Booked On',1.17]
];
const BY_KEY=Object.fromEntries(COLS.map(x=>[x[0],x]));
const BASE_PICKUP=['seat','mobile','pnr','name','gender','trips','drop','fare','source','booked_on'];
const BASE_RTO=['seat','mobile','pnr','name','gender','pickup','drop'];
const safe=s=>String(s??'').replace(/[\x00-\x1f\x7f]/g,' ').trim();
const natural=(a,b)=>String(a||'').localeCompare(String(b||''),'en',{numeric:true,sensitivity:'base'});
const humanTime=hhmm=>{
 if(!/^\d{1,2}:\d\d$/.test(String(hhmm||'')))return String(hhmm||'');
 const [h,m]=String(hhmm).split(':').map(Number);
 return (h%12||12)+':'+String(m).padStart(2,'0')+' '+(h<12?'AM':'PM');
};
function formatBooked(value){
 if(!value)return '';
 const dt=new Date(value);
 if(!Number.isFinite(+dt))return safe(value);
 return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',day:'2-digit',month:'2-digit',year:'2-digit',
  hour:'2-digit',minute:'2-digit',hour12:true}).format(dt)
  .replace(',', '').replace(/\s+/g,' ').toLowerCase();
}
function formatPrinted(d=new Date()){
 return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',day:'2-digit',month:'2-digit',year:'numeric',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true}).format(d);
}
function stages(s,r){
 return (r.stages||[]).map(x=>({...x,...(s.stage_overrides?.[x.id]||{})}));
}
function resolve(sid,req){
 const s=db.col('schedules').get(sid);
 if(!s)throw D.httpErr(404,'Schedule not found');
 const r=db.col('routes').get(s.route_id);
 if(!r)throw D.httpErr(404,'Route not found');
 const ss=stages(s,r);
 const vehicle=s.vehicle_id?db.col('vehicles').get(s.vehicle_id):null;
 const members=(s.crew||[]).filter(c=>/driver/i.test(String(c.role||'')));
 const lead=members.map(c=>db.col('staff').get(c.staff_id)).find(Boolean);
 const meta=db.meta('operator')||{};
 return {s,r,stages:ss,vehicle,operator:meta.operator_name||meta.app_name||'Operator',
  service:r.service_number,origin:D.cityName(r.origin_city_id),destination:D.cityName(r.destination_city_id),
  date:s.travel_date,driver:lead?.name||'',driver_phone:lead?.phone||'',vehicle_number:vehicle?.registration_number||'',
  capacity:D.coachForSchedule(s)?.layout?.capacity||0};
}
function current(sid,req){
 const data=resolve(sid,req),{s,r,stages:ss}=data;
 const allowPhone=Policy.viewPhone(req),rows=[];
 const order=new Map(ss.map((st,i)=>[String(st.id),i]));
 for(const b of db.col('bookings').filter(x=>String(x.schedule_id)===String(sid)&&x.status==='confirmed')){
  if(!Policy.bookingAllowed(req,b))continue;
  const board=ss.find(st=>String(st.id)===String(b.boarding_stage_id));
  const drop=ss.find(st=>String(st.id)===String(b.dropping_stage_id));
  if(!board||!drop)continue;
  const trips=db.col('bookings').count(x=>x.contact?.phone===b.contact?.phone&&x.status==='confirmed');
  for(const p of b.passengers||[]){
   if(p.status==='cancelled')continue;
   rows.push({seat:safe(p.seat),mobile:allowPhone?safe(b.contact?.phone):'**********',
    pnr:safe(b.ticket_number||b.pnr),internal_pnr:safe(b.pnr),name:safe(p.name),
    gender:safe(p.gender),age:p.age??'',contact_name:safe(b.contact?.name),
    trips,from_city:D.cityName(b.from_city_id),to_city:D.cityName(b.to_city_id),
    pickup:safe(board.name),drop:safe(drop.name),boarding_id:String(board.id),dropping_id:String(drop.id),
    pickup_time:board.time,pickup_day:board.day||1,drop_time:drop.time,drop_day:drop.day||1,
    exchange_point:safe(board.exchange_point),exchange_time:board.exchange_time||'',
    fare:Number(p.fare||0),source:safe(b.source),booked_on:formatBooked(b.booked_at),
    boarded_city_id:String(b.from_city_id),dropped_city_id:String(b.to_city_id),
    boarding_order:order.get(String(board.id))??9999,dropping_order:order.get(String(drop.id))??9999});
  }
 }
 return {...data,kind:'current',rows,import_id:null,source_gds:'Current GDS'};
}
function latestImport(sid,req){
 const data=resolve(sid,req);
 const record=db.col('pickup_chart_imports_v40').filter(x=>String(x.schedule_id)===String(sid))
  .sort((a,b)=>String(b.imported_at).localeCompare(String(a.imported_at)))[0];
 if(!record)return null;
 return {...data,kind:'imported',rows:record.rows||[],import_id:record.id,source_gds:record.source_gds,
  import_filename:record.file_name,imported_at:record.imported_at,imported_count:record.rows.length};
}
function options(query={}){
 const chart=String(query.chart||'pickup').toLowerCase();
 if(!['pickup','rto'].includes(chart))throw D.httpErr(400,'Choose Pickup chart or RTO chart');
 const pick=String(query.pickup_drop||'trip');
 if(!['trip','passenger'].includes(pick))throw D.httpErr(400,'Unsupported pickup / drop selection');
 const raw=query.columns;
 let cols=raw===undefined?(chart==='rto'?BASE_RTO:BASE_PICKUP):String(raw).split(',').map(x=>x.trim()).filter(Boolean);
 cols=[...new Set(cols)];
 if(!cols.length||cols.some(x=>!BY_KEY[x])||cols.length>COLS.length)throw D.httpErr(400,'Choose at least one supported chart column');
 const city=safe(query.city||'all');
 if(city!=='all'&&!/^(boarding|dropping):[0-9]+$/.test(city))throw D.httpErr(400,'Unsupported city filter');
 return {chart,pickup_drop:pick,columns:cols,city};
}
function cityOptions(report){
 const found=new Map();
 for(const row of report.rows){
  for(const [label,city,cid] of [['boarding',row.from_city,row.boarded_city_id],['dropping',row.to_city,row.dropped_city_id]]){
   if(!cid||!city)continue;
   const id=label+':'+cid;
   if(!found.has(id))found.set(id,{id,kind:label,city,count:0});
   found.get(id).count++;
  }
 }
 return [{id:'all',label:'All passengers',count:report.rows.length},...found.values()
   .sort((a,b)=>a.kind.localeCompare(b.kind)||natural(a.city,b.city))
   .map(x=>({...x,label:(x.kind==='boarding'?'Boarding at ':'Dropping at ')+x.city}))];
}
function filtered(report,opts){
 const cityIds=new Set(cityOptions(report).map(x=>x.id));
 if(!cityIds.has(opts.city))throw D.httpErr(400,'Selected city is not present on this chart');
 if(opts.city==='all')return report.rows.slice();
 const [kind,id]=opts.city.split(':');
 return report.rows.filter(p=>String(kind==='boarding'?p.boarded_city_id:p.dropped_city_id)===id);
}
function rowsFor(report,opts){
 const rows=filtered(report,opts).map(p=>({...p}));
 if(opts.chart==='rto'&&opts.pickup_drop==='trip'){
  for(const p of rows){p.pickup=report.stages.find(s=>s.type==='pickup')?.name||report.origin;
   p.drop=report.stages.filter(s=>s.type==='drop').slice(-1)[0]?.name||report.destination;}
 }
 return rows;
}
module.exports={COLS,BY_KEY,BASE_PICKUP,BASE_RTO,current,latestImport,resolve,options,cityOptions,
 filtered,rowsFor,stages,humanTime,formatBooked,formatPrinted,safe,natural};
