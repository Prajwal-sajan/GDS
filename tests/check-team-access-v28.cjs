'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gds-access-v28-'));
process.env.GDS_DATA_DIR=tmp;process.env.GDS_RESEED='1';
const app=require('../server/index'),db=require('../server/db'),A=require('../server/auth');
const schema=require('../server/team-access-schema-v27'),Policy=require('../server/team-access-policy-v28');
const owner=db.col('users').find(u=>u.role==='owner')||db.col('users').insert({name:'Owner',phone:'9999999999',role:'owner',status:'ACTIVE'});
const manager=db.col('users').find(u=>u.role==='manager')||db.col('users').insert({name:'Manager',phone:'9999999998',role:'manager',status:'ACTIVE'});
const token=id=>A.sign({uid:id,exp:Date.now()+3600000});
const server=app.listen(0);
const base='http://127.0.0.1:'+server.address().port+'/api';
async function call(method,url,body,id=owner.id){
 const headers={authorization:'Bearer '+token(id)};
 if(body!==undefined)headers['content-type']='application/json';
 const response=await fetch(base+url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 const result=await response.json().catch(()=>({}));
 return {status:response.status,data:result};
}
const get=(url,id)=>call('GET',url,undefined,id),post=(url,body,id)=>call('POST',url,body,id),
 put=(url,body,id)=>call('PUT',url,body,id),del=(url,id)=>call('DELETE',url,undefined,id);
const action=label=>schema.byLabel.get(label)?.key;
(async()=>{
 try{
  assert.equal(schema.ALL_ROWS.length,89);
  assert.deepEqual(schema.byLabel.get('View call history').choices,['Off','Own','Company']);
  assert.deepEqual(schema.byLabel.get('Daily report').choices,['Off','Branch','Company']);
  assert.deepEqual(schema.byLabel.get('View users').choices,['Off','Branch','Company']);
  const cat=await get('/team-access/v28/catalog');
  assert.equal(cat.status,200);
  assert.equal(cat.data.actions.length,89);
  assert.equal(cat.data.templates.length,4);
  assert.equal((await post('/team-access/v28/rules',{
   name:'Invalid elevation',effect:'allow',action_key:action('Book tickets'),subject_type:'role',
   subject_id:'manager',condition:{kind:'always'}
  })).status,400,'Rules cannot grant permissions');
  const role=await post('/team-access/v26/roles',{name:'Night Supervisor QA',starts_from:'booking_executive'});
  assert.equal(role.status,200);
  assert.deepEqual(role.data.permissions,A.roles().booking_executive.permissions,'New role Starts from clones grants');
  assert.equal(role.data.starts_from,'booking_executive');
  assert.equal((await post('/team-access/v26/roles',{name:'Illegal Owner Clone',starts_from:'owner'})).status,400);
  const initial=await get('/team-access/v28/groups');
  assert.equal(initial.status,200);
  const created=await post('/team-access/v28/groups',{name:'Night-pickup-team'});
  assert.equal(created.status,200);const group=created.data;
  assert.equal((await post('/team-access/v28/groups',{name:'night-PICKUP-TEAM'})).status,409);
  const session=db.col('auth_sessions').insert({user_id:manager.id,revoked_at:null,last_seen:new Date().toISOString()});
  const members=await put('/team-access/v28/groups/'+group.id,{name:group.name,description:'QA group',user_ids:[manager.id]});
  assert.equal(members.status,200);
  assert.equal(members.data.user_ids.length,1);
  assert.ok(members.data.revoked_sessions>=1,'Membership changes revoke active sessions');
  assert.ok(db.col('auth_sessions').get(session.id).revoked_at);
  assert.ok(Policy.groupsFor(manager).some(x=>x.id===group.id));
  const cancel=await post('/team-access/v28/rules',{
   name:'No cancelling within 2 h of departure',template_id:'cancel_before_2h',
   subject_type:'group',subject_id:group.id,action_key:action('Cancel tickets'),
   effect:'deny',condition:{kind:'departure_within_hours',hours:2},limits:{}
  });
  assert.equal(cancel.status,200,JSON.stringify(cancel.data));
  const badRemove=await del('/team-access/v28/groups/'+group.id);
  assert.equal(badRemove.status,409,'Do not silently remove a restricted group');
  const blocked=await post('/team-access/v28/test',{phone:manager.phone,action_key:action('Cancel tickets'),
   situation:{hours_before_departure:1}});
  assert.equal(blocked.status,200,JSON.stringify(blocked.data));
  assert.equal(blocked.data.decision,'deny','Rules override parent role');
  assert.ok(blocked.data.reasons.some(x=>x.includes('No cancelling')));
  assert.ok(blocked.data.groups.includes(group.name));
  const allowed=await post('/team-access/v28/test',{phone:manager.phone,action_key:action('Cancel tickets'),
   situation:{hours_before_departure:3}});
  assert.equal(allowed.status,200);
  assert.equal(allowed.data.decision,'allow');
  const unknown=await post('/team-access/v28/test',{phone:manager.phone,action_key:action('Cancel tickets'),
   situation:{}});
  assert.equal(unknown.data.decision,'conditional','Missing time makes denial conditional');
  const malformed=await post('/team-access/v28/test',{phone:'notaphone',action_key:action('Cancel tickets')});
  assert.equal(malformed.status,400);
  const notFound=await post('/team-access/v28/test',{phone:'0000000000',action_key:action('Cancel tickets')});
  assert.equal(notFound.status,404,'Nonexistent person is not matched');
  // Check read-only rules on all mutable endpoints, not only matrix UI controls.
  const readOnly=await post('/team-access/v28/rules',{
   name:'Read-only (view everything, change nothing)',template_id:'read_only',
   subject_type:'role',subject_id:'manager',effect:'deny',action_key:'*',
   condition:{kind:'write_action'},limits:{}
  });
  assert.equal(readOnly.status,200);
  assert.equal(Policy.isReadOnly(manager),true);
  assert.equal((await post('/bookings',{schedule_id:123},manager.id)).status,403);
  assert.equal((await post('/team-access/v28/test',{phone:manager.phone,action_key:action('View bookings')},manager.id)).status,200,
   'Read-only users may test permissions');
  const readResult=await post('/team-access/v28/test',{phone:manager.phone,action_key:action('Block seats')});
  assert.equal(readResult.data.decision,'deny');
  assert.equal((await get('/schedules',manager.id)).status,200,'Read-only users retain existing view grants');
  assert.equal((await del('/team-access/v28/rules/'+readOnly.data.id)).status,200);
  assert.equal(Policy.isReadOnly(manager),false);
  // Rule limits cap a real seat-block request even when the role matrix permits it.
  const limit=await post('/team-access/v28/rules',{
   name:'Limit seat blocks (1 seat, 2 h)',subject_type:'role',subject_id:'manager',effect:'limit',
   action_key:action('Block seats'),condition:{kind:'always'},
   limits:{max_seats:1,max_hours:2}
  });assert.equal(limit.status,200);
  const booking=db.col('bookings').find(x=>x.status==='confirmed');
  const schedule=db.col('schedules').get(booking.schedule_id);
  const seatUrl='/schedules/'+schedule.id+'/blocks';
  assert.equal((await post(seatUrl,{seats:['Y1','Y2']},manager.id)).status,403,'Seat limit applies to GDS block mutation');
  assert.equal((await post(seatUrl,{seats:['Y1'],duration_hours:3},manager.id)).status,403,
   'Duration limit applies to GDS block mutation');
  const good=await post(seatUrl,{seats:['Y1'],duration_hours:1,reason:'v28 QA'},manager.id);
  assert.equal(good.status,200,JSON.stringify(good.data));
  assert.ok(schedule.seat_blocks.at(-1).expires_at,'Expiry saved for inventory release');
  assert.equal((await del('/team-access/v28/rules/'+limit.data.id)).status,200);
  // Missing person's corridor tag must fail closed, not silently give block access.
  const route=db.col('routes').get(schedule.route_id);
  const tagUpdate=await put('/team-access/v26/users/'+manager.id,{corridor_tags:['south']});
  assert.equal(tagUpdate.status,200,'Corridor tags can be saved from Edit User');
  assert.deepEqual(tagUpdate.data.corridor_tags,['south']);
  assert.equal((await put('/team-access/v26/users/'+manager.id,
   {corridor_tags:['bad tag with spaces']})).status,400,'Malformed tags rejected');
  const oldTags=route.tags||[];route.tags=['north'];manager.corridor_tags=['south'];
  const corridor=await post('/team-access/v28/rules',{
   name:'Seat blocks only on routes with the person’s corridor tag',subject_type:'role',
   subject_id:'manager',effect:'deny',action_key:action('Block seats'),
   condition:{kind:'corridor_mismatch'},limits:{}
  });assert.equal(corridor.status,200);
  assert.equal((await post(seatUrl,{seats:['Z1']},manager.id)).status,403);
  manager.corridor_tags=['north'];
  assert.equal((await post(seatUrl,{seats:['Z1']},manager.id)).status,200);
  route.tags=oldTags;manager.corridor_tags=[];
  assert.equal((await del('/team-access/v28/rules/'+corridor.data.id)).status,200);
  // Actual cancellation is checked using departure time, not optional test-form values.
  const sched=db.col('schedules').get(booking.schedule_id);
  const oldDate=sched.travel_date,oldTime=sched.departure_time;
  const near=new Date(Date.now()+30*60000);
  const pad=n=>String(n).padStart(2,'0');
  sched.travel_date=near.getFullYear()+'-'+pad(near.getMonth()+1)+'-'+pad(near.getDate());
  sched.departure_time=pad(near.getHours())+':'+pad(near.getMinutes());
  const originalStatus=booking.status;
  const refused=await post('/bookings/'+booking.pnr+'/cancel',{reason:'QA'},manager.id);
  assert.equal(refused.status,403,'Cancellation cutoff advanced rule protects actual booking');
  assert.equal(booking.status,originalStatus,'Denied cancellation has no side effects');
  sched.travel_date=oldDate;sched.departure_time=oldTime;
  assert.equal((await del('/team-access/v28/rules/'+cancel.data.id)).status,200);
  assert.equal((await del('/team-access/v28/groups/'+group.id)).status,200);
  console.log('PASS v28 server: 89 action catalog, screenshot dropdowns, role clone, group CRUD, restrictive presets, read-only gate, test explanation, actual cancellation, corridor and block caps');
 }finally{
  await new Promise(resolve=>server.close(resolve));
  db.persistNow();fs.rmSync(tmp,{recursive:true,force:true});
 }
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
