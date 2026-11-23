/* CRM screenshot v8: search-gated customer 360 and two-deck ticket console. */
(function () {
'use strict';
const E = v => esc(v == null ? '' : String(v));
const I = (name, size=18) => {
 const d = {
  users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m11-7a4 4 0 1 0-8 0 4 4 0 0 0 8 0Zm3-9v6m3-3h-6',
  phone:'M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 2.09 4.18 2 2 0 0 1 4.09 2h3a2 2 0 0 1 2 1.72l.55 3a2 2 0 0 1-.57 1.71L7.91 9.59a16 16 0 0 0 6.5 6.5l1.16-1.16a2 2 0 0 1 1.71-.57l3 .55A2 2 0 0 1 22 16.92z',
  mail:'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm-2 2 10 7L22 6',
  ticket:'M2 9V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a3 3 0 0 0 0 6v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a3 3 0 0 0 0-6zm10-5v3m0 4v2m0 4v3',
  search:'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm6-2 5 5',
  x:'M18 6 6 18M6 6l12 12',
  eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  chat:'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.5-8.5h.5A8.5 8.5 0 0 1 21 11.5z',
  calendar:'M3 5h18v16H3zM7 2v6m10-6v6M3 10h18',
  pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0zm-8 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  wallet:'M20 7H4a2 2 0 0 0-2 2v10h20V9a2 2 0 0 0-2-2zM4 7V4h15v3M16 14h4',
  plane:'M22 2 9 12l-6 1-1 3 8-1 1 7 3-1 1-9 7-10z',
  crown:'m2 7 5 4 5-7 5 7 5-4-2 13H4L2 7z',
  spark:'M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2z',
  circlex:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM15 9l-6 6m0-6 6 6',
  edit:'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4L16.5 3.5z',
  printer:'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  bell:'M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9m-8 13h4',
  history:'M3 12a9 9 0 1 0 3-7M3 3v5h5m4-1v5l4 2',
  arrows:'M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4',
  clipboard:'M8 4h8l2 3h3v14H3V7h3l2-3zm0 0V2h8v2M8 11h8m-8 4h8',
  plus:'M12 5v14M5 12h14',
  clock:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm0-16v6l4 2',
  filter:'M3 6h18M7 12h10m-7 6h4',
  chevron:'m6 9 6 6 6-6',
  bus:'M4 5h16v12H4zM4 13h16M7 20h.01M17 20h.01',
  star:'M12 2 15 9l7 .5-5.5 5 1.5 7.5-6-4-6 4 1.5-7.5L2 9.5 9 9z',
  rupee:'M6 3h12M6 8h12M7 3c7 0 7 10 0 10l8 8',
  more:'M4 12h.01M12 12h.01M20 12h.01',
  route:'M6 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm12 12a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM6 8v3c0 2 3 2 6 2s6 0 6 3'
 };
 return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d[name]||d.more}"/></svg>`;
};
const R = n => `₹${Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const dmy = x => x ? String(x).slice(0,10).split('-').reverse().join('/') : '—';
const journeyDate = x => x ? new Date(String(x).slice(0,10)+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—';
const datetime = x => x ? new Date(x).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
const time = x => {if(!x)return '—';const [h,m]=String(x).split(':').map(Number);return Number.isFinite(h)?`${(h%12)||12}:${String(m||0).padStart(2,'0')} ${h>=12?'PM':'AM'}`:E(x)};
const statusName = b => b.status === 'confirmed' ? 'Confirmed' : b.status === 'cancelled' ? 'Cancelled' : b.status === 'hold' ? 'Hold' : b.status === 'expired' ? 'Expired' : b.status === 'released' ? 'Expired' : E(b.status);
const cls = b => b.status==='confirmed'?'confirmed':b.status==='cancelled'?'cancelled':'expired';
function customerCard(c) {
 const route=c.last_route || {}, name=E(c.name), initial=(c.name||'?').trim().charAt(0).toUpperCase();
 return `<article class="cv8-customer" data-cv8-phone="${E(c.phone)}"><div class="cv8-customer-hd"><div class="cv8-avatar">${E(initial)}</div><div class="cv8-identity"><div class="cv8-name">${name} <span class="cv8-tier">${I('crown',14)} ${E(c.tier)}</span></div><div class="cv8-meta"><span>${I('phone',15)} ${E(c.phone)}</span><span>${I('mail',15)} ${E(c.email||'Not provided')}</span><span>${I('pin',15)} ${E(route.from||'—')} → ${E(route.to||'—')}</span><span>${I('calendar',15)} Last: ${dmy(c.last_travel)}</span></div></div><div class="cv8-person-actions"><button class="cv8-plain" data-cv8-call="${E(c.phone)}">${I('phone')} Call</button><button class="cv8-square" data-cv8-chat="${E(c.phone)}" title="Open passenger chats">${I('chat',22)}</button></div></div>
  <div class="cv8-kpis"><div class="cv8-stat"><span class="cv8-stat-ico sky">${I('plane',23)}</span><div><small>TOTAL TRIPS</small><strong>${E(c.total_trips)}</strong><label>${E(c.upcoming)} upcoming · ${E(c.cancelled)} cancelled</label></div></div><div class="cv8-stat"><span class="cv8-stat-ico mint">${I('wallet',22)}</span><div><small>TOTAL SPEND</small><strong class="green">${R(c.spend)}</strong><label>Lifetime value</label></div></div><div class="cv8-stat"><span class="cv8-stat-ico coral">${I('circlex',22)}</span><div><small>CANCELLATION RATE</small><strong>${E(c.cancellation_pct)}%</strong><label>${E(c.cancelled)} of ${E(c.total_bookings)} bookings</label></div></div><div class="cv8-stat"><span class="cv8-stat-ico lilac">${I('spark',22)}</span><div><small>BALANCE MILES</small><strong class="purple">${E(Number(c.miles||0).toLocaleString('en-IN'))}</strong><label>Available loyalty miles</label></div></div></div></article>`;
}
function ticketRow(b) {
 const passenger=b.passengers?.[0]||{}, initial=String(passenger.name||b.contact?.name||'?').trim().charAt(0).toUpperCase();
 return `<tr class="cv8-ticketrow ${cls(b)}"><td><span class="cv8-status ${cls(b)}"><span class="cv8-dot"></span>${statusName(b)}</span></td><td><div class="cv8-pax"><b class="cv8-initial">${E(initial)}</b><div><strong>${E(passenger.name||b.contact?.name)}</strong><div class="cv8-muted">${E(b.contact?.phone||'')}</div><div class="cv8-muted">${E(b.contact?.email||'')}</div></div><button class="cv8-tiny-blue" data-cv8-chat="${E(b.contact?.phone)}" title="Chat passenger">${I('chat',18)}</button></div></td><td><button class="cv8-link" data-cv8-booking="${E(b.pnr)}">${I('eye',18)} ${E(b.pnr)}</button><div class="cv8-muted">${E(b.ticket_number)}</div></td><td><div class="cv8-route">${E(b.from)} <span>→</span> ${E(b.to)}</div></td><td><strong>${E(b.seat_codes?.join(', ')||'—')}</strong><div class="cv8-muted">${E(b.seat_codes?.length||0)} seat(s)</div></td><td><strong>${R(b.amount)}</strong></td><td>${dmy(b.travel_date)}</td><td>${dmy(b.booked_at)}<div class="cv8-muted">${datetime(b.booked_at).split(', ').slice(-1)[0]}</div><div class="cv8-muted">${E(b.source)}</div></td><td><button class="cv8-small-btn" data-cv8-booking="${E(b.pnr)}" title="View ticket">${I('eye')}</button></td></tr>`;
}
const filterList=[['all','All'],['confirmed','Confirmed'],['cancelled','Cancelled'],['expired','Expired']];
G.screens.crm = async (el,p) => {
 const q=G.query(); let state={mode:q.mode||'pnr',query:q.q||'',data:null,filter:'all',busy:false,serial:0};
 if(p?.id){state.mode='phone';state.query=decodeURIComponent(p.id)}
 el.classList.add('cv8-page');
 const header=()=>`<section class="cv8-searchpanel"><div class="cv8-search-main"><div class="cv8-titleicon">${I('users',27)}</div><div class="cv8-title"><strong>Passenger Search</strong><small>Customer 360 · trips, loyalty & contact</small></div><div class="cv8-modes">${[['phone','Phone'],['email','Email'],['pnr','PNR']].map(([k,v])=>`<button type="button" data-cv8-mode="${k}" class="${k===state.mode?'active':''}">${I(k==='pnr'?'ticket':k==='email'?'mail':'phone',18)} ${v}</button>`).join('')}</div><form class="cv8-searchform" data-cv8-searchform><span>${I('search',23)}</span><input data-cv8-q aria-label="Passenger ${E(state.mode)}" autocomplete="off" placeholder="${state.mode==='phone'?'Enter phone number':state.mode==='email'?'Enter passenger email':'Enter PNR / ticket number'}" value="${E(state.query)}"><button type="button" class="cv8-clear" data-cv8-clear title="Clear search">${I('x',18)}</button><button class="cv8-primary" type="submit">Search</button></form></div><div data-cv8-countbar></div></section><div data-cv8-results></div>`;
 el.innerHTML=header();
 const $=s=>el.querySelector(s);
 const paint=()=>{
  const target=$('[data-cv8-results]'),bar=$('[data-cv8-countbar]');
  if(!state.data){bar.innerHTML='';target.innerHTML='<section class="cv8-unsearched"><div class="cv8-empty-icon">'+I('search',31)+'</div><strong>Find a passenger</strong><span>Search by phone number, email or PNR to view a customer and their bookings.</span></section>';return;}
  const d=state.data,bs=d.bookings||[],tot={all:bs.length,confirmed:bs.filter(b=>cls(b)==='confirmed').length,cancelled:bs.filter(b=>cls(b)==='cancelled').length,expired:bs.filter(b=>cls(b)==='expired').length};
  bar.innerHTML=`<div class="cv8-countbar"><span><strong>${d.total??bs.length}</strong> ${(d.total??bs.length)===1?'trip':'trips'} for <b>${E(d.query)}</b></span><div class="cv8-status-tabs">${filterList.map(([k,v])=>`<button data-cv8-filter="${k}" class="${state.filter===k?'active':''}"><i class="dot ${k}"></i>${v} <em>${tot[k]}</em></button>`).join('')}</div></div>`;
  target.innerHTML=d.customers?.length?`${d.customers.map(customerCard).join('')}<div class="cv8-table-scroll"><table class="cv8-tickets"><thead><tr>${[['circlex','STATUS'],['users','NAME'],['ticket','TICKET NO'],['route','ROUTE'],['bus','SEAT NUMBERS'],['rupee','TICKET FARE'],['calendar','JOURNEY DATE'],['clock','ISSUED ON'],['more','']].map(([i,v])=>`<th>${I(i,18)} ${v}</th>`).join('')}</tr></thead><tbody>${bs.filter(b=>state.filter==='all'||cls(b)===state.filter).map(ticketRow).join('')||'<tr><td colspan="9" class="cv8-none">No bookings match this status</td></tr>'}</tbody></table></div>`:'<div class="cv8-unsearched"><strong>No matching passenger found</strong><span>Check the '+E(state.mode)+' and search again.</span></div>';
 };
 async function search(){const serial=++state.serial;state.query=$('[data-cv8-q]').value.trim();state.filter='all';if(!state.query){state.data=null;paint();return;}const mode=state.mode;
  if(mode==='phone'&&!/^\+?[0-9\s()-]{7,20}$/.test(state.query))return G.toast('Enter a valid passenger phone number','bad');
  if(mode==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.query))return G.toast('Enter a valid passenger email','bad');
  if(mode==='pnr'&&state.query.length<4)return G.toast('Enter at least four PNR characters','bad');
  $('[data-cv8-results]').innerHTML='<div class="cv8-loading">Searching passenger records…</div>';
  try{const data=await G.get(`/crm/passenger-search?${G.qs({mode,q:state.query})}`);if(serial!==state.serial||mode!==state.mode)return;state.data=data}catch(ex){if(serial!==state.serial)return;state.data=null;paint();G.err(ex);return;}paint();
 }
 if(el._cv8Click)el.removeEventListener('click',el._cv8Click);
 el._cv8Click=evt=>{const x=evt.target.closest('[data-cv8-mode]');if(x){state.serial++;state.mode=x.dataset.cv8Mode;state.data=null;state.query='';el.innerHTML=header();paint();return;}
 const clear=evt.target.closest('[data-cv8-clear]');if(clear){state.serial++;state.query='';state.data=null;$('[data-cv8-q]').value='';paint();return;}
 const f=evt.target.closest('[data-cv8-filter]');if(f){state.filter=f.dataset.cv8Filter;paint();return;}
 const b=evt.target.closest('[data-cv8-booking]');if(b){openBooking(b.dataset.cv8Booking,search);return;}
 const cb=evt.target.closest('[data-cv8-call]');if(cb){const customer=state.data?.customers.find(c=>c.phone===cb.dataset.cv8Call);if(!can('calls.make'))return G.toast('Calls are not enabled for your role','warn');G.callNow({phone:cb.dataset.cv8Call,name:customer?.name});return;}
 const chat=evt.target.closest('[data-cv8-chat]');if(chat){const customer=state.data?.customers.find(c=>c.phone===chat.dataset.cv8Chat);if(!can('chats.view'))return G.toast('Chat access is not enabled for your role','warn');location.hash=`#/chats?q=${encodeURIComponent(customer?.phone||chat.dataset.cv8Chat)}`;}
 };el.addEventListener('click',el._cv8Click);
 if(el._cv8Submit)el.removeEventListener('submit',el._cv8Submit);el._cv8Submit=evt=>{if(evt.target.matches('[data-cv8-searchform]')){evt.preventDefault();search()}};el.addEventListener('submit',el._cv8Submit);
 paint();if(state.query)await search();
};
// v45 deck maps are rendered by CRMJourneyV45 from server-defined seat geometry.
function detailsBox(icon,title,content,more=''){return `<section class="cv8-detailcard ${more}"><h3><span class="cv8-card-icon">${I(icon,23)}</span>${title}</h3>${content}</section>`}
function printBooking(b,invoice=false){const win=window.open('','_blank','width=860,height=700');if(!win){G.toast('Allow popups to print the ticket','warn');return;}
 const safe=v=>E(v);
 win.document.write(`<!doctype html><html><head><title>${invoice?'Payment statement':'Ticket'} ${safe(b.pnr)}</title><style>body{font:15px Arial,sans-serif;color:#17213d;margin:40px}h1{color:#235de9}table{border-collapse:collapse;width:100%}td,th{padding:10px;border:1px solid #ddd;text-align:left}</style></head><body><h1>${invoice?'Booking payment statement':'Passenger ticket'}</h1><p>Service ${safe(b.service)} · PNR ${safe(b.pnr)} · ${safe(dmy(b.travel_date))}</p><p>${safe(b.from)} → ${safe(b.to)}</p><p>Contact ${safe(b.contact?.name)} · ${safe(b.contact?.phone)}</p><table><tr><th>Passenger</th><th>Seat</th><th>Fare</th></tr>${(b.passengers||[]).map(p=>`<tr><td>${safe(p.name)}</td><td>${safe(p.seat)}</td><td>${R(p.fare)}</td></tr>`).join('')}</table><h2>Total ${R(b.fare?.total)}</h2><p>Payment status: ${safe(b.payment)}</p>${invoice?'<p>This is a payment statement, not a statutory GST tax invoice. Verify operator invoice details before issuing one.</p>':''}</body></html>`);win.document.close();win.focus();win.print();}
async function shiftBookingV45(b){
 const pnr=b.pnr;
 const active=(b.passengers||[]).filter(p=>p.status!=='cancelled');
 if(!active.length){G.toast('This booking has no active passenger seats','warn');return false;}
 const proposed=b.travel_date>=today()?b.travel_date:today();
 const datePrompt=await G.prompt('Shift Passenger · Select journey date',[
  {name:'date',label:'Target journey date',type:'date',required:true,value:proposed}
 ],{ok:'Find services'});
 if(!datePrompt)return false;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(datePrompt.date||''))){G.toast('Select a valid journey date','bad');return false;}
 const options=await G.get('/bookings/'+encodeURIComponent(pnr)+'/shift-options?date='+encodeURIComponent(datePrompt.date));
 const services=options.services||[];
 if(!services.length){G.toast('No eligible active services with this journey direction','warn');return false;}
 const serviceChoice=await G.prompt('Shift Passenger · Select service',[
  {name:'schedule_id',type:'select',label:'Target service',full:true,required:true,
   options:services.map(x=>[String(x.id),x.service+' · '+x.departure_time+' · '+x.free_seats+' free seats'])}
 ],{ok:'Choose passenger seats'});
 if(!serviceChoice)return false;
 const selected=services.find(x=>String(x.id)===String(serviceChoice.schedule_id));
 if(!selected){G.toast('Choose an available service','bad');return false;}
 const layout=await G.get('/bookings/'+encodeURIComponent(pnr)+'/shift-seats?schedule_id='+encodeURIComponent(selected.id));
 const choices=layout.seats||[];
 if(choices.length<active.length){G.toast('Not enough available seats on the target service','warn');return false;}
 const fields=active.map((p,i)=>({
  name:'seat_'+i,label:'New seat for '+p.name+' ('+p.seat+')',type:'select',required:true,full:true,
  options:choices.map(x=>[String(x.seat),x.seat+' · '+(x.status||'available').replace(/_/g,' ')])
 }));
 fields.push({name:'notify',label:'Record passenger notification after shift',type:'checkbox',value:true,full:true});
 const assignment=await G.prompt('Shift Passenger · Assign seats',fields,{ok:'Review shift'});
 if(!assignment)return false;
 const assigned=active.map((p,i)=>String(assignment['seat_'+i]||''));
 if(assigned.some(x=>!choices.some(y=>String(y.seat)===x))||new Set(assigned).size!==assigned.length){
  G.toast('Select a different available target seat for every passenger','bad');return false;
 }
 const seat_map=Object.fromEntries(active.map((p,i)=>[String(p.seat),assigned[i]]));
 const description=active.length+' passenger(s) to '+datePrompt.date+' · '+selected.service+
  ' · '+Object.entries(seat_map).map(([from,to])=>from+' → '+to).join(', ');
 const confirmed=await G.confirm('Confirm shift of '+description+'?',{ok:'Confirm Shift'});
 if(!confirmed)return false;
 await G.post('/bookings/'+encodeURIComponent(pnr)+'/shift',{schedule_id:Number(selected.id),seat_map});
 if(assignment.notify&&can('trips.chat')){
  try {
   const notice=await G.post('/trips/'+encodeURIComponent(selected.id)+'/notify',{
    template:'ticket_confirmation',pnrs:[pnr]
   });
   if(notice.recorded)G.toast('Passenger message recorded; external delivery not verified','ok');
  }catch(error){G.toast('Shift saved, but notification was not recorded: '+error.message,'warn');}
 }
 return true;
}
async function openBooking(pnr,refreshCustomer){
 let resp;try{resp=await G.get(`/crm/booking/${encodeURIComponent(pnr)}`)}catch(e){G.err(e);return;}
 const b=resp.booking,map=resp.map,previousFocus=document.activeElement,root=document.createElement('div');root.className='cv8-overlay cv8-v45-overlay';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label',`Booking details ${pnr}`);
 const maptpl=CRMJourneyV45.mapHtml(map,b);
 const fare=b.fare||{}, base=Number(fare.gross||0),discount=Number(fare.discount||0),miles=Number(fare.miles_discount||0),net=base-discount-miles,gst=Number(fare.gst||0),total=Number(fare.total||0);
 const fareBox=detailsBox('clipboard','',`<div class="cv8-fare-row"><span>Base Fare (${b.passengers.length} seat${b.passengers.length>1?'s':''})</span>${R(base)}</div><div class="cv8-fare-row good"><span>Discount</span>−${R(discount)}</div>${miles?`<div class="cv8-fare-row good"><span>Miles redeemed</span>−${R(miles)}</div>`:''}<div class="cv8-fare-row"><span>Net Fare</span>${R(net)}</div><div class="cv8-fare-row"><span>GST (5%)</span>${R(gst)}</div><div class="cv8-fare-row total"><strong>Total Payable</strong><strong>${R(total)}</strong></div><div class="cv8-fare-row good"><span>Amount Paid</span>${b.payment==='paid'?R(total):b.payment==='settle_later'?'Pending settlement':b.payment==='unpaid'?'Not paid':'—'}</div>`,'fare');
 root.innerHTML=`<div class="cv8-dialog"><header class="cv8-dialog-hd"><h2>Book Seats - ${E(b.service)}</h2><div>${E(b.from)} → ${E(b.to)} • ${journeyDate(b.travel_date)}</div><button class="cv8-dialog-close" data-cv8-close title="Close">${I('x',24)}</button></header><div class="cv8-dialog-body"><div class="cv8-map-side"><div class="cv8-map-wrap"><div class="cv8-busmaps">${maptpl}</div></div><div class="cv8-seat-inspection" data-cv8-seat-inspection role="status" aria-live="polite"></div><div class="cv8-seat-rule">${I('users',18)} Seat availability and adjacency restrictions follow the current route configuration.</div></div><aside class="cv8-dialog-side"><section class="cv8-actionbar"><button class="primary" data-cv8-action="edit" ${b.status==='confirmed'&&can('bookings.modify')?'':'disabled title="Requires confirmed booking and permission"'}>${I('edit')} Update Ticket</button><button data-cv8-action="print">${I('printer')} Print Ticket</button><button data-cv8-action="invoice">${I('clipboard')} Print Invoice</button><span class="cv8-notifyholder"><button data-cv8-action="notify-toggle" ${can('trips.chat')?'':'disabled title="Messaging permission required"'}>${I('bell')} Notify ${I('chevron',14)}</button><div class="cv8-notifymenu" data-cv8-notifymenu hidden>${[['ticket_confirmation','Ticket Confirmation','Resend booking confirmation'],['bus_details','Bus Details','Tracker + bus + driver'],['custom','Bus Delay / Early','Reason + minutes + tracker'],['bus_cancellation','Bus Cancellation','Inform pax; cancellation is separate']].map(([k,t,st])=>`<button data-cv8-notify="${k}"><b>${t}</b><small>${st}</small></button>`).join('')}</div></span><button class="danger" data-cv8-action="cancel" ${b.status==='confirmed'&&can('bookings.cancel')?'':'disabled title="Requires confirmed booking and cancellation permission"'}>${I('circlex')} Cancel Ticket</button><button data-cv8-action="shift" ${b.status==='confirmed'&&can('bookings.modify')&&can('bookings.view_all')?'':'disabled title="Requires confirmed booking and access"'}>${I('arrows')} Shift Passenger</button><button data-cv8-action="history" ${can('bookings.view_all')?'':'disabled title="Booking history requires access"'}>${I('history')} Show History</button><button data-cv8-action="chat" ${can('chats.view')?'':'disabled title="Chat permission required"'}>${I('chat')} Chat Pax</button><button data-cv8-action="comment" ${can('bookings.comments')?'':'disabled title="Booking comment permission required"'}>${I('plus')} Comment</button></section>
 ${CRMJourneyV45.ticketCard(b,I,datetime)}
 <section class="cv8-commentcard"><div>COMMENTS <button data-cv8-action="comment" ${can('bookings.comments')?'':'disabled title="Booking comment permission required"'}>${I('plus',16)} Add comment</button></div>${b.comments?.length?b.comments.map(c=>`<p>${E(c.text)}<small> · ${E(c.by)} ${datetime(c.at)}</small></p>`).join(''):'<p class="cv8-muted">No comments yet</p>'}</section>
 ${detailsBox('calendar','Contact & Journey Details',`<div class="cv8-contactgrid"><div>${I('phone',22)} <span><small>MOBILE</small><strong>${E(b.contact?.phone||'—')}</strong></span></div><div>${I('mail',22)} <span><small>EMAIL</small><strong>${E(b.contact?.email||'N/A')}</strong></span></div><div>${I('pin',22)} <span><small>PICKUP POINT</small><strong>${E(b.boarding?.name||b.from)}</strong></span><b>${time(b.boarding?.time)}</b></div><div>${I('pin',22)} <span><small>DROP POINT</small><strong>${E(b.dropping?.name||b.to)}</strong></span><b>${time(b.dropping?.time)}</b></div></div>`,'contact')}
 <div class="cv8-sectionhead">${I('users',24)} <h3>Passenger Information</h3></div>${CRMJourneyV45.passengerCards(b,I,R)}
 ${fareBox}${detailsBox('wallet','',`<div class="cv8-paid">Payment: <span class="cv8-paidbadge">${E(b.payment||'Unknown')}</span></div><div class="cv8-fare-row"><span>Method</span>${E(b.payment_method||'Not recorded')}</div><div class="cv8-fare-row"><span>Source</span>${E(b.source)}</div>${fare.commission!=null?`<div class="cv8-fare-row"><span>Commission</span>${R(fare.commission)}</div>`:''}`,'payment')}
 <div class="cv8-dialog-foot"><button class="cv8-primary" data-cv8-close>${I('x',18)} Close</button></div></aside></div><div class="cv8-outerfooter"><button data-cv8-close>Close</button></div></div>`;
 document.body.appendChild(root);document.body.classList.add('cv8-locked');
 const close=()=>{root.remove();if(!document.querySelector('.cv8-overlay'))document.body.classList.remove('cv8-locked');document.removeEventListener('keydown',escClose);if(previousFocus?.isConnected)previousFocus.focus()};
 function escClose(ev){if(ev.key==='Escape'){if(document.querySelector('#modal-root .ov'))return;ev.preventDefault();close();return;}if(ev.key==='Tab'){const items=[...root.querySelectorAll('button:not(:disabled),[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')].filter(x=>x.offsetParent!==null);if(!items.length)return;const first=items[0],last=items[items.length-1];if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last.focus()}else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first.focus()}}}
 document.addEventListener('keydown',escClose);root.querySelector('.cv8-dialog-close')?.focus();root.addEventListener('click',async ev=>{
  const seatButton=ev.target.closest('[data-cv8-seat]');if(seatButton){const note=root.querySelector('[data-cv8-seat-inspection]');if(note)note.textContent=seatButton.getAttribute('aria-label');return;}

  if(ev.target===root||ev.target.closest('[data-cv8-close]'))return close();
  const a=ev.target.closest('[data-cv8-action]');if(a){const type=a.dataset.cv8Action;if(type==='booking-collapse'){const card=root.querySelector('[data-cv8-bookingcard]');const folded=card.classList.toggle('is-collapsed');a.setAttribute('aria-expanded',String(!folded));a.setAttribute('aria-label',folded?'Expand booking details':'Collapse booking details');return;}if(type==='notify-toggle'){const box=root.querySelector('[data-cv8-notifymenu]');box.hidden=!box.hidden;return}
   if(type==='print'){if(window.TicketPrintV41&&can('bookings.view_all'))return TicketPrintV41.open(b.pnr);return printBooking(b,false);}
   if(type==='invoice'){G.toast('A statutory tax invoice is not available; the document is a booking payment statement.','warn');return printBooking(b,true);}
   if(type==='chat'){close();location.hash=`#/chats?q=${encodeURIComponent(b.contact?.phone||'')}`;return}
   if(type==='comment'){
    if(!can('bookings.comments'))return G.toast('Booking comments require staff comment permission','warn');
    const v=await G.prompt('Add booking comment',[{name:'text',label:'Comment',type:'textarea',required:true,full:true}],{ok:'Add comment'});if(v?.text){await G.post(`/bookings/${encodeURIComponent(pnr)}/comments`,{text:v.text.trim()});close();await openBooking(pnr,refreshCustomer);refreshCustomer?.();}return;}
   if(type==='history'){
    if(!can('bookings.view_all'))return G.toast('Booking history requires booking access','warn');
    const history=await G.get(`/bookings/${encodeURIComponent(pnr)}/history`);const events=history.events||[];
    G.modal({title:`Ticket history · ${E(b.ticket_number||pnr)}`,size:'lg',body:`<div class="cv8-history">${events.map(x=>`<div><b>${E(x.title||'Change')}</b> · ${datetime(x.at)}<div>${E(x.actor||'System')} · ${E(x.source||'GDS')}</div>${(x.details||[]).map(y=>`<p>${E(y.label)}: ${E(y.value)}</p>`).join('')}</div>`).join('')||'<p>No recorded booking events.</p>'}</div>`});return;}
   if(type==='edit'){
    if(!can('bookings.modify'))return G.toast('Booking edit requires permission','warn');
    const v=await G.prompt('Update ticket',[{name:'name',label:'Contact name',value:b.contact.name},{name:'phone',label:'Mobile',value:b.contact.phone},{name:'email',label:'Email',value:b.contact.email||''},...(b.passengers||[]).map((p,i)=>({name:`p_${i}`,label:`Passenger ${p.seat}`,value:p.name}))],{ok:'Save changes'});
    if(v){await G.put(`/bookings/${encodeURIComponent(pnr)}`,{contact:{name:v.name,phone:v.phone,email:v.email},passengers:b.passengers.map((p,i)=>({seat:p.seat,name:v[`p_${i}`]}))});close();refreshCustomer?.();await openBooking(pnr,refreshCustomer)}return;}
   if(type==='cancel'){
    if(!can('bookings.cancel'))return G.toast('Cancellation requires permission','warn');
    const q=await G.get(`/bookings/${encodeURIComponent(pnr)}/refund-quote`);const v=await G.prompt('Cancel ticket',[{name:'by',label:'Cancelled by',type:'select',options:[['passenger',`Passenger · ${q.refund_pct}% policy refund`],['operator','Operator · 100% refund']]},{name:'reason',label:'Reason',required:true},{name:'notify',label:'Notify passenger',type:'checkbox',value:true}],{ok:'Cancel booking'});
    if(v){const yes=await G.confirm('Confirm ticket cancellation?',{ok:'Cancel ticket'});if(yes){await G.post(`/bookings/${encodeURIComponent(pnr)}/cancel`,{by:v.by,reason:v.reason,notify:v.notify});close();refreshCustomer?.();G.toast('Booking cancellation recorded','ok')}}return;}
   if(type==='shift'){
    if(!can('bookings.modify')||b.status!=='confirmed')return G.toast('Only confirmed tickets can be shifted with permission','warn');
    const changed=await shiftBookingV45(b);
    if(changed){close();await refreshCustomer?.();G.toast('Passenger shifted successfully','ok');}
    return;
   }
  }
  const notify=ev.target.closest('[data-cv8-notify]');if(notify){if(!can('trips.chat'))return G.toast('Notifications require trip messaging permission','warn');const t=notify.dataset.cv8Notify;root.querySelector('[data-cv8-notifymenu]').hidden=true;let text='';
    if(t==='custom'||t==='bus_cancellation'){const v=await G.prompt(t==='custom'?'Bus delay / early notification':'Bus cancellation notice',[{name:'minutes',label:'Delay / early (minutes)',type:'number',value:0},{name:'reason',label:'Reason / message',type:'textarea',full:true,required:true}],{ok:'Send message'});if(!v)return;text=t==='custom'?`Bus update: ${v.minutes||0} minute(s). ${v.reason}`:v.reason;}
    const ok=await G.confirm(`Send ${E(t.replace(/_/g,' '))} notification for PNR ${E(pnr)}?`,{ok:'Send notification'});if(!ok)return;
    const result=await G.post(`/trips/${b.schedule_id}/notify`,{pnrs:[pnr],template:t,text});G.toast(result.recorded?`Message recorded for ${result.recorded} booking(s); external delivery is not verified.`:'No eligible confirmed booking found',result.recorded?'ok':'warn');return;
  }
 });
}
window.__CRM_SCREENSHOT_V8__='2026-11-23-crm-v45';
})();
