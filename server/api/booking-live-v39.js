'use strict';
/* v39: Permission-scoped live booking event feed. Only confirmed booking events.
 * The operator GDS writes these events via Domain.notify; no demo events generated. */
const express=require('express');
const db=require('../db');
const D=require('../domain');
const Access=require('../access-runtime-v27');
const {can}=require('../auth');
const r=express.Router();
const h=fn=>(req,res)=>{try{res.set('Cache-Control','private,no-store');res.set('Vary','Authorization, X-View-As');res.json(fn(req));}
 catch(e){res.status(e.status||500).json({success:false,message:e.message})}};
function actualEvent(a,req){
 if(!['booking.created','payment.received'].includes(a.action)||!a.pnr)return null;
 const b=db.col('bookings').find(x=>String(x.pnr)===String(a.pnr));
 if(!b||b.status!=='confirmed'||!Access.bookingAllowed(req,b))return null;
 if(a.action==='booking.created'&&b.payment==='unpaid')return null;
 // Alerts are tenant-local to this single-operator GDS. Enforce the event's
 // recorded schedule against its booking to prevent misattribution.
 if(String(a.schedule_id)!==String(b.schedule_id))return null;
 const schedule=db.col('schedules').get(b.schedule_id);
 const route=db.col('routes').get(b.route_id);
 const v=schedule?.vehicle_id?db.col('vehicles').get(schedule.vehicle_id):null;
 const stops=route?.stages||[];
 const boarding=stops.find(st=>String(st.id)===String(b.boarding_stage_id));
 const dropping=stops.find(st=>String(st.id)===String(b.dropping_stage_id));
 const active=(b.passengers||[]).filter(p=>p.status!=='cancelled');
 if(!active.length)return null;
 return {id:a.id,pnr:b.pnr,ticket_number:b.ticket_number,created_at:a.ts,
  kind:schedule?.trip_status==='live'?'in_trip_booking':'new_booking',
  vehicle_registration:v?.registration_number||null,service:route?.service_number||'',
  passenger_count:active.length,
  passenger_name:active.length===1?active[0].name:b.contact?.name||'Passengers',
  seats:active.map(p=>p.seat),boarding:boarding?.name||'Not assigned',
  dropping:dropping?.name||'Not assigned'};
}
r.get('/bookings/live-events-v39',can('bookings.view_all'),h(req=>{
 const raw=req.query.since_id;
 if(raw!==undefined&&!/^\d+$/.test(String(raw)))throw D.httpErr(400,'Invalid event cursor');
 const lastId=db.col('alerts').all().reduce((max,a)=>Math.max(max,Number(a.id)||0),0);
 // First request = baseline. Don't replay weeks of historical bookings as
 // new customer notifications when an operator signs in.
 if(raw===undefined)return {cursor:lastId,events:[],interval_ms:3000};
 const since=Number(raw);
 if(since>lastId)throw D.httpErr(400,'Event cursor is ahead of latest record');
 const a=db.col('alerts').all().filter(x=>Number(x.id)>since&&
  ['booking.created','payment.received'].includes(x.action)).slice(-100);
 return {cursor:lastId,events:a.map(x=>actualEvent(x,req)).filter(Boolean).slice(-30),interval_ms:3000};
}));
module.exports=r;
