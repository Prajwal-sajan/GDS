/* Settings → Loyalty Program & Switch User v34.
 * Pixel-oriented reconstruction of five uploaded screenshots, backed by
 * validated settings and restricted server-side view-as. */
(function(){
'use strict';
if(!window.G||!G.screens?.settings)return;
const previous=G.screens.settings;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={
 spark:'<path d="m12 2 2.2 7.3L21 12l-6.8 2.7L12 22l-2.2-7.3L3 12l6.8-2.7L12 2zM19 2v4m-2-2h4"/>',
 gift:'<rect x="3" y="9" width="18" height="12" rx="2"/><path d="M12 9v12M3 13h18M12 9H6a3 3 0 1 1 3-3c1 2 3 3 3 3Zm0 0h6a3 3 0 1 0-3-3c-1 2-3 3-3 3Z"/>',
 upgrade:'<path d="m6 19 5-5-5-5M12 18h9M12 14h9M12 10h9M3 4v13"/>',
 coins:'<circle cx="9" cy="9" r="6"/><path d="M12 12a7 7 0 1 1-7 7M7 6h2a2 2 0 0 1 0 4H7m2 0 2 2"/>',
 percent:'<path d="M5 19 19 5"/><circle cx="6.5" cy="6.5" r="2"/><circle cx="17.5" cy="17.5" r="2"/>',
 crown:'<path d="m3 7 4 4 5-7 5 7 4-4-2 12H5L3 7z"/>',
 medal:'<circle cx="12" cy="8" r="5"/><path d="m8 12-2 9 6-4 6 4-2-9"/>',
 diamond:'<path d="M4 9 8 3h8l4 6-8 13L4 9zM4 9h16M8 3l4 19L16 3"/>',
 award:'<circle cx="12" cy="8" r="5"/><path d="m8 12-1 9 5-3 5 3-1-9"/>',
 calendar:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M7 2v4m10-4v4M3 9h18M9 13h6m-6 3h6"/>',
 save:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 3v6h8V3M7 21v-9h10v9"/>',
 play:'<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4V8z"/>',
 arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
 back:'<path d="m15 18-6-6 6-6M9 12h13"/>',
 person:'<circle cx="10" cy="8" r="4"/><path d="M3 22v-2a7 7 0 0 1 14 0v2M19 8h3m-1.5-1.5v3"/>',
 close:'<path d="M5 5 19 19M19 5 5 19"/>',
 trash:'<path d="M4 7h16M10 7V4h4v3M6 7l1 14h10l1-14M10 11v6m4-6v6"/>'
};
const ico=k=>'<svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+paths[k]+'</svg>';
const badge=(symbol,color='orange')=>'<span class="lv34-icon lv34-'+color+'">'+ico(symbol)+'</span>';
const DAILY=[['MON',1],['TUE',2],['WED',3],['THU',4],['FRI',5],['SAT',6],['SUN',0]];
const TIERS=[['Bronze','medal'],['Gold','crown'],['Platinum','diamond'],['Silver','award']];
const num=(x,d=0)=>Number(x??d);
let current=null,config=null;
function notice(section,text,kind='info'){
 const n=current?.querySelector('[data-lv34-notice="'+section+'"]');
 if(n){n.hidden=false;n.dataset.tone=kind;n.textContent=text;}
}
const state=kind=>kind?'lv34-on':'';
function toggle(name,on,section){
 return '<button class="lv34-toggle '+state(on)+'" type="button" role="switch" aria-checked="'+String(Boolean(on))+'" data-lv34-toggle="'+name+'" data-lv34-section="'+section+'" aria-label="'+(name==='program'?'Enable Loyalty Program':'Enable Seat Upgrades')+'"><i></i></button>';
}
function label(text){
 return '<label class="lv34-field-label"><span class="lv34-dot"></span>'+esc(text)+'</label>';
}
function numberField(name,title,value,prefix='',suffix='',step='any'){
 const id='lv34-'+name;
 return '<div class="lv34-field"><label for="'+id+'">'+label(title)+'</label>'+
 '<div class="lv34-input-shell">'+(prefix?'<span class="lv34-unit lv34-prefix">'+esc(prefix)+'</span>':'')+
 '<input id="'+id+'" name="'+esc(name)+'" type="number" min="0" step="'+esc(step)+'" value="'+esc(value)+'" required>'+
 (suffix?'<span class="lv34-unit lv34-suffix">'+esc(suffix)+'</span>':'')+'</div></div>';
}
function panel(section,title,description,icoName,content,withSave=true){
 return '<section class="lv34-panel" data-lv34-panel="'+esc(section)+'"><header class="lv34-panel-head">'+badge(icoName,section)+
 '<div class="lv34-panel-caption"><h2>'+esc(title)+'</h2>'+(description?'<p>'+esc(description)+'</p>':'')+'</div>'+
 (withSave?'<button type="button" class="lv34-save" data-lv34-save="'+esc(section)+'">'+ico('save')+' Save</button>':'')+
 '</header><div class="lv34-panel-body">'+content+
 '<div class="lv34-notice" data-lv34-notice="'+esc(section)+'" aria-live="polite" role="status" hidden></div></div></section>';
}
function general(data){
 const x=data.general;
 return panel('general','General Settings','', 'coins',
 '<div class="lv34-general-grid">'+
 numberField('miles_to_rupee_ratio','Value per Mile (₹)',x.miles_to_rupee_ratio,'₹','','0.0001')+
 numberField('max_discount_percent','Max Discount (%)',x.max_discount_percent,'','%','1')+
 '<p class="lv34-hint">How much discount 1 mile gives</p><p class="lv34-hint">Maximum % of ticket price that can be discounted</p>'+
 numberField('min_redeemable_miles','Minimum Miles to Use',x.min_redeemable_miles,'','miles','1')+
 numberField('min_booking_amount','Minimum Booking Amount (₹)',x.min_booking_amount,'₹','','0.01')+
 '</div>');
}
function limits(data){
 const row=DAILY.map(([day,i])=>{
  const x=data.daily_limits.find(v=>v.day_of_week===i)?.redemption_rate??0;
  return '<label class="lv34-day '+(i===0||i===6?'weekend':'')+'"><span>'+day+'</span>'+
   '<div><input type="number" min="0" max="100" step="1" required data-lv34-day="'+i+'" aria-label="'+day+' daily miles usage limit" value="'+esc(x)+'">'+
   '<em>%</em></div></label>';
 }).join('');
 return panel('daily_limits','Daily Limits','% of miles a passenger can use on each day of the week','percent',
 '<div class="lv34-days">'+row+'</div>');
}
function tiers(data){
 const items=TIERS.map(([name,icon])=>{
  const val=data.tier_bonus.find(x=>x.tier_name===name)?.multiplier??1;
  return '<div class="lv34-tier lv34-tier-'+name.toLowerCase()+'">'+badge(icon,name.toLowerCase())+
   '<h3>'+esc(name)+'</h3>'+
   '<div class="lv34-tier-input"><input type="number" min="0" max="10" step="0.001" required aria-label="'+name+' multiplier" data-lv34-tier="'+name+'" value="'+esc(val)+'">'+
   '<button type="button" data-lv34-reset-tier="'+name+'" aria-label="Reset '+name+' multiplier">'+ico('close')+'</button></div>'+
   '</div>';
 }).join('');
 return panel('tier_bonus','Tier Bonus','Loyal passengers get more value per mile (e.g., Gold 1.2x means 100 miles = ₹120)','crown',
 '<div class="lv34-tiers">'+items+'</div>');
}
function block(data){
 const rows=data.blocked_dates.map(x=>
  '<div class="lv34-blocked-row"><div>'+ico('calendar')+' <strong>'+esc(x.date)+'</strong><span class="lv34-rate">'+esc(x.rate)+'%</span>'+
  (x.reason?'<span class="lv34-reason">'+esc(x.reason)+'</span>':'')+'</div>'+
  '<button type="button" data-lv34-del="'+esc(x.date)+'" aria-label="Delete blocked date '+esc(x.date)+'">'+ico('trash')+'</button></div>'
 ).join('');
 return panel('blocked_dates','Blocked Dates','Block or reduce miles usage on specific dates (festivals, holidays, peak days)','calendar',
 '<form class="lv34-block-form" data-lv34-block-form><div><label for="lv34-block-date">Date</label>'+
 '<div class="lv34-date"><span>'+ico('calendar')+'</span><input id="lv34-block-date" type="date" name="date" required aria-label="Blocked date" /></div></div>'+
 '<div><label for="lv34-block-rate">Rate %</label><div class="lv34-date lv34-rate-input">'+
 '<input id="lv34-block-rate" type="number" name="rate" min="0" max="100" step="1" value="0" required><span>%</span></div></div>'+
 '<div><label for="lv34-block-reason">Reason</label><input id="lv34-block-reason" type="text" name="reason" maxlength="160" placeholder="e.g., Diwali peak"></div>'+
 '<button type="submit" class="lv34-block-save">'+ico('close')+' Save</button></form>'+
 '<div class="lv34-blocked-list">'+(rows||'<p class="lv34-empty">No blocked dates added.</p>')+'</div>',false);
}
function markup(data){
 const enabled=data.general.is_active,upgrade=data.seat_upgrades.enabled;
 return '<div class="lv34-root" data-lv34-root>'+
 '<header class="lv34-top"><div>'+badge('spark')+'<h1>Loyalty Program</h1>'+
 '<button class="lv34-how" type="button" data-lv34-how>'+ico('play')+' How to</button></div>'+
 '<span class="lv34-enabled '+(enabled?'active':'inactive')+'"><i></i>'+ (enabled?'Enabled':'Disabled')+'</span></header>'+
 '<main class="lv34-main">'+
 '<section class="lv34-hero"><div class="lv34-hero-heading">'+badge('gift','gift')+
 '<div><h2>Loyalty Program</h2><p>Miles, redemption, and seat upgrades — your loyalty toolkit in one place.</p></div>'+
 toggle('program',enabled,'general')+'</div>'+
 '<div class="lv34-stats">'+
 '<div><label>VALUE PER MILE (₹)</label><strong>₹'+esc(data.general.miles_to_rupee_ratio)+'</strong><small>/mile</small></div>'+
 '<div><label>MAX DISCOUNT (%)</label><strong>'+esc(data.general.max_discount_percent)+'</strong><small> %</small></div>'+
 '<div><label>MINIMUM MILES TO USE</label><strong>'+esc(data.general.min_redeemable_miles)+'</strong></div>'+
 '</div></section>'+
 '<section class="lv34-upgrade"><div>'+badge('upgrade','upgrade')+
 '<div class="lv34-upgrade-copy"><h2>Enable Seat Upgrades</h2><p>Unsold seats in the last 20 minutes before boarding are offered to loyal travelling passengers as a free upgrade.</p></div>'+
 toggle('upgrades',upgrade,'seat_upgrades')+'</div>'+
 '<p class="lv34-footnote">When available: shared → single, upper → lower berth, back → front row.</p></section>'+
 general(data)+limits(data)+tiers(data)+block(data)+'</main>'+
 '<div class="lv34-overlay" data-lv34-overlay hidden><div class="lv34-dialog" role="dialog" aria-modal="true" aria-labelledby="lv34-how-title">'+
 '<header><h2 id="lv34-how-title">How the Loyalty Program works</h2><button type="button" data-lv34-close aria-label="Close instructions">'+ico('close')+'</button></header>'+
 '<p>Passengers earn miles on eligible paid bookings. Redeemed miles reduce the ticket fare within the configured limits.</p>'+
 '<p><b>General Settings:</b> control rupees per mile, maximum ticket discount and minimum eligibility.</p>'+
 '<p><b>Daily Limits:</b> restrict the fraction of a passenger’s available miles redeemable today. Blocked dates further restrict redemption for travel on selected dates.</p>'+
 '<p><b>Tier Bonus:</b> Bronze, Gold, Platinum and Silver multiply the redemption value of each mile.</p>'+
 '<p><b>Seat upgrades:</b> configure the intended free-upgrade feature; automated reassignment requires an authorized inventory/consent workflow.</p>'+
 '<button type="button" class="lv34-save" data-lv34-close>Got it</button></div></div></div>';
}
async function save(section,value,button){
 if(!current)return;
 const prevText=button?.innerHTML;if(button)button.disabled=true;
 try{
  const res=await G.put('/settings/loyalty-v34/'+section,{value});
  config=res.configuration;
  const node=current;
  render(node,config);
  notice(section,'Saved successfully.','ok');
  G.toast?.('Loyalty '+section.replace(/_/g,' ')+' saved','ok');
 }catch(e){
  notice(section,e.message,'error');
  if(button)button.disabled=false;
 }
}
function val(root,name){const e=root.querySelector('[name="'+name+'"]');return e?.value;}
function prepareSave(section){
 const p=current?.querySelector('[data-lv34-panel="'+section+'"]');
 if(!p)return;
 if(p.querySelector('input:invalid')){p.querySelector('input:invalid').reportValidity();return;}
 let value;
 if(section==='general')value={
  is_active:config.general.is_active,
  miles_to_rupee_ratio:Number(val(p,'miles_to_rupee_ratio')),
  max_discount_percent:Number(val(p,'max_discount_percent')),
  min_redeemable_miles:Number(val(p,'min_redeemable_miles')),
  min_booking_amount:Number(val(p,'min_booking_amount'))};
 if(section==='daily_limits')value=[...p.querySelectorAll('[data-lv34-day]')].map(x=>({day_of_week:Number(x.dataset.lv34Day),redemption_rate:Number(x.value)}));
 if(section==='tier_bonus')value=[...p.querySelectorAll('[data-lv34-tier]')].map(x=>({tier_name:x.dataset.lv34Tier,multiplier:Number(x.value)}));
 return save(section,value,p.querySelector('[data-lv34-save]'));
}
function render(el,data){
 current=el;config=data;el.className='lv34-container';el.innerHTML=markup(data);
 el.querySelectorAll('[data-lv34-save]').forEach(btn=>btn.onclick=()=>prepareSave(btn.dataset.lv34Save));
 el.querySelectorAll('[data-lv34-toggle]').forEach(btn=>btn.onclick=async()=>{
  const name=btn.dataset.lv34Toggle;
  const section=name==='program'?'general':'seat_upgrades';
  const value=name==='program'?{...config.general,is_active:!config.general.is_active}:{enabled:!config.seat_upgrades.enabled};
  await save(section,value,btn);
 });
 el.querySelectorAll('[data-lv34-reset-tier]').forEach(btn=>btn.onclick=()=>{
  const name=btn.dataset.lv34ResetTier,field=el.querySelector('[data-lv34-tier="'+name+'"]');
  if(field){field.value=name==='Gold'?'1.2':name==='Platinum'?'1.5':name==='Silver'?'1.1':'1';field.focus();}
 });
 el.querySelector('[data-lv34-block-form]').addEventListener('submit',async e=>{
  e.preventDefault();const f=e.currentTarget;
  if(!f.reportValidity())return;
  const date=f.elements.date.value,rate=Number(f.elements.rate.value),reason=f.elements.reason.value.trim();
  if(config.blocked_dates.some(x=>x.date===date)){notice('blocked_dates','Date already exists. Delete it before adding a replacement.','error');return;}
  const button=f.querySelector('button[type="submit"]');
  await save('blocked_dates',[...config.blocked_dates,{date,rate,reason}],button);
 });
 el.querySelectorAll('[data-lv34-del]').forEach(btn=>btn.onclick=async()=>{
  const date=btn.dataset.lv34Del;
  if(window.confirm&& !window.confirm('Remove the blocked-date rule for '+date+'?'))return;
  await save('blocked_dates',config.blocked_dates.filter(x=>x.date!==date),btn);
 });
 const overlay=el.querySelector('[data-lv34-overlay]');
 const close=()=>{overlay.hidden=true;el.querySelector('[data-lv34-how]').focus();};
 el.querySelector('[data-lv34-how]').onclick=()=>{overlay.hidden=false;overlay.querySelector('[data-lv34-close]').focus();};
 overlay.querySelectorAll('[data-lv34-close]').forEach(btn=>btn.onclick=close);
 overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
 el.onkeydown=e=>{if(e.key==='Escape'&&!overlay.hidden)close();};
 if(G.syncHeaderParity)G.syncHeaderParity();
}
function switchMarkup(){
 return '<div class="su34-page" data-su34-root><header class="su34-top"><a href="#/settings" aria-label="Back to Settings">'+ico('back')+'</a>'+
 '<span>'+ico('person')+'</span><h1>Switch User</h1></header>'+
 '<main class="su34-center"><h2>View the app as another user</h2>'+
 '<p>Enter the phone number of a user below your level (driver, pickup manager, agent, ...). You will see the app exactly as they do, but anything you change is still recorded under your own name.</p>'+
 '<form data-su34-form><label for="su34-phone">Phone Number</label>'+
 '<input id="su34-phone" name="phone" type="tel" inputmode="numeric" autocomplete="off" placeholder="e.g. 9876543210" minlength="10" maxlength="10" pattern="[0-9]{10}" required autofocus>'+
 '<button type="submit">Continue '+ico('arrow')+'</button></form>'+
 '<div class="su34-status" role="status" aria-live="polite" data-su34-status hidden></div>'+
 (G.viewAs?'<button type="button" class="su34-return" data-su34-return>Return to my account</button>':'')+
 '</main></div>';
}
function switchPage(el){
 current=el;el.className='su34-route';document.body.classList.add('su34-active');
 el.innerHTML=switchMarkup();
 const status=el.querySelector('[data-su34-status]');
 const show=(txt,tone='error')=>{status.hidden=false;status.dataset.tone=tone;status.textContent=txt;};
 el.querySelector('[data-su34-return]')?.addEventListener('click',()=>{
  G.viewAs='';localStorage.removeItem('viewAs');window.location.hash='#/';if(typeof G.reloadApp==='function')G.reloadApp();else window.location.reload();
 });
 const form=el.querySelector('[data-su34-form]');
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(!form.reportValidity())return;
  const button=form.querySelector('button');button.disabled=true;
  try{
   if(G.viewAs)throw Error('Return to your own account before choosing another user.');
   const person=await G.post('/auth/switch-user/v34/resolve',{phone:form.elements.phone.value.trim()});
   if(!person.id)throw Error('Could not verify user');
   G.viewAs=String(person.id);localStorage.setItem('viewAs',G.viewAs);
   show('Switching to '+person.name+' ('+person.role+'). Changes will be recorded under your account.','ok');
   window.location.hash='#/';if(typeof G.reloadApp==='function')G.reloadApp();else window.location.reload();
  }catch(e){show(e.message||'Unable to switch users');button.disabled=false;}
 });
 el.querySelector('#su34-phone')?.focus();
}
G.screens.settings=async function settingsV34(el,p){
 const section=p?.[0];
 if(section!=='loyalty-program'&&section!=='switch-user'){
  document.body.classList.remove('su34-active');
  return previous(el,p);
 }
 if(section==='switch-user'){switchPage(el);return;}
 document.body.classList.remove('su34-active');
 try{render(el,await G.get('/settings/loyalty-v34'));}
 catch(e){el.className='lv34-error';el.innerHTML='Unable to load Loyalty Program: '+esc(e.message)+
  ' <button data-lv34-retry type="button">Retry</button>';
  el.querySelector('[data-lv34-retry]').onclick=()=>G.screens.settings(el,p);}
};
window.addEventListener('hashchange',()=>{
 if(!window.location.hash.startsWith('#/settings/switch-user'))document.body.classList.remove('su34-active');
});
G.loyaltySwitchVersion='v34';
})();
