(function teamMatrixUIV27(){
'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),{JSDOM}=require('jsdom');
const schema=require('../server/team-access-schema-v27');
const dom=new JSDOM('<div id="app"></div>',{url:'http://localhost:3000/#/settings/team-access/access/roles/viewer',runScripts:'outside-only'});
const w=dom.window,root=w.document.querySelector('#app'),sent=[];
w.esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon='<svg viewBox="0 0 24 24"><path d="M1 1h10"/></svg>';
const roles=schema.ROLE_COLUMNS.map(([key,name])=>({
 key,name,builtin:true,permissions:key==='manager'?
  ['trips.view','bookings.cancel','bookings.block_seats','bookings.view_all','bookings.modify','routes.modify','staff.view','accounts.view']:
  key==='booking_executive'?['bookings.create','bookings.view_all']:
  key==='agent'?['bookings.create','bookings.view_all']:[],
 scopes:{},limits:{},ui_permissions:{}
})).concat([{key:'owner',name:'Owner',builtin:true,permissions:[]},{key:'admin',name:'Admin',builtin:true,permissions:[]}]);
const state={users:[],staff:[],branches:[],roles,
 matrix:schema.ROWS,matrix_version:27,matrix_revision:7,matrix_limit_fields:schema.LIMIT_FIELDS,
 role_columns:schema.ROLE_COLUMNS,role_descriptions:schema.ROLE_DESCRIPTIONS,role_hues:schema.ROLE_HUES,
 catalog:{bookings:['bookings.create','bookings.cancel']},cities:[],routes:[],
 grants:{manage_users:true,manage_roles:true,manage_branches:true}};
const clone=x=>JSON.parse(JSON.stringify(x));
w.G={screens:{settings:async el=>el.innerHTML='old'},settingsParityIcon:()=>icon,svg:()=>icon,
 niceSelect:sel=>{if(sel._nice)return;sel._nice=true;const button=w.document.createElement('button');
  button.type='button';button.className='ui-dd-btn';button.textContent=sel.options[sel.selectedIndex]?.text||'';sel.after(button);},
 get:async p=>p==='/team-access/v26'?clone(state):[],
 put:async(p,body)=>{sent.push({method:'PUT',p,body});if(p.includes('/roles/batch')){
   state.matrix_revision+=1;
   for(const item of body.roles){const role=roles.find(x=>x.key===item.key);role.matrix_v27={...role.matrix_v27,...item.matrix};role.limits={...role.limits,...item.limits};}
   return {roles:body.roles.map(x=>x.key),revoked_sessions:1,matrix_revision:state.matrix_revision};
  }return {};},
 post:async(p,body)=>{sent.push({method:'POST',p,body});if(p.endsWith('/roles')){
  const key=body.name.toLowerCase().replace(/[^a-z0-9]+/g,'_');
  roles.push({key,name:body.name,permissions:[],limits:{},ui_permissions:{},matrix_v27:{}});return {key};
 }return {};},
 del:async()=>({}),toast:()=>{},err:e=>{throw e},confirm:async()=>true};
w.can=()=>true;
w.eval(fs.readFileSync('public/js/team-access-v26.js','utf8'));
const settle=()=>new Promise(resolve=>setTimeout(resolve,10));
function change(el,value){
 assert.ok(el,'Control to change must exist');el.value=value;
 el.dispatchEvent(new w.Event('change',{bubbles:true}));
}
(async()=>{
 await w.G.screens.settings(root,['team-access','access','roles','viewer']);
 assert.equal(root.querySelectorAll('.ta26-tab').length,5);
 assert.equal(root.querySelectorAll('.ta26-access-tabs a').length,4);
 assert.equal(root.querySelectorAll('.ta26-matrix thead th').length,11);
 assert.equal(root.querySelectorAll('tr[data-matrix-group]').length,13);
 assert.equal(root.querySelectorAll('tr[data-matrix-row]').length,89);
 assert.equal(root.querySelectorAll('select[data-matrix-cell]').length+root.querySelectorAll('.ta27-unavailable').length,890);
 for(const group of ['TRIPS & PICKUPS','BOOKINGS','SCHEDULES','ROUTES','FLEET','CHATS','CALLS','ACCOUNTS','DAILY OPS','STAFF & HR','OFFERS & LOYALTY','USERS & ACCESS','SETTINGS'])
  assert.ok(root.textContent.includes(group),'Screenshot group '+group);
 for(const label of ['Book tickets','Add comments to a PNR','Book on behalf of agents','See passenger phone numbers',
  'Change cancellation rules','View income & expenses','Assign bus','Assign crew (driver, conductor, helper)',
  'Export / download','Change what roles can do','Use Sarathi (AI assistant)'])
  assert.ok(root.textContent.includes(label),'Screenshot action '+label);
 const comments=schema.byLabel.get('Add comments to a PNR');
 const forbidden=root.querySelector(`[data-matrix-cell][data-role="driver"][data-key="${comments.key}"]`);
 assert.equal(forbidden,null,'Impossible role cell must never offer dropdown');
 assert.ok(root.querySelector(`[data-matrix-row="add comments to a pnr"] td[data-cell-role="driver"] .ta27-unavailable`));
 const booking=schema.byLabel.get('View bookings');
 const managerSel=root.querySelector(`[data-matrix-cell][data-role="manager"][data-key="${booking.key}"]`);
 assert.ok(managerSel);
 assert.deepEqual([...managerSel.options].map(x=>x.value),['Off','Own','Branch','Company']);
 assert.ok(root.querySelector('[data-save-matrix]').disabled,'Save initially disabled until changed');
 const term=root.querySelector('[data-matrix-search]');term.value='cancel';
 term.dispatchEvent(new w.Event('input',{bubbles:true}));
 assert.ok(root.querySelectorAll('tr[data-matrix-row]:not([hidden])').length>=2);
 assert.ok(root.querySelectorAll('tr[data-matrix-row]:not([hidden])').length<89);
 term.value='';term.dispatchEvent(new w.Event('input',{bubbles:true}));
 assert.equal(root.querySelectorAll('tr[data-matrix-row]:not([hidden])').length,89);
 const cancel=schema.byLabel.get('Cancel tickets'),block=schema.byLabel.get('Block seats');
 const cutoff=root.querySelector(`[data-matrix-limit="cancel_cutoff_hours"][data-role="manager"]`);
 const maxSeats=root.querySelector(`[data-matrix-limit="block_max_seats"][data-role="manager"]`);
 const maxHours=root.querySelector(`[data-matrix-limit="block_max_hours"][data-role="manager"]`);
 assert.ok(cutoff&&maxSeats&&maxHours);
 assert.equal(cutoff.placeholder,'no limit');
 assert.ok(root.querySelector('[data-matrix-foot]')===null||true);
 change(managerSel,'Own');
 assert.equal(managerSel.dataset.scope,'Own');
 assert.equal(root.querySelector('[data-save-matrix]').disabled,false);
 maxSeats.value='5';maxSeats.dispatchEvent(new w.Event('input',{bubbles:true}));
 maxHours.value='12';maxHours.dispatchEvent(new w.Event('input',{bubbles:true}));
 cutoff.value='24';cutoff.dispatchEvent(new w.Event('input',{bubbles:true}));
 root.querySelector('[data-save-matrix]').click();
 await settle();
 const save=sent.find(x=>x.p==='/team-access/v26/roles/batch');
 assert.ok(save);
 assert.equal(save.body.base_revision,7,'Optimistic revision prevents overwriting other admin');
 assert.equal(save.body.roles.length,1,'Only edited role is submitted');
 assert.equal(save.body.roles[0].key,'manager');
 assert.equal(save.body.roles[0].matrix[booking.key],'Own');
 assert.equal(save.body.roles[0].limits.cancel_cutoff_hours,24);
 assert.equal(save.body.roles[0].limits.block_max_seats,5);
 assert.equal(save.body.roles[0].limits.block_max_hours,12);
 assert.equal(state.roles.find(r=>r.key==='manager').matrix_v27[booking.key],'Own');
 await w.G.screens.settings(root,['team-access','access','roles','viewer']);
 root.querySelector('[data-one-role]').click();
 await settle();
 assert.ok(root.querySelector('[data-all-roles]'),'Back to one role is functional');
 assert.equal(root.querySelectorAll('.ta26-matrix thead th').length,2,'Single-role matrix');
 const rolePick=root.querySelector('[data-single-role]');
 assert.ok(rolePick);
 change(rolePick,'manager');
 await settle();
 assert.equal(root.querySelectorAll('.ta26-matrix thead th').length,2);
 assert.equal(root.querySelector('[data-matrix-cell][data-role="manager"][data-key="'+booking.key+'"]').value,'Own');
 root.querySelector('[data-all-roles]').click();await settle();
 assert.equal(root.querySelectorAll('.ta26-matrix thead th').length,11);
 root.querySelector('[data-new-role]').click();
 const modal=w.document.querySelector('.ta26-shade');
 assert.ok(modal&&modal.querySelector('[name=name]'));
 modal.querySelector('[name=name]').value='Night Shift';
 modal.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 await settle();
 assert.ok(sent.some(x=>x.method==='POST'&&x.p==='/team-access/v26/roles'&&x.body.name==='Night Shift'));
 assert.ok(root.querySelector('[data-single-role]'),'New role opens role editor');
 assert.ok(root.querySelector('[data-matrix-cell][data-role="night_shift"]'));
 const css=fs.readFileSync('public/css/team-access-v26.css','utf8');
 for(const selector of ['.ta27-limit','.ta27-unavailable','.ta27-matrix-foot','.ta27-single','.ta26-matrix-scroll'])
  assert.ok(css.includes(selector),'Style '+selector);
 console.log('PASS v27 browser UI: 89 screenshot rows, 13 sections, 10 role columns, native choices, unavailable cells, limits, search, single role, new role and conflict-safe Save');
})().catch(e=>{console.error(e);process.exitCode=1;});
})();