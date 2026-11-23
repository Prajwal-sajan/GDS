'use strict';
// Offline Settings v17 regression tests: no HAR, credentials, or external calls.
const assert=require('node:assert/strict'),Module=require('node:module'),fs=require('node:fs');
const os=require('node:os'),path=require('node:path');
process.env.GDS_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'gds-settings17-'));
const routes=[],router=()=>Object.fromEntries(['get','put','post','delete'].map(method=>[method,(url,...handlers)=>routes.push({method:method.toUpperCase(),url,handlers})]));
const orig=Module._load;Module._load=function(name,parent,main){if(name==='express')return{Router:router};return orig.call(this,name,parent,main)};
const db=require('../server/db'),A=require('../server/auth');
db.reset();db.meta('operator',{app_name:'Test Operator',brand_hex:'#2563EB',tagline:'Travel'});
const owner=db.col('users').insert({name:'Owner',role:'owner',phone:'9999999999',status:'ACTIVE'});
const ba=db.col('branches').insert({name:'North',city_id:1});
const bb=db.col('branches').insert({name:'South',city_id:1});
const branchAdmin=db.col('users').insert({name:'Branch admin',role:'branch_admin',branch_id:ba.id,phone:'9666666666',status:'ACTIVE'});
const north=db.col('users').insert({name:'North agent',role:'agent',branch_id:ba.id,phone:'9444444441',status:'ACTIVE'});
const south=db.col('users').insert({name:'South agent',role:'agent',branch_id:bb.id,phone:'9444444442',status:'ACTIVE'});
require('../server/api/settings-complete');
require('../server/api/settings-v16-iam-bridge');
require('../server/api/branding-public-v17');
function call(method,url,body={},actor=owner){
 const item=routes.find(r=>r.method===method&&new RegExp('^'+r.url.replace(/:[a-zA-Z_]+/g,'([^/]+)')+'$').test(url));
 assert.ok(item,method+' '+url+' route missing');
 const keys=[...item.url.matchAll(/:([a-zA-Z_]+)/g)].map(x=>x[1]);
 const values=url.match(new RegExp('^'+item.url.replace(/:[a-zA-Z_]+/g,'([^/]+)')+'$')).slice(1);
 const req={params:Object.fromEntries(keys.map((k,i)=>[k,values[i]])),query:{},body,user:{...A.publicUser(actor),real_user_id:actor.id}};
 const out={status:200,data:null,headers:{}};
 const res={status(x){out.status=x;return this},json(x){out.data=x;return this},set(x){Object.assign(out.headers,x);return this},type(x){out.type=x;return this},send(x){out.data=x;return this},end(){return this}};
 const next=i=>{if(i<item.handlers.length)item.handlers[i](req,res,()=>next(i+1))};
 next(0);return out;
}
let count=0;
function test(name,fn){fn();console.log('PASS',name);count++}
try{
 test('Reference has the complete 78-action access grid',()=>{
   const source=fs.readFileSync(path.join(__dirname,'../public/js/settings-parity.js'),'utf8');
   const grid=source.split('const ACCESS_SECTIONS = [')[1].split('const BRAND_DEFAULTS')[0];
   const labels=[...grid.matchAll(/label:(['"])(.*?)\1/g)].map(m=>m[2]);
   assert.equal(labels.length,78);
   assert.equal(new Set(labels).size,78);
   assert.ok(labels.includes('Export / download'));
 });
 test('All 78 access rows have a distinct server permission mapping',()=>{
   const source=fs.readFileSync(path.join(__dirname,'../public/js/settings-complete.js'),'utf8');
   const maps=source.split('const PERM_MAP={')[1].split('\n};')[0];
   const names=[...maps.matchAll(/^\s*(['"])(.*?)\1\s*:/gm)].map(m=>m[2]);
   assert.equal(names.length,78);
   assert.ok(names.includes('See passenger phone numbers'));
   assert.ok(names.includes('Book on behalf of agents'));
   assert.ok(names.includes('Add comments to a PNR'));
 });
 test('Viewer, service agent, service associate, branch admin are actual IAM roles',()=>{
   for(const r of ['viewer','service_agent','service_associate','branch_admin'])assert.ok(A.roles()[r]);
   assert.equal(A.roles().branch_admin.scopes['View users'],'Branch');
 });
 test('Branch admin user listing and branches never leak cross-branch records',()=>{
   const users=call('GET','/iam/users',{},branchAdmin).data;
   assert.deepEqual(users.map(x=>x.name).sort(),['Branch admin','North agent']);
   const branches=call('GET','/branches',{},branchAdmin).data;
   assert.deepEqual(branches.map(x=>x.name),['North']);
   assert.equal(call('GET','/iam/access-evaluate/'+south.id,{},branchAdmin).status,403);
   assert.equal(call('GET','/iam/access-evaluate/'+north.id,{},branchAdmin).status,200);
 });
 test('Branch admin cannot create/edit/delete another branch user',()=>{
   assert.equal(call('POST','/iam/users',{phone:'9444444443',name:'New agent',role:'agent',branch_id:bb.id},branchAdmin).status,403);
   assert.equal(call('PUT','/iam/users/'+south.id,{status:'INACTIVE'},branchAdmin).status,403);
   assert.equal(call('DELETE','/iam/users/'+south.id,{},branchAdmin).status,403);
   const result=call('POST','/iam/users',{phone:'9444444443',name:'Allowed',role:'agent',branch_id:ba.id},branchAdmin);
   assert.equal(result.status,200);
   assert.equal(call('PUT','/iam/users/'+north.id,{branch_id:bb.id},branchAdmin).status,403);
   assert.equal(call('PUT','/iam/users/'+north.id,{status:'INACTIVE'},branchAdmin).status,200);
 });
 test('Owner can still access all branches and users',()=>{
   assert.ok(call('GET','/iam/users').data.some(x=>x.id===south.id));
   assert.equal(call('GET','/branches').data.length,2);
 });
 test('Live PWA manifest reflects saved brand and safe icon endpoint',()=>{
   let m=call('GET','/manifest.webmanifest');
   assert.equal(m.status,200);let data=JSON.parse(m.data);
   assert.equal(data.name,'Test Operator');assert.equal(data.start_url,'/');
   assert.ok(data.icons[0].src.includes('default.svg'));
   assert.equal(call('GET','/branding-assets/default.svg').status,200);
   const p='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9q5reRQAAAAASUVORK5CYII=';
   assert.equal(call('POST','/settings/branding/assets/favicon',{data_url:p}).status,200);
   data=JSON.parse(call('GET','/manifest.webmanifest').data);
   assert.equal(data.icons[0].src,'/branding-assets/favicon');
   assert.ok(Buffer.isBuffer(call('GET','/branding-assets/favicon').data));
 });
 test('Export is controlled independently from report read permission',()=>{
   assert.ok(A.CATALOG.accounts.includes('accounts.export'));
   const code=fs.readFileSync(path.join(__dirname,'../server/index.js'),'utf8');
   assert.ok(code.includes("req.user?.permissions?.includes('accounts.export')"));
   assert.ok(code.includes('invoices-v24'));
 });
 test('Booking privacy and delegated writes check specific API permissions',()=>{
   const code=fs.readFileSync(path.join(__dirname,'../server/api/ops.js'),'utf8');
   for(const key of ['bookings.see_phone','bookings.on_behalf','bookings.comments'])assert.ok(code.includes(key));
   assert.ok(code.includes('Policy.maskedBooking('));
   assert.ok(code.includes('Policy.requireBooking('));
 });
 console.log('PASS '+count+' Settings v17 regression tests');
}finally{fs.rmSync(process.env.GDS_DATA_DIR,{recursive:true,force:true})}
