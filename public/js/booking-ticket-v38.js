/* JourneyOS GDS v38 — integrated PNR ticket workspace, editor, shift and audit history.
   All displayed ticket values come from authenticated booking/schedule endpoints. */
(function(){
'use strict';
const ex=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=x=>Number(x)||0;
const money=x=>'₹'+n(x).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const fdt=x=>{if(!x)return '—';const d=new Date(x);return Number.isFinite(+d)?d.toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):ex(x)};
const gcode=x=>/^F/i.test(String(x))?'F':/^O/i.test(String(x))?'O':'M';
function badge(text,cl=''){return '<span class="sx38-tag '+cl+'">'+ex(text)+'</span>'}
function field(label,name,val,type='text',hint=''){
 return '<label class="sx38-edit-field"><span>'+ex(label)+'</span><input data-v38-field="'+ex(name)+'" name="'+ex(name)+'" type="'+type+'" value="'+ex(val??'')+'" '+(type==='number'?'min="1" max="120"':'')+' />'+(hint?'<small>'+ex(hint)+'</small>':'')+'</label>';
}
function heading(title,icon,ctx){return '<h3 class="sx38-section-heading"><span class="sx38-section-icon">'+ctx.icon(icon,22)+'</span>'+ex(title)+'</h3>'}
function head(b,ctx,editing=false){
 const count=(b.passengers||[]).filter(p=>p.status!=='cancelled').length;
 return '<section class="sx38-ticket-head"><span class="sx38-head-icon">'+ctx.icon('ticket',24)+'</span>'+
 '<div><h2>'+(editing?'Edit Booking':'Booking Details')+' <small>('+count+' seat'+(count===1?'':'s')+')</small></h2>'+
 '<p>PNR: <strong>'+ex(b.ticket_number||b.pnr)+'</strong>　Ref: '+ex(b.pnr)+'　'+badge(b.source||'GDS','source')+'</p>'+
 '<small>Booked: '+fdt(b.booked_at)+'</small></div>'+
 '<button type="button" class="sx38-head-close" data-v38="close-ticket" aria-label="Close ticket">'+ctx.icon('close',24)+'</button></section>';
}
function toolbar(V,b,ctx){
 const canEdit=b.status==='confirmed'&&can('bookings.modify');
 const canCancel=b.status==='confirmed'&&can('bookings.cancel');
 const canChat=can('chats.view');
 return '<div class="sx38-ticket-toolbar">'+
  ctx.btn('Update Ticket','edit','edit','primary',!canEdit)+
  ctx.btn('Print Ticket','print','print-ticket')+
  ctx.btn('Print Invoice','ticket','print-invoice')+
  '<div class="sx38-notify-wrap">'+ctx.btn('Notify','bell','notify-menu','')+
   (V.notifyOpen?'<div class="sx38-notify-dropdown" role="menu">'+
    [['ticket_confirmation','Ticket Confirmation'],['bus_details','Bus Details'],['custom','Custom Message']].map(x=>
    '<button type="button" role="menuitem" data-v38="notify-send" data-template="'+ex(x[0])+'">'+ex(x[1])+'</button>').join('')+'</div>':'')+'</div>'+
  ctx.btn('Cancel Ticket','close','cancel-ticket','danger',!canCancel)+
  ctx.btn('Shift Passenger','arrow','shift','',!canEdit)+
  ctx.btn('Show History','history','history-modal')+
  ctx.btn('Chat Pax','chat','chat', '',!canChat)+
  ctx.btn('Comment','chat','comment')+
 '</div>';
}
function comments(b,V,ctx){
 const rows=(b.comments||[]);
 return '<section class="sx38-comments"><div class="sx38-section-title"><span>COMMENTS</span>'+
 '<button type="button" data-v38="comment">'+ctx.icon('chat',16)+' Add comment</button></div>'+
 (rows.length?rows.map(c=>'<div class="sx38-comment-entry"><b>'+ex(c.by||'Staff')+'</b> <small>'+fdt(c.at)+'</small><p>'+ex(c.text||'')+'</p></div>').join(''):'<p class="sx38-muted">No comments yet</p>')+
 (V.commentOpen?'<div class="sx38-comment-edit"><textarea rows="4" maxlength="2000" data-v38-comment-text placeholder="Note for the record — staff only, never sent to the passenger">'+ex(V.commentText||'')+'</textarea>'+
 '<div><button type="button" data-v38="comment-close">Cancel</button><button type="button" class="sx38-btn primary" data-v38="comment-save" '+(!(V.commentText||'').trim()?'disabled':'')+'>Save comment</button></div></div>':'')+
 '</section>';
}
function detail(b,ctx){
 const contact=b.contact||{};
 const rows=[['MOBILE',contact.phone||'—','phone'],['EMAIL',contact.email||'N/A','chat'],
  ['PICKUP POINT',b.boarding?.name||'—','pin'],['DROP POINT',b.dropping?.name||'—','pin']];
 return '<section class="sx38-detail-card">'+heading('Contact & Journey Details','calendar',ctx)+
 '<div class="sx38-detail-grid">'+rows.map((r,i)=>
  '<div class="sx38-detail-item"><span class="sx38-detail-icon">'+ctx.icon(r[2],20)+'</span>'+
  '<div><small>'+r[0]+'</small><strong title="'+ex(r[1])+'">'+ex(r[1])+'</strong></div>'+
  (i>=2?'<span class="sx38-time-pill">'+ex(ctx.time((i===2?b.boarding:b.dropping)?.time||''))+'</span>':'')+'</div>').join('')+
 '</div></section>';
}
function passengers(b,ctx){
 const rows=(b.passengers||[]).filter(p=>p.status!=='cancelled');
 return '<section class="sx38-passengers">'+heading('Passenger Information','people',ctx)+
 rows.map(p=>'<div class="sx38-passenger-card">'+
  '<span class="sx38-seat-ref">'+ex(p.seat)+'</span>'+
  '<div class="sx38-passenger-name"><strong>'+ex(p.name||'Passenger')+'</strong>'+
  '<div>'+badge(gcode(p.gender)==='F'?'♀ Female':gcode(p.gender)==='M'?'♂ Male':'Other',gcode(p.gender)==='F'?'female':'male')+
  ' <small>'+ex(p.age??'—')+'y</small></div></div>'+
  '<b class="sx38-passenger-fare">'+money(p.fare)+'</b></div>').join('')+'</section>';
}
function moneyCard(b,ctx){
 const f=b.fare||{};
 return '<section class="sx38-fare-card">'+
 '<span class="sx38-section-icon">'+ctx.icon('ticket',21)+'</span>'+
 '<div class="sx38-fare-lines">'+
  [['Base Fare ('+(b.passengers||[]).filter(p=>p.status!=='cancelled').length+' seat)',f.gross],
   ['Discount',-n(f.discount)],['Net Fare',f.net],['GST (5%)',f.gst]].map(([label,value])=>
   '<div class="sx38-fare-row '+(label==='Discount'?'discount':'')+'"><span>'+ex(label)+'</span><span>'+money(value)+'</span></div>').join('')+
  '<div class="sx38-fare-row total"><b>Total Payable</b><strong>'+money(f.total)+'</strong></div>'+
  '<div class="sx38-fare-row paid"><span>Amount '+(b.payment==='paid'?'Paid':'Due / Settled Later')+'</span><strong>'+
  money(b.payment==='paid'?f.total:0)+'</strong></div>'+
 '</div></section>'+
 '<section class="sx38-payment-card"><h3>Payment: '+badge(b.payment||'Unknown',b.payment==='paid'?'paid':'')+'</h3>'+
 '<dl><dt>Paid</dt><dd>'+ex(b.payment_method||b.payment||'Not specified')+'</dd>'+
 '<dt>Channel</dt><dd>'+ex(b.source||'GDS')+'</dd>'+
 '<dt>Operator settlement</dt><dd>'+((f.commission!=null)?'Commission '+money(f.commission):'No settlement breakdown provided')+'</dd></dl></section>';
}
function view(S,V,ctx){
 const b=V.ticket;
 return head(b,ctx)+comments(b,V,ctx)+detail(b,ctx)+passengers(b,ctx)+moneyCard(b,ctx)+
 '<div class="sx38-ticket-footer">'+ctx.btn('Close','close','close-ticket','primary')+'</div>';
}
function stopsMenu(V,kind,ctx){
 const pick=kind==='pickup',rows=(V.stops?.[pick?'pickups':'drops']||[]);
 const chosen=String(V.edit?.[pick?'boarding_stage_id':'dropping_stage_id']||'');
 const selected=rows.find(st=>String(st.id)===chosen);
 const opened=V.stopOpen===kind;
 return '<div class="sx38-stop-field"><button type="button" class="sx38-stop-trigger" data-v38="stop-toggle" data-kind="'+kind+'" aria-expanded="'+opened+'" aria-haspopup="listbox">'+
 '<span>'+ex(selected?.name||'Select '+(pick?'pickup':'drop')+' point')+(selected?.time?' - '+ctx.time(selected.time):'')+'</span>'+ctx.icon('chevron',16)+'</button>'+
 (opened?'<div class="sx38-stop-menu" role="listbox" aria-label="'+(pick?'Pickup':'Drop')+' points">'+
 '<label class="sx38-stop-search">'+ctx.icon('search')+'<input type="search" data-v38-stop-search placeholder="Search" aria-label="Search stops"/></label>'+
 '<div class="sx38-stop-options"><div class="sx38-stop-city">'+ctx.icon('pin',14)+' '+ex(rows[0]?.city_name||'CITY')+'</div>'+
 rows.map(st=>'<button type="button" role="option" data-v38="stop-choice" data-kind="'+kind+'" data-id="'+ex(st.id)+'" data-v38-stop-item '+
 'aria-selected="'+(String(st.id)===chosen)+'" title="'+ex(st.name)+'">'+
 '<span class="sx38-stop-dot">'+ctx.icon('pin',16)+'</span>'+
 '<span class="sx38-stop-name">'+ex(st.name)+'<small>'+ex(st.pickup_type||'')+'</small></span>'+
 '<span class="sx38-time-pill">'+ex(ctx.time(st.time))+'</span>'+
 (String(st.id)===chosen?ctx.icon('check',17):'')+'</button>').join('')+
 '</div></div>':'')+
 '<small>Booked: '+ex((pick?V.stops?.pickups:V.stops?.drops)?.find(x=>String(x.id)===String(pick?V.ticket.boarding_stage_id:V.ticket.dropping_stage_id))?.name||'—')+'</small></div>';
}
function editor(S,V,ctx){
 const b=V.ticket,edit=V.edit;
 if(!edit)return '<div class="sx38-no-data">Preparing editor…</div>';
 return head(b,ctx,true)+
 '<section class="sx38-editor-details">'+heading('Contact & Journey Details','calendar',ctx)+
 '<div class="sx38-editor-grid">'+field('','contact_phone',edit.contact.phone,'tel')+
 field('','contact_email',edit.contact.email,'email')+
 stopsMenu(V,'pickup',ctx)+stopsMenu(V,'drop',ctx)+'</div></section>'+
 '<section class="sx38-editor-passengers">'+heading('Passenger Information','people',ctx)+
 edit.passengers.map((p,i)=>'<div class="sx38-edit-pax"><div class="sx38-edit-row">'+
 '<span class="sx38-seat-ref">'+ex(p.seat)+'</span>'+
 '<input aria-label="Passenger name seat '+ex(p.seat)+'" data-v38-field="passenger_name" data-index="'+i+'" value="'+ex(p.name)+'" maxlength="120" />'+
 '<input aria-label="Age" data-v38-field="passenger_age" data-index="'+i+'" type="number" min="1" max="120" value="'+ex(p.age)+'"/></div>'+
 '<div class="sx38-edit-genders"><button type="button" data-v38="gender" data-index="'+i+'" data-gender="M" class="'+(p.gender==='M'?'active':'')+'">Male</button>'+
 '<button type="button" data-v38="gender" data-index="'+i+'" data-gender="F" class="'+(p.gender==='F'?'active':'')+'">Female</button>'+
 '<button type="button" data-v38="gender" data-index="'+i+'" data-gender="O" class="'+(p.gender==='O'?'active':'')+'">Other</button></div>'+
 '<b>'+money(p.fare)+'</b></div>').join('')+
 '</section>'+
 '<div class="sx38-edit-summary"><div><span>Subtotal ('+edit.passengers.length+' seat)</span><span>'+money(b.fare?.total)+'</span></div>'+
 '<div class="total"><b>Total Amount</b><strong>'+money(b.fare?.total)+'</strong></div></div>'+
 '<label class="sx38-notify-checkbox"><input type="checkbox" data-v38-edit-notify '+(edit.notify?'checked':'')+'/> Notify Passenger</label>'+
 '<div class="sx38-submit-row"><button type="button" data-v38="edit-back">Back</button>'+
 '<button type="button" class="primary" data-v38="edit-save">Save Changes</button></div>';
}
function shift(S,V,ctx){
 const b=V.ticket,sh=V.shift,ps=(b.passengers||[]).filter(p=>p.status!=='cancelled'),
 ready=!!sh.service&&ps.every(p=>sh.assignment[p.seat]);
 return '<div class="sx38-shift-layout"><div class="sx38-shift-inventory">'+
 (sh.service?'<h3>Available seats · '+ex(sh.seats.length)+'</h3><div class="sx38-shift-seat-grid">'+
 sh.seats.map(s=>'<button type="button" data-v38="shift-seat" data-seat="'+ex(s.seat)+'" class="'+
 (Object.values(sh.assignment).includes(s.seat)?'assigned':'')+'" '+(Object.values(sh.assignment).includes(s.seat)?'disabled':'')+'>'+
 ex(s.seat)+'</button>').join('')+'</div><small>Select a passenger, then select an available seat.</small>':
 '<div class="sx38-shift-empty">Select date and service to<br/>view available seats</div>')+'</div>'+
 '<div class="sx38-shift-form"><header><h2>Shift Passenger</h2>'+
 '<button type="button" data-v38="shift-back" aria-label="Close shift editor">'+ctx.icon('close')+'</button></header>'+
 '<section class="sx38-current-booking"><h3>Current Booking</h3>'+
 '<p>PNR: <strong>'+ex(b.pnr)+'</strong></p>'+
 '<div><span>Date: '+ctx.formatDate(b.travel_date)+'</span><span>Route: '+ex(b.from)+' → '+ex(b.to)+'</span></div>'+
 '<hr/><p>Passengers:</p>'+ps.map(p=>'<div>'+badge(p.seat,'seat')+' '+ex(p.name)+' <small>('+gcode(p.gender)+')</small></div>').join('')+'</section>'+
 '<section class="sx38-shift-to"><h3>Shift To</h3><label>Date:<input data-v38-shift-date type="date" value="'+ex(sh.date||b.travel_date)+'" min="'+ex(new Date().toISOString().slice(0,10))+'"/></label>'+
 '<label>Time & Service:<select data-v38-shift-service><option value="">Select a service</option>'+
 (sh.services||[]).map(s=>'<option value="'+ex(s.id)+'" '+(String(sh.service)===String(s.id)?'selected':'')+'>'+
 ex(s.service)+' · '+ex(ctx.time(s.departure_time))+' · '+s.free_seats+' free</option>').join('')+
 '</select></label></section>'+
 '<section class="sx38-assignment"><h3>Seat Assignment</h3>'+
 '<div class="sx38-assign-cols"><b>Passenger</b><b>Before</b><b>After</b></div>'+
 ps.map((p,i)=>'<button type="button" data-v38="shift-person" data-index="'+i+'" class="sx38-assignment-row '+(sh.chosen===i?'chosen':'')+'"><span>'+ex(p.name)+'</span>'+
 '<span>'+badge(p.seat,'seat')+'</span><span>→ '+(sh.assignment[p.seat]?badge(sh.assignment[p.seat],'after'):'Select')+'</span></button>').join('')+'</section>'+
 '<label class="sx38-notify-checkbox"><input type="checkbox" data-v38-shift-notify '+(sh.notify!==false?'checked':'')+'/> Notify Passenger</label>'+
 '<div class="sx38-submit-row"><button type="button" data-v38="shift-back">Back</button>'+
 '<button class="primary" data-v38="shift-confirm" type="button" '+(!ready?'disabled':'')+'>Confirm Shift</button></div>'+
 '</div></div>';
}
function render(S,V,ctx){
 const b=V.ticket;
 if(!b)return '<div class="sx38-no-data">'+ex(V.loadError||'Loading booking details…')+
 '<p><button data-v38="chart" type="button">Back to Pickup Chart</button></p></div>';
 return toolbar(V,b,ctx)+(V.mode==='edit'?editor(S,V,ctx):V.mode==='shift'?shift(S,V,ctx):view(S,V,ctx));
}
function makeEdit(b){
 return {contact:{name:b.contact?.name||'',phone:b.contact?.phone||'',email:b.contact?.email||''},
  passengers:(b.passengers||[]).filter(p=>p.status!=='cancelled').map(p=>({seat:p.seat,
   name:p.name||'',age:p.age??'',gender:gcode(p.gender),fare:p.fare})),
  boarding_stage_id:b.boarding_stage_id,dropping_stage_id:b.dropping_stage_id,notify:true};
}
function change(event,S,V){
 const x=event.target;
 if(x.hasAttribute('data-v38-edit-notify')){if(V.edit)V.edit.notify=x.checked;return true}
 if(x.hasAttribute('data-v38-shift-notify')){V.shift.notify=x.checked;return true}
 if(x.hasAttribute('data-v38-shift-date')){
  V.shift.date=x.value;V.shift.service='';V.shift.assignment={};V.shift.seats=[];
  loadServices(S,V).catch(G.err);return true;
 }
 if(x.hasAttribute('data-v38-shift-service')){
  V.shift.service=x.value;V.shift.seats=[];V.shift.assignment={};V.shift.chosen=0;
  loadSeats(S,V).catch(G.err);return true;
 }
 return false;
}
function input(event,S,V){
 const x=event.target;
 if(x.hasAttribute('data-v38-comment-text')){
  V.commentText=x.value;
  const btn=S.ov.querySelector('[data-v38="comment-save"]');if(btn)btn.disabled=!V.commentText.trim();
  return true;
 }
 if(x.hasAttribute('data-v38-stop-search')){
  const q=x.value.trim().toLowerCase();
  const parent=x.closest('.sx38-stop-menu');
  parent?.querySelectorAll('[data-v38-stop-item]').forEach(b=>b.hidden=!b.textContent.toLowerCase().includes(q));
  return true;
 }
 const field=x.dataset?.v38Field;
 if(field&&V.edit){
  if(field==='contact_phone')V.edit.contact.phone=x.value;
  if(field==='contact_email')V.edit.contact.email=x.value;
  const i=Number(x.dataset.index);
  if(Number.isInteger(i)&&V.edit.passengers[i]){
   if(field==='passenger_name')V.edit.passengers[i].name=x.value;
   if(field==='passenger_age')V.edit.passengers[i].age=x.value;
  }
  return true;
 }
 return false;
}
async function reloadTicket(S,V,ctx){
 V.ticket=await G.get('/bookings/'+encodeURIComponent(V.pnr));V.ticketPnr=V.pnr;
 await ctx.hydrate();await ctx.redraw();
}
async function loadServices(S,V){
 const sh=V.shift;
 const res=await G.get('/bookings/'+encodeURIComponent(V.pnr)+'/shift-options?date='+encodeURIComponent(sh.date));
 if(V.shift!==sh)return;sh.services=res.services||[];
 await S.v38ctx.redraw();
}
async function loadSeats(S,V){
 const sh=V.shift;
 if(!sh.service){await S.v38ctx.redraw();return}
 const res=await G.get('/bookings/'+encodeURIComponent(V.pnr)+'/shift-seats?schedule_id='+encodeURIComponent(sh.service));
 if(V.shift!==sh)return;sh.seats=res.seats||[];await S.v38ctx.redraw();
}
async function ticketNotify(S,V,template,ctx){
 if(!can('trips.chat'))return G.toast('Notification permission required','bad');
 let text='';
 if(template==='custom'){
  const p=await G.prompt('Custom notification',[{name:'text',label:'Message',full:true}],{ok:'Record notification'});
  if(!p)return;text=String(p.text||'').trim();if(!text)return G.toast('Enter message text','bad');
 }
 if(!(await G.confirm('Record '+template.replaceAll('_',' ')+' for PNR '+V.ticket.ticket_number+'? Delivery is not verified.',{ok:'Record'})))return;
 const result=await G.post('/trips/'+encodeURIComponent(S.detail.id)+'/notify',{template,pnrs:[V.pnr],text});
 V.notifyOpen=false;
 G.toast((result.recorded??0)+' notification record(s) saved; provider delivery is unverified','ok');
 await ctx.redraw();
}
async function cancelTicket(S,V,ctx){
 if(V.ticket.status!=='confirmed'||!can('bookings.cancel'))return;
 const active=(V.ticket.passengers||[]).filter(p=>p.status!=='cancelled');
 const subset=active.some(p=>String(p.seat)===String(V.seat))?[V.seat]:active.map(p=>p.seat);
 const q=await G.get('/bookings/'+encodeURIComponent(V.pnr)+'/refund-quote');
 const p=await G.prompt('Cancel ticket '+(V.ticket.ticket_number||V.pnr),[
  {name:'seats',label:'Seats to cancel (comma-separated)',value:subset.join(', '),required:true},
  {name:'by',label:'Cancelled by',type:'select',options:[['passenger','Passenger (policy '+q.refund_pct+'% refund)'],['operator','Operator (authorized override)']]},
  {name:'reason',label:'Reason for cancellation',full:true},
  {name:'notify',label:'Notify passenger',type:'checkbox',value:true}
 ],{ok:'Review cancellation'});
 if(!p)return;
 const seats=String(p.seats||'').split(',').map(x=>x.trim()).filter(Boolean);
 if(!seats.length||seats.some(x=>!active.some(a=>String(a.seat)===x)))return G.toast('Choose valid active passenger seats','bad');
 if(!(await G.confirm('Cancel seats '+seats.join(', ')+' under PNR '+V.ticket.ticket_number+'? The operation cannot be undone and refunds follow cancellation policy.',{ok:'Confirm Cancellation',danger:true})))return;
 const result=await G.post('/bookings/'+encodeURIComponent(V.pnr)+'/cancel',{seats,by:p.by,reason:p.reason||'Cancellation requested',notify:!!p.notify});
 G.toast('Ticket cancellation recorded · refund '+money(result.refund),'ok');
 await reloadTicket(S,V,ctx);
}
function printTicket(V,isInvoice){
 const b=V.ticket;
 if(!b)return;
 const title=isInvoice?'Payment Statement / Invoice Preview':'Passenger Ticket';
 const ps=(b.passengers||[]).filter(p=>p.status!=='cancelled');
 const html='<!doctype html><html><head><meta charset="utf-8"><title>'+ex(title)+'</title>'+
 '<style>body{font:14px Arial,sans-serif;max-width:820px;margin:35px auto;color:#14233c}h1{color:#2358df}table{border-collapse:collapse;width:100%;margin:20px 0}td,th{padding:12px;border:1px solid #d4ddec;text-align:left}.muted{color:#71809b}.note{border:1px solid #f5b850;padding:12px;background:#fff9e8}@media print{button{display:none}}</style></head><body>'+
 '<h1>'+ex(title)+'</h1>'+(isInvoice?'<div class="note">Financial statement based on recorded GDS booking data; operator legal details and statutory invoice number must be verified before tax-invoice issuance.</div>':'')+
 '<p>PNR: <strong>'+ex(b.pnr)+'</strong> | Ticket: '+ex(b.ticket_number)+' | Source: '+ex(b.source)+'</p>'+
 '<p>Travel: '+ex(b.from)+' → '+ex(b.to)+' | '+ex(b.travel_date)+' | Service: '+ex(b.service_number)+'</p>'+
 '<p>Passenger contact: '+ex(b.contact?.name)+' ('+ex(b.contact?.phone)+')</p>'+
 '<p>Pickup: '+ex(b.boarding?.name)+'　 Drop: '+ex(b.dropping?.name)+'</p>'+
 '<table><tr><th>Seat</th><th>Passenger</th><th>Age</th><th>Gender</th><th>Fare</th></tr>'+
 ps.map(p=>'<tr><td>'+ex(p.seat)+'</td><td>'+ex(p.name)+'</td><td>'+ex(p.age)+'</td><td>'+ex(p.gender)+'</td><td>'+money(p.fare)+'</td></tr>').join('')+'</table>'+
 '<table><tr><td>Base fare</td><td>'+money(b.fare?.gross)+'</td></tr>'+
 '<tr><td>Discount</td><td>-'+money(b.fare?.discount)+'</td></tr>'+
 '<tr><td>Net fare</td><td>'+money(b.fare?.net)+'</td></tr>'+
 '<tr><td>GST</td><td>'+money(b.fare?.gst)+'</td></tr>'+
 '<tr><th>Total payable</th><th>'+money(b.fare?.total)+'</th></tr></table>'+
 '<p class="muted">Booking status: '+ex(b.status)+' · Payment: '+ex(b.payment)+'</p>'+
 '<button onclick="window.print()">Print</button></body></html>';
 const win=window.open('','_blank');
 if(!win)return G.toast('Allow popups to print the '+(isInvoice?'statement':'ticket'),'warn');
 win.document.open();win.document.write(html);win.document.close();
 win.focus();
}
async function history(V,ctx){
 const result=await G.get('/bookings/'+encodeURIComponent(V.pnr)+'/history');
 const items=result.events||[];
 const rows=items.map((x,i)=>'<div class="sx38-history-event">'+
 '<span class="sx38-history-node">'+ctx.icon(x.kind==='created'?'ticket':x.kind==='discount'?'edit':x.kind==='cancel'?'close':'check',20)+'</span>'+
 '<article><header><b>'+ex(x.title)+'</b><small>'+fdt(x.at)+'</small></header>'+
 (x.details||[]).map(y=>'<p>'+ex(y.label)+'　<strong>'+ex(y.value)+'</strong></p>').join('')+
 '<footer>Source: '+ex(x.source||'GDS')+' · By: '+ex(x.actor||'System')+'</footer></article></div>').join('');
 const modal=G.modal({title:'PNR History　'+ex(result.ticket_number||result.pnr)+'　| '+ex(result.pnr),
  size:'lg',body:'<div class="sx38-history-dialog"><p>Every recorded change to this booking — who did what, when, and from where.</p>'+
  (rows||'<p>No recorded changes yet.</p>')+'</div>'});
 modal.el.classList.add('sx38-history-overlay');
}
async function click(action,node,S,V,ctx){
 if(!V.ticket)return false;
 switch(action){
  case 'close-ticket':V.pnr=null;V.ticket=null;V.ticketPnr=null;V.panel='chart';V.mode='view';await ctx.redraw();return true;
  case 'edit':
   if(!can('bookings.modify')||V.ticket.status!=='confirmed')return true;
   V.edit=makeEdit(V.ticket);
   V.stops=await G.get('/bookings/'+encodeURIComponent(V.pnr)+'/stops');
   V.mode='edit';V.stopOpen=null;await ctx.redraw();return true;
  case 'edit-back':V.mode='view';V.stopOpen=null;await ctx.redraw();return true;
  case 'stop-toggle':V.stopOpen=V.stopOpen===node.dataset.kind?null:node.dataset.kind;await ctx.redraw();return true;
  case 'stop-choice':
   if(V.edit){
    V.edit[node.dataset.kind==='pickup'?'boarding_stage_id':'dropping_stage_id']=node.dataset.id;
    V.stopOpen=null;await ctx.redraw();
   }return true;
  case 'gender':
   if(V.edit?.passengers[Number(node.dataset.index)]){
    V.edit.passengers[Number(node.dataset.index)].gender=node.dataset.gender;
    await ctx.redraw();
   }return true;
  case 'edit-save':{
    if(!can('bookings.modify'))return true;
    const e=V.edit;
    const ph=String(e.contact.phone||'').trim();
    if(!/^\d{10}$/.test(ph))return G.toast('Enter a valid 10-digit mobile number','bad');
    if(e.passengers.some(p=>!p.name.trim()||!(Number(p.age)>=1&&Number(p.age)<=120)))return G.toast('Enter passenger names and ages 1–120','bad');
    const payload={contact:{...e.contact,name:V.ticket.contact?.name||e.passengers[0]?.name||'Passenger'},
     passengers:e.passengers.map(p=>({seat:p.seat,name:p.name.trim(),age:Number(p.age),gender:p.gender})),
     boarding_stage_id:e.boarding_stage_id,dropping_stage_id:e.dropping_stage_id};
    await G.put('/bookings/'+encodeURIComponent(V.pnr),payload);
    let warning='';
    if(e.notify){try{const result=await G.post('/trips/'+encodeURIComponent(S.detail.id)+'/notify',{
       template:'ticket_confirmation',pnrs:[V.pnr]});
       if(!result.recorded)warning='; notification was not recorded';
      }catch(err){warning='; notification could not be recorded: '+err.message}}
    V.mode='view';V.edit=null;await reloadTicket(S,V,ctx);
    G.toast('Booking changes saved'+warning,'ok');return true;
   }
  case 'comment':V.commentOpen=!V.commentOpen;V.commentText='';await ctx.redraw();return true;
  case 'comment-close':V.commentOpen=false;V.commentText='';await ctx.redraw();return true;
  case 'comment-save':{
    const text=String(V.commentText||'').trim();
    if(!text)return true;
    await G.post('/bookings/'+encodeURIComponent(V.pnr)+'/comments',{text});
    V.commentOpen=false;V.commentText='';await reloadTicket(S,V,ctx);
    G.toast('Internal comment saved','ok');return true;
   }
  case 'shift':{
    if(!can('bookings.modify')||V.ticket.status!=='confirmed')return true;
    const date=V.ticket.travel_date>=today()?V.ticket.travel_date:today();
    V.shift={date,service:'',services:[],seats:[],assignment:{},chosen:0,notify:true};
    V.mode='shift';S.v38ctx=ctx;
    await loadServices(S,V);return true;
   }
  case 'shift-back':V.mode='view';await ctx.redraw();return true;
  case 'shift-person':V.shift.chosen=Number(node.dataset.index);await ctx.redraw();return true;
  case 'shift-seat':{
    const sh=V.shift,active=(V.ticket.passengers||[]).filter(p=>p.status!=='cancelled');
    const code=node.dataset.seat;
    if(!sh.seats.some(x=>String(x.seat)===String(code)))return true;
    const person=active[sh.chosen]||active.find(p=>!sh.assignment[p.seat]);
    if(!person)return true;
    Object.keys(sh.assignment).forEach(k=>{if(sh.assignment[k]===code)delete sh.assignment[k]});
    sh.assignment[person.seat]=code;
    const next=active.findIndex(p=>!sh.assignment[p.seat]);
    sh.chosen=next<0?sh.chosen:next;
    await ctx.redraw();return true;
   }
  case 'shift-confirm':{
    const sh=V.shift,active=(V.ticket.passengers||[]).filter(p=>p.status!=='cancelled');
    if(!sh.service||active.some(p=>!sh.assignment[p.seat]))return true;
    if(!(await G.confirm('Shift '+active.length+' passenger(s) to '+sh.date+'? This changes their trip and seat assignment.',{ok:'Confirm Shift'})))return true;
    await G.post('/bookings/'+encodeURIComponent(V.pnr)+'/shift',{schedule_id:Number(sh.service),seat_map:sh.assignment});
    let warning='';
    if(sh.notify){try{const result=await G.post('/trips/'+encodeURIComponent(sh.service)+'/notify',{template:'ticket_confirmation',pnrs:[V.pnr]});
      if(!result.recorded)warning='; notification not recorded'}catch(e){warning='; notification not recorded'}}
    V.mode='view';V.shift={};await reloadTicket(S,V,ctx);
    G.toast('Passenger shifted successfully'+warning,'ok');return true;
   }
  case 'history-modal':await history(V,ctx);return true;
  case 'cancel-ticket':await cancelTicket(S,V,ctx);return true;
  case 'notify-menu':V.notifyOpen=!V.notifyOpen;await ctx.redraw();return true;
  case 'notify-send':await ticketNotify(S,V,node.dataset.template,ctx);return true;
  case 'chat':{
    if(!can('chats.view'))return true;
    const p=(S.trip?.passengers||[]).find(x=>x.pnr===V.pnr&&String(x.seat)===String(V.seat));
    if(!p?.conversation_id)return G.toast('Passenger conversation is not available','warn');
    location.hash='#/chats/'+encodeURIComponent(p.conversation_id);return true;
   }
  case 'print-ticket':
   if(window.TicketPrintV41)TicketPrintV41.open(V.pnr);
   else G.toast('Ticket preview module is unavailable','bad');
   return true;
  case 'print-invoice':
   if(window.TicketPrintV41)TicketPrintV41.invoiceNotice();
   else G.toast('Print invoice feature coming soon','warn');
   return true;
 }
 return false;
}
window.BookingTicketV38={render,click,change,input,makeEdit};
})();