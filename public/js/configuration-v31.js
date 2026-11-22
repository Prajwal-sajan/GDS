/* Configuration v31: remaining 8 reference sections.
   Extends the existing v30 screen/Save workflow; no alternate settings store. */
(function(){
'use strict';
if(!window.G||!G.screens?.settings)return;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const titles={pricing:'Pricing',office:'Office Booking',vehicle:'Vehicle Alerts',expenses:'Expenses',
 seats:'Seat legends',monitoring:'Post-Trip Monitoring',whatsapp:'WhatsApp Alerts',bot:'AI Bot'};
const symbols={
 pricing:'<path d="M5 4h14M5 9h14M7 4c11 0 11 8 0 8l9 8"/>',
 office:'<path d="M4 10h16l-2 4H6l-2-4zM5 10l2-6h10l2 6M6 14v7h12v-7M10 21v-5h4v5"/>',
 vehicle:'<rect x="4" y="3" width="16" height="17" rx="3"/><path d="M4 12h16M7 20v2m10-2v2M8 16h2m4 0h2"/>',
 expenses:'<path d="M4 3h11v18H4zM7 7h5M15 10l3 2 2 0 1 2v5a2 2 0 0 1-4 0v-5"/>',
 seats:'<path d="M12 3a9 9 0 1 0 3 17c3-2 0-4 0-5s5-2 6-5c1-4-4-7-9-7z"/><circle cx="7.5" cy="11" r=".8"/><circle cx="11" cy="7" r=".8"/><circle cx="17" cy="9" r=".8"/>',
 monitoring:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="2"/><path d="m12 12 8-8"/>',
 whatsapp:'<path d="M4 4h16v14H9l-5 4V4z"/>',
 bot:'<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 8V4M9 4h6M8 14h1m6 0h1M9 18h6"/>',
 gauge:'<path d="M5 17a9 9 0 1 1 14 0M12 15l4-6"/><circle cx="12" cy="17" r="1"/>',
 signal:'<path d="M4 15q8-9 16 0M7 18q5-5 10 0M12 21v0M4 4l16 16"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
 fuel:'<rect x="5" y="3" width="10" height="18" rx="1"/><path d="M8 7h4M15 10l4 2v6a2 2 0 0 0 4 0v-5l-4-4"/>',
 bell:'<path d="M6 9a6 6 0 1 1 12 0v7l3 3H3l3-3V9M10 22h4"/>',
 map:'<path d="m12 21 7-10a8 8 0 1 0-14 0l7 10z"/><circle cx="12" cy="10" r="2"/>',
 bolt:'<path d="m13 2-9 12h7l-1 8 10-12h-8z"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
 shine:'<path d="m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z"/>',
 metro:'<rect x="5" y="3" width="14" height="17" rx="3"/><path d="M5 13h14M9 20l-3 2m9-2 3 2M9 9h1m4 0h1"/>'
};
function svg(name){return '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'+(symbols[name]||symbols.shine)+'</svg>';}
function badge(name,color){return '<span class="cfg30-icon cfg31-icon cfg31-'+esc(color||name)+'">'+svg(name)+'</span>';}
function heading(section){return '<section class="cfg30-block-title cfg31-heading">'+badge(section,section)+
 '<div><h2>'+esc(titles[section])+'</h2><p>Configuration</p></div></section>';}
function card(title,content,ico,sub='',theme=''){
 return '<section class="cfg30-card cfg31-card">'+
  '<div class="cfg30-card-heading">'+badge(ico,theme||ico)+'<div><h3>'+esc(title)+'</h3>'+
  (sub?'<p>'+esc(sub)+'</p>':'')+'</div></div>'+content+'</section>';
}
function grid(body,cols=2){return '<div class="cfg30-grid '+(cols===3?'cfg31-grid3':'')+'">'+body+'</div>';}
function input(name,label,value,icon,placeholder=''){
 return '<label class="cfg30-field"><span class="cfg30-label">'+esc(label)+'</span>'+
 '<span class="cfg30-input-wrap">'+badge(icon||'user')+
 '<input type="text" name="'+esc(name)+'" value="'+esc(value??'')+'" placeholder="'+esc(placeholder)+'"></span></label>';
}
function num(name,label,value,unit,max,precision=false,help=''){
 const val=value==null?'':(precision&&Number.isInteger(value)&&
  ['fuel_max_odometer_km','idling_max_odometer_km','move_distance_km','response_delay_seconds'].includes(name)
  ?Number(value).toFixed(1):value);
 const step=precision?'any':'1';
 return '<label class="cfg30-field"><span class="cfg30-label">'+esc(label)+'</span>'+
 '<span class="cfg30-input-wrap cfg30-number-wrap"><input name="'+esc(name)+'" type="number" '+
 'min="0" max="'+max+'" step="'+step+'" value="'+esc(val)+'" '+(value==null?'placeholder="99.28"':'')+'>'+
 '<span class="cfg30-unit">'+esc(unit||'')+'</span></span>'+
 (help?'<small class="cfg30-help">'+esc(help)+'</small>':'')+'</label>';
}
function switchRow(key,title,desc,value){
 return '<label class="cfg30-switch-row"><span><strong>'+esc(title)+'</strong><small>'+esc(desc)+'</small></span>'+
 '<input name="'+esc(key)+'" type="checkbox" '+(value?'checked':'')+'>'+
 '<span class="cfg30-switch-ui"></span></label>';
}
function select(name,label,value,choices,help=''){
 return '<label class="cfg30-field"><span class="cfg31-select-title">'+esc(label)+'</span><span class="cfg31-select-wrap '+(name==='respond_to_user_types'?'cfg31-select-with-icon':'')+'">'+
 (name==='respond_to_user_types'?badge('user'):'')+
 '<select name="'+esc(name)+'" aria-label="'+esc(label)+'">'+choices.map(([val,title])=>
 '<option value="'+esc(val)+'" '+(String(value)===String(val)?'selected':'')+'>'+esc(title)+'</option>').join('')+
 '</select></span>'+(help?'<small class="cfg30-help">'+esc(help)+'</small>':'')+'</label>';
}
function note(msg){return '<p class="cfg31-provider-note">'+svg('bell')+' '+esc(msg)+'</p>';}
function chips(name,items,kind='phone'){
 return '<div class="cfg31-chipwrap" data-cfg31-chips="'+esc(name)+'" data-kind="'+esc(kind)+'" role="group" aria-label="'+esc(name.replace(/_/g,' '))+'">'+
 (items||[]).map(item=>chip(item)).join('')+
 '<input type="'+(kind==='phone'?'tel':'text')+'" data-cfg31-chip-entry placeholder="Add '+(kind==='phone'?'number':'keyword')+' and press Enter" aria-label="Add '+(kind==='phone'?'number':'keyword')+'">'+
 '</div>';
}
function chip(text){return '<span class="cfg31-chip" data-cfg31-chip="'+esc(text)+'">'+esc(text)+
 ' <button type="button" data-cfg31-delete-chip aria-label="Remove '+esc(text)+'">×</button></span>';}
const seats=[
 ['branch','Branch'],['mine','Mine'],['my_branch','My branch'],['agent','Agent'],
 ['online_otas','Online (OTAs)'],['website','Website'],['other','Other']
];
const sex=[['male','Male'],['female','Female'],['not_given','Not given']];
function colorChip(key,label,color,ring=false){
 return '<label class="cfg31-seat-color '+(ring?'cfg31-ring-color':'')+'">'+
 '<span class="cfg31-color-input" style="--legend-color:'+esc(color)+'">'+
 (ring?'<span></span>':'')+
 '<input type="color" data-cfg31-color="'+esc(key)+'" value="'+esc(color)+'" aria-label="'+esc(label)+' colour"></span>'+
 '<span>'+esc(label)+'</span></label>';
}
function pricing(v){
 return heading('pricing')+
 card('Dynamic Pricing',
  switchRow('dynamic_pricing_enabled','Dynamic Pricing',
  "Show AI benchmark and recommended fares while editing a schedule's fares.",v.dynamic_pricing_enabled)+
  switchRow('sarathi_ai_assistant_enabled','Sarathi AI assistant',
  'Let staff ask questions about this operator’s buses in plain language. Enabling requires the assistant service; you can turn it off here.',v.sarathi_ai_assistant_enabled)+
  '<div class="cfg31-inset">'+
   num('manual_pair_fare_hold_hours','MANUAL PAIR FARE HOLD',v.manual_pair_fare_hold_hours,'H',720,true)+
   '<p class="cfg31-help">On auto-priced trips, a fare you set for a single boarding → dropping pair is kept for this many hours after you save it. After that the pair follows the main fare again (main fare × weightage, inside your Min/Max). Trips without auto pricing keep pair fares until you change them. Default 3. Use 0 to always follow the main fare.</p></div>',
  'pricing','AI fare recommendations from live market data, shown on the schedule Fares tab.','pricing')+
 note('Pricing and Sarathi switches save preferences only. No model promotion, fare publication or third-party AI activation is performed.');
}
const HOLD=[['until_departure','Until departure'],['5','5 minutes'],['10','10 minutes'],
 ['15','15 minutes'],['20','20 minutes'],['30','30 minutes'],['45','45 minutes'],
 ['60','1 hour'],['90','1 hour 30 minutes'],['120','2 hours'],['180','3 hours'],
 ['240','4 hours'],['360','6 hours'],['720','12 hours'],['1440','24 hours']];
function office(v){
 return heading('office')+card('Office Booking',
 '<div class="cfg31-inset"><h4>Seat hold for QR / payment link</h4>'+
 grid(select('default_hold','DEFAULT HOLD',v.default_hold,HOLD)+
 select('max_hold','MAXIMUM HOLD',v.max_hold,HOLD))+
 '<p class="cfg31-help">The booking screen starts with the default. Staff can change it for a booking, up to the maximum, and can extend a hold only up to the maximum from now. Unpaid seats go back on sale when the hold ends. A hold never runs past departure.</p></div>',
 'office','Rules for bookings made at your counters and by your staff in this app.','office');
}
function vehicle(v){
 return heading('vehicle')+
 card('Vehicle Alerts',switchRow('enabled','Enable Vehicle Alerts','Receive alerts for vehicle anomalies',v.enabled),'vehicle','','vehicle')+
 card('Fuel Theft Detection',grid(
 num('fuel_drop_threshold_liters','FUEL DROP THRESHOLD (LITERS)',v.fuel_drop_threshold_liters,'L',10000,true)+
 num('fuel_window_minutes','WINDOW (MINUTES)',v.fuel_window_minutes,'MIN',10080)+
 num('fuel_max_odometer_km','MAX ODOMETER (KM)',v.fuel_max_odometer_km,'KM',10000,true)+
 num('fuel_max_engine_hours','MAX ENGINE HOURS',v.fuel_max_engine_hours,'HRS',240,true)),'fuel','','vehicle')+
 card('Overspeeding',grid(
 num('overspeed_speed_limit_kmh','SPEED LIMIT (KM/H)',v.overspeed_speed_limit_kmh,'KM/H',250,true)+
 num('overspeed_consecutive_readings','CONSECUTIVE READINGS',v.overspeed_consecutive_readings,'',100)
 ),'gauge','','vehicle')+
 card('Excessive Idling',grid(
 num('idling_duration_minutes','DURATION (MINUTES)',v.idling_duration_minutes,'MIN',1440)+
 num('idling_max_odometer_km','MAX ODOMETER (KM)',v.idling_max_odometer_km,'KM',1000,true)
 ),'fuel','','vehicle')+
 card('Device Offline',grid(
 num('offline_threshold_minutes','OFFLINE THRESHOLD (MINUTES)',v.offline_threshold_minutes,'MIN',10080)
 ),'signal','','vehicle')+
 card('Alert Recipients','<label class="cfg30-field"><span class="cfg30-label">WHATSAPP NUMBERS</span>'+
 chips('alert_recipients',v.alert_recipients||[])+'</label>','whatsapp','','vehicle')+
 note('An authorized GPS/telematics provider and WhatsApp delivery channel must be connected before vehicle alerts can actually run.');
}
function expenses(v){
 return heading('expenses')+card('Expenses',
 '<div class="cfg31-expense">'+num('diesel_cost_per_litre','DIESEL COST PER LITRE',
 v.diesel_cost_per_litre,'₹/L',100000,true)+
 '<p class="cfg31-help">When a trip completes, its Diesel expense = fuel consumed (from telematics) × this price. Leave empty to keep the route’s Diesel amount.</p></div>',
 'expenses','Inputs used to work out each trip’s actual expenses.','expenses')+
 note('Diesel rate is operator-specific; the reference rate ₹99.28/L is shown as a placeholder, not copied as a live rate.');
}
function legends(v){
 const color=v.colors||{};
 return heading('seats')+card('Seat legends',
 '<p class="cfg31-help">Using the default: seats filled by gender, ring on Branch and Agent tickets.</p>'+
 '<div class="cfg31-legend-head"><strong>Fill seats by</strong>'+
 select('fill_seats_by','Fill seats by',v.fill_seats_by,
  [['gender','Gender'],['booking_channel','Booking channel'],['none','None']])+
 '<span>Male / Female passenger</span></div>'+
 '<div class="cfg31-legend-swatches">'+sex.map(([key,label])=>colorChip(key,label,color[key]||'#ffffff')).join('')+'</div>'+
 '<div class="cfg31-horizontal-divider"></div>'+
 '<div class="cfg31-legend-head"><strong>Outer ring by</strong>'+
 select('outer_ring_by','Outer ring by',v.outer_ring_by,
  [['booking_channel','Booking channel'],['none','None']])+
 '<span>Tick a value to ring its seats.</span></div>'+
 '<div class="cfg31-ring-grid">'+seats.map(([key,label])=>
  '<label class="cfg31-ring-option"><input type="checkbox" data-cfg31-ring="'+key+'" '+
  ((v.ring_channels||[]).includes(key)?'checked':'')+'>'+
  '<span class="cfg31-ring-tile" style="--legend-color:'+esc(color[key]||'#a7adc0')+'"></span>'+
  '<span>'+esc(label)+'</span></label>').join('')+'</div>'+
 '<div class="cfg31-color-tip">Click a colour square to adjust the legend colour.</div>'+
 '<p class="cfg31-seat-footer">Blocked, no-show and selected seats keep their own colours. Passenger view and Copy image always use the default colours.</p>',
 'seats','Choose what the colours of booked seats show on the Book and Manage seat layouts.','seats');
}
function monitoring(v){
 return heading('monitoring')+
 card('Post-Trip Monitoring',switchRow('enabled','Enable Post-Trip Monitoring','Monitor vehicles after trips end',v.enabled),
  'monitoring','','monitoring')+
 card('Monitoring Thresholds',grid(
 num('monitor_window_hours','MONITOR WINDOW (HOURS)',v.monitor_window_hours,'HRS',720,true)+
 num('baseline_ttl_hours','BASELINE TTL (HOURS)',v.baseline_ttl_hours,'HRS',8760,true)+
 num('alert_cooldown_minutes','ALERT COOLDOWN (MINUTES)',v.alert_cooldown_minutes,'MIN',10080)+
 num('move_distance_km','MOVE DISTANCE (KM)',v.move_distance_km,'KM',10000,true)+
 num('geofence_radius_meters','GEOFENCE RADIUS (METERS)',v.geofence_radius_meters,'M',100000,true)+
 num('move_speed_kmh','MOVE SPEED (KM/H)',v.move_speed_kmh,'KM/H',250,true)+
 num('engine_on_minutes','ENGINE ON (MINUTES)',v.engine_on_minutes,'MIN',10080)+
 num('engine_idle_speed_kmh','ENGINE IDLE SPEED (KM/H)',v.engine_idle_speed_kmh,'KM/H',100,true)+
 num('fuel_drop_liters','FUEL DROP (LITERS)',v.fuel_drop_liters,'L',10000,true)+
 num('fuel_drop_percent','FUEL DROP (%)',v.fuel_drop_percent,'%',100,true)
 ,3),'clock','','monitoring')+
 note('Monitoring thresholds are stored, but real alerts require verified GPS/fuel telemetry and an enabled monitoring worker.');
}
function whatsapp(v){
 return heading('whatsapp')+card('WhatsApp Operational Alerts',
 switchRow('enabled','Enable WhatsApp Alerts','Send operational alerts via WhatsApp',v.enabled)+
 '<label class="cfg30-field"><span class="cfg30-label">RECIPIENTS</span>'+
 chips('recipients',v.recipients||[])+'</label>',
 'whatsapp','','whatsapp')+
 note('This screen cannot send alerts until an authorized WhatsApp Business integration is connected.');
}
function bot(v){
 return heading('bot')+
 card('AI Bot',switchRow('enabled','Enable AI Bot','Automatically respond to passenger messages',v.enabled),
  'bot','','bot')+
 card('Response Behavior',grid(
 select('respond_to_user_types','RESPOND TO USER TYPES',(v.respond_to_user_types||['passenger'])[0],
 [['passenger','passenger'],['driver','driver'],['agent','agent'],['staff','staff'],['all','all']])+
 num('max_responses_per_passenger','MAX RESPONSES PER PASSENGER',v.max_responses_per_passenger,'',1000)+
 num('response_delay_seconds','RESPONSE DELAY (SECONDS)',v.response_delay_seconds,'SEC',120,true)+
 '<label class="cfg30-field"><span class="cfg30-label">ESCALATION KEYWORDS</span>'+
 chips('escalation_keywords',v.escalation_keywords||[],'keyword')+'</label>'
 ),'shine','','bot')+
 card('Metro Integration',
 switchRow('free_metro_ticket_enabled','Free Metro Ticket','Enable free metro ticket for passengers',v.free_metro_ticket_enabled)+
 '<div class="cfg31-metro-fields">'+
 input('metro_exchange_point','METRO EXCHANGE POINT',v.metro_exchange_point,'map','e.g. Metro station')+
 '<label class="cfg30-field"><span class="cfg30-label">METRO TICKET INSTRUCTIONS</span>'+
 '<textarea name="metro_ticket_instructions" rows="3" placeholder="Enter the approved passenger instructions">'+
 esc(v.metro_ticket_instructions)+'</textarea></label></div>',
 'metro','','bot')+
 note('AI responses and free metro tickets require separate operational integration and a valid metro agreement. Saving these preferences does not issue a ticket.');
}
const pages={pricing,office,vehicle,expenses,seats,monitoring,whatsapp,bot};
G.configurationExtraPages=pages;
function bind({root,area,section}){
 if(!pages[section])return;
 const editing=typeof window.can!=='function'||window.can('settings.modify');
 if(!editing)return;
 area.querySelectorAll('[data-cfg31-chips]').forEach(widget=>{
  const inp=widget.querySelector('[data-cfg31-chip-entry]');
  const kind=widget.dataset.kind;
  inp.addEventListener('keydown',e=>{
   if(e.key!== 'Enter'&&e.key!==',')return;e.preventDefault();
   let value=inp.value.trim();
   if(kind==='phone')value=value.replace(/[\s()+-]/g,'');
   else value=value.toLowerCase();
   if(!value)return;
   if(kind==='phone'&&!/^[0-9]{10,15}$/.test(value)){
    inp.setCustomValidity('Enter a mobile number with 10 to 15 digits.');inp.reportValidity();return;
   }
   if(kind!=='phone'&&value.length>90){inp.setCustomValidity('Keyword must be 90 characters or less.');inp.reportValidity();return;}
   inp.setCustomValidity('');
   if([...widget.querySelectorAll('[data-cfg31-chip]')].some(x=>x.dataset.cfg31Chip.toLowerCase()===value.toLowerCase())){
    inp.value='';return;
   }
   if(widget.querySelectorAll('[data-cfg31-chip]').length>=40){inp.setCustomValidity('Maximum 40 entries.');inp.reportValidity();return;}
   inp.insertAdjacentHTML('beforebegin',chip(value));inp.value='';
   widget.dispatchEvent(new Event('change',{bubbles:true}));
  });
  inp.addEventListener('input',()=>inp.setCustomValidity(''));
  widget.addEventListener('click',e=>{
   const b=e.target.closest('[data-cfg31-delete-chip]');if(!b)return;
   b.closest('[data-cfg31-chip]').remove();
   widget.dispatchEvent(new Event('change',{bubbles:true}));
  });
 });
 if(section==='seats'){
  area.querySelectorAll('[data-cfg31-color]').forEach(input=>{
   input.addEventListener('input',()=>{
    input.closest('.cfg31-color-input').style.setProperty('--legend-color',input.value);
    input.dispatchEvent(new Event('change',{bubbles:true}));
   });
  });
  const fill=area.querySelector('[name=fill_seats_by]');
  const outer=area.querySelector('[name=outer_ring_by]');
  const refresh=()=>{
   const body=area.querySelector('.cfg31-legend-swatches');
   body.classList.toggle('cfg31-ghost',fill.value==='none');
   area.querySelector('.cfg31-ring-grid').classList.toggle('cfg31-ghost',outer.value==='none');
  };
  fill.addEventListener('change',refresh);outer.addEventListener('change',refresh);refresh();
 }
 if(section==='office'){
  const d=area.querySelector('[name=default_hold]'),m=area.querySelector('[name=max_hold]');
  const rank=x=>x==='until_departure'?Infinity:Number(x);
  const check=()=>{d.setCustomValidity(rank(d.value)>rank(m.value)?'Default hold cannot exceed maximum hold.':'');};
  d.addEventListener('change',check);m.addEventListener('change',check);check();
 }
}
G.configurationExtraBind=bind;
G.configurationExtraGather=function(area,section,result){
 if(!pages[section])return;
 if(section==='expenses'){
  const f=area.querySelector('[name=diesel_cost_per_litre]');
  result.diesel_cost_per_litre=f&&f.value.trim()!==''?Number(f.value):null;
 }
 if(section==='seats'){
  result.ring_channels=[...area.querySelectorAll('[data-cfg31-ring]:checked')].map(x=>x.dataset.cfg31Ring);
  result.colors=Object.fromEntries([...area.querySelectorAll('[data-cfg31-color]')].map(x=>[x.dataset.cfg31Color,x.value]));
  // Preserve ring colours that are not directly editable in this screenshot.
  if(result.outer_ring_by==='none')result.ring_channels=[];
 }
 if(section==='bot'){
  result.respond_to_user_types=[result.respond_to_user_types];
 }
 for(const el of area.querySelectorAll('[data-cfg31-chips]')){
  result[el.dataset.cfg31Chips]=[...el.querySelectorAll('[data-cfg31-chip]')].map(x=>x.dataset.cfg31Chip);
 }
};
G.configurationVersion='v31';
})();
