'use strict';
/* v41 screenshot-driven PNR third-tab -> ticket and invoice behavior. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><html><body><div id="toasts"></div><button id="origin">Open</button></body></html>',
 {url:'https://localhost/#/gds',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,d=w.document,delay=ms=>new Promise(r=>setTimeout(r,ms));
const model={
 operator:{name:'Example Travels',legal_name:'Example Travels Private Limited',
  gstin:'29AAAAA0000A1Z5',phone:'080-40000000',alternate_phone:'9000000001',
  email:'hello@example.com',address:'Example office, Bengaluru',website:'https://example.com',
  tagline:'Your Journey, Our Commitment'},
 pnr:'095301',booking_id:'ST-TEST-095301',source:'redbus',status:'CONFIRMED',
 payment:'paid',booked_at:'2026-11-22T10:35:00Z',booked_label:'22 Nov 2026, 16:05',
 service:'NTHB1',coach:'A/C Seater/Sleeper (2+1)',journey_minutes:840,seat_count:1,can_update:true,
 boarding:{id:'11',city:'Hyderabad',name:'LB Nagar Metro Station (Free metro Pickup)',
  time:'22 Nov 2026, 17:45',reporting:'22 Nov 2026, 17:33',
  instructions:'Avail Free Metro Pickup; show your ticket PNR',contact:'9000000001',
  maps_url:'https://www.google.com/maps/search/?api=1&query=17.1%2C78.2'},
 dropping:{id:'22',city:'Bengaluru',name:'Electronic City',time:'23 Nov 2026, 07:45',
  instructions:'Near Toll Plaza',contact:'9000000001',maps_url:''},
 contact:{name:'Sample Passenger',phone:'9876543210',email:''},
 passengers:[{name:'Sample Passenger',phone:'9876543210',gender:'M',age:26,seat:'17',fare:999}],
 fare:{gross:999,discount:99.90,net:899.10,gst:44.96,total:944.06},gst_rate:5,
 cancellation_policy:'The exact cancellation charge is shown before confirmation.',
 terms:['Reach the boarding point early.','Carry a government-issued photo ID.']
};
const stops={pickups:[{id:'11',name:'LB Nagar Metro Station',time:'17:45'},
 {id:'12',name:'Uppal Metro Station',time:'17:48'}],
 drops:[{id:'22',name:'Electronic City',time:'07:45'},
 {id:'23',name:'TIN Factory',time:'06:50'}]};
const log=[],api=[];
w.G={
 get:async url=>{log.push(['GET',url]);if(url.includes('/stops'))return stops;
  return JSON.parse(JSON.stringify(model));},
 put:async(url,body)=>{
  log.push(['PUT',url,body]);
  if(body.contact){
   model.contact={...body.contact};
   // The real backend maps each ticket passenger to the booking contact mobile.
   model.passengers.forEach(p=>p.phone=body.contact.phone);
  }
  if(body.boarding_stage_id)model.boarding={...model.boarding,id:body.boarding_stage_id,
   name:stops.pickups.find(p=>p.id===body.boarding_stage_id)?.name||model.boarding.name};
  if(body.dropping_stage_id)model.dropping={...model.dropping,id:body.dropping_stage_id,
   name:stops.drops.find(p=>p.id===body.dropping_stage_id)?.name||model.dropping.name};
  return model;
 },
 toast:(text,level)=>log.push(['TOAST',text,level]),
 err:e=>log.push(['ERROR',String(e)]),
};
w.can=()=>true;
w.fetch=async(url,opts)=>{
 api.push([url,opts]);
 return {ok:true,blob:async()=>new w.Blob(['%PDF-1.4 test ticket'],{type:'application/pdf'})};
};
w.URL.createObjectURL=()=>('blob:test');
w.HTMLAnchorElement.prototype.click=function(){log.push(['ANCHOR',this.download||this.href])};
w.URL.revokeObjectURL=()=>{};
const share=[];
w.navigator.share=async files=>{share.push(files);return undefined};
w.navigator.canShare=()=>true;
w.open=url=>{log.push(['OPEN',url]);return {document:d,focus:()=>{}}};
w.eval(fs.readFileSync('public/js/ticket-print-v41.js','utf8'));
w.eval(fs.readFileSync('public/js/booking-ticket-v38.js','utf8'));
const V={ticket:{pnr:'ST-TEST-095301',ticket_number:'095301',status:'confirmed'},
 pnr:'ST-TEST-095301',notifyOpen:false},S={detail:{id:'1'}},ctx={};
(async()=>{
 assert.ok(w.TicketPrintV41);
 await w.BookingTicketV38.click('print-invoice',{},S,V,ctx);
 let notice=d.querySelector('.ticket41-invoice-notice');
 assert.ok(notice,'Invoice must display a temporary top-right toast');
 assert.ok(notice.textContent.includes('Print invoice feature coming soon'));
 assert.ok(notice.querySelector('.ticket41-notice-progress'));
 notice.querySelector('[data-ticket41-dismiss]').click();
 assert.ok(!d.querySelector('.ticket41-invoice-notice'));
 await w.BookingTicketV38.click('print-ticket',{},S,V,ctx);
 await delay(25);
 let root=d.querySelector('.ticket41-overlay');
 assert.ok(root);
 assert.equal(d.body.style.overflow,'hidden');
 for(const x of ['Example Travels','Ticket','Update','Get your ticket','Download','Print','Share',
  'Booking ID','PNR','CONFIRMED','NTHB1','BOARDING','DROPPING','Passenger Detail',
  'Base Fare','Discount','Net Fare','GST (5%)','Amount Paid','Booked via:',
  'CANCELLATION POLICY','TERMS & CONDITIONS','COMPANY','GET IN TOUCH',
  'Secure Payments','RuPay','Net Banking']){
  assert.ok(root.textContent.includes(x),'Missing reference section: '+x);
 }
 assert.equal(root.querySelectorAll('.ticket41-pass tbody tr').length,1);
 assert.equal(root.querySelectorAll('.ticket41-terms li').length,2);
 assert.equal(root.querySelector('[data-t41="tab-ticket"]').getAttribute('aria-selected'),'true');
 assert.ok(root.querySelector('.ticket41-legal svg'));
 root.querySelector('[data-t41="download"]').click();await delay(20);
 assert.ok(api.some(x=>x[0].endsWith('/bookings/ST-TEST-095301/ticket/v41.pdf')));
 root.querySelector('[data-t41="print"]').click();await delay(20);
 assert.ok(d.querySelector('.ticket41-print-frame'),'Print action should open a PDF frame');
 root.querySelector('[data-t41="share"]').click();await delay(20);
 assert.equal(share.length,1);assert.equal(share[0].files[0].type,'application/pdf');
 root.querySelector('[data-t41="tab-update"]').click();
 assert.equal(root.querySelector('[data-t41="tab-update"]').getAttribute('aria-selected'),'true');
 assert.ok(root.classList.contains('ticket41-is-update'));
 assert.ok(root.querySelector('[data-t41="change-stops"]'));
 assert.ok(root.querySelector('[data-t41="change-mobile"]'));
 root.querySelector('[data-t41="change-stops"]').click();await delay(20);
 assert.equal(root.querySelectorAll('[data-t41-select]').length,2);
 assert.equal(root.querySelectorAll('select[data-t41-select="pickup"] option').length,2);
 root.querySelector('[data-t41-select="pickup"]').value='12';
 root.querySelector('[data-t41="save-stops"]').click();await delay(25);
 assert.ok(log.some(x=>x[0]==='PUT'&&x[2].boarding_stage_id==='12'),'Pickup change uses authorized API');
 assert.equal(model.boarding.id,'12');
 root.querySelector('[data-t41="change-mobile"]').click();
 assert.ok(root.querySelector('[data-t41-phone]'));
 root.querySelector('[data-t41-phone]').value='9876543201';
 root.querySelector('[data-t41="save-mobile"]').click();await delay(25);
 assert.ok(log.some(x=>x[0]==='PUT'&&x[2].contact?.phone==='9876543201'));
 assert.equal(model.contact.phone,'9876543201');
 root.querySelector('[data-t41="tab-ticket"]').click();
 assert.ok(root.textContent.includes('9876543201'));
 root.querySelector('[data-t41="theme"]').click();
 assert.ok(root.classList.contains('ticket41-dark'));
 root.querySelector('[data-t41="close"]').click();
 assert.ok(!d.querySelector('.ticket41-overlay'));
 assert.equal(d.body.style.overflow,'');
 const html=fs.readFileSync('public/index.html','utf8');
 const b=fs.readFileSync('public/js/booking-ticket-v38.js','utf8');
 const css=fs.readFileSync('public/css/ticket-print-v41.css','utf8');
 assert.ok(html.includes('ticket-print-v41.js?build=41'));
 assert.ok(html.includes('ticket-print-v41.css?build=41'));
 assert.ok(html.indexOf('ticket-print-v41.js')<html.indexOf('/js/main.js'));
 assert.ok(b.includes('TicketPrintV41.open(V.pnr)'));
 assert.ok(b.includes('TicketPrintV41.invoiceNotice()'));
 assert.ok(css.includes('.ticket41-invoice-notice')&&css.includes('.ticket41-updatecards'));
 console.log('PASS v41 ticket UI: screenshot Ticket/Update panels, SVGs, fare/passenger/policy/terms, print/download/share PDF, staff update flows, timed invoice notice');
 dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1});
