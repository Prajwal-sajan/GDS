'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const front = read('public/js/routes-screenshot-v5.js');
const css = read('public/css/routes-fares-v42.css');
const domain = read('server/domain.js');
const api = read('server/api/master.js');
const index = read('public/index.html');
const take = (src,a,b) => {
  const start = src.indexOf(a);
  const end = src.indexOf(b,start + a.length);
  assert(start>=0&&end>start,'Missing function boundaries: '+a);
  return src.slice(start,end);
};
new Function(front);
new Function(domain);
new Function(api);
assert(index.includes('/css/routes-fares-v42.css?build=42'));
assert(index.includes('/js/routes-screenshot-v5.js?build=42'));
for(const label of ['NAME','SEAT IDS','− / +','AUTO','Name (optional)','Increase','Decrease','Delete this rule','Save fare rules','Save Fares','rule-preview-day:','rf42-ruleprices','rf42-change-input'])
  assert(front.includes(label),'Missing Routes Fares UI: '+label);
for(const label of ['rf42-deck','rf42-wheel','rf42-exit','rf42-seat','rf42-faretable','rf42-rule-detail'])
  assert(css.includes(label),'Missing screenshot style '+label);
const asArray=x=>Array.isArray(x)?x:[];
const N=x=>Number(x)||0;
const E=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DOW=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const lower=[...Array.from({length:22},(_,i)=>({code:String(i+1),deck:'LOWER',type:'seater'})),...Array.from({length:6},(_,i)=>({code:(i+1)+'L',deck:'LOWER',type:'sleeper'}))];
const upper=Array.from({length:18},(_,i)=>({code:(i+1)+'U',deck:'UPPER',type:'sleeper'}));
const coach={layout:{decks:[{deck:'LOWER',seats:lower},{deck:'UPPER',seats:upper}]}};
const actualSeats=c=>c.layout.decks.flatMap(deck=>deck.seats);
const groupSrc=take(front,'function fareGroups(){','function fareBusDiagram(');
const groupFn=new Function('model','asArray','actualSeats','coach','N','DOW',groupSrc+'return fareGroups;')({fare_groups:[]},asArray,actualSeats,()=>coach,N,DOW);
const groups=groupFn();
assert.equal(groups.length,6);
assert.deepEqual(groups.map(g=>g.name),['SLB','SLB','DUB','DIS1','SS','DIS1']);
assert.deepEqual(groups[0].days,[1400,1200,1300,1450,1650,1250,2200]);
assert.deepEqual(groups[3].seats,['16U','17U']);
assert.deepEqual(groups[5].seats,['21','22']);
assert.equal(groups.reduce((n,g)=>n+g.seats.length,0),46);
assert.equal(new Set(groups.flatMap(g=>g.seats)).size,46);
const diagramSrc=take(front,'function fareBusDiagram(', 'function fares(){');
const renderDiagram=new Function('asArray','actualSeats','fareGroups','busDeck','DOW','activeDay','model','N','E',
 diagramSrc+'return fareBusDiagram;')(asArray,actualSeats,groupFn,()=>'<div class="fallback">Generic coach</div>',DOW,'Sun',{fares:[{seater:750,sleeper_lower:1000,sleeper_upper:1200}]},N,E);
const html=renderDiagram(coach,{groups,selected:['2L','3L','6U','9U','12U'],day:'Sun',delta:100,showPreview:true});
assert.equal((html.match(/data-rv-seat=/g)||[]).length,46);
for(const key of ['LOWER','UPPER','rf42-wheel','rf42-exit','rf42-class-slb','rf42-class-dub','rf42-class-dis1','rf42-preview'])
 assert(html.includes(key),'Diagram missing '+key);
for(const code of ['1L','6L','1','22','1U','2U','3U','17U','18U'])assert(html.includes('data-rv-seat="'+code+'"'),'Seat omitted: '+code);
const fareSrc=take(domain,'function fareFor(', 'function commissionPct(');
const U={dow:date=>new Date(date+'T00:00:00Z').getUTCDay(),round2:n=>Math.round(n*100)/100};
const record={id:1,origin_city_id:10,destination_city_id:20,
 fares:[{from_city_id:10,to_city_id:20,seater:750,sleeper_lower:1000,sleeper_upper:1200},{from_city_id:10,to_city_id:15,seater:400,sleeper_lower:500,sleeper_upper:600}],
 fare_groups:[{name:'SLB',seats:['1L'],days:[1400,1200,1300,1450,1650,1250,2200]}],
 seat_fare_rules:[{kind:'percent',value:10,seats:['1L'],days:['Fri']},{kind:'amount',value:100,seats:['1L'],days:[]}]};
const db={col:()=>({get:()=>record})};
const seatClass=s=>/U$/.test(s.code)?'sleeper_upper':/L$/.test(s.code)?'sleeper_lower':'seater';
const baseFare=(r,s,from,to,cls)=>(s?.fare_override||r.fares).find(f=>f.from_city_id==from&&f.to_city_id==to)?.[cls]||0;
const fareFor=new Function('db','U','baseFare','seatClass',fareSrc+'return fareFor;')(db,U,baseFare,seatClass);
assert.equal(fareFor({route_id:1,travel_date:'2026-11-20'},{code:'1L'},10,20),1915);
assert.equal(fareFor({route_id:1,travel_date:'2026-11-23'},{code:'1L'},10,20),1500);
assert.equal(fareFor({route_id:1,travel_date:'2026-11-20'},{code:'1L'},10,15),1007.5);
assert.equal(fareFor({route_id:1,travel_date:'2026-11-20',fare_override:[{from_city_id:10,to_city_id:20,sleeper_lower:800}]},{code:'1L'},10,20),980);
assert(api.includes('verifyFarePayload(req.body,rt)'));
console.log('PASS Routes Fares v42: screenshot controls, all 46 seat positions, six groups, weekday previews, fare engine, fare override, schema validation');
