'use strict';
/* Passenger PNR Communication History v35.
 * Read-only snapshot of actual stored messages/calls. Never conflates a local
 * message's "read" flag with a provider delivery receipt. No network sends. */
const express=require('express');
const db=require('../db');
const D=require('../domain');
const Auth=require('../auth');
const Access=require('../access-runtime-v27');
const router=express.Router();
const CHANNELS=['all','calls','whatsapp','sms'];
function bad(message,status=400){const e=new Error(message);e.status=status;return e;}
const str=x=>typeof x==='string'?x:String(x??'');
const isoTime=v=>{const t=v?Date.parse(String(v)):NaN;return Number.isFinite(t)?new Date(t).toISOString():null;};
function channelOf(raw){
 const s=str(raw||'').trim().toLowerCase();
 return s==='whatsapp'||s==='wa'?'whatsapp':s==='sms'?'sms':
  s==='call'||s==='calls'||s==='phone'?'calls':s==='app'?'app':s==='email'?'email':'other';
}
function directionOf(raw){
 const s=str(raw||'').trim().toLowerCase();
 return ['out','outgoing','sent','outbound'].includes(s)?'outgoing':
 ['in','incoming','received','inbound'].includes(s)?'incoming':'unknown';
}
function statusOfMessage(m,direction){
 // read means a staff member viewed an inbound chat, NOT Meta delivered/read.
 const provider=str(m.delivery_status??m.provider_status??m.provider_delivery_status??'').trim();
 const normal=provider.toLowerCase();
 const known={sent:'Sent',delivered:'Delivered',read:'Read',failed:'Failed',
  queued:'Queued',pending:'Pending',undelivered:'Undelivered',received:'Received'};
 if(provider)return known[normal]||provider.slice(0,48);
 return direction==='incoming'?'Received':'Recorded';
}
const safeInfo=value=>str(value||'').slice(0,4000);
function maskPhone(phone){
 const digits=str(phone).replace(/\D/g,'');
 return digits.length>=10?digits.slice(-10,-7)+'xxxx'+digits.slice(-3):'—';
}
function normalizeMessage(m,allowPhone){
 const direction=directionOf(m.direction);
 const channel=channelOf(m.channel);
 // Non-tabbed channels remain visible under All to avoid losing communications.
 const contact=m.to||m.from_phone||m.contact_to||null;
 return {id:'m-'+str(m.id||''),
  channel,direction,timestamp:isoTime(m.ts||m.created_at||m.sent_at),
  message_type:str(m.template||m.message_type||m.template_name||'Unknown').slice(0,120),
  from:str(m.from||m.sender_name||m.by||'').slice(0,160),
  contact_to:contact?(allowPhone?str(contact):maskPhone(contact)):'—',
  status:statusOfMessage(m,direction),
  duration_s:null,
  additional_info:safeInfo(m.text||m.body||m.provider_error||''),
  provider_status: Boolean(m.delivery_status||m.provider_status||m.provider_delivery_status)
 };
}
function normalizeCall(c,allowPhone){
 const direction=directionOf(c.direction),contact=c.to||c.to_number||null;
 return {id:'c-'+str(c.id||''),channel:'calls',direction,
 timestamp:isoTime(c.ts||c.created_at),
 message_type:str(c.kind||'Call').replace(/_/g,' ').slice(0,120),
 from:str(c.from||c.agent||'').slice(0,160),
 contact_to:contact?(allowPhone?str(contact):maskPhone(contact)):'—',
 status:str(c.status||'Recorded').replace(/_/g,' ').slice(0,48),
 duration_s:Number.isFinite(Number(c.duration_s))&&c.duration_s!==null?Math.max(0,Number(c.duration_s)):null,
 additional_info:safeInfo(c.notes||c.reason||''),
 provider_status:Boolean(c.provider)
 };
}
function build(req,booking){
 const permissions=req.user.permissions||[];
 const canChats=permissions.includes('chats.view');
 const canCalls=permissions.includes('calls.view');
 if(!canChats&&!canCalls)throw bad('Communication history permission is required',403);
 const allowPhone=Access.viewPhone(req);
 const pnr=String(booking.pnr);
 const ids=new Set((booking.passengers||[]).map(p=>D.passengerConvId(booking,p)));
 const rows=[];
 if(canChats){
  for(const m of db.col('messages').all()){
   if(!ids.has(str(m.conversation_id))&&
      !(String(m.pnr||'')===pnr&&String(m.schedule_id||booking.schedule_id)===String(booking.schedule_id)))continue;
   const row=normalizeMessage(m,allowPhone);
   if(row)rows.push(row);
  }
 }
 if(canCalls){
  for(const c of db.col('calls').all()){
   if(String(c.pnr)!==pnr)continue;
   if(c.schedule_id!=null&&String(c.schedule_id)!==String(booking.schedule_id))continue;
   rows.push(normalizeCall(c,allowPhone));
  }
 }
 rows.sort((a,b)=>(Date.parse(b.timestamp||0)||0)-(Date.parse(a.timestamp||0)||0)||
  String(b.id).localeCompare(String(a.id)));
 return rows;
}
router.get('/trips/:sid/passengers/:pnr/communications',Auth.can('trips.view'),(req,res)=>{
 try{
  res.set('Cache-Control','private, no-store');res.set('Vary','Authorization, X-View-As');
  const sid=str(req.params.sid),pnr=str(req.params.pnr);
  if(!/^\d{1,18}$/.test(sid)||!pnr||pnr.length>64)throw bad('Invalid trip or PNR');
  const booking=db.col('bookings').find(b=>String(b.schedule_id)===sid&&
   (String(b.pnr)===pnr||String(b.ticket_number)===pnr));
  if(!booking)throw bad('Booking was not found on this trip',404);
  Access.requireBooking(req,booking);
  const requestedSeat=str(req.query.seat||'');
  const selectedPassenger=requestedSeat?(booking.passengers||[]).find(p=>String(p.seat)===requestedSeat):null;
  if(requestedSeat&&!selectedPassenger)throw bad('Passenger seat not found on this booking',404);
  const channel=str(req.query.channel||'all').toLowerCase();
  if(!CHANNELS.includes(channel))throw bad('Unsupported communication channel');
  const page=Number(req.query.page||1),limit=Number(req.query.limit||100);
  if(!Number.isSafeInteger(page)||page<1||page>100000||
     !Number.isSafeInteger(limit)||limit<1||limit>200)throw bad('Invalid page or limit');
  const all=build(req,booking);
  const counts={all:all.length,calls:0,whatsapp:0,sms:0};
  for(const row of all)counts[row.channel]=(counts[row.channel]||0)+1;
  const selected=channel==='all'?all:all.filter(x=>x.channel===channel);
  const offset=(page-1)*limit,results=selected.slice(offset,offset+limit);
  const names=[...new Set((booking.passengers||[]).map(x=>x.name).filter(Boolean))];
  const name=selectedPassenger?.name||booking.contact?.name||names[0]||'Passenger';
  res.json({passenger:{name,pnr:booking.pnr,phone_masked:maskPhone(booking.contact?.phone)},
   counts,permissions:{calls:req.user.permissions.includes('calls.view'),
    whatsapp:req.user.permissions.includes('chats.view'),sms:req.user.permissions.includes('chats.view')},
   channel,page,limit,total:selected.length,has_more:offset+results.length<selected.length,
   rows:results});
 }catch(e){res.status(e.status||500).json({success:false,message:e.status?e.message:'Unable to read communication history'});}
});
module.exports=router;
module.exports.__test={channelOf,directionOf,statusOfMessage,normalizeMessage,normalizeCall,maskPhone};
