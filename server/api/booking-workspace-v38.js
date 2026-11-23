'use strict';
/* Booking Workspace v38: operator-scoped ticket history, available shift services,
   verifiable seat inventory and approved stop choices. No fabricated ticket events. */
const express=require('express');
const db=require('../db');
const D=require('../domain');
const U=require('../util');
const {can}=require('../auth');
const Access=require('../access-runtime-v27');
const r=express.Router();
const handler=fn=>(req,res)=>{try{res.set('Cache-Control','private, no-store');res.set('Vary','Authorization, X-View-As');res.json(fn(req))}catch(e){res.status(e.status||500).json({success:false,message:e.message})}};
const need=(req,label='View bookings')=>{
 const b=db.col('bookings').find(x=>x.pnr===req.params.pnr||x.ticket_number===req.params.pnr);
 return Access.requireBooking(req,b,label);
};
const active=b=>(b.passengers||[]).filter(p=>p.status!=='cancelled');
const autoCompatible=(b,targetRoute)=>{
 const old=db.col('routes').get(b.route_id);
 if(!old||!targetRoute)return false;
 if(String(old.id)===String(targetRoute.id))return true;
 const from=(old.stages||[]).find(p=>String(p.id)===String(b.boarding_stage_id));
 const to=(old.stages||[]).find(p=>String(p.id)===String(b.dropping_stage_id));
 return !!from&&!!to&&(targetRoute.stages||[]).some(p=>p.type==='pickup'&&
   String(p.city_id)===String(b.from_city_id)&&p.name===from.name)&&
  (targetRoute.stages||[]).some(p=>p.type==='drop'&&
   String(p.city_id)===String(b.to_city_id)&&p.name===to.name);
};
const eligible=(b,s)=>{
 if(!s||s.status!=='active')return false;
 const route=db.col('routes').get(s.route_id);
 if(!route)return false;
 const a=D.cityOrder(route,b.from_city_id),z=D.cityOrder(route,b.to_city_id);
 return a>=0&&z>a&&autoCompatible(b,route);
};
const stagesFor=(b)=>{
 const s=db.col('schedules').get(b.schedule_id);
 const route=db.col('routes').get(s?.route_id);
 if(!s||!route)throw D.httpErr(404,'Booking schedule or route not found');
 const stage=(route.stages||[]).map(st=>({...st,...(s.stage_overrides?.[st.id]||{})}));
 const order=D.cityOrder(route,b.from_city_id);
 const last=D.cityOrder(route,b.to_city_id);
 return {schedule:s,route,
  pickups:stage.filter(p=>p.type==='pickup'&&D.cityOrder(route,p.city_id)===order),
  drops:stage.filter(p=>p.type==='drop'&&D.cityOrder(route,p.city_id)===last)};
};
const fmtStage=(s)=>({
 id:s.id,city_id:s.city_id,city_name:D.cityName(s.city_id),
 name:s.name,time:s.time,day:s.day||1,
 pickup_type:s.pickup_type||'',landmark:s.landmark||''
});
r.get('/bookings/:pnr/stops',can('bookings.view_all'),handler(req=>{
 const b=need(req);const data=stagesFor(b);
 return {pnr:b.pnr,from_city_id:b.from_city_id,to_city_id:b.to_city_id,
  pickups:data.pickups.map(fmtStage),drops:data.drops.map(fmtStage),
  selected_boarding_stage_id:b.boarding_stage_id,selected_dropping_stage_id:b.dropping_stage_id};
}));
r.get('/bookings/:pnr/history',can('bookings.view_all'),handler(req=>{
 const b=need(req);const events=[];
 events.push({id:'created',kind:'created',title:'Booking Created',
  at:b.booked_at,actor:b.booked_by?.name||b.source||'Booking source',
  source:b.source||'GDS',
  details:[{label:'PNR',value:b.ticket_number||b.pnr},
   {label:'Status at booking',value:b.payment==='unpaid'?'hold':'confirmed'}]});
 if(Number(b.fare?.discount)>0){
  events.push({id:'discount',kind:'discount',title:'Discount Applied',
   at:b.booked_at,actor:b.booked_by?.name||b.source||'Booking source',source:b.source||'GDS',
   details:[{label:'Discount Amount',value:String(b.fare.discount)}]});
 }
 for(const a of db.col('edit_history').filter(x=>x.section==='bookings' &&
      (String(x.changes?.pnr||'')===String(b.pnr) ||
       (String(x.entity_id)===String(b.id)&&x.entity==='booking')))){
  const changes=a.changes||{};
  if(changes.op==='book')continue;
  const titles={shift:'Passenger Shifted',edit:'Booking Updated',
    cancel:'Ticket Cancelled',comment:'Comment Added',confirm:'Booking Confirmed',
    loyalty_upgrade_offer:'Loyalty Upgrade Offered',
    loyalty_upgrade_apply:'Loyalty Seat Upgraded',
    loyalty_upgrade_decline:'Loyalty Upgrade Declined',
    payment:'Payment Updated'};
  const details=[];
  if(changes.to_schedule!=null)details.push({label:'Target trip',value:String(changes.to_schedule)});
  if(changes.seat_map&&Object.keys(changes.seat_map).length)details.push({label:'Seat changes',value:Object.entries(changes.seat_map).map(([from,to])=>from+' → '+to).join(', ')});
  if(Array.isArray(changes.seats))details.push({label:'Seats',value:changes.seats.join(', ')});
  if(Array.isArray(changes.fields))details.push({label:'Fields updated',value:changes.fields.join(', ')});
  if(changes.from_seat&&changes.to_seat)details.push({label:'Seat change',value:String(changes.from_seat)+' → '+String(changes.to_seat)});
  if(changes.consent_method)details.push({label:'Consent method',value:String(changes.consent_method)});
  if(changes.refund!=null)details.push({label:'Refund',value:String(changes.refund)});
  events.push({id:'audit-'+a.id,kind:changes.op||'update',
   title:titles[changes.op]||'Booking Change',at:a.at,
   actor:a.name||'System',source:a.role||'GDS',details});
 }
 for(const c of b.comments||[]){
  if(events.some(x=>x.kind==='comment'&&x.at===c.at))continue;
  events.push({id:'comment-'+c.at,kind:'comment',title:'Comment Added',at:c.at,
   actor:c.by||'Staff',source:'Staff-only note',details:[]});
 }
 if(b.status==='cancelled'&&b.cancelled_at&&!events.some(x=>x.kind==='cancel')){
  events.push({id:'cancelled',kind:'cancel',title:'Ticket Cancelled',
   at:b.cancelled_at,actor:'Recorded booking state',source:b.source,details:[]});
 }
 events.sort((a,z)=>(Date.parse(z.at||0)||0)-(Date.parse(a.at||0)||0));
 return {pnr:b.pnr,ticket_number:b.ticket_number,events};
}));
r.get('/bookings/:pnr/shift-options',can('bookings.view_all'),handler(req=>{
 const b=need(req,'Shift seat / date');
 if(b.status!=='confirmed')throw D.httpErr(409,'Only confirmed bookings can be shifted');
 const date=String(req.query.date||b.travel_date);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00')))throw D.httpErr(400,'Date must be YYYY-MM-DD');
 if(date<U.today()||date>U.addDays(U.today(),120))throw D.httpErr(400,'Choose a date within the next 120 days');
 D.ensureSchedules(date,date);
 const list=db.col('schedules').filter(s=>s.travel_date===date&&eligible(b,s));
 return {date,booking_pnr:b.pnr,services:list.map(s=>{
  const r=db.col('routes').get(s.route_id);
  const map=D.seatMap(s,b.from_city_id,b.to_city_id);
  const free=map.decks.flatMap(d=>d.seats).filter(seat=>seat.status==='available'||seat.status==='other_leg').length;
  return {id:s.id,route_id:s.route_id,service:r.service_number,
   name:r.name||r.service_number,departure_time:s.departure_time,travel_date:s.travel_date,free_seats:free};
 }).sort((a,z)=>a.departure_time.localeCompare(z.departure_time))};
}));
r.get('/bookings/:pnr/shift-seats',can('bookings.view_all'),handler(req=>{
 const b=need(req,'Shift seat / date');
 if(b.status!=='confirmed')throw D.httpErr(409,'Only confirmed bookings can be shifted');
 const sid=String(req.query.schedule_id||'');
 if(!/^\d+$/.test(sid))throw D.httpErr(400,'Choose a target service');
 const s=db.col('schedules').get(sid);
 if(!eligible(b,s))throw D.httpErr(409,'Target service must serve the booked journey direction');
 if(s.travel_date<U.today())throw D.httpErr(409,'Cannot shift into a departed date');
 const map=D.seatMap(s,b.from_city_id,b.to_city_id);
 const free=map.decks.flatMap(d=>d.seats).filter(seat=>{
  const mine=String(s.id)===String(b.schedule_id)&&seat.booking?.pnr===b.pnr;
  return mine||seat.status==='available'||seat.status==='other_leg';
 }).map(seat=>({seat:seat.code,type:seat.type,deck:seat.deck||null,status:seat.status}));
 return {pnr:b.pnr,schedule_id:s.id,travel_date:s.travel_date,
  passengers:active(b).map(p=>({seat:p.seat,name:p.name})),seats:free};
}));
module.exports=r;
