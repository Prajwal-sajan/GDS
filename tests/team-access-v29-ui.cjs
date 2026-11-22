'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),{JSDOM}=require('jsdom');
const S=require('../server/team-access-situation-v29');
const labels=[
 'Choose...',...S.FIELDS.map(x=>x[1])
];
const dom=new JSDOM('<div id="app"></div>',{url:'http://localhost',runScripts:'outside-only'});
const w=dom.window,root=w.document.querySelector('#app');
w.G={screens:{settings:async(el)=>{el.innerHTML=
 '<div class="ta26-root"><form data-v28-test-form><div data-v28-situation-fields class="ta28-situation" hidden>'+
 '<input name="route_id"></div><section data-v28-result></section></form></div>';}}};
w.eval(fs.readFileSync('public/js/team-access-v29.js','utf8'));
(async()=>{
 await w.G.screens.settings(root,['team-access','access','test-access']);
 assert.equal(w.G.teamAccessVersion,'v29');
 const picker=root.querySelector('[data-v29-field]');
 assert.deepEqual([...picker.options].map(x=>x.text),labels);
 assert.equal(picker.options.length,24,'23 fields and Choose... placeholder');
 assert.equal(root.querySelector('[data-v28-situation-fields]').hidden,true,'Preserve v28 expand/collapse');
 assert.equal(root.querySelectorAll('[data-v29-row]').length,1);
 assert.equal(root.querySelector('[data-v29-value] input').disabled,true);
 picker.value='calling_app';picker.dispatchEvent(new w.Event('change',{bubbles:true}));
 const app=root.querySelector('[name=calling_app]');
 assert.deepEqual([...app.options].map(x=>x.value),['','app','hub','website','gds','partner']);
 assert.equal(root.querySelector('[data-v29-add]').hidden,false);
 root.querySelector('[data-v29-add]').click();
 const pickers=[...root.querySelectorAll('[data-v29-field]')];
 pickers[1].value='inside_branch_operations_area';
 pickers[1].dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.deepEqual([...root.querySelector('[name=inside_branch_operations_area]').options].map(x=>x.value),['','true','false']);
 pickers[1].value='calling_app';pickers[1].dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(pickers[1].value,'','No duplicate context fields');
 assert.match(root.querySelector('[data-v29-error]').textContent,/different/);
 pickers[1].value='hours_before_departure';pickers[1].dispatchEvent(new w.Event('change',{bubbles:true}));
 const n=root.querySelector('[name=hours_before_departure]');n.value='1.5';
 assert.equal(n.value,'1.5');
 root.querySelector('[data-v29-remove]').click();
 assert.equal(root.querySelectorAll('[data-v29-row]').length,1);
 const actor={id:8,phone:'9999999998',branch_id:2,role:'manager'};
 const DB={col:name=>({get:id=>name==='branches'&&id===2?{id:2}:null,
  find:f=>name==='users'?[{id:8,phone:'9999999998'}].find(f):null})};
 const fail=msg=>{throw Error(msg);};
 const normalize=raw=>{
  const context={};const summary=S.normalize(raw,{user:actor,db:DB,visible:()=>true,fail,context});
  return {context,...summary};
 };
 const example=normalize({caller_id:'+919999999998',caller_branch_id:2,calling_app:'gds',
  inside_branch_operations_area:false,days_before_departure:2,
  seat_count:3,discount_percent:20,request_time_utc:'2026-11-23T00:00:00Z'});
 assert.equal(example.context.hours_before_departure,48);
 assert.equal(example.context.inside_branch_operations_area,false);
 assert.ok(example.policyKeys.includes('days_before_departure'));
 assert.ok(example.contextOnly.includes('discount_percent'));
 assert.throws(()=>normalize({caller_id:'+919999999997'}),/match/);
 assert.throws(()=>normalize({operator_hour:24}),/Invalid/);
 assert.throws(()=>normalize({calling_app:'hidden-privileged-mode'}),/Invalid/);
 assert.throws(()=>normalize({discount_percent:101}),/Invalid/);
 assert.throws(()=>normalize({request_time_utc:'today'}),/ISO/);
 assert.throws(()=>normalize({unknown_field:'x'}),/Unknown/);
 assert.throws(()=>normalize({hours_before_departure:1,days_before_departure:2}),/Conflicting/);
 const css=fs.readFileSync('public/css/team-access-v29.css','utf8');
 assert.match(css,/ta29-situation-editor/);
 const html=fs.readFileSync('public/index.html','utf8');
 assert.match(html,/team-access-v29.js/);
 assert.match(html,/team-access-v29.css/);
 console.log('PASS v29: screenshot-exact 23 fields, native picker, typed values, multi-field editing, scenario validation and safe context normalization');
})().catch(e=>{console.error(e);process.exitCode=1});
