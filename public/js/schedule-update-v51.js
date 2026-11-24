/* Schedule Manage → Update v51: screenshot-aligned read/edit assignment workspace.
 * Uses authenticated schedule-specific source data; never fabricates crew,
 * route sync, OTA connectivity, or external call-provider operation. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.ScheduleUpdateV51=api;})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const E=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
 const icons={
 bus:'M4 17V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11M4 13h16M4 17h16M7 17v3m10-3v3M7 9h2m6 0h2',
 user:'M20 21a8 8 0 0 0-16 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
 users:'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m13-15a4 4 0 0 1 0 8m7 7v-2a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
 calendar:'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
 clock:'M12 6v6l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
 edit:'M12 20h9M16 3a2 2 0 0 1 3 3L7 18l-4 1 1-4L16 3Z',
 save:'M5 3h12l4 4v14H3V3h2Zm2 0v6h10V3M7 21v-9h10v9',
 x:'M18 6 6 18M6 6l12 12',
 pin:'M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Zm-8 2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
 phone:'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.5 3a2 2 0 0 1-.6 1.7L7.3 10a16 16 0 0 0 6.7 6.7l1.6-1.7a2 2 0 0 1 1.7-.6l3 .5a2 2 0 0 1 1.7 2Z',
 cloud:'M19 18H6a4 4 0 0 1-1-7.87A7 7 0 0 1 19.7 9 4.5 4.5 0 0 1 19 18Z',
 shield:'M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z',
 gps:'m12 22 9-20-20 9 8 3 3 8Z',
 alert:'m12 2 10 18H2L12 2Zm0 7v4m0 3h.01',
 route:'M3 12h18M7 5l-4 7 4 7m10-14 4 7-4 7',
 refresh:'M20 11a8 8 0 1 0-2 6M20 4v7h-7',
 tag:'M3 5h8l10 10-6 6L3 9zM7 8h.01',
 plus:'M12 5v14M5 12h14',
 trash:'M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v6m4-6v6',
 chevron:'m6 9 6 6 6-6',
 check:'M20 6 9 17l-5-5',
 layout:'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'
 };
 const I=(name,n=21)=>'<svg aria-hidden="true" viewBox="0 0 24 24" width="'+n+'" height="'+n+
  '" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><path d="'+
  icons[name]+'"/></svg>';
 const fieldClass='u51-input';
 const roleList=['Driver','Helper','Attendant','Conductor','Pickup Van'];
 const callItems=[['cloud_calling','Cloud Calling','cloud'],
  ['number_masking','Passenger Number Masking','shield'],
  ['direct_to_vehicle','Direct to Vehicle','bus'],
  ['driver_gps','Driver Mobile GPS','gps']];
 const state=s=>{
  if(!s.u51)s.u51={editing:false,data:null,edit:null,missing:false,busy:false};
  return s.u51;
 };
 const deep=x=>JSON.parse(JSON.stringify(x));
 const options=(rows,selected,empty)=>((empty?'<option value="">'+E(empty)+'</option>':'')+
  rows.map(([k,label])=>'<option value="'+E(k)+'" '+(String(k)===String(selected)?'selected':'')+'>'+E(label)+'</option>').join(''));
 const date=x=>{
  const str=String(x||''),d=new Date(str+'T12:00:00Z');
  return /^\d{4}-\d{2}-\d{2}$/.test(str)&&!Number.isNaN(+d)?
    new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',weekday:'short',day:'2-digit',month:'short'}).format(d):str||'—';
 };
 const time=x=>{
  if(!/^\d{1,2}:\d\d$/.test(String(x||'')))return '—';
  const [hh,mm]=String(x).split(':').map(Number);
  return (hh%12||12)+':'+String(mm).padStart(2,'0')+' '+(hh>=12?'PM':'AM');
 };
 const chip=(v,kind='route')=>'<span class="u51-source '+(kind==='schedule'?'u51-scheduled':'')+
  '"><span aria-hidden="true">●</span> Data Source: '+E(v)+'</span>';
 const square=(icon,kind='primary')=>'<span class="u51-icon u51-'+kind+'">'+I(icon,24)+'</span>';
 const phone=value=>value?
  '<a class="u51-phone" href="tel:'+E(String(value).replace(/[^0-9+]/g,''))+'">'+I('phone',16)+E(value)+'</a>':'';
 function banner(d){
  const booked=Number(d.seats_booked)||0,capacity=Number(d.capacity)||0;
  const pct=capacity?Math.round(booked/capacity*100):0;
  return '<section class="u51-trip">'+
   '<div class="u51-trip-left">'+square('bus')+'<div><div class="u51-service"><b>'+E(d.service_number)+
   '</b> <span class="u51-status"><i></i>'+E(String(d.status||'').toUpperCase())+
   '</span></div><h3>'+E(d.origin)+' <span>→</span> '+E(d.destination)+'</h3></div></div>'+
   '<div class="u51-summary-item">'+I('calendar',21)+'<div><small>DATE</small><strong>'+E(date(d.travel_date))+'</strong></div></div>'+
   '<div class="u51-summary-item">'+I('clock',21)+'<div><small>DEPARTS → ARRIVES</small><strong>'+
   E(time(d.departure_time))+' <span>→ '+E(time(d.arrival_time))+'</span></strong></div></div>'+
   '<div class="u51-summary-item u51-coach">'+I('bus',21)+'<div><small>COACH</small><strong>'+E(d.coach||'Not assigned')+'</strong></div></div>'+
   '<div class="u51-occ"><div><small>OCCUPANCY</small><strong>'+booked+'/'+capacity+' · '+pct+'%</strong></div>'+
   '<div class="u51-progress"><span style="width:'+Math.max(0,Math.min(pct,100))+'%"></span></div></div></section>';
 }
 function readCrew(data){
  return '<div class="u51-read-crew">'+(data.crew.length?data.crew.map(c=>
   '<article class="u51-crew-card">'+square('user',/helper|attendant/i.test(c.role)?'orange':'blue')+
   '<div><small>'+E(c.role||'Staff').toUpperCase()+'</small><strong>'+E(c.name||'—')+'</strong></div>'+
   phone(c.phone)+'</article>').join(''):'<p class="u51-empty">No crew assigned</p>')+'</div>';
 }
 function staffRows(d,s){
  const choices=d.staff_options||[];
  return s.crew.map((c,index)=>{
   const member=choices.find(o=>String(o.id)===String(c.staff_id));
   const valid=member||d.crew?.find(o=>String(o.staff_id)===String(c.staff_id));
   return '<div class="u51-edit-row" data-u51-row="'+index+'">'+
    '<select aria-label="Role '+(index+1)+'" data-u51-role="'+index+'" class="'+fieldClass+'">'+
    options(roleList.map(r=>[r,r]),c.role)+'</select>'+
    '<select aria-label="Staff '+(index+1)+'" data-u51-staff="'+index+'" class="'+fieldClass+'">'+
    options(choices.map(o=>[o.id,o.name]),c.staff_id,'Select staff')+
    (c.staff_id&&!member?'<option selected value="'+E(c.staff_id)+'">'+E(valid?.name||'Assigned staff unavailable')+'</option>':'')+
    '</select>'+
    '<input class="'+fieldClass+' u51-staff-phone" aria-label="Phone '+(index+1)+'" '+
    'value="'+E(member?.phone||valid?.phone||'')+'" placeholder="Staff phone" readonly>'+
    '<button type="button" class="u51-delete" data-u51-action="remove" data-index="'+index+
    '" aria-label="Remove staff '+(index+1)+'" title="Remove staff">'+I('trash')+'</button></div>';
  }).join('');
 }
 function callCard(d,edit){
  const c=edit?edit.call_settings:d.call_settings;
  const escs=edit?edit.escalation_contacts:d.escalation_contacts;
  return '<div class="u51-section-label">CALL ROUTING '+chip(d.call_source,d.call_source==='Route'?'route':'schedule')+'</div>'+
   '<div class="u51-calls">'+callItems.map(([key,label,ico])=>
    '<label class="u51-call-row">'+square(ico,key==='driver_gps'?'soft':'primary')+
    '<span>'+label+'</span>'+
    (edit?'<input type="checkbox" class="u51-toggle" data-u51-call="'+E(key)+
     '" '+(c[key]?'checked':'')+' aria-label="'+E(label)+'">':
    '<span class="u51-chip-state '+(c[key]?'on':'off')+'">'+
    (c[key]?I('check',15)+' ON':I('x',15)+' OFF')+'</span>')+'</label>').join('')+'</div>'+
   '<div class="u51-escalation">'+square('alert','red')+
   (edit?'<div class="u51-escalation-edit"><label for="u51-escalation-phones">Escalation</label>'+
     '<input id="u51-escalation-phones" data-u51-escalation class="'+fieldClass+'" '+
     'value="'+E(escs.join(','))+'" placeholder="Comma-separated verified phone numbers"></div>':
    '<strong>Escalation</strong><div class="u51-escalation-phones">'+(escs.length?
      escs.map(x=>phone(x)).join(''):'<span class="u51-muted">Not configured</span>')+'</div>')+
    '</div>';
 }
 function cabCard(d,edit){
  const mode=edit?edit.cab_mode:d.cab_mode;
  return '<div class="u51-section-label">AUTOS &amp; CABS '+chip(d.cab_source,d.cab_source==='Route'?'route':'schedule')+'</div>'+
   '<div class="u51-cab-row">'+square('route')+'<span>Ride to boarding point / from drop</span>'+
   (edit?'<div class="u51-cab-actions" role="group" aria-label="Cab coverage">'+
    ['Off','Pickups','Drops','Both'].map(x=>
     '<button type="button" data-u51-action="cab" data-mode="'+x+'" class="'+(mode===x?'selected':'')+
     '" aria-pressed="'+(mode===x)+'">'+x+'</button>').join('')+'</div>':
    '<span class="u51-chip-state '+(mode==='Off'?'off':'on')+'">'+E(mode.toUpperCase())+'</span>')+'</div>';
 }
 function assignment(d,s){
  const edit=s.editing,showEdit=edit&&s.edit;
  return '<section class="u51-card u51-assignment"><header class="u51-cardhead">'+
   '<h3>'+square('bus')+' Vehicle &amp; Staff Assignment</h3>'+
   (edit?'<button class="u51-small-btn" data-u51-action="cancel">'+I('x',16)+' Cancel</button>':
    '<button class="u51-small-btn" data-u51-action="edit" '+(!d.can_modify?'disabled':'')+'>'+
    I('edit',18)+' Edit</button>')+'</header>'+
   '<div class="u51-assign-grid"><div class="u51-vehicle-col"><div class="u51-section-label">VEHICLE '+
   chip(d.assignment_source,d.assignment_source==='Route'?'route':'schedule')+'</div>'+
   (edit?'<select class="'+fieldClass+' u51-vehicle-select" data-u51-vehicle aria-label="Assigned vehicle" '+
    ' '+(!d.vehicle_options.length?'disabled':'')+'>'+
     options(d.vehicle_options.map(v=>[v.id,v.label]),s.edit.vehicle_id,'Select vehicle')+'</select>':
   '<div class="u51-plate">'+square('bus','blue')+'<b>'+E(
     (d.vehicle_options||[]).find(v=>String(v.id)===String(d.vehicle_id))?.label||
     d.vehicle_number||'Unassigned vehicle')+'</b></div>')+
   (d.vehicle_position?'<small class="u51-vehicle-loc">'+I('pin',14)+E(d.vehicle_position)+'</small>':'')+'</div>'+
   '<div class="u51-staff-col"><div class="u51-section-label">STAFF '+
    chip(d.assignment_source,d.assignment_source==='Route'?'route':'schedule')+'</div>'+
    (edit?'<div class="u51-edit-staff">'+staffRows(d,s.edit)+'</div><button class="u51-add" data-u51-action="add">'+
    I('plus',17)+' Add Staff</button>':readCrew(d))+'</div></div>'+
    callCard(d,showEdit? s.edit :null)+cabCard(d,showEdit?s.edit:null)+
    (edit?'<div class="u51-action-footer"><button type="button" class="u51-save" data-u51-action="save" '+
     (s.busy?'disabled':'')+'>'+I('save',21)+' Update Assignment</button>'+
     '<p>Updating will disable “Sync with Route” to preserve your changes.</p></div>':'')+
   '</section>';
 }
 function scheduleDetails(d){
  return '<section class="u51-card"><header class="u51-cardhead"><h3>'+square('calendar')+
   ' Schedule Details</h3></header><div class="u51-schedule-row">'+
   '<div class="u51-detail-pill">'+square('tag')+'<span><small>SERVICE NO*</small><strong>'+E(d.service_number)+'</strong></span></div>'+
   '<div class="u51-detail-pill">'+square('tag','violet')+'<span><small>NAME*</small><strong>'+E(d.service_name||'—')+'</strong></span></div>'+
   '<div class="u51-detail-pill u51-coachpill">'+square('bus')+'<span><small>COACH TYPE*</small><strong>'+
    E(d.coach||'—')+'</strong></span><button type="button" data-sx-coach-transfer>Coach Transfer</button></div>'+
   '<div class="u51-indicators" aria-label="Reference schedule indicators">'+
   ['users','users','layout'].map((ico,i)=>'<span class="'+(i===2?'selected':'')+
    '" title="Unmapped reference indicator — requires confirmed product semantics">'+I(ico,21)+
    '<small>'+(i===2?'ON':'OFF')+'</small></span>').join('')+'</div></div></section>';
 }
 function syncCard(d,s){
  return '<section class="u51-card u51-sync"><header class="u51-cardhead">'+
   '<h3>'+square('refresh')+'<span>Sync with Route<small>Route changes (coach, timings, stages, fares) will apply to this schedule.</small></span></h3>'+
   '<label class="u51-switch" title="Sync with route"><input data-u51-sync type="checkbox" '+
    (d.sync_with_route?'checked':'')+(!s.data.can_modify?' disabled':'')+' aria-label="Sync with Route">'+
    '<span></span></label></header></section>'+
   '<section class="u51-ota"><label><input data-u51-missing type="checkbox" '+(s.missing?'checked':'')+
    '><span><b>Missing on RedBus / AbhiBus?</b> Tick this and Sync to re-push this trip’s seats — not needed on a normal save.</span></label>'+
    '<button class="u51-ota-button" data-u51-action="ota" aria-disabled="true" title="'+E(d.ota_sync_message)+'">'+
    I('refresh',20)+' Sync with OTAs <span class="u51-warning">!</span></button>'+
    (!s.missing?'<div class="u51-tooltip" role="status"><b>⚠ WHAT’S MISSING</b><small>Tick the box above to confirm this re-push. An authorized OTA connector is also required.</small></div>':
    '<div class="u51-ota-note">'+E(d.ota_sync_message)+'</div>')+'</section>';
 }
 async function render(S,G){
  const s=state(S);
  const id=encodeURIComponent(S.detail?.id||'');
  if(!s.data||String(s.data.schedule_id)!==String(S.detail?.id))
    s.data=await G.get('/schedules/'+id+'/update-v51');
  const d={...s.data,...S.detail,vehicle_number:S.detail.vehicle?.registration_number||'Unassigned vehicle',
   vehicle_position:S.trip?.position?.address||'',sync_with_route:S.detail.sync_with_route!==false};
  return '<div class="sx-update-shell u51-root" data-u51-root>'+
   banner(d)+assignment(d,s)+scheduleDetails(d)+syncCard(d,s)+'</div>';
 }
 async function click(button,S,{G,rerender,reload,confirm,toast}){
  const action=button.dataset.u51Action;if(!action)return false;
  const s=state(S),d=s.data;
  if(action==='edit'){
   if(!d.can_modify){toast('Schedule modification permission required','bad');return true}
   s.editing=true;s.edit={vehicle_id:d.vehicle_id||'',crew:d.crew.map(x=>({staff_id:x.staff_id,role:x.role})),
    call_settings:{...d.call_settings},escalation_contacts:[...d.escalation_contacts],cab_mode:d.cab_mode};
   await rerender();return true;
  }
  if(action==='cancel'){s.editing=false;s.edit=null;await rerender();return true}
  if(action==='add'){if(s.editing&&s.edit.crew.length<8){s.edit.crew.push({staff_id:'',role:'Driver'});await rerender()}
   else toast('Maximum eight crew assignments','warn');return true}
  if(action==='remove'){
   if(s.editing)s.edit.crew.splice(Number(button.dataset.index),1);
   await rerender();return true;
  }
  if(action==='cab'){if(s.editing)s.edit.cab_mode=button.dataset.mode;await rerender();return true}
  if(action==='ota'){toast(d.ota_sync_message||'OTA integration is not connected; no push was performed','warn');return true}
  if(action==='save'){
   if(!s.editing||!s.edit||s.busy)return true;
   const draft=s.edit;
   if(!draft.vehicle_id&&d.vehicle_id&&!d.vehicle_options.length){
    toast('Vehicle selection is not available with your permissions','bad');return true;
   }
   if(draft.crew.some(x=>!x.staff_id)){
    toast('Choose an active staff member for every row, or remove the unused row','warn');return true;
   }
   const escalation=draft.escalation_contacts;
   if(escalation.some(x=>!/^\+?[0-9]{10,15}$/.test(x))){
    toast('Escalation contacts must be 10–15 digit phone numbers','bad');return true;
   }
   if(!await confirm('Apply these vehicle, staff, call-routing and cab settings to this trip? Route synchronization will be disabled.',{ok:'Update Assignment'}))return true;
   s.busy=true;
   try{
    s.data=await G.put('/schedules/'+encodeURIComponent(S.detail.id)+'/update-v51/assignment',{
     vehicle_id:draft.vehicle_id?Number(draft.vehicle_id):null,
     crew:draft.crew.map(x=>({role:x.role,staff_id:Number(x.staff_id)})),
     call_settings:draft.call_settings,escalation_contacts:escalation,cab_mode:draft.cab_mode
    });
    s.editing=false;s.edit=null;await reload();toast('Trip assignment and overrides saved; route template unchanged','ok');
   }finally{s.busy=false}
   return true;
  }
  return false;
 }
 function change(element,S){
  if(!element.dataset)return false;
  const s=state(S),edit=s.edit;
  if(element.hasAttribute('data-u51-sync'))return false; // async confirmation in parent
  if(element.hasAttribute('data-u51-missing')){s.missing=element.checked;return true}
  if(!s.editing||!edit)return false;
  const index=k=>Number(element.dataset[k]);
  if(element.hasAttribute('data-u51-vehicle'))edit.vehicle_id=element.value;
  else if(element.hasAttribute('data-u51-role'))edit.crew[index('u51Role')].role=element.value;
  else if(element.hasAttribute('data-u51-staff'))edit.crew[index('u51Staff')].staff_id=element.value;
  else if(element.hasAttribute('data-u51-call'))edit.call_settings[element.dataset.u51Call]=element.checked;
  else if(element.hasAttribute('data-u51-escalation'))edit.escalation_contacts=element.value.split(',').map(v=>v.replace(/[\s()-]/g,'')).filter(Boolean);
  else return false;
  return true;
 }
 async function sync(element,S,{G,rerender,reload,confirm,toast}){
  const s=state(S),desired=element.checked,was=S.detail.sync_with_route!==false;
  element.checked=was;
  if(!s.data?.can_modify){toast('Schedule modification permission required','bad');return}
  if(!await confirm(desired?
   'Enable Sync with Route? Current trip-specific assignment and call/cab overrides will be replaced with route values.':
   'Disable Sync with Route? This trip will keep its current settings until explicitly changed.',
   {ok:desired?'Enable Sync':'Disable Sync'}))return;
  s.data=await G.put('/schedules/'+encodeURIComponent(S.detail.id)+'/update-v51/sync',{enabled:desired});
  s.editing=false;s.edit=null;await reload();toast('Schedule route synchronization '+(desired?'enabled':'disabled'),'ok');
 }
 return {render,click,change,sync,date,time,state};
});
