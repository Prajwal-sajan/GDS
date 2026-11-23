'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<div id="app"><div data-content></div></div>',{url:'http://localhost/#/settings/loyalty-program',runScripts:'outside-only'});
const w=dom.window,el=w.document.querySelector('[data-content]');
const copy=x=>JSON.parse(JSON.stringify(x));
let saved=[],calls=[],reloads=0,delegated=0;
let data={
 general:{is_active:true,miles_to_rupee_ratio:.1,max_discount_percent:30,min_redeemable_miles:1000,min_booking_amount:50},
 daily_limits:[{day_of_week:0,redemption_rate:0},{day_of_week:1,redemption_rate:75},{day_of_week:2,redemption_rate:75},{day_of_week:3,redemption_rate:75},{day_of_week:4,redemption_rate:30},{day_of_week:5,redemption_rate:0},{day_of_week:6,redemption_rate:30}],
 tier_bonus:[{tier_name:'Bronze',multiplier:1},{tier_name:'Gold',multiplier:1.2},{tier_name:'Platinum',multiplier:1.5},{tier_name:'Silver',multiplier:1.1}],
 blocked_dates:[{date:'2026-03-31',rate:0,reason:''}],
 seat_upgrades:{enabled:true,minutes_before_boarding:20}
};
w.confirm=()=>true;
w.G={screens:{settings:async()=>{delegated++;}},get:async url=>{
 assert.equal(url,'/settings/loyalty-v34');calls.push(url);return copy(data);
},put:async(url,payload)=>{
 const section=url.split('/').at(-1);saved.push({section,value:copy(payload.value)});
 data[section]=copy(payload.value);
 if(section==='seat_upgrades')data[section]={...data[section],minutes_before_boarding:20};
 return {success:true,configuration:copy(data)};
},toast:()=>{},syncHeaderParity:()=>{},viewAs:'',reloadApp:()=>{reloads++;}};
w.eval(fs.readFileSync('public/js/loyalty-switch-v34.js','utf8'));
const delay=()=>new Promise(done=>setTimeout(done,25));
async function loyalty(){await w.G.screens.settings(el,['loyalty-program']);}
(async()=>{
 assert.equal(w.G.loyaltySwitchVersion,'v34');
 await w.G.screens.settings(el,['about']);assert.equal(delegated,1);
 await loyalty();
 assert.match(el.textContent,/Loyalty Program/);
 assert.match(el.textContent,/How to/);
 assert.match(el.textContent,/Enabled/);
 assert.match(el.textContent,/₹0.1/);
 assert.match(el.textContent,/30/);
 assert.match(el.textContent,/1000/);
 assert.match(el.textContent,/Enable Seat Upgrades/);
 assert.match(el.textContent,/Unsold seats in the last 20 minutes/);
 assert.match(el.textContent,/shared → single, upper → lower berth, back → front row/);
 for(const heading of ['General Settings','Daily Limits','Tier Bonus','Blocked Dates'])assert.ok(el.textContent.includes(heading));
 const expected=[75,75,75,30,0,30,0];const cards=[...el.querySelectorAll('[data-lv34-day]')];
 assert.equal(cards.length,7);
 assert.deepEqual(cards.map(x=>Number(x.value)),expected);
 assert.deepEqual([...el.querySelectorAll('[data-lv34-tier]')].map(x=>[x.dataset.lv34Tier,Number(x.value)]),
  [['Bronze',1],['Gold',1.2],['Platinum',1.5],['Silver',1.1]]);
 assert.equal(el.querySelectorAll('[data-lv34-save]').length,3);
 assert.equal(el.querySelectorAll('[data-lv34-toggle]').length,2);
 assert.ok(el.textContent.includes('2026-03-31'));
 const how=el.querySelector('[data-lv34-how]');how.click();
 assert.equal(el.querySelector('[data-lv34-overlay]').hidden,false);
 assert.match(el.querySelector('.lv34-dialog').textContent,/Redemption/);
 el.querySelector('[data-lv34-close]').click();
 assert.equal(el.querySelector('[data-lv34-overlay]').hidden,true);
 el.querySelector('[name="max_discount_percent"]').value='25';
 el.querySelector('[data-lv34-save="general"]').click();await delay();
 assert.equal(data.general.max_discount_percent,25);
 assert.equal(saved.at(-1).section,'general');
 assert.equal(el.querySelector('.lv34-stats>div:nth-child(2) strong').textContent,'25');
 el.querySelector('[data-lv34-toggle="program"]').click();await delay();
 assert.equal(data.general.is_active,false);
 assert.match(el.textContent,/Disabled/);
 el.querySelector('[data-lv34-toggle="upgrades"]').click();await delay();
 assert.equal(data.seat_upgrades.enabled,false);
 // Daily limits reflect real editor changes.
 el.querySelector('[data-lv34-day="0"]').value='50';
 el.querySelector('[data-lv34-save="daily_limits"]').click();await delay();
 assert.equal(data.daily_limits.find(x=>x.day_of_week===0).redemption_rate,50);
 el.querySelector('[data-lv34-tier="Gold"]').value='1.4';
 el.querySelector('[data-lv34-save="tier_bonus"]').click();await delay();
 assert.equal(data.tier_bonus.find(x=>x.tier_name==='Gold').multiplier,1.4);
 el.querySelector('[data-lv34-reset-tier="Gold"]').click();
 assert.equal(el.querySelector('[data-lv34-tier="Gold"]').value,'1.2');
 // Blackout add/remove with actual date/rate/reason.
 let form=el.querySelector('[data-lv34-block-form]');
 form.querySelector('[name="date"]').value='2026-12-31';
 form.querySelector('[name="rate"]').value='10';
 form.querySelector('[name="reason"]').value='Holiday peak';
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await delay();
 assert.equal(data.blocked_dates.length,2);
 assert.ok(el.textContent.includes('Holiday peak'));
 el.querySelector('[data-lv34-del="2026-12-31"]').click();await delay();
 assert.equal(data.blocked_dates.length,1);
 // Switch User screenshot: no picker, 10-digit phone gate and return.
 await w.G.screens.settings(el,['switch-user']);
 assert.equal(w.document.body.classList.contains('su34-active'),true);
 assert.match(el.textContent,/View the app as another user/);
 assert.match(el.textContent,/anything you change is still recorded under your own name/);
 assert.equal(el.querySelectorAll('select').length,0);
 assert.equal(el.querySelector('#su34-phone').getAttribute('pattern'),'[0-9]{10}');
 assert.ok(el.querySelector('.su34-top a[href="#/settings"]'));
 assert.match(el.textContent,/Continue/);
 const form2=el.querySelector('[data-su34-form]');
 form2.elements.phone.value='123';
 form2.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await delay();
 assert.equal(reloads,0);
 w.G.post=async(url,payload)=>{
  assert.equal(url,'/auth/switch-user/v34/resolve');assert.equal(payload.phone,'9888888888');
  return {id:2,name:'Devraj',role:'manager',phone:'9888888888'};
 };
 form2.elements.phone.value='9888888888';
 form2.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await delay();
 assert.equal(reloads,1);
 assert.equal(w.G.viewAs,'2');
 assert.equal(w.localStorage.getItem('viewAs'),'2');
 // Same view: new account cannot pick a third user before returning.
 await w.G.screens.settings(el,['switch-user']);
 assert.ok(el.querySelector('[data-su34-return]'));
 el.querySelector('[data-su34-return]').click();
 assert.equal(w.G.viewAs,'');
 assert.equal(w.localStorage.getItem('viewAs'),null);
 assert.equal(reloads,2);
 await loyalty();assert.equal(w.document.body.classList.contains('su34-active'),false);
 const html=fs.readFileSync('public/index.html','utf8');
 assert.match(html,/loyalty-switch-v34\.js\?build=34/);
 assert.match(html,/loyalty-switch-v34\.css\?build=34/);
 const css=fs.readFileSync('public/css/loyalty-switch-v34.css','utf8');
 assert.match(css,/\.lv34-hero/);
 assert.match(css,/\.lv34-days/);
 assert.match(css,/\.su34-center/);
 assert.match(css,/body\.su34-active \.iconic-app-header/);
 console.log('PASS v34 UI: all screenshot cards/values/colors, summary, per-section save, toggles, daily limits, tier bonus, date/rate/reason, How to, phone validation, role switch and return');
})().catch(e=>{console.error(e);process.exitCode=1;});
