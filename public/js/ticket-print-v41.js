/* v41: operator-branded ticket workspace mirroring supplied 5 screenshots.
   Securely opens from Schedule > Bookings > PNR; no public links or sample passenger data. */
(function(){
'use strict';
if(!window.G)return;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>'₹'+(Number(n)||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const paths={
 bus:'<rect x="4" y="3" width="16" height="16" rx="3"/><path d="M4 12h16M8 19v2m8-2v2M8 7h2m4 0h2"/><circle cx="8" cy="15" r="1"/><circle cx="16" cy="15" r="1"/>',
 close:'<path d="M18 6 6 18M6 6l12 12"/>',
 phone:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
 call:'<path d="M22 16v3a3 3 0 0 1-3 3A18 18 0 0 1 2 5a3 3 0 0 1 3-3h3l2 5-3 2a14 14 0 0 0 7 7l2-3z"/>',
 pin:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/>',
 download:'<path d="M12 2v13m-4-5 4 5 4-5M4 18v4h16v-4"/>',
 print:'<path d="M6 8V3h12v5M6 18H3V9h18v9h-3M6 15h12v7H6z"/>',
 share:'<path d="M8 12h8M12 8l4 4-4 4"/><path d="M7 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/>',
 clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
 whatsapp:'<path d="M4 19 2.5 22l5-1.5a10 10 0 1 0-3.5-3.5z"/><path d="M8 8c1 5 4 8 8 8l1.5-2-3-1.5-1.3 1a8 8 0 0 1-3-3L11 9z"/>',
 warning:'<path d="m12 3 10 18H2L12 3Zm0 7v4m0 3h.01"/>',
 info:'<circle cx="12" cy="12" r="10"/><path d="M12 11v6m0-10h.01"/>',
 arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 check:'<path d="m5 12 5 5 9-9"/>',
 email:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m3 5 9 8 9-8"/>'
};
const icon=(key,size=20)=>'<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[key]||paths.info)+'</svg>';
let active=null;
function invoiceNotice(){
 document.querySelector('.ticket41-invoice-notice')?.remove();
 const node=document.createElement('div');node.className='ticket41-invoice-notice';
 node.setAttribute('role','status');
 node.innerHTML='<span class="ticket41-invoice-ico">'+icon('info',20)+'</span>'+
  '<span>Print invoice feature coming soon</span>'+
  '<button type="button" aria-label="Dismiss notification" data-ticket41-dismiss>'+icon('close')+'</button>'+
  '<span class="ticket41-notice-progress"></span>';
 document.body.appendChild(node);
 const timeout=window.setTimeout(()=>node.remove(),4600);
 node.querySelector('button').addEventListener('click',()=>{window.clearTimeout(timeout);node.remove()});
 return node;
}
function dateLabel(x){
 if(!x)return '';
 const d=new Date(x);
 return Number.isFinite(+d)?d.toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}):String(x);
}
function detailVal(k,v){
 return '<span class="ticket41-label">'+esc(k)+'</span><strong>'+esc(v||'—')+'</strong>';
}
function top(s){
 const t=s.ticket,op=t?.operator||{},brand=esc(op.name||'Operator');
 const wphone=String(op.alternate_phone||op.phone||'').replace(/\D/g,'');
 return '<header class="ticket41-nav"><div class="ticket41-logo"><b>N</b><strong>'+brand+'</strong></div>'+
  '<div class="ticket41-topactions">'+
  '<button type="button" class="ticket41-btn ticket41-search" data-t41="close">'+icon('bus')+' Search</button>'+
  '<button type="button" class="ticket41-btn ticket41-whatsapp" data-t41="whatsapp" '+(!wphone?'disabled':'')+'>'+
   icon('whatsapp')+' WhatsApp</button>'+
  '<button type="button" class="ticket41-theme" data-t41="theme" title="Toggle theme" aria-label="Toggle theme">'+icon('sun')+'</button>'+
  '<button type="button" class="ticket41-smallclose" data-t41="close" aria-label="Close ticket preview">'+icon('close')+'</button>'+
  '</div></header>';
}
function legalHeader(t){
 const op=t.operator||{};
 return '<div class="ticket41-legal">'+
  '<div class="ticket41-legal-top"><h1>'+esc(op.name)+'</h1>'+
  (op.website?'<span>'+esc(op.website)+'</span>':'')+'</div>'+
  '<div class="ticket41-legal-contact"><span>'+icon('call',14)+' '+esc(op.phone||'')+
  (op.alternate_phone&&op.alternate_phone!==op.phone?', '+esc(op.alternate_phone):'')+'</span>'+
  '<span>'+icon('email',14)+' '+esc(op.email||'')+'</span></div>'+
  (op.legal_name?'<p>Bus service provided by: '+esc(op.legal_name)+(op.address?', '+esc(op.address):'')+'</p>':
    op.address?'<p>'+esc(op.address)+'</p>':'')+
  (op.gstin?'<p>Operator GSTIN: '+esc(op.gstin)+'</p>':'')+
  '</div>';
}
function tripCard(t){
 const p=t.boarding||{},d=t.dropping||{},journey=Math.round(Number(t.journey_minutes||0)/60);
 const block=(obj,title)=>'<div class="ticket41-place"><span>'+title+'</span><h3>'+esc(obj.city)+'</h3>'+
  '<h4>'+esc(obj.name)+'</h4>'+
  (obj.instructions?'<p>'+esc(obj.instructions)+'</p>':'')+
  (obj.address&&obj.address!==obj.name?'<p>'+esc(obj.address)+'</p>':'')+
  '<p>Time: <b>'+esc(obj.time)+'</b></p>'+
  (title==='BOARDING'&&obj.reporting?'<p>Reporting: '+esc(obj.reporting)+'</p>':'')+
  (obj.contact?'<p>Contact: '+esc(obj.contact)+'</p>':'')+
  (obj.maps_url?'<a href="'+esc(obj.maps_url)+'" target="_blank" rel="noopener noreferrer">Google Maps Link</a>':'')+
  '</div>';
 return '<div class="ticket41-trip"><div class="ticket41-duration">'+icon('clock',17)+
  ' <strong>'+journey+'h</strong> journey</div><div class="ticket41-route">'+
  block(p,'BOARDING')+block(d,'DROPPING')+'</div></div>';
}
function fareCard(t){
 const f=t.fare||{},a=t.passengers||[],paid=String(t.payment).toLowerCase()==='paid';
 const row=(text,amount,klass='')=>'<div class="ticket41-moneyrow '+klass+'"><span>'+text+'</span><strong>'+money(amount)+'</strong></div>';
 return '<section class="ticket41-pass"><h3>Passenger Detail</h3>'+
  '<div class="ticket41-pass-scroll"><table><thead><tr>'+
  ['Passenger','Phone','Gender','Age','Seat','Fare'].map(x=>'<th>'+x+'</th>').join('')+
  '</tr></thead><tbody>'+
  a.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+esc(x.phone)+'</td><td>'+esc(x.gender)+'</td>'+
   '<td>'+esc(x.age)+'</td><td><b class="ticket41-seat">'+esc(x.seat)+'</b></td><td>'+money(x.fare)+'</td></tr>').join('')+
  '</tbody></table></div>'+
  row('Base Fare ('+a.length+' seat'+(a.length===1?'':'s')+')',f.gross,'base')+
  row('Discount',-Number(f.discount||0),'discount')+
  row('Net Fare',f.net)+row('GST ('+t.gst_rate+'%)',f.gst)+
  row(paid?'Amount Paid':'Total Payable',f.total,'paid')+
  '<div class="ticket41-booked-via">Booked via: <b>'+esc(t.source)+'</b></div></section>';
}
function policyCard(t){
 return '<section class="ticket41-policy"><div>'+icon('warning',21)+'</div><div><b>CANCELLATION POLICY</b><p>'+
  esc(t.cancellation_policy||'')+'</p></div></section>'+
  '<section class="ticket41-terms"><h3>TERMS &amp; CONDITIONS</h3><ul>'+
  (t.terms||[]).map(item=>'<li>'+esc(item)+'</li>').join('')+'</ul></section>';
}
function footer(t){
 const o=t.operator||{};
 return '<footer class="ticket41-footer"><div class="ticket41-footer-grid">'+
  '<section><h2>'+esc(o.name)+'</h2><p>'+esc(o.tagline)+'</p>'+
  (o.address?'<p>'+icon('pin',15)+' '+esc(o.address)+'</p>':'')+'</section>'+
  '<section><h4>COMPANY</h4>'+
  ['About Us','Contact','Terms & Conditions','Refund Policy','Privacy Policy','Delete My Data'].map(x=>
   '<p>'+icon('info',14)+' '+x+'</p>').join('')+'</section>'+
  '<section><h4>GET IN TOUCH</h4>'+
  (o.phone?'<p>'+icon('call',15)+' '+esc(o.phone)+'</p>':'')+
  (o.email?'<p>'+icon('email',15)+' '+esc(o.email)+'</p>':'')+
  '<p>'+icon('clock',15)+' Contact the operator for office timings</p></section></div>'+
  '<div class="ticket41-footer-pay"><span>'+icon('check',17)+' Secure Payments</span><span>24×7 Support</span></div>'+
  '<div class="ticket41-payment-marks"><b>VISA</b><b>Mastercard</b><b>UPI</b><b>RuPay</b><b>Net Banking</b></div>'+
  '<div class="ticket41-credit">© '+new Date().getFullYear()+' - '+esc(o.name)+
  '<span>Powered by JourneyOS GDS</span></div></footer>';
}
function ticketContent(s){
 const t=s.ticket;
 if(!t)return '<p class="ticket41-loading">'+esc(s.error||'Loading your ticket…')+'</p>';
 const count=(t.passengers||[]).length;
 return '<div class="ticket41-tools"><div><b>Get your ticket</b><p>Save a PDF copy, print it, or send it via WhatsApp.</p></div>'+
  '<div class="ticket41-buttons">'+
   '<button type="button" class="ticket41-btn ticket41-download" data-t41="download">'+icon('download')+' Download</button>'+
   '<button type="button" class="ticket41-btn ticket41-print" data-t41="print">'+icon('print')+' Print</button>'+
   '<button type="button" class="ticket41-btn ticket41-share" data-t41="share">'+icon('whatsapp')+' Share</button>'+
  '</div></div><article class="ticket41-paper">'+legalHeader(t)+
  '<div class="ticket41-booking"><div>'+detailVal('Booking ID',t.booking_id)+
   '<div class="ticket41-book-status"><span class="ticket41-label">Status</span><b>'+esc(t.status)+'</b>'+
   '<small>Booked: '+esc(t.booked_label)+'</small></div></div>'+
   '<div class="ticket41-right">'+detailVal('PNR',t.pnr)+
   '<div>'+detailVal('Service',t.service)+'<small>'+esc(t.coach)+'</small></div></div></div>'+
  tripCard(t)+fareCard(t)+policyCard(t)+'</article>'+footer(t);
}
function updateContent(s){
 const t=s.ticket;if(!t)return ticketContent(s);
 let inner='';
 if(s.choice==='stops'){
  const ps=s.stops||{},selected=s.pickup||t.boarding?.id,drop=s.drop||t.dropping?.id;
  const select=(title,list,val,id)=>'<label><span>'+title+'</span><select data-t41-select="'+id+'">'+
   (list||[]).map(x=>'<option value="'+esc(x.id)+'" '+(String(x.id)===String(val)?'selected':'')+'>'+
    esc(x.name)+(x.time?' - '+esc(x.time):'')+'</option>').join('')+'</select></label>';
  inner='<div class="ticket41-updateform"><h3>Change Pick-up &amp; Drop</h3>'+
    '<p>Select another permitted stop on the same service. Your seat and journey date remain unchanged.</p>'+
    '<div class="ticket41-formgrid">'+select('Pick-up point',ps.pickups,selected,'pickup')+
     select('Drop point',ps.drops,drop,'drop')+'</div>'+
    '<div class="ticket41-form-actions"><button data-t41="back" type="button">Back</button>'+
     '<button class="ticket41-btn ticket41-download" type="button" data-t41="save-stops" '+(s.busy?'disabled':'')+'>Save changes</button></div></div>';
 }else if(s.choice==='mobile'){
  inner='<div class="ticket41-updateform"><h3>Change Mobile</h3>'+
   '<p>Change the mobile number linked to this booking. No SMS or WhatsApp delivery is assumed.</p>'+
   '<label><span>Mobile number</span><input type="tel" inputmode="numeric" maxlength="10" data-t41-phone value="'+esc(s.phone||t.contact?.phone||'')+'" /></label>'+
   '<div class="ticket41-form-actions"><button data-t41="back" type="button">Back</button>'+
   '<button class="ticket41-btn ticket41-download" type="button" data-t41="save-mobile" '+(s.busy?'disabled':'')+'>Save changes</button></div></div>';
 }else{
  inner='<div class="ticket41-updatecards"><h4>EDIT MY TICKET</h4>'+
   '<button type="button" data-t41="change-stops" '+(!t.can_update?'disabled':'')+'>'+
    '<span class="ticket41-cardtitle">'+icon('pin',33)+' <b>Change Pick-up &amp; Drop</b></span>'+
    '<p>Pick a different stop on this trip.</p><strong>Choose '+icon('arrow',19)+'</strong></button>'+
   '<button type="button" data-t41="change-mobile" '+(!t.can_update?'disabled':'')+'>'+
    '<span class="ticket41-cardtitle">'+icon('phone',33)+' <b>Change Mobile</b></span>'+
    '<p>Send the ticket to a different mobile.</p><strong>Choose '+icon('arrow',19)+'</strong></button>'+
    (!t.can_update?'<p class="ticket41-readonly">Updates are available only to authorized staff for confirmed bookings.</p>':'')+
  '</div>';
 }
 return inner+footer(t);
}
function render(s){
 const t=s.ticket;
 const nav='<div class="ticket41-main">'+
  '<div class="ticket41-tabs" role="tablist" aria-label="Ticket and update">'+
   '<button type="button" role="tab" aria-selected="'+(s.tab==='ticket')+'" class="'+(s.tab==='ticket'?'active':'')+
    '" data-t41="tab-ticket">Ticket</button>'+
   '<button type="button" role="tab" aria-selected="'+(s.tab==='update')+'" class="'+(s.tab==='update'?'active':'')+
    '" data-t41="tab-update">Update</button></div>'+
  (s.tab==='ticket'?ticketContent(s):updateContent(s))+'</div>';
 s.root.classList.toggle('ticket41-dark',s.dark);
 s.root.classList.toggle('ticket41-is-update',s.tab==='update');
 s.root.innerHTML=top(s)+nav;
}
function authHeaders(){
 const h={'Authorization':'Bearer '+localStorage.getItem('token')};
 if(G.viewAs)h['X-View-As']=G.viewAs;
 return h;
}
function pdfUrl(s){
 return '/api/bookings/'+encodeURIComponent(s.pnr)+'/ticket/v41.pdf';
}
async function getPdf(s){
 if(s.cached)return s.cached;
 const r=await fetch(pdfUrl(s),{headers:authHeaders()});
 if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.message||'Unable to fetch PDF')}
 const blob=await r.blob();
 if(!blob.size||!blob.type.includes('pdf'))throw new Error('Ticket PDF is empty or invalid');
 s.cached=blob;return blob;
}
function download(s,blob){
 const href=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=href;a.download='ticket-'+String(s.ticket?.pnr||'booking').replace(/[^a-z0-9_-]/ig,'')+'.pdf';
 document.body.appendChild(a);a.click();a.remove();
 window.setTimeout(()=>URL.revokeObjectURL(href),60000);
}
async function documentAction(s,kind){
 try{
  const blob=await getPdf(s);
  if(kind==='download'){download(s,blob);return}
  if(kind==='print'){
   const href=URL.createObjectURL(blob);
   const frame=document.createElement('iframe');
   frame.title='Passenger ticket PDF for printing';frame.className='ticket41-print-frame';frame.src=href;
   frame.onload=()=>{try{frame.contentWindow?.focus();frame.contentWindow?.print()}catch(_){window.open(href,'_blank','noopener')}};
   document.body.appendChild(frame);
   window.setTimeout(()=>{frame.remove();URL.revokeObjectURL(href)},120000);return;
  }
  if(kind==='share'){
   const name='ticket-'+String(s.ticket?.pnr||'booking').replace(/[^a-z0-9_-]/ig,'')+'.pdf';
   const file=new File([blob],name,{type:'application/pdf'});
   if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){
    try{await navigator.share({title:'Ticket '+s.ticket.pnr,files:[file]})}
    catch(err){if(err.name!=='AbortError')G.toast('Share sheet unavailable: '+err.message,'warn')}
   }else{
    download(s,blob);
    G.toast('PDF downloaded. Attach it in WhatsApp or your preferred app.','warn');
   }
  }
 }catch(e){G.err(e)}
}
async function requestTicket(s){
 try{
  s.ticket=await G.get('/bookings/'+encodeURIComponent(s.pnr)+'/ticket/v41');s.error='';
 }catch(e){s.error=e.message;s.ticket=null}
 if(s.root.isConnected)render(s);
}
function open(pnr){
 if(active)active.close();
 const root=document.createElement('div'),wasFocused=document.activeElement;
 root.className='ticket41-overlay';root.setAttribute('role','dialog');root.setAttribute('aria-label','Passenger ticket preview');
 const old=document.body.style.overflow;document.body.style.overflow='hidden';
 document.body.appendChild(root);
 const s={root,pnr:String(pnr),ticket:null,tab:'ticket',choice:'',stops:null,pickup:'',drop:'',
  phone:'',dark:false,busy:false,cached:null,error:'',close:null};
 const onKey=e=>{if(e.key==='Escape')s.close()};
 s.close=()=>{
  root.remove();document.body.style.overflow=old;document.removeEventListener('keydown',onKey,true);
  if(active===s)active=null;wasFocused?.focus?.();
 };
 document.addEventListener('keydown',onKey,true);
 active=s;render(s);
 root.addEventListener('click',async event=>{
  const node=event.target.closest('[data-t41]');if(!node)return;
  const action=node.dataset.t41;
  if(action==='close')return s.close();
  if(action==='theme'){s.dark=!s.dark;render(s);return}
  if(action==='tab-ticket'){s.tab='ticket';s.choice='';render(s);return}
  if(action==='tab-update'){s.tab='update';s.choice='';render(s);return}
  if(action==='back'){s.choice='';render(s);return}
  if(action==='whatsapp'){
   const phone=String(s.ticket?.operator?.alternate_phone||s.ticket?.operator?.phone||'').replace(/\D/g,'');
   if(phone){window.open('https://wa.me/'+(phone.length===10?'91'+phone:phone),'_blank','noopener,noreferrer')}
   return;
  }
  if(['download','print','share'].includes(action))return documentAction(s,action);
  if(action==='change-mobile'){s.choice='mobile';s.phone=s.ticket?.contact?.phone||'';render(s);return}
  if(action==='change-stops'){
   try{s.stops=await G.get('/bookings/'+encodeURIComponent(s.pnr)+'/stops');
    s.pickup=s.ticket.boarding.id;s.drop=s.ticket.dropping.id;s.choice='stops';render(s);}
   catch(e){G.err(e)}return;
  }
  if(action==='save-mobile'){
   const phone=String(root.querySelector('[data-t41-phone]')?.value||'').trim();
   if(!/^[6-9]\d{9}$/.test(phone))return G.toast('Enter a valid 10-digit Indian mobile number','bad');
   s.busy=true;node.disabled=true;
   try{
    const c=s.ticket.contact||{};
    await G.put('/bookings/'+encodeURIComponent(s.pnr),{contact:{name:c.name||s.ticket.passengers[0]?.name||'Passenger',
     phone,email:c.email||''}});
    await requestTicket(s);s.cached=null;s.choice='';G.toast('Mobile number updated','ok');render(s);
   }catch(e){G.err(e)}finally{s.busy=false}
   return;
  }
  if(action==='save-stops'){
   const pickup=root.querySelector('[data-t41-select="pickup"]')?.value;
   const drop=root.querySelector('[data-t41-select="drop"]')?.value;
   if(!pickup||!drop)return G.toast('Select valid pickup and dropping points','bad');
   s.busy=true;node.disabled=true;
   try{
    await G.put('/bookings/'+encodeURIComponent(s.pnr),{boarding_stage_id:pickup,dropping_stage_id:drop});
    await requestTicket(s);s.cached=null;s.choice='';G.toast('Pickup and drop updated','ok');render(s);
   }catch(e){G.err(e)}finally{s.busy=false}
   return;
  }
 });
 requestTicket(s);
 return s;
}
window.TicketPrintV41={open,invoiceNotice,render,documentAction};
})();
