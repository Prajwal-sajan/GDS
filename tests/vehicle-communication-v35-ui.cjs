'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const doc=new JSDOM('<!doctype html><body><div id="page"></div><div id="modal-root"></div></body>',
 {url:'http://localhost/#/fleet/coaches',runScripts:'outside-only',pretendToBeVisual:true});
const w=doc.window,document=w.document;
const fixture=(id,name,types)=>({id,name,bus_type:name,pattern:'2+1',
 status:'active',amenities:[],layout:{decks:[{seats:types.map(type=>({type}))}]}});
const coaches=[
 fixture(1,'A/C Seater Regular',['seater','seater']),
 fixture(2,'A/C Seater Express',['seater']),
 fixture(3,'A/C Coach Mixed',['seater','sleeper']),
 fixture(4,'A/C Sleeper Deluxe',['sleeper']),
 fixture(5,'A/C Sleeper Premium',['sleeper']),
 fixture(6,'A/C Sleeper Standard',['sleeper'])
];
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let legacyFleet=0;
const G=w.G={
 screens:{fleet:async()=>legacyFleet++},
 get:async url=>{if(url==='/coaches')return {coaches};throw Error('Unexpected '+url)},
 toast:()=>{},err:e=>{throw e},modal:()=>{throw Error('No modal expected')},
};
w.esc=E;w.can=()=>true;w.fdt=x=>x;
w.eval(fs.readFileSync('public/js/vehicles-parity-v9.js','utf8'));
(async()=>{
 const el=document.querySelector('#page');
 await G.screens.fleet(el,{tab:'coaches'});
 assert.equal(legacyFleet,0);
 assert.equal(el.querySelectorAll('.vp-coach-table tbody tr').length,6);
 assert.ok(el.textContent.includes('All berths'));
 assert.ok(el.querySelector('[data-coach-berth-menu]').hidden);
 assert.equal(el.querySelector('[data-coach-berth-count="all"]').textContent,'6');
 assert.equal(el.querySelector('[data-coach-berth-count="seater"]').textContent,'3');
 assert.equal(el.querySelector('[data-coach-berth-count="sleeper"]').textContent,'4');
 assert.equal(el.querySelectorAll('[data-coach-berth]').length,3);
 assert.ok(!el.querySelector('[data-coach="berths"]'),'Native selector replaced');
 el.querySelector('[data-coach-berth-toggle]').click();
 const list=el.querySelector('[data-coach-berth-menu]');
 assert.equal(list.hidden,false);
 assert.equal(el.querySelector('[data-coach-berth-toggle]').getAttribute('aria-expanded'),'true');
 el.querySelector('[data-coach-berth="seater"]').click();
 assert.equal(list.hidden,true);
 assert.equal(el.querySelector('.vp-showing').textContent,'Showing 3 of 6');
 assert.equal(el.querySelectorAll('.vp-coach-table tbody tr').length,3);
 assert.equal(el.querySelector('[data-coach-berth-label]').textContent,'Seater');
 assert.equal(el.querySelector('[data-coach-berth="seater"]').getAttribute('aria-selected'),'true');
 assert.ok(el.textContent.includes('Coach Mixed'),'Mixed berth coach appears in Seater');
 el.querySelector('[data-coach-berth-toggle]').click();
 el.querySelector('[data-coach-berth="sleeper"]').click();
 assert.equal(el.querySelector('.vp-showing').textContent,'Showing 4 of 6');
 assert.equal(el.querySelectorAll('.vp-coach-table tbody tr').length,4);
 assert.ok(el.textContent.includes('Coach Mixed'),'Mixed coach appears in Sleeper too');
 el.querySelector('[data-coach-berth-toggle]').click();
 let key=new w.KeyboardEvent('keydown',{bubbles:true,key:'Escape'});
 el.querySelector('[data-coach-berth-toggle]').dispatchEvent(key);
 assert.equal(list.hidden,true);
 el.querySelector('[data-coach-berth-toggle]').click();
 document.body.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
 assert.equal(list.hidden,true,'Click outside closes menu');
 const search=el.querySelector('[data-coach="query"]');
 search.value='coach mixed';
 search.dispatchEvent(new w.Event('input',{bubbles:true}));
 assert.equal(el.querySelector('[data-coach-berth-count="all"]').textContent,'1');
 assert.equal(el.querySelector('[data-coach-berth-count="seater"]').textContent,'1');
 assert.equal(el.querySelector('[data-coach-berth-count="sleeper"]').textContent,'1');
 assert.equal(el.querySelectorAll('.vp-coach-table tbody tr').length,1);
 el.querySelector('[data-layout="grid"]').click();
 assert.equal(el.querySelectorAll('.vp-coach-card').length,1);
 el.querySelector('[data-coach-berth-toggle]').click();
 el.querySelector('[data-coach-berth="all"]').click();
 assert.equal(el.querySelector('.vp-showing').textContent,'Showing 1 of 6');
 console.log('PASS v35 coaches: SVG dropbox with 6/3/4 counts, inclusive berth matching, search facets, grid/list, checkmark, Escape and outside close');
 
 // Communication modal reads a single authorized endpoint; it doesn't invent
 // statuses or mutate chats on inspection.
 const historyRows=Array.from({length:20},(_,i)=>({
  id:'m'+i,channel:'whatsapp',direction:'outgoing',
  timestamp:'2026-11-22T14:25:03Z',message_type:'Unknown',contact_to:'—',
  status:i%3===0?'Read':'Sent',duration_s:null,from:'',
  additional_info:''
 }));
 const counts={all:20,calls:0,whatsapp:20,sms:0};
 const calls=[];
 G.get=async url=>{
  calls.push(url);
  const u=new URL(url,'http://localhost');
  assert.ok(u.pathname.includes('/trips/29/passengers/095301/communications'),u.pathname);
  const channel=u.searchParams.get('channel')||'all';
  const rows=(channel==='all'||channel==='whatsapp')?historyRows:[];
  const page=Number(u.searchParams.get('page')||1),limit=Number(u.searchParams.get('limit')||100);
  return {passenger:{name:'Raghu Teja Kanchiraju',pnr:'095301',phone_masked:'995xxxx452'},
   counts,permissions:{calls:true,whatsapp:true,sms:true},channel,page,limit,total:rows.length,
   has_more:page*limit<rows.length,rows:rows.slice((page-1)*limit,page*limit)};
 };
 G.modal=opts=>{
  const ov=document.createElement('div');
  ov.className='ov';ov.innerHTML='<div class="md"><header class="hd"><h2>'+opts.title+'</h2><button data-x>×</button></header><div class="bd">'+opts.body+'</div></div>';
  document.querySelector('#modal-root').appendChild(ov);
  return {el:ov,close:()=>ov.remove(),$:sel=>ov.querySelector(sel),$$:sel=>[...ov.querySelectorAll(sel)]};
 };
 w.eval(fs.readFileSync('public/js/communication-history-v35.js','utf8'));
 const modal=await G.showTripCommunicationHistory({sid:29,pnr:'095301'});
 assert.equal(calls.length,1,'Exactly one initial fetch');
 assert.ok(modal.el.classList.contains('ch35-overlay'));
 assert.equal(modal.$('.md').getAttribute('role'),'dialog');
 assert.equal(modal.$('.md').getAttribute('aria-modal'),'true');
 assert.equal(modal.$('.ch35-title strong').textContent,'Communication History');
 assert.ok(modal.$('.ch35-title small').textContent.includes('Raghu Teja Kanchiraju'));
 assert.ok(modal.$('.ch35-title small').textContent.includes('095301'));
 assert.ok(modal.$('.ch35-title small').textContent.includes('995xxxx452'));
 assert.equal(modal.$('[data-x]').getAttribute('aria-label'),'Close Communication History');
 assert.ok(modal.$('[data-x] svg'),'Close X is SVG');
 assert.deepEqual([...modal.el.querySelectorAll('[role="tab"]')].map(x=>x.textContent.trim()),
  ['All (20)','Calls (0)','WhatsApp (20)','SMS (0)']);
 assert.equal(modal.el.querySelectorAll('.ch35-table th').length,8);
 const headings=[...modal.el.querySelectorAll('.ch35-table th')].map(x=>x.textContent);
 assert.deepEqual(headings,['TYPE','DIRECTION','TIMESTAMP','MESSAGE TYPE / FROM','CONTACT / TO','STATUS','DURATION','ADDITIONAL INFO']);
 assert.equal(modal.el.querySelectorAll('.ch35-table tbody tr').length,20);
 assert.equal(modal.el.querySelectorAll('.ch35-status.ch35-read').length,7);
 assert.equal(modal.el.querySelectorAll('.ch35-status.ch35-sent').length,13);
 assert.equal(modal.el.querySelector('.ch35-nowrap').textContent,'22-11-26 19:55:03');
 assert.ok(modal.el.querySelector('.ch35-type.ch35-whatsapp svg'));
 assert.ok(modal.el.querySelector('.ch35-direction.outgoing svg'));
 assert.equal(modal.el.querySelector('[data-ch35-tab=all]').getAttribute('aria-selected'),'true');
 modal.el.querySelector('[data-ch35-tab=calls]').click();
 await new Promise(resolve=>setTimeout(resolve,5));
 assert.ok(modal.el.querySelector('.ch35-empty'));
 assert.equal(modal.el.querySelector('[data-ch35-tab=calls]').getAttribute('aria-selected'),'true');
 modal.el.querySelector('[data-ch35-tab=whatsapp]').click();
 await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(modal.el.querySelectorAll('.ch35-table tbody tr').length,20);
 assert.ok(calls.some(x=>x.includes('channel=whatsapp')));
 modal.el.querySelector('[data-x]').click();
 assert.equal(document.querySelectorAll('.ch35-overlay').length,0);
 
 // Pagination without silently losing communication events.
 historyRows.push(...Array.from({length:205},(_,i)=>({
  id:'p'+i,channel:'whatsapp',direction:'outgoing',timestamp:'2026-11-21T12:00:00Z',
  message_type:'Reminder',status:'Recorded',additional_info:'',contact_to:'—'
 })));
 counts.all=225;counts.whatsapp=225;
 const paged=await G.showTripCommunicationHistory({sid:29,pnr:'095301'});
 assert.equal(paged.el.querySelectorAll('.ch35-table tbody tr').length,100);
 assert.equal(paged.$('[data-ch35-more-wrap]').hidden,false);
 paged.$('[data-ch35-more]').click();await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(paged.el.querySelectorAll('.ch35-table tbody tr').length,200);
 paged.$('[data-ch35-more]').click();await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(paged.el.querySelectorAll('.ch35-table tbody tr').length,225);
 assert.equal(paged.$('[data-ch35-more-wrap]').hidden,true);
 paged.$('[data-x]').click();
 const html=fs.readFileSync('public/index.html','utf8');
 assert.ok(html.includes('vehicle-communication-v35.css?build=35'));
 assert.ok(html.includes('communication-history-v35.js?build=35'));
 assert.ok(html.indexOf('trip-parity-v13.js')<html.indexOf('communication-history-v35.js'));
 const source=fs.readFileSync('public/js/trip-parity-v13.js','utf8');
 assert.match(source,/G\.showTripCommunicationHistory/);
 assert.ok(source.includes('data-trip-history="${k}"'),'PNR link must open communication history');
 const styles=fs.readFileSync('public/css/vehicle-communication-v35.css','utf8');
 assert.ok(styles.includes('.vp-berth-option[aria-selected=true]'));
 assert.ok(styles.includes('.ch35-overlay .ch35-table'));
 console.log('PASS v35 communication UI: masked PNR header, SVGs, 4 tabs, 8 table columns, proper date/status, empty channel, scrolling, pagination, close and wiring');
})().catch(err=>{console.error(err);process.exit(1);});
