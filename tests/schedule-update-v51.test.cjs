'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),express=require('express');
const {JSDOM}=require('jsdom');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gds-update-v51-'));
process.env.GDS_DATA_DIR=dir;
process.env.GDS_RESEED='1';
const db=require('../server/db'),Auth=require('../server/auth'),D=require('../server/domain');
require('../server/seed').seed();
const API=require('../server/api/schedule-update-v51');
const UI=require('../public/js/schedule-update-v51');
const app=express();
app.use(express.json());
app.use('/api',Auth.middleware);
app.use('/api',API);
app.use('/api',require('../server/api/ops'));
const user=db.col('users').find(x=>x.role==='owner');
const route=db.col('routes').find(x=>x.status==='active');
const schedule=db.col('schedules').find(x=>x.route_id===route.id&&x.status==='active');
if(!user||!route||!schedule)throw Error('Missing seeded schedule');
let server,base;
test.before(async()=>{
 server=await new Promise(resolve=>{const obj=app.listen(0,'127.0.0.1',()=>resolve(obj))});
 base='http://127.0.0.1:'+server.address().port+'/api';
});
test.after(async()=>{
 if(server)await new Promise(resolve=>server.close(resolve));
 fs.rmSync(dir,{recursive:true,force:true});
});
async function call(method,uri,body,as=user){
 const token=Auth.sign({uid:as.id,exp:Date.now()+180000});
 const res=await fetch(base+uri,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  ...(body===undefined?{}:{body:JSON.stringify(body)})});
 const content=await res.json();return{status:res.status,body:content,cache:res.headers.get('cache-control')};
}
test('read Schedule Update v51 returns route/schedule config with valid staff, vehicle selections, without financial or passenger records',async()=>{
 const r=await call('GET','/schedules/'+schedule.id+'/update-v51');
 assert.equal(r.status,200,JSON.stringify(r.body));
 const b=r.body;assert.equal(b.schedule_id,schedule.id);
 assert.equal(b.can_modify,true);
 assert.ok(b.crew.length>=2);
 assert.equal(b.assignment_source,'Route');
 assert.equal(b.call_source,'Route');
 assert.equal(b.cab_source,'Route');
 assert.ok(b.call_settings.cloud_calling);
 assert.ok(b.call_settings.number_masking);
 assert.ok(b.staff_options.length>=2);
 assert.ok(b.vehicle_options.length>=1);
 assert.ok(b.staff_options.every(x=>x.role&&x.name));
 assert.equal(b.auto_ota_sync_connected,false);
 assert.ok(!JSON.stringify(b).includes('bank_name'));
 assert.equal(r.cache,'private, no-store, max-age=0');
});
test('UI read-only screenshot landmarks, SVGs, chips, switches, route and occupancy',async()=>{
 const config=(await call('GET','/schedules/'+schedule.id+'/update-v51')).body;
 const detail=(await call('GET','/schedules/'+schedule.id)).body;
 const S={detail,u51:{editing:false,data:config,edit:null,missing:false,busy:false},trip:{position:{address:'Gps source from trip'}}};
 const html=await UI.render(S,{get:async()=>{throw Error('unneeded call')}});
 const dom=new JSDOM('<div id="app">'+html+'</div>');
 const doc=dom.window.document,txt=doc.body.textContent;
 for(const x of ['Vehicle & Staff Assignment','CALL ROUTING','AUTOS & CABS','Schedule Details',
 'Sync with Route','Missing on RedBus / AbhiBus?','Cloud Calling','Passenger Number Masking',
 'Direct to Vehicle','Driver Mobile GPS','Escalation','Ride to boarding point / from drop','Coach Transfer',
 'SERVICE NO','COACH TYPE','OCCUPANCY','Data Source: Route'])assert.ok(txt.includes(x),x);
 assert.equal(doc.querySelectorAll('.u51-call-row').length,4);
 assert.equal(doc.querySelectorAll('.u51-indicators span').length,3);
 assert.equal(doc.querySelectorAll('.u51-read-crew .u51-crew-card').length,config.crew.length);
 assert.equal(doc.querySelector('[data-u51-action="edit"]').textContent.trim(),'Edit');
 assert.equal(doc.querySelector('[data-u51-action="ota"]').getAttribute('aria-disabled'),'true');
 assert.equal(doc.querySelector('[data-u51-sync]').checked,true);
 assert.ok(doc.querySelector('.u51-trip h3').textContent.includes(detail.origin));
 assert.ok(html.includes('role="status"'));
 assert.ok(html.includes('data-sx-coach-transfer'));
 dom.window.close();
});
test('edit opens and shows staff add/remove/select rows, phone, escalation, cab modes, update assignment',async()=>{
 const config=(await call('GET','/schedules/'+schedule.id+'/update-v51')).body;
 const detail=(await call('GET','/schedules/'+schedule.id)).body;
 const S={detail,u51:{editing:false,data:config,edit:null,missing:false,busy:false}};
 const ctx={G:{},rerender:async()=>{},reload:async()=>{},confirm:async()=>true,toast:()=>{}};
 assert.equal(await UI.click({dataset:{u51Action:'edit'}},S,ctx),true);
 assert.equal(S.u51.editing,true);
 const html=await UI.render(S,{get:async()=>{throw Error('data exists')}});
 const dom=new JSDOM(html),doc=dom.window.document;
 for(const action of ['cancel','add','save','ota']){
  assert.ok(doc.querySelector('[data-u51-action="'+action+'"]'),action);
 }
 assert.equal(doc.querySelectorAll('[data-u51-row]').length,config.crew.length);
 assert.equal(doc.querySelectorAll('[data-u51-call]').length,4);
 assert.equal(doc.querySelectorAll('[data-u51-role]').length,config.crew.length);
 assert.equal(doc.querySelectorAll('[data-u51-staff]').length,config.crew.length);
 assert.equal(doc.querySelectorAll('.u51-cab-actions button').length,4);
 assert.ok(doc.querySelector('[data-u51-escalation]'));
 const staffOpts=doc.querySelectorAll('[data-u51-staff] option');
 assert.ok(staffOpts.length>=config.staff_options.length);
 await UI.click({dataset:{u51Action:'add'}},S,ctx);
 assert.equal(S.u51.edit.crew.length,config.crew.length+1);
 const last=S.u51.edit.crew.length-1;
 UI.change({dataset:{u51Staff:last},value:config.staff_options[0].id,hasAttribute:x=>x==='data-u51-staff'},S);
 assert.equal(String(S.u51.edit.crew[last].staff_id),String(config.staff_options[0].id));
 await UI.click({dataset:{u51Action:'remove',index:String(last)}},S,ctx);
 assert.equal(S.u51.edit.crew.length,config.crew.length);
 await UI.click({dataset:{u51Action:'cab',mode:'Both'}},S,ctx);
 assert.equal(S.u51.edit.cab_mode,'Both');
 await UI.click({dataset:{u51Action:'cancel'}},S,ctx);
 assert.equal(S.u51.editing,false);
 dom.window.close();
});
test('API validates duplicate staff, unsupported roles and wrong staff role before write',async()=>{
 const record=(await call('GET','/schedules/'+schedule.id+'/update-v51')).body;
 const body={vehicle_id:record.vehicle_id,crew:record.crew.map(x=>({staff_id:x.staff_id,role:x.role}))};
 const original=JSON.stringify(schedule.crew);
 for(const crew of [[body.crew[0],body.crew[0]],[{role:'Captain',staff_id:body.crew[0].staff_id}],
  [{role:'Driver',staff_id:record.staff_options.find(x=>x.role==='helper').id}],
  [{role:'Driver',staff_id:9999999999}]]){
  const out=await call('PUT','/schedules/'+schedule.id+'/update-v51/assignment',{...body,crew});
  assert.equal(out.status,400,JSON.stringify(out.body));
  assert.equal(JSON.stringify(schedule.crew),original);
 }
});
test('API rejects invalid toggles, malformed escalation and unknown assignment keys with no mutations',async()=>{
 const data=(await call('GET','/schedules/'+schedule.id+'/update-v51')).body;
 const crew=data.crew.map(c=>({staff_id:c.staff_id,role:c.role}));
 const p='/schedules/'+schedule.id+'/update-v51/assignment';
 for(const x of [{call_settings:{cloud_calling:'yes'}},
 {call_settings:{fake_field:true}},{escalation_contacts:['not-a-phone']},
 {escalation_contacts:['9731714358','9731714358']},
 {cab_mode:'Sometimes'}, {unknown_field:1}]){
  const out=await call('PUT',p,{vehicle_id:data.vehicle_id,crew,...x});
  assert.equal(out.status,400,JSON.stringify(out.body));
 }
 assert.equal(schedule.assignment_override_v51,undefined);
});
test('update assignment persists schedule-only config, disables sync, displays effective sources; route remains unchanged',async()=>{
 const data=(await call('GET','/schedules/'+schedule.id+'/update-v51')).body;
 const oldRoute=JSON.stringify(route);
 const patch={vehicle_id:data.vehicle_id,crew:data.crew.map(c=>({role:c.role,staff_id:c.staff_id})),
  call_settings:{cloud_calling:false,number_masking:true,direct_to_vehicle:true,driver_gps:false},
  escalation_contacts:['9731714358','9113209427'],cab_mode:'Drops'};
 const res=await call('PUT','/schedules/'+schedule.id+'/update-v51/assignment',patch);
 assert.equal(res.status,200,JSON.stringify(res.body));
 assert.equal(res.body.assignment_source,'Schedule');
 assert.equal(res.body.call_source,'Schedule');
 assert.equal(res.body.cab_source,'Schedule');
 assert.equal(res.body.call_settings.cloud_calling,false);
 assert.deepEqual(res.body.escalation_contacts,patch.escalation_contacts);
 assert.equal(res.body.cab_mode,'Drops');
 assert.equal(schedule.sync_with_route,false);
 assert.equal(schedule.assignment_override_v51,true);
 assert.equal(JSON.stringify(route),oldRoute,'Route template must stay unchanged');
 const reloaded=await call('GET','/schedules/'+schedule.id+'/update-v51');
 assert.equal(reloaded.body.cab_mode,'Drops');
});
test('enabling route sync restores valid assignment/calls/coach, clears schedule-level v51 overrides',async()=>{
 const out=await call('PUT','/schedules/'+schedule.id+'/update-v51/sync',{enabled:true});
 assert.equal(out.status,200,JSON.stringify(out.body));
 assert.equal(schedule.sync_with_route,true);
 assert.equal(out.body.call_source,'Route');
 assert.equal(out.body.cab_source,'Route');
 assert.equal(out.body.assignment_source,'Route');
 assert.deepEqual(schedule.update_v51,{});
 assert.equal(schedule.assignment_override_v51,false);
 assert.equal(schedule.departure_time,route.departure_time);
 const off=await call('PUT','/schedules/'+schedule.id+'/update-v51/sync',{enabled:false});
 assert.equal(off.status,200);
 assert.equal(schedule.sync_with_route,false);
});
test('unconnected OTA push always fails closed without broadcasting or booking mutations',async()=>{
 const orig=JSON.stringify(db.col('bookings').filter(b=>b.schedule_id==schedule.id));
 const res=await call('POST','/schedules/'+schedule.id+'/update-v51/sync-ota',{confirmed:true});
 assert.equal(res.status,501);
 assert.match(res.body.message,/not connected/i);
 assert.equal(JSON.stringify(db.col('bookings').filter(b=>b.schedule_id==schedule.id)),orig);
});
test('staff assignment cannot move a booked service to a different layout',async()=>{
 const oldVehicle=schedule.vehicle_id,oldSync=schedule.sync_with_route;
 const other=db.col('vehicles').find(v=>v.coach_template_id!==db.col('vehicles').get(oldVehicle)?.coach_template_id);
 const active=db.col('bookings').count(b=>b.schedule_id==schedule.id&&['confirmed','hold'].includes(b.status));
 if(!other||!active)return;
 const d=(await call('GET','/schedules/'+schedule.id+'/update-v51')).body;
 const res=await call('PUT','/schedules/'+schedule.id+'/update-v51/assignment',{
  vehicle_id:other.id,crew:d.crew.map(c=>({role:c.role,staff_id:c.staff_id}))
 });
 assert.equal(res.status,409,JSON.stringify(res.body));
 assert.equal(schedule.vehicle_id,oldVehicle);
 assert.equal(schedule.sync_with_route,oldSync);
});
test('frontend save sends correct validated payload and route-sync disabled after response',async()=>{
 const config=(await call('GET','/schedules/'+schedule.id+'/update-v51')).body;
 const detail=(await call('GET','/schedules/'+schedule.id)).body;
 const S={detail,u51:{editing:true,data:config,edit:{vehicle_id:config.vehicle_id,crew:config.crew.map(c=>({role:c.role,staff_id:c.staff_id})),call_settings:{...config.call_settings},escalation_contacts:['9731714358'],cab_mode:'Both'},busy:false}};
 let submitted,seen=0;
 const ctx={G:{put:async(uri,data)=>{submitted={uri,data};return{...config,assignment_source:'Schedule'}}},
  rerender:async()=>{},reload:async()=>{seen++},confirm:async()=>true,toast:()=>{}};
 assert.equal(await UI.click({dataset:{u51Action:'save'}},S,ctx),true);
 assert.ok(submitted.uri.endsWith('/update-v51/assignment'));
 assert.deepEqual(submitted.data.escalation_contacts,['9731714358']);
 assert.equal(submitted.data.cab_mode,'Both');
 assert.equal(S.u51.editing,false);
 assert.equal(seen,1);
});
test('wiring and CSS scope: tab render, actions, state reset, route sync and original coach-transfer safety',()=>{
 const schedule=fs.readFileSync('public/js/schedules-screenshot-v6.js','utf8');
 const index=fs.readFileSync('public/index.html','utf8');
 const css=fs.readFileSync('public/css/schedule-update-v51.css','utf8');
 const server=fs.readFileSync('server/index.js','utf8');
 for(const t of ['ScheduleUpdateV51.render(S,G)','ScheduleUpdateV51.click','ScheduleUpdateV51.change',
 'ScheduleUpdateV51.sync',"S.u51=null","S.tab==='update'","data-sx-coach-transfer"])
  assert.ok(schedule.includes(t),'Missing '+t);
 assert.ok(index.includes('/js/schedule-update-v51.js?build=51'));
 assert.ok(index.includes('/css/schedule-update-v51.css?build=51'));
 assert.ok(index.indexOf('/js/schedule-update-v51.js?build=51')<index.indexOf('schedules-screenshot-v6.js?build=48'));
 assert.ok(server.includes("require('./api/schedule-update-v51')"));
 assert.ok(css.includes('.u51-edit-row'));
 assert.ok(css.includes('.u51-tooltip'));
 assert.ok(css.includes('.u51-trip'));
 new Function(schedule);
 new Function(fs.readFileSync('public/js/schedule-update-v51.js','utf8'));
});
