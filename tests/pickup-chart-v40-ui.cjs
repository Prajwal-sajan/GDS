'use strict';
/* v40 jsdom screenshot parity + working print/import control flow. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>',{
 url:'https://operator.example/#/gds/schedules',pretendToBeVisual:true,runScripts:'outside-only'
});
const w=dom.window,d=w.document;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const calls=[];let shareCalls=0,createdPdf=0;
w.URL.createObjectURL=blob=>{assert.ok(blob.size>0);return 'blob:example-chart-'+(++createdPdf)};
w.URL.revokeObjectURL=()=>{};
const stages=[
 {id:1,type:'pickup',name:'LB Nagar Metro Station (Free metro Pickup)',time:'17:45',day:1,city_id:1},
 {id:2,type:'pickup',name:'Uppal Metro Station (Free metro Pickup)',time:'17:48',day:1,city_id:1},
 {id:3,type:'drop',name:'Nagavara',time:'06:35',day:2,city_id:2},
 {id:4,type:'drop',name:'Bommsandra',time:'07:55',day:2,city_id:2}
];
const rows=[
 {seat:'2U',mobile:'9652140543',pnr:'095027',name:'Jayaraju Nadipalli',gender:'M',age:30,
  contact_name:'Contact 1',trips:1,from_city:'Hyderabad',to_city:'Bengaluru',
  pickup:stages[0].name,drop:'Nagavara',boarding_id:'1',dropping_id:'3',
  boarded_city_id:'1',dropped_city_id:'2',boarding_order:0,dropping_order:2,
  pickup_time:'17:45',pickup_day:1,exchange_point:'JNTU Metro station',exchange_time:'19:20',
  drop_time:'06:35',drop_day:2,fare:1994,source:'paytm',booked_on:'21/11/26 09:10 pm'},
 {seat:'21',mobile:'7995428795',pnr:'095070',name:'madhu Babu',gender:'M',age:26,
  contact_name:'Contact 2',trips:25,from_city:'Hyderabad',to_city:'Bengaluru',
  pickup:stages[1].name,drop:'Bommsandra',boarding_id:'2',dropping_id:'4',
  boarded_city_id:'1',dropped_city_id:'2',boarding_order:1,dropping_order:3,
  pickup_time:'17:48',pickup_day:1,drop_time:'07:55',drop_day:2,
  fare:1049,source:'abhibus',booked_on:'22/11/26 12:53 am'}
];
const data={service:'NTHB1',date:'2026-11-22',origin:'Hyderabad',destination:'Bengaluru',
 operator:'November Travels',vehicle:'AR 01 Q 7827',driver:'Prabhu',driver_phone:'9916623350',
 capacity:46,kind:'current',source_gds:'Current GDS',
 city_options:[{id:'all',label:'All passengers',count:2},
  {id:'boarding:1',kind:'boarding',city:'Hyderabad',count:2},
  {id:'dropping:2',kind:'dropping',city:'Bengaluru',count:2}],
 stages,rows};
const meta={service:data.service,date:data.date,operator:data.operator,
 imported:{id:8,source_gds:'Infinity ITS',file_name:'fleet-chart.pdf',count:2}};
const imported={...data,kind:'imported',source_gds:'Infinity ITS'};
const S={detail:{id:100,service_number:'NTHB1',date:'2026-11-22',
  origin:'Hyderabad',destination:'Bengaluru',travel_date:'2026-11-22',departure_time:'17:30'},
  trip:{passengers:rows}};
const api=[];
w.G={
 user:{permissions:['bookings.view_all','bookings.modify','trips.view']},
 get:async path=>{
  api.push(['GET',path]);
  if(path.endsWith('/options'))return meta;
  if(path.includes('/data'))return path.endsWith('source=imported')?imported:data;
  throw Error('Unknown API '+path);
 },
 post:async (path,body)=>{
  api.push(['POST',path,body]);if(path.endsWith('/commit'))
   return {success:true,passenger_count:2,inventory_changed:false,bookings_changed:false};
  throw Error('Unknown POST '+path);
 },
 toast:(message)=>calls.push(['TOAST',message]),
 err:error=>{calls.push(['ERROR',error.message]);throw error},
 viewAs:''
};
w.localStorage.setItem('token','qa40');
Object.defineProperty(w.navigator,'canShare',{configurable:true,value:()=>true});
Object.defineProperty(w.navigator,'share',{configurable:true,value:async payload=>{
 assert.ok(payload.files[0].name.includes('pickup-chart-'));shareCalls++;
}});
w.fetch=async (url,opts={})=>{
 api.push(['FETCH',String(url),opts.method||'GET']);
 if(String(url).includes('/preview'))return {ok:true,json:async()=>({
  preview_id:'PREVIEW40',file_name:'import.csv',source_gds:'Infinity ITS',
  detected_gds:'Infinity ITS',passenger_count:2,bytes:150,
  blocking_issues:[],warnings:[],inventory_will_change:false,
  rows:rows.map(x=>({...x}))})};
 return {ok:true,blob:async()=>new w.Blob(['%PDF-1.4 test fake bytes'],{type:'application/pdf'})};
};
w.eval(fs.readFileSync('public/js/pickup-chart-v40.js','utf8'));
const C=w.PickupChartV40;
assert.ok(C);
assert.equal(C.visibleRows({data,city:'all',chart:'pickup',pickupDrop:'trip'}).length,2);
assert.equal(C.visibleRows({data,city:'boarding:1',chart:'pickup',pickupDrop:'trip'}).length,2);
const printer=C.openPrint(S,null,null);
await delay(25);
let root=printer.root;
assert.ok(root.querySelector('.pc40-print-dialog[role=dialog]'));
for(const x of ['Pickup Chart — NTHB1','November Travels','Options','Print','Download','Share'])
 assert.ok(root.textContent.includes(x),'print dialog missing '+x);
assert.equal(root.querySelectorAll('.pc40-pickup-block').length,2,'Pickup should group by stop');
for(const x of ['Boarding Details','Dropping Details','JNTU Metro station',
 'Prabhu','AR 01 Q 7827','Booked:','Available:'])
 assert.ok(root.textContent.includes(x),'missing '+x);
assert.equal(root.querySelectorAll('[data-pc40="options"]').length,1);
assert.equal(root.querySelectorAll('.pc40-print-actions svg').length,5,'SVG on every header action');
root.querySelector('[data-pc40="options"]').click();
assert.ok(root.querySelector('.pc40-chart-settings'));
assert.equal(root.querySelectorAll('[data-pc40-field]').length,15);
const city=root.querySelector('[data-pc40-city]');
assert.ok(city.innerHTML.includes('Boarding at')&&city.innerHTML.includes('Dropping at'));
assert.ok(root.querySelectorAll('[data-pc40="chart"]').length===2);
assert.ok(root.querySelector('[data-pc40-field="trips"]').checked);
assert.ok(!root.querySelector('[data-pc40-field="age"]').checked);
root.querySelector('[data-chart="rto"]').click();
assert.ok(root.querySelector('input[name="pc40-place"][value="trip"]'));
assert.ok(root.querySelector('input[name="pc40-place"][value="passenger"]'));
assert.ok(root.querySelector('input[data-pc40-field="pickup"]').checked);
assert.ok(root.querySelector('input[data-pc40-field="drop"]').checked);
assert.ok(!root.querySelector('input[data-pc40-field="fare"]').checked);
assert.ok(root.textContent.includes('Printed:'));
assert.equal(root.querySelectorAll('.pc40-pickup-block').length,0,'RTO is flat table');
root.querySelector('input[name="pc40-place"][value="passenger"]').click();
root.querySelector('input[name="pc40-place"][value="passenger"]').dispatchEvent(new w.Event('change',{bubbles:true}));
assert.equal(C.visibleRows({data,city:'all',chart:'rto',pickupDrop:'passenger'})[0].drop,'Nagavara');
assert.equal(C.visibleRows({data,city:'all',chart:'rto',pickupDrop:'trip'})[0].drop,'Bommsandra');
root.querySelector('[data-pc40="share-pdf"]').click();
await delay(30);
assert.equal(shareCalls,1,'Share must pass actual PDF File to OS native sheet');
root.querySelector('[data-pc40="download-pdf"]').click();
await delay(25);
assert.ok(createdPdf>=1,'Download must create a PDF URL');
assert.ok(api.some(x=>x[0]==='FETCH'&&x[1].includes('.pdf?chart=rto')));
root.querySelector('[data-pc40-close]').click();
assert.ok(!d.querySelector('.pc40-print-dialog'));
const importer=C.openImport(S,null,null);
root=importer.root;
assert.ok(root.querySelector('.pc40-import-dialog'));
for(const x of ['Import pickup chart','AUTO','Which GDS is this tripsheet from?',
 'Select your GDS','Drag a tripsheet PDF or browse','15 MB'])
 assert.ok(root.textContent.includes(x),'Import popup missing '+x);
assert.ok(root.querySelector('.pc40-upload-zone'));
assert.ok(root.querySelector('[data-pc40="browse"]').disabled);
root.querySelector('[data-pc40="toggle-gds"]').click();
assert.equal(root.querySelectorAll('[data-pc40="select-gds"]').length,4);
for(const x of ['Bitla TicketSimply','EzeeInfo','Infinity ITS','Detect automatically'])
 assert.ok(root.textContent.includes(x),'Missing GDS option '+x);
root.querySelector('[data-gds="Infinity ITS"]').click();
assert.ok(!root.querySelector('[data-pc40="browse"]').disabled);
const file=new w.File(['Seat,PNR,Name\n2U,095027,Test'], 'import.csv',{type:'text/csv'});
const inp=root.querySelector('[data-pc40-file]');
Object.defineProperty(inp,'files',{configurable:true,value:[file]});
inp.dispatchEvent(new w.Event('change',{bubbles:true}));
await delay(30);
assert.ok(root.querySelector('.pc40-import-preview'));
assert.ok(root.textContent.includes('Review extracted chart'));
assert.ok(root.querySelector('[data-pc40="confirm-import"]'));
root.querySelector('[data-pc40="confirm-import"]').click();
await delay(25);
assert.ok(root.querySelector('.pc40-import-success'));
assert.ok(root.textContent.includes('Live GDS bookings and seat inventory remain unchanged'));
assert.ok(api.some(x=>x[0]==='POST'&&x[1].endsWith('/commit')&&x[2].confirm===true));
root.querySelector('[data-pc40="print-imported"]').click();
await delay(30);
assert.ok(d.querySelector('.pc40-print-dialog'));
assert.ok(api.some(x=>x[0]==='GET'&&x[1].endsWith('source=imported')));
assert.equal(d.querySelectorAll('.pc40-overlay').length,1,'No stacked modal leftovers');
d.querySelector('[data-pc40-close]').click();
const page=fs.readFileSync('public/index.html','utf8');
const v38=fs.readFileSync('public/js/schedule-bookings-v38.js','utf8');
const css=fs.readFileSync('public/css/pickup-chart-v40.css','utf8');
assert.ok(page.includes('/css/pickup-chart-v40.css?build=40'));
assert.ok(page.includes('/js/pickup-chart-v40.js?build=40'));
assert.ok(page.indexOf('pickup-chart-v40.js')<page.indexOf('/js/main.js'));
assert.ok(v38.includes('PickupChartV40.openPrint(S,V,ctx)'));
assert.ok(v38.includes('PickupChartV40.openImport(S,V,ctx)'));
assert.ok(!v38.includes("case 'print':window.print()"));
assert.ok(css.includes('.pc40-chart-settings'));
assert.ok(css.includes('.pc40-source-list'));
assert.ok(css.includes('@media(max-width:850px)'));
console.log('PASS v40 UI: screenshot header/SVG, Import GDS selector/dropzone/preview/confirm, Pickup & RTO options, city/field/radio filters, grouped charts and summaries, native share, download and imported reference flow');
dom.window.close();
