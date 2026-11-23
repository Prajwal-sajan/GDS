/* GDS v39 — Global timed booking notification from authenticated booking event feed.
 * Displayed throughout Trips / GDS / Team access; not an optimistic local toast. */
(function(){
'use strict';
if(!window.G)return;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={
 info:'<circle cx="12" cy="12" r="10"/><path d="M12 11v6m0-10h.01"/>',
 close:'<path d="M18 6 6 18M6 6l12 12"/>',
 bus:'<path d="M5 17V6a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v11M5 13h14M5 17h14M7 17v3m10-3v3M8 8h2m4 0h2"/>'
};
const icon=(key,size=22)=>'<svg viewBox="0 0 24 24" width="'+size+'" height="'+size+'" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[key]+'</svg>';
let cursor=null,active=false,timer=null,epoch=0,pollRunning=false;
const seen=new Set(),queue=[],shown=new Map(),DURATION=12000,MAX_VISIBLE=2;
function ensureHost(){
 let host=document.querySelector('#b39-booking-notices');
 if(!host){host=document.createElement('div');host.id='b39-booking-notices';
  host.className='b39-notice-stack';host.setAttribute('aria-label','New booking notifications');
  document.body.appendChild(host);}
 return host;
}
function toText(a){
 const vehicle=a.vehicle_registration||a.service||'Unassigned vehicle';
 return {
  title:(a.kind==='in_trip_booking'?'In-trip booking':'New booking')+' — '+vehicle,
  passenger:(a.passenger_name||'Passenger')+' · '+a.passenger_count+' seat'+(a.passenger_count===1?'':'s'),
  seats:(a.seats||[]).join(', ')
 };
}
function dismiss(id,instant=false){
 const data=shown.get(id);
 if(!data)return;
 shown.delete(id);
 if(data.tick)clearInterval(data.tick);
 if(data.timeout)clearTimeout(data.timeout);
 const card=data.card;
 if(instant){card.remove();pump();return;}
 card.classList.add('b39-exit');
 setTimeout(()=>{card.remove();pump()},200);
}
function show(a){
 const host=ensureHost(),t=toText(a);
 const id=String(a.id),card=document.createElement('section');
 card.className='b39-card';
 card.setAttribute('role','status');
 card.setAttribute('aria-label','New passenger booking '+t.passenger);
 card.innerHTML='<div class="b39-icon">'+icon('info',25)+'</div>'+
  '<div class="b39-copy"><div class="b39-title">'+esc(t.title)+'</div>'+
  '<div class="b39-line">'+esc(t.passenger)+'</div>'+
  '<div class="b39-line">Seat'+(a.seats?.length===1?'':'s')+': '+esc(t.seats)+'</div>'+
  '<div class="b39-line">Board: '+esc(a.boarding||'Not assigned')+'</div>'+
  '<div class="b39-line">Drop: '+esc(a.dropping||'Not assigned')+'</div>'+
  '<div class="b39-line">PNR: <button type="button" class="b39-pnr" data-b39-pnr>'+esc(a.ticket_number||a.pnr)+'</button></div></div>'+
  '<button class="b39-dismiss" type="button" data-b39-close title="Dismiss notification" aria-label="Dismiss booking notification">'+icon('close',21)+'</button>'+
  '<div class="b39-progress-rail" role="progressbar" aria-label="Time remaining before notification closes" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100">'+
  '<span class="b39-progress-fill"></span></div>';
 let left=DURATION,last=Date.now(),paused=false;
 const data={card,tick:null,timeout:null};
 shown.set(id,data);host.append(card);
 const close=()=>dismiss(id);
 card.querySelector('[data-b39-close]').addEventListener('click',close);
 card.querySelector('[data-b39-pnr]').addEventListener('click',()=>{
  close();
  if(typeof G.bookingModal==='function'&&G.user?.permissions?.includes('bookings.view_all')){
   Promise.resolve(G.bookingModal(a.pnr)).catch(G.err);
  }
 });
 const tick=()=>{
  const now=Date.now();const elapsed=Math.max(0,now-last);last=now;
  if(paused||document.hidden)return;
  left=Math.max(0,left-elapsed);
  const percent=Math.round(100*left/DURATION);
  const bar=card.querySelector('.b39-progress-fill'),rail=card.querySelector('.b39-progress-rail');
  if(bar)bar.style.width=percent+'%';
  if(rail)rail.setAttribute('aria-valuenow',String(percent));
  if(left<=0)dismiss(id);
 };
 card.addEventListener('mouseenter',()=>{paused=true;last=Date.now()});
 card.addEventListener('mouseleave',()=>{paused=false;last=Date.now()});
 card.addEventListener('focusin',()=>{paused=true;last=Date.now()});
 card.addEventListener('focusout',e=>{
  if(!card.contains(e.relatedTarget)){paused=false;last=Date.now();}
 });
 data.tick=setInterval(tick,125);
}
function pump(){
 while(active&&queue.length&&shown.size<MAX_VISIBLE)show(queue.shift());
}
function queueEvent(a){
 if(!a||!Number.isFinite(Number(a.id))||!a.pnr)return;
 const id=String(a.id);if(seen.has(id))return;seen.add(id);
 if(seen.size>500){const old=seen.values().next().value;seen.delete(old);}
 queue.push(a);if(queue.length>30)queue.shift();
 pump();
}
async function poll(){
 if(!active||pollRunning||!G.user?.permissions?.includes('bookings.view_all'))return;
 pollRunning=true;const me=epoch;
 try{
  const endpoint='/bookings/live-events-v39'+(cursor===null?'':'?since_id='+encodeURIComponent(cursor));
  const result=await G.get(endpoint);
  if(!active||epoch!==me)return;
  if(Array.isArray(result.events))result.events.forEach(queueEvent);
  if(Number.isFinite(Number(result.cursor)))cursor=String(result.cursor);
 }catch(error){
  // Session expiry is handled by the common client; transient offline failure
  // does not advance the cursor or create duplicate notifications.
 }finally{pollRunning=false}
}
function start(){
 stop();
 if(!G.user?.permissions?.includes('bookings.view_all'))return;
 active=true;epoch++;cursor=null;ensureHost();
 poll().then(()=>{if(active&&!timer)timer=setInterval(poll,3000)});
}
function stop(){
 active=false;epoch++;if(timer){clearInterval(timer);timer=null;}
 cursor=null;queue.length=0;seen.clear();
 for(const id of [...shown.keys()])dismiss(id,true);
 document.querySelector('#b39-booking-notices')?.remove();
}
window.BookingNoticeV39={start,stop,queueEvent,toText,visible:()=>shown.size,
 cursor:()=>cursor};
})();