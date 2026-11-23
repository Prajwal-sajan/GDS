/* JourneyOS GDS v38 — Schedule Bookings / Pickup Chart selection and ticket tab.
   Uses the current trip, seat layout and authorized booking APIs; no screenshot sample data. */
(function(){
'use strict';
const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shapes={
 ticket:'<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 6v3m0 6v3M16 6v3m0 6v3"/>',
 pin:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2"/>',
 history:'<path d="M3 12a9 9 0 1 0 3-6.7M3 3v5h5m4-1v5l3 2"/>',
 check:'<path d="m5 12 5 5L19 7"/>',close:'<path d="M18 6 6 18M6 6l12 12"/>',
 bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 12a2 2 0 0 0 4 0"/>',
 print:'<path d="M6 9V3h12v6M6 18H3V9h18v9h-3M6 15h12v7H6z"/>',
 upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v4h16v-4"/>',
 trash:'<path d="M4 7h16m-12 0-1 14h10L16 7m-6 4v6m4-6v6M9 7V4h6v3"/>',
 people:'<circle cx="9" cy="8" r="4"/><path d="M2 21v-3a6 6 0 0 1 12 0v3m4-9a4 4 0 0 0 0-8m1 17v-3a6 6 0 0 0-3-5"/>',
 phone:'<path d="M22 17v3a2 2 0 0 1-2.2 2A20 20 0 0 1 2 4.2 2 2 0 0 1 4 2h3l2 5-3 2a16 16 0 0 0 9 9l2-3 5 2Z"/>',
 search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
 chevron:'<path d="m6 9 6 6 6-6"/>',
 arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
 chat:'<path d="M4 4h16v12H8l-4 4V4Z"/>',
 edit:'<path d="m15 4 5 5M4 20l5-1L20 8a3 3 0 0 0-4-4L5 15z"/>',
 calendar:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M7 2v4m10-4v4M3 10h18"/>',
 refresh:'<path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7"/>'
};
function icon(name,size=19){return '<svg class="sx38-svg" viewBox="0 0 24 24" width="'+size+'" height="'+size+'" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(shapes[name]||shapes.ticket)+'</svg>';}
function btn(label,ico,action,cl='',disabled=false,attrs=''){
 return '<button type="button" class="sx38-btn '+cl+'" data-v38="'+action+'" '+attrs+(disabled?' disabled':'')+'>'+icon(ico,18)+' <span>'+escape(label)+'</span></button>';
}
const key=p=>String(p.pnr)+'\u001f'+String(p.seat);
const people=S=>(S.trip?.passengers||[]).filter(p=>p.status!=='cancelled'&&p.status!=='released'&&p.status!=='expired');
function state(S){
 if(!S.v38)S.v38={panel:'chart',mode:'view',group:'Pickup',selected:new Set(),
  pnr:null,seat:null,ticket:null,ticketPnr:null,edit:null,stops:null,commentOpen:false,
  stopOpen:null,search:'',shift:{date:'',service:'',services:[],seats:[],assignment:{},chosen:null},notifyOpen:false};
 return S.v38;
}
function time(s){if(!s)return '—';try{return /^\d\d:\d\d$/.test(s)?(Number(s.slice(0,2))%12||12)+':'+s.slice(3)+' '+(Number(s.slice(0,2))>=12?'PM':'AM'):String(s)}catch(_){return String(s)}}
function formatDate(s){try{const d=new Date(String(s).slice(0,10)+'T12:00:00');return Number.isFinite(+d)?d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):String(s||'—')}catch(_){return String(s||'—')}}
function groupLabel(p,group){
 switch(group){
  case 'Drop':return p.dropping?.name||'Drop not assigned';
  case 'City':return p.from||'City unavailable';
  case 'Source':return p.source||'Unknown';
  case 'Booked On':return p.booked_at?String(p.booked_at).slice(0,10):'Booking date unavailable';
  case 'Fare':return '₹'+Number(p.fare||0).toLocaleString('en-IN');
  case 'Trips':return String(p.trips??0)+' Trips';
  default:return p.boarding?.name||'Pickup not assigned';
 }
}
function chart(S,V){
 const passengers=people(S),total=passengers.length,selected=V.selected.size;
 const seats=(S.map?.decks||[]).flatMap(d=>d.seats||[]);
 const booked=seats.filter(p=>p.booking||['booked','hold','booked_female','booked_male'].includes(p.status)).length;
 const available=seats.filter(p=>p.status==='available').length;
 const blocked=seats.filter(p=>p.status==='blocked').length;
 const groups=new Map();
 for(const p of passengers){const label=groupLabel(p,V.group);if(!groups.has(label))groups.set(label,[]);groups.get(label).push(p)}
 const groupItems=[...groups.entries()].sort((a,b)=>{
  if(V.group==='Pickup'||V.group==='Drop'){
   const tm=p=>p[V.group==='Pickup'?'boarding':'dropping']?.time||'';
   return tm(a[1][0]).localeCompare(tm(b[1][0]));
  }
  return a[0].localeCompare(b[0]);
 });
 const countHtml='<div class="sx38-stats">'+
  '<span class="available"><i></i> Available <b>'+available+'</b></span>'+
  '<span class="booked"><i></i> Booked <b>'+booked+'</b></span>'+
  '<span class="blocked"><i></i> Blocked <b>'+blocked+'</b></span></div>';
 const actions='<div class="sx38-toolbar">'+
  btn('Print Pickup Chart','print','print','primary')+
  btn('Import Pickup Chart','upload','import')+
  '<span class="sx38-toolbar-divider"></span>'+
  btn('Cancel ('+selected+')','trash','cancel-selected','danger',!selected||!can('bookings.cancel'))+
  btn('Notify ('+selected+')','bell','notify-selected','',!selected||!can('trips.chat'))+
  btn('History','history','chart-history','')+'</div>';
 const controls='<div class="sx38-groupcontrols"><span>Group by:</span>'+
  ['Pickup','Drop','City','Source','Booked On','Fare','Trips'].map(g=>
   '<button type="button" data-v38="group" data-group="'+escape(g)+'" class="'+(V.group===g?'active':'')+'" aria-pressed="'+String(V.group===g)+'">'+escape(g)+(g==='Pickup'?' ↑':'')+'</button>').join('')+'</div>'+
  '<div class="sx38-selection"><label><input type="checkbox" data-v38-all '+(total>0&&selected===total?'checked':'')+'/> '+
  selected+' of '+total+' passengers selected</label>'+
  '<button type="button" data-v38="select-all">Select All</button>'+
  '<button type="button" data-v38="clear">Clear</button>'+
  '<input data-v38-search type="search" placeholder="Search passenger / PNR / seat" value="'+escape(V.search)+'" aria-label="Search pickup chart"/></div>';
 const rows=groupItems.map(([label,ps],i)=>{
  const matches=ps.filter(p=>!V.search||[p.name,p.pnr,p.ticket,p.seat,p.phone].join(' ').toLowerCase().includes(V.search.toLowerCase()));
  if(!matches.length)return '';
  const allChecked=matches.every(p=>V.selected.has(key(p)));
  const first=matches[0];
  const timeText=(V.group==='Drop'?first.dropping?.time:first.boarding?.time)||'';
  const day=(V.group==='Drop'?first.dropping?.day:first.boarding?.day)||1;
  return '<section class="sx38-pick-group"><header class="sx38-pick-head">'+
    '<input type="checkbox" aria-label="Select all at '+escape(label)+'" data-v38-groupcheck="'+escape(label)+'" '+(allChecked?'checked':'')+'/>'+
    '<span class="sx38-pin">'+icon('pin',22)+'</span>'+
    '<b title="'+escape(label)+'">'+escape(label)+'</b>'+
    (timeText?'<span class="sx38-time">Day '+escape(day)+' - '+escape(time(timeText))+'</span>':'')+
    '<span class="sx38-seat-count">'+matches.length+' seat(s)</span></header>'+
    matches.map(p=>{
     const chosen=V.selected.has(key(p)),fare=p.fare!=null?'₹'+Number(p.fare).toLocaleString('en-IN'):'—';
     return '<div class="sx38-pick-person" data-v38-person="'+escape(p.pnr)+'">'+
      '<input type="checkbox" aria-label="Select passenger '+escape(p.name)+' seat '+escape(p.seat)+'" data-v38-seat-select="'+escape(p.seat)+'" data-v38-pnr-select="'+escape(p.pnr)+'" '+(chosen?'checked':'')+'/>'+
      '<span class="sx38-seat-pill">'+escape(p.seat)+'</span>'+
      '<div class="sx38-person-data"><button type="button" class="sx38-pnr-link" data-v38="open-ticket" data-pnr="'+escape(p.pnr)+'" data-seat="'+escape(p.seat)+'">'+escape(p.name||'Passenger')+'</button>'+
      '<div class="sx38-person-metas"><span class="sx38-phone">'+icon('phone',14)+' '+escape(p.phone||'—')+'</span>'+
      '<button type="button" class="sx38-pnr-number" data-v38="open-ticket" data-pnr="'+escape(p.pnr)+'" data-seat="'+escape(p.seat)+'">'+escape(p.ticket||p.pnr)+'</button>'+
      '<strong>'+escape(fare)+'</strong><span class="sx38-trip-pill">Trips '+escape(p.trips??0)+'</span></div>'+
      '<div class="sx38-person-sub">→ '+escape(p.dropping?.name||'Drop not assigned')+
      (p.dropping?.time?' (Day '+escape(p.dropping.day||1)+' - '+escape(time(p.dropping.time))+')':'')+
      '<span class="sx38-source">'+escape(p.source||'GDS')+'</span></div></div>'+
      '<span class="sx38-gender '+(String(p.gender).toUpperCase().startsWith('F')?'female':'male')+'">'+escape(String(p.gender||'').toUpperCase().startsWith('F')?'F':'M')+'</span></div>';
    }).join('')+'</section>';
 }).filter(Boolean).join('');
 return countHtml+actions+controls+'<div class="sx38-pick-scroll">'+(rows||'<div class="sx38-no-data">No passengers match these filters.</div>')+'</div>';
}
function tabs(V){
 return '<nav class="sx38-right-tabs" aria-label="Bookings right panel">'+
  '<button type="button" data-v38="chart" class="'+(V.panel==='chart'?'active':'')+'">'+icon('pin')+' Pickup Chart</button>'+
  '<button type="button" data-v38="chart-history" class="'+(V.panel==='history'?'active':'')+'">'+icon('history')+' History</button>'+
  (V.pnr?'<button type="button" data-v38="ticket" class="'+(V.panel==='ticket'?'active':'')+'">'+icon('ticket')+
   ' Seat '+escape(V.seat||'—')+' — '+escape(V.pnr)+'</button>':'')+
  '</nav>';
}
function historyChart(S){
 const records=S.history||[];
 return '<div class="sx38-history-list"><h3>Booking History</h3><p>'+records.length+' booking records</p>'+
  records.slice(0,150).map(x=>'<button type="button" class="sx38-history-item" data-v38="open-ticket" data-pnr="'+escape(x.pnr)+'" data-seat="'+escape(x.passengers?.[0]?.seat||'')+'"><b>PNR '+escape(x.ticket_number||x.pnr)+'</b><span>'+escape(x.contact_name||'Passenger')+
   ' · '+escape(x.status||'')+'</span><span>'+escape(x.source||'')+'</span></button>').join('')+
  (records.length?'':'<p>No booking records on this service.</p>')+'</div>';
}
async function mount(S,ctx){
 if(!S.ov||S.tab!=='bookings')return;
 const V=state(S),right=S.ov.querySelector('.sx-book-right');
 if(!right)return;
 if(V.panel==='ticket'&&V.pnr&&V.ticketPnr!==V.pnr){
  try{V.ticket=await G.get('/bookings/'+encodeURIComponent(V.pnr));V.ticketPnr=V.pnr}
  catch(e){V.ticket=null;V.ticketPnr=V.pnr;V.loadError=e.message}
 }
 right.classList.add('sx38-right');S.ov.classList.add('sx38-workspace');
 let content=V.panel==='chart'?chart(S,V):V.panel==='history'?historyChart(S):
  (window.BookingTicketV38?BookingTicketV38.render(S,V,{icon,escape,time,formatDate,btn}):'<div class="sx38-no-data">Ticket workspace is unavailable</div>');
 right.innerHTML=tabs(V)+'<div class="sx38-panel-body">'+content+'</div>';
 if(!V.bound){
  V.bound=true;
  S.ov.addEventListener('click',event=>{
   if(S.tab!=='bookings')return;
   const bookedSeat=event.target.closest('[data-sx-seat]');
   if(bookedSeat){
    const seat=(S.map?.decks||[]).flatMap(d=>d.seats||[]).find(x=>String(x.code)===bookedSeat.dataset.sxSeat);
    if(seat?.booking?.pnr){
     event.preventDefault();event.stopPropagation();
     act('open-ticket',{dataset:{pnr:seat.booking.pnr,seat:seat.code}},S,V,ctx).catch(G.err);
     return;
    }
   }
   const legacyNotify=event.target.closest('[data-sx-notify-pop]');
   if(legacyNotify){event.preventDefault();event.stopPropagation();act('notify-selected',legacyNotify,S,V,ctx).catch(G.err);return;}
   const node=event.target.closest('[data-v38]');
   if(!node||!S.ov?.contains(node))return;
   event.preventDefault();event.stopPropagation();
   act(node.dataset.v38,node,S,V,ctx).catch(G.err);
  },true);
  S.ov.addEventListener('change',event=>{
   if(S.tab!=='bookings')return;
   const el=event.target;
   if(el.hasAttribute('data-v38-seat-select')||el.hasAttribute('data-v38-groupcheck')||el.hasAttribute('data-v38-all')){
    event.stopPropagation();
    const list=people(S),on=el.checked;
    let chosen=el.hasAttribute('data-v38-all')?list:
     el.hasAttribute('data-v38-groupcheck')?list.filter(p=>groupLabel(p,V.group)===el.dataset.v38Groupcheck):
     list.filter(p=>p.pnr===el.dataset.v38PnrSelect&&String(p.seat)===String(el.dataset.v38SeatSelect));
    for(const p of chosen)on?V.selected.add(key(p)):V.selected.delete(key(p));
    ctx.redraw().catch(G.err);return;
   }
   if(window.BookingTicketV38?.change(event,S,V,ctx)){
    event.stopPropagation();
   }
  },true);
  S.ov.addEventListener('input',event=>{
   if(S.tab!=='bookings')return;
   if(event.target.hasAttribute('data-v38-search')){
    V.search=event.target.value;
    const list=S.ov.querySelector('.sx38-pick-scroll');
    if(list){const staged=document.createElement('div');staged.innerHTML=chart(S,V);const next=staged.querySelector('.sx38-pick-scroll');if(next)list.innerHTML=next.innerHTML;} 
    // Search affects row display only; selection persists.
    event.stopPropagation();return;
   }
   if(window.BookingTicketV38?.input(event,S,V,ctx))event.stopPropagation();
  },true);
 }
}
async function act(action,node,S,V,ctx){
 switch(action){
  case 'chart':V.panel='chart';V.mode='view';return ctx.redraw();
  case 'chart-history':V.panel='history';return ctx.redraw();
  case 'ticket':V.panel='ticket';return ctx.redraw();
  case 'open-ticket':
   if(!can('bookings.view_all'))return G.toast('Booking details permission is required','bad');
   V.pnr=node.dataset.pnr;V.seat=node.dataset.seat||'';
   V.panel='ticket';V.mode='view';V.commentOpen=false;
   V.ticketPnr=null;V.ticket=null;V.edit=null;V.stopOpen=null;return ctx.redraw();
  case 'group':V.group=node.dataset.group;return ctx.redraw();
  case 'select-all':people(S).forEach(p=>V.selected.add(key(p)));return ctx.redraw();
  case 'clear':V.selected.clear();return ctx.redraw();
  case 'print':return window.PickupChartV40?PickupChartV40.openPrint(S,V,ctx):G.toast('Pickup Chart PDF module is not loaded','bad');
  case 'import':return window.PickupChartV40?PickupChartV40.openImport(S,V,ctx):G.toast('Pickup Chart importer is not loaded','bad');
  case 'notify-selected':
   if(!V.selected.size||!can('trips.chat'))return;
   return notify(S,[...new Set(people(S).filter(p=>V.selected.has(key(p))).map(p=>p.pnr))]);
  case 'cancel-selected':
   if(!V.selected.size||!can('bookings.cancel'))return;
   return bulkCancel(S,V,ctx);
 }
 if(window.BookingTicketV38)return BookingTicketV38.click(action,node,S,V,{...ctx,icon,escape,time,formatDate,btn,notify});
}
async function notify(S,pnrs){
 if(!pnrs.length)return;
 const val=await G.prompt('Notify selected passengers',
  [{name:'template',label:'Notification type',type:'select',options:[['ticket_confirmation','Ticket Confirmation'],['bus_details','Bus Details'],['custom','Custom message']]},
   {name:'text',label:'Custom message (required for custom)',full:true}],
  {ok:'Record notifications'});
 if(!val)return;
 if(val.template==='custom'&&!String(val.text||'').trim())return G.toast('Enter a custom message','bad');
 if(!(await G.confirm('Record '+val.template.replace(/_/g,' ')+' for '+pnrs.length+' PNR(s)? This system does not confirm provider delivery.',{ok:'Record'})))return;
 const result=await G.post('/trips/'+encodeURIComponent(S.detail.id)+'/notify',{template:val.template,pnrs,text:val.text||''});
 G.toast((result.recorded??0)+' notification record(s) saved; provider delivery unverified','ok');
}
async function bulkCancel(S,V,ctx){
 const passengers=people(S).filter(p=>V.selected.has(key(p)));
 const grouped=new Map();
 for(const p of passengers){if(!grouped.has(p.pnr))grouped.set(p.pnr,[]);grouped.get(p.pnr).push(p.seat)}
 const fields=[
  {name:'by',label:'Cancellation initiated by',type:'select',options:[['passenger','Passenger (policy refund)'],['operator','Operator (override as permitted)']]},
  {name:'reason',label:'Cancellation reason',full:true},
  {name:'notify',label:'Notify passenger',type:'checkbox',value:true}
 ];
 const v=await G.prompt('Cancel '+passengers.length+' selected passenger seat(s)',fields,{ok:'Review cancellation'});
 if(!v)return;
 const summary=[...grouped.entries()].map(([pnr,seats])=>'PNR '+pnr+' · seats '+seats.join(', ')).join('\n');
 if(!(await G.confirm('Cancellation cannot be undone. Review:\n'+summary+'\nRefunds will follow the applicable policy unless authorized overrides are configured.',{ok:'Cancel selected tickets',danger:true})))return;
 let done=0;const failed=[];
 for(const [pnr,seats] of grouped){
  try{await G.post('/bookings/'+encodeURIComponent(pnr)+'/cancel',{seats,by:v.by,reason:v.reason||'Operator cancellation',notify:!!v.notify});done++}
  catch(e){failed.push(pnr+': '+(e.message||'failed'))}
 }
 V.selected.clear();
 await ctx.hydrate();await ctx.redraw();
 G.toast(done+' PNR cancellation(s) applied'+(failed.length?'; '+failed.length+' failed: '+failed.join('; '):''),failed.length?'warn':'ok');
}
window.ScheduleBookingsV38={mount,state,chart,key,people,icon,escape,time,formatDate};
})();