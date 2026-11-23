/* JourneyOS v36 — screenshot-specific service search, bus halts and calendar.
 * Schedules/routes remain the single data source; no invented percentages or GPS. */
(function(){
'use strict';
if(!window.G||window.ScheduleInsightsV36)return;
const E=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const path={
 search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
 pin:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2"/>',
 send:'<path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/>',
 calendar:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4m8-4v4M3 10h18"/>',
 chevron:'<path d="m6 9 6 6 6-6"/>',
 left:'<path d="m15 18-6-6 6-6"/>',
 right:'<path d="m9 18 6-6-6-6"/>',
 close:'<path d="M18 6 6 18M6 6l12 12"/>',
 swap:'<path d="M4 8h16m-4-4 4 4-4 4M20 16H4m4-4-4 4 4 4"/>',
 bus:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 12h18M7 20v2m10-2v2M7 16h.01M17 16h.01"/>',
 check:'<path d="m5 12 5 5L20 7"/>'
};
const svg=(key,size=21)=>'<svg viewBox="0 0 24 24" width="'+size+'" height="'+size+
 '" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path[key]+'</svg>';
const iso=d=>String(d.getFullYear())+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const dateToObj=str=>{const v=String(str||'');if(!/^\d{4}-\d\d-\d\d$/.test(v))return null;
 const d=new Date(Number(v.slice(0,4)),Number(v.slice(5,7))-1,Number(v.slice(8,10)),12);
 return Number.isFinite(d.getTime())&&iso(d)===v?d:null;};
const addDay=(date,n)=>{const d=dateToObj(date);if(!d)return '';d.setDate(d.getDate()+n);return iso(d)};
const today=()=>{const d=new Date(),parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',
  year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
 const p=k=>parts.find(x=>x.type===k)?.value;return p('year')+'-'+p('month')+'-'+p('day');};
const niceDate=str=>{const d=dateToObj(str);return d?d.toLocaleDateString('en-IN',
 {weekday:'short',month:'short',day:'numeric',year:'numeric'}):str};
const monthNice=str=>{const d=new Date(Number(str.slice(0,4)),Number(str.slice(5,7))-1,1,12);
 return d.toLocaleDateString('en-IN',{month:'long',year:'numeric'});};
const pad=x=>String(x).padStart(2,'0');
const nextMonth=(v,step)=>{const d=new Date(Number(v.slice(0,4)),Number(v.slice(5,7))-1+step,1,12);return iso(d).slice(0,7);};
function closeButton(modal){
 const btn=modal.$('[data-x]');if(!btn)return;
 btn.innerHTML=svg('close',26);btn.title='Close';btn.setAttribute('aria-label','Close');
}
function dialog(opts,className){
 const m=G.modal(opts);m.el.classList.add('si36-overlay',className);closeButton(m);
 const md=m.$('.md');md?.setAttribute('role','dialog');md?.setAttribute('aria-modal','true');
 const key=e=>{if(!m.el.isConnected){document.removeEventListener('keydown',key);return}
  if(e.key==='Escape'){document.removeEventListener('keydown',key);m.close();}};
 document.addEventListener('keydown',key);
 m.$('[data-x]')?.focus();
 return m;
}
function dropdown(id,current,cities,choice){
 const choices=[{id:'',name:'All'},...cities];
 const chosen=choices.find(c=>String(c.id)===String(current))||choices[0];
 return '<button type="button" data-si36-toggle="'+id+'" class="si36-select '+id+'" aria-haspopup="listbox" aria-expanded="false">'+
 '<span data-si36-selected="'+id+'">'+E(chosen.name)+'</span>'+svg('chevron',18)+'</button>'+
 '<div class="si36-options" role="listbox" aria-label="'+(id==='origin'?'Origin':'Destination')+'" data-si36-options="'+id+'" hidden>'+
 '<label class="si36-option-search">'+svg('search',17)+'<input type="search" data-si36-find="'+id+'" placeholder="Search city" aria-label="Search '+id+' cities"></label>'+
 '<div class="si36-option-items">'+choices.map(c=>
  '<button type="button" role="option" data-si36-option="'+id+'" data-value="'+E(c.id)+'" data-name="'+E(c.name)+'" aria-selected="'+String(String(c.id)===String(current))+'">'+
   '<span>'+E(c.name)+'</span>'+svg('check',17)+'</button>').join('')+'</div></div>';
}
const cityList=async()=>{const result=await G.get('/cities');return (result.cities||[]).map(c=>({id:c.id,name:c.name})).filter(c=>c.name&&c.id!=null).sort((a,b)=>a.name.localeCompare(b.name));};
async function openSearch({date,onSearch,onClear}={}){
 let cities=[];try{cities=await cityList()}catch(e){G.err(e);return}
 const state={origin:'',destination:'',date:dateToObj(date)?date:today()};
 const title='<span class="si36-dialog-title">'+svg('search',24)+' Search services</span>';
 const options='<div class="si36-search-content">'+
 '<div class="si36-pair"><div class="si36-end origin"><label><span class="si36-dot"></span>'+svg('send',18)+' Origin</label>'+
 dropdown('origin','',cities)+'</div>'+
 '<button type="button" class="si36-swap" data-si36-swap aria-label="Swap origin and destination" title="Swap origin and destination">'+svg('swap',22)+'</button>'+
 '<div class="si36-end destination"><label><span class="si36-dot"></span>'+svg('pin',18)+' Destination</label>'+
 dropdown('destination','',cities)+'</div></div>'+
 '<div class="si36-date-label">'+svg('calendar',19)+' Date</div>'+
 '<div class="si36-date-line"><label class="si36-date-entry">'+
 '<span class="si36-date-day"><small data-si36-month></small><strong data-si36-number></strong></span>'+
 '<span class="si36-date-info"><strong data-si36-long></strong><small data-si36-relative></small></span>'+
 '<span class="si36-chevron">'+svg('chevron',18)+'</span>'+
 '<input type="date" data-si36-picker aria-label="Search service date"></label>'+
 '<button type="button" class="si36-quick active" data-si36-quick="0">Today</button>'+
 '<button type="button" class="si36-quick" data-si36-quick="1">Tomorrow</button></div>'+
 '<footer class="si36-search-actions"><button type="button" data-si36-all>Show all services</button>'+
 '<button type="button" data-si36-submit>Search</button></footer></div>';
 const m=dialog({title,body:options,size:'lg'},'si36-search-modal');
 function datePaint(){const d=dateToObj(state.date);if(!d)return;
  m.$('[data-si36-month]').textContent=d.toLocaleDateString('en-IN',{month:'short'}).toUpperCase();
  m.$('[data-si36-number]').textContent=String(d.getDate());
  m.$('[data-si36-long]').textContent=niceDate(state.date);
  const rel=state.date===today()?'Today':state.date===addDay(today(),1)?'Tomorrow':'Selected date';
  m.$('[data-si36-relative]').textContent=rel;
  m.$('[data-si36-picker]').value=state.date;
  m.$$('[data-si36-quick]').forEach(btn=>btn.classList.toggle('active',
    btn.dataset.si36Quick===(rel==='Today'?'0':rel==='Tomorrow'?'1':'-1')));
 }
 function closeOptions(except){m.$$('[data-si36-options]').forEach(pop=>{
  if(pop.dataset.si36Options!==except)pop.hidden=true;
  const btn=m.$('[data-si36-toggle="'+pop.dataset.si36Options+'"]');
  if(btn)btn.setAttribute('aria-expanded',String(!pop.hidden));
 });}
 datePaint();
 m.el.addEventListener('click',e=>{
  const toggle=e.target.closest('[data-si36-toggle]');
  if(toggle){const key=toggle.dataset.si36Toggle,pop=m.$('[data-si36-options="'+key+'"]'),open=pop.hidden;closeOptions();pop.hidden=!open;toggle.setAttribute('aria-expanded',String(open));if(open)pop.querySelector('input')?.focus();return}
  const option=e.target.closest('[data-si36-option]');
  if(option){const k=option.dataset.si36Option;state[k]=option.dataset.value;
   m.$('[data-si36-selected="'+k+'"]').textContent=option.dataset.name;
   m.$$('[data-si36-option="'+k+'"]').forEach(x=>x.setAttribute('aria-selected',String(x===option)));
   closeOptions();return}
  if(e.target.closest('[data-si36-swap]')){
   [state.origin,state.destination]=[state.destination,state.origin];
   for(const id of ['origin','destination']){
    const match=[{id:'',name:'All'},...cities].find(c=>String(c.id)===String(state[id]));
    m.$('[data-si36-selected="'+id+'"]').textContent=match?.name||'All';
    m.$$('[data-si36-option="'+id+'"]').forEach(x=>x.setAttribute('aria-selected',String(x.dataset.value===String(state[id]))));
   }
   closeOptions();return;
  }
  const quick=e.target.closest('[data-si36-quick]');
  if(quick){state.date=addDay(today(),Number(quick.dataset.si36Quick));datePaint();return}
  if(e.target.closest('[data-si36-all]')){m.close();Promise.resolve(onClear?.({date:state.date})).catch(G.err);return}
  if(e.target.closest('[data-si36-submit]')){
   if(state.origin&&state.destination&&state.origin===state.destination){
    G.toast('Choose different origin and destination cities','warn');return}
   m.close();Promise.resolve(onSearch?.({date:state.date,from_city_id:state.origin,
    to_city_id:state.destination})).catch(G.err);return;
  }
  if(!e.target.closest('.si36-end'))closeOptions();
 });
 m.el.addEventListener('input',e=>{
  const find=e.target.closest('[data-si36-find]');
  if(find){const key=find.dataset.si36Find,q=find.value.trim().toLowerCase();
   m.$$('[data-si36-option="'+key+'"]').forEach(btn=>btn.hidden=!btn.dataset.name.toLowerCase().includes(q));}
 });
 m.$('[data-si36-picker]').onchange=e=>{if(dateToObj(e.target.value)){state.date=e.target.value;datePaint()}};
 m.el.addEventListener('keydown',e=>{
  const focus=e.target.closest('[data-si36-options]');
  if(!focus)return;
  if(e.key==='Escape'){e.stopPropagation();closeOptions();m.$('[data-si36-toggle="'+focus.dataset.si36Options+'"]')?.focus()}
  if(e.key==='Enter'&&e.target.matches('[data-si36-find]')){
   const first=focus.querySelector('[data-si36-option]:not([hidden])');
   if(first){e.preventDefault();first.click();}
  }
 });
 return m;
}
const summaryValue=(value,available)=>available?String(value):'—';
async function openBusHalts(){
 const header='<div class="si36-halt-title"><strong>Bus halts</strong>'+
 '<small>Pickup and drop points against where the bus really halted, per route. Each route is one direction.</small></div>';
 const body='<div class="si36-halt-controls"><span>Last</span><select aria-label="Halt evidence lookback" data-si36-days>'+
 [7,15,30].map(d=>'<option value="'+d+'" '+(d===15?'selected':'')+'>'+d+' days</option>').join('')+'</select></div>'+
 '<p class="si36-halt-summary" data-si36-halt-summary role="status">Loading verified halt evidence…</p>'+
 '<div class="si36-halt-table-scroll"><table class="si36-halt-table"><thead><tr>'+
 ['ROUTE','TRIPS','PINS TO MOVE','TIMES TO CHANGE','FINE','WAITING',''].map(s=>'<th>'+s+'</th>').join('')+
 '</tr></thead><tbody data-si36-halt-body></tbody></table></div>'+
 '<p class="si36-halt-footer">Waiting: stops with fewer than 3 agreeing GPS-verified trips. Only passenger pickup and drop stops count. Pin warnings: over 50 m; time warnings: over 10 minutes. Pin and time warnings may overlap.</p>';
 const m=dialog({title:header,body,size:'xl'},'si36-halts-modal');
 const summary=m.$('[data-si36-halt-summary]'),tbody=m.$('[data-si36-halt-body]');
 const sel=m.$('[data-si36-days]');let seq=0;
 async function load(){
  const n=++seq;const days=Number(sel.value);
  summary.textContent='Loading verified halt evidence…';
  tbody.innerHTML='<tr><td colspan="7" class="si36-halt-empty">Loading routes…</td></tr>';
  try{
   const result=await G.get('/routes/halts-overview?days='+days);
   if(n!==seq||!m.el.isConnected)return;
   const rows=result.routes||[],data=result.totals||{};
   summary.textContent=result.data_status==='awaiting_verified_gps'?
    'Verified GPS halt evidence is not yet connected. Stop corrections cannot be determined.':
    data.pins_to_move+' pins more than 50 m from the halt and '+data.times_to_change+
      ' times off by 10 min or more, across '+rows.length+' routes. A change is suggested once 3 trips agree.';
   tbody.innerHTML=rows.map(row=>{
    const available=row.provider_evidence;
    const dateRange=row.from_date&&row.to_date?niceDate(row.from_date).replace(/,\s*\d{4}$/,'')+
     ' to '+niceDate(row.to_date).replace(/,\s*\d{4}$/,''):'Awaiting GPS evidence';
    return '<tr><td><div class="si36-route-name"><strong>'+E(row.service_number)+'</strong>'+
      '<small>'+E(row.origin)+' → '+E(row.destination)+' · '+E(dateRange)+'</small></div></td>'+
      '<td>'+E(summaryValue(row.trips,available))+'</td>'+
      '<td><span class="si36-count blue">'+E(summaryValue(row.pins_to_move,available))+'</span></td>'+
      '<td><span class="si36-count amber">'+E(summaryValue(row.times_to_change,available))+'</span></td>'+
      '<td>'+E(summaryValue(row.fine,available))+'</td>'+
      '<td>'+E(row.waiting)+'</td>'+
      '<td><a class="si36-open-route" href="#/gds/routes/'+encodeURIComponent(row.id)+'?rvtab=pickups&rvmode=view" data-si36-open-route>Open route</a></td></tr>';
   }).join('')||'<tr><td colspan="7" class="si36-halt-empty">No active routes found.</td></tr>';
  }catch(e){summary.textContent='Halt evidence could not be loaded.';
   tbody.innerHTML='<tr><td colspan="7" class="si36-halt-empty">'+E(e.message)+
      ' <button type="button" data-si36-halt-retry>Retry</button></td></tr>';}
 }
 sel.onchange=load;
 m.el.addEventListener('click',e=>{if(e.target.closest('[data-si36-halt-retry]'))load();
  if(e.target.closest('[data-si36-open-route]'))m.close();});
 load();return m;
}
const cache=new Map();
async function openCalendar({date,anchor,onPick}={}){
 document.querySelectorAll('.si36-calendar-pop').forEach(x=>x.remove());
 let selected=dateToObj(date)?date:today(),month=selected.slice(0,7),seq=0;
 const pop=document.createElement('div');pop.className='si36-calendar-pop';
 pop.setAttribute('role','dialog');pop.setAttribute('aria-label','Schedule occupancy calendar');
 pop.innerHTML='<div data-si36-cal-body></div>';
 document.body.appendChild(pop);
 function position(){if(!anchor?.isConnected)return;const rect=anchor.getBoundingClientRect();
  const w=Math.min(440,window.innerWidth-18),h=Math.min(690,window.innerHeight-16);
  pop.style.width=w+'px';
  pop.style.left=Math.max(9,Math.min(window.innerWidth-w-9,rect.right-w))+'px';
  const below=window.innerHeight-rect.bottom,above=rect.top;
  pop.style.top=(below>=Math.min(h,500)||below>=above?Math.min(rect.bottom+7,window.innerHeight-100):Math.max(8,rect.top-h-7))+'px';
  pop.style.maxHeight='calc(100dvh - 16px)';
 }
 position();
 const off=e=>{if(!pop.contains(e.target)&&!anchor?.contains(e.target))close();};
 const esc=e=>{if(e.key==='Escape')close();};
 const resize=()=>position();
 function close(){pop.remove();document.removeEventListener('click',off,true);
  document.removeEventListener('keydown',esc);window.removeEventListener('resize',resize);}
 setTimeout(()=>{if(pop.isConnected)document.addEventListener('click',off,true)},0);
 document.addEventListener('keydown',esc);window.addEventListener('resize',resize);
 const tbody=pop.querySelector('[data-si36-cal-body]');
 function graphCell(item,day,holidays){
  const p=item?.percent,has=p!=null&&Number.isFinite(Number(p));
  const level=!has?'unknown':p>=70?'good':p>=40?'mid':'low';
  const d=month+'-'+pad(day);
  const holiday=(holidays||[]).some(x=>x.date===d);
  const selectedFlag=d===selected?' selected':'';
  const currentFlag=d===today()?' today':'';
  const tip=has?E(item.booked_seats+' booked / '+item.capacity+' seats · '+p+'% · '+item.services+' services'):
   'No scheduled seat inventory';
  const festive=(holidays||[]).filter(x=>x.date===d).map(x=>x.name).join(', ');
  return '<button type="button" role="gridcell" class="si36-cal-day '+level+
   (holiday?' holiday':'')+selectedFlag+currentFlag+'" data-si36-date="'+d+
   '" title="'+E(tip+(festive?' · '+festive:''))+'" aria-label="'+E(d+': '+tip+(festive?', '+festive:''))+'">'+
   '<span class="si36-cal-ring" style="--si36-pct:'+(has?p:0)+'%;"><b>'+day+'</b></span>'+
   '<small>'+ (has?p+'%':'—')+'</small></button>';
 }
 function draw(data){
  const y=+month.slice(0,4),m=+month.slice(5,7),n=new Date(y,m,0).getDate(),
   offset=new Date(y,m-1,1).getDay(),items=new Map((data.daily||[]).map(d=>[d.date,d]));
  const holidays=data.holidays||[];
  let cells='';for(let i=0;i<offset;i++)cells+='<span aria-hidden="true" class="si36-cal-pad"></span>';
  for(let i=1;i<=n;i++)cells+=graphCell(items.get(month+'-'+pad(i)),i,holidays);
  const info=holidays.length?holidays.map(hol=>
   '<button type="button" data-si36-holiday="'+E(hol.date)+'" title="'+E(hol.kind+' · '+hol.source_url)+'" class="si36-holiday-item">'+
   '<span>'+Number(hol.date.slice(-2))+'</span><b>'+E(hol.name)+'</b>'+
   '<small>'+E(hol.kind==='gazetted'?'Govt holiday':hol.kind==='restricted'?'Restricted':'Observance')+'</small></button>').join(''):
   '<p class="si36-noholidays">'+(data.holidays_verified_for_year?
   'No listed government holidays or observances this month.':'Verified government holiday data is unavailable for this year.')+'</p>';
  tbody.innerHTML='<header class="si36-cal-head"><button type="button" data-si36-cal-nav="-1" aria-label="Previous month">'+svg('left',24)+'</button>'+
   '<h3>'+E(monthNice(month))+'</h3><button type="button" data-si36-cal-nav="1" aria-label="Next month">'+svg('right',24)+'</button></header>'+
   '<div role="grid" aria-label="Monthly booked seat percentage">'+
   '<div class="si36-cal-week">'+['SUN','MON','TUE','WED','THU','FRI','SAT'].map(x=>'<b>'+x+'</b>').join('')+'</div>'+
   '<div class="si36-cal-grid">'+cells+'</div></div>'+
   '<div class="si36-cal-legend"><span class="si36-legend-green">●</span> ≥70% <span class="si36-legend-orange">●</span> 40–69%'+
    '<span class="si36-legend-red">●</span> &lt;40% <span class="si36-legend-booked"></span> booked</div>'+
   '<div class="si36-holiday-list">'+info+'</div>'+
   '<p class="si36-cal-foot">Occupancy = booked passenger seats ÷ scheduled capacity. Data is from this GDS. Holiday dates vary by state; observances are not automatically public holidays.</p>';
  position();
 }
 async function load(){
  const k=++seq;tbody.innerHTML='<div class="si36-cal-loading">Loading '+E(monthNice(month))+'…</div>';
  try{
   let value=cache.get(month);
   if(!value){value=await G.get('/schedules/month-insights?month='+month);cache.set(month,value);}
   if(k!==seq||!pop.isConnected)return;draw(value);
  }catch(e){if(k!==seq||!pop.isConnected)return;tbody.innerHTML='<div class="si36-cal-error">'+E(e.message)+
     ' <button data-si36-cal-retry>Retry</button></div>';}
 }
 pop.addEventListener('click',e=>{
  const nav=e.target.closest('[data-si36-cal-nav]');
  if(nav){month=nextMonth(month,Number(nav.dataset.si36CalNav));load();return}
  if(e.target.closest('[data-si36-cal-retry]')){cache.delete(month);load();return}
  const day=e.target.closest('[data-si36-date],[data-si36-holiday]');
  if(day){const chosen=day.dataset.si36Date||day.dataset.si36Holiday;if(!dateToObj(chosen))return;
   selected=chosen;close();Promise.resolve(onPick?.(chosen)).catch(G.err);}
 });
 await load();return {close,element:pop};
}
window.ScheduleInsightsV36={openSearch,openBusHalts,openCalendar,dateToObj,iso,addDay,monthNice};
})();
