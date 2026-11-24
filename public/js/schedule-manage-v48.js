/* v48 | Schedules → Manage → Bookings
   Screenshot-aligned summary, timeline, seat layout, notifications, live location,
   timings and delay controls. UI presents only server-backed facts. */
(function(root){
'use strict';
const E=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const iconPaths={
 close:'<path d="M18 6 6 18M6 6l12 12"/>',
 stations:'<circle cx="5" cy="5" r="2"/><circle cx="19" cy="7" r="2"/><circle cx="12" cy="20" r="2"/><path d="M7 6l10 1M6 7l5 11M18 9l-5 9"/>',
 pickups:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/>',
 drops:'<path d="M12 22s8-7 8-12a8 8 0 1 0-16 0c0 5 8 12 8 12Z"/><circle cx="12" cy="10" r="2"/><path d="m8 11 3 3 5-6"/>',
 bookedby:'<circle cx="9" cy="8" r="4"/><path d="M2 21v-3a6 6 0 0 1 12 0v3m4-9a4 4 0 0 0 0-8m1 17v-3a6 6 0 0 0-3-5"/>',
 bookings:'<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 6h6M9 10h6M9 14h6M9 18h6"/>',
 location:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
 timings:'<path d="M4 4h3v4H4zM4 11h3v4H4zM4 18h3v4H4zM11 6h10M11 13h10M11 20h10"/>',
 delay:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3"/>',
 notify:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 12a2 2 0 0 0 4 0"/>',
 print:'<path d="M6 9V3h12v6M6 18H3V9h18v9h-3M6 15h12v7H6z"/>',
 refresh:'<path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7"/>',
 search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
 history:'<path d="M3 12a9 9 0 1 0 3-6.7M3 3v5h5m4-1v5l3 2"/>',
 pin:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/>'
};
const I=(n,size=21)=>'<svg class="sx48-svg" viewBox="0 0 24 24" width="'+size+'" height="'+size+'" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(iconPaths[n]||iconPaths.pin)+'</svg>';
const SECTIONS={
 stations:['Multi-station','stations','purple'],
 pickups:['Pickup points','pickups','green'],
 drops:['Drop-off points','drops','pink'],
 bookedby:['Booked by','bookedby','orange'],
 bookings:['Booking history','bookings','blue'],
 location:['Live location','location','indigo'],
 timings:['Timings','timings','indigo']
};
const TZONE='Asia/Kolkata';
const iso=x=>{const ms=Date.parse(String(x||''));return Number.isFinite(ms)?ms:NaN};
function datetime(x,short=false){
 if(!Number.isFinite(iso(x)))return '—';
 return new Intl.DateTimeFormat('en-GB',{timeZone:TZONE,day:'2-digit',month:short?'short':'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true}).format(new Date(x));
}
function hm(v){
 if(!v)return '—';const m=String(v).match(/^([01]?\d|2[0-3]):([0-5]\d)/);
 if(!m)return E(v);
 const hh=Number(m[1]);return String(hh%12||12).padStart(2,'0')+':'+m[2]+' '+(hh>=12?'PM':'AM');
}
function numSort(a,b){
 const k=x=>String(x).match(/^(\d+)(.*)$/);
 const x=k(a),y=k(b);if(!x||!y)return String(a).localeCompare(String(b),'en');
 return Number(x[1])-Number(y[1])||String(x[2]).localeCompare(String(y[2]));
}
function live(S){
 const active=new Set((S.history||[]).filter(b=>b.status==='confirmed').map(b=>String(b.pnr)));
 return (S.trip?.passengers||[]).filter(p=>active.has(String(p.pnr))&&p.status!=='cancelled'&&p.status!=='released'&&p.status!=='expired');
}
const currentBookings=S=>(S.history||[]).filter(b=>b.status==='confirmed'&&live(S).some(p=>String(p.pnr)===String(b.pnr)));
function chips(ps){return '<div class="sx48-chips">'+ps.slice().sort((a,b)=>numSort(a.seat,b.seat)).map(p=>
 '<button type="button" class="sx48-chip" data-sx48-pnr="'+E(p.pnr)+'" title="View ticket">'+E(p.seat)+'</button>').join('')+'</div>';}
function overlay(title,icon,color,subtitle,body,{wide=false,search=false,refresh=null}={}){
 const last=document.activeElement;
 const node=document.createElement('div');
 node.className='sx48-overlay';node.setAttribute('role','presentation');
 node.innerHTML='<section class="sx48-dialog'+(wide?' wide':'')+'" role="dialog" aria-modal="true" aria-label="'+E(title)+'">'+
 '<header class="sx48-dialog-head"><span class="sx48-head-icon '+color+'">'+I(icon,26)+'</span>'+
 '<div><h2>'+E(title)+'</h2><p>'+E(subtitle||'')+'</p></div>'+
 (refresh?'<button type="button" class="sx48-refresh" data-sx48-refresh aria-label="Refresh">'+I('refresh')+'</button>':'')+
 '<button type="button" class="sx48-close" data-sx48-close aria-label="Close">'+I('close')+'</button></header>'+
 '<div class="sx48-scroll">'+(search?'<label class="sx48-search">'+I('search',20)+'<input type="search" data-sx48-search placeholder="Search PNR, seat, city or name" aria-label="Search bookings"></label>':'')+
 '<div class="sx48-content">'+body+'</div></div></section>';
 document.body.appendChild(node);
 let closed=false;
 const close=()=>{if(closed)return;closed=true;document.removeEventListener('keydown',onKey);node.remove();if(last?.isConnected)last.focus()};
 function onKey(e){
  if(e.key==='Escape'){e.preventDefault();close();return}
  if(e.key!=='Tab')return;
  const tabbable=[...node.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href]')];
  if(!tabbable.length)return;
  const first=tabbable[0],last=tabbable[tabbable.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
 }
 document.addEventListener('keydown',onKey);
 node.addEventListener('click',event=>{
  if(event.target===node||event.target.closest('[data-sx48-close]')){close();return}
  const target=event.target.closest('[data-sx48-pnr]');
  if(target){close();if(typeof G.bookingModal==='function')G.bookingModal(target.dataset.sx48Pnr);return}
  if(event.target.closest('[data-sx48-refresh]')){if(refresh)refresh(node).catch(e=>G.toast(e.message||'GPS refresh failed','bad'));return}
 });
 node.addEventListener('input',event=>{
  if(!event.target.matches('[data-sx48-search]'))return;
  const q=event.target.value.trim().toLowerCase();
  for(const item of node.querySelectorAll('[data-sx48-filter]'))
   item.hidden=!item.textContent.toLowerCase().includes(q);
 });
 node.querySelector('[data-sx48-close]')?.focus();
 return{el:node,close,body:node.querySelector('.sx48-content')};
}
function summary(S,type){
 const spec=SECTIONS[type];if(!spec||!['stations','pickups','drops','bookedby','bookings'].includes(type))return;
 const ps=live(S),bs=currentBookings(S),rows=new Map();
 const add=(key,p,extras={})=>{
  if(!rows.has(key))rows.set(key,{label:key,passengers:[],...extras});
  rows.get(key).passengers.push(p);
 };
 if(type==='stations')for(const p of ps)add((p.from||S.detail?.origin||'—')+' – '+(p.to||S.detail?.destination||'—'),p);
 if(type==='bookedby')for(const p of ps)add(String(p.source||'Unknown').replace(/^redbus$/i,'redBus'),p);
 if(type==='pickups'||type==='drops'){
  const which=type==='pickups'?'boarding':'dropping';
  for(const p of ps){
   const stop=p[which];if(!stop)continue;
   const label=stop.name||'Unassigned';add(label,p,{time:stop.time,day:stop.day||1,order:((Number(stop.day||1)-1)*1440)+(parseInt(stop.time?.slice(0,2)||'0')*60)+parseInt(stop.time?.slice(3,5)||'0')});
  }
 }
 const [title,ico,color]=spec;
 if(type==='bookings'){
  const history=(S.history||[]).slice().sort((a,b)=>String(b.blocked_at||'').localeCompare(String(a.blocked_at||'')));
  const table='<div class="sx48-table-wrap"><table class="sx48-table sx48-booktable"><thead><tr>'+
   ['#','PNR','ROUTE','SEATS','FARE','BOOKED BY','SOURCE','BOOKED ON'].map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+
   history.map((b,i)=>{
    const pax=(b.passengers||[]).filter(p=>p.status!=='cancelled').map(p=>({seat:p.seat,pnr:b.pnr}));
    return '<tr data-sx48-filter><td class="muted">'+(i+1)+'</td>'+
     '<td><button class="sx48-booklink" data-sx48-pnr="'+E(b.pnr)+'">'+E(b.ticket_number||b.pnr)+'</button>'+
     (b.status==='hold'?'<span class="sx48-hold">HOLD</span>':'')+'</td>'+
     '<td>'+E(S.detail?.origin||'')+' → '+E(S.detail?.destination||'')+'</td>'+
     '<td>'+chips(pax)+'</td><td>₹'+Number(b.total_amount||0).toLocaleString('en-IN',{maximumFractionDigits:2})+'</td>'+
     '<td>'+E(b.source||'GDS')+'</td><td class="muted">'+E(b.source||'GDS')+'</td>'+
     '<td class="muted">'+E(datetime(b.blocked_at,true))+'</td></tr>';
   }).join('')+'</tbody></table></div>';
  return overlay(title,ico,color,ps.length+' seats in '+bs.length+' bookings',table,{wide:true,search:true});
 }
 const collection=[...rows.values()].sort((a,b)=>type==='pickups'||type==='drops'?a.order-b.order:a.label.localeCompare(b.label));
 const headers=type==='pickups'?['BOARDING POINT','TIME · DAY','SEATS','BOOKED SEATS']:
  type==='drops'?['DROP-OFF POINT','TIME · DAY','SEATS','BOOKED SEATS']:
  type==='stations'?['MULTI STATION','SEATS','BOOKED SEATS']:['BOOKED BY','SEATS','BOOKED SEATS'];
 const table='<div class="sx48-table-wrap"><table class="sx48-table"><thead><tr>'+
 headers.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+
 collection.map(r=>'<tr data-sx48-filter><td><b>'+E(r.label)+'</b></td>'+
 ((type==='pickups'||type==='drops')?'<td class="muted">'+E(hm(r.time))+' · Day '+E(r.day)+'</td>':'')+
 '<td class="sx48-count">'+r.passengers.length+'</td><td>'+chips(r.passengers)+'</td></tr>').join('')+
 '<tr class="sx48-table-total"><th>Total</th>'+
 ((type==='pickups'||type==='drops')?'<td></td>':'')+'<th>'+ps.length+'</th><td></td></tr>'+
 '</tbody></table></div>';
 return overlay(title,ico,color,ps.length+' seats in '+bs.length+' bookings',table,{wide:type==='pickups'||type==='drops'});
}
function timings(S){
 const stops=S.trip?.stops||[];
 const counts={pickup:0,drop:0,break:0};
 for(const s of stops)if(Object.hasOwn(counts,s.type))counts[s.type]++;
 const subtitle=S.detail?.vehicle?.registration_number||'Vehicle not assigned';
 const summary='<section class="sx48-trip-summary"><div class="sx48-trip-caption">'+I('delay',17)+' TRIP SUMMARY</div><div class="sx48-total-chips">'+
  '<span class="total">Total '+stops.length+'</span><span>Pickups '+counts.pickup+'</span>'+
  '<span>Drops '+counts.drop+'</span><span>Breaks '+counts.break+'</span></div></section>';
 const table='<div class="sx48-table-wrap"><table class="sx48-table sx48-time-table"><thead><tr>'+
  ['Type','Name','Link','Status','Sched:','Arr:','Dep:'].map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+
  stops.map(s=>{
   const kind=String(s.type||'Stop'),lat=Number(s.lat??s.latitude),lng=Number(s.lng??s.longitude);
   const valid=Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180&&
    s.lat!=null&&s.lng!=null;
   const href=valid?'https://www.openstreetmap.org/?mlat='+encodeURIComponent(lat)+'&mlon='+encodeURIComponent(lng)+'#map=16/'+lat+'/'+lng:null;
   return '<tr class="sx48-stop '+E(kind)+'"><td><span class="sx48-stopkind">'+I('pin',18)+E(kind[0].toUpperCase()+kind.slice(1))+'</span></td>'+
    '<td><strong>'+E(s.name)+'</strong></td>'+
    '<td>'+(href?'<a href="'+E(href)+'" target="_blank" rel="noopener noreferrer">'+I('pin',17)+' View Map</a>':'N/A')+'</td>'+
    '<td class="muted">'+E(s.event?.status||'N/A')+'</td>'+
    '<td><b>'+E(hm(s.time))+'</b><small>Day '+E(s.day||1)+'</small></td>'+
    '<td>'+E(s.event?.atime?datetime(s.event.atime):'N/A')+'</td>'+
    '<td>'+E(s.event?.dtime?datetime(s.event.dtime):'N/A')+'</td></tr>';
  }).join('')+'</tbody></table></div>';
 return overlay('Timings','timings','indigo',subtitle,summary+table,{wide:true});
}
function validGPS(pos){
 const lat=Number(pos?.lat??pos?.latitude),lng=Number(pos?.lng??pos?.longitude);
 return !!pos&&Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180&&
  (pos?.lat!=null||pos?.latitude!=null)&&(pos?.lng!=null||pos?.longitude!=null)?{lat,lng}:null;
}
function gpsContent(S){
 const pos=S.trip?.position,g=validGPS(pos);
 if(!g)return '<div class="sx48-no-data">No verified GPS coordinates are available for this service.</div>';
 const delta=.022;
 const src='https://www.openstreetmap.org/export/embed.html?bbox='+encodeURIComponent((g.lng-delta)+','+(g.lat-delta)+','+(g.lng+delta)+','+(g.lat+delta))+
  '&layer=mapnik&marker='+encodeURIComponent(g.lat+','+g.lng);
 const ext='https://www.openstreetmap.org/?mlat='+encodeURIComponent(g.lat)+'&mlon='+encodeURIComponent(g.lng)+'#map=16/'+g.lat+'/'+g.lng;
 const speed=pos.speed_kmh??pos.speed??null;
 const stopped=speed!=null&&Number.isFinite(Number(speed))&&Number(speed)<1;
 return '<div class="sx48-gps-status"><span>'+E(speed==null?'Speed not reported':stopped?'Stopped':'Moving')+'</span>'+
  '<span>Updated '+E(pos.updated_at?datetime(pos.updated_at,true):'time unavailable')+'</span></div>'+
  '<p class="sx48-gps-address">'+I('pin',20)+E(pos.address||('Coordinates '+g.lat.toFixed(5)+', '+g.lng.toFixed(5)))+'</p>'+
  '<div class="sx48-map"><iframe title="Vehicle position — OpenStreetMap" loading="lazy" referrerpolicy="no-referrer" src="'+E(src)+'"></iframe></div>'+
  '<p class="sx48-map-foot"><span>© OpenStreetMap contributors</span><a href="'+E(ext)+'" target="_blank" rel="noopener noreferrer">Open map</a>'+
  '<span>GPS point is the latest available backend observation; external map tiles require internet access.</span></p>';
}
function location(S){
 const refresh=async node=>{
  S.trip=await G.get('/trips/'+encodeURIComponent(S.detail.id));
  const body=node.querySelector('.sx48-content');
  if(body)body.innerHTML=gpsContent(S);
 };
 return overlay('Live location','location','indigo',S.detail?.vehicle?.registration_number||'Unassigned vehicle',
  gpsContent(S),{wide:true,refresh});
}
async function delay(S,after){
 if(!can('trips.update_passengers'))return G.toast('No permission to adjust trip timings','bad');
 const fields=[
  {name:'direction',label:'Adjust trip time',type:'select',options:[['Delay','Delay'],['Advance','Advance']]},
  {name:'hours',label:'Hours',type:'number',value:0},
  {name:'minutes',label:'Minutes',type:'number',value:15},
  {name:'reason',label:'Reason for change',required:true,full:true}
 ];
 const form=await G.prompt('Bus Delay / Early',fields,{ok:'Review adjustment'});
 if(!form)return;
 const h=Number(form.hours),m=Number(form.minutes);
 if(!Number.isInteger(h)||!Number.isInteger(m)||h<0||h>12||m<0||m>59||h*60+m<=0)
  return G.toast('Enter 1–720 minutes in hours/minutes fields','bad');
 const mins=(form.direction==='Advance'?-1:1)*(h*60+m);
 if(!(await G.confirm((mins<0?'Advance':'Delay')+' '+S.detail.service_number+' by '+Math.abs(mins)+
  ' minutes? Only unreached stops should change. No passenger message will be sent automatically.',{ok:'Apply timing change'})))return;
 const result=await G.post('/trips/'+encodeURIComponent(S.detail.id)+'/delay',{minutes:mins,reason:String(form.reason).trim(),notify:false});
 G.toast('Trip timing update recorded; '+(result?.adjusted_stops??0)+' unreached stops adjusted','ok');
 if(after)await after();
}
const notifyOptions=[
 ['ticket_confirmation','Ticket Confirmation','Resend booking confirmation'],
 ['bus_details','Bus Details','Tracker + bus + driver'],
 ['bus_delay','Bus Delay / Early','Reason + minutes + tracker'],
 ['bus_cancellation','Bus Cancellation','Inform pax; use Cancel for refund']
];
function notifyMenu(){
 return '<div class="sx48-notify-menu" role="menu" aria-label="Notify selected passengers">'+
 notifyOptions.map(([id,label,detail])=>'<button type="button" role="menuitem" data-v48-notify="'+E(id)+'"><strong>'+
  E(label)+'</strong><small>'+E(detail)+'</small></button>').join('')+'</div>';
}
async function notify(S,pnrs,template){
 if(!can('trips.chat'))return G.toast('No permission to notify passengers','bad');
 const ids=[...new Set((pnrs||[]).filter(Boolean))];
 if(!ids.length)return G.toast('Select passengers before choosing a notification type','warn');
 let text='',sendTemplate=template;
 if(template==='bus_delay'){
  const input=await G.prompt('Bus Delay / Early',[
    {name:'direction',label:'Type',type:'select',options:[['Delayed','Delayed'],['Early','Early']]},
    {name:'minutes',label:'Minutes',type:'number',required:true,value:15},
    {name:'reason',label:'Reason',required:true,full:true}
   ],{ok:'Review message'});
  if(!input)return;
  const minutes=Number(input.minutes);
  if(!Number.isInteger(minutes)||minutes<1||minutes>720||!String(input.reason||'').trim())
   return G.toast('Valid minutes and reason are required','bad');
  text='Your bus '+S.detail.service_number+' is '+String(input.direction).toLowerCase()+' by '+minutes+
   ' minutes. Reason: '+String(input.reason).trim()+'. Please check your latest boarding instructions.';
  sendTemplate='custom';
 }else if(template==='bus_cancellation'){
  const input=await G.prompt('Bus Cancellation Notice',[
   {name:'message',label:'Cancellation message',required:true,full:true,
    value:'Your bus '+S.detail.service_number+' has been cancelled. Please contact the operator for cancellation and refund details.'}
  ],{ok:'Review notice'});
  if(!input)return;
  text=String(input.message||'').trim();
  if(!text)return G.toast('Cancellation notice text required','bad');
  sendTemplate='bus_cancellation';
 }else if(!['ticket_confirmation','bus_details'].includes(template))return G.toast('Unsupported notification','bad');
 if(!(await G.confirm('Record '+template.replace(/_/g,' ')+' for '+ids.length+
  ' selected PNR(s)? This does not verify SMS/WhatsApp delivery'+
  (template==='bus_cancellation'?' and does not cancel tickets or initiate refunds.':'') ,{ok:'Record notification'})))return;
 const reply=await G.post('/trips/'+encodeURIComponent(S.detail.id)+'/notify',
  {template:sendTemplate,pnrs:ids,text});
 G.toast((reply.recorded||0)+' message record(s) saved; external delivery remains unverified','ok');
 return reply;
}
function historyPanel(S,V){
 const meta=S.v48||{events:[],counts:{}},stats=meta.counts||{},filter=V.historyFilter||'all';
 const options=[['all','All',stats.all],['seat_blocks','Seat blocks',stats.seat_blocks],
  ['bookings','Bookings',stats.bookings],['released','Released',stats.released],
  ['confirmed','Confirmed',stats.confirmed],['expired','Expired',stats.expired],
  ['blocked','Blocked (active)',stats.blocked_active]];
 const events=(meta.events||[]).filter(e=>{
  if(filter==='all')return true;
  if(filter==='seat_blocks')return e.kind==='blocked';
  if(filter==='bookings')return !!e.pnr;
  if(filter==='blocked')return e.status==='blocked';
  return e.status===filter;
 });
 const statusCls=s=>['released','confirmed','expired','blocked'].includes(s)?s:'recorded';
 return '<section class="sx48-history"><p class="sx48-history-intro">'+
  E(S.detail?.travel_date||'')+' · seat blocks and bookings · oldest first · schedule on/off is in the Schedule History tab · times in IST</p>'+
 '<div class="sx48-history-filters">'+options.map(([id,label,count])=>
  '<button type="button" data-v48-history-filter="'+E(id)+'" class="'+(filter===id?'active ':'')+E(id)+'">'+
  E(label)+' '+Number(count||0)+'</button>').join('')+'</div>'+
 '<p class="sx48-history-provenance">Only timestamped booking and seat-block records are shown. Missing historical transitions are not inferred.</p>'+
 '<div class="sx48-timeline">'+events.map(e=>{
  const people=(e.passengers||[]).map(p=>E(p.name)+', '+E(p.gender||'—')+', '+E(p.age??'—')+
   ' yrs, seat '+E(p.seat)).join(' · ');
  return '<article class="sx48-event '+statusCls(e.status)+'" data-sx48-event-id="'+E(e.id)+'">'+
   '<span class="sx48-event-dot"></span><div class="sx48-event-card"><header>'+
   '<div><strong>'+E(e.source||'GDS')+
    (e.pnr?': PNR '+E(e.pnr):' · Seat block')+'</strong>'+
    (e.ticket?' <span class="muted">(ticket '+E(e.ticket)+')</span>':'')+'</div>'+
    '<span class="sx48-event-status '+statusCls(e.status)+'">'+E(e.status||'Recorded')+'</span></header>'+
   (people?'<p>'+people+'</p>':'')+
   (e.seats?.length?'<p>Seats '+E(e.seats.join(', '))+'</p>':'')+
   '<p class="sx48-event-msg">'+E(e.message||'Event recorded')+
    ' at '+E(datetime(e.at))+(e.reason?' · '+E(e.reason):'')+'</p>'+
   (e.pnr?'<button type="button" data-v38="open-ticket" data-pnr="'+E(e.pnr)+'" data-seat="'+E(e.passengers?.[0]?.seat||'')+'">View ticket</button>':'')+
   '</div></article>';
 }).join('')+'<div class="sx48-history-empty" '+(events.length?'hidden':'')+'>No recorded events match this filter.</div></div></section>';
}
function seatDiagram(S){
 const original=S.map?.decks;
 if(!original?.length)return '<div class="sx48-no-data">Seat inventory unavailable for this segment.</div>';
 const layout={decks:original};
 const decks=(root.Coach21V46&&original.length===2&&original.some(d=>(d.seats||[]).some(s=>/^\d+L$/.test(s.code)))?
  root.Coach21V46.physicalGeometry(layout):original);
 const badges=S.v48?.seat_reservation_counts||{};
 const booked=s=>s.status==='booked_female'?'female':s.status==='booked_male'?'male':
  s.status==='hold'?'hold':s.status==='blocked'?'blocked':
  s.status==='no_show'?'no-show':s.booking?
  String(s.booking.gender||'').toUpperCase().startsWith('F')?'female':'male':
  'available';
 const deckhtml=decks.map(d=>{
  const lower=String(d.deck).toUpperCase()==='LOWER';
  const grid=Number(d.cols)||4,rows=Number(d.rows)||12;
  return '<section class="sx48-deck '+(lower?'lower':'upper')+'" aria-label="'+E(d.deck)+' deck">'+
   '<header><b>'+E(d.deck)+'</b>'+(lower?'<span class="sx48-wheel">'+
   '<svg viewBox="0 0 44 44" width="43" height="43" aria-hidden="true"><circle cx="22" cy="22" r="19" fill="#032f79" stroke="#fff" stroke-width="2"/>'+
   '<circle cx="22" cy="22" r="16" fill="none" stroke="#6db6ff" stroke-width="3"/><circle cx="22" cy="22" r="5" fill="#dbf2ff"/>'+
   '<path d="m22 17-4-11M18 25 7 32M26 25 37 32" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg></span>':'')+'</header>'+
   '<div class="sx48-seatgrid" style="--sx48-cols:'+grid+';grid-template-columns:repeat('+grid+',minmax(0,1fr));grid-template-rows:repeat('+rows+',34px)">'+
   (d.seats||[]).map(s=>{
    const berth=s.type==='sleeper'||Number(s.h)>1;
    const state=S.selectedSeats?.has(s.code)?'selected':booked(s);
    const count=Math.max(0,Math.floor(Number(badges[s.code]||0)));
    const price=Number(s.fare);
    return '<button type="button" data-sx-seat="'+E(s.code)+'" class="sx48-seat '+(berth?'berth':'chair')+' '+state+
     '" style="grid-column:'+(Number(s.col)+1)+'/span '+(Number(s.w)||1)+
     ';grid-row:'+(Number(s.row)+1)+'/span '+(Number(s.h)||1)+'" '+
     'title="'+E('Seat '+s.code+' · '+state+(Number.isFinite(price)?' · ₹'+price:''))+'" aria-label="'+
      E('Seat '+s.code+' · '+state)+'">'+
      '<span class="sx48-price">'+(Number.isFinite(price)?Math.round(price):'—')+'</span>'+
      '<strong>'+E(s.code)+'</strong>'+
      (count?'<span class="sx48-quantity '+(berth?'bottom':'')+'">×'+count+'</span>':'')+
    '</button>';
   }).join('')+'</div>'+
   (lower?'<div class="sx48-exit" aria-label="Emergency exit">'+I('drops',24)+'</div><div class="sx48-door"></div>':'')+
   '</section>';
 }).join('');
 return '<div class="sx48-deck-holder">'+deckhtml+'</div>';
}
root.ScheduleManageV48={summary,timings,location,delay,notify,notifyMenu,historyPanel,seatDiagram,
 live,currentBookings,datetime,hm,validGPS,overlay,E,I};
})(window);
