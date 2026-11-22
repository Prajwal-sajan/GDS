'use strict';
// Operator Team & Access v26. All mutations are server-authorized and audited.
// Store remains JSON for local pilot; do not treat UI scopes as domain-row security.
const express=require('express'),db=require('../db'),A=require('../auth'),D=require('../domain');
const {ROWS,ALL_ROWS,byKey,byLabel,role_columns,ROLE_COLUMNS,ROLE_DESCRIPTIONS,ROLE_HUES,LIMIT_FIELDS,permissionAvailable,legacyFor}=require('../team-access-schema-v27');
const r=express.Router();
const error=(message,status=400)=>{throw D.httpErr(status,message);};
const wrap=fn=>(req,res)=>{try{res.set('Cache-Control','private, no-store');const out=fn(req,res);if(out!==undefined)res.json(out);}catch(e){res.status(e.status||500).json({success:false,message:e.status?e.message:'Team & access operation failed'});}};
const uniq=a=>[...new Set(a)];
const normPhone=x=>String(x??'').replace(/[\s\-()]/g,'').replace(/^\+91/,'');
const validPhone=x=>/^[6-9]\d{9}$/.test(x);
const text=(x,max=160)=>String(x??'').trim().slice(0,max);
const actor=req=>db.col('users').get(req.user.real_user_id);
const visibleTo=(actor,users)=>['owner','admin','manager'].includes(actor?.role)?users:
 users.filter(u=>u.id===actor?.id||(actor?.branch_id&&String(u.branch_id)===String(actor.branch_id)));
const syncStaff=u=>{
 if(!['driver','helper','conductor','manager','owner'].includes(u.role))return;
 const current=db.col('staff').find(x=>normPhone(x.phone)===normPhone(u.phone));
 if(!current){db.col('staff').insert({name:u.name,phone:u.phone,role:u.role,status:'active',
  salary_type:'monthly',salary_amount:0,bank:{},linked_user_id:u.id});return;}
 if(!current.linked_user_id||Number(current.linked_user_id)===Number(u.id))
  db.col('staff').update(current.id,{name:u.name,linked_user_id:u.id});
};
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
 const commission_pct=b.commission_pct===undefined?(old?.commission_pct||0):Number(b.commission_pct);
 const credit_limit=b.credit_limit===undefined?(old?.credit_limit||0):Number(b.credit_limit);
 const agent_type=b.agent_type??old?.agent_type??'postpaid';
 if(!Number.isFinite(commission_pct)||commission_pct<0||commission_pct>100)error('Commission must be between 0 and 100%');
 if(!Number.isFinite(credit_limit)||credit_limit<0)error('Credit limit cannot be negative');
 if(!['prepaid','postpaid'].includes(agent_type))error('Invalid settlement type');
 const agent_category=b.agent_category??old?.agent_category??'agent';
 if(role==='agent'&&!['agent','master_agent'].includes(agent_category))error('Invalid agent type');
 const id=b.branch_id===undefined?(old?.branch_id||null):ensureBranch(b.branch_id);
 const limit=!!(b.limit_routes??old?.limit_routes??false);
 const routes=b.route_ids===undefined?(old?.route_ids||[]):routeIds(b.route_ids,limit);
 if(limit&&!routes.length)error('At least one allowed route is required');
 const language=text(b.language??old?.language??'English',40)||'English';
 if(!['English','Hindi','Kannada','Tamil','Telugu','Malayalam','Marathi','Bengali','Gujarati','Punjabi','Odia','Assamese','Urdu'].includes(language))
  error('Unsupported language');
 let masterId=b.master_agent_id===undefined?(old?.master_agent_id||null):b.master_agent_id;
 if(masterId){
  if(Number(masterId)===Number(old?.id))error('An agent cannot be their own master');
  const master=db.col('users').get(Number(masterId));
  if(!master||master.role!=='agent'||master.agent_category!=='master_agent'||master.deleted_at)
   error('Master agent not found');
  if(master.master_agent_id)error('Nested master-agent structures are not supported');
  masterId=Number(masterId);
 }
 const permissions=b.extra_permissions!==undefined||b.denied_permissions!==undefined?
  authOverrides({extra_permissions:b.extra_permissions??old?.extra_permissions??[],
    denied_permissions:b.denied_permissions??old?.denied_permissions??[]},req):
  {extra_permissions:old?.extra_permissions||[],denied_permissions:old?.denied_permissions||[]};
 return {name,email,language,role,branch_id:id,status:role==='agent'&&mode==='Offline'?'INACTIVE':status,mode:role==='agent'?mode:'Online',
   agent_category:role==='agent'?agent_category:'agent',master_agent_id:role==='agent'?masterId:null,
   agent_type,commission_pct,credit_limit,limit_routes:limit,route_ids:routes,...permissions};
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
 const phone=normPhone((b.phone??old?.phone) || '');
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
 D.audit('iam',id,action,changed,req.user);
}
r.get('/team-access/v26',A.can('settings.view'),wrap(req=>{
 const allUsers=db.col('users').all().filter(x=>!x.deleted_at).map(exposeUser);
 const users=visibleTo(actor(req),allUsers);
 const staff=A.permsFor(actor(req)).includes('staff.view')?
  db.col('staff').all().filter(s=>['driver','helper','conductor'].includes(s.role)).map(s=>({
   id:s.id,name:s.name,phone:s.phone,role:s.role,status:s.status||'ACTIVE',created_at:s.created_at,staff_only:true})):[];
 return {users,staff,branches:db.col('branches').all().filter(b=>['owner','admin','manager'].includes(actor(req)?.role)||String(b.id)===String(actor(req)?.branch_id)),roles:Object.entries(A.roles()).map(([key,value])=>({
  key,...value,builtin:!!A.DEFAULT_ROLES[key],users:users.filter(x=>x.role===key).length})),
  catalog:A.CATALOG,routes:db.col('routes').all().map(x=>({id:x.id,name:x.name||x.route_name||x.service_number||'Route '+x.id})),
  cities:db.col('cities').all().map(x=>({id:x.id,name:x.name})),
  matrix:ROWS,role_columns:ROLE_COLUMNS,role_descriptions:ROLE_DESCRIPTIONS,role_hues:ROLE_HUES,
  matrix_revision:db.meta('team_matrix_revision_v27')||0,matrix_version:27,
  matrix_limit_fields:LIMIT_FIELDS,
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
 syncStaff(u);
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
 if(u.role==='agent'&&u.agent_category==='master_agent'&&p.agent_category!=='master_agent'&&
   db.col('users').count(x=>x.master_agent_id===u.id&&!x.deleted_at))
   error('Move sub-agents before changing a master agent to a regular agent',409);
 const changed=Object.keys(p).filter(k=>JSON.stringify(p[k])!==JSON.stringify(u[k]));
 if(!changed.length)return exposeUser(u);
 const update=db.col('users').update(u.id,p);
 syncStaff(update);
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
 D.audit('iam',row.id,'branch-created',{created:true,code:row.code},req.user);
 return row;
}));
r.put('/team-access/v26/branches/:id',A.can('settings.modify'),wrap(req=>{
 allowBranchEdit(req);
 const row=db.col('branches').get(req.params.id);if(!row)error('Branch not found',404);
 const p=branchInput(req.body||{},row);
 const out=db.col('branches').update(row.id,p);
 D.audit('iam',row.id,'branch-updated',{updated:true},req.user);
 return out;
}));
r.delete('/team-access/v26/branches/:id',A.can('settings.modify'),wrap(req=>{
 allowBranchEdit(req);
 const row=db.col('branches').get(req.params.id);if(!row)error('Branch not found',404);
 noDeleteReferences(row.id);
 db.col('branches').remove(row.id);
 D.audit('iam',row.id,'branch-deleted',{deleted:true},req.user);
 return {deleted:true};
}));
// Role matrix save is atomic at the document-policy level: validate every cell,
 // numeric limit, role and stale revision before changing the stored roles.
const allowedValue=(row,v)=>row.kind==='scope'?['Off','Own','Branch','Company'].includes(v):['Off','On'].includes(v);
const roleValue=(role,row)=>{
 if(!permissionAvailable(row,role.key))return '—';
 const matrix=role.matrix_v27||{};
 if(Object.hasOwn(matrix,row.key))return matrix[row.key];
 const legacy=legacyFor[row.label]||row.label;
 if(role.scopes&&Object.hasOwn(role.scopes,row.label))return role.scopes[row.label];
 if(role.scopes&&Object.hasOwn(role.scopes,legacy))return role.scopes[legacy];
 if(role.ui_permissions&&Object.hasOwn(role.ui_permissions,row.label))
  return role.ui_permissions[row.label]?(row.kind==='scope'?'Company':'On'):'Off';
 if(role.ui_permissions&&Object.hasOwn(role.ui_permissions,legacy))
  return role.ui_permissions[legacy]?(row.kind==='scope'?'Company':'On'):'Off';
 return (role.permissions||[]).includes(row.code)?(row.kind==='scope'?'Company':'On'):'Off';
};
function limitValue(value,key){
 if(value===''||value===undefined||value===null)return null;
 const n=Number(value),max=LIMIT_FIELDS[key]?.max;
 if(!max||!Number.isInteger(n)||n<0||n>max||(key==='block_max_seats'&&n===0))
  error('Invalid '+key+' limit');
 return n;
}
r.put('/team-access/v26/roles/batch',A.can('iam.manage_roles'),wrap(req=>{
 const list=req.body?.roles;
 if(!Array.isArray(list)||!list.length||list.length>30)error('Invalid role matrix');
 const revision=db.meta('team_matrix_revision_v27')||0;
 if(req.body.base_revision!==undefined&&Number(req.body.base_revision)!==revision)
  error('Permission matrix changed in another session. Reload and review before saving.',409);
 const saved=db.meta('roles')||{},next={...saved};
 const existingRoles=A.roles(),catalog=Object.values(A.CATALOG).flat();
 const controlled=new Set(ALL_ROWS.map(row=>row.code));
 const seen=new Set(),changes=[];
 for(const item of list){
  if(!item||typeof item.key!=='string'||item.key==='owner'||!existingRoles[item.key]||seen.has(item.key))
   error('Unknown, repeated or owner role');
  seen.add(item.key);
  if(!item.matrix||typeof item.matrix!=='object'||Array.isArray(item.matrix))error('Invalid role matrix data');
  if(Object.keys(item.matrix).some(k=>!byKey.has(k)&&!byLabel.has(k)))error('Unknown matrix permission row');
  if(item.limits!==undefined && (!item.limits||typeof item.limits!=='object'||Array.isArray(item.limits)||
      Object.keys(item.limits).some(k=>!LIMIT_FIELDS[k])))error('Unknown role limit');
  const role={...existingRoles[item.key],key:item.key};
  const matrix={...(role.matrix_v27||{})},ui={...(role.ui_permissions||{})},scopes={...(role.scopes||{})};
  const enabled=new Set(),limits={...(role.limits||{})};
  for(const row of ALL_ROWS){
   const supplied=Object.hasOwn(item.matrix,row.key)?item.matrix[row.key]:
       Object.hasOwn(item.matrix,row.label)?item.matrix[row.label]:undefined;
   const current=roleValue(role,row);
   const v=supplied===undefined?(current==='—'?'Off':current):supplied;
   if(!allowedValue(row,v))error('Invalid access selection for '+row.label);
   if(!permissionAvailable(row,item.key)&&v!=='Off')error(row.label+' is not available to '+role.name,403);
   if(permissionAvailable(row,item.key)){
    matrix[row.key]=v;
    ui[row.label]=v!=='Off';
    if(row.kind==='scope')scopes[row.label]=v;
    if(v!=='Off')enabled.add(row.code);
   }else{
    delete matrix[row.key];delete ui[row.label];delete scopes[row.label];
   }
  }
  if(item.limits){
   for(const [key,value] of Object.entries(item.limits))limits[key]=limitValue(value,key);
  }
  if(matrix[byLabel.get('Cancel tickets').key]==='Off')limits.cancel_cutoff_hours=null;
  if(matrix[byLabel.get('Block seats').key]==='Off'){
   limits.block_max_seats=null;limits.block_max_hours=null;
  }
  const codes=[...new Set([...role.permissions.filter(code=>!controlled.has(code)),...enabled])].filter(x=>catalog.includes(x));
  const update={...role,name:role.name,permissions:codes,scopes,ui_permissions:ui,matrix_v27:matrix,limits};
  delete update.key;
  next[item.key]=update;
  if(JSON.stringify(role.permissions)!==JSON.stringify(codes)||
    JSON.stringify(role.matrix_v27||{})!==JSON.stringify(matrix)||
    JSON.stringify(role.limits||{})!==JSON.stringify(limits))changes.push(item.key);
 }
 if(!changes.length)return {saved:true,roles:[],revoked_sessions:0,matrix_revision:revision};
 db.meta('roles',next);
 db.meta('team_matrix_revision_v27',revision+1);
 D.audit('iam','role-matrix','batch-update-v27',{updated_roles:changes},req.user);
 let revoked=0;
 for(const user of db.col('users').all().filter(u=>changes.includes(u.role)))revoked+=sessionsOff(user.id);
 return {saved:true,roles:changes,revoked_sessions:revoked,matrix_revision:revision+1};
}));
r.post('/team-access/v26/roles',A.can('iam.manage_roles'),wrap(req=>{
 const name=text(req.body?.name,70),key=name.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
 if(name.length<3||!key||key==='owner'||key.length>40||A.roles()[key])error('Role name is unavailable');
 const next={...(db.meta('roles')||{})};
 next[key]={name,permissions:[],scopes:{},ui_permissions:{},limits:{}};
 db.meta('roles',next);D.audit('iam',key,'role-created',{created:name},req.user);
 return {key,...next[key]};
}));
r.delete('/team-access/v26/roles/:key',A.can('iam.manage_roles'),wrap(req=>{
 const k=req.params.key;
 if(A.DEFAULT_ROLES[k])error('Built-in roles cannot be deleted',403);
 if(db.col('users').count(x=>x.role===k&&!x.deleted_at))error('Reassign users before deleting their role',409);
 const v={...(db.meta('roles')||{})};if(!v[k])error('Role not found',404);
 delete v[k];db.meta('roles',v);D.audit('iam',k,'role-deleted',{deleted:true},req.user);return {deleted:true};
}));
r.get('/team-access/v26/evaluate/:id',A.can('settings.view'),wrap(req=>{
 const u=db.col('users').get(req.params.id);if(!u||u.deleted_at)error('User not found',404);
 if(!visibleTo(actor(req),[u]).length)error('User outside your branch scope',403);
 return {user:exposeUser(u),role:A.roles()[u.role]||null,
  branches:u.branch_id?[db.col('branches').get(u.branch_id)].filter(Boolean):[],
  routes:(u.route_ids||[]).map(x=>db.col('routes').get(x)).filter(Boolean),
  groups:db.col('iam_groups').filter(g=>(g.user_ids||[]).includes(u.id)).map(g=>({id:g.id,name:g.name})),
  scope_enforcement:'API code grants active; Own/Branch filtering is not uniformly enforced by all domain endpoints.'};
}));
module.exports=r;
