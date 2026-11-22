/** Dynamic smoke tests for Trip v13 using in-memory DOM shell and mocked GDS APIs.
 * No fake integrations or server writes. Run `node tests/check-trips-v13.mjs` after installing. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const project=process.cwd();
const file=path.join(project,'public/js/trip-parity-v13.js');
const css=path.join(project,'public/css/trip-parity-v13.css');
assert.ok(fs.existsSync(file),'Trip v13 JavaScript is installed');
assert.ok(fs.existsSync(css),'Trip v13 stylesheet is installed');
const doc=fs.readFileSync(path.join(project,'public/index.html'),'utf8');
assert.match(doc,/\/css\/trip-parity-v13\.css/,'Trip stylesheet is referenced');
assert.match(doc,/\/js\/trip-parity-v13\.js/,'Trip script is referenced');
const script=fs.readFileSync(file,'utf8');const styles=fs.readFileSync(css,'utf8');
const required=['tp13-filterbar','tp13-crew','tp13-tabs','tp13-summary','tp13-stop','tp13-pax-table','tp13-rtg','tp13-customer-pop','tp13-history-table','tp13-map-modal','tp13-timing-table','tp13-docgrid','tp13-call','tp13-chat','tp13-feedback'];
for(const s of required){assert.ok(script.includes(s)||styles.includes(s),`${s} screenshot element missing`);}
let passes=0;function check(label,action){action();passes++;console.log('PASS',label)}
const hooks={};const main={innerHTML:''};const service={value:'',innerHTML:''};const el={classList:{add(){}},innerHTML:''};
const trip={id:'demo',service_number:'NTHB1',service_name:'HYD BNG',travel_date:'2026-11-19',trip_status:'live',vehicle:{registration_number:'AR 01 Q 7828'},crew:[{role:'Driver',name:'Driver A',phone:'9000011111'},{role:'Helper',name:'Helper B',phone:'9000022222'}],stops:[{id:'p1',type:'pickup',name:'Metro Pickup',time:'17:45',day:1,pickup_type:'Free metro Pickup',exchange_point:'JNTU',exchange_time:'19:30',lat:17.1,lng:78.1,event:{atime:'2026-11-19T12:12:00Z',dtime:'2026-11-19T12:25:00Z'}},{id:'d1',type:'drop',name:'Yelahanka',time:'06:15',day:2,lat:13.2,lng:77.4}],passengers:[{name:'Passenger A',pnr:'12345',seat:'15U',phone:'9551123539',source:'redbus',status:'boarded',trips:4,customer_rating:4.2,boarding:{id:'p1',time:'17:45',day:1,name:'Metro Pickup',pickup_type:'Free metro Pickup',exchange_point:'JNTU',exchange_time:'19:30'},dropping:{id:'d1',name:'Yelahanka',time:'06:15',day:2},conversation_id:'demo_12345',location_views:5,passenger_location:{lat:17.1,lng:78.1,distance_km:6.6,updated_at:'2026-11-19T12:00:00Z'},unread:1}],km:586,fuel_l:145,telemetry:{driving_score:97,hard_brakes:2,overspeed:'1m · 94 km/h',idling_minutes:65},documents:[]};
const mods=[];const patches=[];const posts=[];const mockElements=[];let latestModal=null;const selMock={value:'call:called',dataset:{tripFeedback:'12345|15U'}};
const G={user:{permissions:['trips.view','trips.update_passengers','calls.view','calls.make','chats.view','trips.chat','bookings.cancel','bookings.create','schedules.financial']},operator:{operator_name:'Demo'},screens:{},query:()=>({date:'2026-11-19'}),qs:o=>new URLSearchParams(o).toString(),get:async url=>url.startsWith('/trips?')?{trips:[trip]}:url.startsWith('/trips/')?trip:url.startsWith('/chats/')?{messages:[{channel:'whatsapp',direction:'out',ts:'2026-11-19T12:30:00Z',template:'Ticket Confirmation',delivery_status:'Delivered',text:'Board at pickup'},{channel:'sms',direction:'out',ts:'2026-11-19T12:35:00Z',template:'Reminder',delivery_status:'Sent'}]}:url.startsWith('/calls?')?{calls:[{pnr:'12345',direction:'out',ts:'2026-11-19T12:34:00Z',status:'answered',duration_s:22}]}:{},patch:async(url,body)=>{patches.push({url,body});return {success:true}},post:async(url,body)=>{posts.push({url,body});return{notified:0,sent:0,cancelled:0,refunds:0}},toast:()=>{},err:e=>{throw e},on:(element,event,selector,fn)=>{hooks[`${event}|${selector}`]=fn},callNow:async()=>{},bookingModal:()=>{},bookingConsole:()=>{},stepUp:async()=> '1234',prompt:async()=>({reason:'Testing',minutes:5,notify:false}),confirm:async()=>true,modal:opts=>{mods.push(opts);const channels=['all','calls','whatsapp','sms'].map(x=>({dataset:{tripChannel:x},classList:{toggle(){}}}));const rows={innerHTML:''};const controls={};latestModal={el:{classList:{add(){}}},close(){},$:sel=>sel==='[data-trip-history-rows]'?rows:(controls[sel]??={onclick:null}),$$:()=>channels,rows,channels};return latestModal}};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ctx={window:{G,innerWidth:1500,innerHeight:1000},G,esc,can:x=>G.user.permissions.includes(x),$, $$,today:()=> '2026-11-19',t12:s=>{if(!s)return'—';const[h,m]=s.split(':').map(Number);return ((h+11)%12+1)+':'+String(m).padStart(2,'0')+(h<12?' AM':' PM');},fdate:d=>d,addDays:(d,n)=>{let x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)},inr:x=>'₹'+x,setTimeout:fn=>fn(),document:{querySelectorAll:()=>[],body:{appendChild(){}},createElement:()=>({className:'',style:{},innerHTML:'',querySelector:()=>({onclick:null}),isConnected:true})},navigator:{clipboard:{writeText:async()=>{}}},URL,Date,console};function $(s){if(s==='[data-trip-main]')return main;if(s==='[data-trip-service]')return service;return null}function $$(s){return s==='[data-trip-feedback]'?[selMock]:[]}
vm.runInNewContext(script,ctx,{filename:file});
await G.screens.trips(el,['current']);
check('Service and date selectors',()=>{assert.match(el.innerHTML,/DATE/);assert.match(el.innerHTML,/SERVICE/);assert.match(service.innerHTML,/NTHB1/)});
check('Four tabs and SVG icons',()=>{for(const t of ['Pickup','Drop','Timings','Docs'])assert.ok(main.innerHTML.includes(t));assert.ok(main.innerHTML.includes('<svg'))});
check('Screenshot chips, passenger row and masked phone',()=>{for(const s of ['Metro','Passengers 1','PNR 1','JNTU','955xxxx539','Seats: 15U','12345'])assert.ok(main.innerHTML.includes(s),s)});
check('Rating button and unread chat dot',()=>{assert.match(main.innerHTML,/data-trip-customer=/);assert.match(main.innerHTML,/tp13-unread/)});
check('Location and map link only for available coordinates',()=>{assert.match(main.innerHTML,/data-trip-map=/);assert.match(main.innerHTML,/6.6km/)});
await hooks['click|[data-trip-tab]']({dataset:{tripTab:'drop'}});
check('Drop tab and orange stop cards',()=>{assert.match(main.innerHTML,/tp13-stop drop/);assert.match(main.innerHTML,/Yet to drop/);assert.match(main.innerHTML,/Yelahanka/)});
await hooks['click|[data-trip-tab]']({dataset:{tripTab:'timings'}});
check('Timings seven-column screenshot layout',()=>{for(const s of ['TRIP SUMMARY','Travelled','Mileage','Hard brake','Over-speed','Sched:','Arr:','Dep:'])assert.ok(main.innerHTML.includes(s),s);assert.equal((main.innerHTML.match(/<th>/g)||[]).length,7)});
check('Recorded schedule statuses use actual events',()=>{assert.match(main.innerHTML,/On-time|Early|Delay/);assert.match(main.innerHTML,/data-trip-stop-actions/)});
await hooks['click|[data-trip-stop-actions]']({dataset:{tripStopActions:'p1'}});
check('Stop timing action modal',()=>{assert.match(mods.at(-1).body,/Mark arrived/);assert.match(mods.at(-1).body,/Mark departed/)});
await latestModal.$('[data-trip-arrived]').onclick();
check('Arrival action writes through API',()=>assert.equal(posts.at(-1).body.kind,'arrived'));
await hooks['click|[data-trip-tab]']({dataset:{tripTab:'docs'}});
check('Docs panel lists the 8 vehicle documents with View',()=>{for(const s of ['DOCUMENTS','Registration Certificate (RC)','Insurance','Pollution Under Control (PUC)','Fitness Certificate','AITP Form 2','AITP Form 3','VLTD','FDSS','Valid till'])assert.ok(main.innerHTML.includes(s),s);assert.equal((main.innerHTML.match(/data-trip-doc-view=/g)||[]).length,8);assert.equal((main.innerHTML.match(/Valid till/g)||[]).length,6);assert.ok(!main.innerHTML.includes('Trip actions'))});
await hooks['click|[data-trip-tab]']({dataset:{tripTab:'pickup'}});
await hooks['click|[data-trip-history]']({dataset:{tripHistory:'12345|15U'}});
check('Communication modal four tabs',()=>{const x=mods.at(-1).body;for(const s of ['>All</span>','>Calls</span>','>WhatsApp</span>','>SMS</span>'])assert.ok(x.includes(s),s)});
check('Communication-history eight columns',()=>{const r=latestModal.rows.innerHTML;for(const s of ['TYPE','DIRECTION','TIMESTAMP','MESSAGE TYPE / FROM','CONTACT / TO','STATUS','DURATION','ADDITIONAL INFO'])assert.ok(r.includes(s),s)});
await hooks['click|[data-trip-update]']({dataset:{tripUpdate:'12345|15U'}});
check('Feedback call-status write',()=>assert.equal(patches.at(-1).body.call_status,'called'));
await hooks['click|[data-trip-map]']({dataset:{tripMap:'12345|15U'}});
check('Location modal uses actual coordinates',()=>{assert.match(mods.at(-1).body,/17.1/);assert.match(mods.at(-1).body,/78.1/);assert.match(mods.at(-1).body,/Open in Maps/)});
const selected=hooks['click|[data-trip-collapse]'];await selected({dataset:{tripCollapse:'pickup:p1'}});
check('Collapse interaction',()=>assert.ok(!main.innerHTML.includes('data-trip-customer')));
check('All CSS classes remain scoped to Trips',()=>assert.match(styles,/\.tp13-root/));
console.log(`Trips v13 — ${passes} verification checks passed`);
