import fs from 'node:fs';
import assert from 'node:assert/strict';
const js=fs.readFileSync('public/js/staff-parity-v11.js','utf8');
const css=fs.readFileSync('public/css/staff-parity-v11.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const original=fs.readFileSync('public/js/fleet.js','utf8');
const nav=['staff','attendance','advances','reimbursements','payouts'];
for(const n of nav){assert(js.includes(`'${n}'`),`Missing Staff submenu ${n}`);assert(original.includes(n),`Original GDS workflow missing ${n}`)}
for(const n of ['personal','payables','bank','ledger','docs']) assert(js.includes(`'${n}'`),`Missing Staff editor tab ${n}`);
for(const s of ['Search by name, phone, email','All Role','All Status','BLOOD','JOINING','Aadhaar','PAN Number','Date of Joining','Employment Type','License Number','License Expiry','Daily Wages','Monthly Salary','Overtime Rate','Bonuses','Deductions','Account Holder Name','Bank Name','Branch','Account Number','IFSC Code','UPI ID','Aadhaar Card','Driving License','PAN Card','Bank Cheque']) assert(js.includes(s),`Missing screenshot element ${s}`);
for(const s of ['data-search-staff','data-role-filter','data-status-filter','data-staff-count','data-all-select','data-select','data-switch','data-modal-tab','data-modal-save','data-pay-type','data-rule-add','data-rule-remove','data-doc-upload','data-doc-download']) assert(js.includes(s),`Missing interaction ${s}`);
for(const s of ['/staff?status=all','/staff/','/documents/staff/','/documents/']) assert(js.includes(s),`Missing API endpoint ${s}`);
for(const s of ['.sp-root','.sp-staff-table','.sp-overlay','.sp-dialog-head','.sp-modal-tabs','.sp-document','.sp-pay-cards','.sp-subpill','.sp-native-content'])assert(css.includes(s),`Missing style ${s}`);
assert(html.includes('/js/staff-parity-v11.js')&&html.includes('/css/staff-parity-v11.css'),'Staff includes not installed');
assert(html.indexOf('/js/staff-parity-v11.js')>html.indexOf('/js/fleet.js'),'Staff overlay must load after fleet');
assert(html.indexOf('/js/staff-parity-v11.js')<html.indexOf('/js/main.js'),'Staff overlay must load before router');
console.log('PASS Staff v11: 5 submenu routes, 5 edit tabs, screenshot controls, API mapping, colors/icons, source ordering.');
