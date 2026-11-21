import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const js=fs.readFileSync(path.join(root,'public/js/schedules-screenshot-v6.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public/css/schedules-screenshot-v6.css'),'utf8');
const matrix=fs.readFileSync(path.join(root,'reports/SCHEDULES_V6_SCREENSHOT_MATRIX.csv'),'utf8');
const tabs=['bookings','block','update','cities','pickups','drops','fares','pnl','history'];
const paths=['/js/schedules-screenshot-v6.js','/css/schedules-screenshot-v6.css','/js/routes-screenshot-v5.js'];
for(const p of paths)assert(html.includes(p),`Missing HTML asset ${p}`);
assert(html.indexOf('/js/routes-screenshot-v5.js')<html.indexOf('/js/schedules-screenshot-v6.js'),'Wrong overlay load order');
assert(html.indexOf('/js/schedules-screenshot-v6.js')<html.indexOf('/js/main.js'),'Schedules overlay should register before router');
for(const tab of tabs)assert(js.includes(`'${tab}'`),`Missing tab ${tab}`);
for(const feature of ['seatsGraphic','summaryModal','locationModal','timingsModal','stopEditor','notifyPopup','saveFare','updateAssignment','bookingTab','pnlTab','fare','data-sx-book-selected','data-sx-applydelay','data-sx-weekday','data-sx-expense-edit']) {
 const actual=feature==='data-sx-book-selected'?'sxBookSelected':feature==='data-sx-applydelay'?'sxApplydelay':feature==='data-sx-expense-edit'?'sxExpenseEdit':feature;
 assert(js.includes(actual),`Missing visual or action ${feature}`);
}
assert(js.includes("String(x.from_city_id)===String(S.cityFrom)"),'Fare override must be scoped to selected origin');
assert(js.includes("String(x.to_city_id)===String(S.cityTo)"),'Fare override must be scoped to selected destination');
for(const c of ['sx-modal','sx-seat','sx-stop-card','sx-pnl','sx-fare','sx-crew'])assert(css.includes(c),`Missing style ${c}`);
const lines=matrix.trim().split(/\r?\n/);
assert(lines.length===34,`Expected header + 33 screenshots, got ${lines.length}`);
for(let i=8;i<=40;i++)assert(matrix.includes(`SS-${String(i).padStart(3,'0')}`),`Missing screenshot SS-${i}`);
console.log('PASS: 33 Schedule screenshots tracked, 9 tabs, core icon/modal/seat/fare/crew/P&L elements, safe fare scoping, CSS and overlay script order');
