'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const schema=require('../server/configuration-v31-schema');
const dom=new JSDOM('<div id="app"></div>',{url:'http://localhost/#/settings/configuration/business',runScripts:'outside-only'});
const w=dom.window,root=w.document.querySelector('#app');
const sections=JSON.parse(JSON.stringify(schema.defaults));
const calls=[];
w.can=()=>true;
w.G={svg:()=>'<svg></svg>',screens:{settings:async()=>{}},
 get:async()=>({sections:JSON.parse(JSON.stringify(sections)),dials:[],subscriptions:[],users:[],delivery_connected:false}),
 put:async(path,payload)=>{
  calls.push({path,payload});const section=path.split('/').at(-1);
  const clean={};
  for(const [key,val] of Object.entries(payload)){if(!schema.rules[section]?.[key])throw Error('Unknown field '+key);clean[key]=schema.rules[section][key](val);}
  Object.assign(sections[section],clean);schema.validateFull(section,sections[section]);
  return {saved:true,value:JSON.parse(JSON.stringify(sections[section]))};
 },
 toast:()=>{},err:e=>{throw e},confirm:async()=>true};
w.eval(fs.readFileSync('public/js/configuration-v30.js','utf8'));
w.eval(fs.readFileSync('public/js/configuration-v31.js','utf8'));
const settle=()=>new Promise(resolve=>setTimeout(resolve,20));
const page=async key=>{await w.G.screens.settings(root,['configuration',key]);return root;};
async function save(){
 root.querySelector('[data-cfg30-save]').click();await settle();
}
(async()=>{
 const expected=['pricing','office','vehicle','expenses','seats','monitoring','whatsapp','bot'];
 assert.equal(w.G.configurationVersion,'v31');
 for(const section of expected){
  console.log('v31 UI renderer',section,typeof w.G.configurationExtraPages?.[section],Object.keys(w.G.configurationExtraPages||{}));
  await page(section);
  assert.equal(root.querySelectorAll('[data-cfg30-tab]').length,12,'12 navigation items');
  assert.ok(root.textContent.includes({pricing:'Dynamic Pricing',office:'Seat hold',vehicle:'Fuel Theft Detection',
   expenses:'DIESEL COST PER LITRE',seats:'Fill seats by',monitoring:'Monitoring Thresholds',
   whatsapp:'WhatsApp Operational Alerts',bot:'Metro Integration'}[section]),'Missing '+section+' content');
  assert.ok(root.querySelector('.cfg30-block-title'));
  assert.ok(root.querySelector('[data-cfg30-save]'));
 }
 await page('pricing');
 assert.ok(root.querySelector('[name=dynamic_pricing_enabled]'));
 assert.ok(root.querySelector('[name=sarathi_ai_assistant_enabled]'));
 assert.equal(root.querySelector('[name=manual_pair_fare_hold_hours]').value,'3');
 root.querySelector('[name=dynamic_pricing_enabled]').checked=false;
 await save();assert.ok(calls.some(c=>c.path.endsWith('/pricing')&&c.payload.dynamic_pricing_enabled===false));
 await page('office');
 assert.ok(root.querySelector('[name=default_hold]').textContent.includes('Until departure'));
 assert.ok(root.querySelector('[name=max_hold]'));
 root.querySelector('[name=default_hold]').value='15';
 root.querySelector('[name=max_hold]').value='60';
 await save();assert.ok(calls.some(c=>c.path.endsWith('/office')&&c.payload.default_hold==='15'));
 await page('vehicle');
 for(const key of ['enabled','fuel_drop_threshold_liters','fuel_window_minutes','fuel_max_odometer_km',
  'fuel_max_engine_hours','overspeed_speed_limit_kmh','overspeed_consecutive_readings',
  'idling_duration_minutes','idling_max_odometer_km','offline_threshold_minutes'])
  assert.ok(root.querySelector('[name='+key+']'),'Missing vehicle field '+key);
 let input=root.querySelector('[data-cfg31-chips="alert_recipients"] input');
 input.value='919731714358';
 input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
 assert.ok(root.querySelector('[data-cfg31-chip="919731714358"]'));
 await save();assert.deepEqual(sections.vehicle.alert_recipients,['919731714358']);
 root.querySelector('[data-cfg31-delete-chip]').click();await save();
 assert.equal(sections.vehicle.alert_recipients.length,0);
 await page('expenses');
 assert.equal(root.querySelector('[name=diesel_cost_per_litre]').value,'');
 root.querySelector('[name=diesel_cost_per_litre]').value='99.28';
 await save();assert.equal(sections.expenses.diesel_cost_per_litre,99.28);
 await page('seats');
 assert.equal(root.querySelectorAll('[data-cfg31-ring]').length,7);
 assert.equal(root.querySelectorAll('[data-cfg31-ring]:checked').length,4);
 assert.equal(root.querySelectorAll('[data-cfg31-color]').length,3);
 root.querySelector('[data-cfg31-ring=agent]').checked=false;
 await save();assert.ok(!sections.seats.ring_channels.includes('agent'));
 await page('monitoring');
 for(const key of Object.keys(schema.defaults.monitoring))assert.ok(root.querySelector('[name='+key+']'),'Missing '+key);
 assert.equal(root.querySelector('[name=geofence_radius_meters]').value,'500');
 await page('whatsapp');
 assert.ok(root.querySelector('[name=enabled]'));
 input=root.querySelector('[data-cfg31-chips="recipients"] input');
 input.value='9731990033';input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
 await save();assert.deepEqual(sections.whatsapp.recipients,['9731990033']);
 await page('bot');
 assert.ok(root.textContent.includes('RESPONSE DELAY (SECONDS)'));
 assert.ok(root.textContent.includes('METRO TICKET INSTRUCTIONS'));
 assert.ok(root.querySelector('textarea[name=metro_ticket_instructions]'));
 assert.equal(root.querySelectorAll('[data-cfg31-chip]').length,5);
 root.querySelector('[name=metro_exchange_point]').value='JNTU Metro Station';
 await save();assert.equal(sections.bot.metro_exchange_point,'JNTU Metro Station');
 for(const type of expected){
  const called=calls.filter(c=>c.path.endsWith('/'+type));
  if(['pricing','office','vehicle','expenses','seats','whatsapp','bot'].includes(type))
   assert.ok(called.length,'Save action never called for '+type);
 }
 const html=fs.readFileSync('public/index.html','utf8');
 assert.ok(html.includes('/js/configuration-v31.js'));
 assert.ok(html.includes('/css/configuration-v31.css'));
 assert.ok(html.includes('/js/seat-legend-v31.js'));
 const css=fs.readFileSync('public/css/configuration-v31.css','utf8');
 assert.match(css,/cfg31-ring-grid/);
 console.log('PASS Configuration v31 browser: all 8 tabs, controls, values, conditional fields, ring/colour choices, chips, Save and validation');
})().catch(e=>{console.error(e);process.exitCode=1;});
