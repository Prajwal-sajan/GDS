'use strict';
/* Schedule → Manage → Bookings v48
 * Read-only, source-backed event timeline/seat-count evidence for screenshot UI.
 * Do not invent past seat-block or hold-release timestamps.
 * Only authorized bookings, never other operators' passenger identities. */
const express=require('express');
const db=require('../db');
const D=require('../domain');
const Auth=require('../auth');
const Policy=require('../access-runtime-v27');
const router=express.Router();
const handler=fn=>(req,res)=>{
 try {
  res.set('Cache-Control','private, no-store');
  res.set('Vary','Authorization');
  return res.json(fn(req));
 }catch(e) {
  return res.status(e.status||500).json({success:false,message:e.status?e.message:'Unable to load schedule bookings'});
 }
};
const isActive=b=>b.status==='confirmed'&&Array.isArray(b.passengers)&&b.passengers.some(p=>p.status!=='cancelled');
const pax=b=>(b.passengers||[]).filter(p=>p.status!=='cancelled');
const eventType=b=>b.status==='confirmed'?'confirmed':b.status==='hold'?'blocked':
 b.status==='released'?'released':b.status==='expired'?'expired':
 b.status==='cancelled'?'released':b.status||'recorded';
const withoutSecrets=p=>({seat:String(p.seat||''),name:String(p.name||''),age:p.age??null,gender:String(p.gender||'')});
function info(b){
 return {pnr:String(b.pnr),ticket:String(b.ticket_number||''),source:String(b.source||'GDS'),
  status:b.status,booked_at:b.booked_at||null,confirmed_at:b.confirmed_at||null,
  cancelled_at:b.cancelled_at||null,expired_at:b.expired_at||null,
  passengers:pax(b).map(withoutSecrets),fare_total:Number(b.fare?.total||0)};
}
function evidence(schedule,bookings){
 const events=[],counts=new Map();
 for(const b of bookings){
  if(isActive(b))for(const p of pax(b))counts.set(String(p.seat),(counts.get(String(p.seat))||0)+1);
  const binfo=info(b);
  const event=(kind,at,message,status)=>{if(!at)return;
   events.push({...binfo,id:kind+':'+b.pnr+':'+at,kind,at:String(at),message,status:status||kind});};
  // A booking created directly as confirmed is not evidence of an earlier seat block.
  event('recorded',b.booked_at,'Booking recorded',eventType(b));
  if(b.confirmed_at&&b.confirmed_at!==b.booked_at)event('confirmed',b.confirmed_at,'Ticket confirmed','confirmed');
  if(b.cancelled_at)event('released',b.cancelled_at,'Cancellation recorded','released');
  if(b.expired_at)event('expired',b.expired_at,'Hold expired','expired');
 }
 const blocks=(schedule.seat_blocks||[]).filter(x=>x&&Array.isArray(x.seats));
 for(let i=0;i<blocks.length;i++){
  const blk=blocks[i],at=blk.at||blk.created_at;
  if(!at)continue;
  events.push({id:'manual-block:'+i+':'+at,kind:'blocked',at:String(at),status:'blocked',
   message:'Manual seat block recorded',source:String(blk.source||'Schedule'),pnr:null,ticket:null,
   seats:blk.seats.map(String),reason:String(blk.reason||''),passengers:[]});
 }
 events.sort((a,b)=>String(a.at).localeCompare(String(b.at))||a.id.localeCompare(b.id));
 const stats={all:events.length,seat_blocks:blocks.length,bookings:bookings.length,
  released:events.filter(x=>x.status==='released').length,
  confirmed:bookings.filter(b=>b.status==='confirmed').length,
  expired:bookings.filter(b=>b.status==='expired').length,
  blocked_active:blocks.length};
 return {counts:{active_seats:bookings.filter(isActive).reduce((n,b)=>n+pax(b).length,0),
  active_bookings:bookings.filter(isActive).length,
  ...stats},
  events:events.slice(-500),seat_reservation_counts:Object.fromEntries(counts),
  provenance:'Booking timestamps and actual schedule seat-block records only',
  timezone:'Asia/Kolkata'};
}
router.get('/schedules/:id/manage-bookings/v48',Auth.can('schedules.view'),Auth.can('bookings.view_all'),
 handler(req=>{
  const schedule=db.col('schedules').get(req.params.id);
  if(!schedule)throw D.httpErr(404,'Schedule not found');
  const bookings=db.col('bookings').filter(b=>String(b.schedule_id)===String(schedule.id)&&Policy.bookingAllowed(req,b));
  return evidence(schedule,bookings);
 }));
module.exports=router;
module.exports.evidence=evidence;
