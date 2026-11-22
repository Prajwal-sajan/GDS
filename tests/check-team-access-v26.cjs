(function teamAccessBackendV26Test(){
'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
process.env.GDS_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'gds-team26-'));
process.env.GDS_RESEED='1';
const app=require('../server/index'),db=require('../server/db'),A=require('../server/auth');
const owner=db.col('users').find(x=>x.role==='owner')||db.col('users').insert({name:'Test Owner',phone:'9999999999',role:'owner',status:'ACTIVE'});
const agent=db.col('users').find(x=>x.role==='agent')||db.col('users').insert({name:'Test Agent',phone:'9444444441',role:'agent',status:'ACTIVE'});
const key=id=>A.sign({uid:id,exp:Date.now()+600000});
let base,server;
const call=async(method,route,body=null,id=owner.id)=>{
 const headers={Authorization:'Bearer '+key(id)};
 if(body!==null)headers['Content-Type']='application/json';
 const response=await fetch(base+'/api'+route,{method,headers,body:body===null?undefined:JSON.stringify(body)});
 const data=await response.json().catch(()=>null);
 return {status:response.status,data};
};
const get=(p,id)=>call('GET',p,null,id);
const post=(p,b,id)=>call('POST',p,b,id);
const put=(p,b,id)=>call('PUT',p,b,id);
const del=(p,id)=>call('DELETE',p,null,id);
(async()=>{
 server=app.listen(0);
 base='http://127.0.0.1:'+server.address().port;
 try{
  let r=await get('/team-access/v26');
  assert.equal(r.status,200,'Team endpoint');
  assert.ok(r.data.users.some(x=>x.role==='owner'));
  assert.equal(r.data.role_columns.length,10);
  assert.ok(r.data.matrix.length>=8);
  assert.ok(r.data.roles.some(x=>x.key==='viewer')&&r.data.roles.some(x=>x.key==='service_agent'));
  assert.equal((await get('/team-access/v26',agent.id)).status,403,'Agent must not read staff identities');
  assert.equal((await get('/accounts/invoices-v25',agent.id)).status,403,'Invoice RBAC remains finance-only after router scope fix');
  const cities=db.col('cities');
  const city=cities.all()[0]||cities.insert({name:'Bengaluru'});
  const routes=db.col('routes');
  const route=routes.all()[0]||routes.insert({name:'Hyderabad → Bengaluru'});
  r=await post('/team-access/v26/branches',{code:'BLR',name:'Bengaluru office',city_id:city.id,
   phone:'9876543210',address:'Central office',operations_area:'both',
   operation_city_ids:[city.id],operation_route_ids:[route.id]});
  assert.equal(r.status,200,'Create branch: '+JSON.stringify(r.data));
  const branch=r.data;
  assert.equal(branch.code,'BLR');assert.equal(branch.operations_area,'both');
  assert.equal((await post('/team-access/v26/branches',{code:'BLR',name:'Duplicate'})).status,409);
  assert.equal((await post('/team-access/v26/branches',{code:'',name:'Bad'})).status,400);
  assert.equal((await post('/team-access/v26/branches',{code:'CITY',name:'City-only',operations_area:'cities'})).status,400,'City restriction needs city');
  r=await put('/team-access/v26/branches/'+branch.id,{name:'Bengaluru Main Office',operations_area:'routes',operation_route_ids:[route.id]});
  assert.equal(r.status,200);assert.equal(r.data.name,'Bengaluru Main Office');
  assert.equal((await post('/team-access/v26/branches',{code:'BAD',name:'Denied'},agent.id)).status,403);
  const phone='9876543210';
  r=await post('/team-access/v26/users',{category:'office-staff',phone,name:'Operations Manager',role:'manager',email:'manager@example.test',
   branch_id:branch.id,language:'English',status:'ACTIVE'});
  assert.equal(r.status,200,'Create office staff: '+JSON.stringify(r.data));
  const manager=r.data;
  assert.equal(manager.branch_id,branch.id);
  assert.ok(db.col('staff').find(x=>x.phone===phone),'Manager user is matched to Staff by phone');
  const branchAdmin=await post('/team-access/v26/users',{category:'office-staff',phone:'9876543220',
   name:'Office Administrator',role:'branch_admin',status:'ACTIVE',branch_id:branch.id});
  assert.equal(branchAdmin.status,200,'Branch Admin creation');
  const scoped=await get('/team-access/v26',branchAdmin.data.id);
  assert.equal(scoped.status,200,'Branch Admin current API: '+JSON.stringify(scoped.data));
  assert.ok(scoped.data.users.every(x=>x.id===branchAdmin.data.id||x.branch_id===branch.id),'Branch users only');
  assert.ok(!scoped.data.users.some(x=>x.role==='owner'),'Owners in other branches are not exposed');
  const legacyScoped=await get('/iam/users',branchAdmin.data.id);
  assert.equal(legacyScoped.status,200);
  assert.ok(!legacyScoped.data.some(x=>x.role==='owner'),'Legacy IAM read is scoped too');
  assert.equal((await post('/team-access/v26/users',{category:'office-staff',phone,name:'Duplicate',role:'viewer'})).status,409);
  assert.equal((await del('/team-access/v26/branches/'+branch.id)).status,409,'Cannot delete branch with assigned users');
  r=await post('/team-access/v26/users',{category:'bus-staff',phone:'9876543211',name:'Fleet Driver',
   role:'driver',status:'ACTIVE',limit_routes:true,route_ids:[route.id],language:'English'});
  assert.equal(r.status,200,'Create bus staff: '+JSON.stringify(r.data));
  const driver=r.data;
  assert.equal(driver.route_ids[0],route.id);
  assert.ok(db.col('staff').find(x=>x.phone==='9876543211'),'Driver automatically appears in Staff');
  assert.equal((await put('/team-access/v26/users/'+driver.id,{route_ids:[999999],limit_routes:true})).status,400);
  const managerToken=A.sign({uid:manager.id,exp:Date.now()+600000});
  assert.ok(managerToken);
  assert.equal((await post('/team-access/v26/users',{category:'office-staff',phone:'9876543212',name:'Illegal Owner',role:'owner'})).status,200,
   'Owner may add another owner');
  const owner2=db.col('users').find(x=>x.phone==='9876543212');
  // A manager role is not allowed to administer users and can never create an owner.
  assert.equal((await post('/team-access/v26/users',{category:'office-staff',phone:'9876543213',role:'owner'},manager.id)).status,403);
  assert.equal((await del('/team-access/v26/users/'+owner.id)).status,403,'Owner cannot be archived');
  const off=await post('/team-access/v26/users',{category:'agents',phone:'9876543214',name:'Test Agent',
   role:'agent',agent_category:'master_agent',mode:'Offline',status:'ACTIVE'});
  assert.equal(off.status,200,'Create offline master agent: '+JSON.stringify(off.data));
  assert.equal(off.data.agent_category,'master_agent');assert.equal(off.data.mode,'Offline');
  assert.equal(off.data.status,'INACTIVE','Offline agents have no sign-in enabled');
  assert.equal(A.requestOtp('9876543214').ok,false,'Offline agent cannot request OTP');
  assert.equal((await get('/team-access/v26',off.data.id)).status,401,'Offline agent cannot authenticate at all');
  const aUpdate=await put('/team-access/v26/users/'+off.data.id,{mode:'Online',status:'ACTIVE',
   commission_pct:3.5,credit_limit:25000,agent_type:'prepaid',agent_category:'master_agent'});
  assert.equal(aUpdate.status,200,'Commission update: '+JSON.stringify(aUpdate.data));
  assert.equal(aUpdate.data.commission_pct,3.5);
  assert.equal(aUpdate.data.agent_type,'prepaid');
  assert.equal(A.requestOtp('9876543214').ok,true,'Online agent can request OTP');
  const child=await post('/team-access/v26/users',{category:'agents',phone:'9876543215',name:'Sub Agent',
   role:'agent',agent_category:'agent',mode:'Online',status:'ACTIVE',master_agent_id:off.data.id});
  assert.equal(child.status,200,'Create agent under assigned master');
  assert.equal(child.data.master_agent_id,off.data.id);
  assert.equal((await put('/team-access/v26/users/'+off.data.id,{agent_category:'agent'})).status,409,
   'Cannot demote a master without moving sub-agent');
  assert.equal((await put('/team-access/v26/users/'+child.data.id,{master_agent_id:child.data.id})).status,400,
   'Self-parenting forbidden');
  assert.equal((await del('/team-access/v26/users/'+off.data.id)).status,409,
   'Master with sub-agents cannot be archived');
  assert.equal((await put('/team-access/v26/users/'+child.data.id,{master_agent_id:null})).status,200);
  assert.equal((await del('/team-access/v26/users/'+off.data.id)).status,200);
  const session=db.col('auth_sessions').insert({user_id:driver.id,last_seen:new Date().toISOString(),revoked_at:null});
  r=await put('/team-access/v26/users/'+driver.id,{limit_routes:true,route_ids:[route.id],
   denied_permissions:['trips.location'],language:'Kannada'});
  assert.equal(r.status,200);assert.ok(r.data.revoked_sessions>=1,'Editing permissions revokes sessions');
  assert.ok(db.col('auth_sessions').get(session.id).revoked_at);
  assert.ok(!A.permsFor(db.col('users').get(driver.id)).includes('trips.location'));
  assert.equal((await put('/team-access/v26/users/'+manager.id,{status:'INACTIVE'},manager.id)).status,403,
   'Cannot deactivate self');
  assert.equal((await put('/team-access/v26/users/'+driver.id,{extra_permissions:['iam.manage_roles']})).status,200,
   'Owner is permitted to grant role-level permission');
  const roleRes=await put('/team-access/v26/roles/batch',{roles:[{key:'driver',
   matrix:{'See bus location':'Off','View trip sheets & pickup charts':'Own'}}]});
  assert.equal(roleRes.status,200,'Save permission matrix: '+JSON.stringify(roleRes.data));
  assert.ok(!A.roles().driver.permissions.includes('trips.location'));
  assert.equal(A.roles().driver.scopes['View trip sheets & pickup charts'],'Own');
  assert.equal((await put('/team-access/v26/roles/batch',{roles:[{key:'owner',matrix:{}}]})).status,400);
  assert.equal((await put('/team-access/v26/roles/batch',{roles:[{key:'agent',matrix:{'View bookings':'Invalid'}}]})).status,400);
  const custom=await post('/team-access/v26/roles',{name:'Night Operations'});
  assert.equal(custom.status,200);
  assert.equal(custom.data.key,'night_operations');
  assert.equal((await del('/team-access/v26/roles/'+custom.data.key)).status,200);
  assert.equal((await del('/team-access/v26/roles/driver')).status,403);
  r=await get('/team-access/v26/evaluate/'+driver.id);
  assert.equal(r.status,200);assert.ok(r.data.user.limit_routes);
  assert.equal(r.data.routes[0].id,route.id);
  assert.ok(r.data.scope_enforcement.includes('not uniformly enforced'));
  assert.equal((await del('/team-access/v26/users/'+branchAdmin.data.id)).status,200);
  const archive=await del('/team-access/v26/users/'+manager.id);
  assert.equal(archive.status,200);
  assert.ok(db.col('users').get(manager.id).deleted_at);
  assert.equal((await get('/team-access/v26')).data.users.some(x=>x.id===manager.id),false);
  assert.equal(A.requestOtp(phone).ok,false);
  assert.equal((await del('/team-access/v26/branches/'+branch.id)).status,200,'Deletion after unassign');
  assert.ok(db.col('edit_history').all().length>=1,'Audit history recorded');
  console.log('PASS v26 Team: 5 sections, branch Code/city/ops, duplicate constraints, office/bus/agents CRUD, types/modes, protected OTP, role matrix, permissions, signed-out sessions, archive, audit');
 }finally{
  await new Promise(resolve=>server.close(resolve));
  db.persistNow();
  fs.rmSync(process.env.GDS_DATA_DIR,{recursive:true,force:true});
 }
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
})();