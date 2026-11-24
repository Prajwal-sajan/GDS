'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),os=require('node:os'),fs=require('node:fs');
const express=require('express'),{JSDOM}=require('jsdom');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gds-share-v50-'));
process.env.GDS_DATA_DIR=tmp;
process.env.GDS_RESEED='1';
const db=require('../server/db'),Auth=require('../server/auth');
const app=express();app.use(express.json({limit:'10mb'}));
require('../server/seed').seed();
app.use('/api',Auth.middleware);
app.use('/api',require('../server/api/schedule-booking-share-v50'));
app.use('/api',require('../server/api/configuration-v30'));
const Share=require('../server/api/schedule-booking-share-v50');
const Client=require('../public/js/schedule-booking-share-v50');
const owner=db.col('users').find(u=>u.role==='owner');
assert.ok(owner);
const route=db.col('routes').find(r=>String(r.origin_city_id)==='107258'&&String(r.destination_city_id)==='102257');
assert.ok(route,'Seed should include Hyderabad→Bengaluru route');
const live=db.col('schedules').find(s=>String(s.route_id)===String(route.id)&&s.status==='active');
assert.ok(live,'Seed should include active Hyderabad→Bengaluru schedule');
const exampleSchedule={...live,status:'active',travel_date:'2026-11-22'};
const base='https://novembertravels.com/bus/search/';
let server,endpoint;
test.before(async()=>{
 server=await new Promise(resolve=>{const x=app.listen(0,'127.0.0.1',()=>resolve(x))});
 endpoint='http://127.0.0.1:'+server.address().port+'/api';
});
test.after(async()=>{
 if(server)await new Promise(resolve=>server.close(resolve));
 fs.rmSync(tmp,{recursive:true,force:true});
});
async function req(method,path,body,user=owner){
 const token=Auth.sign({uid:user.id,exp:Date.now()+900000});
 const response=await fetch(endpoint+path,{method,headers:{
  Authorization:'Bearer '+token,'Content-Type':'application/json'
 },...(body===undefined?{}:{body:JSON.stringify(body)})});
 const txt=await response.text();let data=txt;
 try{data=JSON.parse(txt)}catch(_){}
 return {status:response.status,body:data,headers:response.headers};
}
test('example message is character-for-character correct for Nov 22 route IDs',()=>{
 const out=Share.createShare({schedule:exampleSchedule,route,
  fromCityId:107258,toCityId:102257,bookingBase:base});
 const expected='Hyderabad → Bengaluru on Sun, 22 Nov, 2026 — pick your seat and book: '+
  'https://novembertravels.com/bus/search/?fromCity=107258&toCity=102257&journeyDate=2026-11-22';
 assert.equal(out.message,expected);
 assert.equal(out.booking_url,expected.split(': ').at(-1));
 assert.equal(out.service_number,route.service_number);
 assert.equal(out.link_type,'route_date_search');
 assert.equal(out.preselects_service,false);
 assert.ok(out.note.includes('Select the desired service'));
});
test('shared internal city ID selected in the current schedule segment controls the actual search link',()=>{
 const out=Share.createShare({schedule:exampleSchedule,route,
  fromCityId:107258,toCityId:105258,bookingBase:base});
 assert.equal(out.from_city_id,'107258');
 assert.equal(out.to_city_id,'105258');
 assert.ok(out.message.startsWith('Hyderabad → Kurnool'));
 assert.ok(out.booking_url.includes('toCity=105258'));
 assert.ok(!out.booking_url.includes('toCity=102257'));
 assert.ok(out.booking_url.endsWith('journeyDate=2026-11-22'));
});
test('via-city boarding on Day 2 moves passenger search date without altering the service start date',()=>{
 const out=Share.createShare({schedule:exampleSchedule,route,
  fromCityId:105258,toCityId:102257,bookingBase:base});
 assert.equal(out.origin,'Kurnool');
 assert.equal(out.destination,'Bengaluru');
 assert.equal(out.journey_date,'2026-11-23');
 assert.equal(out.service_travel_date,'2026-11-22');
 assert.ok(out.message.startsWith('Kurnool → Bengaluru on Mon, 23 Nov, 2026'));
 assert.ok(out.booking_url.includes('fromCity=105258'));
 assert.ok(out.booking_url.includes('journeyDate=2026-11-23'));
 assert.equal(Share.boardingDate('2026-11-30',2),'2026-12-01');
});
test('invalid city pair, disabled schedule, cancelled service and missing operator website rejected',()=>{
 const create=(o={})=>Share.createShare({schedule:exampleSchedule,route,
  fromCityId:107258,toCityId:102257,bookingBase:base,...o});
 for(const data of [{fromCityId:999999},{toCityId:107258},
  {fromCityId:102257,toCityId:107258},{fromCityId:105258,toCityId:105258}]){
  assert.throws(()=>create(data),err=>err.status===400);
 }
 assert.throws(()=>create({bookingBase:''}),err=>err.status===409);
 assert.throws(()=>create({schedule:{...exampleSchedule,status:'inactive'}}),err=>err.status===409);
 assert.throws(()=>create({schedule:{...exampleSchedule,trip_status:'cancelled'}}),err=>err.status===409);
 assert.throws(()=>create({route:{...route,status:'inactive'}}),err=>err.status===409);
});
test('unsafe domains / credentials / fragments / query and non-HTTPS links are rejected',()=>{
 for(const value of ['http://novembertravels.com/bus/search/',
  'https://user:pass@novembertravels.com/bus/search/',
  'https://novembertravels.com/bus/search/?a=5',
  'https://novembertravels.com/bus/search/#fragment',
  'javascript:alert(1)','https://localhost/bus/search/',
  'https://192.168.1.10/bus/search/',
  'https://[::1]/bus/search/',
  'https://novembertravels.com:8443/bus/search/',
  'https://novembertravels.com /bus/search/']){
  assert.throws(()=>Share.validateBase(value),{status:400},value);
 }
 assert.equal(Share.validateBase('https://novembertravels.com/bus/search/').toString(),base);
});
test('datetime formats stable and reject impossible dates',()=>{
 assert.equal(Share.dateLabel('2026-11-22'),'Sun, 22 Nov, 2026');
 assert.equal(Share.dateLabel('2026-11-24'),'Tue, 24 Nov, 2026');
 assert.throws(()=>Share.dateLabel('2026-02-30'));
 assert.throws(()=>Share.dateLabel('bad-date'));
});
test('HTTP 409 when operator booking site has not been configured; no invented GDS hash',async()=>{
 const out=await req('GET','/schedules/'+live.id+'/booking-share?from_city_id=107258&to_city_id=102257');
 assert.equal(out.status,409);
 assert.match(out.body.message,/Settings/);
 assert.ok(!out.body.booking_url);
 assert.equal(out.headers.get('cache-control'),'private, no-store, max-age=0');
});
test('Website configuration saves the actual HTTPS search page; request returns correct share URL without internal GDS origin',async()=>{
 const update=await req('PUT','/settings/config-v30/website',{booking_search_url:base});
 assert.equal(update.status,200,JSON.stringify(update.body));
 assert.equal(db.meta('config_v30').website.booking_search_url,base);
 const out=await req('GET','/schedules/'+live.id+'/booking-share?from_city_id=107258&to_city_id=102257');
 assert.equal(out.status,200,JSON.stringify(out.body));
 assert.equal(out.body.origin,'Hyderabad');assert.equal(out.body.destination,'Bengaluru');
 assert.equal(out.body.journey_date,live.travel_date);
 assert.equal(out.body.from_city_id,'107258');
 assert.equal(out.body.to_city_id,'102257');
 assert.equal(out.body.preselects_service,false);
 assert.match(out.body.booking_url,/^https:\/\/novembertravels\.com\/bus\/search\/\?/);
 assert.ok(!out.body.message.includes('127.0.0.1'));
 assert.ok(!out.body.message.includes('#/gds'));
 assert.ok(out.body.message.endsWith(out.body.booking_url));
 assert.equal(out.headers.get('cache-control'),'private, no-store, max-age=0');
});
test('invalid configuration PUT rejected server-side and previous valid website preserved',async()=>{
 const old=db.meta('config_v30').website.booking_search_url;
 const out=await req('PUT','/settings/config-v30/website',{booking_search_url:'http://untrusted.invalid/'});
 assert.equal(out.status,400);
 assert.equal(db.meta('config_v30').website.booking_search_url,old);
});
test('share access requires schedule permission and respects active route',async()=>{
 const user=db.col('users').find(u=>u.role==='driver'||u.role==='helper');
 if(user){
  const out=await req('GET','/schedules/'+live.id+'/booking-share',undefined,user);
  assert.equal(out.status,403);
 }
 const missing=await req('GET','/schedules/99999999999/booking-share');
 assert.equal(missing.status,404);
 const invalid=await req('GET','/schedules/'+live.id+'/booking-share?from_city_id=102257&to_city_id=107258');
 assert.equal(invalid.status,400);
});
test('route code and website logo preview are external WhatsApp behavior; plaintext message has no PNR or passenger data',()=>{
 const value=Share.createShare({schedule:exampleSchedule,route,bookingBase:base});
 assert.ok(!/phone|otp|contact|pnr|passenger/i.test(value.message));
 assert.ok(value.message.includes('pick your seat and book:'));
 assert.ok(value.booking_url.includes('journeyDate=2026-11-22'));
 assert.equal(value.link_type,'route_date_search');
});
function browserEnv(write,writeText){
 const document=new JSDOM('<html><body><textarea id="manual"></textarea></body></html>').window.document;
 const seen={write:0,writeText:0,types:[]};
 const env={document,Blob,ClipboardItem:class Item{
  constructor(parts){this.items=parts;seen.types=Object.keys(parts)}
 },navigator:{clipboard:{
  write:async items=>{seen.write++;return write(items)},
  writeText:async msg=>{seen.writeText++;return writeText(msg)}
 }}};
 return{env,seen};
}
const payload={booking_url:'https://novembertravels.com/bus/search/?fromCity=107258&toCity=102257&journeyDate=2026-11-22',
 message:'Hyderabad → Bengaluru on Sun, 22 Nov, 2026 — pick your seat and book: '+
  'https://novembertravels.com/bus/search/?fromCity=107258&toCity=102257&journeyDate=2026-11-22',
 link_type:'route_date_search'};
test('ClipboardItem text/plain write starts synchronously before deferred server response',async()=>{
 let deliver;
 const pending=new Promise(resolve=>{deliver=resolve});
 const {env,seen}=browserEnv(async items=>{
  const blob=await items[0].items['text/plain'];
  assert.equal(blob.type,'text/plain');
  assert.equal(await blob.text(),payload.message);
 },()=>{throw Error('writeText should not run')});
 const awaited=Client.copy(()=>pending,{env});
 assert.equal(seen.write,1,'clipboard write must start inside user click activation');
 assert.deepEqual(seen.types,['text/plain']);
 deliver(payload);
 const out=await awaited;
 assert.equal(out.copied,true);
 assert.equal(out.manual,false);
 assert.equal(seen.writeText,0);
});
test('fallback writeText preserves exact message after ClipboardItem rejection',async()=>{
 const {env,seen}=browserEnv(()=>{throw new Error('NotAllowedError')},msg=>{
  assert.equal(msg,payload.message);
 });
 const out=await Client.copy(async()=>payload,{env});
 assert.equal(seen.write,1);
 assert.equal(seen.writeText,1);
 assert.equal(out.copied,true);
 assert.equal(out.manual,false);
});
test('when clipboard denied entirely, visible manually selectable message is given instead of false copied toast',async()=>{
 const {env,seen}=browserEnv(()=>{throw Error('NotAllowedError')},()=>{throw Error('NotAllowedError')});
 const out=await Client.copy(async()=>payload,{env});
 assert.equal(out.copied,false);
 assert.equal(out.manual,true);
 const html=Client.fallbackMarkup(out.message);
 assert.ok(html.includes('readonly'));
 assert.ok(html.includes('data-sx50-copy'));
 assert.ok(html.includes('select a particular bus'));
 assert.ok(html.includes('&amp;toCity=102257'));
 assert.equal(seen.write,1);
});
test('client validates remote message before sending anything into clipboard',async()=>{
 const {env}=browserEnv(async items=>{await items[0].items['text/plain']},()=>{});
 await assert.rejects(()=>Client.copy(async()=>({...payload,booking_url:'javascript:alert(1)'}),{env}));
 await assert.rejects(()=>Client.copy(async()=>({...payload,message:'Wrong host'}),{env}));
});
test('manual Copy action uses writeText on its own click gesture',async()=>{
 const {env,seen}=browserEnv(()=>{},msg=>assert.equal(msg,payload.message));
 const ok=await Client.copyDirect(payload.message,{env,selectedElement:env.document.getElementById('manual')});
 assert.equal(ok,true);assert.equal(seen.writeText,1);
});
test('wiring: script order, share handler, website configuration and link query fields',()=>{
 const html=fs.readFileSync('public/index.html','utf8');
 const schedule=fs.readFileSync('public/js/schedules-screenshot-v6.js','utf8');
 const cfg=fs.readFileSync('public/js/configuration-v30.js','utf8');
 const api=fs.readFileSync('server/index.js','utf8');
 assert.ok(html.includes('schedule-booking-share-v50.js?build=50'));
 assert.ok(html.indexOf('schedule-booking-share-v50.js')<html.indexOf('schedules-screenshot-v6.js?build=48'));
 assert.ok(api.includes("require('./api/schedule-booking-share-v50')"));
 for(const token of ['data-sx-share',"'sxShare' in d","ScheduleBookingShareV50.copy",
   "from_city_id:S.cityFrom","to_city_id:S.cityTo","ScheduleBookingShareV50.fallbackMarkup",
   "data-sx50-copy"]){
  assert.ok(schedule.includes(token),'Missing '+token);
 }
 assert.ok(!schedule.includes('Copy the link to this schedule:'));
 assert.ok(cfg.includes("textField('booking_search_url'"));
 assert.ok(fs.readFileSync('server/api/configuration-v30.js','utf8').includes('booking_search_url'));
 new Function(schedule);new Function(cfg);
});
