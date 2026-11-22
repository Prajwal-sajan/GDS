'use strict';
// Incremental, API-enforced controls for screenshot matrix v27.
// Scope-grant metadata is NOT interpreted as a blanket ability to see other branches.
const db=require('./db'),A=require('./auth'),D=require('./domain');
const {byLabel}=require('./team-access-schema-v27');
function lookup(user,label){
 const row=byLabel.get(label);
 if(!row||!user)return null;
 const role=A.roles()[user.role]||{};
 return {row,role,selected:role.matrix_v27?.[row.key]??null};
}
function explicitAccess(req,label){
 const me=db.col('users').get(req.user?.id);
 const m=lookup(me,label);
 if(!m)return null;
 if(m.row.roleImpossible.includes(me.role)&&m.role.matrix_v27)
  throw D.httpErr(403,'Action is unavailable for this role: '+label);
 if(m.selected===null)return null; // Keep legacy modules working until role edited.
 if(m.selected==='Off')throw D.httpErr(403,'Permission denied: '+label);
 if(m.selected==='Own'||m.selected==='Branch')
  return m.selected; // Operation's row scope must also be constrained by its resource handler.
 return m.selected;
}
function limit(req,key){
 const me=db.col('users').get(req.user?.id);
 const value=A.roles()[me?.role]?.limits?.[key];
 return value===null||value===undefined?'':value;
}
function checkCancel(req,booking){
 explicitAccess(req,'Cancel tickets');
 const cutoff=limit(req,'cancel_cutoff_hours');
 if(cutoff==='')return;
 const schedule=db.col('schedules').get(booking?.schedule_id);
 if(!schedule)throw D.httpErr(404,'Schedule not found');
 const depart=Date.parse(schedule.travel_date+'T'+schedule.departure_time+':00');
 if(!Number.isFinite(depart))throw D.httpErr(409,'Cannot evaluate departure cut-off');
 if((depart-Date.now())/3600000<Number(cutoff))
  throw D.httpErr(403,'Cancellation requires at least '+cutoff+' hours before departure');
}
function checkBlock(req,seats,action){
 if(action==='unblock'){explicitAccess(req,'Unblock seats / book a blocked seat');return null;}
 explicitAccess(req,'Block seats');
 if(!Array.isArray(seats)||!seats.length||seats.some(x=>typeof x!=='string'))
  throw D.httpErr(400,'Choose valid seats to block');
 const maximum=limit(req,'block_max_seats');
 if(maximum!==''&&new Set(seats).size>Number(maximum))
  throw D.httpErr(403,'Seat block exceeds '+maximum+' seats');
 const hours=limit(req,'block_max_hours');
 if(hours==='')return null;
 const n=Number(req.body?.duration_hours??hours);
 if(!Number.isFinite(n)||n<=0||n>Number(hours))
  throw D.httpErr(400,'Block duration must be within '+hours+' hours');
 return new Date(Date.now()+n*3600000).toISOString();
}
function checkOnBehalf(req,body){
 if(req.user.role!=='agent'&&body.agent_phone)explicitAccess(req,'Book on behalf of agents');
}
function checkComment(req){explicitAccess(req,'Add comments to a PNR');}
function viewPhone(req){
 try{const result=explicitAccess(req,'See passenger phone numbers');return result!=='Off';}
 catch(e){if(e.status===403)return false;throw e;}
}
function bookingAllowed(req,booking,label='View bookings'){
 const selected=explicitAccess(req,label);
 if(selected===null||selected==='Company'||selected==='On')return true;
 const me=db.col('users').get(req.user?.id);
 if(!me||!booking)return false;
 if(selected==='Own')return booking.booked_by?.phone===me.phone||booking.agent_phone===me.phone;
 if(selected==='Branch')return !!me.branch_id&&String(booking.branch_id)===String(me.branch_id);
 return false;
}
function requireBooking(req,booking,label='View bookings'){
 if(!booking)throw D.httpErr(404,'Booking not found');
 if(!bookingAllowed(req,booking,label))throw D.httpErr(403,'Booking is outside your allowed '+label+' scope');
 return booking;
}
function maskedBooking(booking,allowed){
 if(allowed)return booking;
 const b=JSON.parse(JSON.stringify(booking));
 if(b.contact?.phone)b.contact.phone='••••••••••';
 if(b.agent_phone)b.agent_phone='••••••••••';
 if(b.passengers)for(const p of b.passengers)if(p.phone)p.phone='••••••••••';
 return b;
}
module.exports={lookup,explicitAccess,limit,checkCancel,checkBlock,checkOnBehalf,checkComment,viewPhone,maskedBooking,bookingAllowed,requireBooking};
