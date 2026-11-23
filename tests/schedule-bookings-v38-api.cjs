'use strict';
/* v38 integration acceptance — seed isolated data; never mutate a real operator DB. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.GDS_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'gds-v38-bookings-'));
process.env.GDS_RESEED='1';
const app=require('../server/index');
const db=require('../server/db'),D=require('../server/domain'),U=require('../server/util');
const Auth=require('../server/auth');
const owner=db.col('users').find(u=>u.role==='owner');
const viewer=db.col('users').find(u=>['driver','viewer','helper'].includes(u.role))||db.col('users').insert({phone:'9988776655',name:'Isolated QA Viewer',role:'viewer',status:'ACTIVE',extra_permissions:[]});
assert.ok(owner,'Missing seeded owner');
const server=app.listen(0);
const base='http://127.0.0.1:'+server.address().port+'/api';
async function request(method,url,body,user=owner){
 const token=Auth.sign({uid:user.id,exp:Date.now()+900000});
 const response=await fetch(base+url,{
  method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 const text=await response.text();
 try{return {status:response.status,body:JSON.parse(text)}}
 catch(e){return {status:response.status,body:text}}
}
const get=(url,user)=>request('GET',url,null,user);
const enc=x=>encodeURIComponent(String(x));
const bookingUrl=b=>'/bookings/'+enc(b.pnr);
(async()=>{
 try{
  const bookings=db.col('bookings').filter(b=>b.status==='confirmed'&&b.travel_date>=U.today()&&
   b.passengers.some(p=>p.status!=='cancelled'));
  assert.ok(bookings.length>5,'Expected future confirmed seeded bookings');
  let sample=null,stages=null;
  for(const b of bookings.slice(0,300)){
   const r=await get(bookingUrl(b)+'/stops');
   if(r.status===200&&r.body.pickups.length&&r.body.drops.length){sample=b;stages=r.body;break}
  }
  assert.ok(sample,'Expected booking with eligible pickup/drop stages');
  const prefix=bookingUrl(sample);
  assert.equal(stages.pnr,sample.pnr);
  assert.ok(stages.pickups.every(s=>String(s.city_id)===String(sample.from_city_id)));
  assert.ok(stages.drops.every(s=>String(s.city_id)===String(sample.to_city_id)));
  const source=await get(prefix);
  assert.equal(source.status,200);
  const audit=await get(prefix+'/history');
  assert.equal(audit.status,200);
  assert.ok(audit.body.events.some(x=>x.kind==='created'&&x.title==='Booking Created'));
  assert.ok(audit.body.events.every(x=>x.at&&x.actor),'Every returned event has actual timestamp and source');
  if(sample.fare.discount>0)assert.ok(audit.body.events.some(x=>x.kind==='discount'));

  const badComment=await request('POST',prefix+'/comments',{text:'   '});
  assert.equal(badComment.status,400);
  const goodComment=await request('POST',prefix+'/comments',{text:'Internal boarding note v38'});
  assert.equal(goodComment.status,200);
  assert.ok(goodComment.body.some(c=>c.text==='Internal boarding note v38'));
  const afterComment=await get(prefix+'/history');
  assert.ok(afterComment.body.events.some(x=>x.kind==='comment'));
  assert.equal((await get(prefix+'/history',viewer)).status,403);
  assert.equal((await get(prefix+'/stops',viewer)).status,403);

  const live=(sample.passengers||[]).filter(p=>p.status!=='cancelled');
  const originals=live.map(p=>({seat:p.seat,name:p.name,age:p.age,gender:p.gender}));
  const editInput={
   contact:{...sample.contact,phone:'9876543210',name:sample.contact.name,email:'v38@example.com'},
   passengers:live.map(p=>({seat:p.seat,name:'Edited '+String(p.name).slice(0,90),
    age:Math.min(90,Number(p.age)||25),gender:'F'})),
   boarding_stage_id:stages.pickups[0].id,dropping_stage_id:stages.drops[0].id
  };
  const badGender=await request('PUT',prefix,{...editInput,passengers:editInput.passengers.map(p=>({...p,gender:'invalid'}))});
  assert.equal(badGender.status,400);
  const badStop=await request('PUT',prefix,{...editInput,boarding_stage_id:stages.drops[0].id});
  assert.equal(badStop.status,400);
  const saved=await request('PUT',prefix,editInput);
  assert.equal(saved.status,200,JSON.stringify(saved.body));
  assert.equal(saved.body.contact.email,'v38@example.com');
  assert.equal(saved.body.passengers.find(p=>String(p.seat)===String(live[0].seat)).gender,'F');
  assert.ok((await get(prefix+'/history')).body.events.some(x=>x.kind==='edit'));
  assert.equal((await request('PUT',prefix,editInput,viewer)).status,403);

  // Choose a future date and one direction-compatible, free target service.
  let chosen=null,free=null;
  for(let delta=1;delta<=5;delta++){
   const date=U.addDays(U.today(),delta);
   const r=await get(prefix+'/shift-options?date='+enc(date));
   assert.equal(r.status,200,JSON.stringify(r.body));
   assert.equal(r.body.date,date);
   for(const s of r.body.services){
    const inventory=await get(prefix+'/shift-seats?schedule_id='+enc(s.id));
    if(inventory.status===200&&inventory.body.seats.length>=live.length){
     chosen=s;free=inventory.body.seats;break;
    }
   }
   if(chosen)break;
  }
  assert.ok(chosen,'Expected a route-compatible future service with free seats');
  assert.ok(free.every(s=>typeof s.seat==='string'));
  const assigned=free.slice(0,live.length).map(s=>s.seat);
  const mapping=Object.fromEntries(live.map((p,i)=>[p.seat,assigned[i]]));
  const notAll=await request('POST',prefix+'/shift',{schedule_id:chosen.id,seat_map:{}});
  assert.equal(notAll.status,400);
  if(live.length>1){
   const duplicate=await request('POST',prefix+'/shift',{schedule_id:chosen.id,
    seat_map:Object.fromEntries(live.map(p=>[p.seat,assigned[0]]))});
   assert.equal(duplicate.status,400);
  }
  const invalid=await request('POST',prefix+'/shift',{schedule_id:chosen.id,
   seat_map:Object.fromEntries(live.map((p,i)=>[p.seat,i?'9999':'9998']))});
  assert.ok([400,409].includes(invalid.status));
  const shifted=await request('POST',prefix+'/shift',{schedule_id:chosen.id,seat_map:mapping});
  assert.equal(shifted.status,200,JSON.stringify(shifted.body));
  assert.equal(String(shifted.body.schedule_id),String(chosen.id));
  assert.equal(shifted.body.travel_date,chosen.travel_date);
  assert.ok(assigned.every(s=>shifted.body.passengers.some(p=>p.seat===s)));
  const shiftHistory=await get(prefix+'/history');
  assert.ok(shiftHistory.body.events.some(x=>x.kind==='shift'));
  const updated=await get(prefix);
  assert.equal(updated.body.schedule_id,chosen.id);
  const seatsAfter=await get(prefix+'/shift-seats?schedule_id='+enc(chosen.id));
  assert.equal(seatsAfter.status,200);
  // Verify that the target inventory registers the shifted passengers.
  const seatMap=D.seatMap(db.col('schedules').get(chosen.id),sample.from_city_id,sample.to_city_id);
  const statuses=seatMap.decks.flatMap(d=>d.seats).filter(s=>assigned.includes(s.code));
  assert.ok(statuses.every(s=>s.booking&&s.booking.pnr===sample.pnr));

  const cancelled=db.col('bookings').find(b=>b.status==='confirmed'&&
   b.schedule_id!==chosen.id&&b.passengers.some(p=>p.status!=='cancelled'));
  if(cancelled){
   const seat=cancelled.passengers.find(p=>p.status!=='cancelled').seat;
   const cURL=bookingUrl(cancelled);
   const bad=await request('POST',cURL+'/cancel',{seats:['UNOWNED-SEAT'],by:'operator',notify:false});
   assert.equal(bad.status,400);
   const after=await get(cURL);
   assert.equal(after.body.cancellations?.length||0,cancelled.cancellations?.length||0);
  }
  console.log('PASS v38 API: secured ticket stops, booked audit events, validated comments, schema and stage edits, shift service/seat eligibility, duplicate/invalid selection rejection, verified inventory mutation and role access');
 }finally{
  server.closeAllConnections?.();server.close();
  db.persistNow();fs.rmSync(process.env.GDS_DATA_DIR,{recursive:true,force:true});
 }
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
