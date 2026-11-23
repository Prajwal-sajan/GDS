'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const html='<!doctype html><html><body><div id="modal-root"></div><button id="calendar-anchor"></button></body></html>';
const dom=new JSDOM(html,{url:'http://localhost/#/gds/schedules',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,document=w.document;const wait=()=>new Promise(r=>setTimeout(r,10));
const responseCalls=[],notifications=[];
const daily=Array.from({length:30},(_,i)=>({date:'2026-11-'+String(i+1).padStart(2,'0'),
  percent:i===21?94:i===22?18:i===23?50:null,services:i<24?3:0,booked_seats:i<24?4:0,capacity:i<24?6:0}));
const holidays=[{date:'2026-11-01',name:'Andhra Pradesh Formation Day',kind:'observance',source_url:'https://gov.in/1'},
 {date:'2026-11-08',name:'Diwali',kind:'gazetted',source_url:'https://gov.in/8'},
 {date:'2026-11-09',name:'Govardhan Puja',kind:'restricted',source_url:'https://gov.in/9'},
 {date:'2026-11-14',name:'Children’s Day',kind:'observance',source_url:'https://gov.in/14'},
 {date:'2026-11-24',name:'Guru Nanak Jayanti',kind:'gazetted',source_url:'https://gov.in/24'}];
const mockApi=async url=>{
 responseCalls.push(url);
 if(url==='/cities')return {cities:[{id:21,name:'Hyderabad'},{id:22,name:'Bengaluru'},{id:23,name:'Chennai'}]};
 if(url.startsWith('/schedules/month-insights?month=')){
  const month=url.split('=')[1];
  return {month,daily:month==='2026-11'?daily:[],holidays:month==='2026-11'?holidays:[],
   holidays_verified_for_year:month.startsWith('2026')};
 }
 if(url.startsWith('/routes/halts-overview')){
  const days=Number(url.split('days=')[1]||15);
  return {days,data_status:days===15?'partial_or_verified':'awaiting_verified_gps',
   totals:{pins_to_move:days===15?7:0,times_to_change:days===15?18:0},
   routes:[{id:10,service_number:'NTHB1',origin:'Hyderabad',destination:'Bengaluru',trips:days===15?11:0,
    pins_to_move:days===15?7:0,times_to_change:days===15?18:0,fine:4,waiting:7,
    provider_evidence:days===15,from_date:'2026-11-07',to_date:'2026-11-22'},
   {id:11,service_number:'NTBH1',origin:'Bengaluru',destination:'Hyderabad',trips:0,pins_to_move:0,
    times_to_change:0,fine:0,waiting:20,provider_evidence:false}]};
 }
 throw Error('Unexpected API '+url);
};
const modals=[];
const G=w.G={get:mockApi,toast:(t,k)=>notifications.push([t,k]),err:e=>{throw e},
 modal:o=>{
  const ov=document.createElement('div');ov.className='ov';ov.innerHTML=
   '<div class="md"><header class="hd"><h2>'+o.title+'</h2><button data-x>×</button></header><div class="bd">'+o.body+'</div></div>';
  document.getElementById('modal-root').appendChild(ov);
  const api={el:ov,$:s=>ov.querySelector(s),$$:s=>[...ov.querySelectorAll(s)],close:()=>ov.remove()};
  ov.querySelector('[data-x]').onclick=api.close;modals.push(api);return api;
 }};
w.eval(fs.readFileSync('public/js/schedule-insights-v36.js','utf8'));
(async()=>{
 const feature=w.ScheduleInsightsV36;assert.ok(feature);
 let last=null,cleared=null;
 let modal=await feature.openSearch({date:'2026-11-22',onSearch:x=>last=x,onClear:x=>cleared=x});
 assert.ok(modal.el.classList.contains('si36-search-modal'));
 assert.equal(modal.$('.si36-dialog-title').textContent.trim(),'Search services');
 assert.ok(modal.$('.si36-dialog-title svg'));
 assert.ok(modal.$('[data-x] svg'));
 assert.equal(modal.$('[data-si36-selected="origin"]').textContent,'All');
 assert.equal(modal.$('[data-si36-selected="destination"]').textContent,'All');
 assert.equal(modal.$('[data-si36-long]').textContent,'Sun, Nov 22, 2026');
 assert.ok(modal.$('.si36-date-entry input[type=date]'));
 assert.ok(modal.$('[data-si36-swap] svg'));
 modal.$('[data-si36-toggle="origin"]').click();
 assert.equal(modal.$('[data-si36-options="origin"]').hidden,false);
 assert.equal(modal.$$('[data-si36-option="origin"]').length,4);
 modal.$('[data-si36-find="origin"]').value='beng';
 modal.$('[data-si36-find="origin"]').dispatchEvent(new w.Event('input',{bubbles:true}));
 assert.equal(modal.$('[data-si36-option="origin"][data-value="22"]').hidden,false);
 assert.equal(modal.$('[data-si36-option="origin"][data-value="21"]').hidden,true);
 modal.$('[data-si36-option="origin"][data-value="22"]').click();
 assert.equal(modal.$('[data-si36-selected="origin"]').textContent,'Bengaluru');
 modal.$('[data-si36-toggle="destination"]').click();
 modal.$('[data-si36-option="destination"][data-value="21"]').click();
 assert.equal(modal.$('[data-si36-selected="destination"]').textContent,'Hyderabad');
 modal.$('[data-si36-swap]').click();
 assert.equal(modal.$('[data-si36-selected="origin"]').textContent,'Hyderabad');
 assert.equal(modal.$('[data-si36-selected="destination"]').textContent,'Bengaluru');
 modal.$('[data-si36-picker]').value='2026-11-24';
 modal.$('[data-si36-picker]').dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(modal.$('[data-si36-long]').textContent,'Tue, Nov 24, 2026');
 modal.$('[data-si36-submit]').click();
 assert.deepEqual(last,{date:'2026-11-24',from_city_id:'21',to_city_id:'22'});
 assert.equal(document.querySelectorAll('.si36-search-modal').length,0);
 modal=await feature.openSearch({date:'2026-11-22',onClear:x=>cleared=x});
 modal.$('[data-si36-all]').click();
 assert.deepEqual(cleared,{date:'2026-11-22'});
 let chosen=null;
 const anchor=document.getElementById('calendar-anchor');
 let cal=await feature.openCalendar({date:'2026-11-22',anchor,onPick:x=>chosen=x});
 const pop=cal.element;
 assert.ok(pop.classList.contains('si36-calendar-pop'));
 assert.ok(pop.textContent.includes('November 2026'));
 assert.equal(pop.querySelectorAll('[data-si36-date]').length,30);
 assert.ok(pop.querySelector('[data-si36-date="2026-11-22"]').classList.contains('good'));
 assert.ok(pop.querySelector('[data-si36-date="2026-11-23"]').classList.contains('low'));
 assert.ok(pop.querySelector('[data-si36-date="2026-11-24"]').classList.contains('mid'));
 assert.ok(pop.querySelector('[data-si36-date="2026-11-25"]').classList.contains('unknown'));
 assert.ok(pop.querySelector('[data-si36-date="2026-11-22"]').classList.contains('selected'));
 assert.ok(pop.querySelector('[data-si36-date="2026-11-08"]').classList.contains('holiday'));
 assert.ok(pop.textContent.includes('≥70%'));
 assert.ok(pop.textContent.includes('40–69%'));
 assert.ok(pop.textContent.includes('Govardhan Puja'));
 assert.equal(pop.querySelector('[data-si36-holiday="2026-11-09"]').textContent.includes('Govardhan Puja'),true);
 assert.ok(!pop.querySelector('[data-si36-holiday="2026-11-10"]'));
 assert.equal(pop.querySelectorAll('[data-si36-holiday]').length,5);
 assert.ok(pop.querySelector('[data-si36-cal-nav="-1"] svg'));
 assert.ok(pop.querySelector('[data-si36-cal-nav="1"] svg'));
 assert.ok(pop.querySelector('[data-si36-date="2026-11-22"]').getAttribute('title').includes('94%'));
 pop.querySelector('[data-si36-cal-nav="1"]').click();await wait();
 assert.ok(pop.textContent.includes('December 2026'));
 pop.querySelector('[data-si36-cal-nav="-1"]').click();await wait();
 assert.ok(pop.textContent.includes('November 2026'));
 pop.querySelector('[data-si36-holiday="2026-11-24"]').click();await wait();
 assert.equal(chosen,'2026-11-24');assert.equal(document.querySelectorAll('.si36-calendar-pop').length,0);
 modal=await feature.openBusHalts();await wait();
 assert.ok(modal.el.classList.contains('si36-halts-modal'));
 assert.ok(modal.el.textContent.includes('Pickup and drop points'));
 assert.ok(modal.el.textContent.includes('across 2 routes'));
 assert.ok(modal.el.textContent.includes('3 trips agree'));
 for(const heading of ['ROUTE','TRIPS','PINS TO MOVE','TIMES TO CHANGE','FINE','WAITING'])
  assert.ok(modal.el.textContent.includes(heading));
 assert.equal(modal.el.querySelectorAll('.si36-halt-table tbody tr').length,2);
 assert.ok(modal.el.textContent.includes('NTHB1'));
 assert.ok(modal.el.textContent.includes('NTBH1'));
 assert.ok(modal.$('[data-si36-open-route]').getAttribute('href').includes('/gds/routes/10'));
 modal.$('[data-si36-days]').value='7';modal.$('[data-si36-days]').dispatchEvent(new w.Event('change',{bubbles:true}));await wait();
 assert.ok(modal.el.textContent.includes('not yet connected'));
 assert.ok(modal.el.textContent.includes('Awaiting GPS evidence'));
 assert.ok(responseCalls.includes('/routes/halts-overview?days=7'));
 modal.$('[data-x]').click();
 assert.equal(document.querySelectorAll('.si36-halts-modal').length,0);
 const schedule=fs.readFileSync('public/js/schedules-screenshot-v6.js','utf8');
 const routes=fs.readFileSync('public/js/routes-screenshot-v5.js','utf8');
 const index=fs.readFileSync('public/index.html','utf8');
 assert.ok(schedule.includes('ScheduleInsightsV36.openSearch'));
 assert.ok(schedule.includes('ScheduleInsightsV36.openCalendar'));
 assert.ok(schedule.includes('from_city_id=S.filterFrom'));
 assert.ok(routes.includes('ScheduleInsightsV36.openBusHalts'));
 assert.ok(index.includes('schedule-insights-v36.js?build=36'));
 assert.ok(index.includes('schedule-insights-v36.css?build=36'));
 assert.ok(index.indexOf('schedules-screenshot-v6.js')<index.indexOf('schedule-insights-v36.js'));
 const css=fs.readFileSync('public/css/schedule-insights-v36.css','utf8');
 assert.ok(css.includes('.si36-calendar-pop')&&css.includes('.si36-search-modal')&&css.includes('.si36-halts-modal'));
 console.log('PASS v36 UI: complete search, city dropdowns and swap, date picker, filters and reset; month occupancy SVG rings and documented holidays; 7/15/30 day route halt summary, action links and loading');
})().catch(e=>{console.error(e);process.exit(1);});
