'use strict';
/* v39: Loyalty seat-upgrade offers with explicit passenger-consent acceptance.
 * A pending OFFERED badge never modifies the seat. Applied moves are revalidated
 * against current inventory within a synchronous single-process DB mutation.
 * No OTA or passenger-provider acknowledgement is claimed without evidence. */
const express=require('express');
const db=require('../db'),D=require('../domain'),U=require('../util'),L=require('../loyalty-v34');
const {can}=require('../auth'),Policy=require('../access-runtime-v27');
const r=express.Router(),OFFER_MS=5*60*1000;
const ERR=(status,msg)=>D.httpErr(status,msg);
const h=fn=>(req,res)=>{try{res.set('Cache-Control','private,no-store');res.set('Vary','Authorization, X-View-As');res.json(fn(req))}
catch(e){res.status(e.status||500).json({success:false,message:e.message})}};
function localBoardTime(schedule,stage){
 const d=String(schedule.travel_date);
 const hm=String(stage.time||'');
 if(!/^\d{4}-\d\d-\d\d$/.test(d)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(hm))throw ERR(409,'Invalid boarding time');
 const day=Number(stage.day||1);
 const t=Date.parse(d+'T00:00:00Z')+(day-1)*86400000+
  (Number(hm.slice(0,2))*60+Number(hm.slice(3))-330)*60000;
 return t;
}
function findBooking(sid,pnr,seat){
 const b=db.col('bookings').find(x=>String(x.pnr)===String(pnr)&&String(x.schedule_id)===String(sid));
 if(!b)throw ERR(404,'Booking not found on this trip');
 const p=(b.passengers||[]).find(x=>String(x.seat)===String(seat)||
  (String(x.seat_upgrade?.from_seat)===String(seat)&&x.seat_upgrade?.status==='applied'));
 if(!p)throw ERR(404,'Passenger seat not found on this booking');
 return {b,p};
}
function checkEligible(b,p,now=Date.now()){
 const cfg=L.read();
 if(!cfg.general.is_active||!cfg.seat_upgrades.enabled)throw ERR(409,'Loyalty seat upgrades are not enabled');
 if(b.status!=='confirmed'||b.payment!=='paid'||p.status==='cancelled')throw ERR(409,'Only confirmed paid active passengers qualify');
 const s=db.col('schedules').get(b.schedule_id);
 const route=db.col('routes').get(b.route_id);
 if(!s||!route||s.status!=='active')throw ERR(409,'Trip is unavailable');
 const stage=route.stages?.find(x=>String(x.id)===String(b.boarding_stage_id));
 if(!stage)throw ERR(409,'Boarding stage is not configured');
 const when=localBoardTime(s,{...stage,...(s.stage_overrides?.[stage.id]||{})});
 const mins=Math.max(1,Number(cfg.seat_upgrades.minutes_before_boarding)||20);
 if(when<=now||when-now>mins*60000)throw ERR(409,'Seat upgrades are offered only within '+mins+' minutes before boarding');
 const customer=db.col('customers').find(x=>String(x.phone)===String(b.contact.phone));
 if(!customer||!['Silver','Gold','Platinum'].includes(String(customer.tier)))throw ERR(409,'Passenger is not in an eligible loyalty tier');
 return {s,route,customer,boarding_at:when,valid_until:Math.min(now+OFFER_MS,when)};
}
function catalog(b){
 const s=db.col('schedules').get(b.schedule_id);
 const map=D.seatMap(s,b.from_city_id,b.to_city_id);
 return map.decks.flatMap(d=>d.seats.map(x=>({...x,deck:d.deck})));
}
function score(x){
 const sleeper=String(x.type||'').toLowerCase().includes('sleeper')||/[UL]$/.test(String(x.code));
 const lower=String(x.deck||'').toLowerCase().includes('lower');
 return (sleeper?200:0)+(sleeper&&lower?50:0)+Math.max(0,30-(Number(x.row)||0));
}
function reserving(sid,seat,excludePnr,excludeSeat,now){
 return db.col('bookings').filter(b=>String(b.schedule_id)===String(sid))
 .some(b=>(b.passengers||[]).some(p=>
  !(String(b.pnr)===String(excludePnr)&&String(p.seat)===String(excludeSeat))&&
  p.seat_upgrade?.status==='offered'&&String(p.seat_upgrade.to_seat)===String(seat)&&
  Date.parse(p.seat_upgrade.expires_at||0)>now));
}
function choices(b,p,now=Date.now()){
 const seats=catalog(b),orig=seats.find(s=>String(s.code)===String(p.seat));
 if(!orig)throw ERR(409,'Current passenger seat does not exist on this coach');
 const base=score(orig);
 return seats.filter(s=>s.status==='available'&&score(s)>base&&
  !reserving(b.schedule_id,s.code,b.pnr,p.seat,now))
  .sort((a,z)=>score(z)-score(a)).map(x=>({seat:x.code,deck:x.deck,type:x.type,
   row:x.row,improvement_score:score(x)-base}));
}
function activeOffer(p,now){
 const offer=p.seat_upgrade;
 return offer?.status==='offered'&&Date.parse(offer.expires_at)>now?offer:null;
}
function offer(b,p,target,actor,now=Date.now()){
 const eligible=checkEligible(b,p,now);
 if(activeOffer(p,now))throw ERR(409,'Passenger already has an active seat-upgrade offer');
 if(p.seat_upgrade?.status==='applied')throw ERR(409,'Passenger already upgraded');
 const opts=choices(b,p,now);
 if(!opts.find(x=>String(x.seat)===String(target)))throw ERR(409,'Selected upgrade seat is not currently eligible or available');
 const item={status:'offered',from_seat:String(p.seat),to_seat:String(target),
  offered_at:new Date(now).toISOString(),expires_at:new Date(eligible.valid_until).toISOString(),
  loyalty_tier:eligible.customer.tier,offered_by:actor?.name||'Automated loyalty rule'};
 p.seat_upgrade=item;
 db.persist();
 D.audit('schedule',b.schedule_id,'bookings',{op:'loyalty_upgrade_offer',pnr:b.pnr,
  from_seat:item.from_seat,to_seat:item.to_seat,expires_at:item.expires_at},actor);
 return item;
}
function accept(b,p,consent,actor,now=Date.now()){
 const a=activeOffer(p,now);
 if(!a)throw ERR(409,'Seat-upgrade offer is expired or not pending');
 if(!consent||consent.confirmed!==true)throw ERR(400,'Passenger consent must be explicitly confirmed');
 const method=String(consent.method||'');
 const reference=String(consent.reference||'').trim();
 if(!['phone','chat','in_person','authorized_provider'].includes(method)||reference.length<4||reference.length>160)
  throw ERR(400,'Record the consent channel and a reference of at least four characters');
 checkEligible(b,p,now);
 if(String(p.seat)!==String(a.from_seat))throw ERR(409,'Passenger seat changed after upgrade offer');
 const available=choices(b,p,now);
 if(!available.some(x=>String(x.seat)===String(a.to_seat)))throw ERR(409,'Upgrade seat is no longer available; offer must be reissued');
 const prior=p.seat;
 p.seat=a.to_seat;
 p.seat_upgrade={...a,status:'applied',applied_at:new Date(now).toISOString(),
  consent_method:method,consent_reference:reference,
  applied_by:actor?.name||'Authorized operator'};
 db.persist();
 D.audit('schedule',b.schedule_id,'bookings',{op:'loyalty_upgrade_apply',
  pnr:b.pnr,from_seat:prior,to_seat:p.seat,consent_method:method,
  consent_reference:reference},actor);
 D.notify('booking.modified',b);
 return p.seat_upgrade;
}
function decline(b,p,actor,reason,now=Date.now()){
 if(!activeOffer(p,now))throw ERR(409,'No active offer to decline');
 p.seat_upgrade={...p.seat_upgrade,status:'declined',declined_at:new Date(now).toISOString(),
  declined_by:actor?.name||'Operator',reason:String(reason||'Passenger declined').slice(0,160)};
 db.persist();
 D.audit('schedule',b.schedule_id,'bookings',{op:'loyalty_upgrade_decline',pnr:b.pnr,
  from_seat:p.seat_upgrade.from_seat,to_seat:p.seat_upgrade.to_seat},actor);
 return p.seat_upgrade;
}
function getScoped(req,mutation=false){
 const {b,p}=findBooking(req.params.sid,req.params.pnr,req.params.seat);
 Policy.requireBooking(req,b,mutation?'Edit passengers & points':'View bookings');
 return {b,p};
}
r.get('/trips/:sid/loyalty-upgrades/:pnr/:seat',can('bookings.view_all'),h(req=>{
 const {b,p}=getScoped(req);let options=[],reason=null,expires=null;
 try{const check=checkEligible(b,p);options=choices(b,p);expires=new Date(check.valid_until).toISOString()}
 catch(e){reason=e.message}
 return {pnr:b.pnr,current_seat:p.seat,offer:p.seat_upgrade||null,options,reason,offer_expires_at:expires,
  requires_passenger_consent:true};
}));
r.post('/trips/:sid/loyalty-upgrades/:pnr/:seat/offer',can('bookings.modify'),h(req=>{
 const {b,p}=getScoped(req,true);
 return {pnr:b.pnr,offer:offer(b,p,req.body?.target_seat,req.user)};
}));
r.post('/trips/:sid/loyalty-upgrades/:pnr/:seat/accept',can('bookings.modify'),h(req=>{
 const {b,p}=getScoped(req,true);
 return {pnr:b.pnr,offer:accept(b,p,{confirmed:req.body?.consent_confirmed===true,
  method:req.body?.consent_method,reference:req.body?.consent_reference},req.user),new_seat:p.seat};
}));
r.post('/trips/:sid/loyalty-upgrades/:pnr/:seat/decline',can('bookings.modify'),h(req=>{
 const {b,p}=getScoped(req,true);
 return {pnr:b.pnr,offer:decline(b,p,req.user,req.body?.reason)};
}));
function scanAutoOffers(now=Date.now()){
 const cfg=L.read();if(!cfg.general.is_active||!cfg.seat_upgrades.enabled)return 0;
 let created=0;
 for(const b of db.col('bookings').all()){
  if(b.status!=='confirmed'||b.payment!=='paid')continue;
  const s=db.col('schedules').get(b.schedule_id);
  if(!s||s.status!=='active'||Math.abs(Date.parse(s.travel_date+'T00:00:00Z')-now)>2*86400000)continue;
  for(const p of b.passengers||[]){
   if(p.status==='cancelled'||p.seat_upgrade)continue; // no repeated automatic offers
   try{
    checkEligible(b,p,now);
    const target=choices(b,p,now)[0];
    if(target){offer(b,p,target.seat,{name:'Automated loyalty offer',role:'system'},now);created++;}
   }catch(e){/* Ineligible or no improvement: no fake offer. */}
  }
 }
 return created;
}
module.exports={router:r,scanAutoOffers,choices,checkEligible,offer,accept,decline,localBoardTime};
