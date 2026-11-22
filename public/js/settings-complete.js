/* Settings screenshot fidelity + working screens. Separate UI metadata is never treated as server-side authorization. */
(function(){
'use strict';
const icon=(k)=>G.settingsParityIcon?G.settingsParityIcon(k):G.svg(k);
const R=G.settingsParityRefs||{};
const escV=(v)=>esc(v??'');
const allowed=(p)=>typeof can==='function'&&can(p);
const teamURL=(tab,other='')=>`#/settings/team-access/${tab}${other?'/'+other:''}`;
const rolesURL=(section='roles',role='viewer')=>teamURL('access',`${section}/${role}`);
const ROLE_ORDER=[['viewer','Viewer'],['driver','Bus crew (Driver, Conductor, Helper)'],['agent','Agent'],['service_associate','Service Associate'],['booking_executive','Booking Executive'],['pickup_manager','Pickup Manager'],['service_agent','Service Agent'],['accountant','Accountant'],['branch_admin','Branch Admin'],['manager','Manager'],['admin','Admin']];
const PERM_MAP={
 'View trip sheets & pickup charts':'trips.view',
 'Mark boarded / no-show, passenger notes':'trips.update_passengers',
 'See bus location':'trips.location',
 'Call passengers and crew':'trips.call',
 'Book seats':'bookings.create',
 'View bookings':'bookings.view_all',
 'Edit passengers & points':'bookings.modify',
 'Cancel tickets':'bookings.cancel',
 'Shift seat / date':'bookings.modify',
 'Send passenger messages (delay, pre-boarding, resend ticket)':'trips.chat',
 'Block seats':'bookings.block_seats',
 'Unblock seats / book a blocked seat':'bookings.release_hold',
 'View services & seat layouts':'schedules.view',
 'See who is booked on a service':'schedules.view',
 "View a service's revenue":'schedules.financial',
 'Edit services (timings, coach, bus & driver, delay)':'schedules.modify',
 'Edit fares':'schedules.fares',
 'Switch services on / off':'schedules.toggle',
 'Create services / import trip sheets':'schedules.modify',
 'Delete services':'schedules.delete',
 'View routes':'routes.view',
 'Create routes':'routes.create',
 'Edit routes, fares, stops & route map':'routes.modify',
 'Delete / retime routes':'routes.delete',
 'View vehicles & fleet map':'fleet.view',
 'Add vehicles':'fleet.modify',
 'Edit vehicles & documents':'fleet.modify',
 'Delete vehicles':'fleet.delete',
 'Share a bus location link':'fleet.view',
 'View coaches / seat layouts':'fleet.view',
 'Create & edit coaches':'fleet.modify',
 'Delete coaches':'fleet.delete',
 'View trip chats':'chats.view',
 'Reply / send photos':'chats.send',
 'Change chat status / mark read':'chats.send',
 'Delete chats, block or report passengers':'chats.send',
 'Share / revoke chat links':'chats.send',
 'Make calls':'calls.make',
 'View call history':'calls.view',
 'Listen to recordings':'calls.view',
 'Manage speed dials':'settings.modify',
 'Sales':'accounts.view',
 'Transactions & receivables':'accounts.view',
 'Add / delete ledger entries':'accounts.ledger',
 'Reports':'accounts.reports',
 'Export / download':'accounts.export',
 'Invoices & statements (view / pay)':'accounts.view',
 'Settlements (view)':'accounts.view',
 'Upload & match settlements':'accounts.reconciliation',
 'Agent settings (terms, credit, commission)':'iam.manage_users',
 'Send payment links / collect':'accounts.ledger',
 'Daily report':'dailyops.view',
 'View ratings':'dailyops.view',
 'Follow up on ratings (status, comments)':'dailyops.ratings_reply',
 'Import ratings':'dailyops.ratings_reply',
 'View staff':'staff.view',
 'Add / edit staff':'staff.modify',
 'Attendance (view, correct, approve)':'staff.modify',
 'Advances & reimbursements':'staff.payroll',
 'Payouts (generate, approve, mark paid)':'staff.payroll',
 'Coupons':'offers.manage_coupons',
 'Branch offers at the counter':'offers.manage_coupons',
 'Loyalty program settings':'offers.loyalty',
 'Seat-upgrade settings':'offers.loyalty',
 'View users':'settings.view',
 'Add users (roles below their own)':'iam.manage_users',
 'Edit users (name, branch, status, routes)':'iam.manage_users',
 "Change a user's role":'iam.manage_users',
 'Remove users':'iam.manage_users',
 'Change what roles can do':'iam.manage_roles',
 'Configuration & notifications':'settings.modify',
 'Branding':'settings.modify',
 'Branches':'settings.modify',
 'WhatsApp setup':'settings.modify',
 'Use Sarathi (AI assistant)':'sarathi.ask'
};
const DATES=(d)=>d?new Date(d).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'—';
const PERMS=R.ACCESS_SECTIONS||[];
const BRAND=(R.BRAND_DEFAULTS||{});
const BRAND_FIELDS={appName:'app_name',tagline:'tagline',helpline:'helpline_number',supportEmail:'support_email',brandColor:'brand_hex',fontFamily:'font_family',scheme:'color_scheme',pwaName:'pwa_name',pwaShortName:'pwa_short_name'};
const ASSET_CODES=['mobile_logo','desktop_logo','dark_logo','favicon','signin_background'];
const TEAM_TABS=[['office-staff','Office staff','users'],['bus-staff','Bus staff','bus'],['agents','Agents','agent'],['branches','Branches','building'],['access','Access','key']];
const MENU=R.SETTINGS_MENU||[];
let snapshot={};

function drawTitle(text,action='',actionCode='',symbol='bus'){
 return `<header class="stp-page-title"><div class="stp-page-title-main"><div class="stp-hero-icon">${icon(symbol)}</div><h1>${escV(text)}</h1></div>${action?`<button class="stp-btn primary" type="button" data-page-action="${escV(actionCode)}">${icon('users')} ${escV(action)}</button>`:''}</header>`;
}
function card(heading,body,ico='settings',extra=''){
 return `<section class="stp-brand-card ${extra}"><header class="stp-card-head"><div class="stp-hero-icon" style="width:54px;height:54px">${icon(ico)}</div><h3>${escV(heading)}</h3></header>${body}</section>`;
}
function input(name,title,value='',opts={}){
 const kind=opts.type||'text';
 if(kind==='select')return `<label class="stp-field-wrap"><span class="stp-label">${escV(title)}</span><select class="stp-input" name="${escV(name)}">${(opts.values||[]).map(([v,t])=>`<option value="${escV(v)}" ${String(v)===String(value)?'selected':''}>${escV(t)}</option>`).join('')}</select></label>`;
 if(kind==='textarea')return `<label class="stp-field-wrap"><span class="stp-label">${escV(title)}</span><textarea class="stp-input" name="${escV(name)}" rows="3">${escV(value)}</textarea></label>`;
 if(kind==='checkbox')return `<label class="stp-check-label"><input type="checkbox" name="${escV(name)}" ${value?'checked':''}>${escV(title)}</label>`;
 return `<label class="stp-field-wrap"><span class="stp-label">${escV(title)}</span><input class="stp-input" name="${escV(name)}" type="${escV(kind)}" value="${escV(value)}" ${opts.required?'required':''} ${opts.placeholder?`placeholder="${escV(opts.placeholder)}"`:''} ${opts.min!=null?`min="${opts.min}"`:''} ${opts.max!=null?`max="${opts.max}"`:''}></label>`;
}
const values=(root)=>{const form=root.querySelector('form')||root;const out={};form.querySelectorAll('[name]').forEach(node=>{out[node.name]=node.type==='checkbox'?node.checked:node.type==='number'&&node.value!==''?Number(node.value):node.value;});return out;};
function modal({title,body,subtitle='',onSave,save='Save',danger=false,wide=false,closeLabel='Close'}){
 const overlay=document.createElement('div');overlay.className='stp-modal-backdrop';
 overlay.innerHTML=`<div class="stp-modal ${wide?'stp-modal-wide':''}" role="dialog" aria-modal="true" aria-label="${escV(title)}"><div class="stp-modal-head"><div><h3 style="margin:0;font-size:23px">${escV(title)}</h3>${subtitle?`<p class="stp-muted" style="margin:8px 0 0">${escV(subtitle)}</p>`:''}</div><button class="stp-modal-close" type="button" data-close-modal aria-label="Close">${icon('close')}</button></div><div class="stp-modal-body stp-work-modal-body"><form>${body}</form></div><footer class="stp-modal-foot">${onSave?`<button type="button" data-modal-save class="stp-btn ${danger?'stp-danger':'primary'}">${escV(save)}</button>`:''}<button type="button" class="stp-btn" data-close-modal>${closeLabel}</button></footer></div>`;
 const close=()=>{overlay.remove();document.removeEventListener('keydown',escKey);};
 const escKey=(e)=>{if(e.key==='Escape')close();};document.addEventListener('keydown',escKey);
 overlay.addEventListener('click',e=>{if(e.target===overlay||e.target.closest('[data-close-modal]'))close();});
 const commit=overlay.querySelector('[data-modal-save]');
 if(commit)commit.onclick=async()=>{const form=overlay.querySelector('form');if(!form.reportValidity())return;commit.disabled=true;try{const ok=await onSave(values(overlay),overlay);if(ok!==false)close();}catch(e){G.err(e);}finally{commit.disabled=false;}};
 document.body.append(overlay);overlay.querySelector('input,select,textarea')?.focus();
 return {el:overlay,close,form:overlay.querySelector('form')};
}
function note(text){return `<p class="stp-note-text">${escV(text)}</p>`;}
function tabbar(items,active){return `<nav class="stp-access-tabs">${items.map(([key,label,href])=>`<a class="stp-chip-nav ${key===active?'active':''}" href="${href}">${escV(label)}</a>`).join('')}</nav>`;}
function emptyPanel(label,text,ico='building'){
 return `<div class="stp-empty-panel"><div class="stp-big-ico">${icon(ico)}</div><h3>${escV(label)}</h3><p>${escV(text)}</p></div>`;
}
function inlineNote(count){return `<div class="stp-inline-note"><div>${count?`<b>${count}</b> branches — users may be assigned to a branch.`:'<b>Branches</b> — none yet; everyone is org-wide. Create one to group users and account bookings by office.'}</div><button class="stp-btn slim" type="button" data-create-branch>＋ New branch</button></div>`;}
function actionButtons(id,kind='user',canEdit=true){return `<div class="stp-actions"><button class="stp-icon-btn" type="button" title="View" data-row-view="${escV(id)}" data-kind="${kind}">${icon('eye')}</button><button class="stp-icon-btn" type="button" title="Edit" data-row-edit="${escV(id)}" data-kind="${kind}" ${canEdit?'':'disabled'}>${icon('edit')}</button><button class="stp-icon-btn delete" type="button" title="Delete" data-row-delete="${escV(id)}" data-kind="${kind}" ${canEdit?'':'disabled'}>${icon('trash')}</button></div>`;}
function roleOptions(roles,current){return (roles||[]).map(r=>`<option value="${escV(r.key)}" ${r.key===current?'selected':''}>${escV(r.name)}</option>`).join('');}
function tableHead(agent=false){let defs=agent?[['users','Name'],['phone','Phone'],['shield','Type'],['globe','Mode'],['activity','Active'],['clock','Last login'],['more','Actions']]:[['users','Name'],['phone','Phone'],['shield','Role'],['activity','Active'],['clock','Last login'],['more','Actions']];return `<div class="stp-table-head ${agent?'stp-agent-table':''}">${defs.map(([sym,label])=>`<div class="stp-th-ico"><span class="stp-mini-ico">${icon(sym)}</span><span>${label}</span></div>`).join('')}</div>`;}
function userRow(row,roles,kind){
 const agent=kind==='agents',crew=kind==='bus-staff',isUser=!!row.is_user,id=row.id;
 const avatar=String(row.name||'?').split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase().slice(0,2);
 const active=String(row.status).toUpperCase()==='ACTIVE'||String(row.status).toLowerCase()==='active';
 const classA=agent?'teal':crew?'orange':'';
 const time=row.last_login?DATES(row.last_login)+(row.login_count?` · ${row.login_count}`:''):'—';
 const roleName=(roles||[]).find(r=>r.key===row.role)?.name||row.role||'Bus crew';
 const secondary=agent?`<button class="stp-sub stp-agent-settings" data-agent-settings="${escV(id)}" type="button">${icon('settings')} Agent settings</button>`:'';
 return `<div class="stp-table-row ${agent?'stp-agent-table':''}" data-user-row="${escV(id)}" data-kind="${isUser?'user':'staff'}"><div class="stp-user"><div class="stp-avatar ${classA}">${escV(avatar)}</div><div><div class="stp-name ${!active?'muted':''}">${escV(row.name)}</div>${secondary}</div></div>
 <div class="stp-cell-icon"><span class="ico">${icon('phone')}</span><span>${escV(row.phone)}</span></div>
 ${agent?`<span class="stp-role-chip">Agent</span><span class="stp-mode-chip">${escV(row.mode||'Online')}</span>`:`<div><select class="stp-role-chip ${crew?'orange':'violet'}" data-row-role="${escV(id)}" ${isUser&&allowed('iam.manage_users')?'':'disabled'}>${roleOptions(roles,row.role)}</select>${!isUser?`<small class="stp-role-hint">Staff record · create login to assign access</small>`:''}</div>`}
 <div><button class="stp-switch ${active?'on':''}" type="button" aria-label="Change active status" data-active-toggle="${escV(id)}" ${isUser&&allowed('iam.manage_users')?'':'disabled'}></button></div>
 <div class="stp-cell-icon">${icon('clock')}<span>${escV(time)}</span></div>${actionButtons(id,isUser?'user':'staff',isUser&&allowed('iam.manage_users'))}</div>`;
}
function teamTabs(active,counts){return `<div class="stp-top-tabs-wrap"><div class="stp-top-tabs">${TEAM_TABS.map(([key,label,sym])=>`<a class="stp-seg-tab ${key===active?'active':''}" href="${teamURL(key)}"><span class="stp-seg-icon">${icon(sym)}</span><span>${label}</span>${key!=='access'&&key!=='branches'?`<span class="stp-tab-count">${Number(counts[key])||0}</span>`:''}</a>`).join('')}</div>${active==='branches'||active==='access'?'':`<label class="stp-search">${icon('search')}<input data-team-search placeholder="Search by name or phone..." aria-label="Search by name or phone" /></label>`}</div>`;}

async function loadTeam(){
 const [usersR,rolesR,branchesR,staffR]=await Promise.all([
   G.get('/iam/users'),G.get('/iam/roles'),G.get('/branches'),allowed('staff.view')?G.get('/staff').catch(()=>({staff:[]})):Promise.resolve({staff:[]})
 ]);
 const users=Array.isArray(usersR)?usersR:usersR.users||[];
 const roles=rolesR.roles||[], branches=Array.isArray(branchesR)?branchesR:branchesR.branches||[];
 const staff=(staffR.staff||[]).filter(s=>['driver','helper','conductor'].includes(s.role));
 const office=users.filter(x=>!['agent','driver','helper','conductor'].includes(x.role));
 const crew=users.filter(x=>['driver','helper','conductor'].includes(x.role));
 const staffOnly=staff.filter(s=>!crew.some(u=>String(u.phone)===String(s.phone)))
   .map(s=>({...s,is_user:false,status:String(s.status||'active').toUpperCase(),role:s.role}));
 const agent=users.filter(x=>x.role==='agent');
 return {users,roles,catalog:rolesR.catalog||{},branches,staff,office,crew:[...crew,...staffOnly],agent};
}
function formUser(u,roles,branches,kind='office-staff'){
 const isAgent=kind==='agents'||u?.role==='agent';
 const roleDefault=kind==='bus-staff'?'driver':isAgent?'agent':'booking_executive';
 return `<div class="stp-form-grid">${input('name','Full name',u?.name||'',{required:true})}${input('phone','Mobile number',u?.phone||'',{required:true,placeholder:'10-digit mobile'})}${input('email','Email address',u?.email||'')}${input('role','Role',u?.role||roleDefault,{type:'select',values:roles.map(r=>[r.key,r.name])})}${input('branch_id','Branch',u?.branch_id||'',{type:'select',values:[['','Organization-wide'],...branches.map(b=>[String(b.id),b.name])]})}${input('status','Status',u?.status||'ACTIVE',{type:'select',values:[['ACTIVE','Active'],['INACTIVE','Inactive']]})}${isAgent?`${input('agent_type','Agent type',u?.agent_type||'postpaid',{type:'select',values:[['prepaid','Prepaid'],['postpaid','Postpaid']]})}${input('commission_pct','Commission (%)',u?.commission_pct||0,{type:'number',min:0,max:100})}${input('credit_limit','Credit limit (₹)',u?.credit_limit||0,{type:'number',min:0})}${input('mode','Mode',u?.mode||'Online',{type:'select',values:[['Online','Online'],['Offline','Offline']]})}`:''}</div>`;
}
async function userEditor(u,kind,team,reload){
 const editing=!!u;
 const allPerms=Object.entries(team.catalog||{});
 let routes=[];
 if(allowed('routes.view')){
  try{const r=await G.get('/routes');routes=r.routes||r.rows||[];}catch(_){/* May be unavailable for this role. */}
 }
 const extras=new Set(u?.extra_permissions||[]),denied=new Set(u?.denied_permissions||[]);
 const selectedRoutes=new Set((u?.route_ids||[]).map(String));
 const routesMarkup=routes.length?`<div class="stp-check-grid">${routes.slice(0,100).map(r=>`<label class="stp-check-label"><input type="checkbox" data-user-route="${escV(r.id)}" ${selectedRoutes.has(String(r.id))?'checked':''}>${escV(r.service_number||r.name||r.id)}</label>`).join('')}</div>`:'<p class="stp-muted">No route records available for selection. Route assignments can be configured once routes have been created.</p>';
 const permissionsMarkup=`<p class="stp-muted">Extra permissions are added for this person; denied permissions override role grants. Backend API permissions are enforced. Route assignments are stored but must be enforced per route endpoint before production.</p>
 <div class="stp-access-editor-list">${allPerms.map(([area,keys])=>`<section><h4>${escV(area)}</h4>${keys.map(key=>`<div class="stp-extra-perm-row"><span>${escV(key)}</span><label class="stp-check-label"><input type="checkbox" data-extra-permission="${escV(key)}" ${extras.has(key)?'checked':''}>Allow</label><label class="stp-check-label"><input type="checkbox" data-denied-permission="${escV(key)}" ${denied.has(key)?'checked':''}>Deny</label></div>`).join('')}</section>`).join('')}</div><h4 class="stp-section-subtitle">Assigned routes</h4>${routesMarkup}`;
 const body=`<nav class="stp-editor-tabs"><button class="active" type="button" data-editor-tab="profile">Profile</button><button type="button" data-editor-tab="permissions">Permissions & routes</button></nav><div data-editor-panel="profile">${formUser(u,team.roles,team.branches,kind)}</div><div data-editor-panel="permissions" hidden>${permissionsMarkup}</div>`;
 const m=modal({title:editing?'Edit user':'Add '+(kind==='agents'?'agent':kind==='bus-staff'?'bus staff':'office staff'),subtitle:editing?'Profile, permissions & routes':'Create a login that can be used with mobile OTP',wide:true,
  body,save:editing?'Save changes':'Add user',onSave:async(form,outer)=>{
   if(!/^\d{10}$/.test(form.phone.replace(/\D/g,'')))throw new Error('Use a 10-digit phone number');
   if(!String(form.name).trim())throw new Error('Name is required');
   const extra_permissions=[...outer.querySelectorAll('[data-extra-permission]:checked')].map(x=>x.dataset.extraPermission);
   const denied_permissions=[...outer.querySelectorAll('[data-denied-permission]:checked')].map(x=>x.dataset.deniedPermission);
   const route_ids=[...outer.querySelectorAll('[data-user-route]:checked')].map(x=>Number(x.dataset.userRoute));
   const payload={...form,phone:form.phone.replace(/\D/g,''),branch_id:form.branch_id||null,extra_permissions,denied_permissions,route_ids};
   if(!editing)await G.post('/iam/users',payload);
   else await G.put(`/iam/users/${u.id}`,payload);
   G.toast(editing?'User updated':'User added','ok');await reload();
 }});
 m.el.querySelectorAll('[data-editor-tab]').forEach(b=>b.onclick=()=>{
  m.el.querySelectorAll('[data-editor-tab]').forEach(x=>x.classList.toggle('active',x===b));
  m.el.querySelectorAll('[data-editor-panel]').forEach(x=>x.hidden=x.dataset.editorPanel!==b.dataset.editorTab);
 });
 m.el.querySelectorAll('[data-extra-permission]').forEach(x=>x.onchange=()=>{if(x.checked){const other=m.el.querySelector(`[data-denied-permission="${x.dataset.extraPermission}"]`);if(other)other.checked=false;}});
 m.el.querySelectorAll('[data-denied-permission]').forEach(x=>x.onchange=()=>{if(x.checked){const other=m.el.querySelector(`[data-extra-permission="${x.dataset.deniedPermission}"]`);if(other)other.checked=false;}});
}
function userViewer(u,team,kind,reload){
 const role=team.roles.find(r=>r.key===u.role)?.name||u.role||'Bus staff';
 const avatar=String(u.name||'?').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
 const fields=[['phone','Phone',u.phone],['activity','Status',u.status||'—'],['mail','Email',u.email||'—'],['globe','Language',u.language||'English'],['clock','Last login',u.last_login?DATES(u.last_login)+` · ${u.login_count||0} logins`:'—'],['calendar','Added',DATES(u.created_at)]];
 const content=`<div class="stp-modal-user stp-detail-user"><div class="stp-avatar">${escV(avatar)}</div><div class="stp-modal-title"><h3>${escV(u.name)}</h3><span class="stp-badge-small">${icon('shield')} ${escV(role)}</span></div></div><div class="stp-viewer-fields">${fields.map(([ico,label,value])=>`<div class="stp-modal-section"><span class="ico">${icon(ico)}</span><span class="stp-modal-kv"><small>${escV(label)}</small><div>${escV(value)}</div></span></div>`).join('')}</div>`;
 const m=modal({title:'User details',body:content,wide:false,save:'Edit',onSave:async()=>{m.close();await userEditor(u,kind,team,reload);return false;}});
}
async function branchEditor(row,team,reload){
 const citiesR=await G.get('/cities'); const cities=citiesR.cities||[];
 modal({title:row?'Edit branch':'New branch',subtitle:'Branch users can be assigned a selling office',wide:true,
 body:`<div class="stp-form-grid">${input('name','Branch name',row?.name||'',{required:true})}${input('city_id','City',row?.city_id||'',{type:'select',values:[['','Select city'],...cities.map(c=>[String(c.id),c.name])]})}${input('phone','Phone number',row?.phone||'')}${input('address','Address',row?.address||'',{type:'textarea'})}</div>`,
 save:row?'Save branch':'Create branch',onSave:async vals=>{
  if(!String(vals.name||'').trim())throw new Error('Branch name required');
  if(!vals.city_id)throw new Error('Select a city');
  const body={...vals,city_id:Number(vals.city_id)};
  if(row)await G.put(`/branches/${row.id}`,body);else await G.post('/branches',body);
  G.toast('Branch saved','ok');await reload();
 }});
}
async function showTeam(el,sub='office-staff'){
 let team=await loadTeam();
 const tabsCount={'office-staff':team.office.length,'bus-staff':team.crew.length,agents:team.agent.length};
 const isAgent=sub==='agents';
 const rowData=sub==='office-staff'?team.office:sub==='bus-staff'?team.crew:sub==='agents'?team.agent:[];
 snapshot.team=team;
 const action=sub==='office-staff'?'Add office staff':sub==='bus-staff'?'Add bus staff':sub==='agents'?'Add agent':sub==='branches'?'Add User':sub==='access'?'Add User':'';
 let html=drawTitle('Team & access',action,'add','bus')+teamTabs(sub,tabsCount);
 if(sub==='access'){
   el.innerHTML=`<div class="stp-shell">${html}<div data-access-pane></div></div>`;
   const p=location.hash.split('?')[0].replace(/^#\//,'').split('/');
   await showAccess(el.querySelector('[data-access-pane]'),p[3]||'roles',p[4]||'viewer',team);
 }else if(sub==='branches'){
   html+=`<div class="stp-inline-note"><p>An office or team. Users pinned to a branch can sell any trip; their bookings are accounted under the branch, and branch admins see only their branch's bookings and people.</p><button class="stp-btn primary slim" type="button" data-create-branch>＋ New branch</button></div>`;
   html+=team.branches.length?`<div class="stp-card stp-table-card"><div class="stp-table-head stp-branch-table"><span>Branch</span><span>City</span><span>Phone</span><span>Assigned users</span><span>Actions</span></div>${team.branches.map(b=>`<div class="stp-table-row stp-branch-table"><b>${escV(b.name)}<small class="stp-block-muted">${escV(b.address)}</small></b><span>${escV(b.city_id||'—')}</span><span>${escV(b.phone||'—')}</span><span>${team.users.filter(u=>u.branch_id==b.id).length}</span>${actionButtons(b.id,'branch',allowed('settings.modify'))}</div>`).join('')}</div>`:emptyPanel('No branches yet','Everyone in this organization currently has org-wide access. Create a branch to start pinning users to an office.','building');
   el.innerHTML=`<div class="stp-shell">${html}</div>`;
 }else{
   html+=inlineNote(team.branches.length);
   html+=rowData.length?`<div class="stp-card stp-table-card ${isAgent?'stp-agent-list':''}">${tableHead(isAgent)}${rowData.map(r=>userRow({...r,is_user:r.is_user!==false},team.roles,sub)).join('')}</div>`:emptyPanel('No matching users','Add a user or agent to see them here','users');
   el.innerHTML=`<div class="stp-shell">${html}</div>`;
 }
 const reload=async()=>showTeam(el,sub);
 el.querySelectorAll('[data-team-search]').forEach(i=>i.oninput=()=>{
   const q=i.value.trim().toLowerCase();el.querySelectorAll('[data-user-row]').forEach(r=>r.style.display=r.textContent.toLowerCase().includes(q)?'':'none');
 });
 el.querySelectorAll('[data-page-action]').forEach(btn=>btn.onclick=()=>userEditor(null,sub,team,reload).catch(G.err));
 el.querySelectorAll('[data-create-branch]').forEach(btn=>btn.onclick=()=>branchEditor(null,team,reload).catch(G.err));
 el.querySelectorAll('[data-active-toggle]').forEach(btn=>btn.onclick=async()=>{
   const id=btn.dataset.activeToggle;const u=team.users.find(x=>String(x.id)===String(id));if(!u)return;
   try{await G.put(`/iam/users/${id}`,{status:u.status==='ACTIVE'?'INACTIVE':'ACTIVE'});await reload();G.toast('User status updated','ok');}catch(e){G.err(e);}
 });
 el.querySelectorAll('[data-row-role]').forEach(select=>select.onchange=async()=>{
   try{await G.put(`/iam/users/${select.dataset.rowRole}`,{role:select.value});G.toast('Role updated','ok');await reload();}catch(e){G.err(e);await reload();}
 });
 el.querySelectorAll('[data-row-view]').forEach(btn=>btn.onclick=()=>{
   const id=btn.dataset.rowView,kind=btn.dataset.kind;
   const row=kind==='branch'?team.branches.find(x=>String(x.id)===id):kind==='staff'?team.crew.find(x=>String(x.id)===id&&x.is_user===false):team.users.find(x=>String(x.id)===id);
   if(kind==='branch')branchEditor(row,team,reload).catch(G.err);else if(row)userViewer(row,team,sub,reload);
 });
 el.querySelectorAll('[data-row-edit]').forEach(btn=>btn.onclick=()=>{
   const id=btn.dataset.rowEdit;const kind=btn.dataset.kind;
   if(kind==='branch'){branchEditor(team.branches.find(b=>String(b.id)===id),team,reload).catch(G.err);return;}
   const u=team.users.find(x=>String(x.id)===id);if(u)userEditor(u,sub,team,reload).catch(G.err);
 });
 el.querySelectorAll('[data-row-delete]').forEach(btn=>btn.onclick=async()=>{
   const id=btn.dataset.rowDelete,kind=btn.dataset.kind;
   const entity=kind==='branch'?team.branches.find(b=>String(b.id)===id):team.users.find(x=>String(x.id)===id);
   if(!entity)return;
   const yes=await G.confirm(`Delete ${escV(entity.name)}? This action cannot be undone.`,{danger:true,ok:'Delete'});
   if(!yes)return;
   try{await G.del(kind==='branch'?`/branches/${id}`:`/iam/users/${id}`);G.toast('Record deleted','ok');await reload();}catch(e){G.err(e);}
 });
 el.querySelectorAll('[data-agent-settings]').forEach(btn=>btn.onclick=()=>{
   const u=team.users.find(x=>String(x.id)===String(btn.dataset.agentSettings));if(!u)return;
   modal({title:`Agent settings · ${u.name}`,subtitle:'Commission, credit and selling mode',wide:true,
    body:`<div class="stp-form-grid">${input('commission_pct','Commission (%)',u.commission_pct||0,{type:'number',min:0,max:100})}${input('credit_limit','Credit limit (₹)',u.credit_limit||0,{type:'number',min:0})}${input('agent_type','Settlement type',u.agent_type||'postpaid',{type:'select',values:[['postpaid','Postpaid'],['prepaid','Prepaid']]})}${input('mode','Selling mode',u.mode||'Online',{type:'select',values:[['Online','Online'],['Offline','Offline']]})}</div>`,
    onSave:async v=>{await G.put(`/iam/users/${u.id}`,v);G.toast('Agent settings saved','ok');await reload();}});
 });
}

function roleItem(role){return ROLE_ORDER.find(x=>x[0]===role)||[role,role.replace(/_/g,' ')];}
function sectionDisplay(section,role){
 const perms=new Set(role?.permissions||[]),ui=role?.ui_permissions||{},scopes=role?.scopes||{};
 return `<div class="stp-perm-title">${escV(section.title)}</div><div class="stp-perm-card">${section.items.map(item=>{
   const key=PERM_MAP[item.label];const defaultOn=role?Boolean(key&&perms.has(key)):Boolean(item.value);
   const active=Object.hasOwn(ui,item.label)?ui[item.label]:defaultOn;
   const scope=Object.hasOwn(scopes,item.label)?scopes[item.label]:(role?active?(item.kind==='scope'?'Company':'On'):'Off':item.value);
   return `<div class="stp-perm-row"><div>${escV(item.label)}${item.note?`<span class="stp-perm-note">${escV(item.note)}</span>`:''}</div>${item.kind==='scope'?`<div class="stp-scope" data-perm-label="${escV(item.label)}">${item.scopes.map(v=>`<button type="button" class="${scope===v?'active':''}" data-scope-value="${v}">${v}</button>`).join('')}</div>`:`<button class="stp-switch ${active?'on':''}" data-perm-toggle="${escV(item.label)}" aria-label="${escV(item.label)}" type="button"></button>`}</div>`;
 }).join('')}</div>`;
}
function rolesMain(roleKey,team,role){
 const names=ROLE_ORDER.map(([key,name])=>`<a class="stp-role-pill ${key===roleKey?'active':''}" href="${rolesURL('roles',key)}">${escV(name)}</a>`).join('');
 const left=PERMS.filter(x=>x.side==='left'),right=PERMS.filter(x=>x.side==='right');
 return `${note('What each role can do, and its limits (e.g. at most 3 blocked seats). Turn things on or off for a whole role, or create your own roles. For one person, use Edit user → Permissions & routes.')}
 <div class="stp-note-text"><b class="stp-heading-text">Who can do what</b>Choose what each role may do at your company. A role you have not changed uses the standard permissions.</div>
 <div class="stp-role-strip">${names}<button class="stp-role-pill new" type="button" data-new-role>＋ New role</button></div>
 <p class="stp-muted">${role?.builtin&&!role?.ui_permissions?'Using standard permissions.':'Viewing saved permission configuration.'} ${escV(roleItem(roleKey)[1])}.</p>
 <div class="stp-access-grid"><div>${left.map(x=>sectionDisplay(x,role)).join('')}</div><div>${right.map(x=>sectionDisplay(x,role)).join('')}</div></div>
 <div class="stp-savebar"><button class="stp-btn primary" type="button" data-save-role ${allowed('iam.manage_roles')?'':'disabled'}>Save ${escV(roleItem(roleKey)[1])}</button>${role&&!role.builtin?`<button class="stp-btn stp-danger" type="button" data-delete-role>Delete role</button>`:''}<div class="stp-footnote">UI scope metadata is saved. Row-level Own/Branch/Company restrictions need endpoint enforcement before production use.</div></div>`;
}
function roleMetaFromDom(root){
 const scopes={},ui_permissions={};
 root.querySelectorAll('[data-perm-toggle]').forEach(btn=>ui_permissions[btn.dataset.permToggle]=btn.classList.contains('on'));
 root.querySelectorAll('[data-perm-label]').forEach(group=>{
   const selected=group.querySelector('[data-scope-value].active');const value=selected?.dataset.scopeValue||'Off';
   scopes[group.dataset.permLabel]=value;ui_permissions[group.dataset.permLabel]=value!=='Off';
 });
 return {scopes,ui_permissions};
}
function currentAccessRole(team,key){return team.roles.find(r=>r.key===key)||null;}
async function showAccess(el,tab,roleKey,team){
 const role=currentAccessRole(team,roleKey);
 const items=[['roles','Roles'],['test-access','Test access'],['groups','Groups'],['advanced','Advanced']];
 let html=tabbar(items.map(([k,t])=>[k,t,rolesURL(k,roleKey)]),tab);
 if(tab==='roles')html+=rolesMain(roleKey,team,role);
 if(tab==='test-access')html+=await accessTestScreen(team);
 if(tab==='groups')html+=await accessGroupsScreen();
 if(tab==='advanced')html+=await accessAdvancedScreen(roleKey,role);
 el.innerHTML=html;
 el.querySelectorAll('[data-perm-toggle]').forEach(btn=>btn.onclick=()=>btn.classList.toggle('on'));
 el.querySelectorAll('[data-scope-value]').forEach(btn=>btn.onclick=()=>{const parent=btn.parentElement;parent.querySelectorAll('button').forEach(b=>b.classList.remove('active'));btn.classList.add('active');});
 const save=el.querySelector('[data-save-role]');
 if(save)save.onclick=async()=>{
  if(!allowed('iam.manage_roles'))return;
  const meta=roleMetaFromDom(el);
  const allCodes=Object.values(PERM_MAP);
  const codes=new Set((role?.permissions||[]).filter(code=>!allCodes.includes(code)));
  for(const [label,enabled]of Object.entries(meta.ui_permissions)){if(enabled&&PERM_MAP[label])codes.add(PERM_MAP[label]);}
  // Preserve a mapping only if at least one UI row referencing it remains enabled.
  for(const code of allCodes){if(!Object.entries(meta.ui_permissions).some(([label,v])=>v&&PERM_MAP[label]===code))codes.delete(code);}
  try{await G.put(`/iam/roles/${encodeURIComponent(roleKey)}`,{name:role?.name||roleItem(roleKey)[1],permissions:[...codes],scopes:meta.scopes,ui_permissions:meta.ui_permissions,limits:role?.limits||{}});G.toast('Role permissions saved','ok');}catch(e){G.err(e);}
 };
 const nr=el.querySelector('[data-new-role]');if(nr)nr.onclick=()=>modal({title:'Create custom role',body:input('name','Role name','',{required:true}),save:'Create role',onSave:async({name})=>{
  const key=name.trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
  if(!key||key==='owner')throw new Error('Invalid custom role');await G.put(`/iam/roles/${key}`,{name,permissions:[],scopes:{},ui_permissions:{}});location.hash=rolesURL('roles',key);
 }});
 const dr=el.querySelector('[data-delete-role]');if(dr)dr.onclick=async()=>{if(await G.confirm(`Delete role ${role?.name}?`,{danger:true,ok:'Delete'})){try{await G.del(`/iam/roles/${roleKey}`);location.hash=rolesURL('roles','viewer');}catch(e){G.err(e);}}};
 bindTestAccess(el,team);
 bindGroups(el,team);
 bindAdvanced(el,roleKey,role);
}

async function accessTestScreen(team){
 const ids=team.users.map(u=>[String(u.id),`${u.name} · ${u.role}`]);
 return `${note('Check a specific user’s effective API permissions. This view reads the same role/permission catalogue used by backend authorization.')}
 <section class="stp-brand-card"><div class="stp-card-head"><div class="stp-hero-icon">${icon('shield')}</div><h3>Test access</h3></div>
 <div class="stp-form-grid">${input('user_id','User',ids[0]?.[0]||'',{type:'select',values:ids})}${input('feature','Search permission','',{placeholder:'e.g. trips.view'})}</div>
 <div class="stp-savebar"><button class="stp-btn primary" type="button" data-test-access>Test user permissions</button></div><div data-test-results></div></section>`;
}
function bindTestAccess(el,team){
 const btn=el.querySelector('[data-test-access]');if(!btn)return;
 btn.onclick=async()=>{
  const u=el.querySelector('[name="user_id"]')?.value;const q=el.querySelector('[name="feature"]')?.value.toLowerCase().trim()||'';
  const out=el.querySelector('[data-test-results]');
  try{const data=await G.get(`/iam/access-evaluate/${encodeURIComponent(u)}`);
   const result=data.user.permissions.filter(x=>x.toLowerCase().includes(q));
   out.innerHTML=`<div class="stp-test-result"><b>${escV(data.user.name)} · ${escV(data.role_name)}</b><p class="stp-muted">${result.length} matching permissions. Groups: ${escV(data.groups.map(x=>x.name).join(', ')||'none')}</p><div class="stp-permission-tags">${result.map(x=>`<span>${icon('check')} ${escV(x)}</span>`).join('')||'<p>No matching permission granted.</p>'}</div><p class="stp-muted">${escV(data.note)}</p></div>`;
  }catch(e){G.err(e);}
 };
}
async function accessGroupsScreen(){
 const rows=await G.get('/iam/groups');snapshot.groups=rows;
 return `${note('Group office users into teams for administration and bulk review. Group membership is persisted; group-level authorization inheritance is not yet enabled.')}
 <div class="stp-savebar"><button class="stp-btn primary" type="button" data-add-group>＋ New group</button></div>
 ${rows.length?`<div class="stp-card stp-group-list">${rows.map(g=>`<div class="stp-group-row"><div><b>${escV(g.name)}</b><p>${escV(g.description||'No description')} · ${g.user_ids?.length||0} users</p></div><div class="stp-actions"><button class="stp-icon-btn" type="button" data-group-edit="${g.id}">${icon('edit')}</button><button class="stp-icon-btn delete" type="button" data-group-delete="${g.id}">${icon('trash')}</button></div></div>`).join('')}</div>`:emptyPanel('No groups yet','Create a group and pin members to it.','users')}`;
}
function bindGroups(el,team){
 async function openGroup(row){
  const ids=new Set((row?.user_ids||[]).map(Number));
  modal({title:row?'Edit group':'New group',subtitle:'Membership is saved for operator administration',wide:true,
  body:`<div class="stp-form-grid">${input('name','Group name',row?.name||'',{required:true})}${input('description','Description',row?.description||'')}</div><h4 class="stp-section-subtitle">Members</h4><div class="stp-check-grid">${team.users.map(u=>`<label class="stp-check-label"><input type="checkbox" data-member="${u.id}" ${ids.has(Number(u.id))?'checked':''}>${escV(u.name)} <small>(${escV(u.role)})</small></label>`).join('')}</div>`,
  onSave:async(v,outer)=>{
   const user_ids=[...outer.querySelectorAll('[data-member]:checked')].map(x=>Number(x.dataset.member));
   const payload={name:v.name,description:v.description,user_ids};
   if(row)await G.put(`/iam/groups/${row.id}`,payload);else await G.post('/iam/groups',payload);
   G.toast('Group saved','ok');location.hash=rolesURL('groups','viewer');G.route();
  }});
 }
 el.querySelector('[data-add-group]')?.addEventListener('click',()=>openGroup(null));
 el.querySelectorAll('[data-group-edit]').forEach(b=>b.onclick=()=>openGroup(snapshot.groups.find(g=>String(g.id)===b.dataset.groupEdit)));
 el.querySelectorAll('[data-group-delete]').forEach(b=>b.onclick=async()=>{if(await G.confirm('Delete this group?',{danger:true,ok:'Delete'})){try{await G.del(`/iam/groups/${b.dataset.groupDelete}`);G.route();}catch(e){G.err(e);}}});
}
async function accessAdvancedScreen(key,role){
 const history=await G.get('/history?entity=iam').catch(()=>[]);
 const limits=role?.limits||{};
 return `${note('Advanced access tools: limits, audit history, role export and per-user overrides. API permissions still enforce the actual access boundary.')}
 ${card('Role limits',`<div class="stp-form-grid">${input('max_blocked_seats','Maximum blocked seats',limits.max_blocked_seats??3,{type:'number',min:0,max:100})}${input('max_discount_percent','Maximum discount (%)',limits.max_discount_percent??0,{type:'number',min:0,max:100})}${input('max_refund_percent','Maximum refund (%)',limits.max_refund_percent??0,{type:'number',min:0,max:100})}${input('max_advance','Advance booking limit',limits.max_advance??0,{type:'number',min:0})}</div><div class="stp-savebar"><button class="stp-btn primary" type="button" data-save-limits>Save limits</button><button class="stp-btn" type="button" data-export-role>Export role JSON</button></div><p class="stp-muted">Limits are stored for policy-design preview. Enforcement requires corresponding checks in booking and payment endpoints.</p>`,'key')}
 ${card('Change history',history.length?`<div class="stp-audit-list">${history.slice(0,25).map(h=>`<div><b>${escV(h.entity||h.type||'Change')}</b><span>${escV(h.action||h.key||'updated')} · ${DATES(h.ts||h.created_at)}</span></div>`).join('')}</div>`:'<p class="stp-muted">No IAM changes recorded yet.</p>','clock')}`;
}
function bindAdvanced(el,key,role){
 el.querySelector('[data-save-limits]')?.addEventListener('click',async()=>{
  const v={};el.querySelectorAll('.stp-brand-card input[name]').forEach(input=>v[input.name]=Number(input.value)||0);
  try{await G.put(`/iam/roles/${encodeURIComponent(key)}`,{name:role?.name||roleItem(key)[1],permissions:role?.permissions||[],scopes:role?.scopes||{},ui_permissions:role?.ui_permissions||{},limits:v});G.toast('Role limits saved as policy metadata','ok');}catch(e){G.err(e);}
 });
 el.querySelector('[data-export-role]')?.addEventListener('click',()=>{
  const data=new Blob([JSON.stringify(role||{key,name:roleItem(key)[1]},null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(data);a.download=`${key}-role.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);
 });
}

function brandField(title,name,value,ico='badge',options=null){
 return `<label class="stp-field-wrap"><span class="stp-label">${escV(title)}</span><span class="stp-field"><span class="ico">${icon(ico)}</span>${options?`<select data-brand="${name}">${options.map(x=>`<option ${String(x)===String(value)?'selected':''}>${escV(x)}</option>`).join('')}</select>`:`<input data-brand="${name}" value="${escV(value)}">`}</span></label>`;
}
function palette(color){
 const raw=String(color||'#2563EB').toUpperCase();
 return [raw,'#5686F1','#7E9EF4','#A7BDF9','#C3D3FC'];
}
function brandPreview(data){
 const op=data.operator||{}, b=data.branding||{};
 const pal=palette(op.brand_hex);
 const src=b.assets?.mobile_logo||op.logo_url;
 return `<div class="stp-brand-hero"><div class="stp-brand-left"><div class="stp-brand-logo">${src?`<img src="${escV(src)}" alt="Brand logo"/>`:'<div class="stp-brand-logo-mark"><span>GDS</span> Operator</div>'}</div><div class="stp-brand-text"><h2 data-preview-name>${escV(op.app_name||op.operator_name||'Operator')}</h2><p data-preview-tagline>${escV(op.tagline||'')}</p><div class="stp-brand-chip-row"><span class="stp-brand-chip">${icon('phone')}<span data-preview-phone>${escV(op.helpline_number||'—')}</span></span><span class="stp-brand-chip">${icon('mail')}<span data-preview-email>${escV(op.support_email||'—')}</span></span></div></div></div><div class="stp-palette-preview" data-palette-preview>${pal.map(x=>`<span class="sw" style="background:${escV(x)}"></span>`).join('')}</div></div>`;
}
function assetUpload(item,index,assetData){
 const key=ASSET_CODES[index],src=assetData?.[key]||'';
 const label=item.label;
 return `<div class="stp-upload-card" data-asset="${key}"><label>${escV(label)}</label><div class="stp-upload-box"><div class="stp-asset-preview">${src?`<img src="${escV(src)}" alt="${escV(label)}"/>`:`<div class="stp-upload-placeholder">${icon('image')}</div><b>${escV(item.empty||'No image')}</b>`}</div><button class="stp-upload-action" type="button" data-asset-pick="${key}">${icon('upload')} Upload</button><input type="file" accept="image/png,image/jpeg,image/webp" hidden data-asset-file="${key}">${src?`<button class="stp-asset-remove" type="button" data-asset-remove="${key}">Remove</button>`:''}</div>${item.note?`<div class="stp-help-text">${escV(item.note)}</div>`:''}</div>`;
}
async function showBranding(el){
 const data=await G.get('/settings/branding');snapshot.brand=data;
 const o=data.operator||{},b=data.branding||{};const assets=b.assets||{};
 const currentHex=o.brand_hex||'#2563EB';
 let html=drawTitle('Branding','','','brush');
 html+=`<div class="stp-brand-toolbar stp-brand-page-actions"><button class="stp-btn" data-brand-preview>${icon('preview')} Preview</button><button class="stp-btn" data-brand-reset>${icon('reset')} Reset</button><button class="stp-btn primary" data-brand-save ${allowed('settings.modify')?'':'disabled'}>${icon('save')} Save</button></div>`;
 html+=`<div class="stp-brand-preview">${brandPreview(data)}</div>`;
 html+=card('Identity',`<div class="stp-form-grid">${brandField('App name','appName',o.app_name||'', 'badge')}${brandField('Tagline','tagline',o.tagline||'','spark')}${brandField('Helpline','helpline',o.helpline_number||'','phone')}${brandField('Support email','supportEmail',o.support_email||'','mail')}</div>`,'badge');
 html+=card('Colors & Typography',`<div class="stp-color-panel"><div><div class="stp-field-wrap"><label>Brand color</label><div class="stp-color-well"><div class="stp-color-box" data-brand-color-box style="background:${escV(currentHex)}"></div><div class="stp-color-input"><span class="ico">${icon('droplet')}</span><input data-brand="brandColor" value="${escV(currentHex)}" aria-label="Brand color"/></div></div><div class="stp-color-strip">${palette(currentHex).map(x=>`<button type="button" data-palette="${escV(x)}" title="Choose ${escV(x)}"><span class="sw long" style="background:${escV(x)}"></span></button>`).join('')}</div></div><div class="stp-field-wrap" style="margin-top:22px"><label>Color scheme</label><div class="stp-scheme-row">${['Light','Dark','System'].map(v=>`<button class="stp-scheme ${(b.color_scheme||'Light')===v?'active':''}" data-scheme="${v}" type="button">${icon(v==='Light'?'spark':v==='Dark'?'globe':'desktop')} ${v}</button>`).join('')}</div></div></div><div>${brandField('Font family','fontFamily',o.font_family||'Poppins','badge',['Poppins','Inter','Manrope','Roboto','System'])}</div></div>`,'settings');
 html+=card('Logo & Assets',`<div class="stp-assets-grid">${(R.BRANDING_UPLOADS||[]).map((it,i)=>assetUpload(it,i,assets)).join('')}</div><div class="stp-note-line">Logos: use PNG, JPEG or WebP under 1 MB. SVG upload is disabled until server-side sanitization is available. Tap the logo in the header to return home.</div>`,'image');
 html+=card('PWA Advanced',`<div class="stp-form-grid">${brandField('PWA name','pwaName',b.pwa_name||o.app_name||'','mobile')}${brandField('PWA short name','pwaShortName',b.pwa_short_name||'','hash')}</div><p class="stp-muted">App name, color and icon are served by the live manifest. Installed apps may need to be restarted or reinstalled to refresh branding; offline support requires a separate service-worker rollout.</p>`,'mobile');
 el.innerHTML=`<div class="stp-shell stp-brand-shell">${html}</div>`;
 const field=(key)=>el.querySelector(`[data-brand="${key}"]`);
 const current=()=>({app_name:field('appName')?.value||'',tagline:field('tagline')?.value||'',helpline_number:field('helpline')?.value||'',support_email:field('supportEmail')?.value||'',brand_hex:field('brandColor')?.value||'',font_family:field('fontFamily')?.value||'Poppins',color_scheme:el.querySelector('[data-scheme].active')?.dataset.scheme||'Light',pwa_name:field('pwaName')?.value||'',pwa_short_name:field('pwaShortName')?.value||''});
 const update=()=>{
  const v=current();
  const set=(sel,value)=>{const n=el.querySelector(sel);if(n)n.textContent=value;};
  set('[data-preview-name]',v.app_name);set('[data-preview-tagline]',v.tagline);set('[data-preview-phone]',v.helpline_number);set('[data-preview-email]',v.support_email);
  el.querySelector('.stp-brand-preview')?.setAttribute('data-scheme',v.color_scheme);
  if(/^#[a-f\d]{6}$/i.test(v.brand_hex)){
   const b=el.querySelector('[data-brand-color-box]');if(b)b.style.background=v.brand_hex;
   const p=el.querySelector('[data-palette-preview]');if(p)p.innerHTML=palette(v.brand_hex).map(c=>`<span class="sw" style="background:${c}"></span>`).join('');
  }
 };
 el.querySelectorAll('[data-brand]').forEach(inp=>inp.addEventListener('input',update));
 el.querySelectorAll('[data-palette]').forEach(btn=>btn.onclick=()=>{field('brandColor').value=btn.dataset.palette;update();});
 el.querySelectorAll('[data-scheme]').forEach(btn=>btn.onclick=()=>{el.querySelectorAll('[data-scheme]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');update();});
 el.querySelector('[data-brand-save]').onclick=async()=>{
  const v=current();if(!/^#[a-f\d]{6}$/i.test(v.brand_hex))return G.toast('Brand color must be #RRGGBB','bad');
  if(v.support_email&&!/^\S+@\S+\.\S+$/.test(v.support_email))return G.toast('Enter a valid support email','bad');
  try{const r=await G.put('/settings/branding',v);G.operator={...(G.operator||{}),...r.operator};localStorage.setItem('stp_brand_scheme',v.color_scheme);document.body.dataset.stpScheme=v.color_scheme;document.body.style.fontFamily=v.font_family+',system-ui,sans-serif';document.documentElement.style.setProperty('--brand',v.brand_hex);document.querySelector('meta[name=theme-color]')?.setAttribute('content',v.brand_hex);G.toast('Branding saved','ok');await showBranding(el);}catch(e){G.err(e);}
 };
 el.querySelector('[data-brand-reset]').onclick=async()=>{
  if(!await G.confirm('Reset brand fields to the original operator values shown when this screen was opened?',{ok:'Reset'}))return;
  const vals={appName:o.app_name||'',tagline:o.tagline||'',helpline:o.helpline_number||'',supportEmail:o.support_email||'',brandColor:o.brand_hex||'#2563EB',fontFamily:o.font_family||'Poppins',pwaName:b.pwa_name||'',pwaShortName:b.pwa_short_name||''};
  Object.entries(vals).forEach(([key,v])=>{if(field(key))field(key).value=v;});
  el.querySelectorAll('[data-scheme]').forEach(x=>x.classList.toggle('active',x.dataset.scheme===(b.color_scheme||'Light')));update();G.toast('Unsaved changes discarded');
 };
 el.querySelector('[data-brand-preview]').onclick=()=>{
  const v=current();const temp={operator:{...o,app_name:v.app_name,tagline:v.tagline,helpline_number:v.helpline_number,support_email:v.support_email,brand_hex:v.brand_hex},branding:b};
  modal({title:'Brand preview',subtitle:'This preview does not change live settings',body:`<div class="stp-preview-modal">${brandPreview(temp)}</div>`,wide:true});
 };
 el.querySelectorAll('[data-asset-pick]').forEach(btn=>btn.onclick=()=>el.querySelector(`[data-asset-file="${btn.dataset.assetPick}"]`)?.click());
 el.querySelectorAll('[data-asset-file]').forEach(inp=>inp.onchange=async()=>{
  const file=inp.files?.[0];if(!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))return G.toast('Select a PNG, JPEG or WebP image','bad');
  if(file.size>1024*1024)return G.toast('Image must be under 1 MB','bad');
  try{const uri=await new Promise((res,rej)=>{const reader=new FileReader();reader.onload=()=>res(reader.result);reader.onerror=rej;reader.readAsDataURL(file);});
   await G.post(`/settings/branding/assets/${inp.dataset.assetFile}`,{data_url:uri});if(inp.dataset.assetFile==='mobile_logo'){G.operator={...(G.operator||{}),logo_url:uri};const logo=document.querySelector('header .brand');if(logo)logo.innerHTML=`<img src="${escV(uri)}" alt="Operator logo">`;}G.toast('Asset saved','ok');await showBranding(el);
  }catch(e){G.err(e);}
 });
 el.querySelectorAll('[data-asset-remove]').forEach(btn=>btn.onclick=async()=>{
  if(!await G.confirm('Remove the uploaded asset?',{danger:true,ok:'Remove'}))return;
  try{await G.del(`/settings/branding/assets/${btn.dataset.assetRemove}`);G.toast('Asset removed','ok');await showBranding(el);}catch(e){G.err(e);}
 });
}

async function showConfiguration(el,sub='notifications'){
 const [settings,ui,notifications]=await Promise.all([G.get('/settings'),G.get('/settings/configuration'),G.get('/notifications/subscriptions')]);
 const items=[['notifications','Notifications'],['alerts','Alerts & escalation'],['calling','Calling & GPS'],['bot','Bot settings']];
 let html=drawTitle('Configuration','','','sliders')+tabbar(items.map(([key,v])=>[key,v,`#/settings/configuration/${key}`]),sub);
 if(sub==='notifications'){
  html+=card('Notification subscriptions',`<p class="stp-muted">Subscriptions are saved with the existing notification service. Actual delivery requires channel integrations.</p><div class="stp-savebar"><button class="stp-btn primary" type="button" data-notification-add>＋ Add subscription</button></div><div class="stp-simple-list">${(notifications.subscriptions||[]).map(n=>`<div class="stp-simple-row"><div><b>${escV(n.display_name||n.subscriber_ref||'Subscriber')}</b><small>${escV(n.channel)} · ${(n.event_types||[]).map(escV).join(', ')}</small></div><div class="stp-actions"><button class="stp-switch ${n.enabled?'on':''}" data-notification-toggle="${n.id}" type="button"></button><button class="stp-icon-btn delete" data-notification-delete="${n.id}" type="button">${icon('trash')}</button></div></div>`).join('')||'<p>No subscriptions configured.</p>'}</div>`,'mail');
 }else if(sub==='alerts'){
  html+=card('Alerts & escalation',`<div class="stp-form-grid">${input('quiet_hours_enabled','Enable quiet hours',ui.quiet_hours_enabled,{type:'checkbox'})}${input('escalation_minutes','Escalate after (minutes)',ui.escalation_minutes,{type:'number',min:1,max:240})}${input('quiet_start','Quiet hours start',ui.quiet_start||'22:00',{type:'time'})}${input('quiet_end','Quiet hours end',ui.quiet_end||'07:00',{type:'time'})}</div><div class="stp-savebar"><button class="stp-btn primary" data-config-save>Save alert preferences</button></div><p class="stp-muted">Escalation preferences are stored for future event-processor wiring.</p>`,'activity');
 }else if(sub==='calling'){
  const op=settings.operator||{};
  const flags=[['cloud_calling_enabled','Cloud calling'],['is_number_masking_enabled','Number masking'],['direct_to_vehicle','Route passenger calls to vehicle phone'],['is_driver_gps_required','Require driver phone GPS'],['vehicle_number_as_driver_contact','Share vehicle number as driver contact'],['driver_personal_numbers_enabled','Allow driver personal numbers']];
  html+=card('Calling and GPS',`${input('outgoing_number','Outgoing number',op.outgoing_number||'')}<div class="stp-check-grid">${flags.map(([key,label])=>input(key,label,!!op[key],{type:'checkbox'})).join('')}</div><div class="stp-savebar"><button class="stp-btn primary" data-calling-save>Save calling preferences</button></div><p class="stp-muted">A cloud-calling provider is not connected. Saving a preference does not connect or place calls.</p>`,'calls');
 }else{
  html+=card('Sarathi & bot settings',`<div class="stp-form-grid">${input('bot_tone','Bot response style',ui.bot_tone||'professional',{type:'select',values:[['professional','Professional'],['friendly','Friendly'],['concise','Concise']]})}${input('bot_handoff','Allow manual handoff',ui.bot_handoff,{type:'checkbox'})}</div><div class="stp-savebar"><button class="stp-btn primary" data-config-save>Save bot preferences</button></div><p class="stp-muted">Bot settings are saved as UI configuration. Runtime AI integration must consume this configuration.</p>`,'spark');
 }
 el.innerHTML=`<div class="stp-shell">${html}</div>`;
 el.querySelector('[data-config-save]')?.addEventListener('click',async()=>{
  const v=values(el.querySelector('.stp-brand-card'));try{await G.put('/settings/configuration',{...ui,...v});G.toast('Configuration saved','ok');}catch(e){G.err(e);}
 });
 el.querySelector('[data-calling-save]')?.addEventListener('click',async()=>{
  const v=values(el.querySelector('.stp-brand-card'));try{await G.put('/settings/operator',v);G.toast('Calling preferences saved','ok');}catch(e){G.err(e);}
 });
 el.querySelector('[data-notification-add]')?.addEventListener('click',()=>{
  modal({title:'Add notification subscription',wide:true,
   body:`<div class="stp-form-grid">${input('display_name','Subscriber name','',{required:true})}${input('subscriber_type','Subscriber type','group',{type:'select',values:[['group','Group'],['user','User'],['branch','Branch']]})}${input('subscriber_ref','Subscriber ID','')}${input('channel','Channel','push',{type:'select',values:(notifications.channels||[]).map(x=>[x,x.toUpperCase()])})}</div><h4 class="stp-section-subtitle">Events</h4><div class="stp-check-grid">${(notifications.events||[]).map(event=>`<label class="stp-check-label"><input type="checkbox" data-event="${escV(event)}">${escV(event)}</label>`).join('')}</div>`,
   onSave:async(v,outer)=>{const event_types=[...outer.querySelectorAll('[data-event]:checked')].map(x=>x.dataset.event);await G.post('/notifications/subscriptions',{...v,event_types});G.toast('Subscription added','ok');await showConfiguration(el,sub);}
  });
 });
 el.querySelectorAll('[data-notification-toggle]').forEach(btn=>btn.onclick=async()=>{const row=notifications.subscriptions.find(x=>String(x.id)===btn.dataset.notificationToggle);try{await G.put(`/notifications/subscriptions/${row.id}`,{enabled:!row.enabled});await showConfiguration(el,sub);}catch(e){G.err(e);}});
 el.querySelectorAll('[data-notification-delete]').forEach(btn=>btn.onclick=async()=>{if(await G.confirm('Delete this subscription?',{danger:true,ok:'Delete'})){try{await G.del(`/notifications/subscriptions/${btn.dataset.notificationDelete}`);await showConfiguration(el,sub);}catch(e){G.err(e);}}});
}

async function showWhatsApp(el){
 const data=await G.get('/settings/whatsapp');
 let html=drawTitle('WhatsApp','','','chat')+note('Set up the number and message templates your team plans to use. No WhatsApp Business API connection exists in this demo environment.');
 html+=card('Business number',`<div class="stp-form-grid">${input('display_name','Business display name',data.display_name||'')}${input('business_number','WhatsApp business number',data.business_number||'',{placeholder:'+91 ...'})}</div><p class="stp-muted">Connection status: <b>Not connected</b>. Verification and message delivery require a provider-backed integration.</p><div class="stp-savebar"><button class="stp-btn primary" data-wa-save>Save number details</button></div>`,'chat');
 html+=card('Message templates',`<div class="stp-savebar"><button class="stp-btn primary" data-wa-add>＋ New template</button></div><div class="stp-simple-list">${(data.templates||[]).map((t,i)=>`<div class="stp-simple-row"><div><b>${escV(t.name)} <span class="stp-mode-chip">${escV(t.category||'utility')}</span></b><small>${escV(t.message)}</small></div><div class="stp-actions"><button class="stp-icon-btn" data-wa-edit="${i}">${icon('edit')}</button><button class="stp-icon-btn delete" data-wa-delete="${i}">${icon('trash')}</button></div></div>`).join('')||'<p>Set up boarding reminders, delays and ticket-resend templates here.</p>'}</div>`,'mail');
 el.innerHTML=`<div class="stp-shell">${html}</div>`;
 el.querySelector('[data-wa-save]').onclick=async()=>{const v=values(el.querySelector('.stp-brand-card'));try{await G.put('/settings/whatsapp',{...data,...v});G.toast('WhatsApp settings saved (not connected)','ok');}catch(e){G.err(e);}};
 const templateModal=(index)=>{
  const t=index==null?{name:'',category:'utility',message:''}:data.templates[index];
  modal({title:index==null?'New WhatsApp template':'Edit WhatsApp template',wide:true,body:`<div class="stp-form-grid">${input('name','Template name',t.name,{required:true})}${input('category','Category',t.category||'utility',{type:'select',values:[['utility','Utility'],['marketing','Marketing'],['authentication','Authentication']]})}<div class="stp-grid-span">${input('message','Message text',t.message,{type:'textarea'})}</div></div>`,
  onSave:async v=>{if(!v.message.trim())throw new Error('Message text required');const list=[...(data.templates||[])];if(index==null)list.push(v);else list[index]=v;await G.put('/settings/whatsapp',{...data,templates:list});G.toast('Template saved','ok');await showWhatsApp(el);}});
 };
 el.querySelector('[data-wa-add]').onclick=()=>templateModal(null);
 el.querySelectorAll('[data-wa-edit]').forEach(btn=>btn.onclick=()=>templateModal(Number(btn.dataset.waEdit)));
 el.querySelectorAll('[data-wa-delete]').forEach(btn=>btn.onclick=async()=>{if(await G.confirm('Remove this template?',{danger:true,ok:'Remove'})){try{await G.put('/settings/whatsapp',{...data,templates:data.templates.filter((x,i)=>i!==Number(btn.dataset.waDelete))});await showWhatsApp(el);}catch(e){G.err(e);}}});
}

async function showLoyalty(el,sub='miles'){
 const data=await G.get('/settings');
 const tabs=[['miles','Miles rules'],['day-rates','Day rates'],['tiers','Tiers'],['blackouts','Blackout dates'],['upgrades','Seat upgrades']];
 let html=drawTitle('Loyalty Program','','','spark')+tabbar(tabs.map(([k,t])=>[k,t,`#/settings/loyalty-program/${k}`]),sub);
 if(sub==='miles'){
  const m=data.miles||{};
  html+=card('Miles redemption',`<div class="stp-form-grid">${input('is_active','Enable loyalty program',!!m.is_active,{type:'checkbox'})}${input('miles_to_rupee_ratio','₹ per mile',m.miles_to_rupee_ratio??0.1,{type:'number',min:0})}${input('max_discount_percent','Maximum discount (%)',m.max_discount_percent??30,{type:'number',min:0,max:100})}${input('min_redeemable_miles','Minimum redeemable miles',m.min_redeemable_miles??0,{type:'number',min:0})}${input('min_booking_amount','Minimum booking amount',m.min_booking_amount??0,{type:'number',min:0})}</div><div class="stp-savebar"><button class="stp-btn primary" data-save-miles>Save miles rules</button></div>`,'spark');
 }else if(sub==='day-rates'){
  const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  html+=card('Redemption by day',`<div class="stp-simple-list">${days.map((day,i)=>{const row=(data.day_rates||[]).find(x=>x.day_of_week===i);return `<div class="stp-simple-row"><b>${day}</b><label>Redemption rate (%) <input class="stp-input stp-inline-number" type="number" min="0" max="1000" data-day-rate="${i}" value="${row?.redemption_rate??100}"></label></div>`;}).join('')}</div><div class="stp-savebar"><button class="stp-btn primary" data-save-dayrates>Save day rates</button></div>`,'calendar');
 }else if(sub==='tiers'){
  html+=card('Tier multipliers',`<div class="stp-simple-list">${(data.tier_multipliers||[]).map((t,i)=>`<div class="stp-simple-row"><b>${escV(t.tier_name)}</b><label>Multiplier <input class="stp-input stp-inline-number" type="number" step="0.05" min="0" max="100" value="${t.multiplier}" data-tier="${i}"></label></div>`).join('')}</div><div class="stp-savebar"><button class="stp-btn primary" data-save-tiers>Save tier multipliers</button></div>`,'users');
 }else if(sub==='blackouts'){
  html+=card('Blackout dates',`<div class="stp-form-grid">${input('blackout','Add blocked date','',{type:'date'})}<button class="stp-btn primary" data-add-blackout>＋ Add date</button></div><div class="stp-simple-list">${(data.blackout_dates||[]).map((it,i)=>`<div class="stp-simple-row"><b>${fdate(it.date||it)}</b><button class="stp-icon-btn delete" data-blackout-delete="${i}" type="button">${icon('trash')}</button></div>`).join('')||'<p class="stp-muted">No blackout dates configured.</p>'}</div>`,'calendar');
 }else{
  const u=data.seat_upgrade_policy||{};
  html+=card('Seat upgrade policy',`<div class="stp-form-grid">${input('enabled','Offer paid seat upgrades',!!u.enabled,{type:'checkbox'})}${input('auto_apply_when_free','Auto-upgrade when seat is free',!!u.auto_apply_when_free,{type:'checkbox'})}${input('default_consent','Default consent',u.default_consent||'opt_in',{type:'select',values:[['opt_in','Opt in'],['opt_out','Opt out']]})}${input('max_offers_per_trip','Max offers per trip',u.max_offers_per_trip||0,{type:'number',min:0})}</div><h4 class="stp-section-subtitle">Offer windows</h4><div class="stp-simple-list">${(u.windows||[]).map((w,i)=>`<div class="stp-simple-row"><div><b>${escV(w.name)}</b><small>Start: ${w.start} minutes before departure · ${(w.notification_channels||[]).join(', ')}</small></div><button class="stp-icon-btn delete" data-window-delete="${i}">${icon('trash')}</button></div>`).join('')}</div><div class="stp-savebar"><button class="stp-btn" data-add-window>＋ Add window</button><button class="stp-btn primary" data-save-upgrades>Save upgrades</button></div>`,'badge');
 }
 el.innerHTML=`<div class="stp-shell">${html}</div>`;
 async function save(key,payload){try{await G.put(`/settings/${key}`,payload);G.toast('Loyalty settings saved','ok');await showLoyalty(el,sub);}catch(e){G.err(e);}}
 el.querySelector('[data-save-miles]')?.addEventListener('click',()=>save('miles',values(el.querySelector('.stp-brand-card'))));
 el.querySelector('[data-save-dayrates]')?.addEventListener('click',()=>save('day_rates',[...el.querySelectorAll('[data-day-rate]')].map(x=>({day_of_week:Number(x.dataset.dayRate),redemption_rate:Number(x.value)||0}))));
 el.querySelector('[data-save-tiers]')?.addEventListener('click',()=>save('tier_multipliers',(data.tier_multipliers||[]).map((t,i)=>({...t,multiplier:Number(el.querySelector(`[data-tier="${i}"]`)?.value)||0}))));
 el.querySelector('[data-add-blackout]')?.addEventListener('click',()=>{const date=el.querySelector('[name="blackout"]')?.value;if(!date)return G.toast('Choose a date','bad');const current=(data.blackout_dates||[]).map(x=>x.date||x);if(!current.includes(date))current.push(date);save('blackout_dates',current);});
 el.querySelectorAll('[data-blackout-delete]').forEach(btn=>btn.onclick=()=>save('blackout_dates',(data.blackout_dates||[]).filter((x,i)=>i!==Number(btn.dataset.blackoutDelete))));
 el.querySelector('[data-save-upgrades]')?.addEventListener('click',()=>save('seat_upgrade_policy',{...data.seat_upgrade_policy,...values(el.querySelector('.stp-brand-card'))}));
 el.querySelector('[data-window-delete]')?.addEventListener('click',()=>save('seat_upgrade_policy',{...data.seat_upgrade_policy,windows:(data.seat_upgrade_policy.windows||[]).filter((x,i)=>i!==Number(el.querySelector('[data-window-delete]').dataset.windowDelete))}));
 el.querySelector('[data-add-window]')?.addEventListener('click',()=>modal({title:'Add upgrade offer window',body:`<div class="stp-form-grid">${input('name','Window name','T-30m',{required:true})}${input('start','Minutes before departure',30,{type:'number',min:1})}${input('channels','Notification channels','whatsapp,sms')}</div>`,onSave:async v=>{
  await G.put('/settings/seat_upgrade_policy',{...data.seat_upgrade_policy,windows:[...(data.seat_upgrade_policy.windows||[]),{name:v.name,start:Number(v.start),notification_channels:v.channels.split(',').map(x=>x.trim()).filter(Boolean)}]});G.toast('Window saved','ok');await showLoyalty(el,sub);
 }}));
}

async function showSwitchUser(el){
 const users=await G.get('/auth/switchable-users');
 const current=G.viewAs||'';
 const html=drawTitle('Switch User','','','switchUser')+note('Owner and admin users can preview the application with another active user’s permissions. Switch back to your own account at any time.')+
 card('View app as',`<div class="stp-form-grid">${input('user_id','User',current,{type:'select',values:[['','— My own account —'],...users.map(u=>[String(u.id),`${u.name} · ${u.role}`])]})}</div><div class="stp-savebar"><button class="stp-btn primary" data-switch-confirm>Switch user</button></div><p class="stp-muted">The backend applies the selected user’s permissions on each request. This does not create a new login session.</p>`,'switchUser');
 el.innerHTML=`<div class="stp-shell">${html}</div>`;
 el.querySelector('[data-switch-confirm]').onclick=()=>{
  const id=el.querySelector('[name="user_id"]').value;
  G.viewAs=id;if(id)localStorage.setItem('viewAs',id);else localStorage.removeItem('viewAs');
  location.reload();
 };
}
async function showPassword(el){
 const html=drawTitle('Change Password','','','lock')+note('This GDS signs in using one-time passwords (OTP), not a reusable account password.')+
 card('Account security',`<p class="stp-muted">Password change is not available because no password credential is stored for this account. Your sign-in is protected by a phone OTP; request a new OTP when signing in.</p><div class="stp-savebar"><a class="stp-btn primary" href="#/settings/my-devices">${icon('phoneDevice')} Manage signed-in devices</a><button type="button" class="stp-btn" data-logout-account>Sign out</button></div>`,'shield');
 el.innerHTML=`<div class="stp-shell">${html}</div>`;
 el.querySelector('[data-logout-account]').onclick=async()=>{if(!await G.confirm('Sign out of this account?',{ok:'Sign out'}))return;await G.post('/auth/logout').catch(()=>{});localStorage.removeItem('token');location.hash='#/login';location.reload();};
}
async function showDevices(el){
 const {sessions,has_legacy_session}=await G.get('/auth/sessions');
 const html=drawTitle('My devices','','','phoneDevice')+note('Active sign-in sessions for your account. Sign out devices you do not recognize.')+
 card('Signed-in devices',`<div class="stp-simple-list">${sessions.map(s=>`<div class="stp-simple-row"><div><b>${escV(s.user_agent||'Unknown browser')}${s.current?' · This device':''}</b><small>Signed in: ${DATES(s.created_at)} · Last seen: ${DATES(s.last_seen)}</small></div><button class="stp-btn ${s.current?'':'stp-danger'}" type="button" data-revoke-session="${s.id}">${s.current?'Sign out here':'Sign out device'}</button></div>`).join('')||'<p>No tracked sessions. Sign in again to register this device.</p>'}${has_legacy_session?'<p class="stp-muted">This is a legacy session; sign out and in again to enable device management.</p>':''}</div>`,'phoneDevice');
 el.innerHTML=`<div class="stp-shell">${html}</div>`;
 el.querySelectorAll('[data-revoke-session]').forEach(btn=>btn.onclick=async()=>{if(!await G.confirm('Sign out this device?',{danger:true,ok:'Sign out'}))return;try{
  const data=await G.del(`/auth/sessions/${btn.dataset.revokeSession}`);if(data.current){localStorage.removeItem('token');location.reload();}else{G.toast('Device signed out','ok');await showDevices(el);}
 }catch(e){G.err(e);}});
}
async function showAbout(el){
 const html=drawTitle('About','','','info')+note('About this GDS installation, update status and product information.')+
 card('Application details',`<div class="stp-simple-list"><div class="stp-simple-row"><b>Product</b><span>JourneyOS GDS · SaveTrip-inspired UI</span></div><div class="stp-simple-row"><b>UI build</b><span>Settings v16</span></div><div class="stp-simple-row"><b>Server</b><span>Node.js / Express</span></div><div class="stp-simple-row"><b>Updated</b><span>21 November 2026</span></div></div><div class="stp-savebar"><button class="stp-btn primary" data-about-reload>${icon('reset')} Check for updates</button></div><p class="stp-muted">Checks reload local assets; a hosted release feed is not connected.</p>`,'info');
 el.innerHTML=`<div class="stp-shell">${html}</div>`;
 el.querySelector('[data-about-reload]').onclick=()=>location.reload();
}

function headerMenus(){
 const current=location.hash.split('?')[0].replace(/^#\//,'').split('/');
 const selected=localStorage.getItem('stp_language')||'English';
 const languages=(R.LANGUAGES||['English']);
 const settings=MENU.map(item=>{
  const active=item.key===current[1];
  return `<a class="stp-settings-link ${active?'active':''}" data-settings-link="${escV(item.key)}" ${item.key==='switch-user'?'data-switch-user':''} href="#/settings/${escV(item.key)}"><span class="stp-settings-link-icon ${escV(item.color||'gray')}">${icon(item.icon)}</span><span><b>${escV(item.label)}</b><small>${escV(item.desc)}</small></span></a>`;
 }).join('');
 return {
  language:`<div class="stp-pop stp-lang-pop" data-lang-pop hidden role="menu">${languages.map(v=>`<button class="stp-lang-item ${selected===v?'active':''}" data-language-option="${escV(v)}" type="button" role="menuitem"><span>${escV(v)}</span><span class="tick">${icon('check')}</span></button>`).join('')}</div>`,
  settings:`<div class="stp-pop stp-settings-pop" data-settings-pop hidden role="menu"><div class="stp-settings-pop-head"><b>${escV(G.user?.phone||'Operator Account')}</b><span>Operator Account</span></div><div class="stp-settings-pop-body"><div class="stp-settings-label">BUSINESS SETTINGS</div>${settings}<button type="button" class="stp-settings-link stp-logout" data-settings-logout><span class="stp-settings-link-icon gray">${icon('lock')}</span><span><b>Sign out</b><small>End the current session</small></span></button></div></div>`
 };
}
function syncHeader(){
 const hash=location.hash.split('?')[0];
 let top='';
 if(hash.startsWith('#/settings'))top='';
 else if(hash.startsWith('#/trips'))top='trips';
 else if(hash.startsWith('#/chats'))top='chats';
 else if(hash.startsWith('#/calls'))top='calls';
 else top='gds';
 document.querySelectorAll('[data-top]').forEach(a=>{
  const on=a.dataset.top===top;
  a.dataset.active=String(on);a.classList.toggle('iconic-tab-pill--active',on);
 });
 document.querySelectorAll('[data-settings-link]').forEach(a=>a.classList.toggle('active',hash.startsWith(`#/settings/${a.dataset.settingsLink}`)));
}
async function screen(el,p){
 const LEGACY={users:'team-access/office-staff',roles:'team-access/access',branches:'team-access/branches',notifications:'configuration/notifications',calling:'configuration/calling',loyalty:'loyalty-program/miles',upgrades:'loyalty-program/upgrades'};
 if(LEGACY[p[0]]){location.replace('#/settings/'+LEGACY[p[0]]);return;}
 const section=p[0]||'team-access';const sub=p[1]||'office-staff';
 el.className='stp-root';el.innerHTML='<div class="stp-shell"><div class="stp-empty-panel"><h3>Loading settings…</h3></div></div>';
 try{
  if(section==='team-access')await showTeam(el,sub);
  else if(section==='branding')await showBranding(el);
  else if(section==='configuration')await showConfiguration(el,p[1]||'notifications');
  else if(section==='whatsapp')await showWhatsApp(el);
  else if(section==='loyalty-program')await showLoyalty(el,p[1]||'miles');
  else if(section==='switch-user')await showSwitchUser(el);
  else if(section==='change-password')await showPassword(el);
  else if(section==='my-devices')await showDevices(el);
  else if(section==='about')await showAbout(el);
  else await showTeam(el,'office-staff');
  syncHeader();
 }catch(e){el.innerHTML=`<div class="stp-shell">${drawTitle('Settings')}${emptyPanel('Unable to load settings',e.message,'info')}<button class="stp-btn" data-retry-settings>Retry</button></div>`;el.querySelector('[data-retry-settings]')?.addEventListener('click',()=>screen(el,p));G.err(e);}
}
G.renderHeaderMenus=headerMenus;
G.syncHeaderParity=syncHeader;
G.screens.settings=screen;
G.settingsCompleteVersion='v16';
})();
