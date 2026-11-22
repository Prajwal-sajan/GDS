(function teamAccessUITestV26(){
'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),{JSDOM}=require('jsdom');
const schema=require('../server/team-access-schema-v27');
const dom=new JSDOM('<body><div id="app"></div></body>',{url:'http://localhost:3000/#/settings/team-access/agents',runScripts:'outside-only'});
const w=dom.window,root=w.document.getElementById('app');
w.esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const symbol='<svg viewBox="0 0 24 24"><path d="M1 1h10"/></svg>';
let selects=0;
const actions=[];
const roles=[...schema.ROLE_COLUMNS.map(([key,name])=>({key,name,permissions:key==='driver'?['trips.view','trips.location']:key==='agent'?['bookings.create']:['trips.view','bookings.view_all'],builtin:true})),
 {key:'owner',name:'Owner',permissions:['iam.manage_roles','iam.manage_users','settings.view'],builtin:true},
 {key:'admin',name:'Admin',permissions:['iam.manage_roles','iam.manage_users'],builtin:true}];
const original={
 users:[{id:100,name:'Office Manager',phone:'9999999991',role:'manager',status:'ACTIVE',language:'English',
   branch_id:null,created_at:'2026-11-01T07:00:00Z',route_ids:[],extra_permissions:[],denied_permissions:[]},
 {id:101,name:'Fleet Driver',phone:'9999999992',role:'driver',status:'ACTIVE',language:'English',
   last_login:'2026-11-20T10:20:00Z',login_count:2,created_at:'2026-11-01T07:00:00Z'},
 {id:102,name:'Demo Agent',phone:'9999999993',role:'agent',status:'ACTIVE',language:'English',
   agent_category:'agent',mode:'Online',created_at:'2026-11-01T07:00:00Z'},
 {id:103,name:'Disabled Agent',phone:'9999999994',role:'agent',status:'INACTIVE',language:'English',
   agent_category:'master_agent',mode:'Offline',created_at:'2026-11-01T07:00:00Z'}],
 staff:[],branches:[],roles,catalog:{trips:['trips.view','trips.location'],bookings:['bookings.create','bookings.view_all']},
 routes:[{id:1,name:'Bengaluru — Hyderabad'},{id:2,name:'Hyderabad — Bengaluru'}],
 cities:[{id:1,name:'Bengaluru'},{id:2,name:'Hyderabad'}],
 matrix:schema.ROWS,matrix_version:27,matrix_revision:0,matrix_limit_fields:schema.LIMIT_FIELDS,role_columns:schema.ROLE_COLUMNS,
 role_descriptions:schema.ROLE_DESCRIPTIONS,role_hues:schema.ROLE_HUES,
 grants:{manage_users:true,manage_roles:true,manage_branches:true}
};
const clone=x=>JSON.parse(JSON.stringify(x));
w.G={screens:{settings:async(el)=>{el.innerHTML='old';}},settingsParityIcon:()=>symbol,svg:()=>symbol,
 niceSelect:sel=>{if(sel._nice)return;sel._nice=true;selects++;
  const b=w.document.createElement('button');b.type='button';b.className='ui-dd-btn';b.textContent=sel.options[sel.selectedIndex]?.text||'';sel.after(b);
 },
 get:async p=>p==='/team-access/v26'?clone(original):p==='/iam/groups'?[]:[],
 put:async(p,body)=>{actions.push({method:'PUT',p,body});return {roles:body.roles?.map(x=>x.key)||[],revoked_sessions:0};},
 post:async(p,body)=>{actions.push({method:'POST',p,body});return {id:777};},
 del:async p=>{actions.push({method:'DELETE',p});return {deleted:true};},
 toast:()=>{},err:e=>{throw e},confirm:async()=>true};
w.can=()=>true;
w.eval(fs.readFileSync('public/js/team-access-v26.js','utf8'));
const settle=()=>new Promise(resolve=>setTimeout(resolve,4));
const fire=(node)=>{assert.ok(node,'required button');node.click();};
const formSubmit=async overlay=>{const f=overlay.querySelector('form');f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();};
(async()=>{
 assert.equal(w.G.teamAccessVersion,'v26');
 await w.G.screens.settings(root,['team-access','agents']);
 assert.equal(root.querySelectorAll('.ta26-tab').length,5,'Five screenshot top tabs');
 assert.ok(root.textContent.includes('Office staff')&&root.textContent.includes('Bus staff')&&root.textContent.includes('Agents'));
 assert.equal(root.querySelectorAll('.ta26-table tbody tr').length,2);
 assert.ok(root.textContent.includes('Online')&&root.textContent.includes('Offline'));
 assert.ok(root.textContent.includes('Agent settings'));
 assert.equal(root.querySelectorAll('[data-view]').length,2);
 assert.equal(root.querySelectorAll('[data-edit]').length,2);
 assert.equal(root.querySelectorAll('[data-delete]').length,2);
 assert.equal(root.querySelectorAll('[data-toggle]').length,2);
 const search=root.querySelector('[data-search]');search.value='disabled';
 search.dispatchEvent(new w.Event('input',{bubbles:true}));
 assert.equal(root.querySelectorAll('tr[data-row-name]:not([hidden])').length,1,'Name/phone search hides unmatched rows');
 search.value='';search.dispatchEvent(new w.Event('input',{bubbles:true}));
 fire(root.querySelector('[data-edit="102"]'));
 let overlay=w.document.querySelector('.ta26-shade');
 assert.ok(overlay.querySelector('[name=phone][readonly]'));
 assert.ok(overlay.textContent.includes('Edit User'));
 assert.ok(overlay.textContent.includes('Permissions & routes'));
 assert.ok(overlay.textContent.includes('Master agent'));
 assert.ok(overlay.textContent.includes('Online')&&overlay.textContent.includes('Offline'));
 assert.ok(overlay.querySelector('.ta26-switch'));
 assert.ok(selects>=4,'Standard GDS dropdown used for language, role, branch and terms');
 fire(overlay.querySelector('[data-choice="agent_category"][data-value="master_agent"]'));
 fire(overlay.querySelector('[data-choice="mode"][data-value="Offline"]'));
 assert.equal(overlay.querySelector('[name=agent_category]').value,'master_agent');
 assert.equal(overlay.querySelector('[name=mode]').value,'Offline');
 fire(overlay.querySelector('[data-perm-open]'));
 assert.equal(w.document.querySelectorAll('.ta26-shade').length,2,'Nested permissions dialog');
 const nested=[...w.document.querySelectorAll('.ta26-shade')].at(-1);
 fire(nested.querySelector('[data-limit=yes]'));
 fire(nested.querySelector('[data-route="1"]').parentElement);
 nested.querySelector('[data-route="1"]').checked=true;
 await formSubmit(nested);
 assert.equal(w.document.querySelectorAll('.ta26-shade').length,1);
 await formSubmit(overlay);
 const up=actions.findLast(x=>x.method==='PUT'&&x.p==='/team-access/v26/users/102');
 assert.ok(up,'Agent saved to real API route');
 assert.equal(up.body.agent_category,'master_agent');
 assert.equal(up.body.mode,'Offline');
 assert.equal(up.body.limit_routes,true);
 assert.deepEqual([...up.body.route_ids],[1]);
 await w.G.screens.settings(root,['team-access','bus-staff']);
 fire(root.querySelector('[data-view="101"]'));
 overlay=w.document.querySelector('.ta26-shade');
 for(const field of ['PHONE','STATUS','EMAIL','LANGUAGE','LAST LOGIN','ADDED','PERMISSIONS'])
  assert.ok(overlay.textContent.includes(field),'Bus staff view field '+field);
 assert.ok(overlay.textContent.includes('Edit'));
 fire(overlay.querySelector('[data-close]'));
 await w.G.screens.settings(root,['team-access','office-staff']);
 fire(root.querySelector('[data-global-add]'));
 overlay=w.document.querySelector('.ta26-shade');
 assert.ok(overlay.textContent.includes('Add office staff'));
 assert.ok(overlay.querySelector('[name=role]'));
 assert.ok(overlay.querySelector('[data-role-preview]'));
 fire(overlay.querySelector('[data-close]'));
 await w.G.screens.settings(root,['team-access','branches']);
 assert.ok(root.textContent.includes('No branches yet'));
 assert.ok(root.textContent.includes('New branch'));
 fire(root.querySelector('[data-new-branch]'));
 overlay=w.document.querySelector('.ta26-shade');
 for(const key of ['code','name','city_id','phone','address','operations_area'])
  assert.ok(overlay.querySelector('[name='+key+']'),'New branch field '+key);
 for(const label of ['Sales only','Cities','Routes','Both','People'])
  assert.ok(overlay.textContent.includes(label),'Branch screenshot operation '+label);
 overlay.querySelector('[name=code]').value='BLR';
 overlay.querySelector('[name=name]').value='Bengaluru branch';
 fire(overlay.querySelector('[data-choice="operations_area"][data-value="both"]'));
 overlay.querySelector('[data-op-city="1"]').checked=true;
 overlay.querySelector('[data-op-route="2"]').checked=true;
 await formSubmit(overlay);
 const b=actions.findLast(x=>x.method==='POST'&&x.p==='/team-access/v26/branches');
 assert.ok(b,'Branch created by operator API');
 assert.equal(b.body.code,'BLR');assert.equal(b.body.operations_area,'both');
 assert.deepEqual([...b.body.operation_city_ids],[1]);
 assert.deepEqual([...b.body.operation_route_ids],[2]);
 await w.G.screens.settings(root,['team-access','access','roles','viewer']);
 for(const label of ['Roles','Test access','Groups','Advanced','New role','Off','Own','Branch','Company / On'])
  assert.ok(root.textContent.includes(label),'Access screenshot field '+label);
 assert.ok(root.querySelector('.ta26-matrix-scroll'));
 assert.equal(root.querySelectorAll('.ta26-matrix thead th').length,schema.ROLE_COLUMNS.length+1);
 assert.ok(root.textContent.includes('Mark boarded / no-show, passenger notes'));
 const select=root.querySelector('[data-matrix-cell][data-role="viewer"]');
 assert.ok(select);select.value='Own';select.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(select.dataset.scope,'Own');
 fire(root.querySelector('[data-save-matrix]'));
 await settle();
 const batch=actions.findLast(x=>x.method==='PUT'&&x.p==='/team-access/v26/roles/batch');
 assert.ok(batch);assert.equal(batch.body.roles.length,1);
 await w.G.screens.settings(root,['team-access','access','test-access','viewer']);
 assert.ok(root.querySelector('[data-test-access]'));
 await w.G.screens.settings(root,['team-access','access','groups','viewer']);
 assert.ok(root.querySelector('[data-new-group]'));
 await w.G.screens.settings(root,['team-access','access','advanced','viewer']);
 assert.ok(root.querySelector('[data-save-limits]'));
 assert.ok(root.querySelector('[data-export-role]'));
 const index=fs.readFileSync('public/index.html','utf8');
 assert.ok(index.includes('team-access-v26.js')&&index.includes('team-access-v26.css'));
 const css=fs.readFileSync('public/css/team-access-v26.css','utf8');
 for(const t of ['.ta26-shade','.ta26-dialog-foot','.ta26-matrix-scroll','.ta26-choice-row','.ta26-switch','.ta26-tab.active'])
  assert.ok(css.includes(t));
 console.log('PASS Team & access v26 UI: five tabs, counts, actions, modal scrolling, nested routes, agent type/mode, branch operations, full access matrix and dropdowns');
})().catch(e=>{console.error(e);process.exitCode=1;});
})();