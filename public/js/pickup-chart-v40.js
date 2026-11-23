/* v40 — SaveTrip reference-backed Import Pickup Chart / Print Pickup Chart UI. */
(function(){
'use strict';
if(!window.G)return;
const E=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PATH={
 file:'<path d="M6 2h8l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
 sparkle:'<path d="m12 3 2.1 6.9L21 12l-6.9 2.1L12 21l-2.1-6.9L3 12l6.9-2.1L12 3Z"/><path d="m21 2 1 2m-3-1 2 1m-18 15 1.5 3"/>',
 pin:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 10h18"/>',
 clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
 close:'<path d="m18 6-12 12M6 6l12 12"/>',
 down:'<path d="m6 9 6 6 6-6"/>',
 up:'<path d="m6 15 6-6 6 6"/>',
 info:'<circle cx="12" cy="12" r="10"/><path d="M12 11v6m0-10h.01"/>',
 upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
 cloud:'<path d="M20 17a4 4 0 0 0-1-7.9A6 6 0 0 0 7 10a4 4 0 0 0-1 7.8"/><path d="M12 21V11m-4 4 4-4 4 4"/>',
 database:'<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v13c0 4 18 4 18 0V5M3 12c0 4 18 4 18 0"/>',
 print:'<path d="M6 8V3h12v5M6 18H3V9h18v9h-3M6 15h12v7H6z"/>',
 download:'<path d="M12 2v13m-5-5 5 5 5-5M4 18v4h16v-4"/>',
 share:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m9 11 6-5m-6 8 6 4"/>',
 sliders:'<path d="M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-8 0v6"/>',
 check:'<path d="M5 12 10 17 19 7"/>',
 bus:'<path d="M5 17V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v12M5 17h14M5 9h14M7 17v3m10-3v3"/>',
 alert:'<path d="m12 3 10 18H2L12 3Zm0 7v4m0 3h.01"/>'
};
const I=(name,size=20)=>'<svg viewBox="0 0 24 24" width="'+size+'" height="'+size+
 '" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+
 (PATH[name]||PATH.file)+'</svg>';
const choices=['Bitla TicketSimply','EzeeInfo','Infinity ITS','Detect automatically'];
const LABEL={seat:'Seat',mobile:'Mobile',pnr:'PNR',name:'Name',gender:'Gender',age:'Age',
 contact_name:'Contact Name',trips:'Trips',from_city:'From City',to_city:'To City',
 pickup:'Pickup',drop:'Drop',fare:'Fare',source:'Source',booked_on:'Booked On'};
const ALL=Object.keys(LABEL);
const PRESETS={
 pickup:['seat','mobile','pnr','name','gender','trips','drop','fare','source','booked_on'],
 rto:['seat','mobile','pnr','name','gender','pickup','drop']
};
const MAX=15*1024*1024;
const number=n=>Number(n||0).toLocaleString('en-IN');
const clock=v=>{if(!/^\d\d:\d\d$/.test(String(v||'')))return String(v||'');
 const [h,m]=v.split(':').map(Number);return (h%12||12)+':'+String(m).padStart(2,'0')+' '+(h<12?'AM':'PM')};
const readable=x=>new Date(String(x||'')+'T12:00:00').toLocaleDateString('en-IN',{
 weekday:'short',day:'numeric',month:'short',year:'numeric'});
const seatSort=(a,b)=>String(a.seat||'').localeCompare(String(b.seat||''),'en',{numeric:true});
const formatCell=(row,k)=>k==='fare'?(row[k]===null||row[k]===undefined?'—':'Rs.'+number(row[k])):
 (row[k]===null||row[k]===undefined||row[k]==='')?'—':E(row[k]);
let current=null;
const mk=(html,kind)=>{
 if(current)current.close();
 const before=document.activeElement,root=document.createElement('div');
 root.className='pc40-overlay pc40-'+kind;
 root.setAttribute('role','presentation');
 root.innerHTML=html;document.body.appendChild(root);
 const escapeClose=e=>{
  if(e.key!=='Escape')return;
  if(root.querySelector('.pc40-source-list')){
    e.preventDefault();e.stopPropagation();
    root.querySelector('[data-pc40="toggle-gds"]')?.click();
    root.querySelector('[data-pc40="toggle-gds"]')?.focus();
  }else ctrl.close();
 };
 const previousOverflow=document.body.style.overflow;
 document.body.style.overflow='hidden';
 const ctrl={root,close:()=>{root.remove();document.body.style.overflow=previousOverflow;document.removeEventListener('keydown',escapeClose,true);
  if(current===ctrl)current=null;try{before?.focus?.()}catch(_){}}};
 current=ctrl;
 document.addEventListener('keydown',escapeClose,true);
 root.querySelector('[data-pc40-close]')?.focus();
 return ctrl;
};
function button(label,ico,action,klass='',disabled=false){
 return '<button type="button" class="pc40-button '+klass+'" data-pc40="'+action+'"'+
  (disabled?' disabled':'')+'>'+I(ico,18)+' '+E(label)+'</button>';
}
function optionsHeader(S){
 const d=S.detail||{},t=S.trip||{};
 return '<div class="pc40-import-title"><div class="pc40-file-icon">'+I('file',27)+'</div>'+
  '<h2>Import pickup chart</h2><span class="pc40-auto">'+I('sparkle',15)+' AUTO</span>'+
  '<span class="pc40-title-divider"></span>'+
  '<span class="pc40-header-pill">'+E(d.service_number||'Service')+'</span>'+
  '<span class="pc40-header-pill">'+I('pin')+E(d.origin||'')+' → '+E(d.destination||'')+'</span>'+
  '<span class="pc40-header-pill">'+I('calendar')+E(readable(d.travel_date||t.travel_date))+'</span>'+
  '<span class="pc40-header-pill red">'+I('clock')+E(clock(d.departure_time))+'</span>'+
  '<button class="pc40-import-x" type="button" data-pc40-close aria-label="Close import popup">'+I('close')+'</button></div>';
}
function importMarkup(S,imp){
 const enabled=Boolean(imp.source);
 return '<div class="pc40-import-dialog" role="dialog" aria-modal="true" aria-label="Import pickup chart">'+
 '<div class="pc40-import-banner">'+optionsHeader(S)+'</div>'+
 '<div class="pc40-import-scroll"><section class="pc40-import-select"><h3>'+I('sparkle',18)+
 ' Which GDS is this tripsheet from?</h3>'+
 '<button type="button" class="pc40-source-selector '+(imp.open?'expanded':'')+'" data-pc40="toggle-gds"'+
  ' aria-expanded="'+imp.open+'" aria-haspopup="listbox">'+
  '<span class="pc40-source-icon">'+I('database',20)+'</span>'+
  '<span class="'+(imp.source?'selected':'placeholder')+'">'+E(imp.source||'Select your GDS')+'</span>'+
  '<span class="pc40-spacer"></span>'+I(imp.open?'up':'down')+'</button>'+
  (imp.open?'<div class="pc40-source-list" role="listbox" aria-label="Which GDS?">'+
   choices.map(g=>'<button type="button" role="option" aria-selected="'+(imp.source===g)+
    '" data-pc40="select-gds" data-gds="'+E(g)+'">'+I('database',17)+' '+E(g)+'</button>').join('')+'</div>':'')+
  '<p class="pc40-import-help">'+I('info',18)+' We use this to pick the right parser for your PDF. Make sure it matches the system that printed the tripsheet.</p></section>'+
 '<section class="pc40-upload-zone '+(imp.dragging?'dragging':'')+(enabled?' enabled':'')+'"'+
  ' data-pc40-dropzone tabindex="'+(enabled?'0':'-1')+'" aria-label="Drag a tripsheet PDF or browse">'+
  '<span class="pc40-upload-symbol">'+I('cloud',34)+'</span>'+
  '<div class="pc40-upload-copy"><strong>Drag a tripsheet PDF or browse</strong>'+
  '<p>'+E(enabled?'Choose a file to preview; your current GDS bookings will not be overwritten.':'Pick your booking system above first.')+'</p>'+
  '<span class="pc40-upload-type">'+I('file',16)+' PDF / CSV · up to 15 MB</span></div>'+
  button('Browse','upload','browse','pc40-browse',!enabled)+'</section>'+
  '<input type="file" accept=".pdf,.csv,application/pdf,text/csv" data-pc40-file hidden/>'+
  (imp.busy?'<div class="pc40-progress">'+I('cloud')+' Validating and extracting passenger rows…</div>':'')+
  (imp.error?'<div class="pc40-import-error" role="alert">'+I('alert',18)+E(imp.error)+'</div>':'')+
  (imp.preview?previewMarkup(imp.preview):'')+
  (imp.saved?'<div class="pc40-import-success" role="status">'+I('check')+
   ' Imported reference chart saved: '+number(imp.saved.passenger_count)+' passengers. Live GDS bookings and seat inventory remain unchanged. '+
   button('Open Print Chart','print','print-imported','')+'</div>':'')+
  '</div></div>';
}
function previewMarkup(p){
 const blocked=p.blocking_issues?.length>0;
 return '<section class="pc40-import-preview"><header><h3>Review extracted chart</h3>'+
  '<span>'+number(p.passenger_count)+' passenger row(s)</span></header>'+
  '<div class="pc40-detect">'+I('database',18)+' Selected: <strong>'+E(p.source_gds)+'</strong>'+
  ' · Detected: <strong>'+E(p.detected_gds||'Unknown')+'</strong> · '+E(p.file_name)+
  ' · Format: <strong>'+E(({grouped_pickup:'Pickup chart (grouped)',rto_seat_order:'RTO chart (seat-sorted)',other_text_pdf:'Other PDF',csv:'CSV'})[p.input_layout]||'Unverified')+'</strong></div>'+
  (p.blocking_issues||[]).map(x=>'<p class="pc40-error-line">'+I('alert',16)+E(x)+'</p>').join('')+
  (p.warnings||[]).slice(0,6).map(x=>'<p class="pc40-warning-line">'+I('info',16)+E(x)+'</p>').join('')+
  '<div class="pc40-import-tablewrap"><table><thead><tr>'+
  ['Seat','Mobile','PNR','Name','Pickup','Drop','Source'].map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+
  (p.rows||[]).map(row=>'<tr>'+['seat','mobile','pnr','name','pickup','drop','source']
   .map(k=>'<td>'+E(row[k]||'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'+
  '<div class="pc40-import-actions"><p>External reference only: import does not create bookings, assign inventory or change fares.</p>'+
  button('Confirm import','check','confirm-import','primary',blocked)+'</div></section>';
}
async function filePreview(S,imp,file,ctrl){
 if(!file)return;
 if(!imp.source){imp.error='Choose the source GDS before uploading.';refresh();return;}
 if(!/\.(pdf|csv)$/i.test(file.name)||file.size>MAX||file.size<=0){
  imp.error='Choose a non-empty PDF/CSV file up to 15 MB.';refresh();return;
 }
 imp.error='';imp.preview=null;imp.saved=null;imp.busy=true;refresh();
 const mime=/\.pdf$/i.test(file.name)?'application/pdf':'text/csv';
 try{
  const headers={'Authorization':'Bearer '+localStorage.getItem('token'),
   'Content-Type':mime,'X-Pickup-Chart-Filename':encodeURIComponent(file.name),
   'X-Pickup-Chart-GDS':imp.source};
  if(G.viewAs)headers['x-view-as']=G.viewAs;
  const r=await fetch('/api/schedules/'+encodeURIComponent(S.detail.id)+
   '/pickup-chart/v40/preview',{method:'POST',headers,body:file});
  const obj=await r.json();
  if(!r.ok)throw new Error(obj.message||'Unable to preview the PDF');
  imp.preview=obj;
 }catch(e){imp.error=e.message||String(e)}
 finally{imp.busy=false;refresh()}
 function refresh(){if(ctrl.root.isConnected){const scroll=ctrl.root.querySelector('.pc40-import-scroll');const y=scroll?.scrollTop||0;
  ctrl.root.innerHTML=importMarkup(S,imp);ctrl.root.querySelector('.pc40-import-scroll').scrollTop=y;}}
}
function openImport(S,V,ctx){
 const imp={source:'',open:false,dragging:false,busy:false,error:'',preview:null,saved:null};
 const ctrl=mk(importMarkup(S,imp),'import');
 const draw=()=>{if(!ctrl.root.isConnected)return;
  const y=ctrl.root.querySelector('.pc40-import-scroll')?.scrollTop||0;
  ctrl.root.innerHTML=importMarkup(S,imp);
  ctrl.root.querySelector('.pc40-import-scroll').scrollTop=y;
 };
 ctrl.root.addEventListener('click',async e=>{
  const target=e.target.closest('[data-pc40-close],[data-pc40]');if(!target)return;
  if(target.hasAttribute('data-pc40-close'))return ctrl.close();
  const a=target.dataset.pc40;
  if(a==='toggle-gds'){imp.open=!imp.open;draw();if(imp.open)ctrl.root.querySelector('[data-pc40="select-gds"]')?.focus();return}
  if(a==='select-gds'){imp.source=target.dataset.gds;imp.open=false;
   imp.preview=null;imp.saved=null;draw();ctrl.root.querySelector('[data-pc40="toggle-gds"]')?.focus();return}
  if(a==='browse'){ctrl.root.querySelector('[data-pc40-file]')?.click();return}
  if(a==='confirm-import'){
   if(!imp.preview||imp.preview.blocking_issues?.length)return;
   imp.busy=true;draw();
   try{
    imp.saved=await G.post('/schedules/'+encodeURIComponent(S.detail.id)+'/pickup-chart/v40/commit',
     {preview_id:imp.preview.preview_id,confirm:true});
    imp.preview=null;imp.error='';
   }catch(ex){imp.error=ex.message||String(ex)}
   finally{imp.busy=false;draw()}
   return;
  }
  if(a==='print-imported'){ctrl.close();openPrint(S,V,ctx,'imported');}
 });
 ctrl.root.addEventListener('keydown',e=>{
  if(!imp.open)return;
  const items=[...ctrl.root.querySelectorAll('[data-pc40="select-gds"]')];
  if(!items.length||!['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(e.key))return;
  const idx=items.indexOf(document.activeElement);
  if(e.key==='Enter'||e.key===' '){if(idx>=0){e.preventDefault();items[idx].click();}return}
  e.preventDefault();
  const next=e.key==='Home'?0:e.key==='End'?items.length-1:
   (idx+(e.key==='ArrowUp'?-1:1)+items.length)%items.length;
  items[next].focus();
 });
 ctrl.root.addEventListener('change',e=>{
  if(e.target.matches('[data-pc40-file]'))filePreview(S,imp,e.target.files?.[0],ctrl);
 });
 ctrl.root.addEventListener('dragover',e=>{
  const zone=e.target.closest('[data-pc40-dropzone]');if(!zone)return;
  e.preventDefault();if(imp.source){zone.classList.add('dragging');}
 });
 ctrl.root.addEventListener('dragleave',e=>{
  if(e.target.closest('[data-pc40-dropzone]'))ctrl.root.querySelector('.pc40-upload-zone')?.classList.remove('dragging');
 });
 ctrl.root.addEventListener('drop',e=>{
  const zone=e.target.closest('[data-pc40-dropzone]');if(!zone)return;
  e.preventDefault();filePreview(S,imp,e.dataTransfer?.files?.[0],ctrl);
 });
 return ctrl;
}
function rowsGrouped(rows,kind){
 const map=new Map();
 for(const p of rows){
  const key=(kind==='pickup'?p.boarding_id:p.dropping_id)||'name:'+String(kind==='pickup'?p.pickup:p.drop);
  if(!map.has(key))map.set(key,[]);
  map.get(key).push(p);
 }
 return [...map.values()].sort((a,b)=>{
  const x=a[0],y=b[0],attr=kind==='pickup'?'boarding_order':'dropping_order';
  return Number(x[attr]??9999)-Number(y[attr]??9999)||
   String(x[kind==='pickup'?'pickup_time':'drop_time']).localeCompare(String(y[kind==='pickup'?'pickup_time':'drop_time']));
 });
}
function visibleRows(state){
 const list=state.data?.rows||[];
 let rows=state.city==='all'?list:list.filter(x=>{
  const [kind,id]=state.city.split(':');return String(kind==='boarding'?x.boarded_city_id:x.dropped_city_id)===id;
 });
 rows=rows.map(x=>({...x}));
 if(state.chart==='rto'&&state.pickupDrop==='trip'){
  const stages=state.data?.stages||[];
  const b=stages.find(x=>x.type==='pickup'),d=stages.filter(x=>x.type==='drop').slice(-1)[0];
  rows.forEach(r=>{r.pickup=b?.name||state.data.origin;r.drop=d?.name||state.data.destination});
 }
 return rows;
}
function previewTable(rows,fields,start=0){
 return '<div class="pc40-table-scroll"><table class="pc40-chart-table"><thead><tr>'+
  '<th>#</th>'+fields.map(k=>'<th>'+E(k==='gender'?'G':LABEL[k])+'</th>').join('')+'</tr></thead><tbody>'+
  rows.map((p,i)=>'<tr><td>'+String(start+i+1)+'</td>'+
   fields.map(k=>'<td class="'+(k==='seat'?'bold':'')+'">'+formatCell(p,k)+'</td>').join('')+'</tr>').join('')+
  '</tbody></table></div>';
}
function stopRows(rows,kind){
 let previousCity='';
 return rowsGrouped(rows,kind).map(g=>{const p=g[0],name=kind==='pickup'?p.pickup:p.drop,
   time=kind==='pickup'?p.pickup_time:p.drop_time,day=kind==='pickup'?p.pickup_day:p.drop_day;
  const extra=kind==='pickup'&&p.exchange_point?' (Bus Pickup: '+p.exchange_point+
    (p.exchange_time?' '+clock(p.exchange_time):'')+')':'';
  const city=String((kind==='pickup'?p.from_city:p.to_city)||'');
  const shownCity=city===previousCity?'':city;
  previousCity=city;
  return '<tr><td>'+E(shownCity)+'</td><td>'+
   E(name+' - '+clock(time)+extra)+'</td><td>'+g.length+'</td><td>'+
   g.map(x=>x.seat).sort((a,b)=>String(a).localeCompare(String(b),'en',{numeric:true})).map(E).join(', ')+
   '</td></tr>';
 }).join('');
}
function chartBody(state){
 const d=state.data,rows=visibleRows(state);
 const grouped=state.chart==='pickup'&&rowsGrouped(rows,'pickup');
 const info='<div class="pc40-print-meta"><div><p><b>Service:</b> '+E(d.service)+'</p>'+
  '<p><b>Date:</b> '+E(d.date)+'</p>'+
  (state.chart==='rto'?'<p><b>Drop:</b> '+E(d.destination)+'</p>':'')+
  '<p><b>Driver:</b> '+E(d.driver||'Not assigned')+' '+E(d.driver_phone||'')+'</p></div>'+
  '<div><p><b>Route:</b> '+E(d.origin)+' → '+E(d.destination)+'</p>'+
  (state.chart==='rto'?'<p><b>Pickup:</b> '+E(d.stages?.find(x=>x.type==='pickup')?.name||d.origin)+'</p>':'')+
  '<p><b>Vehicle:</b> '+E(d.vehicle||'Not assigned')+'</p>'+
  (state.chart==='rto'?'<p><b>Printed:</b> '+E(new Date().toLocaleString('en-IN'))+'</p>':'')+'</div></div>';
 const booked=(d.rows||[]).length;
 const available=d.capacity?Math.max(0,d.capacity-booked):0;
 const stats='<div class="pc40-print-stats"><b>Total:</b> '+number(d.capacity||booked)+
  ' &nbsp; <b>Booked:</b> '+booked+' &nbsp; <b>Available:</b> '+available+
  (state.city!=='all'?' &nbsp; <b>Showing:</b> '+rows.length+' passengers':'')+'</div>';
 let tables='';
 if(state.chart==='pickup'){
  let rowOffset=0;
  for(const g of grouped){
   const p=g[0],title=p.pickup+' Day '+(p.pickup_day||1)+' - '+clock(p.pickup_time)+
    ' ('+g.length+' seat'+(g.length===1?'':'s')+')'+
    (p.exchange_point?' | Bus Pickup: '+p.exchange_point+(p.exchange_time?' '+clock(p.exchange_time):''):'');
   tables+='<section class="pc40-pickup-block"><h3>'+E(title)+'</h3>'+previewTable(g,state.fields.pickup,rowOffset)+'</section>';
   rowOffset+=g.length;
  }
  tables+='<section class="pc40-summary"><h3>Boarding Details</h3>'+
   '<table><thead><tr><th>Station</th><th>Station Point</th><th>Seats</th><th>Seat Name</th></tr></thead><tbody>'+
   stopRows(rows,'pickup')+'</tbody></table></section>'+
   '<section class="pc40-summary"><h3>Dropping Details</h3>'+
   '<table><thead><tr><th>Station</th><th>Station Point</th><th>Seat Count</th><th>Seat Name</th></tr></thead><tbody>'+
   stopRows(rows,'drop')+'</tbody></table></section>';
 }else tables=previewTable(rows.sort(seatSort),state.fields.rto);
 return '<div class="pc40-chart-paper">'+info+stats+tables+'</div>';
}
function optionsPanel(state){
 const city=state.data?.city_options||[];
 const fields=state.fields[state.chart];
 return '<section class="pc40-chart-settings" aria-label="Chart options">'+
 '<div class="pc40-settings-row"><span>Chart:</span><div class="pc40-segment">'+
  [['pickup','Pickup chart'],['rto','RTO chart']].map(([k,l])=>
   '<button type="button" data-pc40="chart" data-chart="'+k+'" class="'+(state.chart===k?'active':'')+
   '" aria-pressed="'+(state.chart===k)+'">'+l+'</button>').join('')+'</div></div>'+
 '<div class="pc40-settings-row"><label for="pc40-city">City:</label><select id="pc40-city" data-pc40-city>'+
   city.filter(x=>x.id==='all').map(x=>'<option value="all">All passengers</option>').join('')+
   ['boarding','dropping'].map(kind=>'<optgroup label="'+(kind==='boarding'?'Boarding at':'Dropping at')+'">'+
    city.filter(x=>x.kind===kind).map(x=>'<option value="'+E(x.id)+'" '+(x.id===state.city?'selected':'')+'>'+
      E(x.city)+' ('+x.count+')</option>').join('')+'</optgroup>').join('')+'</select></div>'+
 '<div class="pc40-field-list">'+ALL.map(k=>'<label><input type="checkbox" data-pc40-field="'+E(k)+'"'+
  (fields.includes(k)?' checked':'')+'/> '+E(LABEL[k])+'</label>').join('')+'</div>'+
 (state.chart==='rto'?'<div class="pc40-rto-radio"><b>Pickup / Drop:</b>'+
  '<label><input type="radio" name="pc40-place" value="trip" '+(state.pickupDrop==='trip'?'checked':'')+
   '/> Trip start / end</label>'+
  '<label><input type="radio" name="pc40-place" value="passenger" '+(state.pickupDrop==='passenger'?'checked':'')+
   '/> Passenger\'s own stop</label></div>':'')+
 (state.imported?'<div class="pc40-settings-row"><label for="pc40-source">Chart data:</label>'+
  '<select id="pc40-source" data-pc40-source>'+
  '<option value="current" '+(state.source==='current'?'selected':'')+'>Current GDS bookings</option>'+
  '<option value="imported" '+(state.source==='imported'?'selected':'')+'>Imported · '+E(state.imported.source_gds)+'</option></select></div>':'')+
 '</section>';
}
function printMarkup(state){
 const data=state.data||{};
 const title=data.service||state.meta?.service||'Service';
 return '<div class="pc40-print-dialog" role="dialog" aria-modal="true" aria-label="Pickup Chart — '+E(title)+'">'+
 '<header class="pc40-print-head"><span class="pc40-green-icon">'+I('print',27)+'</span>'+
  '<div class="pc40-print-title"><h2>Pickup Chart — '+E(title)+'</h2><p>'+E(data.operator||state.meta?.operator||'Operator')+'</p></div>'+
  '<div class="pc40-print-actions">'+
   button('Options','sliders','options',state.showOptions?'open':'')+
   button('Print','print','print-pdf','print-button')+
   button('Download','download','download-pdf')+
   button('Share','share','share-pdf')+
   '<button type="button" data-pc40-close class="pc40-close" aria-label="Close Pickup Chart">'+I('close')+'</button></div></header>'+
 (state.showOptions&&state.data?optionsPanel(state):'')+
 '<main class="pc40-print-scroll">'+(state.error?'<div class="pc40-import-error">'+E(state.error)+'</div>':'')+
  (state.busy?'<div class="pc40-loading">Loading real passenger chart…</div>':state.data?chartBody(state):'')+
 '</main></div>';
}
function filename(state){
 return 'pickup-chart-'+(state.data?.service||'service')+'-'+(state.data?.date||'date')+
  (state.chart==='rto'?'-RTO':'')+(state.source==='imported'?'-imported':'')+'.pdf';
}
function urlParams(state){
 const query=new URLSearchParams({chart:state.chart,city:state.city,pickup_drop:state.pickupDrop,
  columns:state.fields[state.chart].join(','),source:state.source});
 return '/schedules/'+encodeURIComponent(state.sid)+'/pickup-chart/v40.pdf?'+query.toString();
}
function pdfRequest(url){
 return (async()=>{
  const headers={'Authorization':'Bearer '+localStorage.getItem('token')};
  if(G.viewAs)headers['x-view-as']=G.viewAs;
  const r=await fetch('/api'+url,{headers});
  if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.message||'PDF generation failed')}
  const blob=await r.blob();
  if(blob.type!=='application/pdf'&&blob.size===0)throw Error('PDF generation returned an empty file');
  return blob;
 })();
}
function openPrint(S,V,ctx,initialSource='current'){
 const state={sid:S.detail.id,showOptions:false,chart:'pickup',source:initialSource,city:'all',
  pickupDrop:'trip',fields:{pickup:[...PRESETS.pickup],rto:[...PRESETS.rto]},
  meta:null,data:null,imported:null,busy:true,error:'',cached:null,pdfKey:'',promise:null};
 const ctrl=mk(printMarkup(state),'print');
 let preserveY=0;
 const draw=()=>{if(!ctrl.root.isConnected)return;
  const body=ctrl.root.querySelector('.pc40-print-scroll');const y=body?.scrollTop||preserveY;
  ctrl.root.innerHTML=printMarkup(state);
  const next=ctrl.root.querySelector('.pc40-print-scroll');if(next)next.scrollTop=y;
 };
 async function fetchChart(source=state.source){
  state.busy=true;state.error='';draw();
  try{
   if(!state.meta)state.meta=await G.get('/schedules/'+encodeURIComponent(state.sid)+'/pickup-chart/v40/options');
   state.imported=state.meta.imported;
   state.data=await G.get('/schedules/'+encodeURIComponent(state.sid)+'/pickup-chart/v40/data?source='+encodeURIComponent(source));
   state.source=source;state.city='all';invalidate();
  }catch(e){state.error=e.message||String(e);state.data=null}
  finally{state.busy=false;draw()}
 }
 function invalidate(){
  state.cached=null;state.pdfKey='';state.promise=null;
  const u=urlParams(state);
  Promise.resolve().then(()=>prepare(u)).catch(()=>{});
 }
 async function prepare(url=urlParams(state)){
  if(!state.data||!state.fields[state.chart].length)throw Error('Select at least one chart column');
  if(state.cached&&state.pdfKey===url)return state.cached;
  if(state.promise&&state.pdfKey===url)return state.promise;
  state.pdfKey=url;state.promise=pdfRequest(url).then(blob=>{
   if(state.pdfKey===url){state.cached=blob;state.promise=null;}return blob;
  }).catch(err=>{if(state.pdfKey===url)state.promise=null;throw err});
  return state.promise;
 }
 async function createPdf(){
  const url=urlParams(state),blob=await prepare(url);
  if(!blob?.size)throw Error('No PDF content received');
  return blob;
 }
 function downloadFile(blob){
  const href=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=href;a.download=filename(state);a.style.display='none';document.body.append(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(href),60000);
 }
 async function doPdf(action){
  try{
   const blob=await createPdf();
   if(action==='download-pdf'){downloadFile(blob);return}
   if(action==='print-pdf'){
    const href=URL.createObjectURL(blob);
    const frame=document.createElement('iframe');
    frame.setAttribute('title','Pickup Chart PDF for printing');
    frame.className='pc40-print-frame';frame.src=href;
    frame.onload=()=>{try{frame.contentWindow?.focus();frame.contentWindow?.print()}
     catch(_){window.open(href,'_blank','noopener')}}
    document.body.append(frame);
    window.setTimeout(()=>{frame.remove();URL.revokeObjectURL(href)},120000);
    return;
   }
   if(action==='share-pdf'){
    const file=new File([blob],filename(state),{type:'application/pdf'});
    if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){
     try{await navigator.share({title:'Pickup Chart — '+state.data.service,text:'Pickup chart PDF',files:[file]})}
     catch(e){if(e.name!=='AbortError')G.toast('Could not open the system share sheet: '+(e.message||e),'warn')}
    }else{
     downloadFile(blob);
     G.toast('Your browser does not support file sharing. PDF downloaded — share it using your operating system.','warn');
    }
   }
  }catch(e){G.err(e)}
 }
 ctrl.root.addEventListener('click',e=>{
  const b=e.target.closest('[data-pc40-close],[data-pc40]');
  if(!b)return;
  if(b.hasAttribute('data-pc40-close')){ctrl.close();return}
  const a=b.dataset.pc40;
  if(a==='options'){state.showOptions=!state.showOptions;draw();return}
  if(a==='chart'){
   state.chart=b.dataset.chart;state.city='all';invalidate();draw();return;
  }
  if(['print-pdf','download-pdf','share-pdf'].includes(a)){doPdf(a);return}
 });
 ctrl.root.addEventListener('change',e=>{
  const b=e.target;
  if(b.matches('[data-pc40-city]')){state.city=b.value;invalidate();draw();return}
  if(b.matches('[data-pc40-field]')){
   const arr=state.fields[state.chart],k=b.dataset.pc40Field;
   if(!b.checked&&arr.length===1){G.toast('Keep at least one chart column selected','warn');b.checked=true;return}
   if(b.checked&&!arr.includes(k))arr.push(k);
   else if(!b.checked)state.fields[state.chart]=arr.filter(x=>x!==k);
   state.fields[state.chart]=ALL.filter(x=>state.fields[state.chart].includes(x));
   invalidate();draw();return;
  }
  if(b.matches('input[name="pc40-place"]')){state.pickupDrop=b.value;invalidate();draw();return}
  if(b.matches('[data-pc40-source]'))fetchChart(b.value);
 });
 fetchChart(initialSource);
 return ctrl;
}
window.PickupChartV40={openImport,openPrint,renderPrint:printMarkup,renderImport:importMarkup,
 visibleRows,optionsPanel,chartBody,filename};
})();