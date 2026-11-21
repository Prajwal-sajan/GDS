// Offline API contract tests without Express installation; actual registered route handlers execute.
const Module=require('module');
const os=require('os');const fs=require('fs');const path=require('path');const assert=require('assert');
process.env.GDS_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'gds-settings16-'));
const routes=[];
const expressStub={Router:()=>Object.fromEntries(['get','post','put','delete'].map(method=>[method,(path,...handlers)=>{routes.push({method:method.toUpperCase(),path,handlers});}]))};
const prev=Module._load;Module._load=function(id,parent,main){if(id==='express')return expressStub;return prev.call(this,id,parent,main);};
const db=require('../server/db');const A=require('../server/auth');
db.reset();db.meta('operator',{operator_name:'Demo',app_name:'Demo',tagline:'Travel',brand_hex:'#2563eb',font_family:'Poppins'});
const owner=db.col('users').insert({name:'Admin',role:'owner',phone:'9999999999',status:'ACTIVE'});
const agent=db.col('users').insert({name:'Agent',role:'agent',phone:'9444444441',status:'ACTIVE'});
require('../server/api/settings-complete');
require('../server/api/settings-v16-iam-bridge');
require('../server/api/misc');
function findRoute(method,path){
 for(const r of routes){if(r.method!==method)continue;
  const keys=[];
  const regex=new RegExp('^'+r.path.replace(/:[a-zA-Z_]+/g,(x)=>{keys.push(x.slice(1));return '([^/]+)';})+'$');
  const m=path.match(regex);if(m)return{r,params:Object.fromEntries(keys.map((k,i)=>[k,decodeURIComponent(m[i+1])]))};
 }
 throw Error('Missing API '+method+' '+path);
}
function call(method,url,body={},actor=owner){
 const {r,params}=findRoute(method,url);
 const req={params,body,headers:{},user:{...A.publicUser(actor),real_user_id:actor.id,session_id:null}};
 const result={status:200,data:null};const res={status(code){result.status=code;return this;},json(data){result.data=data;return this;}};
 let nextCount=0;const invoke=(i)=>{if(i>=r.handlers.length)return;const fn=r.handlers[i];fn(req,res,()=>{nextCount++;invoke(i+1);});};invoke(0);
 return result;
}
const check=(cond,msg)=>assert.ok(cond,msg);
function run(){let n=0;const t=(name,fn)=>{fn();n++;console.log(' PASS',name)};
 t('branding GET and validated PUT',()=>{
  assert.equal(call('GET','/settings/branding').status,200);
  assert.equal(call('PUT','/settings/branding',{brand_hex:'#xyz',app_name:'A'}).status,400);
  const r=call('PUT','/settings/branding',{app_name:'JourneyOS',tagline:'Comfort',brand_hex:'#1256eF',font_family:'Poppins',color_scheme:'Dark'});
  assert.equal(r.status,200);assert.equal(db.meta('operator').app_name,'JourneyOS');assert.equal(db.meta('branding').color_scheme,'Dark');
 });
 t('settings role RBAC blocks agent writes',()=>{assert.equal(call('PUT','/settings/branding',{brand_hex:'#2563eb'},agent).status,403);});
 t('image upload rejects invalid MIME and saves valid PNG',()=>{
  const fake='data:text/html;base64,PHNjcmlwdD4=';
  assert.equal(call('POST','/settings/branding/assets/mobile_logo',{data_url:fake}).status,400);
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9q5reRQAAAAASUVORK5CYII=';
  assert.equal(call('POST','/settings/branding/assets/mobile_logo',{data_url:png}).status,200);
  check(!!db.meta('branding').assets.mobile_logo,'image stored');
  assert.equal(call('DELETE','/settings/branding/assets/mobile_logo').status,200);
 });
 t('WhatsApp stores templates but never claims provider connection',()=>{
  const r=call('PUT','/settings/whatsapp',{display_name:'Travel',business_number:'9000000001',status:'connected',templates:[{name:'Boarding',category:'utility',message:'Ready?'}]});
  assert.equal(r.data.status,'not_connected');assert.equal(r.data.templates.length,1);
 });
 t('configuration save',()=>{const r=call('PUT','/settings/configuration',{quiet_hours_enabled:true,quiet_start:'22:00',quiet_end:'07:00',escalation_minutes:22});assert.equal(r.data.escalation_minutes,22);});
 t('IAM group create, edit, delete',()=>{
  const v=call('POST','/iam/groups',{name:'Front desk',user_ids:[owner.id]});assert.equal(v.status,200);
  assert.equal(call('GET','/iam/groups').data.length,1);
  assert.equal(call('PUT',`/iam/groups/${v.data.id}`,{name:'Desk',user_ids:[owner.id,agent.id]}).data.user_ids.length,2);
  assert.equal(call('DELETE',`/iam/groups/${v.data.id}`).status,200);
 });
 t('user access evaluation follows backend role',()=>{
  const r=call('GET',`/iam/access-evaluate/${agent.id}`);assert.equal(r.status,200);check(!r.data.user.permissions.includes('iam.manage_roles'));
 });
 t('IAM deletion forbids owner and permits agent',()=>{
  assert.equal(call('DELETE',`/iam/users/${owner.id}`).status,403);
  assert.equal(call('DELETE',`/iam/users/${agent.id}`).status,200);
 });
 t('sessions can be created and revoked',()=>{
  assert.equal(A.requestOtp(owner.phone).ok,true);
  const auth=A.verifyOtp(owner.phone,'1234',{user_agent:'test agent'});
  const p=A.verify(auth.token);check(p.sid);
  const sess=db.col('auth_sessions').get(p.sid);assert.equal(sess.user_agent,'test agent');
  const r=call('GET','/auth/sessions',{}, {...owner});assert.ok(Array.isArray(r.data.sessions));
  assert.equal(call('DELETE',`/auth/sessions/${p.sid}`).status,200);
  check(!!db.col('auth_sessions').get(p.sid).revoked_at);
 });
 t('role UI scope payload persists as metadata',()=>{
  const r=call('PUT','/iam/roles/viewer',{name:'Viewer',permissions:['trips.view'],scopes:{'View bookings':'Own'},ui_permissions:{'View bookings':true,"View a service's revenue":true},limits:{max_blocked_seats:3}});
  assert.equal(r.status,200);assert.equal(db.meta('roles').viewer.scopes['View bookings'],'Own');assert.equal(db.meta('roles').viewer.ui_permissions["View a service's revenue"],true);
 });
 console.log(`PASS ${n} Settings v16 API contract tests`);
}
try{run();}finally{fs.rmSync(process.env.GDS_DATA_DIR,{recursive:true,force:true});}
