/* Configuration v31 booked-seat colour/ring display.
   This affects internal Book/Manage layouts only; passenger/copy views keep defaults. */
(function(){
'use strict';
if(!window.G||typeof G.renderSeats!=='function')return;
const original=G.renderSeats;
const defaultColors={
 male:'#458bff',female:'#f04b9d',not_given:'#df393f',branch:'#8552f6',
 mine:'#0aaac0',my_branch:'#79b71d',agent:'#e2a51e',
 online_otas:'#9aadc3',website:'#a7a9c5',other:'#b8c5d4'
};
let loading=null;
G.refreshSeatLegend=async function(force=false){
 if(G._seatLegendLoaded&&!force)return G._seatLegend;
 if(loading)return loading;
 loading=G.get('/settings/config-v30/seat-display').then(result=>{
  G._seatLegend=result?.seat_legends||null;
  G._seatLegendLoaded=true;
  return G._seatLegend;
 }).catch(()=>{
  G._seatLegendLoaded=false;
  return null;
 }).finally(()=>{loading=null;});
 return loading;
};
function backgroundText(color){
 const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255);
 return rgb.reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0)>.60?'#18243d':'#ffffff';
}
function channel(seat,cfg){
 const b=seat.booking;
 if(!b)return null;
 const chosen=cfg.ring_channels||[];
 if(b.is_mine&&chosen.includes('mine'))return 'mine';
 if(b.is_my_branch&&chosen.includes('my_branch'))return 'my_branch';
 const source=String(b.source||'').toLowerCase();
 let key='other';
 if(source==='branch'||source==='phone')key='branch';
 else if(source==='agent')key='agent';
 else if(source==='website')key='website';
 else if(['redbus','abhibus','paytm','ota','online'].includes(source))key='online_otas';
 if(chosen.includes(key))return key;
 return null;
}
G.renderSeats=function(map,selected=[]){
 const markup=original.call(this,map,selected);
 const cfg=G._seatLegend;
 if(!cfg||!map?.decks||typeof document==='undefined')return markup;
 const template=document.createElement('template');template.innerHTML=markup;
 const colors={...defaultColors,...(cfg.colors||{})};
 const all=map.decks.flatMap(d=>d.seats||[]);
 const domSeats=[...template.content.querySelectorAll('[data-seat]')];
 const byCode=new Map(all.map(s=>[String(s.code),s]));
 for(const el of domSeats){
  const seat=byCode.get(el.dataset.seat);
  if(!seat||selected.includes(seat.code)||!['booked_male','booked_female'].includes(seat.status))continue;
  let category=null;
  if(cfg.fill_seats_by==='gender')category=seat.booking?.gender==='F'?'female':seat.booking?.gender==='M'?'male':'not_given';
  else if(cfg.fill_seats_by==='booking_channel'){
   const source=String(seat.booking?.source||'').toLowerCase();
   category=source==='branch'||source==='phone'?'branch':source==='agent'?'agent':source==='website'?'website':
    ['redbus','abhibus','paytm','ota','online'].includes(source)?'online_otas':'other';
  }
  if(category&&colors[category]){
   el.style.backgroundColor=colors[category];el.style.borderColor=colors[category];
   el.style.color=backgroundText(colors[category]); // legible on user-selected swatches
  }else if(cfg.fill_seats_by==='none'){
   el.style.backgroundColor='#fff';el.style.borderColor='#94a3b8';el.style.color='#334155';
  }
  if(cfg.outer_ring_by==='booking_channel'){
   const ring=channel(seat,cfg);
   if(ring&&colors[ring])el.style.boxShadow='0 0 0 3px '+colors[ring];
  }
 }
 if(cfg.fill_seats_by==='gender'){
  const legend=template.content.querySelector('.legend');
  if(legend){
   const extra=document.createElement('span');
   extra.textContent='Seat colours: Male / Female / Not given';
   extra.title='Gender colours are configurable in Settings > Configuration > Seat legends';
   legend.appendChild(extra);
  }
 }
 return template.innerHTML;
};
if(typeof G.bookingConsole==='function'){
 const previous=G.bookingConsole;
 G.bookingConsole=async function(...args){
  await G.refreshSeatLegend();
  return previous.apply(this,args);
 };
}
})();
