'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const schema=require('../server/team-access-schema-v27');
const dom=new JSDOM('<div id="app"></div>',{url:'http://localhost:3000/#/settings/team-access/access/advanced/viewer',runScripts:'outside-only'});
const w=dom.window,root=w.document.querySelector('#app');
w.esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const events=[],groups=[],rules=[];
const data={
 users:[{id:11,name:'City Manager',phone:'9999999998',role:'manager'},
  {id:12,name:'Driver',phone:'9999999997',role:'driver'}],
 branches:[{id:2,name:'Bengaluru Counter'}],
 routes:[{id:22,name:'Bengaluru–Mangaluru'}],
 roles:[{key:'viewer',name:'Viewer',permissions:[]},{key:'manager',name:'Manager',permissions:['bookings.cancel']},
   {key:'driver',name:'Driver',permissions:['trips.view']},{key:'owner',name:'Owner',permissions:[]}],
 matrix:schema.ROWS,role_columns:schema.ROLE_COLUMNS,grants:{manage_roles:true,manage_users:true}
};
const presets=[
 {id:'seat_blocks_3_24',name:'Limit seat blocks (3 seats, 24 h)',effect:'limit',
  action_key:schema.byLabel.get('Block seats').key,condition:{kind:'always'},limits:{max_seats:3,max_hours:24}},
 {id:'cancel_before_2h',name:'No cancelling within 2 h of departure',effect:'deny',
  action_key:schema.byLabel.get('Cancel tickets').key,condition:{kind:'departure_within_hours',hours:2},limits:{}},
 {id:'corridor_blocks',name:"Seat blocks only on routes with the person's corridor tag",effect:'deny',
  action_key:schema.byLabel.get('Block seats').key,condition:{kind:'corridor_mismatch'},limits:{}},
 {id:'read_only',name:'Read-only (view everything, change nothing)',effect:'deny',
  action_key:'*',condition:{kind:'write_action'},limits:{}}
];
let id=5;
w.G={
 screens:{settings:async el=>{el.innerHTML='<section class="ta26-access-content"></section>';}},
 get:async p=>{
  if(p==='/team-access/v26')return data;
  if(p==='/team-access/v28/groups')return {groups:JSON.parse(JSON.stringify(groups))};
  if(p==='/team-access/v28/rules')return {rules:JSON.parse(JSON.stringify(rules)),templates:presets,revision:0};
  return [];
 },
 post:async (p,body)=>{
  events.push({method:'POST',p,body});
  if(p==='/team-access/v28/test')return {decision:'deny',action:'Cancel tickets',person:{name:'City Manager'},
   role_name:'Manager',selected:'Company',groups:['Night team'],limits:{},reasons:['Blocked by rule: No cancelling'],
   applied_rules:[{name:'No cancelling'}],note:'Simulation only'};
  if(p==='/team-access/v28/groups'){const row={id:++id,name:body.name,user_ids:[],description:''};groups.push(row);return row;}
  if(p==='/team-access/v28/rules'){const row={id:++id,...body};rules.push(row);return row;}
  if(p==='/team-access/v26/roles')return {key:'night_supervisor',...body};
  return {};
 },
 put:async (p,body)=>{
  events.push({method:'PUT',p,body});
  const g=groups.find(x=>p==='/team-access/v28/groups/'+x.id);
  if(g)Object.assign(g,body);
  const r=rules.find(x=>p==='/team-access/v28/rules/'+x.id);
  if(r)Object.assign(r,body);
  return {...body};
 },
 del:async p=>{
  events.push({method:'DELETE',p});
  const g=groups.findIndex(x=>p==='/team-access/v28/groups/'+x.id);if(g>=0)groups.splice(g,1);
  const r=rules.findIndex(x=>p==='/team-access/v28/rules/'+x.id);if(r>=0)rules.splice(r,1);
  return {deleted:true};
 },
 confirm:async()=>true,toast:()=>{},err:e=>{throw e}
};
w.eval(fs.readFileSync('public/js/team-access-v28.js','utf8'));
const settle=()=>new Promise(resolve=>setTimeout(resolve,14));
async function show(tab){
 await w.G.screens.settings(root,['team-access','access',tab,'viewer']);
 return root.querySelector('.ta26-access-content');
}
(async()=>{
 assert.equal(w.G.teamAccessVersion,'v28');
 let content=await show('advanced');
 assert.ok(content.textContent.includes('For unusual cases the grid'));
 assert.ok(content.textContent.includes('A role says what people can do'));
 assert.ok(content.textContent.includes('No rules yet. Everyone works by their role until you add one.'));
 assert.equal(content.querySelectorAll('[data-v28-preset]').length,4);
 const quick=[...content.querySelectorAll('[data-v28-preset]')].map(b=>b.textContent);
 assert.deepEqual(quick,presets.map(x=>x.name));
 content.querySelector('[data-v28-preset="seat_blocks_3_24"]').click();
 let form=content.querySelector('[data-v28-rule-form]');
 assert.ok(form,'Seat preset opens working inline rule editor');
 assert.equal(form.elements.action_key.value,schema.byLabel.get('Block seats').key);
 assert.equal(form.elements.effect.value,'limit');
 assert.equal(form.elements.max_seats.value,'3');
 assert.equal(form.elements.max_hours.value,'24');
 assert.equal(form.elements.subject_type.value,'role');
 form.elements.subject_id.value='manager';
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();
 assert.ok(events.some(x=>x.p==='/team-access/v28/rules'&&x.body.limits.max_seats===3));
 assert.equal(rules.length,1);
 assert.equal(root.querySelectorAll('[data-v28-rule]').length,1);
 content=root.querySelector('.ta26-access-content');
 content.querySelector('[data-v28-edit-rule]').click();
 assert.ok(content.querySelector('[data-v28-rule-form]'));
 content.querySelector('[data-v28-rule-form] [data-v28-cancel-rule]').click();
 assert.equal(content.querySelector('[data-v28-rule-form]'),null);
 content.querySelector('[data-v28-toggle-rule]').click();await settle();
 assert.equal(rules[0].enabled,false);
 content=root.querySelector('.ta26-access-content');
 content.querySelector('[data-v28-toggle-rule]').click();await settle();
 assert.equal(rules[0].enabled,true);
 content=root.querySelector('.ta26-access-content');
 content.querySelector('[data-v28-delete-rule]').click();await settle();
 assert.equal(rules.length,0);
 // Test access screenshot controls and full dropdown option coverage.
 content=await show('test-access');
 assert.ok(content.textContent.includes('Check what a person can or cannot do, and why.'));
 assert.ok(content.textContent.includes('CAN THIS PERSON...?'));
 assert.equal(content.querySelector('input[name=phone]').placeholder,'10-digit mobile');
 assert.equal(content.querySelector('[data-v28-action]').options.length,90,'89 actions + prompt');
 assert.equal(content.querySelector('[data-v28-action]').options[0].text,'Add something to check...');
 assert.equal(content.querySelector('[data-v28-check]').disabled,true);
 content.querySelector('input[name=phone]').value='9999999998';
 content.querySelector('input[name=phone]').dispatchEvent(new w.Event('input',{bubbles:true}));
 const target=content.querySelector('[data-v28-action]');
 target.value=schema.byLabel.get('Cancel tickets').key;
 target.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(content.querySelector('[data-v28-check]').disabled,false);
 assert.equal(content.querySelector('[data-v28-situation-fields]').hidden,true);
 content.querySelector('[data-v28-situation]').click();
 assert.equal(content.querySelector('[data-v28-situation-fields]').hidden,false);
 const situation=content.querySelector('[data-v28-situation-fields]');
 situation.querySelector('[name=route_id]').value='22';
 situation.querySelector('[name=seat_count]').value='3';
 situation.querySelector('[name=hours_before_departure]').value='1';
 content.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();
 const check=events.find(x=>x.p==='/team-access/v28/test');
 assert.ok(check);
 assert.equal(check.body.phone,'9999999998');
 assert.equal(check.body.action_key,target.value);
 assert.equal(check.body.situation.route_id,'22');
 assert.equal(check.body.situation.seat_count,'3');
 assert.ok(root.querySelector('.ta28-result.ta28-deny'));
 assert.ok(root.textContent.includes('Blocked by rule: No cancelling'));
 // Groups empty initial screenshot and actual quick create/edit/delete.
 content=await show('groups');
 assert.ok(content.textContent.includes('Put people together'));
 assert.equal(content.querySelector('.ta28-group-create input').placeholder,'New group, e.g. Night-pickup-team');
 assert.equal(content.querySelector('.ta28-group-create button').disabled,true);
 const groupName=content.querySelector('.ta28-group-create input');
 groupName.value='Night team';groupName.dispatchEvent(new w.Event('input',{bubbles:true}));
 assert.equal(content.querySelector('.ta28-group-create button').disabled,false);
 content.querySelector('.ta28-group-create').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();
 assert.equal(groups.length,1);
 content=root.querySelector('.ta26-access-content');
 assert.equal(content.querySelectorAll('.ta28-group-card').length,1);
 content.querySelector('[data-v28-edit-group]').click();
 form=content.querySelector('[data-v28-group-editor]');assert.ok(form);
 assert.equal(form.querySelectorAll('input[type=checkbox]').length,2);
 form.querySelector('input[type=checkbox]').checked=true;
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();
 assert.deepEqual(Array.from(groups[0].user_ids),[11]);
 content=root.querySelector('.ta26-access-content');
 content.querySelector('[data-v28-delete-group]').click();await settle();
 assert.equal(groups.length,0);
 // New Role screenshot: inline full-width Name, Starts from, Cancel and Create.
 root.innerHTML='<div class="ta26-access-content"><div class="ta27-actions"></div>'+
  '<div class="ta27-filter-bar"></div><div class="ta26-matrix-scroll"></div>'+
  '<div class="ta27-matrix-foot"></div><div class="ta27-scope-note"></div></div>';
 let created;
 w.G.teamAccessV28.newRole(root,data,async x=>{created=x;});
 const newForm=root.querySelector('[data-v28-new-role] form');
 assert.ok(newForm);assert.equal(newForm.elements.name.placeholder,'e.g. City Supervisor');
 assert.equal(newForm.elements.starts_from.options[0].text,'Choose a role');
 assert.equal(newForm.querySelector('button[type=submit]').disabled,true);
 assert.ok(root.querySelector('.ta26-matrix-scroll').hidden);
 newForm.elements.name.value='Night Supervisor';newForm.elements.starts_from.value='manager';
 newForm.elements.name.dispatchEvent(new w.Event('input',{bubbles:true}));
 newForm.elements.starts_from.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(newForm.querySelector('button[type=submit]').disabled,false);
 newForm.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();
 assert.equal(created.starts_from,'manager');
 assert.ok(!root.querySelector('[data-v28-new-role]'));
 assert.equal(root.querySelector('.ta26-matrix-scroll').hidden,false);
 // Pixel-conscious stylesheet, asset order and scope.
 const css=fs.readFileSync('public/css/team-access-v28.css','utf8');
 for(const selector of ['.ta28-panel','.ta28-preset-bar','.ta28-group-create','.ta28-newrole-box','.ta28-rule-editor','.ta28-situation'])
  assert.ok(css.includes(selector),'Missing screenshot style '+selector);
 const index=fs.readFileSync('public/index.html','utf8');
 assert.ok(index.indexOf('team-access-v28.js')>index.indexOf('team-access-v26.js'));
 console.log('PASS v28 UI: Advanced 4 templates/rule CRUD, full 89-choice simulator with situation, group create/member editing, inline new role inheritance');
})().catch(e=>{console.error(e);process.exit(1);});
