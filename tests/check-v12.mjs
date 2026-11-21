// Dependency-free smoke audit for installed screenshot overlays.
import fs from 'node:fs';import assert from 'node:assert/strict';import vm from 'node:vm';
let base=process.cwd();let index=fs.readFileSync(base+'/public/index.html','utf8');
for(let p of ['dailyops-parity-v12.js','sarathi-parity-v12.js']){let f=base+'/public/js/'+p;assert(fs.existsSync(f),'Missing '+p);new vm.Script(fs.readFileSync(f,'utf8'));assert(index.includes('/js/'+p),'Script missing from index '+p)}
for(let p of ['dailyops-parity-v12.css','sarathi-parity-v12.css']){assert(fs.existsSync(base+'/public/css/'+p),'Missing '+p);assert(index.includes('/css/'+p),'CSS missing from index '+p)}
for(const feature of ['page:${k}', 'tab:', 'mode:bus', 'ds-report-table', 'ds-ratings-head', 'ratingsOverview', 'ratingsRanks', 'ratingsList', 'reply:'])assert(fs.readFileSync(base+'/public/js/dailyops-parity-v12.js','utf8').includes(feature),'Missing Daily Ops '+feature);
for(const feature of ['New chat','No conversations yet','Today\'s fleet','Earnings & bookings','Passenger insights','Staff & licences','/sarathi/ask','/sarathi/conversations'])assert(fs.readFileSync(base+'/public/js/sarathi-parity-v12.js','utf8').includes(feature),'Missing Sarathi '+feature);
let sarathi=index.indexOf('/js/sarathi-parity-v12.js'),daily=index.indexOf('/js/dailyops-parity-v12.js'),main=index.indexOf('/js/main.js');assert(daily>-1&&sarathi>-1&&main>-1&&daily<main&&sarathi<main,'Overlays must load before main router');
console.log('PASS: v12 Daily Ops + Sarathi static, syntax, index injection and feature inventory checks.');
