'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>',{
 url:'http://localhost:3000/#/accounts/reports/point-usage?from=2026-11-14&to=2026-11-20',
 runScripts:'outside-only'
});
const w=dom.window;
w.can=()=>true;w.localStorage.setItem('token','test-token');
w.navigator.clipboard={writeText:async()=>{}};
const options={buses:[{id:1,name:'AR 01 Q 7827'}],staff:[{id:2,name:'Prabhu',role:'driver',phone:'0000000000'}]};
const defs=[
 ['staff-duty',{trips:6,working_days:5,halt_days:1,km:560,fuel_l:130,mileage:4.3,late_pickups:2,trips_turned_off:1},
 {rows:[{date:'2026-11-14',dep:'18:00',service:'NTHB1',route:'Hyderabad → Bengaluru',bus:'AR 01 Q 7827',status:'Worked',km:560,fuel_l:130,kmpl:4.3}],daily:[]}],
 ['point-usage',{bookings:867,seats:1068,amount:1175257,boarding_points:101,dropping_points:43},
 {boarding:[{point:'Gachibowli',bookings:160,seats:187,share_pct:17.5,days_used:7,amount:233177}],
 dropping:[{point:'Ramamurthy Nagar',bookings:16,seats:27,share_pct:2.5,days_used:6,amount:30834}],
 pairs:[{boarding:'Gachibowli',dropping:'TIN Factory',bookings:20,seats:27,amount:34350}]}],
 ['cancellations',{cancellations:70,seats:81,amount:95614,charges_kept:28160,by_operator:35,bookings_resold:39,resale_pct:55.7,seats_resold:46,recovered:57661},
 {rows:[{date:'2026-11-14',service:'NTHB1',pnr:'ST10000',passenger:'Test',phone:'999',boarding:'Gachibowli',source:'redbus',by:'Passenger',seats:1,amount:1000,charge:100,resold_label:'1/1',recovered:1200}]}],
 ['driver-behavior',{trips_recorded:26,trips:31,drivers:14,avg_driver_score:95,below_65:0,trips_without_driver:0},
 {drivers:[{driver:'Prabhu',phone:'000',trips:6,shared:6,km:3739,score:95,hard_brake:26,harsh_accel:0,over_speed:10,top_speed:99,idling:368,freerun:0,buses:'AR 01 T 8269'}],
 rows:[{date:'2026-11-14',dep:'19:30',service:'NTHB1',route:'Hyderabad → Bengaluru',bus:'AR 01 T 8269',drivers:'Prabhu, Soheb · Shared',score:95}]}],
 ['expenses',{total_expense:1044653,fixed:189602,running:855051,channel_commission:165956,per_trip:33698,trips:31,trips_turned_off:11,buses:5},
 {categories:[{label:'Diesel',type:'running',amount:458130,share_pct:43.9,trips:31,avg_per_trip:14778}],
 by_bus:[{bus:'AR 01 T 8269',trips_label:'7 (+5 off)',diesel:102798,other:500,total:256046}],
 rows:[{date:'2026-11-14',dep:'20:20',service:'NTHB3',route:'Hyderabad → Bengaluru',bus:'AR 01 T 8269',diesel:14959,other:500,total:30300}]}],
 ['metro-bookings',{metro_pnrs:124,seats:172,revenue:178293,billed_metro_legs:124,metro_pax:172,metro_fare:8833,with_pickup:124,with_drop:0,both_legs:0},
 {pickup_points:[{point:'LB Nagar Metro Station',pnrs:9,seats:15,revenue:18418}],drop_points:[],daily:[{date:'2026-11-14',pnrs:21,seats:24,revenue:27333}],
 rows:[{date:'2026-11-14',service:'NTHB1',bus:'AR 01 Q 7827',pnr:'ST100',source:'redbus',leg:'Pickup',boarding:'LB Nagar',dropping:'Gachibowli',seats:1,metro_pax:1,metro_fare:20,amount:1000}]}],
 ['no-shows',{no_shows:3,fare:3201,seats_resold:0,resale_pct:0,recovered:0},
 {rows:[{date:'2026-11-14',service:'NTHB2',bus:'AR 01 R 8319',pnr:'ST200',passenger:'Narayana Reddy',phone:'900',boarding:'Gachibowli',source:'abhibus',seat:'13L',fare:1259,resold_label:'—',recovered:0}]}],
 ['van-bookings',{van_pnrs:0,seats:0,revenue:0,with_pickup:0,both_legs:0,vans_used:0,pnrs_without_van:0},
 {rows:[]}]
];
const data=Object.fromEntries(defs.map(([key,summary,sections])=>[key,{
 report:key,from:'2026-11-14',to:'2026-11-20',bus_id:null,staff_id:key==='staff-duty'?null:null,
 mode:'both',summary,sections,totals:{},methodology:'Data comes from GDS.',
 ...(key==='staff-duty'?{staff:null}:{}),
 ...(key==='expenses'?{top_categories:[{key:'diesel',label:'Diesel'}]}:{})
}]));
w.G={screens:{accounts:async el=>{el.innerHTML='<nav id="accounts-nav">Accounts</nav><section data-ac10-page>Catalogue</section>';}},
 query:()=>Object.fromEntries(new URLSearchParams(w.location.hash.split('?')[1]||'')),
 qs:o=>new URLSearchParams(Object.entries(o).map(([k,v])=>[k,String(v??'')])).toString(),
 get:async uri=>uri.endsWith('/options')?options:data[uri.split('/').pop().split('?')[0]],
 toast:()=>{},err:e=>{throw e}
};
w.eval(fs.readFileSync('public/js/report-suite-specs-v21.js','utf8'));
w.eval(fs.readFileSync('public/js/report-suite-v21.js','utf8'));
(async()=>{
 const root=w.document.querySelector('#app');
 for(const [key] of defs){
   const d=data[key],def=w.ReportSuiteSpecsV21.DEF[key];
   const html=w.ReportSuiteV21.render(d,options,key);
   root.innerHTML=html;
   assert.ok(root.textContent.includes(def.title),'Missing report title '+key);
   assert.equal(root.querySelectorAll('.rpt21-stat').length,def.needsStaff?0:def.metrics.length,'KPI count '+key);
   assert.equal(root.querySelectorAll('.rpt21-section').length,def.needsStaff?0:w.ReportSuiteSpecsV21.sections(key,d).length,'section count '+key);
   assert.equal(root.querySelectorAll('.rpt21-actions button').length,3,'print PDF share '+key);
   assert.equal(root.querySelectorAll('.rpt21-presets button').length,3,'three presets '+key);
   assert.equal(root.querySelectorAll('.rpt21-date').length,2,'date pickers '+key);
   assert.equal(root.querySelectorAll('select[name=bus_id]').length,def.bus?1:0,'bus filter '+key);
   assert.equal(root.querySelectorAll('.rpt21-modes button').length,def.modes?3:0,'mode tabs '+key);
   if(def.needsStaff){assert.ok(root.textContent.includes('Select a driver or staff member'));assert.ok(root.querySelector('[data-v21=pdf]').disabled);}
   else assert.ok(!root.querySelector('[data-v21=pdf]').disabled);
   if(key==='expenses')assert.ok(root.querySelector('th').textContent.includes('Category'));
   console.log('PASS UI '+key+': '+(def.needsStaff?0:def.metrics.length)+' KPIs, '+(def.needsStaff?0:def.sections.length)+' tables');
 }
 w.location.hash='#/accounts/reports/point-usage?from=2026-11-14&to=2026-11-20';
 await w.G.screens.accounts(root,{tab:'reports',id:'point-usage'});
 assert.ok(root.querySelector('#accounts-nav'),'Accounts navigation preserved');
 assert.ok(root.textContent.includes('₹11,75,257'),'Indian money formatting');
 assert.ok(root.textContent.includes('Gachibowli'),'Rows from report data visible');
 const sel=root.querySelector('select[name=bus_id]');
 sel.value='1';sel.dispatchEvent(new w.Event('change',{bubbles:true}));
 await new Promise(resolve=>setTimeout(resolve,10));
 assert.ok(w.location.hash.includes('bus_id=1'),'Bus filter navigation');
 const css=fs.readFileSync('public/css/report-suite-v21.css','utf8');
 for(const x of ['.rpt21-controls','.rpt21-summary','.rpt21-table','.rpt21-actions','.rpt21-presets','@media print'])
   assert.ok(css.includes(x),'CSS feature '+x);
 console.log('PASS eight screens screenshot structure, staff guard, date presets, modes, footer tables, hash filters, money format and CSS');
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
