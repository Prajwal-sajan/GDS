/* Configuration v30 — screenshot-by-screenshot Website, Business Info,
   Communications and Notifications. No simulated provider delivery. */
(function(){
'use strict';
if(!window.G||!G.screens||!G.screens.settings)return;
const previous=G.screens.settings,api='/settings/config-v30';
const E=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={business:'building-2',website:'globe',communications:'headset',notifications:'bell',
 pricing:'indian-rupee',office:'store',vehicle:'bus',expenses:'fuel',seats:'palette',
 monitoring:'target',whatsapp:'message-square',bot:'bot'};
const menu=[
 ['business','Business Info'],['website','Website'],['communications','Communications'],
 ['notifications','Notifications'],['pricing','Pricing'],['office','Office Booking'],
 ['vehicle','Vehicle Alerts'],['expenses','Expenses'],['seats','Seat legends'],
 ['monitoring','Post-Trip Monitoring'],['whatsapp','WhatsApp Alerts'],['bot','AI Bot']
];
const extraRoutes={pricing:'#/settings/loyalty-program/miles',office:'#/settings/configuration/office',
 vehicle:'#/settings/configuration/vehicle',expenses:'#/settings/configuration/expenses',
 seats:'#/settings/configuration/seats',monitoring:'#/settings/configuration/monitoring',
 whatsapp:'#/settings/whatsapp',bot:'#/settings/configuration/bot'};
const EVENTS=['New booking','Booking changed','Cancellation','Trip delayed / cancelled',
 'Unpaid hold expired','Payment received','Check-in reminder','Live Journey',
 'Pre-boarding / tracking link','Rating request','Bus approaching'];
const SOURCE=['Website','app','Branch','Agent','GDS','Partner'];
const EVENT_ALIASES={
 'booking.created':'New booking','booking.cancelled':'Cancellation',
 'booking.modified':'Booking changed','hold.expired':'Unpaid hold expired',
 'passenger.pre_boarding':'Pre-boarding / tracking link','trip.delayed':'Trip delayed / cancelled',
 'trip.started':'Live Journey','vehicle.approaching':'Bus approaching',
 'passenger.rating_request':'Rating request'
};
const eventLabel=x=>EVENT_ALIASES[x]||x;
const glyph=(name)=>'<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+({
 'building-2':'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1M10 21v-4h4v4"/>',
 globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-6 5-6 13 0 18M12 3c6 5 6 13 0 18"/>',
 headset:'<path d="M3 14v-2a9 9 0 0 1 18 0v2"/><rect x="2" y="12" width="5" height="8" rx="2"/><rect x="17" y="12" width="5" height="8" rx="2"/><path d="M19 21h-6"/>',
 bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 10h18c0-2-3-3-3-10M10 22h4"/>',
 'indian-rupee':'<path d="M5 4h14M5 9h14M7 4c10 0 10 8 0 8l9 8"/>',
 store:'<path d="M4 9V5h16v4l2 3v2h-4v7H6v-7H2v-2l2-3zM9 21v-7h6v7"/>',
 bus:'<rect x="4" y="3" width="16" height="16" rx="3"/><path d="M4 11h16M7 19v3m10-3v3M8 15h1m6 0h1"/>',
 fuel:'<path d="M4 3h11v18H4zM7 7h5M15 11h3l3 3v5a2 2 0 0 1-4 0v-3"/>',
 palette:'<circle cx="12" cy="12" r="9"/><circle cx="7" cy="10" r="1"/><circle cx="11" cy="7" r="1"/><circle cx="16" cy="9" r="1"/><path d="M12 20c-1-4 7-5 7-8"/>',
 target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
 'message-square':'<path d="M4 4h16v13H8l-4 4z"/>',
 bot:'<rect x="4" y="7" width="16" height="13" rx="3"/><path d="M12 7V3M9 13h1m4 0h1M9 17h6"/>',
 save:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M7 3v7h10V3M8 21v-7h8v7"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 phone:'<path d="M7 3h4l2 6-3 2c1 2 3 4 5 5l2-3 4 2v5c-9 4-20-7-18-17z"/>',
 map:'<path d="m12 21 7-9a8 8 0 1 0-14 0l7 9z"/><circle cx="12" cy="10" r="2"/>',
 mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 7 9-7"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
 hash:'<path d="M5 9h14M4 15h14M10 3 7 21M17 3l-3 18"/>',
 file:'<path d="M5 2h10l5 5v15H5zM15 2v5h5M8 12h9M8 16h9"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
 tag:'<path d="M3 5h8l10 10-6 6L3 9z"/><circle cx="7" cy="8" r="1"/>',
 send:'<path d="m22 2-7 20-4-9-9-4 20-7zM11 13 22 2"/>',
 edit:'<path d="m3 17 12-12 4 4L7 21H3zM13 7l4 4"/>',
 trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6"/>',
 plus:'<path d="M12 4v16M4 12h16"/>',
 down:'<path d="m6 9 6 6 6-6"/>',
 close:'<path d="M5 5l14 14M19 5 5 19"/>'
 }[name]||'<circle cx="12" cy="12" r="9"/>')+'</svg>';
const icon=(name)=>'<span class="cfg30-icon">'+glyph(icons[name]||name)+'</span>';
const get=()=>G.get(api),save=(section,values)=>G.put(api+'/'+section,values);
const state={section:'business',record:null,dirty:false};
const editable=()=>typeof can!=='function'||can('settings.modify');
function textField(key,label,value='',iconName='file',placeholder='',extra=''){
 return '<label class="cfg30-field"><span class="cfg30-label">'+E(label)+'</span>'+
  '<span class="cfg30-input-wrap">'+(iconName?icon(iconName):'')+
  '<input type="text" name="'+E(key)+'" value="'+E(value)+'" placeholder="'+E(placeholder)+'" '+extra+'></span></label>';
}
function numberField(key,label,value,unit,max,help=''){
 return '<label class="cfg30-field"><span class="cfg30-label">'+E(label)+'</span>'+
 '<span class="cfg30-input-wrap cfg30-number-wrap"><input type="number" min="0" max="'+max+'" step="1" name="'+E(key)+'" value="'+E(value??'')+'"><span class="cfg30-unit">'+E(unit)+'</span></span>'+
 (help?'<small class="cfg30-help">'+E(help)+'</small>':'')+'</label>';
}
function switchRow(key,title,description,active){
 return '<label class="cfg30-switch-row"><span><strong>'+E(title)+'</strong><small>'+E(description)+'</small></span>'+
  '<input type="checkbox" name="'+E(key)+'" '+(active?'checked':'')+'><span class="cfg30-switch-ui"></span></label>';
}
function sectionCard(title,body,ico,description=''){
 return '<section class="cfg30-card"><div class="cfg30-card-heading">'+icon(ico)+
 '<div><h3>'+E(title)+'</h3>'+(description?'<p>'+E(description)+'</p>':'')+'</div></div>'+body+'</section>';
}
function grid(body){return '<div class="cfg30-grid">'+body+'</div>';}
function blockTitle(title,subtitle,ico){
 return '<section class="cfg30-block-title">'+icon(ico)+'<div><h2>'+E(title)+'</h2><p>'+E(subtitle)+'</p></div></section>';
}
function fieldArea(key,title,value='',help=''){
 return '<label class="cfg30-field cfg30-span"><span class="cfg30-label">'+E(title)+
 (help?' <small>'+E(help)+'</small>':'')+'</span><textarea name="'+E(key)+'" rows="4">'+E(value)+'</textarea></label>';
}
function pills(values,className='cfg30-tags'){return '<div class="'+className+'">'+
 (values||[]).map(v=>'<span class="cfg30-chip">'+E(v)+' <button type="button" data-remove-chip="'+E(v)+'" aria-label="Remove '+E(v)+'">×</button></span>').join('')+
 '<input type="tel" data-add-chip placeholder="Add number and press Enter" aria-label="Add number"></div>';}
function radioCard(value,label,help,selected){return '<label class="cfg30-choice '+(selected?'chosen':'')+'"><input type="radio" name="ring_order" value="'+E(value)+'" '+(selected?'checked':'')+'><strong>'+E(label)+'</strong><small>'+E(help)+'</small></label>';}
function businessPage(v){
 return blockTitle('Business Info','Configuration','business')+
  sectionCard('General Information',grid(
   textField('operator_name','OPERATOR NAME',v.operator_name,'business')+
   textField('support_email','SUPPORT EMAIL',v.support_email,'mail')
  ),'business')+
  sectionCard('GST Details',switchRow('gst_receivable','GST Receivable','Enable if operator collects GST',v.gst_receivable)+
   grid(textField('gst_number','GST NUMBER',v.gst_number,'hash')+
   textField('gst_registration_name','GST REGISTRATION NAME',v.gst_registration_name,'file')),'file');
}
function websitePage(v){
 return blockTitle('Website','Configuration','website')+
  sectionCard('Brand',grid(textField('tagline','TAGLINE',v.tagline,'tag')+
  textField('company_legal_name','COMPANY LEGAL NAME',v.company_legal_name,'business')),'tag')+
  sectionCard('Address',grid(fieldArea('address_lines','ADDRESS LINES',v.address_lines,
   'One line per row — appears on the public website footer.')),'map')+
  sectionCard('Contact',grid(
   textField('email','EMAIL',v.email,'mail')+textField('helpline','HELPLINE',v.helpline,'phone')+
   textField('whatsapp_number','WHATSAPP NUMBER',v.whatsapp_number,'whatsapp')+
   textField('business_hours','BUSINESS HOURS',v.business_hours,'clock')
  ),'phone')+
  sectionCard('Footer',grid(textField('copyright_line','COPYRIGHT LINE',v.copyright_line,'file')),'file')+
  sectionCard('Policy Details', '<p class="cfg30-description">Operator-specific values used in Terms of Carriage, Refund, and Privacy pages. Empty fields are omitted from the policy.</p>'+
   grid(numberField('boarding_window_minutes','BOARDING WINDOW (MINUTES BEFORE DEPARTURE)',v.boarding_window_minutes,'MIN',1440)+
   numberField('refund_processing_days','REFUND PROCESSING (WORKING DAYS)',v.refund_processing_days,'DAYS',365)+
   numberField('carry_on_kg','CARRY-ON BAGGAGE LIMIT (KG)',v.carry_on_kg,'KG',250)+
   numberField('check_in_kg','CHECK-IN BAGGAGE LIMIT (KG)',v.check_in_kg,'KG',250)+
   numberField('baggage_liability_inr','BAGGAGE LIABILITY CAP (₹)',v.baggage_liability_inr,'₹',10000000)+
   numberField('child_free_age','CHILD FREE TRAVEL AGE LIMIT (YEARS)',v.child_free_age,'YRS',21)+
   numberField('unaccompanied_minor_age','UNACCOMPANIED MINOR AGE LIMIT (YEARS)',v.unaccompanied_minor_age,'YRS',21)+
   textField('jurisdiction_city','JURISDICTION CITY',v.jurisdiction_city,'map')+
   textField('jurisdiction_state','JURISDICTION STATE',v.jurisdiction_state,'map')
  ),'file')+
  sectionCard('Grievance Officer',grid(
   textField('grievance_officer_name','OFFICER NAME',v.grievance_officer_name,'user','e.g. Kavya K')+
   textField('grievance_designation','DESIGNATION',v.grievance_designation,'tag','e.g. Proprietor, Director, Manager')
  ),'user','Designated under the IT Rules / DPDP Act. Shown on the Privacy Policy page.');
}
function communicationsPage(v,data){
 const dials=data.dials||[];
 return blockTitle('Communications','Configuration','communications')+
  sectionCard('Call Routing',[
    switchRow('cloud_calling','Cloud Calling','Enable cloud-based calling for this operator',v.cloud_calling),
    switchRow('passenger_masking','Passenger Number Masking','Mask phone numbers in calls to protect passenger and driver privacy',v.passenger_masking),
    switchRow('direct_to_vehicle','Direct to Vehicle','Route incoming passenger calls to vehicle phone instead of driver personal number',v.direct_to_vehicle),
    switchRow('call_individual_drivers','Call Individual Drivers',"Ring the driver's own mobile from the pickup chart. Turn this off to ring only the bus phone and your office numbers",v.call_individual_drivers)
   ].join(''),'communications')+
  sectionCard('Numbers passengers get on tickets and messages',
   '<p class="cfg30-description">Printed on tickets, sent in WhatsApp messages and read out by the assistant.</p>'+
   grid(
    textField('savetrip_line','SAVETRIP LINE',v.savetrip_line,'phone','Managed calling line','readonly title="Provider-managed number; cannot edit here"')+
    textField('whatsapp_sender','WHATSAPP SENDER',v.whatsapp_sender,'whatsapp','Managed sender','readonly title="Provider-managed sender; cannot edit here"')+
    textField('support_number','SUPPORT NUMBER',v.support_number,'phone')+
    '<div class="cfg30-field"><span class="cfg30-label">PUBLISHED OFFICE NUMBERS</span>'+pills(v.published_office_numbers)+'</div>'
   ),'phone')+
  sectionCard('Numbers we dial',grid(
   '<div class="cfg30-field"><span class="cfg30-label">ESCALATION CONTACTS</span>'+pills(v.escalation_contacts)+'</div>'+
   '<div class="cfg30-field"><span class="cfg30-label">RING ORDER</span>'+
   radioCard('share','Share the load','Each call starts with a different contact, so nobody fields every call.',v.ring_order==='share')+
   radioCard('sequential','In this order','The first contact always rings first; the next only if they miss it.',v.ring_order==='sequential')+'</div>'
  ),'communications')+
  sectionCard('Cloud calling','<p class="cfg30-description">Speed dials: *5 / *6 + code # on a live call — settings save, but actual telephony requires a connected provider.</p>'+
   '<div class="cfg30-split-head"><strong>Speed dials</strong><button type="button" class="cfg30-btn solid" data-dial-add>'+glyph('plus')+' Add code</button></div>'+
   switchRow('speed_dial_during_calls','Speed dial during calls','Staff on a call press *5 or *6 with a code to pull in a driver or number',v.speed_dial_during_calls)+
   switchRow('dial_bus_last4','Dial a bus by its last 4 digits','A 4-digit code reaches the driver of the bus whose number ends in these digits',v.dial_bus_last4)+
   '<div class="cfg30-table-scroll"><table class="cfg30-table" data-dial-table><thead><tr><th>CODE</th><th>CALLS</th><th>LABEL</th><th>ACTIVE</th><th></th></tr></thead><tbody>'+
   dials.map(d=>'<tr><td><b>'+E(d.code)+'</b></td><td>PHONE '+E(d.phone||'')+'</td><td>'+E(d.label||'')+'</td>'+
   '<td>'+(d.is_active?'Yes':'No')+'</td><td><button type="button" data-dial-edit="'+E(d.id)+'" aria-label="Edit code">'+glyph('edit')+
   '</button><button type="button" data-dial-delete="'+E(d.id)+'" aria-label="Delete code">'+glyph('trash')+'</button></td></tr>').join('')+'</tbody></table></div>'+
   '<div class="cfg30-instructions"><strong>How to use on a call</strong>'+
   ['*5 code # — Add the driver (or number) to the call — 3-way',
    '*6 code # — Transfer to the driver — you drop once they answer',
    "*5 # — This passenger's own bus driver",
    "*5 4521 # — The bus whose number ends in 4521",
    "Two beeps — more than one bus is running on that route; enter the last 4 digits",
    'Long tone — code not found'].map(x=>'<p>'+E(x)+'</p>').join('')+
   '</div>','communications')+
  sectionCard('City-Specific Contacts',
   '<div class="cfg30-split-head"><small>Ring after the trip’s driver and bus phone, for the booking’s origin and destination city.</small>'+
   '<button type="button" class="cfg30-btn outline" data-city-add>'+glyph('plus')+' Add City</button></div>'+
   '<div data-city-list>'+v.city_contacts.map((row,i)=>'<div class="cfg30-city"><div><span class="cfg30-input-wrap">'+icon('map')+
   '<input data-city-name="'+i+'" value="'+E(row.city)+'" aria-label="City name"></span>'+
   '<button type="button" data-city-remove="'+i+'" aria-label="Remove city">'+glyph('trash')+'</button></div>'+
   '<div data-city-phones="'+i+'">'+pills(row.phones)+'</div></div>').join('')+'</div>','map')+
  sectionCard('Who is in each group',grid(
   '<div class="cfg30-group"><div><b>Crew of the trip</b><button type="button" data-group-view="crew">Change</button></div>'+
   '<p>The people working on that particular bus. Worked out for each booking from the trip sheet.</p>'+
   '<p><b>Includes:</b> driver, conductor, helper, attendant, cleaner and pickup-van drivers.</p>'+
   '<div class="cfg30-split-head">Added by you <button type="button" data-group-add="crew">+ Add a person</button></div>'+
   '<small>'+E(v.crew_extra.join(', ')||'Nobody yet.')+'</small></div>'+
   '<div class="cfg30-group"><div><b>Office team</b><button type="button" data-group-view="office">Change</button></div>'+
   '<p>Your back-office people. The same list for every bus.</p>'+
   '<p><b>Includes:</b> org owner, administrator, admin, manager, pickup manager, trip manager, supervisor.</p>'+
   '<div class="cfg30-split-head">Added by you <button type="button" data-group-add="office">+ Add a person</button></div>'+
   '<small>'+E(v.office_extra.join(', ')||'Nobody yet.')+'</small></div>'
  ),'user')+
  '<section class="cfg30-card"><button class="cfg30-link" type="button" data-log-toggle>⌄ Delivery log — look up a PNR</button>'+
  '<div data-log-box hidden><div class="cfg30-lookup"><input placeholder="PNR" aria-label="PNR" data-pnr><button class="cfg30-btn solid" type="button" data-pnr-lookup>'+glyph('search')+' Look up</button></div>'+
  '<div data-log-result aria-live="polite"></div></div></section>';
}
function notificationPage(v,data){
 const rows=data.subscriptions||[];
 const row=(s,builtin=false)=>{
  const id=E(s.id||''),name=Array.isArray(s.event_types)?s.event_types.map(eventLabel).join(', '):eventLabel(String(s.event_types||''));
  return '<tr><td>'+(builtin?'—':'<span class="cfg30-id">#'+id+'</span>')+'</td>'+
   '<td>'+E(name)+'</td><td>'+E(s.channel==='whatsapp'?'WhatsApp':'App push')+'</td>'+
   '<td>'+E(s.endpoint==='booking_passenger'?'Passenger of the booking':s.endpoint==='crew'?'Crew of the trip':s.endpoint==='office'?'Office team':s.display_name||'Phone number')+
   (builtin?'<small>built-in</small>':'')+'</td>'+
   '<td>'+E(s.only_sources?(s.booking_sources||[]).join(', '):builtin?'only while the bus is running':'all booking sources')+'</td>'+
   '<td><label class="cfg30-mini-switch"><input type="checkbox" data-sub-toggle="'+(builtin?s.endpoint:id)+'" '+(s.enabled?'checked':'')+
   '><span></span></label></td>'+
   '<td class="cfg30-actions">'+(builtin?'':('<button type="button" data-sub-test="'+id+'" title="Send test">'+glyph('send')+'</button>'))+
   '<button type="button" data-sub-edit="'+(builtin?s.endpoint:id)+'" title="Edit">'+glyph('edit')+'</button>'+
   (builtin?'':'<button type="button" data-sub-delete="'+id+'" title="Delete">'+glyph('trash')+'</button>')+'</td></tr>';
 };
 const builtins=[
 {endpoint:'crew',event_types:['New booking'],channel:'push',enabled:v.builtin_crew_push},
 {endpoint:'office',event_types:['New booking'],channel:'push',enabled:v.builtin_office_push}
 ];
 return blockTitle('Notifications','Configuration','notifications')+
  sectionCard('Notification Timing Windows',
   '<p class="cfg30-description">Configure when each notification is sent. Start = minutes before the reference time chosen below.</p>'+
   switchRow('bus_live_status','Bus Live Status for passengers','Passengers can turn on live bus updates on their phone when they check in. No app needed.',v.bus_live_status)+
   '<div class="cfg30-timing">'+numberField('boarding_point_cutoff','BOARDING POINT CHANGE CUTOFF',v.boarding_point_cutoff,'MIN',1440,
    'Passengers can change their own boarding or dropping point from the ticket link until this many minutes before boarding.')+'</div>'+
   '<div class="cfg30-time-row"><div><b>Pre-Boarding</b><small>Sent before the boarding point time (open until 1 h after boarding)</small>'+
   '<label class="cfg30-inline-select">Based on <select name="pre_boarding_based_on">'+
   '<option value="boarding_point" '+(v.pre_boarding_based_on==='boarding_point'?'selected':'')+'>Boarding point</option>'+
   '<option value="departure" '+(v.pre_boarding_based_on==='departure'?'selected':'')+'>Trip departure</option></select></label></div>'+
   '<input name="pre_boarding_minutes" type="number" min="0" max="43200" value="'+E(v.pre_boarding_minutes)+'" aria-label="Pre-boarding minutes"></div>'+
   '<div class="cfg30-time-row"><div><b>Check-in Reminder</b><small>Reminder sent before the boarding point time.</small></div>'+
   '<input name="checkin_reminder_minutes" type="number" min="0" max="43200" value="'+E(v.checkin_reminder_minutes)+'"></div>'+
   '<div class="cfg30-time-row"><div><b>Rating Request</b><small>Feedback request sent after the trip, based on the drop time.</small></div>'+
   '<input name="rating_request_minutes" type="number" min="0" max="43200" value="'+E(v.rating_request_minutes)+'"></div>',
   'notifications')+
  sectionCard('Subscriptions','<div class="cfg30-split-head"><span>Who is told about booking events, on which channel.</span>'+
   '<button type="button" class="cfg30-btn gradient" data-sub-add>'+glyph('plus')+' Create subscription</button></div>'+
   '<div class="cfg30-table-scroll"><table class="cfg30-table cfg30-sub-table"><thead><tr>'+
   ['ID','EVENT','PROTOCOL','ENDPOINT','FILTER','STATUS',''].map(h=>'<th>'+h+'</th>').join('')+
   '</tr></thead><tbody>'+rows.map(s=>row(s)).join('')+builtins.map(x=>row(x,true)).join('')+
   '</tbody></table></div>'+
   '<p class="cfg30-description">Want these events sent to your own system (ERP, CRM)? A verified outbound integration is required.</p>'+
   '<h4>WHO IS IN EACH GROUP</h4>'+grid(
    '<div class="cfg30-group"><b>Crew of the trip</b><p>The people working on that particular bus. Worked out for each booking from the trip sheet.</p>'+
    '<button type="button" data-group-view="crew">Change</button></div>'+
    '<div class="cfg30-group"><b>Office team</b><p>Your back-office people. The same list for every bus.</p>'+
    '<button type="button" data-group-view="office">Change</button></div>')+
   '<button type="button" class="cfg30-link" data-log-toggle>⌄ Delivery log — look up a PNR</button>'+
   '<div data-log-box hidden><div class="cfg30-lookup"><input placeholder="PNR" aria-label="PNR" data-pnr>'+
   '<button class="cfg30-btn gradient" type="button" data-pnr-lookup>'+glyph('search')+' Look up</button></div>'+
   '<div data-log-result aria-live="polite"></div></div>','send');
}
function unshownPage(key){
 return blockTitle(menu.find(x=>x[0]===key)?.[1]||'Configuration','Configuration',key)+
 sectionCard('Configuration','<p class="cfg30-description">This section is in the reference navigation but its controls are not shown in the supplied screenshots. Existing corresponding GDS modules remain available.</p>'+
 '<a class="cfg30-btn outline" href="'+E(extraRoutes[key]||'#/settings')+'">Open related module</a>','file');
}
function createModal(title,body,onsave,buttonLabel='Save'){
 const overlay=document.createElement('div');overlay.className='cfg30-backdrop';
 overlay.innerHTML='<div class="cfg30-dialog" role="dialog" aria-modal="true" aria-label="'+E(title)+'">'+
 '<header><h3>'+E(title)+'</h3><button type="button" data-modal-close aria-label="Close">'+glyph('close')+'</button></header>'+
 '<form class="cfg30-dialog-form"><div class="cfg30-dialog-body">'+body+
 '<p class="cfg30-error" role="alert" hidden></p></div>'+
 '<footer><button type="button" data-modal-cancel>Cancel</button><button class="cfg30-btn gradient" type="submit">'+E(buttonLabel)+'</button></footer></form></div>';
 document.body.appendChild(overlay);
 const dialog=overlay.querySelector('.cfg30-dialog'),form=overlay.querySelector('form'),err=overlay.querySelector('.cfg30-error');
 const close=()=>{overlay.remove();document.removeEventListener('keydown',onkey);};
 const onkey=e=>{if(e.key==='Escape'){e.preventDefault();close();}};
 document.addEventListener('keydown',onkey);
 overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
 overlay.querySelector('[data-modal-close]').onclick=close;
 overlay.querySelector('[data-modal-cancel]').onclick=close;
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(!form.reportValidity())return;
  const submit=form.querySelector('[type=submit]');submit.disabled=true;err.hidden=true;
  try{await onsave(form,dialog);close();}
  catch(ex){err.hidden=false;err.textContent=ex.message||String(ex);submit.disabled=false;}
 });
 return {overlay,dialog,form,close};
}
function modalInput(name,label,value='',type='text',extra=''){
 return '<label class="cfg30-dialog-label">'+E(label)+'<input name="'+E(name)+'" value="'+E(value)+'" type="'+E(type)+'" '+extra+'></label>';
}
function modalSelect(name,label,options,value){
 return '<label class="cfg30-dialog-label">'+E(label)+'<select name="'+E(name)+'">'+
 options.map(x=>'<option value="'+E(x[0])+'" '+(String(x[0])===String(value)?'selected':'')+'>'+E(x[1])+'</option>').join('')+'</select></label>';
}
function dialModal(root,data,entry){
 const edit=!!entry;
 createModal(edit?'Edit speed dial':'Add code',
  modalInput('code','Code (1–99)',entry?.code||'','text','pattern="[0-9]{1,2}" required')+
  modalSelect('kind','Calls',[['number','Phone number'],['staff','Staff'],['branch','Branch']],entry?.kind||'number')+
  modalInput('phone','Phone number',entry?.phone||'','tel','required')+
  modalInput('label','Label',entry?.label||'')+
  '<label><input type="checkbox" name="is_active" '+(entry?.is_active!==false?'checked':'')+'> Active</label>',
  async form=>{
   const body={code:form.elements.code.value,kind:form.elements.kind.value,phone:form.elements.phone.value,
    label:form.elements.label.value,is_active:form.elements.is_active.checked};
   if(edit)await G.put(api+'/dials/'+entry.id,body);else await G.post(api+'/dials',body);
   G.toast('Speed dial saved','ok');await open(root,'communications');
  });
}
function subscriptionModal(root,data,entry){
 const edit=!!entry;
 const s=entry||{event_types:['New booking'],channel:'whatsapp',endpoint:'phone',contacts:[],only_sources:false,booking_sources:[],quiet_hours:false};
 const contacts=s.contacts?.length?s.contacts:[{phone:'',name:''}];
 const selectedEvents=(s.event_types||[]).map(eventLabel);
 const body='<div class="cfg30-dialog-label">Event</div>'+
  '<div class="cfg30-event-chips">'+EVENTS.map(ev=>
   '<label class="'+(selectedEvents.includes(ev)?'active':'')+'"><input type="checkbox" data-event value="'+E(ev)+'" '+(selectedEvents.includes(ev)?'checked':'')+'>'+E(ev)+'</label>').join('')+'</div>'+
  modalSelect('protocol','Protocol',[['whatsapp','WhatsApp'],['push','App push']],s.channel||'whatsapp')+
  modalSelect('endpoint','Endpoint',[['phone','Phone number'],['booking_passenger','Passenger of the booking'],
   ['crew','Crew of the trip'],['office','Office team']],s.endpoint||'phone')+
  '<div data-contact-area>'+
   '<label class="cfg30-dialog-label">Find one of your users by name or phone<input data-user-search placeholder="Find one of your users by name or phone" autocomplete="off"></label>'+
   '<div class="cfg30-user-hits" data-user-hits hidden></div><div data-contact-rows>'+
   contacts.map((c,i)=>'<div class="cfg30-contact-row">'+modalInput('mobile_'+i,'',c.phone,'tel',
    (i===0?'required':'')+' placeholder="Mobile number *"')+
    modalInput('name_'+i,'',c.name,'text','placeholder="Name (optional)"')+
    '<button type="button" data-contact-remove aria-label="Remove contact">×</button></div>').join('')+
   '</div><button class="cfg30-link" data-contact-add type="button">+ Add another contact</button></div>'+
  '<div class="cfg30-dialog-label">Booking source</div>'+
  '<label class="cfg30-switch-row"><span><strong>Only some booking sources</strong>'+
   '<small>Off — sent for bookings from every source</small></span><input type="checkbox" name="only_sources" '+(s.only_sources?'checked':'')+
   '><span class="cfg30-switch-ui"></span></label>'+
  '<div data-source-list '+(s.only_sources?'':'hidden')+'>'+
   SOURCE.map(v=>'<label class="cfg30-check"><input type="checkbox" data-source value="'+E(v)+'" '+((s.booking_sources||[]).includes(v)?'checked':'')+'>'+E(v)+'</label>').join('')+'</div>'+
  '<details class="cfg30-filter"><summary>Filter — optional</summary>'+
   switchRow('quiet_hours','Quiet hours','Hold messages overnight, send in the morning',s.quiet_hours)+'</details>';
 const m=createModal(edit?'Edit subscription':'Create subscription',body,async form=>{
  const checked=[...form.querySelectorAll('[data-event]:checked')].map(n=>n.value);
  if(!checked.length)throw Error('Select at least one event');
  const contacts=[...form.querySelectorAll('.cfg30-contact-row')].map(row=>({
   phone:row.querySelector('[name^=mobile_]').value.trim(),name:row.querySelector('[name^=name_]').value.trim()})).filter(x=>x.phone);
  const body={event_types:checked,protocol:form.elements.protocol.value,endpoint:form.elements.endpoint.value,
   contacts:form.elements.endpoint.value==='phone'?contacts:[],only_sources:form.elements.only_sources.checked,
   booking_sources:[...form.querySelectorAll('[data-source]:checked')].map(x=>x.value),
   quiet_hours:form.elements.quiet_hours.checked,enabled:s.enabled!==false};
  if(edit)await G.put(api+'/subscriptions/'+entry.id,body);else await G.post(api+'/subscriptions',body);
  G.toast(edit?'Subscription updated':'Subscription created','ok');await open(root,'notifications');
 },edit?'Save subscription':'Create subscription');
 const form=m.form;
 const updateEvent=()=>form.querySelectorAll('.cfg30-event-chips label').forEach(l=>l.classList.toggle('active',l.querySelector('input').checked));
 form.querySelectorAll('[data-event]').forEach(x=>x.addEventListener('change',updateEvent));
 form.elements.only_sources.addEventListener('change',()=>form.querySelector('[data-source-list]').hidden=!form.elements.only_sources.checked);
 const showContacts=()=>{
  const isPhone=form.elements.endpoint.value==='phone';
  form.querySelector('[data-contact-area]').hidden=!isPhone;
  form.querySelectorAll('[name^=mobile_]').forEach((x,i)=>{x.required=isPhone&&i===0;});
 };
 form.elements.endpoint.addEventListener('change',showContacts);showContacts();
 const contactRows=form.querySelector('[data-contact-rows]');
 function addContact(phone='',name=''){
  const index=contactRows.querySelectorAll('.cfg30-contact-row').length;
  const row=document.createElement('div');row.className='cfg30-contact-row';
  row.innerHTML=modalInput('mobile_'+index,'',phone,'tel','placeholder="Mobile number *"')+
    modalInput('name_'+index,'',name,'text','placeholder="Name (optional)"')+
   '<button type="button" data-contact-remove aria-label="Remove contact">×</button>';
  contactRows.appendChild(row);
 }
 form.querySelector('[data-contact-add]').onclick=()=>addContact();
 contactRows.addEventListener('click',e=>{const btn=e.target.closest('[data-contact-remove]');if(!btn)return;
  if(contactRows.children.length===1){const row=btn.closest('.cfg30-contact-row');row.querySelectorAll('input').forEach(i=>i.value='');return;}
  btn.closest('.cfg30-contact-row').remove();
 });
 const search=form.querySelector('[data-user-search]'),hits=form.querySelector('[data-user-hits]');
 search.addEventListener('input',()=>{
  const v=search.value.trim().toLowerCase();const matches=v.length<2?[]:(data.users||[]).filter(u=>
    (u.name||'').toLowerCase().includes(v)||String(u.phone||'').includes(v)).slice(0,8);
  hits.hidden=!matches.length;
  hits.innerHTML=matches.map(u=>'<button type="button" data-found-user="'+E(u.id)+'">'+E(u.name)+' · '+E(u.phone)+'</button>').join('');
 });
 hits.addEventListener('click',e=>{
  const btn=e.target.closest('[data-found-user]');if(!btn)return;
  const u=(data.users||[]).find(x=>String(x.id)===btn.dataset.foundUser);if(!u)return;
  let row=[...contactRows.querySelectorAll('.cfg30-contact-row')].find(r=>!r.querySelector('[name^=mobile_]').value.trim());
  if(!row){addContact();row=contactRows.lastElementChild;}
  row.querySelector('[name^=mobile_]').value=u.phone||'';
  row.querySelector('[name^=name_]').value=u.name||'';
  hits.hidden=true;search.value='';
 });
}
function groupModal(root,data,key){
 const v=data.sections.communications;
 const field=key==='crew'?'crew_extra':'office_extra',arr=v[field]||[];
 createModal(key==='crew'?'Crew of the trip':'Office team',
  '<p class="cfg30-description">Additional contacts beyond the automatically determined staff. Uncheck existing numbers to remove them.</p>'+
  '<div class="cfg30-group-list">'+arr.map(x=>'<label class="cfg30-check"><input type="checkbox" data-keep-group value="'+E(x)+'" checked> '+E(x)+'</label>').join('')+
  (arr.length?'':'<p>No additional contacts yet.</p>')+'</div>'+
  modalInput('person','Add a person by mobile number','','tel','placeholder="Mobile number (optional)"'),
  async form=>{
   const retained=[...form.querySelectorAll('[data-keep-group]:checked')].map(x=>x.value);
   const value=form.elements.person.value.trim();
   const entries=[...new Set([...retained,...(value?[value]:[])])];
   await save('communications',{[field]:entries});
   G.toast('Group contacts updated','ok');await open(root,state.section);
  },'Save group');
}
function attachChips(root,section,data){
 root.querySelectorAll('.cfg30-tags').forEach(tag=>{
  const input=tag.querySelector('[data-add-chip]');if(!input)return;
  const owner=tag.closest('[data-city-phones]'),container=tag.closest('.cfg30-field');
  function target(){
   if(owner){const i=Number(owner.dataset.cityPhones);return data.sections.communications.city_contacts[i].phones;}
   const label=container?.querySelector('.cfg30-label')?.textContent||'';
   return label.includes('ESCALATION')?data.sections.communications.escalation_contacts:data.sections.communications.published_office_numbers;
  }
  async function modify(values){
   if(owner){const list=[...data.sections.communications.city_contacts];list[Number(owner.dataset.cityPhones)]={...list[Number(owner.dataset.cityPhones)],phones:values};await save('communications',{city_contacts:list});}
   else{const label=container?.querySelector('.cfg30-label')?.textContent||'';
    const key=label.includes('ESCALATION')?'escalation_contacts':'published_office_numbers';
    await save('communications',{[key]:values});}
   await open(root,section);
  }
  input.addEventListener('keydown',async e=>{
   if(e.key!=='Enter')return;e.preventDefault();const v=input.value.trim();if(!v)return;
   try{await modify([...new Set([...target(),v])]);}catch(ex){G.err(ex);}
  });
  tag.querySelectorAll('[data-remove-chip]').forEach(btn=>btn.onclick=async()=>{
   try{await modify(target().filter(x=>x!==btn.dataset.removeChip));}catch(ex){G.err(ex);}
  });
 });
}
function bind(root,data,section){
 const area=root.querySelector('[data-cfg30-content]');
 const v=data.sections[section]||{};
 const gather=()=>{
  const result={};
  area.querySelectorAll('input[name],textarea[name],select[name]').forEach(n=>{
   if(n.readOnly||n.disabled)return;
   if(n.type==='radio'&&!n.checked)return;
   result[n.name]=n.type==='checkbox'?n.checked:n.type==='number'?(n.value===''?0:Number(n.value)):n.value;
  });
  return result;
 };
 const submit=root.querySelector('[data-cfg30-save]');
 if(!editable()){submit.disabled=true;area.querySelectorAll('input,select,textarea,button').forEach(x=>x.disabled=true);return;}
 area.addEventListener('input',()=>{state.dirty=true;submit.classList.add('changed');});
 area.addEventListener('change',()=>{state.dirty=true;submit.classList.add('changed');});
 submit.onclick=async()=>{
  if(!['business','website','communications','notifications'].includes(section)){G.toast('Open the linked module for these settings','bad');return;}
  submit.disabled=true;
  try{
   const payload=gather();
   // City contacts are handled by a separate validated editor.
   const result=await save(section,payload);data.sections[section]=result.value;
   state.dirty=false;submit.classList.remove('changed');G.toast('Configuration saved','ok');
  }catch(ex){G.err(ex);}finally{submit.disabled=false;}
 };
 if(section==='communications'){
  attachChips(root,section,data);
  area.querySelector('[data-dial-add]')?.addEventListener('click',()=>dialModal(root,data,null));
  area.querySelectorAll('[data-dial-edit]').forEach(btn=>btn.onclick=()=>{
   const d=(data.dials||[]).find(x=>String(x.id)===btn.dataset.dialEdit);
   if(d)dialModal(root,data,d);
  });
  area.querySelectorAll('[data-dial-delete]').forEach(btn=>btn.onclick=async()=>{
   if(!await G.confirm('Delete this speed dial?',{danger:true,ok:'Delete'}))return;
   try{await G.del(api+'/dials/'+btn.dataset.dialDelete);await open(root,section);}catch(ex){G.err(ex);}
  });
  area.querySelector('[data-city-add]')?.addEventListener('click',()=>{
   createModal('Add City',modalInput('city','City name','','text','required')+modalInput('phone','Phone number','','tel','required'),async f=>{
    const city=f.elements.city.value,phone=f.elements.phone.value;
    await save('communications',{city_contacts:[...data.sections.communications.city_contacts,{city,phones:[phone]}]});
    await open(root,section);
   },'Add City');
  });
  area.querySelectorAll('[data-city-remove]').forEach(btn=>btn.onclick=async()=>{
   if(!await G.confirm('Remove this city?',{danger:true,ok:'Remove'}))return;
   try{const cities=data.sections.communications.city_contacts.filter((x,i)=>i!==Number(btn.dataset.cityRemove));
    await save('communications',{city_contacts:cities});await open(root,section);}catch(e){G.err(e);}
  });
  area.querySelectorAll('[data-city-name]').forEach(x=>x.addEventListener('change',async()=>{
   try{const i=Number(x.dataset.cityName),list=[...data.sections.communications.city_contacts];
    list[i]={...list[i],city:x.value};await save('communications',{city_contacts:list});await open(root,section);}
   catch(e){G.err(e);}
  }));
  area.querySelectorAll('[data-group-add],[data-group-view]').forEach(b=>b.onclick=()=>groupModal(root,data,b.dataset.groupAdd||b.dataset.groupView));
 }
 if(section==='notifications'){
  area.querySelector('[data-sub-add]')?.addEventListener('click',()=>subscriptionModal(root,data,null));
  area.querySelectorAll('[data-sub-edit]').forEach(btn=>btn.onclick=()=>{
   if(['crew','office'].includes(btn.dataset.subEdit)){groupModal(root,data,btn.dataset.subEdit);return;}
   const row=(data.subscriptions||[]).find(x=>String(x.id)===btn.dataset.subEdit);
   if(row)subscriptionModal(root,data,row);
  });
  area.querySelectorAll('[data-sub-delete]').forEach(btn=>btn.onclick=async()=>{
   if(!await G.confirm('Delete this subscription?',{danger:true,ok:'Delete'}))return;
   try{await G.del(api+'/subscriptions/'+btn.dataset.subDelete);await open(root,section);}catch(e){G.err(e);}
  });
  area.querySelectorAll('[data-sub-toggle]').forEach(input=>input.addEventListener('change',async()=>{
   const id=input.dataset.subToggle;
   try{
    if(id==='crew'||id==='office')await save('notifications',{[id==='crew'?'builtin_crew_push':'builtin_office_push']:input.checked});
    else await G.put(api+'/subscriptions/'+id,{enabled:input.checked});
    await open(root,section);
   }catch(e){G.err(e);input.checked=!input.checked;}
  }));
  area.querySelectorAll('[data-sub-test]').forEach(btn=>btn.onclick=async()=>{
   try{await G.post(api+'/subscriptions/'+btn.dataset.subTest+'/test',{});}
   catch(e){G.err(e);}
  });
  area.querySelectorAll('[data-group-view]').forEach(btn=>btn.onclick=()=>groupModal(root,data,btn.dataset.groupView));
 }
 area.querySelectorAll('[data-log-toggle]').forEach(btn=>btn.onclick=()=>{
  const box=btn.nextElementSibling;box.hidden=!box.hidden;
  btn.setAttribute('aria-expanded',String(!box.hidden));
 });
 area.querySelectorAll('[data-pnr-lookup]').forEach(btn=>btn.onclick=async()=>{
  const wrap=btn.closest('[data-log-box]'),input=wrap.querySelector('[data-pnr]'),target=wrap.querySelector('[data-log-result]');
  try{const result=await G.get(api+'/delivery-log/'+encodeURIComponent(input.value.trim()));
   target.innerHTML='<p>'+E(result.note)+'</p>'+(result.rows||[]).map(x=>
    '<p>'+E(x.at)+' · '+E(x.event)+' · '+E(x.channel)+' · '+E(x.status)+'</p>').join('');
  }catch(e){target.textContent=e.message;}
 });
}
async function open(root,section){
 state.section=section;
 const data=await get();state.record=data;
 const v=data.sections[section]||{};
 const content=['business','website','communications','notifications'].includes(section)?
  ({business:businessPage,website:websitePage,communications:communicationsPage,notifications:notificationPage}[section])(v,data):unshownPage(section);
 root.innerHTML='<div class="cfg30-root"><header class="cfg30-header">'+icon('save')+
  '<h1>Configuration</h1><button type="button" class="cfg30-btn gradient" data-cfg30-save>'+glyph('save')+' Save</button></header>'+
  '<div class="cfg30-layout"><aside class="cfg30-sidebar" aria-label="Configuration sections">'+
  menu.map(([key,title])=>'<a class="'+(key===section?'active':'')+'" href="#/settings/configuration/'+E(key)+'" data-cfg30-tab="'+E(key)+'">'+icon(key)+E(title)+'</a>').join('')+
  '</aside><main data-cfg30-content class="cfg30-main">'+content+'</main></div></div>';
 bind(root,data,section);state.dirty=false;
}
G.screens.settings=async function(el,p){
 if(p?.[0]!=='configuration')return previous(el,p);
 const alias={'business-info':'business','business_info':'business','calling':'communications'};
 const key=alias[p[1]]||p[1]||'business';
 try{await open(el,key);}catch(e){el.innerHTML='<div class="cfg30-error">'+E(e.message)+'</div>';G.err(e);}
};
G.configurationVersion='v30';
})();
