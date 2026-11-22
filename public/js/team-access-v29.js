/* Access v29: screenshot-accurate, typed Situation field selector. */
(function(){
'use strict';
if(!window.G?.screens?.settings)return;
const prior=G.screens.settings;
const fields=[
 ['caller_id',"The caller's id (91 + mobile)",'mobile'],
 ['acting_operator_id','Operator the caller is acting for','text'],
 ['caller_branch_id',"The caller's branch id",'integer'],
 ['caller_role_names',"The caller's role names (multi-valued)",'list'],
 ['calling_app','Calling app: app | hub | website | gds | partner','app'],
 ['client_ip','Client IP address','ip'],
 ['request_time_utc','Request time (ISO 8601, UTC)','utc'],
 ['operator_hour','Hour of day at the operator (0-23)','hour'],
 ['resource_operator_id','Operator that owns the resource','text'],
 ['booked_by_mobile','Who booked / is assigned (91 + mobile)','mobile'],
 ['sold_branch_id','Branch that sold it (sales boundary)','integer'],
 ['route_id','Route id of the trip','integer'],
 ['stop_city_ids','Cities the trip stops in (multi-valued)','list'],
 ['inside_branch_operations_area',"Inside the caller's branch operations area (Bool)",'bool'],
 ['on_trip_roster','Caller is on the trip roster (Bool)','bool'],
 ['request_amount_inr','Money amount of the request (₹)','money'],
 ['discount_percent','Discount being given (%)','percent'],
 ['fare_change_percent','Fare change being made (±%)','signedPercent'],
 ['seat_count','Seats in the request','seats'],
 ['already_blocked_seats','Seats the caller already holds blocked','seatsZero'],
 ['block_duration_hours','Requested block duration (hours)','hours'],
 ['days_before_departure','Days from now to departure','days'],
 ['hours_before_departure','Hours from now to departure','hours']
];
const escape=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function enhance(root){
 const area=root.querySelector('[data-v28-situation-fields]');
 if(!area||area.dataset.v29Ready)return;
 area.dataset.v29Ready='true';
 area.classList.add('ta29-situation-editor');
 area.innerHTML='<div data-v29-rows class="ta29-rows"></div>'+
  '<div class="ta29-actions"><button type="button" data-v29-add hidden>+ Add another field</button>'+
  '<span data-v29-error role="alert" hidden></span></div>';
 const rows=area.querySelector('[data-v29-rows]');
 const add=area.querySelector('[data-v29-add]');
 const error=area.querySelector('[data-v29-error]');
 const panel=root.querySelector('[data-v28-test-form]');
 const message=x=>{error.textContent=x;error.hidden=!x;};
 function refresh(){
  const all=[...rows.querySelectorAll('[data-v29-row]')];
  add.hidden=!all.some(x=>x.querySelector('[data-v29-field]').value)||all.length>=fields.length;
  all.forEach(x=>{const remove=x.querySelector('[data-v29-remove]');remove.hidden=all.length===1;});
 }
 function controlFor(key){
  const def=fields.find(x=>x[0]===key);
  if(!def)return null;
  let control;
  if(def[2]==='bool'||def[2]==='app'){
   control=document.createElement('select');
   const opts=def[2]==='bool'?[['','value'],['true','True'],['false','False']]:
    [['','value'],...['app','hub','website','gds','partner'].map(x=>[x,x])];
   opts.forEach(([v,label])=>{
    const option=document.createElement('option');option.value=v;option.textContent=label;control.appendChild(option);
   });
  }else{
   control=document.createElement('input');
   control.placeholder='value';
   const kind=def[2];
   if(['integer','hour','money','percent','signedPercent','seats','seatsZero','hours','days'].includes(kind)){
    control.type='number';control.step=['money','percent','signedPercent','hours','days'].includes(kind)?'any':'1';
    if(kind!=='signedPercent')control.min='0';
    if(kind==='percent')control.max='100';
    if(kind==='hour')control.max='23';
    if(kind==='signedPercent')control.min='-100';
    if(kind==='seats')control.min='1';
    if(kind==='seats'||kind==='seatsZero')control.max='500';
    if(kind==='hours')control.max='8760';
    if(kind==='days')control.max='365';
   }else if(kind==='mobile'){control.type='tel';control.inputMode='tel';
    control.pattern='(?:\\+?91)?[6-9][0-9]{9}';control.title='10-digit mobile, optionally prefixed with 91 or +91';
   }else if(kind==='utc'){control.title='UTC ISO 8601, e.g. 2026-11-23T14:30:00Z';
    control.placeholder='value';}
   else if(kind==='list')control.title='Comma-separated values';
   else if(kind==='ip')control.title='IPv4 or IPv6 address';
   control.maxLength=kind==='list'?600:kind==='text'?120:80;
  }
  control.name=key;control.required=true;control.dataset.v29Value='true';
  control.setAttribute('aria-label',def[1]+' value');
  return control;
 }
 function addRow(){
  const row=document.createElement('div');row.className='ta29-row';row.dataset.v29Row='true';
  row.innerHTML='<select data-v29-field aria-label="Situation field">'+
   '<option value="">Choose...</option>'+fields.map(([key,label])=>
    '<option value="'+escape(key)+'">'+escape(label)+'</option>').join('')+'</select>'+
   '<span data-v29-value class="ta29-value"><input placeholder="value" aria-label="Situation value" disabled></span>'+
   '<button type="button" class="ta29-remove" data-v29-remove aria-label="Remove situation field" hidden>×</button>';
  rows.appendChild(row);
  const select=row.querySelector('[data-v29-field]'),holder=row.querySelector('[data-v29-value]');
  select.addEventListener('change',()=>{
   message('');
   if(select.value&&[...rows.querySelectorAll('[data-v29-field]')].some(x=>x!==select&&x.value===select.value)){
    select.value='';message('Choose a different situation field for each row.');
   }
   holder.replaceChildren();
   const ctl=controlFor(select.value);
   if(ctl)holder.appendChild(ctl);
   else holder.innerHTML='<input placeholder="value" aria-label="Situation value" disabled>';
   refresh();
  });
  row.querySelector('[data-v29-remove]').addEventListener('click',()=>{row.remove();message('');refresh();});
  refresh();return row;
 }
 add.addEventListener('click',()=>{const row=addRow();row.querySelector('[data-v29-field]').focus();});
 addRow();
 // The existing v28 submit handler serializes named fields from the Situation area.
 // Keep field selectors unnamed, so only selected typed values reach the test API.
 panel.addEventListener('change',()=>{
  const output=root.querySelector('[data-v28-result]');
  if(output)output.replaceChildren();
 });
}
G.screens.settings=async function(el,p){
 const out=await prior(el,p);
 if(p?.[0]==='team-access'&&p[1]==='access'&&p[2]==='test-access')enhance(el);
 return out;
};
G.teamAccessSituationFieldsV29=fields.map(([key,label,type])=>({key,label,type}));
G.teamAccessVersion='v29';
})();
