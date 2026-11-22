'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.GDS_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'config-v30-'));
process.env.GDS_RESEED='1';
const app=require('../server/index'),db=require('../server/db'),A=require('../server/auth');
const owner=db.col('users').find(u=>u.role==='owner')||db.col('users').insert({name:'Owner',phone:'9999999999',role:'owner',status:'ACTIVE'});
const agent=db.col('users').find(u=>u.role==='agent')||db.col('users').insert({name:'Agent',phone:'9999999997',role:'agent',status:'ACTIVE'});
const token=id=>A.sign({uid:id,exp:Date.now()+3600000});
const server=app.listen(0);const origin='http://127.0.0.1:'+server.address().port+'/api';
async function call(method,path,body,who=owner.id){
 const h={authorization:'Bearer '+token(who)};if(body!==undefined)h['content-type']='application/json';
 const res=await fetch(origin+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});
 return {status:res.status,data:await res.json().catch(()=>({}))};
}
const get=(p,who)=>call('GET',p,undefined,who),post=(p,b,who)=>call('POST',p,b,who),put=(p,b,who)=>call('PUT',p,b,who),del=p=>call('DELETE',p);
(async()=>{
 try{
  const initial=await get('/settings/config-v30');
  assert.equal(initial.status,200,JSON.stringify(initial.data));
  assert.equal(initial.data.sections.website.boarding_window_minutes,30);
  assert.equal(initial.data.sections.notifications.pre_boarding_minutes,360);
  assert.equal(initial.data.delivery_connected,false);
  const saved=await put('/settings/config-v30/business',
   {operator_name:'Test Operator',support_email:'office@example.com',gst_receivable:true,gst_number:'29AAICN5264C1ZD'});
  assert.equal(saved.status,200,JSON.stringify(saved.data));
  assert.equal(db.meta('operator').operator_name,'Test Operator');
  assert.equal((await put('/settings/config-v30/business',{gst_number:'invalid'})).status,400);
  assert.equal((await put('/settings/config-v30/business',{cloud_calling:true})).status,400);
  assert.equal((await put('/settings/config-v30/business',{operator_name:'Unauthorized'},agent.id)).status,403);
  assert.equal((await put('/settings/config-v30/website',{boarding_window_minutes:45,
   jurisdiction_city:'Bengaluru',address_lines:'line 1\nline 2'})).status,200);
  assert.equal((await put('/settings/config-v30/website',{child_free_age:-1})).status,400);
  const comm=await put('/settings/config-v30/communications',
   {cloud_calling:true,ring_order:'sequential',published_office_numbers:['9113209540'],
    city_contacts:[{city:'Bengaluru',phones:['9113209427']}]});
  assert.equal(comm.status,200,JSON.stringify(comm.data));
  assert.equal((await put('/settings/config-v30/communications',{ring_order:'reverse'})).status,400);
  assert.equal((await put('/settings/config-v30/communications',
   {city_contacts:[{city:'A',phones:[]},{city:'a',phones:[]}]})).status,400);
  const dial=await post('/settings/config-v30/dials',{code:'1',kind:'number',phone:'9019207599',label:'Support'});
  assert.equal(dial.status,200,JSON.stringify(dial.data));
  assert.equal((await post('/settings/config-v30/dials',{code:'1',kind:'number',phone:'9019207599'})).status,409);
  assert.equal((await put('/settings/config-v30/dials/'+dial.data.id,{label:'New label'})).status,200);
  assert.equal((await del('/settings/config-v30/dials/'+dial.data.id)).status,200);
  const note=await put('/settings/config-v30/notifications',{boarding_point_cutoff:45,
   rating_request_minutes:120,builtin_crew_push:false});
  assert.equal(note.status,200);assert.equal(note.data.value.builtin_crew_push,false);
  assert.equal((await put('/settings/config-v30/notifications',{pre_boarding_based_on:'invalid'})).status,400);
  const sub=await post('/settings/config-v30/subscriptions',{
   event_types:['New booking','Cancellation'],protocol:'whatsapp',endpoint:'phone',
   contacts:[{phone:'9999999998',name:'Operations'}],only_sources:true,
   booking_sources:['Website','app'],quiet_hours:false,enabled:true});
  assert.equal(sub.status,200,JSON.stringify(sub.data));
  assert.equal(sub.data.event_types.length,2);
  assert.equal((await post('/settings/config-v30/subscriptions',{event_types:['Bad'],
   endpoint:'phone',contacts:[{phone:'9999999998'}]})).status,400);
  const toggle=await put('/settings/config-v30/subscriptions/'+sub.data.id,{enabled:false});
  assert.equal(toggle.status,200);assert.equal(toggle.data.enabled,false);
  const delivery=await post('/settings/config-v30/subscriptions/'+sub.data.id+'/test',{});
  assert.equal(delivery.status,424,'Never claim to send a message without an integration');
  assert.match(delivery.data.message,/No message was sent/);
  const log=await get('/settings/config-v30/delivery-log/PNR1234');
  assert.equal(log.status,200);assert.equal(log.data.rows.length,0);
  assert.equal((await del('/settings/config-v30/subscriptions/'+sub.data.id)).status,200);
  assert.equal(db.col('notification_subscriptions').get(sub.data.id),undefined);
  assert.ok(db.col('edit_history').all().length>0,'Mutations are audited');
  console.log('PASS Configuration v30 API: persisted sections, strict validations, role gates, dial CRUD, subscription CRUD, provider fail-closed, delivery log');
 }finally{server.close();}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
