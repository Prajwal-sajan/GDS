(function checkAccessScreenshotV27(){
'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const schema=require('../server/team-access-schema-v27');
assert.equal(schema.ROWS.length,13,'13 screenshot sections');
assert.equal(schema.ALL_ROWS.length,89,'89 distinct screenshot controls');
assert.equal(schema.ROLE_COLUMNS.length,10,'Ten role columns');
assert.ok(schema.byLabel.has('Book on behalf of agents'));
assert.ok(schema.byLabel.has('Export / download'));
assert.ok(schema.byLabel.has('Change cancellation rules'));
assert.ok(schema.byLabel.has('See passenger phone numbers'));
assert.ok(schema.byLabel.has('Assign crew (driver, conductor, helper)'));
assert.equal(schema.byLabel.get('Cancel tickets').limit,'cancel_cutoff_hours');
assert.equal(schema.byLabel.get('Block seats').limit,'seat_block');
assert.ok(schema.byLabel.get('Delete routes').roleImpossible.includes('agent'));
process.env.GDS_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'gds-roles27-'));
process.env.GDS_RESEED='1';
const app=require('../server/index'),db=require('../server/db'),A=require('../server/auth');
const owner=db.col('users').find(x=>x.role==='owner')||db.col('users').insert({phone:'9999999999',name:'Owner',role:'owner',status:'ACTIVE'});
const manager=db.col('users').find(x=>x.role==='manager')||db.col('users').insert({phone:'9876543123',name:'Test Manager',role:'manager',status:'ACTIVE'});
const token=(id)=>A.sign({uid:id,exp:Date.now()+500000});
let server;
(async()=>{
 server=app.listen(0);
 const base='http://127.0.0.1:'+server.address().port;
 async function request(method,url,body,id=owner.id){
  const headers={Authorization:'Bearer '+token(id)};if(body!==undefined)headers['Content-Type']='application/json';
  const response=await fetch(base+'/api'+url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,data:await response.json().catch(()=>null)};
 }
 const get=(p,id)=>request('GET',p,undefined,id),put=(p,b,id)=>request('PUT',p,b,id),post=(p,b,id)=>request('POST',p,b,id);
 try{
  const first=await get('/team-access/v26');
  assert.equal(first.status,200);
  assert.equal(first.data.matrix_version,27);
  assert.equal(first.data.matrix.length,13);
  assert.equal(first.data.matrix.flatMap(s=>s.rows).length,89);
  assert.equal(first.data.matrix_limit_fields.cancel_cutoff_hours.unit,'h');
  let revision=first.data.matrix_revision;
  const managerSession=db.col('auth_sessions').insert({user_id:manager.id,last_seen:new Date().toISOString(),revoked_at:null});
  const matrix={
    'Cancel tickets':'Company',
    'View bookings':'Company',
    'See passenger phone numbers':'Off',
    'Add comments to a PNR':'Off',
    'Book on behalf of agents':'Off',
    'Block seats':'On'
  };
  let response=await put('/team-access/v26/roles/batch',{
   base_revision:revision,roles:[{key:'manager',matrix,limits:{
    cancel_cutoff_hours:24,block_max_seats:1,block_max_hours:1
   }}]
  });
  assert.equal(response.status,200,'Matrix save '+JSON.stringify(response.data));
  revision=response.data.matrix_revision;
  assert.equal(revision,1);
  assert.ok(response.data.revoked_sessions>=1,'All active manager sessions are revoked');
  assert.ok(db.col('auth_sessions').get(managerSession.id).revoked_at);
  const saved=A.roles().manager;
  assert.equal(saved.matrix_v27[schema.byLabel.get('Cancel tickets').key],'Company');
  assert.equal(saved.matrix_v27[schema.byLabel.get('View bookings').key],'Company');
  assert.equal(saved.matrix_v27[schema.byLabel.get('See passenger phone numbers').key],'Off');
  assert.equal(saved.limits.cancel_cutoff_hours,24);
  assert.equal(saved.limits.block_max_seats,1);
  assert.equal(saved.limits.block_max_hours,1);
  response=await put('/team-access/v26/roles/batch',{
   base_revision:0,roles:[{key:'manager',matrix:{'View bookings':'Own'}}]
  });
  assert.equal(response.status,409,'Stale save is rejected');
  assert.equal((await put('/team-access/v26/roles/batch',{
   base_revision:revision,roles:[{key:'driver',matrix:{'Add comments to a PNR':'On'}}]
  })).status,403,'Dashes cannot be elevated by forged POST');
  assert.equal((await put('/team-access/v26/roles/batch',{
   base_revision:revision,roles:[{key:'manager',matrix:{'Cancel tickets':'Bad'}}]
  })).status,400);
  assert.equal((await put('/team-access/v26/roles/batch',{
   base_revision:revision,roles:[{key:'manager',matrix:{},limits:{block_max_seats:900}}]
  })).status,400);
  assert.equal(A.roles().manager.limits.block_max_seats,1,'Validation errors do not mutate policy');
  const booking=db.col('bookings').find(b=>b.status==='confirmed'&&db.col('schedules').get(b.schedule_id));
  assert.ok(booking,'Seed has an active booking');
  const q=booking.pnr.slice(0,5);
  response=await get('/bookings/search?q='+encodeURIComponent(q),manager.id);
  assert.equal(response.status,200);
  assert.ok(response.data.results.length,'Booking search has results');
  assert.ok(response.data.results.every(x=>x.phone==='••••••••••'),'Phone numbers masked');
  response=await get('/bookings/'+encodeURIComponent(booking.pnr),manager.id);
  assert.equal(response.status,200);
  assert.equal(response.data.contact.phone,'••••••••••');
  const note=await post('/bookings/'+encodeURIComponent(booking.pnr)+'/comments',{text:'Should be denied'},manager.id);
  assert.equal(note.status,403,'Comments are blocked independently');
  assert.equal((await post('/bookings',{agent_phone:'9876543215'},manager.id)).status,403,'On-behalf booking blocked');
  const schedule=db.col('schedules').get(booking.schedule_id);
  const initialBlocks=(schedule.seat_blocks||[]).length;
  response=await post('/schedules/'+schedule.id+'/blocks',{seats:['X1','X2'],reason:'v27 QA'},manager.id);
  assert.equal(response.status,403,'Block seat count is enforced');
  assert.equal((schedule.seat_blocks||[]).length,initialBlocks,'Rejected block does not mutate seats');
  response=await post('/schedules/'+schedule.id+'/blocks',{seats:['X1'],reason:'v27 QA'},manager.id);
  assert.equal(response.status,200,'Allowed block succeeds');
  assert.ok(schedule.seat_blocks.at(-1).expires_at,'Block expiry is persisted');
  const originalDate=schedule.travel_date,originalDeparture=schedule.departure_time;
  schedule.travel_date='2026-11-22';schedule.departure_time='00:00';
  response=await post('/bookings/'+encodeURIComponent(booking.pnr)+'/cancel',{by:'operator'},manager.id);
  assert.equal(response.status,403,'Cancel cutoff enforced before booking cancellation');
  schedule.travel_date=originalDate;schedule.departure_time=originalDeparture;
  assert.equal(db.col('bookings').find(x=>x.id===booking.id).status,'confirmed','Cancellation denied before mutation');
  response=await put('/team-access/v26/roles/batch',{base_revision:revision,roles:[{key:'manager',matrix:{'View bookings':'Own'}}]});
  assert.equal(response.status,200);
  const other=db.col('bookings').find(b=>b.booked_by?.phone!==manager.phone);
  assert.ok(other);
  assert.equal((await get('/bookings/'+other.pnr,manager.id)).status,403,'Own scope blocks other booking');
  response=await get('/bookings/search?q='+encodeURIComponent(q),manager.id);
  assert.equal(response.status,200);
  assert.ok(response.data.results.every(x=>x.phone==='••••••••••'));
  console.log('PASS v27: 13 sections, 89 rows, 10 roles, disabled role cells, limits, concurrency, revocation, PII masking, Own booking scopes, safe cancellation and seat-block actions');
 }finally{
  await new Promise(resolve=>server.close(resolve));
  db.persistNow();
  fs.rmSync(process.env.GDS_DATA_DIR,{recursive:true,force:true});
 }
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
})();