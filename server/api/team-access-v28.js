'use strict';
// Team & access v28: screenshot Advanced, Test access and Groups APIs.
const express=require('express');
const db=require('../db'),A=require('../auth'),D=require('../domain');
const {ALL_ROWS,byKey}=require('../team-access-schema-v27');
const Policy=require('../team-access-policy-v28');
const r=express.Router();
const fail=(message,status=400)=>{throw D.httpErr(status,message);};
const wrap=fn=>(req,res)=>{try{
 res.set('Cache-Control','private, no-store');
 const result=fn(req,res);if(result!==undefined)res.json(result);
 }catch(e){res.status(e.status||500).json({success:false,message:e.status?e.message:'Access operation failed'});}
};
const actual=req=>db.col('users').get(req.user.real_user_id||req.user.id);
const visible=(req,u)=>{
 const me=actual(req);
 return !!me&&(['owner','admin','manager'].includes(me.role)||me.id===u.id||
   !!me.branch_id&&String(me.branch_id)===String(u.branch_id));
};
const currentUsers=req=>db.col('users').filter(u=>!u.deleted_at&&visible(req,u));
const revoke=ids=>{
 const names=new Set(ids.map(String));let count=0;
 for(const sess of db.col('auth_sessions').all()){
  if(names.has(String(sess.user_id))&&!sess.revoked_at){
   db.col('auth_sessions').update(sess.id,{revoked_at:new Date().toISOString()});count++;
  }
 }
 return count;
};
const clean=(x,max)=>String(x??'').trim().slice(0,max);
const revision=()=>db.meta('team_rules_revision_v28')||0;
const changed=(req,kind,ref,details)=>{db.meta('team_rules_revision_v28',revision()+1);D.audit('iam',ref,kind,details,req.user);};
function validateRule(req,body,old=null){
 const b=body||{},name=clean(b.name??old?.name,120),effect=b.effect??old?.effect,
   action_key=b.action_key??old?.action_key,subject_type=b.subject_type??old?.subject_type,
   raw=b.subject_id===undefined?old?.subject_id:b.subject_id;
 const subject_id=subject_type==='all'?null:raw;
 if(name.length<3)fail('Rule name must contain at least three characters');
 if(!['deny','limit'].includes(effect))fail('Rule must deny or limit; rules cannot grant access');
 if(action_key!=='*'&&!byKey.has(action_key))fail('Choose a known action');
 if(action_key==='*'&&effect!=='deny')fail('All-action rules must be restrictive');
 if(!['all','role','group','person'].includes(subject_type))fail('Choose role, group, person or everyone');
 if(subject_type==='role'&&(!A.roles()[subject_id]||subject_id==='owner'&&actual(req)?.role!=='owner'))fail('Invalid role target');
 if(subject_type==='group'&&!db.col('iam_groups').get(subject_id))fail('Group not found');
 if(subject_type==='person'){
  const user=db.col('users').get(subject_id);
  if(!user||user.deleted_at||!visible(req,user))fail('Person not found in accessible directory',403);
 }
 const c=b.condition??old?.condition??{kind:'always'};
 if(!c||typeof c!=='object'||Array.isArray(c))fail('Invalid rule condition');
 if(!['always','departure_within_hours','corridor_mismatch','write_action'].includes(c.kind))
  fail('Unknown condition');
 if(c.kind==='write_action'&&(action_key!=='*'||effect!=='deny'))fail('Read-only rules must deny write actions');
 if(action_key==='*'&&c.kind!=='write_action')fail('All-action rule requires write-action condition');
 if(c.kind==='departure_within_hours'){
  if(effect!=='deny'||action_key!==byKey.get('bookings__cancel_tickets')?.key)
   fail('Time-based cancellation rule requires Cancel tickets');
  if(!Number.isInteger(Number(c.hours))||Number(c.hours)<0||Number(c.hours)>8760)
   fail('Departure threshold must be between 0 and 8760 hours');
 }
 if(c.kind==='corridor_mismatch'&&(effect!=='deny'||action_key!==byKey.get('bookings__block_seats')?.key))
  fail('Corridor restriction applies only to Block seats');
 const limits=b.limits??old?.limits??{};
 if(!limits||typeof limits!=='object'||Array.isArray(limits)||
    Object.keys(limits).some(k=>!['max_seats','max_hours'].includes(k)))fail('Invalid rule limits');
 if(effect==='limit'&&(action_key!==byKey.get('bookings__block_seats')?.key||
      c.kind!=='always'||Object.keys(limits).length===0))fail('Limits only apply to Block seats');
 for(const [key,value] of Object.entries(limits)){
  if(!Number.isInteger(Number(value))||Number(value)<1||Number(value)>(key==='max_seats'?500:8760))
   fail('Invalid '+key+' limit');
 }
 if(effect==='deny'&&Object.keys(limits).length)fail('Deny rules cannot carry seat limits');
 return {name,effect,action_key,subject_type,subject_id,
  condition:c.kind==='departure_within_hours'?{kind:c.kind,hours:Number(c.hours)}:{kind:c.kind},
  limits:Object.fromEntries(Object.entries(limits).map(([k,v])=>[k,Number(v)])),
  enabled:b.enabled===undefined?(old?.enabled!==false):b.enabled===true,
  template_id:clean(b.template_id??old?.template_id,65)};
}
r.get('/team-access/v28/catalog',A.can('settings.view'),wrap(()=>({
 actions:ALL_ROWS.map(x=>({key:x.key,label:x.label,group:x.key.split('__')[0],kind:x.kind})),
 templates:Policy.RULE_TEMPLATES
})));
r.get('/team-access/v28/groups',A.can('settings.view'),wrap(req=>{
 const ids=new Set(currentUsers(req).map(u=>String(u.id)));
 return {groups:db.col('iam_groups').all().filter(g=>
   ['owner','admin'].includes(actual(req)?.role)|| (g.user_ids||[]).some(id=>ids.has(String(id))))
  .map(g=>({...g,user_ids:(g.user_ids||[]).filter(id=>ids.has(String(id)))}))};
}));
r.post('/team-access/v28/groups',A.can('iam.manage_roles'),wrap(req=>{
 const name=clean(req.body?.name,90);
 if(name.length<2)fail('Enter a group name');
 if(db.col('iam_groups').find(g=>g.name.toLowerCase()===name.toLowerCase()))
  fail('Group name already exists',409);
 const g=db.col('iam_groups').insert({name,description:'',user_ids:[]});
 changed(req,'group-created',g.id,{name});return g;
}));
r.put('/team-access/v28/groups/:id',A.can('iam.manage_roles'),wrap(req=>{
 const group=db.col('iam_groups').get(req.params.id);if(!group)fail('Group not found',404);
 const name=clean(req.body?.name??group.name,90);
 if(name.length<2)fail('Group name required');
 if(db.col('iam_groups').find(g=>g.id!==group.id&&g.name.toLowerCase()===name.toLowerCase()))
  fail('Group name exists',409);
 if(!Array.isArray(req.body?.user_ids)||req.body.user_ids.length>2000)fail('Select members');
 const ids=[...new Set(req.body.user_ids.map(Number))];
 const users=currentUsers(req),allowed=new Set(users.map(u=>Number(u.id)));
 if(ids.some(id=>!Number.isInteger(id)||!allowed.has(id)))fail('Invalid or inaccessible group member',403);
 const touched=[...new Set([...(group.user_ids||[]),...ids])];
 db.col('iam_groups').update(group.id,{name,description:clean(req.body?.description??group.description,250),user_ids:ids});
 const revoked=revoke(touched);
 changed(req,'group-updated',group.id,{users:ids.length,revoked_sessions:revoked});
 return {...db.col('iam_groups').get(group.id),revoked_sessions:revoked};
}));
r.delete('/team-access/v28/groups/:id',A.can('iam.manage_roles'),wrap(req=>{
 const g=db.col('iam_groups').get(req.params.id);if(!g)fail('Group not found',404);
 if(db.col('iam_access_rules_v28').count(rule=>rule.subject_type==='group'&&String(rule.subject_id)===String(g.id)))
  fail('Remove the group’s access rules before deleting it',409);
 const revoked=revoke(g.user_ids||[]);
 db.col('iam_groups').remove(g.id);
 changed(req,'group-deleted',g.id,{revoked_sessions:revoked});return {deleted:true,revoked_sessions:revoked};
}));
r.get('/team-access/v28/rules',A.can('iam.manage_roles'),wrap(()=>({
 revision:revision(),rules:db.col('iam_access_rules_v28').all().slice().sort((a,b)=>b.id-a.id),
 templates:Policy.RULE_TEMPLATES
})));
r.post('/team-access/v28/rules',A.can('iam.manage_roles'),wrap(req=>{
 if(db.col('iam_access_rules_v28').count()>500)fail('Rule capacity reached',409);
 const config=validateRule(req,req.body);
 const row=db.col('iam_access_rules_v28').insert({...config,created_by:req.user.id});
 const affected=config.subject_type==='person'?[config.subject_id]:
  config.subject_type==='group'?(db.col('iam_groups').get(config.subject_id)?.user_ids||[]):
  db.col('users').filter(u=>config.subject_type==='all'||u.role===config.subject_id).map(u=>u.id);
 const revoked=revoke(affected);
 changed(req,'rule-created',row.id,{action_key:row.action_key,subject:row.subject_type,revoked});
 return {...row,revoked_sessions:revoked};
}));
r.put('/team-access/v28/rules/:id',A.can('iam.manage_roles'),wrap(req=>{
 const old=db.col('iam_access_rules_v28').get(req.params.id);if(!old)fail('Rule not found',404);
 const config=validateRule(req,req.body,old);
 const prev=db.col('users').all().filter(u=>Policy.groupsFor(u)&&
  (old.subject_type==='all'||old.subject_type==='role'&&u.role===old.subject_id||
  old.subject_type==='person'&&String(u.id)===String(old.subject_id)||
  old.subject_type==='group'&&Policy.groupsFor(u).some(g=>String(g.id)===String(old.subject_id)))).map(u=>u.id);
 const row=db.col('iam_access_rules_v28').update(old.id,config);
 const touched=[...new Set([...prev,...db.col('users').all().filter(u=>
   config.subject_type==='all'||config.subject_type==='role'&&u.role===config.subject_id||
   config.subject_type==='person'&&String(u.id)===String(config.subject_id)||
   config.subject_type==='group'&&Policy.groupsFor(u).some(g=>String(g.id)===String(config.subject_id))).map(u=>u.id)])];
 const revoked=revoke(touched);changed(req,'rule-updated',row.id,{revoked_sessions:revoked});
 return {...row,revoked_sessions:revoked};
}));
r.delete('/team-access/v28/rules/:id',A.can('iam.manage_roles'),wrap(req=>{
 const g=db.col('iam_access_rules_v28').get(req.params.id);if(!g)fail('Rule not found',404);
 const affected=db.col('users').filter(u=>g.subject_type==='all'||g.subject_type==='role'&&u.role===g.subject_id||
   g.subject_type==='person'&&String(u.id)===String(g.subject_id)||
   g.subject_type==='group'&&Policy.groupsFor(u).some(group=>String(group.id)===String(g.subject_id))).map(u=>u.id);
 db.col('iam_access_rules_v28').remove(g.id);
 const revoked=revoke(affected);changed(req,'rule-deleted',g.id,{revoked_sessions:revoked});
 return {deleted:true,revoked_sessions:revoked};
}));
r.post('/team-access/v28/test',A.can('settings.view'),wrap(req=>{
 const phone=String(req.body?.phone||'').trim();
 if(!/^[0-9]{10}$/.test(phone))fail('Enter a 10-digit mobile number');
 const user=db.col('users').find(x=>x.phone===phone&&!x.deleted_at);
 if(!user||!visible(req,user))fail('Person not found in your allowed directory',404);
 const action=byKey.get(req.body?.action_key);
 if(!action)fail('Choose a permission to check');
 const raw=req.body?.situation||{};
 const context={};
 if(raw.route_id!==undefined&&raw.route_id!==''){
  const id=Number(raw.route_id);
  if(!Number.isInteger(id)||!db.col('routes').get(id))fail('Choose a valid route');
  context.route_id=id;
 }
 for(const [src,dst,max] of [['seat_count','seat_count',500],['block_duration_hours','block_duration_hours',8760],
  ['hours_before_departure','hours_before_departure',8760]]){
  if(raw[src]!==undefined&&raw[src]!==''){
   const n=Number(raw[src]);if(!Number.isFinite(n)||n<0||n>max)fail('Invalid '+src);
   context[dst]=n;
  }
 }
 if(raw.branch_id!==undefined&&raw.branch_id!==''){
  const id=Number(raw.branch_id);if(!Number.isInteger(id)||!db.col('branches').get(id))fail('Unknown branch');
  context.branch_id=id;
 }
 if(raw.owner_user_id!==undefined&&raw.owner_user_id!==''){
  const id=Number(raw.owner_user_id);if(!Number.isInteger(id)||!db.col('users').get(id))fail('Unknown owner');
  context.owner_user_id=id;
 }
 const decision=Policy.evaluate(user,action.key,context);
 const enforcedLabels=new Set([
  'Cancel tickets','Block seats','Unblock seats / book a blocked seat','View bookings','Edit passengers & points',
  'Shift seat / date','Book on behalf of agents','Add comments to a PNR','See passenger phone numbers',
  'Assign bus','Assign crew (driver, conductor, helper)','Edit expenses','Change fares',
  'Add vehicles','Edit vehicles & documents','Delete vehicles','Create routes','Delete routes',
  'View staff','Add / edit staff','Export / download'
 ]);
 return {person:{id:user.id,name:user.name,role:user.role,branch_id:user.branch_id||null},
  ...decision,runtime_enforced:enforcedLabels.has(action.label),
  note:enforcedLabels.has(action.label)?
   'Policy evaluator and some live API paths use this action; scenario-based tests do not execute a real transaction.':
   'This is a policy simulation, not proof that every GDS endpoint currently enforces this control.'};
}));
module.exports=r;
