'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>',{
 url:'http://localhost:3000/#/accounts/reports/frequent-travellers',
 runScripts:'outside-only'
});
const w=dom.window,root=w.document.querySelector('#app');
w.can=()=>true;w.localStorage.setItem('token','test');
w.navigator.clipboard={writeText:async()=>{}};
const options={buses:[{id:10,name:'KA 01 AB 1001'}],staff:[{id:4,name:'Driver A',role:'driver'}],
 schedules:[{id:9,name:'NTBH1 · Bengaluru → Hyderabad'}]};
const from='2026-11-14',to='2026-11-20';
const shared={from,to,operator_name:'Demo Travels',methodology:'Bookings and schedules are source-backed',totals:{},bus_id:null,staff_id:null,schedule_id:null};
const many=Array.from({length:400},(_,i)=>({rank:i+1,passenger:'Passenger '+i,phone:'9000000000',trips:12-i%5,travelled:12-i%5,upcoming:0,
 seats:12,spend:15000,avg_trip:1250,cancelled:0,first_trip:'2026-01-20',last_trip:'2026-11-17',channels:'redbus, abhibus',email:'a@b.com'}));
const data={
 'frequent-travellers':{...shared,report:'frequent-travellers',min_trips:2,max_trips:null,sort:'trips',top:'500',search:'',
 summary:{passengers_label:'400 of 650',passengers:400,all_passengers:650,trips:2500,spend:1400000,avg_trip:560,upcoming:0,cancelled:10},
 sections:{rows:many,bands:[{band:'1 trip',passengers:200,share_pct:30.8,trips_taken:200,share_of_trips:5,spend:250000}]},
 totals:{rows:{rank:'Total',passenger:'400 passengers',trips:4000,spend:6000000},bands:{band:'Total',passengers:650,trips_taken:6000,spend:8000000}}},
 'point-performance':{...shared,report:'point-performance',mode:'pickup',point:'',selected_point:null,points:[{key:'gachibowli',point:'Gachibowli'}],
 summary:{points:1},sections:{ranking:[{rank:1,point:'Gachibowli',point_key:'gachibowli',pnrs:20,seats:22,
 share_pct:100,trips_booked:5,seats_per_trip:4.4,revenue:33000}],by_service:[],by_source:[],daily:[]},
 totals:{ranking:{rank:'Total',point:'1 points',pnrs:20,seats:22,revenue:33000}}},
 'station-performance':{...shared,report:'station-performance',
 summary:{seats:100,pnrs:80,revenue:110000,avg_fare:1100,station_pairs:2,stations:3,trips:4,schedules:2,
 seats_per_trip:25,end_to_end_label:'95 (95.0%)',cancelled_label:'4 (4.8%)',no_show_label:'1 (1.0%)'},
 sections:{pairs:[{from:'Hyderabad',to:'Bengaluru',pnrs:80,seats:100,share_pct:100,avg_fare:1100,revenue:110000,trips_serving:4,trips_booked:4,seats_per_trip:25,
 cancelled:4,no_shows:1,schedules:2}],boarding:[{station:'Hyderabad',pnrs:80,seats:100,share_pct:100,avg_fare:1100,revenue:110000,top_station:'Bengaluru'}],
 dropping:[],by_schedule:[],by_schedule_pairs:[],sources:[],daily:[]}},
 'trip-pnl':{...shared,report:'trip-pnl',summary:{trips:4,occupancy_pct:87.6,net_sales:100000,expense:92000,profit:8000,loss_trips:1},
 sections:{rows:[{date:from,dep:'17:30',service:'NTHB1',route:'Hyderabad → Bengaluru',bus:'Turned off',seats_label:'—',occupancy_pct:null,
 net_sales:0,expense:3000,profit:-3000}]},totals:{rows:{date:'1 trips',seats_label:'0/0',net_sales:0,expense:3000,profit:-3000}}}
};
const calls=[];
w.G={
 screens:{accounts:async el=>{el.innerHTML='<nav id="existing">Accounts tabs</nav><section data-ac10-page>Catalog</section>';}},
 query:()=>Object.fromEntries(new URLSearchParams(w.location.hash.split('?')[1]||'')),
 qs:q=>new URLSearchParams(Object.entries(q).map(([k,v])=>[k,String(v??'')])).toString(),
 get:async uri=>{
   calls.push(uri);
   if(uri.endsWith('/v22/options'))return options;
   if(uri.endsWith('/v21/options'))return options;
   const key=uri.split('?')[0].split('/').pop();return data[key]||{};
 },
 toast:()=>{},err:e=>{throw e}
};
for(const path of ['public/js/report-suite-specs-v21.js','public/js/report-suite-v21.js',
 'public/js/report-suite-specs-v22.js','public/js/report-suite-v22.js']){
 w.eval(fs.readFileSync(path,'utf8'));
}
const S=w.ReportSuiteSpecsV22;
(async()=>{
 for(const key of ['frequent-travellers','point-performance','station-performance','trip-pnl']){
   const d=data[key],def=S.DEF[key];
   root.innerHTML=w.ReportSuiteV22.render(d,options,key,{visible:300,opts:options});
   assert.ok(root.textContent.includes(def.title),'Correct page heading '+key);
   assert.equal(root.querySelectorAll('.rpt21-actions button').length,key==='frequent-travellers'?4:3,'Action buttons '+key);
   assert.equal(root.querySelectorAll('[name=from],[name=to]').length,2,'Date inputs '+key);
   assert.equal(root.querySelectorAll('.rpt21-stat').length,key==='point-performance'?0:def.metrics.length,'Metrics '+key);
   assert.equal(root.querySelectorAll('.rpt21-section').length,key==='point-performance'?1:def.sections.length,'Sections '+key);
   if(key==='point-performance')assert.ok(root.querySelector('[data-v22=pdf]').disabled);
   if(key==='frequent-travellers'){
     assert.equal(root.querySelectorAll('[data-v22=sort]').length,3);
     assert.equal(root.querySelectorAll('[data-v22=top]').length,5);
     assert.equal(root.querySelectorAll('[data-v22=preset]').length,5);
     assert.ok(root.querySelector('[data-v22=excel]'),'Excel action');
     assert.ok(root.querySelector('[data-v22=more]'),'Large list progressive rendering');
     assert.equal(root.querySelectorAll('[data-section=rows] tbody tr').length,300);
   }else{
     assert.equal(root.querySelectorAll('[data-v22=preset]').length,3);
   }
   if(key==='station-performance')assert.equal(root.querySelectorAll('.rpt21-section').length,7);
   if(key==='trip-pnl')assert.ok(root.textContent.includes('Turned off'));
   console.log('PASS UI '+key+' controls and tables');
 }
 w.location.hash='#/accounts/reports/point-performance?from='+from+'&to='+to;
 await w.G.screens.accounts(root,{tab:'reports',id:'point-performance'});
 assert.ok(root.querySelector('#existing'),'Accounts navigation preserved');
 assert.equal(root.querySelectorAll('.rpt22-pick-row').length,1,'Clickable point ranking');
 root.querySelector('.rpt22-pick-row').click();
 assert.ok(w.location.hash.includes('point=gachibowli'),'Clicking ranking navigates to selected point');
 w.location.hash='#/accounts/reports/frequent-travellers?from='+from+'&to='+to;
 await w.G.screens.accounts(root,{tab:'reports',id:'frequent-travellers'});
 root.querySelector('[data-v22=top][data-value=100]').click();
 assert.ok(w.location.hash.includes('top=100'),'Top N filter included in route');
 root.querySelector('[data-v22=more]')?.click();
 const css=fs.readFileSync('public/css/report-suite-v22.css','utf8');
 for(const token of ['.rpt22-search','.rpt22-small','.rpt22-pick-row','.rpt22-more','@media print']){
  assert.ok(css.includes(token),'Missing CSS '+token);
 }
 console.log('PASS: 4 page DOMs, controls, blue actions, clickable points, ranking, report filter routing and overflow');
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
