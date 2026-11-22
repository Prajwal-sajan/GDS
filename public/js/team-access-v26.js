(function bootstrapTeamAccessV26(){
'use strict';
if(!window.G?.screens?.settings)return;
const original=G.screens.settings;
const icon=k=>{
 const custom={
  plus:'<path d="M12 5v14M5 12h14"/>',
  play:'<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/>',
  chevronRight:'<path d="m9 5 7 7-7 7"/>'
 };
 if(custom[k])return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+custom[k]+'</svg>';
 return G.settingsParityIcon?G.settingsParityIcon(k):G.svg(k);
};
const safe=x=>esc(String(x??''));
const api='/team-access/v26';
const tabs=[['office-staff','Office staff','users'],['bus-staff','Bus staff','bus'],['agents','Agents','agent'],['branches','Branches','building'],['access','Access','key']];
const languages=['English','Hindi','Kannada','Tamil','Telugu','Malayalam','Marathi','Bengali','Gujarati','Punjabi','Odia','Assamese','Urdu'];
const link=(t,extra='')=>`#/settings/team-access/${t}${extra?'/'+extra:''}`;
let view={root:null,tab:'office-staff',access:'roles',data:null,role:'viewer'};
let matrixMode='matrix',matrixFocus='viewer';
const editable=()=>view.data?.grants?.manage_users;
const attrs=(key,value)=>`data-${key}="${safe(value)}"`;
const fmtTime=x=>{if(!x)return '—';const d=new Date(x);return Number.isNaN(+d)?'—':d.toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});};
const roleName=k=>view.data?.roles?.find(r=>r.key===k)?.name||k?.replaceAll('_',' ')||'Staff';
const hue=k=>view.data?.role_hues?.[k]||'#6366f1';
const initials=x=>(String(x||'?').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w.charAt(0)).join('')||'?').toUpperCase();
const options=(arr,val)=>arr.map(([v,label])=>`<option value="${safe(v)}" ${String(v)===String(val)?'selected':''}>${safe(label)}</option>`).join('');
const field=(name,label,val='',config={})=>`<label class="ta26-field ${config.className||''}"><span>${safe(label)}${config.required?'<i> *</i>':''}</span><input name="${safe(name)}" type="${config.type||'text'}" value="${safe(val)}" placeholder="${safe(config.placeholder||'')}" ${config.required?'required':''} ${config.readonly?'readonly':''} ${config.maxlength?`maxlength="${config.maxlength}"`:''} ${config.pattern?`pattern="${config.pattern}"`:''}></label>`;
const selection=(name,label,values,selected,config={})=>`<label class="ta26-field ta26-select ${config.className||''}"><span>${safe(label)}${config.required?'<i> *</i>':''}</span><select data-nice aria-label="${safe(label)}" name="${safe(name)}">${options(values,selected)}</select></label>`;
const opt=(name,value)=>`<input type="hidden" name="${safe(name)}" value="${safe(value)}" />`;
function initDropdowns(root){root.querySelectorAll('select[data-nice]').forEach(s=>G.niceSelect?.(s));}
function vals(form){return Object.fromEntries([...new FormData(form).entries()]);}
function toast(x){G.toast(x,'ok');}
function showModal({title,header='',body='',action='Save',onSave=null,wide=false,afterOpen=null}){
 const shade=document.createElement('div');shade.className='ta26-shade';
 shade.style.zIndex=String(400+[...document.querySelectorAll('.ta26-shade')].length*10);
 shade.innerHTML=`<section class="ta26-dialog ${wide?'wide':''}" role="dialog" aria-modal="true" aria-label="${safe(title)}">
  <header class="ta26-dialog-head">${header||`<span class="ta26-head-icon">${icon('edit')}</span><h2>${safe(title)}</h2>`}<button type="button" class="ta26-x" data-close aria-label="Close dialog">${icon('close')}</button></header>
  <form class="ta26-dialog-form"><div class="ta26-dialog-scroll">${body}</div><footer class="ta26-dialog-foot">
   <button type="button" class="ta26-cancel" data-close>${onSave?'Cancel':'Close'}</button>
   ${onSave?`<button type="submit" class="ta26-primary" data-submit>${icon('check')} ${safe(action)}</button>`:''}
  </footer></form></section>`;
 let keyHandler;
 const close=()=>{shade.remove();document.removeEventListener('keydown',keyHandler);};
 keyHandler=e=>{if(e.key==='Escape'&&[...document.querySelectorAll('.ta26-shade')].at(-1)===shade){e.preventDefault();close();}};
 shade.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);
 shade.addEventListener('click',e=>{if(e.target===shade)close();});
 shade.querySelector('form').addEventListener('submit',async e=>{
  e.preventDefault();if(!onSave)return;
  const f=e.currentTarget;if(!f.reportValidity())return;
  const submit=f.querySelector('[data-submit]');submit.disabled=true;
  try{const ok=await onSave(vals(f),shade,close);if(ok!==false)close();}
  catch(ex){G.err(ex);}finally{submit.disabled=false;}
 });
 document.body.append(shade);initDropdowns(shade);
 if(afterOpen)afterOpen(shade,close);
 shade.querySelector('input:not([type=hidden]),select,textarea')?.focus({preventScroll:true});
 return {shade,close};
}
async function refresh(){return render(view.root,view.tab,view.access,view.role);}
function categories(data){
 const office=data.users.filter(u=>!['agent','driver','helper','conductor','pickup_manager'].includes(u.role));
 const bus=data.users.filter(u=>['driver','helper','conductor','pickup_manager'].includes(u.role));
 const staffExtra=(data.staff||[]).filter(s=>!bus.some(u=>String(u.phone).replace(/\D/g,'').slice(-10)===String(s.phone).replace(/\D/g,'').slice(-10))).map(s=>({...s,staff_only:true}));
 const agents=data.users.filter(u=>u.role==='agent');
 return {'office-staff':office,'bus-staff':[...bus,...staffExtra],agents};
}
function pageHeading(t){
 const key=t==='office-staff'?'Add User':t==='bus-staff'?'Add User':t==='agents'?'Add agent':'Add User';
 return `<div class="ta26-page-heading"><div class="ta26-page-title"><span class="ta26-page-icon">${icon('bus')}</span><strong>Team & access</strong><button type="button" class="ta26-how" data-how>${icon('play')} How to</button></div><button class="ta26-primary" type="button" data-global-add ${editable()?'':'disabled'}>${icon('users')} ${key}</button></div>`;
}
function navTabs(t,lists){
 return `<section class="ta26-nav">${tabs.map(([key,label,ico])=>`<a href="${link(key)}" class="ta26-tab ${key===t?'active':''}"><span class="ta26-tab-icon">${icon(ico)}</span>${label}${lists[key]&&key!=='access'&&key!=='branches'?`<em>${lists[key].length}</em>`:''}</a>`).join('')}
  ${['office-staff','bus-staff','agents'].includes(t)?`<label class="ta26-search">${icon('search')}<input type="search" data-search placeholder="Search by name or phone..." aria-label="Search by name or phone" /></label>`:''}</section>`;
}
function userRows(data,kind){
 const agent=kind==='agents';
 const rows=data[kind]||[];
 if(!rows.length)return `<div class="ta26-empty"><span>${icon('users')}</span><h3>No ${safe(kind.replace('-',' '))} yet</h3><p>Use Add User to add your team.</p></div>`;
 const titles=agent?['NAME','PHONE','TYPE','MODE','ACTIVE','LAST LOGIN','ACTIONS']:['NAME','PHONE','ROLE','ACTIVE','LAST LOGIN','ACTIONS'];
 return `<div class="ta26-tablewrap"><table class="ta26-table ${agent?'agent':''}"><thead><tr>${titles.map((s,i)=>`<th><span class="ta26-th">${icon(['users','phone','shield','globe','activity','clock','more'][agent?i:i>=3?i+1:i])} ${s}</span></th>`).join('')}</tr></thead><tbody>
  ${rows.map(u=>{
  const active=u.status==='ACTIVE'||String(u.status).toLowerCase()==='active';
  const color=kind==='agents'?'#00aa95':kind==='bus-staff'?'#ff7600':hue(u.role);
  return `<tr data-row-name="${safe((u.name||'')+' '+(u.phone||''))}"><td><div class="ta26-identity"><span class="ta26-avatar" style="--avatar:${color}">${safe(initials(u.name))}</span><div><strong class="${!active?'inactive':''}">${safe(u.name)}</strong>${agent?`<button type="button" class="ta26-agent-link" data-agent-settings="${u.id}">${icon('settings')} Agent settings</button>`:u.staff_only?'<small>Staff record · no operator login</small>':''}</div></div></td>
   <td><span class="ta26-phone">${icon('phone')} ${safe(u.phone?'+91 '+String(u.phone).replace(/\D/g,'').slice(-10).replace(/(\d{5})(\d{5})/,'$1 $2'):'—')}</span></td>
   <td><span class="ta26-role-chip" style="--role:${color}">${safe(agent?(u.agent_category==='master_agent'?'Master agent':'Agent'):roleName(u.role))}</span></td>
   ${agent?`<td><span class="ta26-mode">${safe(u.mode||'Online')}</span></td>`:''}
   <td><button type="button" data-toggle="${u.id}" class="ta26-switch ${active?'on':''}" role="switch" aria-checked="${active}" aria-label="Toggle ${safe(u.name)} status" ${(editable()&&!u.staff_only)?'':'disabled'}></button></td>
   <td class="ta26-last">${icon('clock')} ${safe(fmtTime(u.last_login))}${u.login_count?' · '+Number(u.login_count):''}</td>
   <td><div class="ta26-actions"><button type="button" data-view="${u.id}" aria-label="View ${safe(u.name)}">${icon('eye')}</button><button type="button" data-edit="${u.id}" aria-label="Edit ${safe(u.name)}" ${editable()?'':'disabled'}>${icon('edit')}</button><button type="button" class="danger" data-delete="${u.id}" aria-label="Delete ${safe(u.name)}" ${(!editable()||u.staff_only)?'disabled':''}>${icon('trash')}</button></div></td></tr>`;
 }).join('')}</tbody></table></div>`;
}
function preview(role,data){
 const r=data.roles.find(x=>x.key===role),p=r?.permissions||[],cap=p.slice(0,5).map(x=>`<small>${safe(x.replaceAll('.',' '))}</small>`).join('');
 return `<div class="ta26-role-preview"><div>${safe(data.role_descriptions[role]||roleName(role))}</div><div class="ta26-capabilities">${cap}${p.length>5?`<span>+${p.length-5} more</span>`:''}</div></div>`;
}
function choiceCards(name,items,value){
 return `<section class="ta26-choice"><h4>${name==='agent_category'?'Type':'Mode'}</h4>${opt(name,value)}
 <div class="ta26-choice-row">${items.map(([k,title,subtitle])=>`<button type="button" data-choice="${name}" data-value="${k}" class="${value===k?'selected':''}"><strong>${title}</strong><small>${subtitle}</small></button>`).join('')}</div>
 ${name==='mode'?`<p class="ta26-help"><b>Online</b> by default — they have a login. The mode determines which default commission applies; set rates in Accounts → Agent Settings.</p>`:''}</section>`;
}
function bindChoices(root){
 root.querySelectorAll('[data-choice]').forEach(btn=>btn.onclick=()=>{
  const name=btn.dataset.choice;root.querySelector(`[name="${name}"]`).value=btn.dataset.value;
  root.querySelectorAll(`[data-choice="${name}"]`).forEach(x=>x.classList.toggle('selected',x===btn));
  if(name==='operations_area')showOperations(root);
 });
}
function showOperations(root){
 const area=root.querySelector('[name=operations_area]')?.value||'sales_only';
 root.querySelectorAll('[data-op-fields]').forEach(el=>{
  el.hidden=!['both',el.dataset.opFields].includes(area);
 });
}
function routeModal(u,callback){
 const selectedRoutes=new Set((u.route_ids||[]).map(Number));
 const extra=new Set(u.extra_permissions||[]),denied=new Set(u.denied_permissions||[]);
 const routeList=(view.data.routes||[]).map(x=>`<label class="ta26-check"><input type="checkbox" data-route="${x.id}" ${selectedRoutes.has(Number(x.id))?'checked':''}> ${safe(x.name)}</label>`).join('');
 const allCodes=Object.values(view.data.catalog||{}).flat(),baseRole=(view.data.roles.find(x=>x.key===u.role)||{}).permissions||[];
 const permRows=allCodes.map(code=>`<div class="ta26-permission-row"><span>${safe(code)}</span>
  <label><input type="checkbox" data-extra="${safe(code)}" ${extra.has(code)?'checked':''}> Allow</label>
  <label><input type="checkbox" data-denied="${safe(code)}" ${denied.has(code)?'checked':''}> Deny</label></div>`).join('');
 showModal({title:u.name||'Permissions & routes',header:`<div><h2>${safe(u.name||'New user')}</h2><p>Permissions & routes</p></div>`,
  action:'Save',wide:true,
  body:`<div class="ta26-subtitle">ROUTES</div><div class="ta26-option-row"><b>Limit to chosen routes</b>
  <div class="ta26-toggle-pair">${opt('limit_routes',u.limit_routes?'yes':'no')}<button type="button" data-limit="no" class="${!u.limit_routes?'selected':''}">No</button><button type="button" data-limit="yes" class="${u.limit_routes?'selected':''}">Yes</button></div></div>
  <p class="ta26-help">Same routes as their branch (or every route) unless limited here.</p>
  <div data-limited ${u.limit_routes?'':'hidden'}><div class="ta26-route-checks">${routeList||'<p>No routes available. Create routes before applying a restriction.</p>'}</div></div>
  <details class="ta26-advanced-perms"><summary>Individual permission overrides</summary><p>Only use when this person needs a specific exception to the role. Deny takes precedence over Allow.</p><div class="ta26-perm-list">${permRows}</div></details>
  <p class="ta26-signout">They will be signed out to apply this. Route restrictions need enforcement at every applicable domain endpoint before production use.</p>`,
  onSave:async(_f,outer)=>{
   const on=outer.querySelector('[name=limit_routes]').value==='yes';
   const route_ids=[...outer.querySelectorAll('[data-route]:checked')].map(x=>Number(x.dataset.route));
   if(on&&!route_ids.length)throw new Error('Select at least one route to limit access');
   const extra_permissions=[...outer.querySelectorAll('[data-extra]:checked')].map(x=>x.dataset.extra);
   const denied_permissions=[...outer.querySelectorAll('[data-denied]:checked')].map(x=>x.dataset.denied);
   const overlapping=extra_permissions.find(x=>denied_permissions.includes(x));if(overlapping)throw new Error('Cannot allow and deny '+overlapping);
   callback({limit_routes:on,route_ids:on?route_ids:[],extra_permissions,denied_permissions});
  },afterOpen:outer=>{
   outer.querySelectorAll('[data-limit]').forEach(btn=>btn.onclick=()=>{
    outer.querySelector('[name=limit_routes]').value=btn.dataset.limit;
    outer.querySelectorAll('[data-limit]').forEach(x=>x.classList.toggle('selected',x===btn));
    outer.querySelector('[data-limited]').hidden=btn.dataset.limit!=='yes';
   });
   // Keep existing role inheritance; individual grants only ever constrained by the API.
   outer.querySelectorAll('[data-extra],[data-denied]').forEach(x=>x.onchange=()=>{
    if(x.checked){const field=x.hasAttribute('data-extra')?'data-denied':'data-extra';
     outer.querySelectorAll('['+field+']').forEach(y=>{if((y.dataset.extra||y.dataset.denied)===(x.dataset.extra||x.dataset.denied))y.checked=false;});}
   });
  }});
}
function userEditor(user,kind,callback){
 const existing=!!user&&!user.staff_only;
 const u={...user};u.role||=(kind==='agents'?'agent':kind==='bus-staff'?'driver':'manager');
 u.name||='';u.phone||='';u.language||='English';u.agent_category||='agent';u.mode||='Online';u.status||='ACTIVE';
 u.branch_id??='';u.limit_routes??=false;u.route_ids??=[];u.extra_permissions??=[];u.denied_permissions??=[];
 let pending={limit_routes:u.limit_routes,route_ids:u.route_ids,extra_permissions:u.extra_permissions,denied_permissions:u.denied_permissions};
 const roles=view.data.roles.filter(x=>x.key!=='owner'||(view.data.grants.manage_users&&view.data.users.some(u=>u.role==='owner')));
 const choiceRole=kind==='agents'?roles.filter(x=>x.key==='agent'):
   kind==='bus-staff'?roles.filter(x=>['driver','helper','conductor','pickup_manager'].includes(x.key)):roles.filter(x=>!['driver','helper','conductor','agent'].includes(x.key));
 const roleSelected=choiceRole.some(x=>x.key===u.role)?u.role:choiceRole[0]?.key||u.role;
 const agent=kind==='agents';
 const form=`
 <p class="ta26-intro">${existing?'':'Drivers, managers and owners added here also appear under Staff (matched by phone), where bank and pay details can be completed.'}</p>
 ${field('phone','Phone Number',String(u.phone).replace(/\D/g,'').slice(-10),{required:true,placeholder:'e.g., 9876543210',readonly:existing,pattern:'[6-9][0-9]{9}'})}
 ${field('name','Name',u.name,{placeholder:'Display name'})}
 ${field('email','Email',u.email||'',{type:'email',placeholder:'Optional'})}
 ${selection('language','Language',languages.map(x=>[x,x]),u.language)}
 <div class="ta26-divider"></div>
 ${selection('role','Role',choiceRole.map(x=>[x.key,x.name]),roleSelected,{required:true})}
 <div data-role-preview>${preview(roleSelected,view.data)}</div>
 ${agent?`${choiceCards('agent_category',[['agent','Agent','Books on their own'],['master_agent','Master agent','Has sub-agents who book under them']],u.agent_category)}
 ${choiceCards('mode',[['Online','Online','Logs in and books themselves'],['Offline','Offline','Calls the branch; staff book On-Behalf']],u.mode)}
 ${selection('agent_type','Settlement terms',[['postpaid','Postpaid'],['prepaid','Prepaid']],u.agent_type||'postpaid')}
 ${selection('master_agent_id','Under master agent',[['','No master agent'],...view.data.users.filter(a=>a.role==='agent'&&a.agent_category==='master_agent'&&a.id!==u.id).map(a=>[String(a.id),a.name])],String(u.master_agent_id||''))}`:''}
 ${selection('branch_id','Branch',[['','Organization-wide'],...view.data.branches.map(b=>[String(b.id),b.name])],String(u.branch_id||''))}
 <button type="button" class="ta26-perm-card" data-perm-open><span><b>Permissions & routes</b><small data-route-summary>${u.limit_routes?u.route_ids.length+' selected routes':'Same as their role'}</small></span>${icon('chevronRight')}</button>
 <div class="ta26-active"><div><b>Active</b><small>${agent&&u.mode==='Offline'?'Offline agents cannot sign in':'User can sign in'}</small></div>${opt('status',u.status)}<button type="button" class="ta26-switch ${u.status==='ACTIVE'?'on':''}" data-status role="switch" aria-label="Active" aria-checked="${u.status==='ACTIVE'}"></button></div>`;
 showModal({title:existing?'Edit User':kind==='bus-staff'?'Add bus staff':agent?'Add agent':'Add office staff',action:existing?'Save':kind==='bus-staff'?'Add bus staff':agent?'Add agent':'Add office staff',body:form,
  onSave:async(form,outer)=>{
   const role=outer.querySelector('[name=role]').value;
   const payload={...form,category:kind,...pending,role,master_agent_id:form.master_agent_id||null,
    name:form.name.trim()||form.phone,phone:form.phone.replace(/\D/g,''),branch_id:form.branch_id||null,
    limit_routes:pending.limit_routes,route_ids:pending.route_ids};
   if(existing)await G.put(api+'/users/'+u.id,payload);
   else await G.post(api+'/users',payload);
   toast(existing?'User updated; existing sessions signed out':'User added');
   await callback();
  },afterOpen:outer=>{
    outer.querySelector('[name=role]').addEventListener('change',e=>{
      outer.querySelector('[data-role-preview]').innerHTML=preview(e.target.value,view.data);
    });
    bindChoices(outer);
    const syncMode=()=>{
     const offline=agent&&outer.querySelector('[name=mode]')?.value==='Offline';
     const toggle=outer.querySelector('[data-status]'),status=outer.querySelector('[name=status]');
     if(offline){status.value='INACTIVE';toggle.classList.remove('on');toggle.setAttribute('aria-checked','false');}
     toggle.disabled=!!offline;
     const caption=outer.querySelector('.ta26-active small');
     if(caption)caption.textContent=offline?'Sign-in disabled for offline agents':'User can sign in';
    };
    outer.querySelectorAll('[data-choice=mode]').forEach(btn=>btn.addEventListener('click',syncMode));
    syncMode();
    outer.querySelector('[data-status]').onclick=e=>{
     const current=outer.querySelector('[name=status]');current.value=current.value==='ACTIVE'?'INACTIVE':'ACTIVE';
     e.currentTarget.classList.toggle('on',current.value==='ACTIVE');
     e.currentTarget.setAttribute('aria-checked',String(current.value==='ACTIVE'));
    };
    outer.querySelector('[data-perm-open]').onclick=()=>{
     routeModal({...u,...pending,role:outer.querySelector('[name=role]').value},next=>{
      pending=next;outer.querySelector('[data-route-summary]').textContent=next.limit_routes?next.route_ids.length+' selected routes':'Same as their role';
     });
    };
  }});
}
function viewUser(u,kind){
 const color=kind==='agents'?'#00ac91':kind==='bus-staff'?'#ff7900':hue(u.role);
 const info=[
  ['phone','PHONE',u.phone?'+91 '+String(u.phone).replace(/\D/g,'').slice(-10):'—'],
  ['activity','STATUS',u.status==='ACTIVE'?'● Active':'○ Inactive'],
  ['mail','EMAIL',u.email||'—'],['globe','LANGUAGE',u.language||'English'],
  ['clock','LAST LOGIN',fmtTime(u.last_login)],['calendar','ADDED',fmtTime(u.created_at)],
  ['shield','PERMISSIONS',u.limit_routes?`${u.route_ids?.length||0} selected routes`:'Inherited from role']];
 const markup=`<div class="ta26-view-hero"><span class="ta26-avatar large" style="--avatar:${color}">${safe(initials(u.name))}</span><div><strong>${safe(u.name)}</strong><span class="ta26-role-chip" style="--role:${color}">${safe(roleName(u.role))}</span></div></div>
  <div class="ta26-info-list">${info.map(([ico,label,value])=>`<div><span class="ta26-info-icon">${icon(ico)}</span><div><small>${safe(label)}</small><strong class="${label==='STATUS'&&u.status==='ACTIVE'?'good':''}">${safe(value)}</strong></div></div>`).join('')}</div>`;
 const dialog=showModal({title:'View User',header:`<div class="ta26-header-user"><span class="ta26-avatar" style="--avatar:${color}">${safe(initials(u.name))}</span><div><h2>${safe(u.name)}</h2><span class="ta26-role-chip" style="--role:${color}">${safe(roleName(u.role))}</span></div></div>`,body:markup,
 action:u.staff_only?'Create login':'Edit',onSave:editable()?async(_,shade,close)=>{
  close();userEditor(u.staff_only?{...u,id:null}:u,kind,refresh);return false;
 }:null});
 const footer=dialog.shade.querySelector('.ta26-dialog-foot');
 const edit=footer?.querySelector('[data-submit]');
 if(edit)footer.prepend(edit);
 const close=footer?.querySelector('[data-close]');
 if(close)close.textContent='Close';
}
async function branchEditor(b){
 const existing=!!b;const current={...b};current.operations_area||='sales_only';
 const op=[['sales_only','Sales only'],['cities','Cities'],['routes','Routes'],['both','Both']];
 const optionsOp=op.map(([v,label])=>`<button type="button" data-choice="operations_area" data-value="${v}" class="${current.operations_area===v?'selected':''}">${label}</button>`).join('');
 showModal({title:existing?'Edit branch':'New branch',action:existing?'Save branch':'Create branch',wide:true,
 body:`<div class="ta26-grid ta26-code-row">${field('code','Code',current.code||'',{required:true,placeholder:'BLR',maxlength:16})}${field('name','Name',current.name||'',{required:true,placeholder:'Bengaluru office'})}</div>
 <div class="ta26-grid">${selection('city_id','City',[['','Optional'],...view.data.cities.map(c=>[String(c.id),c.name])],String(current.city_id||''))}${field('phone','Contact phone',current.phone||'',{placeholder:'Optional'})}</div>
 ${field('address','Address',current.address||'',{placeholder:'Optional'})}
 <div class="ta26-divider"></div><h4>People</h4><p class="ta26-help">A branch can have your own staff, Service Agents, or both. Add people in Manage Users and pick this branch. A Service Agent's routes are set on him (Edit user → Permissions & routes); the people who work under him are his team.</p>
 <div class="ta26-divider"></div><h4>Operations area</h4>${opt('operations_area',current.operations_area)}
 <div class="ta26-segments">${optionsOp}</div><p class="ta26-help">Sales always belong to the branch that sold them. The operations area decides which trips and tickets “Branch” permission covers: a city office runs trips stopping in its cities, a route team runs its routes. It never stops anyone from selling.</p>
 <div class="ta26-operations-fields" data-op-fields="cities"><h4>Operating cities</h4><div class="ta26-check-grid">${view.data.cities.map(c=>`<label class="ta26-check"><input type="checkbox" data-op-city="${c.id}" ${(current.operation_city_ids||[]).map(String).includes(String(c.id))?'checked':''}> ${safe(c.name)}</label>`).join('')||'<p>Add cities from Routes first.</p>'}</div></div>
 <div class="ta26-operations-fields" data-op-fields="routes"><h4>Operating routes</h4><div class="ta26-check-grid">${view.data.routes.map(r=>`<label class="ta26-check"><input type="checkbox" data-op-route="${r.id}" ${(current.operation_route_ids||[]).map(String).includes(String(r.id))?'checked':''}> ${safe(r.name)}</label>`).join('')||'<p>Add routes first.</p>'}</div></div>`,
 onSave:async(f,outer)=>{
  const payload={...f,code:f.code.toUpperCase(),city_id:f.city_id||null,
   operation_city_ids:[...outer.querySelectorAll('[data-op-city]:checked')].map(x=>Number(x.dataset.opCity)),
   operation_route_ids:[...outer.querySelectorAll('[data-op-route]:checked')].map(x=>Number(x.dataset.opRoute))};
  if(existing)await G.put(api+'/branches/'+b.id,payload);else await G.post(api+'/branches',payload);
  toast(existing?'Branch updated':'Branch created');await refresh();
 },afterOpen:outer=>{bindChoices(outer);showOperations(outer);}});
}
function branchScreen(data){
 const branches=data.branches;
 const heading=`<div class="ta26-branch-intro"><p>An office or team. Users pinned to a branch can sell any trip; their bookings are accounted under the branch, and branch admins see only their branch's bookings and people.</p><button class="ta26-primary" data-new-branch type="button" ${view.data.grants.manage_branches?'':'disabled'}>${icon('plus')} New branch</button></div>`;
 if(!branches.length)return heading+`<section class="ta26-empty branch"><span>${icon('building')}</span><h3>No branches yet</h3><p>Everyone in this organization currently has org-wide access. Create a branch to start pinning users to an office.</p></section>`;
 return heading+`<div class="ta26-branch-list">${branches.map(b=>`<article class="ta26-branch-card"><div class="ta26-branch-head"><span class="ta26-tab-icon">${icon('building')}</span><div><strong>${safe(b.name)}</strong><small>${safe(b.code||'—')} · ${safe(b.city||'Office')}</small></div></div><p>${safe(b.address||'No address added')}</p><div class="ta26-branch-meta"><span>People: ${data.users.filter(u=>String(u.branch_id)===String(b.id)).length}</span><span>Operations: ${safe((b.operations_area||'sales_only').replaceAll('_',' '))}</span></div><div class="ta26-actions"><button data-branch-view="${b.id}">${icon('eye')} View</button><button data-branch-edit="${b.id}" ${view.data.grants.manage_branches?'':'disabled'}>${icon('edit')} Edit</button><button class="danger" data-branch-delete="${b.id}" ${view.data.grants.manage_branches?'':'disabled'}>${icon('trash')} Delete</button></div></article>`).join('')}</div>`;
}
function viewBranch(b){
 const n=view.data.users.filter(u=>String(u.branch_id)===String(b.id)).length;
 showModal({title:b.name,body:`<div class="ta26-info-list">${[
 ['building','CODE',b.code||'—'],['users','PEOPLE',n+' team members'],
 ['globe','CITY',view.data.cities.find(x=>String(x.id)===String(b.city_id))?.name||b.city||'—'],
 ['phone','CONTACT',b.phone||'—'],['building','ADDRESS',b.address||'—'],
 ['shield','OPERATIONS AREA',(b.operations_area||'sales_only').replaceAll('_',' ')]
 ].map(([i,label,v])=>`<div><span class="ta26-info-icon">${icon(i)}</span><div><small>${label}</small><strong>${safe(v)}</strong></div></div>`).join('')}</div>`,
 action:'Edit branch',onSave:view.data.grants.manage_branches?async(_f,_outer,close)=>{close();branchEditor(b);return false;}:null});
}
function accessTabs(active){
 const items=[['roles','Roles'],['test-access','Test access'],['groups','Groups'],['advanced','Advanced']];
 return `<nav class="ta26-access-tabs">${items.map(([k,l])=>`<a href="${link('access',k+'/viewer')}" class="${active===k?'active':''}">${l}</a>`).join('')}</nav>`;
}
function roleValueV27(role,row){
 if(row.roleImpossible?.includes(role?.key))return '—';
 if(role?.matrix_v27 && Object.hasOwn(role.matrix_v27,row.key))return role.matrix_v27[row.key];
 const legacy={
  'Book tickets':'Book seats',
  'View schedules & seat layouts':'View services & seat layouts',
  'See who is booked on a schedule':'See who is booked on a service',
  'View income & expenses':"View a service's revenue",
  'Edit timings, coach & delay':'Edit services (timings, coach, bus & driver, delay)',
  'Switch schedules on / off':'Switch services on / off',
  'Create schedules / import trip sheets':'Create services / import trip sheets',
  'Delete schedules':'Delete services',
  'Edit general details (name, coach, settings, route map)':'Edit routes, fares, stops & route map'
 };
 const name=legacy[row.label]||row.label;
 const scoped=role?.scopes?.[row.label]??role?.scopes?.[name];
 if(scoped&&['Off','Own','Branch','Company'].includes(scoped))return scoped;
 const stored=role?.ui_permissions?.[row.label]??role?.ui_permissions?.[name];
 if(stored!==undefined)return stored?(row.kind==='scope'?'Company':'On'):'Off';
 return (role?.permissions||[]).includes(row.code)?(row.kind==='scope'?'Company':'On'):'Off';
}
function roleOptionsV27(row,value){
 const list=row.choices||(row.kind==='scope'?['Off','Own','Branch','Company']:['Off','On']);
 const choices=list.includes(value)?list:[value,...list]; // preserve any previously saved legacy reach
 return options(choices.map(x=>[x,list.includes(x)?x:x+' (legacy)']),value);
}
function limitInputV27(role,key,label,unit){
 const value=role?.limits?.[key],str=value===null||value===undefined?'':String(value);
 const max=view.data.matrix_limit_fields?.[key]?.max||8760;
 return `<label class="ta27-limit"><input type="number" inputmode="numeric" data-matrix-limit="${safe(key)}" data-role="${safe(role.key)}" data-original="${safe(str)}" min="${key==='block_max_seats'?1:0}" max="${max}" step="1" value="${safe(str)}" placeholder="no limit" aria-label="${safe(role.name)}: ${safe(label)}" ${view.data.grants.manage_roles?'':'disabled'}><span>${safe(unit)}</span></label>`;
}
function matrixCellV27(role,row){
 if(!role||row.roleImpossible?.includes(role.key))
  return '<span class="ta27-unavailable" title="Not possible for this role" aria-label="Not possible for this role">—</span>';
 const selected=roleValueV27(role,row);
 const disabled=!view.data.grants.manage_roles;
 let content=`<select aria-label="${safe(role.name)}: ${safe(row.label)}" data-matrix-cell data-role="${safe(role.key)}" data-key="${safe(row.key)}" data-label="${safe(row.label)}" data-original="${safe(selected)}" data-scope="${safe(selected)}" class="ta26-scope-select" ${disabled?'disabled':''}>${roleOptionsV27(row,selected)}</select>`;
 if(row.limit==='cancel_cutoff_hours')content+=`<div class="ta27-limit-row" data-limit-row ${selected==='Off'?'hidden':''}>${limitInputV27(role,'cancel_cutoff_hours','Cancellation cut-off','h')}</div>`;
 if(row.limit==='seat_block')content+=`<div class="ta27-limit-stack" data-limit-row ${selected==='Off'?'hidden':''}>${limitInputV27(role,'block_max_seats','Seat block maximum','seats')}${limitInputV27(role,'block_max_hours','Seat block duration','h')}</div>`;
 return content;
}
function matrixScreen(data){
 const columns=[...data.role_columns,...data.roles.filter(r=>!data.role_columns.some(([k])=>k===r.key)&&!['owner','admin'].includes(r.key)).map(r=>[r.key,r.name])];
 const roleMap=new Map(data.roles.map(r=>[r.key,r]));
 const single=matrixMode==='single',focus=roleMap.get(matrixFocus)||roleMap.get('viewer')||data.roles[0];
 const shown=single?[[focus.key,focus.name]]:columns;
 const actions=`<div class="ta26-matrix-toolbar ta27-actions">
  ${single?`<button type="button" data-all-roles>‹ All roles</button>`:`<button type="button" data-one-role>‹ Back to one role</button>`}
  <button type="button" data-new-role ${data.grants.manage_roles?'':'disabled'}>${icon('plus')} New role</button>
  ${single?`<label class="ta27-role-picker"><span>Role</span><select data-single-role data-nice>${options(data.roles.filter(r=>r.key!=='owner'&&r.key!=='admin').map(r=>[r.key,r.name]),focus.key)}</select></label>`:''}
  </div>`;
 const query=`<p class="ta26-help">For one person only, use Edit user → Permissions & routes.</p>
  <h3>What each role can do</h3>
  <p class="ta26-help">Pick a role, tap an area, and choose what they can reach and whether they can make changes. Then press Save.</p>
  ${actions}
  <div class="ta26-matrix-toolbar ta27-filter-bar"><input type="search" data-matrix-search aria-label="Search permissions" placeholder="Search, e.g. cancel, routes, payouts">
  <div class="ta26-legend"><span>Off</span><span>Own</span><span>Branch</span><span>Company / On</span><small>· — = not possible for that role</small></div></div>`;
 const headings=`<thead><tr><th class="what" scope="col">WHAT</th>${shown.map(([key,label])=>`<th scope="col" title="${safe(label)}">${safe(label)}</th>`).join('')}</tr></thead>`;
 const rows=data.matrix.map((section,sectionIndex)=>{
  const divider=`<tr class="ta26-matrix-section" data-matrix-group="${sectionIndex}"><td colspan="${shown.length+1}">${safe(section.title)}</td></tr>`;
  const elements=section.rows.map(row=>`<tr data-matrix-row="${safe(row.label.toLowerCase())}" data-matrix-section="${sectionIndex}"><th scope="row" class="what">${safe(row.label)}</th>
  ${shown.map(([roleKey])=>`<td class="ta27-matrix-cell" data-cell-role="${safe(roleKey)}">${matrixCellV27(roleMap.get(roleKey),row)}</td>`).join('')}</tr>`).join('');
  return divider+elements;
 }).join('');
 return query+`<div class="ta26-matrix-scroll ${single?'ta27-single':''}" tabindex="0" aria-label="Role permissions matrix"><table class="ta26-matrix">${headings}<tbody>${rows}</tbody></table></div>
 <div class="ta26-matrix-foot ta27-matrix-foot"><button class="ta26-primary" data-save-matrix type="button" ${data.grants.manage_roles?'disabled':''}>Save changes</button>
 <span>Limits: seat blocks (seats, hours) and cancel cut-off (hours before departure); empty = no limit.</span>
 <span class="ta27-dirty-count" data-dirty-count aria-live="polite"></span></div>
 <p class="ta27-scope-note">Own / Branch access is enforced on supported booking APIs. Some other operational APIs still require endpoint-specific scope enforcement before production delegation.</p>`;
}
function attachMatrixEventsV27(root){
 function updateDirty(){
  const dirty=[...root.querySelectorAll('[data-matrix-cell],[data-matrix-limit]')].filter(el=>el.value!==el.dataset.original);
  const save=root.querySelector('[data-save-matrix]');
  if(save)save.disabled=!dirty.length||!view.data.grants.manage_roles;
  const counter=root.querySelector('[data-dirty-count]');
  if(counter)counter.textContent=dirty.length?dirty.length+' unsaved change'+(dirty.length===1?'':'s'):'';
 }
 root.querySelector('[data-matrix-search]')?.addEventListener('input',e=>{
  const q=e.target.value.toLowerCase().trim();
  const counts={};
  root.querySelectorAll('[data-matrix-row]').forEach(tr=>{
    const group=view.data.matrix[Number(tr.dataset.matrixSection)]?.title.toLowerCase()||'';
    tr.hidden=!!q&&!tr.dataset.matrixRow.includes(q)&&!group.includes(q);
    if(!tr.hidden)counts[tr.dataset.matrixSection]=(counts[tr.dataset.matrixSection]||0)+1;
  });
  root.querySelectorAll('[data-matrix-group]').forEach(tr=>tr.hidden=!counts[tr.dataset.matrixGroup]);
 });
 root.querySelectorAll('[data-matrix-cell]').forEach(sel=>sel.addEventListener('change',()=>{
  sel.dataset.scope=sel.value;
  const cell=sel.closest('td');
  cell.querySelectorAll('[data-limit-row]').forEach(el=>el.hidden=sel.value==='Off');
  updateDirty();
 }));
 root.querySelectorAll('[data-matrix-limit]').forEach(inp=>inp.addEventListener('input',updateDirty));
 root.querySelector('[data-save-matrix]')?.addEventListener('click',async e=>{
  const changed=[...root.querySelectorAll('[data-matrix-cell],[data-matrix-limit]')].filter(el=>el.value!==el.dataset.original);
  if(!changed.length)return;
  const roles=new Map();
  for(const el of changed){
   const role=el.dataset.role;
   if(!roles.has(role))roles.set(role,{key:role,matrix:{},limits:{}});
   const obj=roles.get(role);
   if(el.hasAttribute('data-matrix-cell'))obj.matrix[el.dataset.key]=el.value;
   else{
    if(el.value.trim()!==''&&(!/^\d+$/.test(el.value)||Number(el.value)>Number(el.max)||Number(el.value)<Number(el.min))){
     G.err(new Error('Enter a whole number in the permitted range for '+el.getAttribute('aria-label')));el.focus();return;
    }
    obj.limits[el.dataset.matrixLimit]=el.value===''?null:Number(el.value);
   }
  }
  const button=e.currentTarget;button.disabled=true;
  try{
   const out=await G.put(api+'/roles/batch',{roles:[...roles.values()],base_revision:view.data.matrix_revision});
   toast('Saved permissions for '+out.roles.length+' role(s). '+out.revoked_sessions+' session(s) signed out.');
   await refresh();
  }catch(ex){G.err(ex);button.disabled=false;}
 });
 root.querySelector('[data-new-role]')?.addEventListener('click',()=>{
  if(G.teamAccessV28?.newRole)
   return G.teamAccessV28.newRole(root,view.data,async created=>{
    matrixFocus=created.key;matrixMode='single';view.role=created.key;await refresh();
   });
  // Legacy v27 test harness and deployments without the v28 script.
  return showModal({
   title:'New role',
   body:field('name','Role name','',{required:true,placeholder:'e.g. City Operations Supervisor',maxlength:70}),
   action:'Create role',onSave:async f=>{
    const created=await G.post(api+'/roles',{name:f.name});
    matrixFocus=created.key;matrixMode='single';toast('Role created');await refresh();
   }
  });
 });
 root.querySelector('[data-one-role]')?.addEventListener('click',()=>{
  matrixMode='single';matrixFocus=matrixFocus||view.role||'viewer';refresh().catch(G.err);
 });
 root.querySelector('[data-all-roles]')?.addEventListener('click',()=>{
  matrixMode='matrix';refresh().catch(G.err);
 });
 root.querySelector('[data-single-role]')?.addEventListener('change',e=>{
  matrixFocus=e.target.value;view.role=matrixFocus;refresh().catch(G.err);
 });
 updateDirty();
}
async function groupsScreen(){
 const rows=await G.get('/iam/groups');
 return `<p class="ta26-help">Group office users into teams for administration and membership review. Group membership is not itself an authorization grant.</p>
 <button class="ta26-primary" data-new-group ${view.data.grants.manage_roles?'':'disabled'}>${icon('plus')} New group</button>
 <div class="ta26-group-list">${rows.length?rows.map(g=>`<article data-group="${g.id}"><div><strong>${safe(g.name)}</strong><p>${safe(g.description||'No description')} · ${(g.user_ids||[]).length} users</p></div><div class="ta26-actions"><button data-edit-group="${g.id}">${icon('edit')} Edit</button><button class="danger" data-delete-group="${g.id}">${icon('trash')}</button></div></article>`).join(''):'<p>No groups yet</p>'}</div>`;
}
function groupEditor(row){
 const members=new Set(row?.user_ids||[]);
 showModal({title:row?'Edit group':'New group',action:row?'Save group':'Create group',body:`
 ${field('name','Group name',row?.name||'',{required:true})}${field('description','Description',row?.description||'')}
 <h4>Members</h4><div class="ta26-check-grid">${view.data.users.map(u=>`<label class="ta26-check"><input type="checkbox" data-member="${u.id}" ${members.has(u.id)?'checked':''}>${safe(u.name)} (${safe(roleName(u.role))})</label>`).join('')}</div>`,
 onSave:async(f,outer)=>{
  const body={...f,user_ids:[...outer.querySelectorAll('[data-member]:checked')].map(x=>Number(x.dataset.member))};
  if(row)await G.put('/iam/groups/'+row.id,body);else await G.post('/iam/groups',body);
  toast('Group saved');await refresh();
 }});
}
function testScreen(){
 return `<p class="ta26-help">Test the effective API permissions of an actual user. Results are read from the backend and include their role, assigned branch and route restrictions.</p>
 <div class="ta26-test-form">${selection('user_id','User',view.data.users.map(u=>[String(u.id),u.name+' · '+roleName(u.role)]),String(view.data.users[0]?.id||''))}
 ${field('feature','Search permission','',{placeholder:'e.g., trips.view'})}
 <button class="ta26-primary" type="button" data-test-access>Test access</button></div><div data-test-output class="ta26-test-output"></div>`;
}
function advancedScreen(){
 return `<p class="ta26-help">Role limits and authorization notes. Cancellation cut-off and seat-block limits are editable inline on the Roles matrix and enforced by the booking APIs.</p>
 ${selection('role_key','Role',view.data.roles.filter(r=>r.key!=='owner').map(r=>[r.key,r.name]),view.role)}
 <div class="ta26-grid">${['max_blocked_seats','max_discount_percent','max_refund_percent','max_advance'].map(k=>field(k,k.replaceAll('_',' '),'0',{type:'number'})).join('')}</div>
 <div class="ta26-matrix-toolbar"><button class="ta26-primary" data-save-limits ${view.data.grants.manage_roles?'':'disabled'}>Save limits</button><button data-export-role class="ta26-cancel">Export role JSON</button></div>`;
}
async function accessScreen(tab,data){
 const content=tab==='roles'?matrixScreen(data):tab==='test-access'?testScreen():tab==='groups'?await groupsScreen():advancedScreen();
 return accessTabs(tab)+`<div class="ta26-access-content">${content}</div>`;
}
function attachAccessEvents(root,tab){
 if(tab==='roles'){attachMatrixEventsV27(root);}
 if(tab==='test-access'){
 root.querySelector('[data-test-access]')?.addEventListener('click',async()=>{
  const id=root.querySelector('[name=user_id]')?.value;
  const search=root.querySelector('[name=feature]')?.value.toLowerCase()||'';
  try{const result=await G.get(api+'/evaluate/'+encodeURIComponent(id));
   const codes=(result.user.permissions||[]).filter(x=>x.toLowerCase().includes(search));
   root.querySelector('[data-test-output]').innerHTML=`<h4>${safe(result.user.name)} · ${safe(result.role?.name||result.user.role)}</h4>
   <p>Branch: ${safe(result.branches?.[0]?.name||'Organization-wide')} · Routes: ${result.user.limit_routes?(result.routes||[]).length+' selected':'No restriction'}</p>
   <p>${codes.length} matching permissions</p><div class="ta26-perm-tags">${codes.map(c=>`<span>${safe(c)}</span>`).join('')}</div>
   <p class="ta26-help">${safe(result.scope_enforcement)}</p>`;
  }catch(e){G.err(e);}
 });
 }
 if(tab==='groups'){
 (async()=>{const groups=await G.get('/iam/groups');
 root.querySelector('[data-new-group]')?.addEventListener('click',()=>groupEditor(null));
 root.querySelectorAll('[data-edit-group]').forEach(b=>b.onclick=()=>groupEditor(groups.find(x=>String(x.id)===b.dataset.editGroup)));
 root.querySelectorAll('[data-delete-group]').forEach(b=>b.onclick=async()=>{
  if(!await G.confirm('Delete this group?',{danger:true,ok:'Delete'}))return;
  try{await G.del('/iam/groups/'+b.dataset.deleteGroup);toast('Group deleted');await refresh();}catch(e){G.err(e);}
 });
 })().catch(G.err);
 }
 if(tab==='advanced'){
 const setRole=()=>{const key=root.querySelector('[name=role_key]')?.value;const role=view.data.roles.find(r=>r.key===key)||{};
  for(const input of root.querySelectorAll('input[name]'))if(input.name.startsWith('max_'))input.value=role.limits?.[input.name]??0;
 };
 root.querySelector('[name=role_key]')?.addEventListener('change',setRole);setRole();
 root.querySelector('[data-save-limits]')?.addEventListener('click',async()=>{
  const key=root.querySelector('[name=role_key]').value,role=view.data.roles.find(x=>x.key===key);
  const limits=Object.fromEntries([...root.querySelectorAll('input[name^="max_"]')].map(e=>[e.name,Number(e.value)]));
  try{await G.put('/iam/roles/'+encodeURIComponent(key),{name:role.name,permissions:role.permissions||[],
   scopes:role.scopes||{},ui_permissions:role.ui_permissions||{},limits});toast('Role limits saved');await refresh();}catch(e){G.err(e);}
 });
 root.querySelector('[data-export-role]')?.addEventListener('click',()=>{
  const key=root.querySelector('[name=role_key]').value,r=view.data.roles.find(x=>x.key===key);
  const blob=new Blob([JSON.stringify(r,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=key+'-role.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),200);
 });
 }
 initDropdowns(root);
}
async function render(el,tab='office-staff',access='roles',role='viewer'){
 view={root:el,tab,access,role,data:null};el.className='stp-root ta26-root';
 el.innerHTML='<div class="ta26-loading">Loading Team & access…</div>';
 const data=await G.get(api);view.data=data;
 const lists=categories(data);
 let content='';
 if(tab==='branches')content=branchScreen(data);
 else if(tab==='access')content=await accessScreen(access,data);
 else content=userRows(lists,tab);
 el.innerHTML=`<div class="ta26-shell">${pageHeading(tab)}${navTabs(tab,lists)}<section class="ta26-main">${content}</section></div>`;
 const currentRows=lists[tab]||[];
 el.querySelector('[data-search]')?.addEventListener('input',e=>{
  const q=e.target.value.trim().toLowerCase();
  el.querySelectorAll('[data-row-name]').forEach(tr=>tr.hidden=!tr.dataset.rowName.toLowerCase().includes(q));
 });
 el.querySelector('[data-how]')?.addEventListener('click',()=>showModal({title:'How to use Team & access',
  body:`<p>Office staff, bus staff and agents share an authenticated user directory. Use View, Edit and the Active switch for account administration. Assign branches or routes under Edit User → Permissions & routes.</p><p>Access → Roles controls API role grants; Test access checks effective permissions. Changes revoke existing sign-in sessions.</p><p>Branches assign selling and operational teams. Operations area restrictions and Own/Branch record-level visibility must be enforced by all data endpoints before production.</p>`}));
 el.querySelector('[data-global-add]')?.addEventListener('click',()=>userEditor(null,tab==='agents'?'agents':tab==='bus-staff'?'bus-staff':'office-staff',refresh));
 el.querySelectorAll('[data-view],[data-edit],[data-delete],[data-toggle]').forEach(btn=>btn.onclick=async()=>{
  const id=btn.dataset.view||btn.dataset.edit||btn.dataset.delete||btn.dataset.toggle;
  const u=currentRows.find(x=>String(x.id)===String(id));if(!u)return;
  if(btn.dataset.view)viewUser(u,tab);
  else if(btn.dataset.edit)userEditor(u,tab,refresh);
  else if(btn.dataset.delete!==undefined){
   if(!await G.confirm(`Remove ${u.name} from active users? Their login will be revoked, and history retained.`,{danger:true,ok:'Remove user'}))return;
   try{await G.del(api+'/users/'+id);toast('User archived and sign-in revoked');await refresh();}catch(e){G.err(e);}
  }else if(btn.dataset.toggle!==undefined){
   const next=u.status==='ACTIVE'?'INACTIVE':'ACTIVE';
   if(next==='INACTIVE'&&!await G.confirm(`Deactivate ${u.name} and sign out their active sessions?`,{danger:true,ok:'Deactivate'}))return;
   try{await G.put(api+'/users/'+id,{status:next});toast('User status updated');await refresh();}catch(e){G.err(e);}
  }
 });
 el.querySelectorAll('[data-agent-settings]').forEach(btn=>btn.onclick=()=>{
  const u=currentRows.find(x=>String(x.id)===btn.dataset.agentSettings);
  showModal({title:'Agent settings · '+u.name,body:`${field('commission_pct','Commission (%)',u.commission_pct||0,{type:'number'})}${field('credit_limit','Credit limit (₹)',u.credit_limit||0,{type:'number'})}
  ${selection('agent_type','Settlement terms',[['postpaid','Postpaid'],['prepaid','Prepaid']],u.agent_type||'postpaid')}`,
   onSave:async f=>{await G.put(api+'/users/'+u.id,{...f,commission_pct:Number(f.commission_pct),credit_limit:Number(f.credit_limit)});toast('Agent settings saved');await refresh();}});
 });
 el.querySelector('[data-new-branch]')?.addEventListener('click',()=>branchEditor(null));
 el.querySelectorAll('[data-branch-view],[data-branch-edit],[data-branch-delete]').forEach(b=>b.onclick=async()=>{
  const id=b.dataset.branchView||b.dataset.branchEdit||b.dataset.branchDelete;
  const row=data.branches.find(x=>String(x.id)===id);if(!row)return;
  if(b.dataset.branchView)viewBranch(row);
  if(b.dataset.branchEdit)branchEditor(row);
  if(b.dataset.branchDelete){if(!await G.confirm(`Delete branch ${row.name}? Users must be moved out first.`,{danger:true,ok:'Delete branch'}))return;
   try{await G.del(api+'/branches/'+id);toast('Branch deleted');await refresh();}catch(e){G.err(e);}}
 });
 if(tab==='access')attachAccessEvents(el,access);
}
G.screens.settings=async function(el,p){
 if(p[0]==='team-access'){
  try{await render(el,p[1]||'office-staff',p[2]||'roles',p[3]||'viewer');}
  catch(e){el.innerHTML=`<div class="ta26-empty"><h3>Unable to load Team & access</h3><p>${safe(e.message)}</p><button type="button" data-team-retry>Retry</button></div>`;
   el.querySelector('[data-team-retry]')?.addEventListener('click',()=>G.screens.settings(el,p));G.err(e);}
  return;
 }
 return original(el,p);
};
G.teamAccessVersion='v26';
})();