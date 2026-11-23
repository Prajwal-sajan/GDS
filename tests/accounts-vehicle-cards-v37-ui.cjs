'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><html><body><div class="ac10-root"><section id="root"><div data-ac11-sector-anchor></div><select name="service"><option>All Services</option></select></section></div><div id="fleet"></div></body></html>',
 {url:'https://localhost/#/accounts/analytics',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,doc=w.document;
w.eval(fs.readFileSync('public/js/accounts-sales-v37.js','utf8'));
w.eval(fs.readFileSync('public/js/vehicle-cards-v37.js','utf8'));
const root=doc.getElementById('root');
const facets={
 sectors:[{value:'21:22',label:'Hyderabad → Bengaluru'},{value:'22:21',label:'Bengaluru → Hyderabad'}],
 services:[{value:'1',label:'NTHB1 · Rajahuli',sector:'21:22'},{value:'2',label:'NTBH1',sector:'22:21'}],
 channels:['redbus','abhibus']
};
const state={sector:'all',service:'1',basis:'travel_date',pivot:'date'};
const changes=[];
const mounted=w.AccountsSalesV37.mount(root,state,facets,(s,q)=>changes.push(JSON.parse(JSON.stringify(q))));
assert.ok(mounted);
assert.ok(root.querySelector('.ac37-sector-trigger svg'));
assert.equal(mounted.items.length,3);
assert.equal(root.querySelectorAll('[role="option"]').length,3);
assert.equal(root.querySelector('[data-ac37-sector-menu]').hidden,true);
assert.equal(root.querySelector('[aria-expanded]').getAttribute('aria-expanded'),'false');
assert.equal(root.querySelector('.ac37-sector-text').textContent,'All Sectors');
root.querySelector('[data-ac37-sector-trigger]').click();
assert.equal(root.querySelector('[data-ac37-sector-menu]').hidden,false);
assert.equal(root.querySelector('[aria-expanded]').getAttribute('aria-expanded'),'true');
assert.equal(root.querySelector('[data-ac37-option="all"]').getAttribute('aria-selected'),'true');
root.querySelector('[data-ac37-option="22:21"]').click();
assert.equal(changes.length,1);
assert.deepEqual(changes[0],{sector:'22:21',service:'all',pivot:'date',basis:'travel_date'});
assert.equal(root.querySelector('[data-ac37-sector-menu]').hidden,true);
// Re-mount a new screen after navigation and verify service preservation for the chosen direction.
root.innerHTML='<div data-ac11-sector-anchor></div>';
const mounted2=w.AccountsSalesV37.mount(root,{...state,sector:'21:22'},facets,(s,q)=>changes.push(JSON.parse(JSON.stringify(q))));
mounted2.open(true);
root.querySelector('[data-ac37-option="22:21"]').click();
assert.equal(changes.at(-1).service,'all');
root.innerHTML='<div data-ac11-sector-anchor></div>';
w.AccountsSalesV37.mount(root,{...state,sector:'all'},facets,(s,q)=>changes.push(JSON.parse(JSON.stringify(q))));
const trig=root.querySelector('[data-ac37-sector-trigger]');
trig.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
assert.equal(root.querySelector('[data-ac37-sector-menu]').hidden,false);
root.querySelector('[data-ac37-option="21:22"]').focus();
root.querySelector('[data-ac37-option="21:22"]').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
assert.equal(root.querySelector('[data-ac37-sector-menu]').hidden,true);
trig.click();
doc.body.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
assert.equal(root.querySelector('[data-ac37-sector-menu]').hidden,true);
// No hardcoded route names or demo numbers in the production component.
const saleScript=fs.readFileSync('public/js/accounts-parity-v10.js','utf8');
assert.ok(saleScript.includes("api('/accounts/sales-facets')"));
assert.ok(saleScript.includes("sector:s.sector||'all'"));
assert.ok(saleScript.includes("service:s.service||'all'"));
assert.ok(saleScript.includes("AccountsSalesV37?.mount"));
assert.ok(saleScript.includes("d.service_breakdown:d.sector_breakdown"));
assert.ok(saleScript.includes("select[name=service]"));
assert.ok(!saleScript.includes("sel('sector',[['all','All Sectors']]"));
const fleetScript=fs.readFileSync('public/js/vehicles-parity-v9.js','utf8');
assert.ok(fleetScript.includes("VehicleCardsV37.renderCoaches(rows,cells,coachCounts,icon,E)"));
assert.ok(fleetScript.includes("VehicleCardsV37.renderVehicles(rows,row,icon,E)"));
assert.ok(fleetScript.includes("layout:readLayout('coaches')"));
assert.ok(fleetScript.includes("layout:readLayout('vehicles')"));
assert.ok(fleetScript.includes("saveLayout('coaches',s.layout)"));
assert.ok(fleetScript.includes("saveLayout('vehicles',s.layout)"));
assert.ok(fleetScript.includes('data-coach-berth-toggle'));
const icon=(key,size)=>'<svg data-icon="'+key+'" width="'+(size||20)+'" viewBox="0 0 24 24"><path d="M0 0h1"/></svg>';
const E=x=>String(x??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const parts=[
 '<b>A/C Seater (2+2)</b>', '<span>Regular</span>', '<span>2+2</span>',
 '<div>48 Seater</div>', '<span class="vp-ac-chip">'+icon('snowflake')+' AC</span>',
 '<label class="vp-onoff"><input data-coach-status="101" type="checkbox" checked/><span class="vp-thumb"></span><b>Active</b></label>',
 '<div class="vp-actions">'+['eye','pencil','copy','trash'].map((a,i)=>'<button data-action="'+['view','edit','duplicate','delete'][i]+'" data-id="101">'+icon(a)+'</button>').join('')+'</div>'
];
const coach={id:101,name:'A/C Seater (2+2)',alt_name:'Seater Washroom',bus_type:'A/C Seater',pattern:'2+2',amenities:['Air Conditioning']};
const coachesHTML=w.VehicleCardsV37.renderCoaches([coach],()=>parts,()=>({seater:48,sleeper:0,capacity:48}),icon,E);
const container=doc.getElementById('fleet');container.innerHTML=coachesHTML;
assert.ok(container.querySelector('.vp37-coaches-grid'));
assert.equal(container.querySelectorAll('.vp37-coach-card').length,1);
assert.equal(container.querySelector('.vp37-card-title strong').textContent,'A/C Seater (2+2)');
assert.equal(container.querySelector('.vp-coach-alias').textContent,'Seater Washroom');
assert.ok(container.querySelector('.vp37-coach-card .vp-onoff [data-coach-status="101"]'));
assert.ok(container.textContent.includes('48 Seater'));
assert.ok(container.textContent.includes('Regular · 2+2'));
assert.ok(container.textContent.includes('FEATURES'));
for(const action of ['view','edit','duplicate','delete'])assert.ok(container.querySelector('[data-action="'+action+'"]'));
assert.ok(container.querySelector('svg[data-icon="bus"]'));
const mixed={id:102,name:'A/C Seater/Sleeper',alt_name:'first_coach',bus_type:'A/C Seater/Sleeper',pattern:'2+1',amenities:['video']};
const mixedHtml=w.VehicleCardsV37.renderCoaches([mixed],()=>parts,()=>({seater:22,sleeper:24,capacity:46}),icon,E);
container.innerHTML=mixedHtml;
assert.ok(container.textContent.includes('22 Seater'));
assert.ok(container.textContent.includes('24 Sleeper'));
assert.ok(container.textContent.includes('Video'));
const van={id:103,name:'Non A/C Seater (2+2)',bus_type:'Pickup Van',pattern:'2+2',amenities:[]};
container.innerHTML=w.VehicleCardsV37.renderCoaches([van],()=>parts,()=>({seater:36,sleeper:0,capacity:36}),icon,E);
assert.ok(container.querySelector('.vp37-pickup'));
assert.ok(container.textContent.includes('Pickup Van'));
const vehicleParts=[
 '<strong class="vp-reg">KA 01 AB 1234</strong><small>Coach</small>',
 '<span class="vp-state moving">MOVING</span>', '<strong>12345 km</strong>',
 '<span>Fuel 80 L</span>', '<button data-action="location" data-id="105">GPS</button>',
 '<button data-action="health" data-id="105">Good</button>',
 '<button data-action="location" data-id="105">Location</button>',
 '<button data-action="alerts" data-id="105">Alerts</button>',
 '<label class="vp-onoff"><input data-active="105" type="checkbox" checked/><span class="vp-thumb"></span><b>Active</b></label>',
 '<div class="vp-actions"><button data-action="view" data-id="105">View</button><button data-action="edit" data-id="105">Edit</button></div>'
];
container.innerHTML=w.VehicleCardsV37.renderVehicles([{id:105,registration_number:'KA 01 AB 1234'}],()=>vehicleParts,icon,E);
assert.ok(container.querySelector('.vp37-vehicles-grid'));
assert.ok(container.querySelector('[data-active="105"]'));
assert.ok(container.querySelector('[data-action="view"]'));
assert.ok(container.querySelector('[data-action="edit"]'));
for(const text of ['STATE','GPS','ODOMETER','FUEL / ADBLUE','HEALTH','ALERTS','LOCATION'])assert.ok(container.textContent.includes(text));
const css=fs.readFileSync('public/css/accounts-vehicle-cards-v37.css','utf8');
assert.ok(css.includes('repeat(3,minmax(0,1fr))'));
assert.ok(css.includes('.ac37-sector-menu[hidden]'));
assert.ok(css.includes('.vp37-card-footer'));
const html=fs.readFileSync('public/index.html','utf8');
for(const file of ['accounts-sales-v37.js','vehicle-cards-v37.js','accounts-vehicle-cards-v37.css'])assert.ok(html.includes(file));
assert.ok(html.indexOf('vehicle-cards-v37.js')<html.indexOf('main.js'));
console.log('PASS v37 UI: screenshot sector dropdown options/swap scope/keyboard/outside close, real data link, three-column coach and vehicle cards, SVG actions/status, 2x2/2x1/pickup, persisted view preference and script order');
