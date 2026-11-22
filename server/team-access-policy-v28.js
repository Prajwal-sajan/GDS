'use strict';
// v28 access-rule semantics. Rules are deliberately restrictive overlays:
// they can deny or cap an existing role grant but never grant new API access.
const db=require('./db');
const A=require('./auth');
const {ALL_ROWS,byKey,byLabel,legacyFor}=require('./team-access-schema-v27');
const READ_ONLY=new Set([
 'View trip sheets & pickup charts','See bus location','View bookings',
 'View schedules & seat layouts','See who is booked on a schedule',
 'View income & expenses','View routes','View vehicles & fleet map',
 'View coaches / seat layouts','View trip chats','View call history',
 'Listen to recordings','Sales','Transactions & receivables','Reports',
 'Invoices & statements (view / pay)','Settlements (view)','Daily report',
 'View ratings','View staff','View users'
]);
const ACTIONS=new Set(ALL_ROWS.map(r=>r.key));
const RULE_TEMPLATES=[
 {id:'seat_blocks_3_24',name:'Limit seat blocks (3 seats, 24 h)',effect:'limit',action_key:byLabel.get('Block seats').key,
  condition:{kind:'always'},limits:{max_seats:3,max_hours:24}},
 {id:'cancel_before_2h',name:'No cancelling within 2 h of departure',effect:'deny',action_key:byLabel.get('Cancel tickets').key,
  condition:{kind:'departure_within_hours',hours:2},limits:{}},
 {id:'corridor_blocks',name:"Seat blocks only on routes with the person's corridor tag",effect:'deny',
  action_key:byLabel.get('Block seats').key,condition:{kind:'corridor_mismatch'},limits:{}},
 {id:'read_only',name:'Read-only (view everything, change nothing)',effect:'deny',
  action_key:'*',condition:{kind:'write_action'},limits:{}}
];
function groupsFor(user){
 if(!user)return [];
 return db.col('iam_groups').filter(g=>(g.user_ids||[]).some(id=>String(id)===String(user.id)));
}
function applies(rule,user,groupIds){
 if(!rule||rule.enabled===false)return false;
 const st=rule.subject_type;
 if(st==='all')return true;
 if(st==='role')return rule.subject_id===user.role;
 if(st==='person')return String(rule.subject_id)===String(user.id);
 if(st==='group')return groupIds.some(x=>String(x)===String(rule.subject_id));
 return false;
}
function conditionMatch(rule,user,row,context){
 const c=rule.condition||{kind:'always'};
 if(c.kind==='always')return {match:true};
 if(c.kind==='write_action')return {match:!READ_ONLY.has(row.label)};
 if(c.kind==='departure_within_hours'){
  const hours=Number(context?.hours_before_departure);
  if(context?.hours_before_departure===undefined||context?.hours_before_departure===null||!Number.isFinite(hours))
   return {match:false,unknown:true,needs:'hours before departure'};
  return {match:hours<Number(c.hours)};
 }
 if(c.kind==='corridor_mismatch'){
  if(!context?.route_id)return {match:false,unknown:true,needs:'route'};
  const route=db.col('routes').get(context.route_id);
  if(!route)return {match:false,unknown:true,needs:'valid route'};
  const tags=Array.isArray(route.tags)?route.tags.map(x=>String(x).toLowerCase()):[];
  const own=Array.isArray(user.corridor_tags)?user.corridor_tags.map(x=>String(x).toLowerCase()):[];
  return {match:!tags.some(t=>own.includes(t))}; // Missing tags deny, never silently allow.
 }
 return {match:false,unknown:true,needs:'supported rule condition'};
}
function ruleEffect(user,row,context={}){
 const ids=groupsFor(user).map(g=>g.id);
 const applied=[],unknown=[],limits={},denied=[];
 for(const rule of db.col('iam_access_rules_v28').all()){
  if(!applies(rule,user,ids))continue;
  if(rule.action_key!=='*'&&rule.action_key!==row.key)continue;
  const match=conditionMatch(rule,user,row,context);
  if(match.unknown){unknown.push({id:rule.id,name:rule.name,needs:match.needs});continue;}
  if(!match.match)continue;
  applied.push({id:rule.id,name:rule.name,effect:rule.effect,subject:rule.subject_type});
  if(rule.effect==='deny')denied.push(rule.name);
  if(rule.effect==='limit'){
   for(const [key,val] of Object.entries(rule.limits||{})){
    if(!['max_seats','max_hours'].includes(key))continue;
    if(typeof val==='number'&&Number.isFinite(val)&&val>0)limits[key]=Math.min(limits[key]||Infinity,val);
   }
  }
 }
 if(limits.max_seats!==undefined&&context.seat_count!==undefined&&Number(context.seat_count)>limits.max_seats)
  denied.push('Seat limit '+limits.max_seats);
 if(limits.max_hours!==undefined&&context.block_duration_hours!==undefined&&Number(context.block_duration_hours)>limits.max_hours)
  denied.push('Duration limit '+limits.max_hours+' h');
 return {applied,unknown,limits,denied};
}
function scopeOf(user,row){
 const role=A.roles()[user.role]||{};
 if(role.matrix_v27&&Object.hasOwn(role.matrix_v27,row.key))return role.matrix_v27[row.key];
 const previous=legacyFor[row.label]||row.label;
 return role.scopes?.[row.label]||role.scopes?.[previous]||
  (role.ui_permissions&&Object.hasOwn(role.ui_permissions,row.label)?
   (role.ui_permissions[row.label]?(row.kind==='scope'?'Company':'On'):'Off'):
   ((role.permissions||[]).includes(row.code)?(row.kind==='scope'?'Company':'On'):'Off'));
}
function evaluate(user,actionKey,context={}){
 const row=byKey.get(actionKey)||byLabel.get(actionKey);
 if(!row)throw Error('Unknown permission');
 const role=A.roles()[user.role]||{};
 const selected=scopeOf(user,row);
 const groupNames=groupsFor(user).map(g=>g.name);
 const permissions=A.permsFor(user),isImpossible=row.roleImpossible.includes(user.role);
 const granted=permissions.includes(row.code)||(
    // A fine-grained action may use the parent endpoint's coarse requirement.
    (['bookings.comments','bookings.see_phone'].includes(row.code)&&permissions.includes('bookings.view_all')));
 const baseAllowed=!isImpossible&&selected!=='Off'&&granted;
 const reasons=[];
 if(isImpossible)reasons.push('Unavailable for this role');
 else if(selected==='Off')reasons.push('Disabled in role matrix');
 else if(!granted)reasons.push('Missing API permission: '+row.code);
 const rule=ruleEffect(user,row,context);
 if(rule.denied.length)reasons.push(...rule.denied.map(d=>'Blocked by rule: '+d));
 let decision=!baseAllowed||rule.denied.length?'deny':'allow';
 if(decision==='allow'&&['Own','Branch'].includes(selected)){
  const owner=user.id,branch=user.branch_id;
  if(selected==='Own'&&context.owner_user_id!=null&&String(context.owner_user_id)!==String(owner)){
   decision='deny';reasons.push('Resource not owned by this user');
  }else if(selected==='Branch'&&context.branch_id!=null&&String(context.branch_id)!==String(branch)){
   decision='deny';reasons.push('Resource outside assigned branch');
  }else if(selected==='Own'&&context.owner_user_id==null||
   selected==='Branch'&&context.branch_id==null){
   decision='conditional';reasons.push('Resource ownership or branch context required');
  }
 }
 if(decision==='allow'&&rule.unknown.length){
  decision='conditional';reasons.push('Rule needs '+rule.unknown.map(x=>x.needs).join(', '));
 }
 if(decision==='allow')reasons.push('Permitted by role with no matching restrictive rule');
 return {decision,action_key:row.key,action:row.label,role:user.role,role_name:role.name||user.role,
  selected,base_grant:baseAllowed,groups:groupNames,applied_rules:rule.applied,
  pending_rules:rule.unknown,limits:rule.limits,reasons};
}
function enforce(req,label,context={},options={}){
 const user=db.col('users').get(req.user?.id);
 if(!user)return null;
 const row=byLabel.get(label)||byKey.get(label);
 if(!row)return null;
 const match=ruleEffect(user,row,context);
 const D=require('./domain');
 if(match.denied.length)throw D.httpErr(403,'Access rule blocked action: '+match.denied.join('; '));
 if(options.requireContext&&match.unknown.length)
  throw D.httpErr(403,'Access rule needs '+match.unknown.map(x=>x.needs).join(', '));
 return match;
}
module.exports={RULE_TEMPLATES,ACTIONS,READ_ONLY,groupsFor,ruleEffect,evaluate,enforce};
