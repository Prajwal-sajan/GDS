'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const C=require('../public/js/seat-layout-copy-v49');
const Coach21=require('../public/js/coach-2plus1-v46');
const Coach22=require('../public/js/coach-2plus2-v47');
const base21=Coach21.build();
const date='2026-11-22';
const state21=structuredClone(base21);
const get=(code)=>state21.decks.flatMap(d=>d.seats).find(s=>s.code===code);
get('1L').status='booked_male';
get('2L').status='booked_female';
get('3U').status='booked_female';
get('1U').status='booked_male';
get('2U').status='blocked';
get('5U').status='hold';
get('6U').status='other_leg';
const payload={schedule_id:99,origin:'Hyderabad',destination:'Bengaluru',
 travel_date:date,service_number:'NTHB1',decks:state21.decks,
 website:'https://www.novembertravels.com'};
const svg=()=>C.buildSvg(payload,Coach21);
function parseSvg(s){
 const doc=new JSDOM(s,{contentType:'image/svg+xml'});
 const parser=doc.window.document;
 assert.equal(parser.querySelector('parsererror'),null,'Must be valid and parseable SVG');
 return parser;
}
test('image export matches screenshot headline, date, 4 legends and marketing footer',()=>{
 const s=svg(),doc=parseSvg(s);
 assert.ok(s.includes('Hyderabad → Bengaluru'));
 assert.ok(s.includes('Sun, 22 Nov, 2026 · NTHB1'));
 for(const x of ['Available','Male','Female','Not available'])assert.ok(s.includes(x),x);
 assert.ok(s.includes('Book at novembertravels.com'));
 assert.equal(doc.querySelectorAll('.sl49-deck').length,2);
 assert.equal(doc.querySelector('svg').getAttribute('width'),'900');
 assert.ok(Number(doc.querySelector('svg').getAttribute('height'))>1100);
 assert.ok(s.includes('radialGradient id="steering"'));
 assert.ok(s.includes('filter id="seatShadow"'));
 assert.ok(s.includes('svg')&&s.includes('stroke-linejoin="round"'));
 assert.equal(doc.querySelectorAll('.sl49-seat').length,46);
 assert.equal(doc.querySelectorAll('.sl49-deck[data-deck="LOWER"] .sl49-seat').length,28);
 assert.equal(doc.querySelectorAll('.sl49-deck[data-deck="UPPER"] .sl49-seat').length,18);
 assert.equal(doc.querySelectorAll('.sl49-legend rect').length,4);
});
test('exact 2+1 seat mapping, male blue, female pink, not available navy, white available',()=>{
 const doc=parseSvg(svg());
 const find=code=>doc.querySelector('[data-seat="'+code+'"]');
 for(const c of ['1L','2L','3L','4L','5L','6L','1','2','21','22',
 '3U','2U','1U','6U','5U','4U','18U','17U','16U'])assert.ok(find(c),c);
 assert.equal(find('1L').getAttribute('data-status'),'male');
 assert.equal(find('2L').getAttribute('data-status'),'female');
 assert.equal(find('3U').getAttribute('data-status'),'female');
 assert.equal(find('1U').getAttribute('data-status'),'male');
 for(const c of ['2U','5U','6U'])assert.equal(find(c).getAttribute('data-status'),'unavailable');
 assert.equal(find('3L').getAttribute('data-status'),'available');
 assert.equal(find('1').getAttribute('data-status'),'available');
 assert.ok(find('1L').outerHTML.includes('blueSeat'));
 assert.ok(find('2L').outerHTML.includes('pinkSeat'));
 assert.ok(find('2U').outerHTML.includes('darkSeat'));
 assert.ok(find('3L').outerHTML.includes('whiteSeat'));
 assert.ok(svg().includes('filter="url(#wheelShadow)"'));
});
test('gender classification treats other-leg and unknown-gender as unavailable',()=>{
 const f=C.status;
 assert.equal(f({status:'booked_female'}),'female');
 assert.equal(f({status:'booked_male'}),'male');
 assert.equal(f({status:'booked',booking:{gender:'F'}}),'female');
 assert.equal(f({status:'booked',booking:{gender:'M'}}),'male');
 assert.equal(f({status:'booked',booking:{gender:'Unknown'}}),'unavailable');
 assert.equal(f({status:'booked',booking:{gender:''}}),'unavailable');
 assert.equal(f({status:'available',booking:{gender:'M',overlaps:false}}),'unavailable');
 assert.equal(f({status:'other_leg',booking:{gender:'F'}}),'unavailable');
 assert.equal(f({status:'hold',booking:{gender:'F'}}),'unavailable');
 assert.equal(f({status:'no_show'}),'unavailable');
 assert.equal(f({status:'blocked'}),'unavailable');
 assert.equal(f({status:'available'}),'available');
});
test('legacy 2+1 geometry preserves every seat ID, projects to reference left-single right-paired arrangement',()=>{
 const old=structuredClone(base21);
 for(const seat of old.decks[0].seats)if(seat.type==='sleeper')seat.col=3;else seat.col-=2;
 for(const seat of old.decks[1].seats)seat.col=seat.col===0?3:seat.col===2?1:0;
 assert.ok(Coach21.isLegacy(old));
 const projected=C.resolveGeometry(old.decks,Coach21);
 const by=(deck,code)=>projected.find(d=>d.deck===deck).seats.find(s=>s.code===code);
 assert.equal(by('LOWER','1L').col,0);
 assert.equal(by('LOWER','1').col,2);
 assert.equal(by('LOWER','2').col,3);
 assert.equal(by('UPPER','3U').col,0);
 assert.equal(by('UPPER','2U').col,2);
 assert.equal(by('UPPER','1U').col,3);
 assert.equal(old.decks[0].seats[0].col,3,'Source immutable');
 const image=C.buildSvg({...payload,decks:old.decks},Coach21);
 assert.equal(parseSvg(image).querySelectorAll('.sl49-seat').length,46);
});
test('single-deck 2+2 produces 44 seats with 4-column occupied geometry & one wheel',()=>{
 const data=Coach22.build();
 const image=C.buildSvg({...payload,decks:data.decks,service_number:'SEAT22'},Coach21);
 const doc=parseSvg(image);
 assert.equal(doc.querySelectorAll('.sl49-deck').length,1);
 assert.equal(doc.querySelectorAll('.sl49-seat').length,44);
 assert.ok(doc.querySelector('[data-seat="45"]'));
 assert.ok(doc.querySelector('[data-seat="48"]'));
 assert.ok(!doc.querySelector('[data-seat="19"]'));
 assert.ok(!doc.querySelector('[data-seat="20"]'));
 assert.ok(!doc.querySelector('[data-seat="23"]'));
 assert.ok(!doc.querySelector('[data-seat="24"]'));
 assert.equal(doc.querySelectorAll('[filter="url(#wheelShadow)"]').length,1);
 assert.ok(!image.includes('UPPER'));
});
test('document is privacy-safe, XML-safe, with no price, ticket, phone, PNR or passenger name',()=>{
 const tricky=structuredClone(payload);
 tricky.origin='<script>foo</script>';
 tricky.destination='Bengaluru & "City"';
 tricky.website='javascript:alert(1)';
 tricky.decks[0].seats[0].code='S<3';
 tricky.decks[0].seats[0].booking={gender:'M',name:'Private Person',pnr:'SECRET-PNR-00001',
  phone:'9876543210',fare:1920,seat:'1L'};
 tricky.decks[0].seats[0].status='booked_male';
 const s=C.buildSvg(tricky,Coach21);
 assert.ok(s.includes('&lt;script&gt;foo&lt;/script&gt;'));
 assert.ok(s.includes('Bengaluru &amp; &quot;City&quot;'));
 assert.ok(!s.includes('<script>'));
 assert.ok(!s.includes('javascript:alert'));
 assert.ok(!s.includes('Private Person'));
 assert.ok(!s.includes('SECRET-PNR'));
 assert.ok(!s.includes('9876543210'));
 assert.ok(!s.includes('1920'));
 parseSvg(s);
});
test('reject missing/invalid layouts, duplicate IDs or off-grid seats instead of copying partial deck',()=>{
 assert.throws(()=>C.buildSvg({...payload,decks:[]}),/supported/);
 const bad=structuredClone(state21);
 bad.decks[0].seats[0].row=100;
 assert.throws(()=>C.buildSvg({...payload,decks:bad.decks}),/Invalid or duplicate/);
 const bad2=structuredClone(state21);
 bad2.decks[0].seats[1].code=bad2.decks[0].seats[0].code;
 assert.throws(()=>C.buildSvg({...payload,decks:bad2.decks}),/Invalid or duplicate/);
});
function envFor(handler){
 const events={write:0,download:0,urls:[],types:[],setTimeout:0};
 const dom=new JSDOM('<html><body></body></html>');
 const env={Coach21V46:Coach21,Blob,document:dom.window.document,
  URL:{
   createObjectURL:()=>{events.urls.push('created');return 'blob:testing'},
   revokeObjectURL:()=>events.urls.push('revoked')
  },setTimeout:(fn)=>{events.setTimeout++;fn()},
  ClipboardItem:class ClipboardItem{constructor(types){events.types=Object.keys(types);this.types=types}},
  navigator:{clipboard:{write(items){events.write++;return handler(items)}}}};
 env.document.createElement=(()=>{const orig=env.document.createElement.bind(env.document);
  return name=>{const el=orig(name);if(name.toLowerCase()==='a')el.click=()=>{events.download++};return el};
 })();
 return{env,events,dom};
}
const fakePng=async()=>new Blob([Buffer.from('89504e470d0a1a0a','hex')],{type:'image/png'});
test('real image/png clipboard is invoked synchronously within click before live refresh resolves',async()=>{
 let resume;
 const {env,events,dom}=envFor(async items=>{const b=await items[0].types['image/png'];assert.equal(b.type,'image/png')});
 const update=()=>new Promise(resolve=>{resume=resolve});
 const copying=C.copy(payload,{env,refresh:update,generate:fakePng});
 assert.equal(events.write,1,'Clipboard write must start during original user activation');
 assert.deepEqual(events.types,['image/png']);
 assert.equal(events.download,0);
 resume({schedule_id:99,decks:state21.decks});
 const result=await copying;
 assert.equal(result.copied,true);
 assert.equal(result.downloaded,false);
 assert.equal(events.download,0);
 dom.window.close();
});
test('live source schedule mismatch rejects clipboard rather than sharing the wrong trip',async()=>{
 const {env,events,dom}=envFor(async items=>{await items[0].types['image/png']});
 await assert.rejects(()=>C.copy(payload,{env,refresh:async()=>({schedule_id:999,decks:state21.decks}),generate:fakePng}),
  /another schedule/);
 assert.equal(events.download,0);
 dom.window.close();
});
test('clipboard rejection triggers a true PNG download instead of a false copied toast',async()=>{
 const {env,events,dom}=envFor(async items=>{await items[0].types['image/png'];throw new Error('NotAllowedError')});
 let fallback;
 const result=await C.copy(payload,{env,refresh:async()=>({schedule_id:99,decks:state21.decks}),
  generate:fakePng,onFallback:e=>fallback=e});
 assert.equal(events.write,1);
 assert.equal(events.download,1);
 assert.equal(events.urls.filter(x=>x==='revoked').length,1);
 assert.equal(result.copied,false);
 assert.equal(result.downloaded,true);
 assert.match(result.filename,/seat-layout-NTHB1-2026-11-22\.png/);
 assert.match(fallback.message,/NotAllowedError/);
 dom.window.close();
});
test('unsupported clipboard downloads high-resolution PNG with no stale-data fallback',async()=>{
 const {env,events,dom}=envFor(()=>{throw Error('should not call')});
 delete env.ClipboardItem;
 const result=await C.copy(payload,{env,refresh:async()=>({schedule_id:99,decks:state21.decks}),generate:fakePng});
 assert.equal(events.write,0);
 assert.equal(events.download,1);
 assert.equal(result.copied,false);
 dom.window.close();
});
test('failure to refresh current seat layout never exports stale inventory',async()=>{
 const {env,events,dom}=envFor(async items=>{await items[0].types['image/png']});
 await assert.rejects(()=>C.copy(payload,{env,refresh:async()=>{throw Error('Source offline')},generate:fakePng}),
  /Source offline/);
 assert.equal(events.download,0);
 dom.window.close();
});
test('schedule Copy button wired to live segment and reports copied / downloaded accurately',()=>{
 const html=fs.readFileSync('public/index.html','utf8');
 const schedule=fs.readFileSync('public/js/schedules-screenshot-v6.js','utf8');
 assert.ok(html.includes('/js/seat-layout-copy-v49.js?build=49'));
 assert.ok(html.indexOf('seat-layout-copy-v49.js')<html.indexOf('schedules-screenshot-v6.js?build=48'));
 for(const t of ['data-sx-copy','SeatLayoutCopyV49.copy','copy_ts:Date.now()',
   "from_city_id:S.cityFrom","to_city_id:S.cityTo","G.toast(result.copied?"]){
  assert.ok(schedule.includes(t),'missing '+t);
 }
 assert.ok(!schedule.includes("const content=allSeats().map(x=>\`\${x.code}: \${x.status}\`)"));
 assert.ok(schedule.includes("b.disabled=true;b.setAttribute('aria-busy','true')"));
 new Function(schedule);new Function(fs.readFileSync('public/js/seat-layout-copy-v49.js','utf8'));
});
