'use strict';
// Operator Team & Access v26. All mutations are server-authorized and audited.
// Store remains JSON for local pilot; do not treat UI scopes as domain-row security.
const express=require('express'),db=require('../db'),A=require('../auth'),D=require('../domain');
const {ROWS,ROLE_COLUMNS,ROLE_DESCRIPTIONS,ROLE_HUES}=require('../team-access-schema-v26');
const r=express.Router();
const error=(message,status=400)=>{throw D.httpErr(status,message);};
const wrap=fn=>(req,res)=>{try{res.set('Cache-Control','private, no-store');const out=fn(req,res);if(out!==undefined)res.json(out);}catch(e){res.status(e.status||500).json({success:false,message:e.status?e.message:'Team & access operation failed'});}};
const uniq=a=>[...new Set(a)];
const normPhone=x=>String(x??'').replace(/[\s\-()]/g,'').replace(/^\+91/,'');
const validPhone=x=>/^[6-9]\d{9}$/.test(x);
const text=(x,max=160)=>String(x??'').trim().slice(0,max);
const actor=req=>db.col('users').get(req.user.real_user_id);
const rank={owner:100,admin:90,manager:70,branch_admin:60,accountant:50,service_agent:45,
 service_associate:40,pickup_manager:40,booking_executive:40,agent:20,driver:20,helper:20,conductor:20,viewer:10};
const isManager=req=>['owner','admin'].includes(actor(req)?.role);
const canManage=(req,target)=>{
 const user=actor(req);
 if(!user||!A.permsFor(user).includes('iam.manage_users'))error('Cannot manage users',403);
 if(target?.role==='owner'&&user.role!=='owner')error('Only the owner can manage owners',403);
 if(target&&target.id===user.id&&req.method==='DELETE')error('Cannot delete your own account',403);
 if(target&&target.id===user.id&&req.body?.status==='INACTIVE')error('Cannot deactivate yourself',403);
 if(target&&target.id===user.id&&req.body?.role&&req.body.role!==user.role)error('Cannot change your own role',403);
 if(!isManager(req)&&(rank[target?.role]||0)>=(rank[user.role]||0))error('Cannot manage a higher or equal role',403);
};
const guardRole=(req,role)=>{
 if(!A.roles()[role])error('Unknown role');
 const a=actor(req);
 if(role==='owner'&&a?.role!=='owner')error('Only owner may assign owner',403);
 if((rank[role]||30)>(rank[a?.role]||0))error('Cannot assign role above your own',403);
};
const ensureBranch=x=>{
 if(x==null||x==='')return null;
 const n=Number(x),b=Number.isInteger(n)&&db.col('branches').get(n);
 if(!b)error('Branch not found',400);
 return n;
};
const routeIds=(incoming,limit=false)=>{
 if(!Array.isArray(incoming))return [];
 const selected=uniq(incoming.map(Number));
 if(selected.length>150||selected.some(x=>!Number.isSafeInteger(x)||!db.col('routes').get(x)))error('Unknown route assignment');
 return limit&&selected.length===0?error('Select at least one permitted route'):selected;
};
const permissionCodes=new Set(Object.values(A.CATALOG).flat());
const authOverrides=(b,req)=>{
 const extra=uniq((Array.isArray(b.extra_permissions)?b.extra_permissions:[]).map(String));
 const deny=uniq((Array.isArray(b.denied_permissions)?b.denied_permissions:[]).map(String));
 if(extra.some(x=>!permissionCodes.has(x))||deny.some(x=>!permissionCodes.has(x)))error('Unknown permission code');
 const current=actor(req);
 if(extra.some(x=>!A.permsFor(current).includes(x)))error('Cannot grant privileges you do not possess',403);
 if(extra.some(x=>deny.includes(x)))error('A permission cannot be both allowed and denied');
 return {extra_permissions:extra,denied_permissions:deny};
};
const sessionsOff=(id)=>{
 let count=0;
 for(const row of db.col('auth_sessions').filter(x=>String(x.user_id)===String(id)&&!x.revoked_at)){
  db.col('auth_sessions').update(row.id,{revoked_at:new Date().toISOString()});count++;
 }
 return count;
};
const exposeUser=u=>({
 ...A.publicUser(u),email:u.email||'',language:u.language||'English',
 status:u.status||'ACTIVE',mode:u.mode||'Online',agent_category:u.agent_category||'agent',
 agent_type:u.agent_type||'postpaid',master_agent_id:u.master_agent_id||null,
 branch_id:u.branch_id||null,limit_routes:!!u.limit_routes,route_ids:u.route_ids||[],
 extra_permissions:u.extra_permissions||[],denied_permissions:u.denied_permissions||[],
 created_at:u.created_at,last_login:u.last_login||null,login_count:Number(u.login_count)||0,
 commission_pct:Number(u.commission_pct)||0,credit_limit:Number(u.credit_limit)||0,
 deleted_at:u.deleted_at||null
});
const safeEmail=v=>{
 const s=text(v,150);if(s&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)))error('Invalid email');
 return s;
};
const safeRole=(req,role,category)=>{
 guardRole(req,role);
 if(category==='agents'&&role!=='agent')error('Agent section requires Agent role');
 if(category==='bus-staff'&&!['driver','helper','conductor','pickup_manager'].includes(role))
  error('Bus staff must have an appropriate crew role');
};
const categoryOf=x=>x.role==='agent'?'agents':
 ['driver','helper','conductor','pickup_manager'].includes(x.role)?'bus-staff':'office-staff';
function userPayload(b,req,old=null){
 const mode=b.mode===undefined?(old?.mode||'Online'):b.mode;
 if(!['Online','Offline'].includes(mode))error('Invalid agent mode');
 const role=b.role??old?.role??'booking_executive';
 const cat=b.category||categoryOf({role});
 if(!['agents','office-staff','bus-staff'].includes(cat))error('Invalid user category');
 safeRole(req,role,cat);
 const name=text(b.name??old?.name,140)||text(old?.phone||b.phone,10);
 const email=safeEmail(b.email??old?.email);
 const status=b.status??old?.status??'ACTIVE';
 if(!['ACTIVE','INACTIVE'].includes(status))error('Invalid account status');
 const agent_category=b.agent_category??old?.agent_category??'agent';
 if(role==='agent'&&!['agent','master_agent'].includes(agent_category))error('Invalid agent type');
 const id=b.branch_id===undefined?(old?.branch_id||null):ensureBranch(b.branch_id);
 const limit=!!(b.limit_routes??old?.limit_routes??false);
 const routes=b.route_ids===undefined?(old?.route_ids||[]):routeIds(b.route_ids,limit);
 if(limit&&!routes.length)error('At least one allowed route is required');
 const language=text(b.language??old?.language??'English',40)||'English';
 if(!['English','Hindi','Kannada','Tamil','Telugu','Malayalam','Marathi','Bengali','Gujarati','Punjabi','Odia','Assamese','Urdu'].includes(language))
  error('Unsupported language');
 let masterId=b.master_agent_id??old?.master_agent_id??null;
 if(masterId){
  const master=db.col('users').get(Number(masterId));
  if(!master||master.role!=='agent'||master.agent_category!=='master_agent'||master.deleted_at)
   error('Master agent not found');
  masterId=Number(masterId);
 }
 const permissions=b.extra_permissions!==undefined||b.denied_permissions!==undefined?
  authOverrides({extra_permissions:b.extra_permissions??old?.extra_permissions??[],
    denied_permissions:b.denied_permissions??old?.denied_permissions??[]},req):
  {extra_permissions:old?.extra_permissions||[],denied_permissions:old?.denied_permissions||[]};
 return {name,email,language,role,branch_id:id,status,mode:role==='agent'?mode:'Online',
   agent_category:role==='agent'?agent_category:'agent',master_agent_id:role==='agent'?masterId:null,
   agent_type:old?.agent_type||'postpaid',commission_pct:old?.commission_pct||0,
   credit_limit:old?.credit_limit||0,limit_routes:limit,route_ids:routes,...permissions};
}
const branchInput=(b,old=null)=>{
 const code=text(b.code??old?.code,16).toUpperCase(),name=text(b.name??old?.name,120);
 if(!/^[A-Z0-9][A-Z0-9_-]{1,15}$/.test(code))error('Branch code must be 2–16 uppercase letters, digits, hyphen or underscore');
 if(!name)error('Branch name required');
 const existing=db.col('branches').find(x=>x.id!==old?.id&&String(x.code||'').toUpperCase()===code);
 if(existing)error('Branch code already exists',409);
 const operations_area=b.operations_area??old?.operations_area??'sales_only';
 if(!['sales_only','cities','routes','both'].includes(operations_area))error('Unknown operations area');
 let cid=b.city_id===undefined?old?.city_id:b.city_id;
 if(cid===''||cid===null)cid=null;
 else if(cid!==undefined){
  if(!Number.isInteger(Number(cid))||!db.col('cities').get(Number(cid)))error('Unknown city');
  cid=Number(cid);
 }
 const city_ids=Array.isArray(b.operation_city_ids)?uniq(b.operation_city_ids.map(Number)):
  old?.operation_city_ids||[];
 if(city_ids.some(id=>!db.col('cities').get(id)))error('Invalid operational city');
 const route_ids=Array.isArray(b.operation_route_ids)?routeIds(b.operation_route_ids):
  old?.operation_route_ids||[];
 if(['cities','both'].includes(operations_area)&&!city_ids.length&&!cid)error('Choose at least one operating city');
 if(['routes','both'].includes(operations_area)&&!route_ids.length)error('Choose at least one operating route');
 const phone=normPhone(b.phone??old?.phone||'');
 if(phone&&!validPhone(phone))error('Enter a valid 10-digit contact phone');
 return {code,name,city_id:cid||null,city:text(b.city??old?.city,100),
   phone,address:text(b.address??old?.address,300),operations_area,operation_city_ids:city_ids,
   operation_route_ids:route_ids};
};
function allowBranchEdit(req){
 if(!['owner','admin'].includes(actor(req)?.role))error('Only owners and admins can manage branches',403);
}
const noDeleteReferences=id=>{
 if(db.col('users').count(x=>!x.deleted_at&&String(x.branch_id)===String(id)))
  error('Move branch users before deleting their branch',409);
};
function actorChanges(req,action,id,changed){
 D.audit('iam',action,id,{changed},req.user);
}
r.get('/team-access/v26',A.can('settings.view'),wrap(req=>{
 const users=db.col('users').all().filter(x=>!x.deleted_at).map(exposeUser);
 const staff=A.permsFor(actor(req)).includes('staff.view')?
  db.col('staff').all().filter(s=>['driver','helper','conductor'].includes(s.role)).map(s=>({
   id:s.id,name:s.name,phone:s.phone,role:s.role,status:s.status||'ACTIVE',created_at:s.created_at,staff_only:true})):[];
 return {users,staff,branches:db.col('branches').all(),roles:Object.entries(A.roles()).map(([key,value])=>({
  key,...value,builtin:!!A.DEFAULT_ROLES[key],users:users.filter(x=>x.role===key).length})),
  catalog:A.CATALOG,routes:db.col('routes').all().map(x=>({id:x.id,name:x.name||x.route_name||x.service_number||'Route '+x.id})),
  cities:db.col('cities').all().map(x=>({id:x.id,name:x.name})),
  matrix:ROWS,role_columns:ROLE_COLUMNS,role_descriptions:ROLE_DESCRIPTIONS,role_hues:ROLE_HUES,
  grants:{manage_users:A.permsFor(actor(req)).includes('iam.manage_users'),
   manage_roles:A.permsFor(actor(req)).includes('iam.manage_roles'),
   manage_branches:['owner','admin'].includes(actor(req)?.role)},
  note:'Own and Branch scope metadata is displayed for review but not yet enforced uniformly across all domain endpoints.'
 };
}));
r.post('/team-access/v26/users',A.can('iam.manage_users'),wrap(req=>{
 const b=req.body||{},phone=normPhone(b.phone);
 if(!validPhone(phone))error('Enter a valid 10-digit Indian phone');
 if(db.col('users').find(x=>x.phone===phone))error('Phone is already registered',409);
 const p=userPayload(b,req);
 const u=db.col('users').insert({phone,...p});
 actorChanges(req,'user-create',u.id,{role:u.role,branch_id:u.branch_id});
 return exposeUser(u);
}));
r.put('/team-access/v26/users/:id',A.can('iam.manage_users'),wrap(req=>{
 const u=db.col('users').get(req.params.id);
 if(!u||u.deleted_at)error('User not found',404);
 canManage(req,u);
 const b=req.body||{};
 if(b.phone!==undefined&&normPhone(b.phone)!==u.phone)error('Phone number cannot be modified. Create a new identity.');
 const p=userPayload(b,req,u);
 const changed=Object.keys(p).filter(k=>JSON.stringify(p[k])!==JSON.stringify(u[k]));
 if(!changed.length)return exposeUser(u);
 const update=db.col('users').update(u.id,p);
 const revoked=sessionsOff(u.id);
 actorChanges(req,'user-update',u.id,{changed,revoked_sessions:revoked});
 return {...exposeUser(update),revoked_sessions:revoked};
}));
r.delete('/team-access/v26/users/:id',A.can('iam.manage_users'),wrap(req=>{
 const u=db.col('users').get(req.params.id);
 if(!u||u.deleted_at)error('User not found',404);
 canManage(req,u);
 if(u.role==='owner')error('Owner identity cannot be deleted',403);
 if(db.col('users').count(x=>x.master_agent_id===u.id&&!x.deleted_at))
  error('Reassign sub-agents before removing this master agent',409);
 const removed=db.col('users').update(u.id,{status:'INACTIVE',deleted_at:new Date().toISOString()});
 const revoked=sessionsOff(u.id);
 for(const g of db.col('iam_groups').all())if((g.user_ids||[]).includes(u.id))
  db.col('iam_groups').update(g.id,{user_ids:g.user_ids.filter(x=>x!==u.id)});
 actorChanges(req,'user-deactivate-and-archive',u.id,{revoked_sessions:revoked});
 return {archived:true,id:removed.id,revoked_sessions:revoked};
}));
r.post('/team-access/v26/branches',A.can('settings.modify'),wrap(req=>{
 allowBranchEdit(req);
 const p=branchInput(req.body||{}),row=db.col('branches').insert(p);
 D.audit('iam','branch',row.id,{created:true,code:row.code},req.user);
 return row;
}));
r.put('/team-access/v26/branches/:id',A.can('settings.modify'),wrap(req=>{
 allowBranchEdit(req);
 const row=db.col('branches').get(req.params.id);if(!row)error('Branch not found',404);
 const p=branchInput(req.body||{},row);
 const out=db.col('branches').update(row.id,p);
 D.audit('iam','branch',row.id,{updated:true},req.user);
 return out;
}));
r.delete('/team-access/v26/branches/:id',A.can('settings.modify'),wrap(req=>{
 allowBranchEdit(req);
 const row=db.col('branches').get(req.params.id);if(!row)error('Branch not found',404);
 noDeleteReferences(row.id);
 db.col('branches').remove(row.id);
 D.audit('iam','branch',row.id,{deleted:true},req.user);
 return {deleted:true};
}));
r.put('/team-access/v26/roles/batch',A.can('iam.manage_roles'),wrap(req=>{
 const list=req.body?.roles;
 if(!Array.isArray(list)||list.length<1||list.length>30)error('Invalid role matrix');
 const existing=db.meta('roles')||{},next={...existing},catalog=Object.values(A.CATALOG).flat();
 const allRows=ROWS.flatMap(s=>s.rows),lookup=new Map(allRows.map(x=>[x.label,x]));
 const controlled=new Set(allRows.map(x=>x.code));
 const known=new Set(Object.keys(A.roles()));
 for(const item of list){
  if(!item||typeof item.key!=='string'||item.key==='owner'||!known.has(item.key))
   error('Unknown or owner role');
  const role=A.roles()[item.key],matrix=item.matrix;
  if(!matrix||typeof matrix!=='object'||Array.isArray(matrix))error('Invalid role matrix data');
  if(Object.keys(matrix).some(label=>!lookup.has(label)))error('Unknown matrix permission row');
  const ui={},scopes={},enabled=new Set();
  for(const row of allRows){
   const inherited=Object.hasOwn(role.ui_permissions||{},row.label)?role.ui_permissions[row.label]:
    role.permissions.includes(row.code);
   const prev=role.scopes?.[row.label]||(inherited?(row.kind==='scope'?'Company':'On'):'Off');
   const v=Object.hasOwn(matrix,row.label)?matrix[row.label]:prev;
   if(!['Off','On','Own','Branch','Company'].includes(v)||
     (row.kind==='toggle'&&!['Off','On'].includes(v)))error('Invalid role permission scope for '+row.label);
   ui[row.label]=v!=='Off';if(row.kind==='scope')scopes[row.label]=v;
   if(v!=='Off')enabled.add(row.code);
  }
  const previous=role.permissions||[];
  const codes=[...new Set([...previous.filter(code=>!controlled.has(code)),...enabled])].filter(x=>catalog.includes(x));
  next[item.key]={...role,name:role.name,permissions:codes,ui_permissions:ui,scopes,limits:role.limits||{}};
 }
 db.meta('roles',next);
 D.audit('iam','role-matrix','batch',{updated_roles:list.map(x=>x.key)},req.user);
 // Revoke every active session on role-policy changes, preventing stale access.
 let revoked=0;for(const u of db.col('users').all().filter(x=>list.some(item=>item.key===x.role)))revoked+=sessionsOff(u.id);
 return {saved:true,roles:list.map(x=>x.key),revoked_sessions:revoked};
}));
r.post('/team-access/v26/roles',A.can('iam.manage_roles'),wrap(req=>{
 const name=text(req.body?.name,70),key=name.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
 if(name.length<3||!key||key==='owner'||key.length>40||A.roles()[key])error('Role name is unavailable');
 const next={...(db.meta('roles')||{})};
 next[key]={name,permissions:[],scopes:{},ui_permissions:{},limits:{}};
 db.meta('roles',next);D.audit('iam','role',key,{created:name},req.user);
 return {key,...next[key]};
}));
r.delete('/team-access/v26/roles/:key',A.can('iam.manage_roles'),wrap(req=>{
 const k=req.params.key;
 if(A.DEFAULT_ROLES[k])error('Built-in roles cannot be deleted',403);
 if(db.col('users').count(x=>x.role===k&&!x.deleted_at))error('Reassign users before deleting their role',409);
 const v={...(db.meta('roles')||{})};if(!v[k])error('Role not found',404);
 delete v[k];db.meta('roles',v);D.audit('iam','role',k,{deleted:true},req.user);return {deleted:true};
}));
r.get('/team-access/v26/evaluate/:id',A.can('settings.view'),wrap(req=>{
 const u=db.col('users').get(req.params.id);if(!u||u.deleted_at)error('User not found',404);
 return {user:exposeUser(u),role:A.roles()[u.role]||null,
  branches:u.branch_id?[db.col('branches').get(u.branch_id)].filter(Boolean):[],
  routes:(u.route_ids||[]).map(x=>db.col('routes').get(x)).filter(Boolean),
  groups:db.col('iam_groups').filter(g=>(g.user_ids||[]).includes(u.id)).map(g=>({id:g.id,name:g.name})),
  scope_enforcement:'API code grants active; Own/Branch filtering is not uniformly enforced by all domain endpoints.'};
}));
module.exports=r;
