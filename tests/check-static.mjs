import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
for (const name of ['trip-parity','accounts-parity','schedule-parity','route-parity']) {
 assert.match(html,new RegExp(`/js/${name}\\.js`));
 assert.match(html,new RegExp(`/css/${name}\\.css`));
 const code=fs.readFileSync(path.join(root,'public/js',name+'.js'),'utf8');
 new vm.Script(code,{filename:name+'.js'});
}
const schedule=fs.readFileSync(path.join(root,'public/js/schedule-parity.js'),'utf8');
for (const item of ['/schedules?','/seat-layout?','/booking-history','/blocks','/fares','/pnl','/history','/trips/','data-sp-notify','data-sp-update','data-sp-group','data-sp-summary']) assert.ok(schedule.includes(item),item);
for (const name of ['bookings','block','update','cities','pickups','drops','fares','pnl','history']) assert.match(schedule,new RegExp(`\\['${name}'`));
const order=['/js/core.js','/js/seat.js','/js/trips.js','/js/trip-parity.js','/js/gds.js','/js/accounts.js','/js/accounts-parity.js','/js/schedule-parity.js','/js/route-parity.js','/js/main.js'];
for (let i=1;i<order.length;i++)assert.ok(html.indexOf(order[i])>html.indexOf(order[i-1]),order[i]);
console.log('PASS: cumulative references, API surface, tabs and script ordering');
// Verify the gds screen is wrapped without replacing the routes handler.
const context=vm.createContext({G:{screens:{gds:async()=> 'original'}},console});
vm.runInContext(schedule,context);
assert.equal(typeof context.G.screens.gds,'function');
assert.notEqual(context.G.screens.gds.toString(),(async()=> 'original').toString());
console.log('PASS: Schedule screen wrapper initializes without a browser');

const route=fs.readFileSync(path.join(root,'public/js/route-parity.js'),'utf8');
for (const key of ['overview','cities','operations','pickups','drops','fares','policy','halts']) assert.ok(route.includes(`['${key}'`),key);
for (const endpoint of ['/routes/${routeId}','/vehicles','/halts?days=15']) assert.ok(route.includes(endpoint),endpoint);
assert.match(route,/SIMULATED DATA/);
const routeContext=vm.createContext({G:{screens:{gds:async()=>{}}},console});
vm.runInContext(route,routeContext);
assert.equal(typeof routeContext.G.screens.gds,'function');
console.log('PASS: Route workspace loaded, configured endpoints and simulated GPS warning');
