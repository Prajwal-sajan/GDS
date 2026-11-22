// v16 IAM compatibility bridge: registered before the existing misc router.
// Explicitly overlays only new/changed IAM handlers, preserving all earlier modules.
const express=require('express');
const db=require('../db');
const D=require('../domain');
const A=require('../auth');
const r=express.Router();
const can=A.can;
const h=(fn)=>(req,res)=>{try{const out=fn(req,res);if(out!==undefined)res.json(out);}catch(e){res.status(e.status||500).json({success:false,message:e.message});}};
// Only privileged administrators can assign equal-or-lower roles, never elevate above their own role.
const IAM_RANK={owner:100,admin:90,manager:70,accountant:50,booking_executive:50,pickup_manager:50,driver:20,agent:20};
// Effective user scopes are enforced here for Settings IAM operations.
function effectiveActor(req) {
  return db.col('users').get(req.user.id) || db.col('users').get(req.user.real_user_id);
}
function scopeFor(req, label) {
  const actor=effectiveActor(req);
  const role=A.roles()[actor?.role]||{};
  if(actor?.role==='branch_admin')return 'Branch'; // never widen branch admin access via role edits
  return role.scopes?.[label] || 'Company';
}
function canViewTarget(req,target,label='View users') {
  const actor=effectiveActor(req),scope=scopeFor(req,label);
  if(!actor||scope==='Off')return false;
  if(scope==='Own')return Number(target.id)===Number(actor.id);
  if(scope==='Branch')return !!actor.branch_id && Number(target.branch_id)===Number(actor.branch_id);
  return scope==='Company';
}
function enforceTarget(req,target,label) {
  if(!canViewTarget(req,target,label))throw D.httpErr(403,'Target is outside your permitted user scope');
}
function enforceNewUserScope(req,branchId) {
  const actor=effectiveActor(req),scope=scopeFor(req,'Add users (roles below their own)');
  if(!actor||scope==='Off'||scope==='Own')throw D.httpErr(403,'Role is not allowed to create users');
  if(scope==='Branch'&&(!actor.branch_id||Number(branchId)!==Number(actor.branch_id)))
    throw D.httpErr(403,'New user must belong to your branch');
}
function guardRoleChange(req, role) {
  const actual=effectiveActor(req);
  const rank=IAM_RANK[actual?.role] ?? 30;
  if(role==='owner'&&actual?.role!=='owner')throw D.httpErr(403,'Only the owner can assign owner');
  if((IAM_RANK[role]??30)>rank)throw D.httpErr(403,'Cannot assign a higher role than your own');
}
function guardTarget(req, target) {
  const actual=effectiveActor(req);
  if(actual?.role==='owner')return;
  if((IAM_RANK[target.role]??30)>(IAM_RANK[actual?.role]??30))throw D.httpErr(403,'Cannot modify a user with a higher role than your own');
}
// IAM
r.get('/iam/users', can('settings.view'), h((req) => db.col('users').filter(u=>canViewTarget(req,u)).map((u) => ({ ...A.publicUser(u), email:u.email || '', status:u.status, created_at:u.created_at, updated_at:u.updated_at, last_login:u.last_login || null, login_count:u.login_count || 0, agent_type:u.agent_type || '', commission_pct:u.commission_pct || 0, credit_limit:u.credit_limit || 0, mode:u.mode || 'Online', route_ids:u.route_ids || [], extra_permissions:u.extra_permissions || [], denied_permissions:u.denied_permissions || [] }))));
r.post('/iam/users', can('iam.manage_users'), h((req) => { const b = req.body; if (!/^\d{10}$/.test(b.phone || '')) throw D.httpErr(400, 'Valid 10-digit phone required'); if (db.col('users').find((u) => u.phone === b.phone)) throw D.httpErr(409, 'User exists'); if (!A.roles()[b.role]) throw D.httpErr(400, 'Unknown role'); guardRoleChange(req,b.role); enforceNewUserScope(req,b.branch_id); if(b.branch_id&&!db.col('branches').get(Number(b.branch_id))) throw D.httpErr(400,'Branch not found'); return db.col('users').insert({ phone: b.phone, name: b.name || b.phone, role: b.role, status: 'ACTIVE', branch_id: b.branch_id || null, commission_pct: b.commission_pct, agent_type: b.agent_type, credit_limit: b.credit_limit, email:String(b.email||'').slice(0,150), mode:b.mode==='Offline'?'Offline':'Online', route_ids:Array.isArray(b.route_ids)?b.route_ids.map(Number).filter(Number.isFinite):[], extra_permissions:Array.isArray(b.extra_permissions)?b.extra_permissions.filter(x=>Object.values(A.CATALOG).flat().includes(x) && (db.col('users').get(req.user.real_user_id)?.role==='owner' || A.permsFor(db.col('users').get(req.user.real_user_id)).includes(x))):[], denied_permissions:Array.isArray(b.denied_permissions)?b.denied_permissions.filter(x=>Object.values(A.CATALOG).flat().includes(x)):[] }); }));
r.put('/iam/users/:id', can('iam.manage_users'), h((req) => { const u = db.col('users').get(req.params.id); if (!u) throw D.httpErr(404, 'Not found'); enforceTarget(req,u,'Edit users (name, branch, status, routes)'); if (u.role === 'owner' && req.user.role !== 'owner') throw D.httpErr(403, 'Cannot edit owner'); if (u.id === req.user.real_user_id && req.body.status === 'INACTIVE') throw D.httpErr(400, 'You cannot deactivate yourself'); guardTarget(req,u); if (u.id === req.user.real_user_id && req.body.role && req.body.role !== u.role) throw D.httpErr(400, 'You cannot change your own role'); const permitted=['name','email','role','branch_id','status','commission_pct','agent_type','credit_limit','mode','route_ids','extra_permissions','denied_permissions'];
  const rest=Object.fromEntries(Object.entries(req.body).filter(([key])=>permitted.includes(key)));
  if(rest.role && !A.roles()[rest.role])throw D.httpErr(400,'Unknown role');
  if(rest.role)guardRoleChange(req,rest.role);
  if(rest.role==='owner' && req.user.role!=='owner')throw D.httpErr(403,'Owner role restricted');
  if(rest.status && !['ACTIVE','INACTIVE'].includes(rest.status))throw D.httpErr(400,'Invalid status');
  const pcat=Object.values(A.CATALOG).flat();
  for(const key of ['extra_permissions','denied_permissions'])if(rest[key])rest[key]=rest[key].filter(x=>pcat.includes(x));
  if(rest.extra_permissions){const actor=db.col('users').get(req.user.real_user_id);if(actor?.role!=='owner')rest.extra_permissions=rest.extra_permissions.filter(x=>A.permsFor(actor).includes(x));}
  if(rest.branch_id!==undefined){rest.branch_id=rest.branch_id?Number(rest.branch_id):null;if(rest.branch_id&&!db.col('branches').get(rest.branch_id))throw D.httpErr(400,'Branch not found'); const actor=effectiveActor(req);if(scopeFor(req,'Edit users (name, branch, status, routes)')==='Branch'&&rest.branch_id!==Number(actor.branch_id))throw D.httpErr(403,'Cannot move a user outside your branch');}
  if(rest.route_ids)rest.route_ids=rest.route_ids.map(Number).filter(Number.isFinite);
  const output=db.col('users').update(u.id, rest);
  D.audit('iam','user',u.id,{changed:Object.keys(rest)},req.user);
  return { ...A.publicUser(output),status:output.status,email:output.email||'' }; }));
r.put('/iam/roles/:key', can('iam.manage_roles'), h((req) => { const k = req.params.key; if (!A.roles()[k] && (k==='owner'||k==='admin'||k==='manager'||k==='branch_admin'))throw D.httpErr(400,'Reserved role name'); if (k === 'owner') throw D.httpErr(400, 'Owner role cannot be changed'); const all = Object.values(A.CATALOG).flat(); const custom = db.meta('roles') || {}; custom[k] = { name: req.body.name || A.roles()[k]?.name || k, permissions: (req.body.permissions || []).filter((p) => all.includes(p)), scopes: req.body.scopes && typeof req.body.scopes==='object' ? Object.fromEntries(Object.entries(req.body.scopes).filter(([k,v])=>typeof k==='string'&&k.length>0&&k.length<=180&&['Off','Own','Branch','Company'].includes(v))) : {}, limits: req.body.limits && typeof req.body.limits==='object' ? Object.fromEntries(Object.entries(req.body.limits).filter(([k,v])=>/^[a-z0-9_:. -]{1,90}$/i.test(k)&&Number.isFinite(Number(v))).map(([k,v])=>[k,Number(v)])) : {}, ui_permissions: req.body.ui_permissions && typeof req.body.ui_permissions === 'object' ? Object.fromEntries(Object.entries(req.body.ui_permissions).filter(([k,v])=>typeof k==='string'&&k.length>0&&k.length<=180&&typeof v==='boolean')) : {} }; db.meta('roles', custom); return custom[k]; }));

module.exports=r;
