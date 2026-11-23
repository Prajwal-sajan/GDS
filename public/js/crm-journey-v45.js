/* CRM current journey v45 — data-driven screenshot-aligned seat map. */
(function(root){
'use strict';
const E=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>Number.isFinite(Number(v))?Number(v):0;
const statuses=Object.freeze({available:'Available',booked_male:'Booked · male',booked_female:'Booked · female',hold:'On hold',blocked:'Blocked',no_show:'No show',other_leg:'Booked on another leg',selected:'Current passenger seat'});
const activeSeats=b=>new Set((b.passengers||[]).filter(p=>p.status!=='cancelled'&&p.seat!=null).map(p=>String(p.seat)));
function projection(d){
 const seats=d.seats||[];
 const mixed=d.deck==='LOWER'&&Number(d.cols)===4&&
   seats.some(s=>s.type==='sleeper'&&Number(s.col)===3)&&
   seats.some(s=>s.type==='seater'&&[0,1].includes(Number(s.col)))&&
   seats.every(s=>s.type==='sleeper'?Number(s.col)===3:s.type==='seater'&&[0,1].includes(Number(s.col)));
 if(mixed)return{kind:'reference-mixed',cols:4,pos:s=>s.type==='sleeper'?1:Number(s.col)+3};
 const upper=d.deck==='UPPER'&&Number(d.cols)===4&&seats.length>0&&
   seats.every(s=>s.type==='sleeper'&&[0,1,3].includes(Number(s.col)));
 if(upper)return{kind:'reference-upper',cols:4,pos:s=>Number(s.col)===3?1:Number(s.col)===1?3:4};
 return{kind:'source',cols:Math.max(1,Math.min(12,n(d.cols)||4)),pos:s=>n(s.col)+1};
}
function seatStatus(s,b,active){
 if(b.status!=='cancelled'&&b.status!=='released'&&active.has(String(s.code))&&s.booking?.is_current)return'selected';
 return Object.prototype.hasOwnProperty.call(statuses,s.status)?s.status:'available';
}
const steering='<svg class="cv8-wheel-svg" viewBox="0 0 46 46" fill="none" aria-hidden="true"><circle cx="23" cy="23" r="20" fill="#062961" stroke="#e4f6ff" stroke-width="2"/><circle cx="23" cy="23" r="15" stroke="#65a8ff" stroke-width="2"/><circle cx="23" cy="23" r="5.5" fill="#e6f3ff" stroke="#ffffff" stroke-width="1.5"/><path d="M23 17 17 7M17 26 7 33M29 26 39 33" stroke="#f8fcff" stroke-width="4" stroke-linecap="round"/></svg>';
const emergency='<svg class="cv8-emergency-svg" viewBox="0 0 46 44" aria-hidden="true" fill="none" stroke="#eb232b" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="17" cy="7" r="3.2" fill="#eb232b" stroke="none"/><path d="m18 12-4 9 8 5 3 10M16 19l-8 5-3 8M14 22l9-1 5-6M32 9h10v29H32zM26 38h18"/></svg>';
function tile(s,b,proj,active){
 if(!s||!s.code)return'';
 const state=seatStatus(s,b,active),long=s.type==='sleeper'||n(s.h)>1;
 const row=Math.max(1,Math.min(120,n(s.row)+1)),col=Math.max(1,Math.min(proj.cols,proj.pos(s)));
 const h=Math.max(1,Math.min(8,n(s.h)||1)),w=Math.max(1,Math.min(proj.cols-col+1,n(s.w)||1));
 const count=Math.max(0,Math.min(999,Math.round(n(s.reservation_count))));
 const fare=Number.isFinite(Number(s.fare))?Math.round(Number(s.fare)):null;
 const description='Seat '+s.code+' · '+statuses[state]+(fare===null?'':' · ₹'+fare)+(count?' · '+count+' reservation'+(count===1?'':'s')+' across the service':'');
 const countEl=count?'<span class="cv8-seat-count'+(long?' bottom':'')+'" aria-hidden="true">×'+count+'</span>':'';
 return '<button type="button" class="cv8-seat cv8-v45-seat '+(long?'cv8-berth':'cv8-chair')+' '+E(state)+'" '+
  'style="grid-row:'+row+'/span '+h+';grid-column:'+col+'/span '+w+'" '+
  'data-cv8-seat="'+E(s.code)+'" data-cv8-seat-status="'+E(state)+'" aria-label="'+E(description)+'" title="'+E(description)+'">'+
  (long?'<span class="cv8-seat-fare">'+(fare===null?'—':fare)+'</span><strong>'+E(s.code)+'</strong>'+countEl:
  '<strong>'+E(s.code)+'</strong>'+(fare===null?'':'<span class="cv8-seat-fare">'+fare+'</span>')+countEl)+
  '</button>';
}
function deckHtml(deck,b){
 const proj=projection(deck),rows=Math.max(1,Math.min(120,n(deck.rows)||12)),active=activeSeats(b),lower=deck.deck==='LOWER';
 return '<section class="cv8-deck cv8-v45-deck '+(lower?'cv8-deck-lower':'cv8-deck-upper')+' '+proj.kind+'" aria-label="'+E(deck.deck)+' deck">'+
 '<div class="cv8-deck-title"><strong>'+E(deck.deck)+'</strong>'+(lower?'<span class="cv8-wheel" aria-label="Driver steering wheel">'+steering+'</span>':'')+'</div>'+
 '<div class="cv8-seatgrid" style="--cv8-columns:'+proj.cols+';--cv8-rows:'+rows+';grid-template-columns:repeat('+proj.cols+',minmax(0,1fr));grid-template-rows:repeat('+rows+',44px)">'+
 (deck.seats||[]).map(s=>tile(s,b,proj,active)).join('')+'</div>'+
 (lower?'<span class="cv8-emergency" title="Emergency exit" aria-label="Emergency exit">'+emergency+'</span><span class="cv8-exit" title="Door" aria-label="Door"></span>':'')+'</section>';
}
function mapHtml(map,b){
 if(!map?.decks?.length)return'<div class="cv8-unavailable">Seat layout unavailable for this booking.</div>';
 const decks=[...map.decks].sort((a,z)=>a.deck==='LOWER'?-1:z.deck==='LOWER'?1:0);
 return decks.map(d=>deckHtml(d,b)).join('');
}
root.CRMJourneyV45={mapHtml,deckHtml,projection,seatStatus,statuses,activeSeats};
})(typeof window!=='undefined'?window:globalThis);
