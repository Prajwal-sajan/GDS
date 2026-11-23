/* v35 · Single-source read-only passenger communication history modal.
 * Uses server-authorized booking/channel access and provider-evidenced statuses. */
(function(){
'use strict';
if(!window.G||G.showTripCommunicationHistory)return;
const E=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={
 close:'<path d="M18 6 6 18M6 6l12 12"/>',
 phone:'<path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 2.08 4.18 2 2 0 0 1 4.08 2h3a2 2 0 0 1 2 1.72l.5 3.18a2 2 0 0 1-.56 1.76L7.1 10.5a16 16 0 0 0 6.4 6.4l1.84-1.92a2 2 0 0 1 1.76-.56l3.18.5A2 2 0 0 1 22 16.92Z"/>',
 whatsapp:'<path d="M20 11c0 5-3.5 8.5-8.5 8.5a10 10 0 0 1-4-.9L3 20l1.4-4.5A9 9 0 1 1 20 11Z"/>',
 sms:'<rect x="3.5" y="5" width="17" height="14" rx="1"/>',
 app:'<path d="M21 11a8 8 0 0 1-8 8H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v4Z"/>',
 email:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 7 9-7"/>',
 other:'<circle cx="12" cy="12" r="9"/><path d="M8 12h8m-4-4v8"/>',
 outgoing:'<path d="M5 19 19 5M8 5h11v11"/>',
 incoming:'<path d="M19 5 5 19m11 0H5V8"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
 warning:'<path d="m12 2 10 19H2L12 2Zm0 7v5m0 3h.01"/>'
};
function svg(k){return '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(icons[k]||icons.sms)+'</svg>';}
function dateStamp(raw){
 if(!raw)return '—';
 const d=new Date(raw);if(!Number.isFinite(d.getTime()))return '—';
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',
  day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(d);
 const pick=k=>parts.find(x=>x.type===k)?.value||'00';
 return pick('day')+'-'+pick('month')+'-'+pick('year')+' '+pick('hour')+':'+pick('minute')+':'+pick('second');
}
const duration=s=>s==null||!Number.isFinite(Number(s))||Number(s)===0?'—':Math.floor(Number(s)/60)+':'+String(Math.floor(Number(s)%60)).padStart(2,'0');
function tagStatus(status){
 const s=String(status||'Recorded');
 const variant=/^read$/i.test(s)?'read':/^sent$/i.test(s)?'sent':/^delivered$/i.test(s)?'delivered':
  /^received$/i.test(s)?'received':/fail|undeliver|missed|busy/i.test(s)?'failed':'neutral';
 return '<span class="ch35-status ch35-'+variant+'">'+E(s)+'</span>';
}
function row(x){
 const ch=['calls','whatsapp','sms','app','email'].includes(x.channel)?x.channel:'other';
 const type=ch==='calls'?'Call':ch==='sms'?'SMS':ch==='whatsapp'?'WhatsApp':ch==='app'?'App':ch==='email'?'Email':'Other';
 const direction=x.direction==='outgoing'?'Outgoing':x.direction==='incoming'?'Incoming':'—';
 const showDirection=x.direction==='outgoing'||x.direction==='incoming';
 return '<tr>'+
 '<td><span class="ch35-type ch35-'+ch+'">'+svg(ch)+'<b>'+type+'</b></span></td>'+
 '<td>'+(showDirection?'<span class="ch35-direction '+x.direction+'">'+svg(x.direction)+E(direction)+'</span>':'—')+'</td>'+
 '<td class="ch35-nowrap">'+E(dateStamp(x.timestamp))+'</td>'+
 '<td><span class="ch35-message-type">'+E(x.message_type||'Unknown')+'</span>'+
 (x.from?'<small>'+E(x.from)+'</small>':'')+'</td>'+
 '<td>'+E(x.contact_to||'—')+'</td>'+
 '<td>'+tagStatus(x.status)+'</td>'+
 '<td class="ch35-nowrap">'+E(duration(x.duration_s))+'</td>'+
 '<td class="ch35-additional" title="'+E(x.additional_info||'')+'">'+(x.additional_info?E(x.additional_info):'—')+'</td>'+
 '</tr>';
}
const tabs=[['all','All',null],['calls','Calls','phone'],['whatsapp','WhatsApp','whatsapp'],['sms','SMS','sms']];
function tabMarkup(summary,active){
 return tabs.map(([channel,label,ico])=>{
  const count=summary.counts?.[channel]??0;
  const permitted=channel==='all'||summary.permissions?.[channel]!==false;
  return '<button type="button" role="tab" aria-selected="'+String(active===channel)+'" class="ch35-tab'+(active===channel?' active':'')+
   '" data-ch35-tab="'+channel+'" '+(permitted?'':'disabled title="Channel history is not permitted for your role"')+'>'+
   (ico?svg(ico):'<span class="ch35-tab-spacer"></span>')+
   '<span>'+label+' ('+E(count)+')</span></button>';
 }).join('');
}
function table(rows){
 return '<table class="ch35-table"><thead><tr>'+
 ['TYPE','DIRECTION','TIMESTAMP','MESSAGE TYPE / FROM','CONTACT / TO','STATUS','DURATION','ADDITIONAL INFO'].map(t=>'<th scope="col">'+t+'</th>').join('')+
 '</tr></thead><tbody>'+rows.map(row).join('')+'</tbody></table>';
}
function view(){
 return '<nav role="tablist" aria-label="Communication channel" data-ch35-tabs class="ch35-tabs"></nav>'+
 '<div class="ch35-scroll" data-ch35-scroll>'+
 '<div data-ch35-results class="ch35-results" role="tabpanel" aria-live="polite"></div>'+
 '<div class="ch35-page-actions" data-ch35-more-wrap hidden><button type="button" data-ch35-more>Load more records</button></div></div>';
}
G.showTripCommunicationHistory=async function({sid,pnr,seat,focusReturn}={}){
 if(!sid||!pnr)throw Error('Select a passenger booking first');
 const endpoint='/trips/'+encodeURIComponent(String(sid))+'/passengers/'+encodeURIComponent(String(pnr))+'/communications';
 // Authorization and booking scoping happen before the modal is opened.
 const seatParam=seat?'&seat='+encodeURIComponent(String(seat)):'';
 const first=await G.get(endpoint+'?channel=all&page=1&limit=100'+seatParam);
 const passenger=first.passenger||{},subtitle=
  E(passenger.name||'Passenger')+' &nbsp; PNR: '+E(passenger.pnr||pnr)+' &nbsp; • &nbsp; '+E(passenger.phone_masked||'—');
 const modal=G.modal({title:'<div class="ch35-title"><strong>Communication History</strong><small>'+subtitle+'</small></div>',
  size:'xl',body:view()});
 const overlay=modal.el;
 overlay.classList.add('ch35-overlay');
 const box=modal.$('.md');box?.setAttribute('role','dialog');box?.setAttribute('aria-modal','true');
 box?.setAttribute('aria-label','Communication History for '+String(passenger.name||'passenger'));
 const closeButton=modal.$('[data-x]');
 if(closeButton){closeButton.innerHTML=svg('close');closeButton.setAttribute('aria-label','Close Communication History');closeButton.title='Close';}
 const tabsNode=modal.$('[data-ch35-tabs]');
 const results=modal.$('[data-ch35-results]');
 const scroll=modal.$('[data-ch35-scroll]');
 const more=modal.$('[data-ch35-more]'),moreWrap=modal.$('[data-ch35-more-wrap]');
 let channel='all',page=1,hasMore=first.has_more,loading=false,sequence=0;
 const counts=first;
 function activate(ch){
  channel=ch;
  tabsNode.innerHTML=tabMarkup(counts,ch);
  [...tabsNode.querySelectorAll('[role="tab"]')].forEach((b,i)=>b.tabIndex=ch===b.dataset.ch35Tab?0:-1);
 }
 function paint(data,append){
  const before=append?results.querySelector('tbody'):null;
  if(append&&before)before.insertAdjacentHTML('beforeend',data.rows.map(row).join(''));
  else results.innerHTML=data.rows.length?table(data.rows):
   '<div class="ch35-empty">'+svg('whatsapp')+'<p>No recorded '+E(channel==='all'?'communications':channel)+' for this passenger.</p></div>';
  hasMore=Boolean(data.has_more);
  moreWrap.hidden=!hasMore;
  page=Number(data.page)||1;
 }
 async function load(ch,append=false){
  if(loading)return;
  const n=++sequence;loading=true;more.disabled=true;
  if(!append)results.innerHTML='<div class="ch35-loading" role="status">Loading communication records…</div>';
  try{
   const url=endpoint+'?channel='+encodeURIComponent(ch)+'&page='+(append?page+1:1)+'&limit=100'+seatParam;
   const next=await G.get(url);
   if(n!==sequence||!overlay.isConnected)return;
   paint(next,append);
   if(!append)scroll.scrollTop=0;
  }catch(e){
   if(!overlay.isConnected)return;
   if(append){G.err(e);}else results.innerHTML='<div class="ch35-empty error">'+svg('warning')+
     '<p>'+E(e.message||'Unable to load history')+'</p>'+
     '<button type="button" data-ch35-retry>Retry</button></div>';
  }finally{loading=false;more.disabled=false;}
 }
 activate('all');paint(first,false);
 tabsNode.addEventListener('click',e=>{
  const btn=e.target.closest('[data-ch35-tab]');
  if(!btn||btn.disabled||btn.dataset.ch35Tab===channel)return;
  activate(btn.dataset.ch35Tab);load(channel);
 });
 tabsNode.addEventListener('keydown',e=>{
  if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;
  e.preventDefault();
  const allowed=[...tabsNode.querySelectorAll('[role="tab"]:not([disabled])')];
  const i=allowed.findIndex(x=>x.dataset.ch35Tab===channel);
  const next=e.key==='Home'?0:e.key==='End'?allowed.length-1:
    (i+(e.key==='ArrowRight'?1:-1)+allowed.length)%allowed.length;
  allowed[next]?.focus();allowed[next]?.click();
 });
 results.addEventListener('click',e=>{if(e.target.closest('[data-ch35-retry]'))load(channel);});
 more.onclick=()=>load(channel,true);
 const keyHandler=e=>{if(!overlay.isConnected){document.removeEventListener('keydown',keyHandler);return;}
  if(e.key==='Escape'){e.preventDefault();document.removeEventListener('keydown',keyHandler);modal.close();focusReturn?.focus?.();}};
 document.addEventListener('keydown',keyHandler);
 if(closeButton)closeButton.onclick=()=>{
  document.removeEventListener('keydown',keyHandler);modal.close();focusReturn?.focus?.();
 };
 closeButton?.focus();
 return modal;
};
G.communicationHistoryV35={row,dateStamp,duration,tabMarkup};
})();
