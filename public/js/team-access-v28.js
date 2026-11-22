/* Team & access v28 — reference screenshots: simulator, groups and rule builder. */
(function(){
'use strict';
if(!window.G?.screens?.settings)return;
const old=G.screens.settings,base='/team-access/v28';
const h=x=>esc(String(x??''));
const arrow='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>';
const plus='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>';
const play='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m8 5 12 7-12 7z"/></svg>';
const opts=(items,value='')=>items.map(([v,label])=>'<option value="'+h(v)+'" '+(String(v)===String(value)?'selected':'')+'>'+h(label)+'</option>').join('');
const msg=(root,error)=>{const el=root.querySelector('[data-v28-message]');if(el){el.textContent=error?.message||String(error);el.hidden=false;}};
const notice=()=>'<p data-v28-message class="ta28-error" role="alert" hidden></p>';
const get=path=>G.get(base+path),post=(path,body)=>G.post(base+path,body),put=(path,body)=>G.put(base+path,body),del=path=>G.del(base+path);
const roleChoices=data=>data.roles.filter(x=>!['owner','admin'].includes(x.key)).map(x=>[x.key,x.name]);
const userChoices=data=>data.users.map(x=>[String(x.id),x.name+' · '+x.phone]);
function optgroups(matrix,placeholder){
 return '<option value="">'+h(placeholder)+'</option>'+matrix.map(section=>
  '<optgroup label="'+h(section.title)+'">'+section.rows.map(row=>
  '<option value="'+h(row.key)+'">'+h(row.label)+'</option>').join('')+'</optgroup>').join('');
}
function actionMenu(matrix,placeholder){
 return '<select data-v28-action required aria-label="Action to check">'+optgroups(matrix,placeholder)+'</select>';
}
function makeSituation(data){
 return '<div class="ta28-situation" data-v28-situation-fields hidden>'+
  '<label>Route <select name="route_id">'+opts([['','Any route'],...data.routes.map(x=>[x.id,x.name])])+'</select></label>'+
  '<label>Seats <input type="number" min="1" max="500" name="seat_count" placeholder="Number of seats"></label>'+
  '<label>Seat-block hours <input type="number" min="1" max="8760" name="block_duration_hours" placeholder="e.g. 24"></label>'+
  '<label>Hours before departure <input type="number" min="0" max="8760" step="0.1" name="hours_before_departure" placeholder="e.g. 2"></label>'+
  '<label>Branch <select name="branch_id">'+opts([['','Not specified'],...data.branches.map(b=>[b.id,b.name])])+'</select></label>'+
  '</div>';
}
function testPage(root,data){
 root.innerHTML='<div class="ta28-page ta28-test">'+
  '<p class="ta28-intro">Check what a person can or cannot do, and why.</p>'+
  '<div class="ta28-caption">CAN THIS PERSON...?</div>'+
  '<form class="ta28-panel" data-v28-test-form>'+
   '<label class="ta28-wide-row"><span>Person</span><input name="phone" aria-label="Person mobile" inputmode="numeric" autocomplete="off" maxlength="10" pattern="[0-9]{10}" placeholder="10-digit mobile" required></label>'+
   '<div class="ta28-action-wrap">'+actionMenu(data.matrix,'Add something to check...')+'</div>'+
   '<div class="ta28-situation-toggle"><button type="button" data-v28-situation>'+plus+' Situation (e.g. route, seats)</button></div>'+
   makeSituation(data)+
   '<footer class="ta28-panel-footer"><button class="ta28-blue-btn" data-v28-check type="submit" disabled>'+play+' Check</button></footer>'+
  '</form>'+
  '<p class="ta28-foot-help">Checks what would happen if this person tried these things now, and which role or rule decides.</p>'+
  notice()+'<section data-v28-result aria-live="polite"></section></div>';
 const f=root.querySelector('form'),button=root.querySelector('[data-v28-check]');
 function valid(){
  button.disabled=!/^[0-9]{10}$/.test(f.elements.phone.value)||!root.querySelector('[data-v28-action]').value;
 }
 f.addEventListener('input',valid);f.addEventListener('change',valid);
 root.querySelector('[data-v28-situation]').addEventListener('click',()=>{
  const x=root.querySelector('[data-v28-situation-fields]');x.hidden=!x.hidden;
  root.querySelector('[data-v28-situation]').setAttribute('aria-expanded',String(!x.hidden));
 });
 f.addEventListener('submit',async e=>{
  e.preventDefault();if(button.disabled)return;button.disabled=true;
  const situation={};
  f.querySelectorAll('[data-v28-situation-fields] [name]').forEach(x=>{if(x.value!=='')situation[x.name]=x.value;});
  const body={phone:f.elements.phone.value,action_key:root.querySelector('[data-v28-action]').value,situation};
  try{
   const res=await post('/test',body);
   const tone=res.decision==='allow'?'allow':res.decision==='deny'?'deny':'conditional';
   const list=(res.reasons||[]).map(x=>'<li>'+h(x)+'</li>').join('');
   const applied=(res.applied_rules||[]).length?
    '<div class="ta28-result-rules">Applied rules: '+(res.applied_rules||[]).map(x=>h(x.name)).join(' · ')+'</div>':'';
   const limits=Object.entries(res.limits||{}).map(([k,v])=>h(k)+': '+h(v)).join(' · ');
   root.querySelector('[data-v28-result]').innerHTML='<article class="ta28-result ta28-'+tone+'">'+
    '<div class="ta28-result-title"><strong>'+h(res.decision.toUpperCase())+'</strong><span>'+h(res.action)+' · '+h(res.person.name)+'</span></div>'+
    '<p>Role: '+h(res.role_name)+' · Matrix: '+h(res.selected)+' · Groups: '+h((res.groups||[]).join(', ')||'None')+'</p>'+
    '<ul>'+list+'</ul>'+applied+(limits?'<p>Limits: '+limits+'</p>':'')+
    '<p class="ta28-coverage">'+h(res.note)+'</p></article>';
  }catch(ex){msg(root,ex);}finally{valid();}
 });
}
function groupPage(root,data,groups){
 const header='<p class="ta28-intro">Put people together (e.g. "Night pickup team") and apply rules to the whole group.</p>';
 const create='<form class="ta28-group-create" data-v28-group-create><input name="name" required maxlength="90" placeholder="New group, e.g. Night-pickup-team" aria-label="New group name">'+
  '<button type="submit" class="ta28-blue-btn" disabled>'+plus+' Create</button></form>';
 const cards=groups.map(g=>'<article class="ta28-group-card" data-v28-group="'+h(g.id)+'">'+
  '<div><h3>'+h(g.name)+'</h3><p>'+h(g.user_ids?.length||0)+' members'+(g.description?' · '+h(g.description):'')+'</p></div>'+
  '<div class="ta28-card-actions"><button type="button" data-v28-edit-group="'+h(g.id)+'">Edit members</button>'+
  '<button class="ta28-danger" type="button" data-v28-delete-group="'+h(g.id)+'">Delete</button></div></article>').join('');
 root.innerHTML='<div class="ta28-page ta28-groups">'+header+create+notice()+'<div data-v28-group-list class="ta28-group-list">'+cards+'</div></div>';
 const f=root.querySelector('form'),input=f.elements.name,createButton=f.querySelector('button');
 input.addEventListener('input',()=>createButton.disabled=input.value.trim().length<2);
 f.addEventListener('submit',async e=>{
  e.preventDefault();if(createButton.disabled)return;createButton.disabled=true;
  try{await post('/groups',{name:input.value.trim()});G.toast('Group created','ok');await refreshAccess(root,'groups');}
  catch(ex){msg(root,ex);createButton.disabled=false;}
 });
 root.querySelectorAll('[data-v28-edit-group]').forEach(b=>b.addEventListener('click',()=>{
  const row=groups.find(g=>String(g.id)===b.dataset.v28EditGroup);if(!row)return;
  const card=b.closest('.ta28-group-card'),was=card.querySelector('[data-v28-group-editor]');
  if(was){was.remove();return;}
  const form=document.createElement('form');form.className='ta28-group-editor';form.dataset.v28GroupEditor='1';
  form.innerHTML='<label>Group name<input name="name" required maxlength="90" value="'+h(row.name)+'"></label>'+
   '<label>Description<input name="description" maxlength="250" value="'+h(row.description||'')+'"></label>'+
   '<div class="ta28-caption">MEMBERS</div><div class="ta28-member-grid">'+data.users.map(u=>
    '<label><input type="checkbox" value="'+h(u.id)+'" '+((row.user_ids||[]).some(id=>String(id)===String(u.id))?'checked':'')+'>'+h(u.name)+' <small>'+h(u.phone)+'</small></label>').join('')+'</div>'+
   '<div class="ta28-card-actions"><button type="button" data-v28-group-cancel>Cancel</button>'+
   '<button class="ta28-blue-btn" type="submit">Save group</button></div>';
  card.append(form);form.querySelector('[data-v28-group-cancel]').onclick=()=>form.remove();
  form.addEventListener('submit',async e=>{
   e.preventDefault();if(!form.reportValidity())return;
   try{await put('/groups/'+row.id,{name:form.elements.name.value,description:form.elements.description.value,
     user_ids:[...form.querySelectorAll('input[type=checkbox]:checked')].map(x=>Number(x.value))});
    G.toast('Group updated','ok');await refreshAccess(root,'groups');}
   catch(ex){msg(root,ex);}
  });
 }));
 root.querySelectorAll('[data-v28-delete-group]').forEach(b=>b.onclick=async()=>{
  if(!await G.confirm('Delete this group? Rules targeting this group must be removed first.',{danger:true,ok:'Delete'}))return;
  try{await del('/groups/'+b.dataset.v28DeleteGroup);G.toast('Group deleted','ok');await refreshAccess(root,'groups');}
  catch(ex){msg(root,ex);}
 });
}
function advancedPage(root,data,ruleData,groups){
 const presets=ruleData.templates;
 const quick=presets.map(t=>'<button type="button" data-v28-preset="'+h(t.id)+'">'+h(t.name)+'</button>').join('');
 const rules=ruleData.rules;
 const list=rules.length?rules.map(r=>'<article class="ta28-rule" data-v28-rule="'+h(r.id)+'"><div>'+
  '<h3>'+h(r.name)+'</h3><p>'+h(r.effect==='deny'?'Block':'Limit')+' · '+
   h(r.action_key==='*'?'All modifications':data.matrix.flatMap(g=>g.rows).find(x=>x.key===r.action_key)?.label||r.action_key)+
   ' · '+h(r.subject_type==='all'?'Everyone':r.subject_type+' '+(r.subject_id||''))+
   (r.enabled===false?' · Disabled':'')+'</p></div>'+
  '<div class="ta28-card-actions"><button type="button" data-v28-edit-rule="'+h(r.id)+'">Edit</button>'+
  '<button type="button" data-v28-toggle-rule="'+h(r.id)+'">'+(r.enabled===false?'Enable':'Disable')+'</button>'+
  '<button class="ta28-danger" type="button" data-v28-delete-rule="'+h(r.id)+'">Delete</button></div></article>').join(''):
  '<div class="ta28-rules-empty">No rules yet. Everyone works by their role until you add one.</div>';
 root.innerHTML='<div class="ta28-page ta28-advanced">'+
  '<p class="ta28-intro">For unusual cases the grid can’t express: write your own rules. Most companies never need this — limits live in the Roles grid.</p>'+
  '<p class="ta28-description">A role says what people can do. A rule adds an exception or a limit on top — for a role, a group or one person. If a rule blocks something, it stays blocked whatever else allows it.</p>'+
  '<div class="ta28-preset-bar"><button data-v28-new-rule class="ta28-blue-btn">'+plus+' New rule</button>'+quick+'</div>'+
  '<div data-v28-editor-slot></div><div class="ta28-caption">YOUR RULES</div>'+notice()+
  '<div class="ta28-rule-list">'+list+'</div></div>';
 function editor(preset={},existing=null){
  const slot=root.querySelector('[data-v28-editor-slot]'),origin=existing||preset;
  const rows=data.matrix.flatMap(x=>x.rows);
  const type=origin.subject_type||'role',target=origin.subject_id||'';
  const chosen=origin.action_key||'';
  const kind=origin.condition?.kind||'always';
  slot.innerHTML='<form class="ta28-rule-editor" data-v28-rule-form>'+
   '<h3>'+h(existing?'Edit rule':'New rule')+'</h3>'+
   '<div class="ta28-editor-grid">'+
   '<label>Rule name<input name="name" maxlength="120" required placeholder="e.g. Night team seat limit" value="'+h(origin.name||'')+'"></label>'+
   '<label>Apply to<select name="subject_type">'+opts([['role','Role'],['group','Group'],['person','One person'],['all','Everyone']],type)+'</select></label>'+
   '<label data-v28-target-wrap>Who<select name="subject_id"></select></label>'+
   '<label>What can they do?<select name="action_key" required>'+opts([['','Choose an action'],['*','All changes (read-only)'],...rows.map(r=>[r.key,r.label])],chosen)+'</select></label>'+
   '<label>Rule<select name="effect">'+opts([['deny','Block'],['limit','Limit']],origin.effect||'deny')+'</select></label>'+
   '<label>When<select name="condition_kind">'+opts([['always','Always'],['departure_within_hours','Within hours of departure'],['corridor_mismatch','Route does not match person’s corridor tag'],['write_action','When changing data']],kind)+'</select></label>'+
   '<label data-v28-condition-hours>Hours before departure<input name="hours" type="number" min="0" max="8760" step="1" value="'+h(origin.condition?.hours??2)+'"></label>'+
   '<label data-v28-limit-seats>Maximum seats<input name="max_seats" type="number" min="1" max="500" value="'+h(origin.limits?.max_seats??3)+'"></label>'+
   '<label data-v28-limit-hours>Maximum hours<input name="max_hours" type="number" min="1" max="8760" value="'+h(origin.limits?.max_hours??24)+'"></label>'+
   '</div><p class="ta28-help">Rules restrict existing permissions; they never give someone access their role does not already allow.</p>'+
   '<div class="ta28-card-actions"><button type="button" data-v28-cancel-rule>Cancel</button>'+
   '<button type="submit" class="ta28-blue-btn">'+h(existing?'Save changes':'Create')+'</button></div></form>';
  const form=slot.querySelector('form');
  function targets(){
   const st=form.elements.subject_type.value;
   const values=st==='role'?roleChoices(data):st==='group'?groups.map(g=>[String(g.id),g.name]):
    st==='person'?userChoices(data):[];
   const select=form.elements.subject_id;
   select.innerHTML=opts([['','Choose '+(st==='person'?'a person':st)],...values],select.value||target);
   form.querySelector('[data-v28-target-wrap]').hidden=st==='all';
  }
  function fields(){
   const condition=form.elements.condition_kind.value,effect=form.elements.effect.value;
   form.querySelector('[data-v28-condition-hours]').hidden=condition!=='departure_within_hours';
   form.querySelector('[data-v28-limit-seats]').hidden=effect!=='limit';
   form.querySelector('[data-v28-limit-hours]').hidden=effect!=='limit';
  }
  form.elements.subject_type.addEventListener('change',()=>{form.elements.subject_id.value='';targets();});
  form.elements.effect.addEventListener('change',fields);
  form.elements.condition_kind.addEventListener('change',fields);
  targets();fields();
  form.querySelector('[data-v28-cancel-rule]').onclick=()=>slot.replaceChildren();
  form.addEventListener('submit',async e=>{
   e.preventDefault();const f=form.elements;
   if(!f.name.value.trim()||!f.action_key.value||f.subject_type.value!=='all'&&!f.subject_id.value)return;
   const effect=f.effect.value,conditionKind=f.condition_kind.value;
   const limits=effect==='limit'?{
    max_seats:Number(f.max_seats.value),max_hours:Number(f.max_hours.value)}:{};
   const payload={name:f.name.value.trim(),subject_type:f.subject_type.value,
    subject_id:f.subject_type.value==='all'?null:f.subject_id.value,
    action_key:f.action_key.value,effect,condition:{
     kind:conditionKind,...(conditionKind==='departure_within_hours'?{hours:Number(f.hours.value)}:{})
    },limits,enabled:existing?.enabled!==false,template_id:origin.id||origin.template_id||''};
   try{
    if(existing)await put('/rules/'+existing.id,payload);else await post('/rules',payload);
    G.toast('Access rule saved','ok');await refreshAccess(root,'advanced');
   }catch(ex){msg(root,ex);}
  });
  form.elements.name.focus({preventScroll:true});
 }
 root.querySelector('[data-v28-new-rule]').onclick=()=>editor({});
 root.querySelectorAll('[data-v28-preset]').forEach(b=>b.onclick=()=>{
  const selected=presets.find(x=>x.id===b.dataset.v28Preset);editor(selected||{});
 });
 root.querySelectorAll('[data-v28-edit-rule]').forEach(b=>b.onclick=()=>{
  const selected=rules.find(x=>String(x.id)===b.dataset.v28EditRule);if(selected)editor(selected,selected);
 });
 root.querySelectorAll('[data-v28-toggle-rule]').forEach(b=>b.onclick=async()=>{
  const selected=rules.find(x=>String(x.id)===b.dataset.v28ToggleRule);
  try{await put('/rules/'+selected.id,{...selected,enabled:selected.enabled===false});
   G.toast('Rule updated','ok');await refreshAccess(root,'advanced');
  }catch(ex){msg(root,ex);}
 });
 root.querySelectorAll('[data-v28-delete-rule]').forEach(b=>b.onclick=async()=>{
  if(!await G.confirm('Delete this access rule?',{danger:true,ok:'Delete'}))return;
  try{await del('/rules/'+b.dataset.v28DeleteRule);G.toast('Rule deleted','ok');await refreshAccess(root,'advanced');}
  catch(ex){msg(root,ex);}
 });
}
async function refreshAccess(root,tab){
 const content=root.classList.contains('ta26-access-content')?root:root.querySelector('.ta26-access-content');
 if(!content)return;
 const data=await G.get('/team-access/v26');
 if(tab==='test-access')testPage(content,data);
 else if(tab==='groups'){
  const result=await get('/groups');groupPage(content,data,result.groups||[]);
 }else if(tab==='advanced'){
  const [rules,groups]=await Promise.all([get('/rules'),get('/groups')]);advancedPage(content,data,rules,groups.groups||[]);
 }
}
function newRole(root,data,afterCreate){
 const content=root.querySelector('.ta26-access-content')||root;
 if(content.querySelector('[data-v28-new-role]'))return;
 const toolbar=content.querySelector('.ta27-actions');if(!toolbar)return;
 const holder=document.createElement('section');holder.dataset.v28NewRole='1';holder.className='ta28-newrole';
 holder.innerHTML='<div class="ta28-caption">NEW ROLE</div>'+
  '<form class="ta28-newrole-box"><label class="ta28-newrole-field"><span>Name</span><input name="name" required maxlength="70" placeholder="e.g. City Supervisor"></label>'+
  '<label class="ta28-newrole-field"><span>Starts from</span><select name="starts_from" required aria-label="Starts from">'+
  opts([['','Choose a role'],...roleChoices(data)])+'</select></label>'+
  '<footer><button type="button" data-v28-new-cancel>Cancel</button><button type="submit" class="ta28-blue-btn" disabled>Create</button></footer></form>'+
  '<p class="ta28-foot-help">People you give this role are treated as the role it starts from everywhere, with the permissions you choose here.</p>'+notice();
 toolbar.after(holder);
 const hidden=[...content.querySelectorAll('.ta27-filter-bar,.ta26-matrix-scroll,.ta27-matrix-foot,.ta27-scope-note')];
 hidden.forEach(x=>x.hidden=true);
 const form=holder.querySelector('form'),name=form.elements.name,select=form.elements.starts_from,save=form.querySelector('[type=submit]');
 const validate=()=>save.disabled=name.value.trim().length<3||!select.value;
 name.addEventListener('input',validate);select.addEventListener('change',validate);
 holder.querySelector('[data-v28-new-cancel]').onclick=()=>{hidden.forEach(x=>x.hidden=false);holder.remove();};
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(save.disabled)return;save.disabled=true;
  try{
   const created=await G.post('/team-access/v26/roles',{name:name.value.trim(),starts_from:select.value});
   G.toast('Role created','ok');holder.remove();hidden.forEach(x=>x.hidden=false);
   if(afterCreate)await afterCreate(created);
  }catch(ex){msg(holder,ex);validate();}
 });
}
G.teamAccessV28={newRole,refreshAccess};
G.screens.settings=async function(el,p){
 const result=await old(el,p);
 if(p?.[0]==='team-access'&&p[1]==='access'&&['test-access','groups','advanced'].includes(p[2]||'roles')){
  try{await refreshAccess(el,p[2]);}
  catch(e){const c=el.querySelector('.ta26-access-content');if(c)c.innerHTML='<p class="ta28-error" role="alert">'+h(e.message||'Unable to load access')+'</p>';}
 }
 return result;
};
G.teamAccessVersion='v28';
})();
