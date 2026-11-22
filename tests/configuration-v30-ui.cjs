'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<div id="app"></div>',{url:'http://localhost/#/settings/configuration/business',runScripts:'outside-only'});
const w=dom.window,root=w.document.querySelector('#app');
const base={
 business:{operator_name:'',support_email:'',gst_receivable:false,gst_number:'',gst_registration_name:''},
 website:{tagline:'',company_legal_name:'',address_lines:'',email:'',helpline:'',
  whatsapp_number:'',business_hours:'',copyright_line:'',boarding_window_minutes:30,
  refund_processing_days:7,carry_on_kg:7,check_in_kg:15,baggage_liability_inr:2000,
  child_free_age:5,unaccompanied_minor_age:12,jurisdiction_city:'',jurisdiction_state:'',
  grievance_officer_name:'',grievance_designation:''},
 communications:{cloud_calling:true,passenger_masking:true,direct_to_vehicle:true,call_individual_drivers:false,
  savetrip_line:'',whatsapp_sender:'',support_number:'',published_office_numbers:[],
  escalation_contacts:[],ring_order:'share',speed_dial_during_calls:true,dial_bus_last4:true,
  city_contacts:[],office_extra:[],crew_extra:[]},
 notifications:{bus_live_status:true,boarding_point_cutoff:45,pre_boarding_minutes:360,
  pre_boarding_based_on:'boarding_point',checkin_reminder_minutes:45,rating_request_minutes:120,
  builtin_crew_push:true,builtin_office_push:true}
};
const data={sections:base,dials:[],subscriptions:[],users:[{id:2,name:'Office User',phone:'9999999998'}]};
const calls=[];
w.can=()=>true;
w.G={
 screens:{settings:async()=>{}},
 get:async p=>JSON.parse(JSON.stringify(p==='/settings/config-v30'?data:{})),
 put:async(p,v)=>{calls.push({method:'PUT',p,v});if(p.startsWith('/settings/config-v30/')&&!p.includes('subscriptions')){
  const section=p.split('/').at(-1);Object.assign(base[section],v);return {value:base[section]};}
  return v;},
 post:async(p,v)=>{calls.push({method:'POST',p,v});if(p.endsWith('/subscriptions')){
  data.subscriptions.push({id:11,...v,channel:v.protocol});return data.subscriptions.at(-1);}
  if(p.endsWith('/dials')){data.dials.push({id:12,...v});return data.dials.at(-1);}
  return {};},
 del:async p=>{calls.push({method:'DELETE',p});return {deleted:true};},
 toast:()=>{},confirm:async()=>true,err:e=>{throw e}
};
w.eval(fs.readFileSync('public/js/configuration-v30.js','utf8'));
const settle=()=>new Promise(r=>setTimeout(r,20));
async function show(section){await w.G.screens.settings(root,['configuration',section]);return root;}
(async()=>{
 await show('business');
 assert.equal(w.G.configurationVersion,'v30');
 assert.equal(root.querySelectorAll('[data-cfg30-tab]').length,12,'12 screenshot sidebar options');
 assert.equal(root.querySelectorAll('.cfg30-card').length,2,'business general information + GST');
 assert.ok(root.textContent.includes('GST Receivable'));
 assert.ok(root.querySelector('[name=gst_number]'));
 root.querySelector('[name=operator_name]').value='Test Operator';
 root.querySelector('[data-cfg30-save]').click();await settle();
 assert.ok(calls.some(c=>c.p==='/settings/config-v30/business'&&c.v.operator_name==='Test Operator'));
 await show('website');
 assert.ok(root.textContent.includes('Policy Details'));
 assert.ok(root.textContent.includes('Grievance Officer'));
 for(const name of ['tagline','company_legal_name','address_lines','email','helpline',
  'whatsapp_number','business_hours','copyright_line','boarding_window_minutes',
  'refund_processing_days','carry_on_kg','check_in_kg','baggage_liability_inr',
  'child_free_age','unaccompanied_minor_age','jurisdiction_city','jurisdiction_state',
  'grievance_officer_name','grievance_designation'])
  assert.ok(root.querySelector('[name='+name+']'),'Missing website field '+name);
 await show('communications');
 assert.ok(root.textContent.includes('Call Routing'));
 assert.ok(root.textContent.includes('City-Specific Contacts'));
 assert.ok(root.textContent.includes('Speed dials'));
 root.querySelector('[data-dial-add]').click();
 let modal=w.document.querySelector('.cfg30-dialog');
 assert.ok(modal);
 for(const [k,v] of Object.entries({code:'1',phone:'9019207599',label:'Support',kind:'number'}))modal.querySelector('[name='+k+']').value=v;
 modal.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 await settle();assert.ok(calls.some(x=>x.p==='/settings/config-v30/dials'&&x.v.code==='1'));
 await show('communications');
 assert.ok(root.querySelector('[data-dial-edit="12"]'));
 await show('notifications');
 assert.ok(root.textContent.includes('Notification Timing Windows'));
 assert.ok(root.textContent.includes('Subscriptions'));
 assert.ok(root.textContent.includes('WHO IS IN EACH GROUP'));
 assert.ok(root.querySelector('[name=boarding_point_cutoff]'));
 assert.equal(root.querySelectorAll('[data-sub-toggle]').length,2,'two built-in app-push rows');
 root.querySelector('[data-sub-add]').click();
 modal=w.document.querySelector('.cfg30-dialog');
 assert.ok(modal&&modal.textContent.includes('Create subscription'));
 assert.equal(modal.querySelectorAll('[data-event]').length,11);
 assert.equal(modal.querySelectorAll('[data-source]').length,6);
 assert.ok(modal.querySelector('[data-user-search]'));
 assert.ok(modal.querySelector('[data-contact-add]'));
 assert.ok(modal.querySelector('details.cfg30-filter'));
 modal.querySelector('[name^=mobile_]').value='9999999998';
 modal.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 await settle();
 assert.ok(calls.some(x=>x.p==='/settings/config-v30/subscriptions'&&x.v.endpoint==='phone'));
 const html=fs.readFileSync('public/index.html','utf8');
 assert.ok(html.includes('configuration-v30.js'));
 assert.ok(html.includes('configuration-v30.css'));
 const css=fs.readFileSync('public/css/configuration-v30.css','utf8');
 assert.ok(css.includes('.cfg30-dialog')&&css.includes('.cfg30-sidebar'));
 console.log('PASS Configuration v30 browser UI: 12 sidebar entries, business, website policy, calling, speed dials, subscriptions, modal controls, actions');
})().catch(e=>{console.error(e);process.exitCode=1});
