/* v39 Trips loyalty upgrade badge and consent-backed operator workflow */
(function(){
'use strict';
if(!window.G)return;
const E=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const paths={
 sparkle:'<path d="m12 2 2.1 6.1L20 10l-5.9 2.1L12 18l-2.1-5.9L4 10l5.9-1.9L12 2Z"/><path d="m20 15 .8 2.2L23 18l-2.2.8L20 21l-.8-2.2L17 18l2.2-.8L20 15Z"/>',
 ticket:'<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M8 7v10m8-10v10"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
 arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>'
};
const I=(k,sz=15)=>'<svg aria-hidden="true" viewBox="0 0 24 24" width="'+sz+'" height="'+sz+'" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round">'+paths[k]+'</svg>';
function badge(p){
 const u=p?.seat_upgrade;
 if(!u||!['offered','applied','declined','expired'].includes(u.status))return '';
 const expired=u.status==='offered'&&Date.parse(u.expires_at||0)<=Date.now();
 const status=expired?'expired':u.status;
 const title=status==='offered'?'Pending loyalty upgrade offer — seat not changed':
  status==='applied'?'Loyalty upgrade applied with recorded passenger consent':
  status==='declined'?'Passenger declined seat upgrade':'Seat upgrade offer expired';
 const label=status==='offered'?'OFFERED':status==='applied'?'UPGRADED':
   status==='declined'?'DECLINED':'EXPIRED';
 return '<span class="lv39-upgrade-badge '+status+'" title="'+E(title)+
  '" aria-label="'+E(title+' from '+u.from_seat+' to '+u.to_seat)+'">'+
  I(status==='applied'?'check':status==='offered'?'sparkle':'clock')+
  E(label)+' '+E(u.from_seat)+' → '+E(u.to_seat)+'</span>';
}
function control(p){
 if(!G.user?.permissions?.includes('bookings.modify')||p.status==='cancelled')return '';
 return '<button type="button" class="lv39-offer-control" data-trip-loyalty-upgrade="1"'+
  ' title="Review loyalty upgrade / record passenger consent" aria-label="Open seat upgrade for '+E(p.name)+'">'+
  I('sparkle')+' Upgrade</button>';
}
async function open({sid,pnr,seat,onDone}={}){
 if(!sid||!pnr||!seat)throw Error('Choose a passenger seat to manage the loyalty upgrade');
 if(!G.user?.permissions?.includes('bookings.modify'))throw Error('You do not have seat upgrade permission');
 const url='/trips/'+encodeURIComponent(sid)+'/loyalty-upgrades/'+encodeURIComponent(pnr)+'/'+encodeURIComponent(seat);
 let r=await G.get(url);
 let modal=null,busy=false;
 function render(){
  if(!modal)return;
  const a=r.offer||{},isOffer=a.status==='offered'&&Date.parse(a.expires_at)>Date.now(),isApplied=a.status==='applied';
  const title=isOffer?'OFFERED':isApplied?'UPGRADED':a.status==='declined'?'Declined':
   a.status==='expired'||a.status==='offered'?'Expired':'New offer';
  const html='<div class="lv39-upgrade-details"><div><strong>PNR:</strong> '+E(r.pnr)+'</div>'+
   '<div><strong>Current seat:</strong> '+E(r.current_seat)+'</div>'+
   '<div><strong>Passenger:</strong> eligible loyalty tier required; upgrade is free</div></div>'+
   (a.status?'<div class="lv39-upgrade-state '+(isApplied?'applied':'')+'">'+
      I(isApplied?'check':'sparkle',19)+' <strong>'+E(title)+'</strong>&nbsp;'+
      E(a.from_seat||'')+' → '+E(a.to_seat||'')+'</div>':'')+
   (isOffer?'<p>Offer expires: <strong>'+E(new Date(a.expires_at).toLocaleTimeString('en-IN'))+
       '</strong>. The original seat is retained until accepted.</p>'+
      '<p class="lv39-upgrade-note">Before applying the new berth, obtain and record passenger consent. An operator assertion is not independent proof of provider delivery.</p>':
    isApplied?'<p class="lv39-upgrade-note">The seat was changed after recorded consent. Previous: '+E(a.from_seat)+
     ' · New: '+E(a.to_seat)+'.</p>':
    '<p>'+E(r.reason||'Available upgrade choices')+'</p>'+
     (r.options?.length?'<div class="lv39-upgrade-target" role="radiogroup" aria-label="Available free upgraded seats">'+
       r.options.map((o,i)=>'<label><input type="radio" name="lv39-target" value="'+E(o.seat)+
        '" '+(i===0?'checked':'')+'/> '+I('ticket')+' <span><strong>'+E(o.seat)+
        '</strong><small> '+E(o.deck||'')+'</small></span></label>').join('')+
        '</div>':'<div class="lv39-upgrade-note">No eligible unsold seat is available at this time.</div>'))+
   '<div class="lv39-upgrade-actions"><button type="button" data-lv39-close>Close</button>'+
    (isOffer?'<button type="button" class="danger" data-lv39-decline>Decline offer</button>'+
     '<button type="button" class="primary" data-lv39-accept>Record acceptance</button>':
     !isApplied&&r.options?.length?'<button type="button" class="primary" data-lv39-offer>'+
      I('sparkle')+' Offer selected berth</button>':'')+'</div>';
  modal.$('.bd').innerHTML=html;
 }
 async function run(fn){
  if(busy)return;
  busy=true;
  try{await fn();}
  catch(e){G.err(e)}
  finally{busy=false}
 }
 modal=G.modal({title:I('sparkle',21)+' Loyalty Seat Upgrade',size:'lg',body:'<p>Loading available upgrade seats…</p>'});
 modal.el.classList.add('lv39-upgrade-modal');
 render();
 modal.el.addEventListener('click',event=>{
  const btn=event.target.closest('[data-lv39-close],[data-lv39-offer],[data-lv39-accept],[data-lv39-decline]');
  if(!btn)return;
  if(btn.hasAttribute('data-lv39-close')){modal.close();return;}
  run(async()=>{
   if(btn.hasAttribute('data-lv39-offer')){
    const selected=modal.$('input[name="lv39-target"]:checked');
    if(!selected)return G.toast('Select an available upgrade berth','warn');
    const confirmed=await G.confirm('Offer a free loyalty upgrade from '+r.current_seat+
     ' to '+selected.value+'? The original seat remains unchanged until passenger consent.',{ok:'Offer upgrade'});
    if(!confirmed)return;
    await G.post(url+'/offer',{target_seat:selected.value});
    G.toast('Loyalty upgrade offered; no seat was changed','ok');
   }
   if(btn.hasAttribute('data-lv39-accept')){
    const v=await G.prompt('Record passenger consent',[
     {name:'method',label:'Consent method',type:'select',options:[
      ['phone','Passenger phone call'],['chat','Passenger chat'],
      ['in_person','Passenger in person'],['authorized_provider','Authorized provider confirmation']]},
     {name:'reference',label:'Consent evidence / conversation reference',required:true,full:true}
    ],{ok:'Review upgrade'});
    if(!v)return;
    const yes=await G.confirm('Passenger consent confirmed? This will move the booked seat from '+
     r.offer.from_seat+' to '+r.offer.to_seat+'. This affects live inventory.',{ok:'Apply seat upgrade'});
    if(!yes)return;
    await G.post(url+'/accept',{consent_confirmed:true,consent_method:v.method,
      consent_reference:v.reference});
    G.toast('Passenger seat upgrade applied and audited','ok');
   }
   if(btn.hasAttribute('data-lv39-decline')){
    const yes=await G.confirm('Mark this loyalty upgrade offer as declined?',{ok:'Decline offer'});
    if(!yes)return;
    await G.post(url+'/decline',{reason:'Declined by passenger (operator recorded)'});
    G.toast('Upgrade offer declined','ok');
   }
   r=await G.get(url);
   render();
   if(typeof onDone==='function')await onDone();
  });
 });
 return modal;
}
G.loyaltyUpgradeBadgeV39=badge;
G.loyaltyUpgradeControlV39=control;
G.openLoyaltyUpgradeV39=open;
})();