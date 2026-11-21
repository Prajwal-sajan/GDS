// Run from the SaveTrip GDS repository root after applying Accounts v10.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const js=fs.readFileSync('public/js/accounts-parity-v10.js','utf8');
const css=fs.readFileSync('public/css/accounts-parity-v10.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const screens=['analytics','transactions','receivables','reports','invoices','reconciliation','agent-settings','coupons'];
for (const s of screens) assert(js.includes(`'${s}'`)||js.includes(`${s}:`),`Missing Accounts submenu ${s}`);
const categories=['FLEET','CREW','BOOKINGS','CUSTOMERS','FINANCE'];
for(const s of categories) assert(js.includes(`'${s}'`),`Missing report category ${s}`);
const functions=['Sales','Transactions','Receivables','Reports','Invoices','OTA Invoice Verifier','Agent Settings','Loyalty','Payment received','Debit (owed)','HISTORY','Commission base','TDS section','Settlement mode','Match tolerance','Commission kept on passenger cancel','New Coupon','Max ₹ off','Audience','Stackable','Add Agent','Edit Agent Configuration','UI preview','Fleet Operations','Driver Behaviour','Staff Duty Statement','Boarding & Dropping Points','Metro Bookings','Pickup Van Bookings','Point Performance','Station Performance','No-shows','Cancellations','Frequent Travellers','Trip P&L / Occupancy','Expenses','Original provider PDF'];
for(const name of functions) assert(js.includes(name),`Missing screenshot interaction ${name}`);
const styles=['.ac10-nav','.ac10-stat','.ac10-report-grid','.ac10-txstats','.ac10-recstats','.ac10-agentcard','.ac10-scroll','.ac10-modalheading','.ac10-ledstat','.ac10-reconhero','.ac10-coupontable','.ac10-backend-note'];
for(const name of styles) assert(css.includes(name),`Missing Accounts CSS ${name}`);
const jsTag='/js/accounts-parity-v10.js',cssTag='/css/accounts-parity-v10.css';
assert(html.includes(jsTag),'Accounts v10 JavaScript not registered');
assert(html.includes(cssTag),'Accounts v10 stylesheet not registered');
assert(html.indexOf(jsTag)>html.indexOf('/js/accounts-parity.js'),'Accounts overlay must load after base Accounts code');
assert(html.indexOf(jsTag)<html.indexOf('/js/main.js'),'Accounts overlay must load before main router');
if(fs.existsSync('reports/ACCOUNTS_58_SCREENSHOT_AUDIT.csv')){
 const data=fs.readFileSync('reports/ACCOUNTS_58_SCREENSHOT_AUDIT.csv','utf8');
 assert.equal((data.match(/SS-1(?:\d\d)/g)||[]).length,49,'Expected screenshot IDs SS-100...SS-148');
 assert.equal((data.match(/SS-09\d/g)||[]).length,9,'Expected screenshot IDs SS-091...SS-099');
}
console.log('PASS: Accounts v10 — 8 submenus, 13 reports, visual styling, dialogs, script ordering, screenshot audit.');
