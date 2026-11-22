'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><html><body><main id="target"></main></body></html>',{
 url:'http://localhost:3000/#/accounts/reports/fleet-operations?from=2026-11-14&to=2026-11-20',
 runScripts:'outside-only'
});
const w=dom.window;
w.can=()=>true;
w.localStorage.setItem('token','test-token');
w.navigator.clipboard={writeText:async()=>{}};
const toast=[];
const sample={
 report:'fleet-operations',from:'2026-11-14',to:'2026-11-20',bus_id:null,staff_id:null,
 summary:{fleet_util_pct:63.3,trips:31,buses:5,drivers:14,km:16130,fuel_l:3798.7,kmpl:4.25,
 diesel:458130,idle_bus_days:18,trips_without_bus:0,trips_turned_off:11,trips_without_driver:0},
 by_bus:[{vehicle_id:1,vehicle:'AR 01 Q 7827',trips:5,days_ran:5,days_idle:2,util_pct:71.4,km:2418,
 km_route:2907,fuel_l:597.1,kmpl:4.05,diesel:75286,rs_per_km:31.13,drivers:'Gousuddin, Sattar'}],
 by_driver:[{driver_id:1,driver:'Prabhu',phone:'9916623350',trips:8,days:7,km:3739,fuel_l:874.3,
 kmpl:4.28,vs_bus_avg_pct:-.1,buses:'AR 01 R 8318, AR 01 T 8269'}],
 driver_by_bus:[{driver:'Gousuddin',vehicle:'AR 01 Q 7827',trips:5,km:2418,fuel_l:597.1,
 kmpl:4.05,bus_avg_kmpl:4.05,vs_bus_avg_pct:0}],
 daily:[{date:'2026-11-14',fleet:7,used:5,trips:5,util_pct:71.4,no_bus:0,turned_off:1,km:3083,
 fuel_l:730.6,kmpl:4.22,diesel:72537,idle_buses:'AR 01 T 8270, TS-12-UE-3327'}],
 rows:[{date:'2026-11-14',departure_time:'20:20',service:'NTHB3',route:'Hyderabad → Bengaluru',
 vehicle:'AR 01 T 8269',drivers:[{name:'Mohammed Soheb',phone:'7411533506'},{name:'Prabhu',phone:'9916623350'}],
 crew:[{role:'Helper',name:'Bharath',phone:'7993107976'}],km:616,fuel_l:150.7,kmpl:4.09,diesel:14959}],
 totals:{by_bus:{vehicle:'7 buses',trips:31},by_driver:{driver:'14 drivers',trips:63},driver_by_bus:{driver:'Total',trips:63},
 daily:{date:'7 days',fleet:'49 bus-days',trips:31},rows:{date:'31 trips',drivers:'0 without driver'}}
};
const options={buses:[{id:1,registration_number:'AR 01 Q 7827'},{id:2,registration_number:'AR 01 Q 7828'}],
 staff:[{id:1,name:'Prabhu',role:'driver'},{id:2,name:'Sattar',role:'driver'}]};
w.G={
 screens:{accounts:async(el)=>{el.innerHTML='<nav id="accounts-nav">Accounts</nav><section data-ac10-page>Old report</section>';}},
 get:async(url)=>url.endsWith('/options')?options:sample,viewAs:'',
 query:()=>Object.fromEntries(new URLSearchParams(w.location.hash.split('?')[1]||'')),
 qs:obj=>new URLSearchParams(Object.entries(obj).map(([k,v])=>[k,String(v??'')])).toString(),
 toast:(m)=>toast.push(m),err:e=>{throw e}
};
w.eval(fs.readFileSync('public/js/fleet-operations-v20.js','utf8'));
const delay=()=>new Promise(resolve=>setTimeout(resolve,25));
(async()=>{
 const root=w.document.querySelector('#target');
 await w.G.screens.accounts(root,{tab:'reports',id:'fleet-operations'});
 assert.ok(root.querySelector('#accounts-nav'),'Accounts nav retained');
 assert.equal(root.querySelectorAll('.fop-tile').length,12,'12 summary tiles');
 assert.equal(root.querySelectorAll('.fop-report-section').length,5,'five screenshot tables');
 for(const h of ['BY BUS','BY DRIVER','DRIVER × BUS','DAILY','TRIP-WISE'])
   assert.ok(root.textContent.includes(h),'Section label '+h);
 assert.ok(root.textContent.includes('Fleet Operations'));
 assert.ok(root.textContent.includes('₹4,58,130'));
 assert.ok(root.textContent.includes('63.3%'));
 assert.ok(root.textContent.includes('Gousuddin, Sattar'));
 assert.equal(root.querySelector('[name=from]').value,'2026-11-14');
 assert.equal(root.querySelector('[name=to]').value,'2026-11-20');
 assert.equal(root.querySelectorAll('.fop-presets button').length,3);
 assert.equal(root.querySelectorAll('.fop-actions button').length,3);
 assert.equal(root.querySelector('select[name=staff_id] option').textContent.trim(),'All drivers / staff');
 assert.equal(root.querySelector('select[name=bus_id] option').textContent.trim(),'All buses');
 const bus=root.querySelector('select[name=bus_id]');
 bus.value='1';bus.dispatchEvent(new w.Event('change',{bubbles:true}));await delay();
 assert.ok(w.location.hash.includes('bus_id=1'),'Bus filter updates report URL');
 assert.ok(w.location.hash.includes('from=2026-11-14'),'Range retained');
 const printCSS=fs.readFileSync('public/css/fleet-operations-v20.css','utf8');
 for(const css of ['.fop-summary','.fop-grid-scroll','.fop-grid tfoot','.fop-presets','@media print'])
   assert.ok(printCSS.includes(css),'Missing style '+css);
 const html=fs.readFileSync('public/index.html','utf8');
 assert.ok(html.indexOf('accounts-parity-v10.js')<html.indexOf('fleet-operations-v20.js'));
 assert.ok(html.indexOf('fleet-operations-v20.js')<html.indexOf('main.js'));
 console.log('PASS Fleet Operations v20 browser DOM: 12 KPI tiles, 5 tables, filters, presets, actions, visual structure');
})().then(()=>process.exit(0)).catch(err=>{console.error(err);process.exit(1);});
