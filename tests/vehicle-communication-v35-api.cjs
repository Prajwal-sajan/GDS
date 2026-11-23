'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.GDS_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'gds-history-35-'));
process.env.GDS_RESEED='1';
const app=require('../server/index'),db=require('../server/db'),Auth=require('../server/auth'),D=require('../server/domain');
const normalize=require('../server/api/communication-history-v35').__test;
const owner=db.col('users').find(x=>x.role==='owner');
const agent=db.col('users').find(x=>x.role==='agent');
const schedule=db.col('schedules').all()[0];assert.ok(owner&&agent&&schedule);
const fakePn='COMM35CASE',phone='9951234452';
const booking=db.col('bookings').insert({
  schedule_id:schedule.id,route_id:schedule.route_id,travel_date:schedule.travel_date,
  pnr:fakePn,ticket_number:'996635',contact:{name:'Raghu Teja Kanchiraju',phone},
  passengers:[{name:'Raghu Teja Kanchiraju',seat:'15U'},{name:'Raghu Teja Kanchiraju',seat:'16U'}],
  booked_by:{phone:owner.phone,name:owner.name,role:owner.role},status:'confirmed',source:'branch'
});
const conv1=D.passengerConvId(booking,booking.passengers[0]),conv2=D.passengerConvId(booking,booking.passengers[1]);
db.col('messages').insert({conversation_id:conv1,phone,channel:'whatsapp',direction:'out',
  text:'Ticket message A',ts:'2026-11-22T14:25:03Z',delivery_status:'sent',read:false});
const readOnly=db.col('messages').insert({conversation_id:conv1,phone,channel:'whatsapp',direction:'out',
  text:'Local message — not provider read',ts:'2026-11-22T14:24:53Z',read:true});
db.col('messages').insert({conversation_id:conv2,phone,channel:'whatsapp',direction:'out',
  text:'Ticket message B',ts:'2026-11-22T14:23:38Z',delivery_status:'read',read:true});
db.col('messages').insert({conversation_id:conv2,phone,channel:'sms',direction:'out',
  text:'SMS reminder',ts:'2026-11-22T14:22:05Z',delivery_status:'delivered'});
db.col('messages').insert({conversation_id:conv2,phone,channel:'app',direction:'in',
  text:'Passenger requested help',ts:'2026-11-22T14:21:21Z',read:false});
db.col('calls').insert({pnr:fakePn,schedule_id:schedule.id,phone,kind:'manual',
  direction:'incoming',status:'answered',duration_s:65,notes:'Pickup discussed',ts:'2026-11-22T14:20:17Z'});
db.col('calls').insert({pnr:'UNRELATED35',schedule_id:schedule.id,phone,kind:'manual',
  direction:'outgoing',status:'missed',duration_s:0,ts:'2026-11-22T14:20:17Z'});
db.col('messages').insert({conversation_id:conv1+'_different',phone,channel:'whatsapp',
  direction:'out',ts:'2026-11-22T14:15:00Z',text:'Unrelated conversation'});
const server=app.listen(0);
const base='http://127.0.0.1:'+server.address().port+'/api';
const call=async(url,user=owner,options={})=>{
 const token=Auth.sign({uid:user.id,exp:Date.now()+600000});
 const r=await fetch(base+url,{headers:{Authorization:'Bearer '+token,...options}});
 return {status:r.status,body:await r.json(),headers:r.headers};
};
(async()=>{
 try{
  const url='/trips/'+schedule.id+'/passengers/'+fakePn+'/communications';
  let r=await call(url);
  assert.equal(r.status,200);
  assert.deepEqual(r.body.counts,{all:6,calls:1,whatsapp:3,sms:1,app:1});
  assert.equal(r.body.rows.length,6);
  assert.equal(r.body.passenger.name,'Raghu Teja Kanchiraju');
  assert.equal(r.body.passenger.phone_masked,'995xxxx452');
  assert.match(r.headers.get('cache-control'),/no-store/);
  assert.equal(r.body.rows[0].timestamp,'2026-11-22T14:25:03.000Z');
  assert.equal(r.body.rows[0].status,'Sent');
  assert.equal(r.body.rows.find(x=>x.additional_info.startsWith('Local message')).status,'Recorded',
    'Local read flag is not a WhatsApp provider receipt');
  assert.equal(r.body.rows.find(x=>x.additional_info==='Ticket message B').status,'Read');
  assert.equal(r.body.rows.find(x=>x.additional_info==='SMS reminder').status,'Delivered');
  assert.equal(r.body.rows.find(x=>x.channel==='calls').duration_s,65);
  assert.equal(r.body.rows.find(x=>x.channel==='calls').additional_info,'Pickup discussed');
  assert.equal(r.body.rows.find(x=>x.channel==='app').status,'Received');
  assert.equal(db.col('messages').get(readOnly.id).read,true,'History is read-only');
  r=await call(url+'?channel=whatsapp');
  assert.equal(r.status,200);assert.equal(r.body.total,3);
  assert.ok(r.body.rows.every(x=>x.channel==='whatsapp'));
  r=await call(url+'?channel=calls');
  assert.equal(r.body.total,1);assert.equal(r.body.rows[0].channel,'calls');
  r=await call(url+'?channel=sms');
  assert.equal(r.body.total,1);
  r=await call(url+'?channel=all&page=1&limit=2');
  assert.equal(r.body.rows.length,2);assert.equal(r.body.has_more,true);
  const firstIds=r.body.rows.map(x=>x.id);
  r=await call(url+'?channel=all&page=2&limit=2');
  assert.equal(r.body.rows.length,2);assert.equal(r.body.has_more,true);
  assert.ok(firstIds.every(id=>!r.body.rows.find(x=>x.id===id)));
  r=await call(url+'?channel=all&page=3&limit=2');
  assert.equal(r.body.rows.length,2);assert.equal(r.body.has_more,false);
  r=await call(url+'?channel=bad');assert.equal(r.status,400);
  r=await call(url+'?limit=250');assert.equal(r.status,400);
  r=await call('/trips/'+schedule.id+'/passengers/'+encodeURIComponent('not valid/with slash')+'/communications');assert.equal(r.status,404);
  r=await call('/trips/'+schedule.id+'/passengers/COMM35NONE/communications');assert.equal(r.status,404);
  r=await call(url,agent);
  assert.equal(r.status,403,'Unprivileged operator cannot inspect passenger history');
  r=await call(url,owner,{'X-View-As':String(agent.id)});
  assert.equal(r.status,403,'View-as cannot escalate communication access');
  assert.equal(normalize.statusOfMessage({read:true},'outgoing'),'Recorded');
  assert.equal(normalize.statusOfMessage({delivery_status:'read'},'outgoing'),'Read');
  assert.equal(normalize.channelOf('sms'),'sms');
  assert.equal(normalize.channelOf('app'),'app');
  assert.equal(normalize.maskPhone('919951234452'),'995xxxx452');
  assert.equal(normalize.normalizeCall({duration_s:22,status:'answered'},false).duration_s,22);
  console.log('PASS v35 API: strict PNR/schedule and permission scope, all channel records, masked phone, counts, paging, real statuses, no read side effects, and view-as isolation');
 }finally{
  server.closeAllConnections?.();server.close();db.persistNow();
  fs.rmSync(process.env.GDS_DATA_DIR,{recursive:true,force:true});
 }
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
