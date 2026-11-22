(function(){
'use strict';
if(!window.G?.screens?.accounts||window.__reportSuiteV22)return;
const prior=G.screens.accounts,S=window.ReportSuiteSpecsV22||window.ReportSuiteSpecsV21,base=window.ReportSuiteV21;
if(!S||!base)throw Error('Reports v21 and v22 specifications are required');
const keys=new Set(['frequent-travellers','point-performance','station-performance','trip-pnl']);
window.__reportSuiteV22=true;
const E=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={back:'M20 12H4m8-8-8 8 8 8',print:'M7 8V3h10v5M7 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 15h10v6H7z',download:'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',
 share:'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.5 11 15.5 6M8.5 14l7 5',
 bus:'M4 17V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11H4ZM4 13h16M7 17v3m10-3v3',
 user:'M20 21a8 8 0 0 0-16 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
 calendar:'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
 point:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
 search:'m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
 route:'M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM18 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM9 6h6a4 4 0 0 1 0 8H9a4 4 0 0 0 0 4',
 excel:'M6 2h9l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM14 2v6h6M8 12l6 7m0-7-6 7',
 chevron:'m6 9 6 6 6-6'};
const ico=(name,size=19)=>`<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
const num=n=>Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:0});
const money=n=>'₹'+num(n);
const pct=n=>n===null||n===undefined?'—':Number(n).toFixed(1).replace(/\.0$/,'')+'%';
function display(d,m){
 const [label,key,typ]=m,v=d.summary?.[key];
 if(v===undefined||v===null)return '—';
 if(typ==='money')return money(v);
 if(typ==='number')return num(v);
 if(typ==='pct')return pct(v);
 return E(v);
}
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const shift=(s,n)=>{const d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return iso(d)};
const months=n=>{const d=new Date();d.setMonth(d.getMonth()+n);return iso(d)};
function preset(k,customer){
 const to=iso(new Date()),month=to.slice(0,7)+'-01';
 if(customer){
  if(k==='year')return {from:to.slice(0,4)+'-01-01',to};
  if(k==='six')return {from:months(-6),to};
  if(k==='three')return {from:months(-3),to};
  if(k==='years3')return {from:shift(to,-1095),to};
  return {from:shift(to,-365),to};
 }
 if(k==='month')return {from:month,to};
 if(k==='last'){const t=shift(month,-1);return {from:t.slice(0,7)+'-01',to:t};}
 return {from:shift(to,-6),to};
}
const btn=(label,key,value,selected,extra='')=>`<button type="button" class="${selected?'selected':''}" data-v22="${key}" data-value="${E(value)}" ${extra}>${label}</button>`;
const segmented=(items,kind,selected,cls='rpt21-presets')=>`<div class="${cls}">${items.map(([val,name])=>btn(E(name),kind,val,val===selected)).join('')}</div>`;
function picker(name,value,label){
 return `<label class="rpt21-date">${ico('calendar',21)}<input type="date" required aria-label="${E(label)}" name="${name}" value="${E(value)}"></label>`;
}
function chooser(name,label,icon,choices,selected,highlight=false){
 return `<label class="rpt21-filter ${highlight?'rpt21-needed':''}">${ico(icon)}
 <select aria-label="${E(label)}" name="${E(name)}">
 <option value="">${E(label)}</option>${choices.map(x=>`<option value="${E(x.id)}" ${String(x.id)===String(selected)?'selected':''}>${E(x.name)}</option>`).join('')}
 </select>${ico('chevron',16)}</label>`;
}
function range(q,customer){
 const v=customer?[['year12','Last 12 months'],['six','Last 6 months'],['three','Last 3 months'],['year','This year'],['years3','Last 3 years']]:
 [['seven','Last 7 days'],['month','This month'],['last','Last month']];
 const selected=v.find(([k])=>{const p=preset(k,customer);return q.from===p.from&&q.to===p.to})?.[0]||'';
 return picker('from',q.from,'Start date')+picker('to',q.to,'End date')+segmented(v,'preset',selected);
}
function options(d,opts,key){
 const q=d,staff=opts.staff||[],buses=opts.buses||[],schedules=opts.schedules||[];
 if(key==='frequent-travellers'){
  return `<div class="rpt22-filter-line rpt22-frequent-top">
   <label class="rpt22-search">${ico('search',19)}<input name="search" placeholder="Search name or phone" autocomplete="off" aria-label="Search name or phone" value="${E(q.search)}"></label>
   <span class="rpt22-trip-label">Trips</span><input class="rpt22-small" name="min_trips" aria-label="Minimum trips" type="number" min="1" max="10000" value="${E(q.min_trips)}">
   <span class="rpt22-trip-label">to</span><input class="rpt22-small" name="max_trips" aria-label="Maximum trips" type="number" min="1" max="10000" placeholder="any" value="${E(q.max_trips??'')}">
   ${segmented([['trips','Most trips'],['spend','Top spend'],['recent','Recent']],'sort',q.sort)}
   ${segmented([['50','Top 50'],['100','100'],['500','500'],['1000','1000'],['all','All']],'top',q.top)}
   </div><div class="rpt22-filter-line rpt22-dates">${range(q,true)}</div>`;
 }
 if(key==='point-performance'){
   return `<div class="rpt22-filter-line">
   ${segmented([['pickup','Pickup point'],['drop','Drop point']],'mode',q.mode,'rpt21-modes')}
   ${chooser('point',q.mode==='pickup'?'Select pickup point':'Select drop point','point',
     (d.points||[]).map(x=>({id:x.key,name:x.point})),q.selected_point?.point_key||q.point,true)}
   ${chooser('bus_id','All buses','bus',buses,q.bus_id)}${picker('from',q.from,'Start date')}${picker('to',q.to,'End date')}
   </div><div class="rpt22-filter-line">${segmented([['seven','Last 7 days'],['month','This month'],['last','Last month']],'preset',
    [['seven','month','last']].flat()[0]&&[['seven','month','last']].flat().find(k=>{const p=preset(k,false);return p.from===q.from&&p.to===q.to})||'')}</div>`;
 }
 if(key==='station-performance'){
  return `<div class="rpt22-filter-line">${chooser('schedule_id','All schedules','route',schedules,q.schedule_id)}
   ${chooser('bus_id','All buses','bus',buses,q.bus_id)}${range(q,false)}</div>`;
 }
 return `<div class="rpt22-filter-line">${chooser('staff_id','All drivers / staff','user',staff.map(x=>({id:x.id,name:x.name})),q.staff_id)}
  ${chooser('bus_id','All buses','bus',buses,q.bus_id)}${range(q,false)}</div>`;
}
function metricCards(d,key){
 if(key==='point-performance'&&!d.selected_point)return '';
 return `<div class="rpt21-summary rpt22-summary">${S.DEF[key].metrics.map(m=>
 `<div class="rpt21-stat"><span>${E(m[0]==='Trips'&&key==='station-performance'?'Trips ('+d.summary.schedules+' schedules)':m[0])}</span>
 <strong>${display(d,m)}</strong></div>`).join('')}</div>`;
}
function reportSections(d,key,state){
 const definitions=S.sections(key,d).filter(s=>key!=='point-performance'||s.key==='ranking'||d.selected_point);
 return definitions.map(s=>{
  let title=s.title,rows=d.sections[s.key]||[];
  if(key==='frequent-travellers'&&s.key==='rows')title='FREQUENT TRAVELLERS — '+(d.top==='all'?'ALL':'TOP '+d.top)+' OF '+num(d.summary.passengers);
  if(key==='point-performance'&&s.key==='ranking')title='ALL '+(d.mode==='pickup'?'PICKUP':'DROP')+' POINTS';
  const section={...s,title};let limited=null;
  if(key==='frequent-travellers'&&s.key==='rows'&&rows.length>state.visible){
    limited=rows.length;
    const sections={...d.sections,[s.key]:rows.slice(0,state.visible)};
    const rendered=base.table(section,{...d,sections});
    return rendered+`<div class="rpt22-more" data-more-count="${limited}">Showing ${Math.min(state.visible,limited).toLocaleString('en-IN')} of ${limited.toLocaleString('en-IN')} passengers
       <button type="button" data-v22="more">Show next 250</button></div>`;
  }
  return base.table(section,d);
 }).join('');
}
function render(d,opts,key,state){
 const def=S.DEF[key],disabled=key==='point-performance'&&!d.selected_point;
 const actions=[['print','Print','print'],['pdf','PDF','download'],...(key==='frequent-travellers'?[['excel','Excel','excel']]:[]),['share','Share','share']]
   .map(([action,label,icon],i)=>`<button type="button" data-v22="${action}" class="${i===0?'primary':''}" ${disabled?'disabled':''}>
   ${ico(icon,18)} ${label}</button>`).join('');
 let empty=key==='point-performance'&&!d.selected_point?'<p class="rpt22-pick-hint">Pick a '+(d.mode==='pickup'?'pickup':'drop')+' point above, or click one below.</p>':'';
 return `<div class="rpt21-root rpt22-root" data-report-v22="${E(key)}">
 <div class="rpt21-top"><div class="rpt21-heading"><a href="#/accounts/reports" class="rpt21-back">${ico('back',18)} Reports</a>
 <h1>${E(def.title)}</h1></div><div class="rpt21-actions">${actions}</div></div>
 <div class="rpt22-controls">${options(d,opts,key)}</div>
 <p class="rpt21-note">${E(def.note)}</p>${empty}${metricCards(d,key)}
 ${reportSections(d,key,state)}
 ${key==='point-performance'&&!d.selected_point?'':`<p class="rpt21-methodology">${E(d.methodology)}</p>`}
 </div>`;
}
function readFilters(root,key){
 const get=k=>root.querySelector('[name='+k+']')?.value??'',q=G.query();
 const from=get('from'),to=get('to');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to){G.toast('Choose a valid date range','bad');return null;}
 const out={from,to};
 if(key==='frequent-travellers')Object.assign(out,{search:get('search'),min_trips:get('min_trips'),max_trips:get('max_trips')||'any',
   sort:root.dataset.sort||q.sort||'trips',top:root.dataset.top||q.top||'100'});
 if(key==='point-performance')Object.assign(out,{mode:root.dataset.mode||q.mode||'pickup',point:get('point'),bus_id:get('bus_id')});
 if(key==='station-performance')Object.assign(out,{schedule_id:get('schedule_id'),bus_id:get('bus_id')});
 if(key==='trip-pnl')Object.assign(out,{staff_id:get('staff_id'),bus_id:get('bus_id')});
 return out;
}
function nav(root,key){
 const filters=readFilters(root,key);if(!filters)return;
 const url='#/accounts/reports/'+key+'?'+G.qs(filters);
 if(location.hash===url)window.dispatchEvent(new Event('hashchange'));else location.hash=url;
}
async function download(key,d,type,button){
 const path=key+(type==='excel'?'.xlsx':'.pdf');
 const args=key==='frequent-travellers'?{from:d.from,to:d.to,search:d.search,min_trips:d.min_trips,max_trips:d.max_trips??'any',sort:d.sort,top:d.top}:
  key==='point-performance'?{from:d.from,to:d.to,mode:d.mode,point:d.point,bus_id:d.bus_id||''}:
  key==='station-performance'?{from:d.from,to:d.to,bus_id:d.bus_id||'',schedule_id:d.schedule_id||''}:
  {from:d.from,to:d.to,staff_id:d.staff_id||'',bus_id:d.bus_id||''};
 const headers={Authorization:'Bearer '+localStorage.getItem('token')};if(G.viewAs)headers['x-view-as']=String(G.viewAs);
 button.disabled=true;
 try{
  const response=await fetch('/api/accounts/reports/'+path+'?'+G.qs(args),{headers});
  if(!response.ok){const error=await response.json().catch(()=>({}));throw Error(error.message||'Download failed');}
  const blob=await response.blob();
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=key+'_'+d.from+'_'+d.to+(type==='excel'?'.xlsx':'.pdf');
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);
  G.toast((type==='excel'?'Excel workbook':'PDF report')+' downloaded','ok');
 }finally{button.disabled=false;}
}
async function event(root,key,d,state,evt){
 const button=evt.target.closest('[data-v22]');if(!button||button.disabled)return;
 const action=button.dataset.v22,val=button.dataset.value;
 if(action==='preset'){
  const range=preset(val,key==='frequent-travellers');root.querySelector('[name=from]').value=range.from;root.querySelector('[name=to]').value=range.to;nav(root,key);
 }else if(action==='mode'){
  root.dataset.mode=val;
  const point=root.querySelector('[name=point]');if(point)point.value='';
  nav(root,key);
 }else if(action==='sort'||action==='top'){root.dataset[action]=val;nav(root,key);}
 else if(action==='pdf'||action==='excel')await download(key,d,action,button);
 else if(action==='print'){
   const old=state.visible;
   if(key==='frequent-travellers')root.innerHTML=render(d,state.opts,key,{...state,visible:Number.MAX_SAFE_INTEGER});
   try{window.print();}
   finally{if(key==='frequent-travellers')root.innerHTML=render(d,state.opts,key,{...state,visible:old});}
 }
 else if(action==='share'){
  const url=location.href;
  if(navigator.share){try{await navigator.share({title:S.DEF[key].title,url});return;}catch(e){if(e.name==='AbortError')return;}}
  try{await navigator.clipboard.writeText(url);G.toast('Filtered report link copied','ok');}catch(e){G.toast('Copy the report URL from the address bar','bad');}
 }else if(action==='more'){
   state.visible+=250;const y=root.querySelector('.rpt21-scroll')?.scrollTop||0;
   root.innerHTML=render(d,state.opts,key,state);
   const scroll=root.querySelector('.rpt21-scroll');if(scroll)scroll.scrollTop=y;
 }
}
function wire(root,key,d,state){
 root.addEventListener('change',e=>{
   if(e.target.matches('select,input[type=date],input[type=number]'))nav(root,key);
 });
 let debounce;
 root.addEventListener('input',e=>{
   if(!e.target.matches('[name=search]'))return;
   clearTimeout(debounce);const v=e.target.value;
   debounce=setTimeout(()=>{const item=root.querySelector('[name=search]');if(item)item.value=v;window.__rpt22RefocusSearch=true;nav(root,key);},450);
 });
 root.addEventListener('keydown',e=>{
   if(e.target.matches('[name=search]')&&e.key==='Enter'){e.preventDefault();clearTimeout(debounce);nav(root,key);}
   const row=e.target.closest('.rpt22-pick-row');
   if(row&&(e.key==='Enter'||e.key===' ')){e.preventDefault();root.querySelector('[name=point]').value=row.dataset.point;nav(root,key);}
 });
 root.addEventListener('click',e=>{
   const row=e.target.closest('.rpt22-pick-row');
   if(row&&!e.target.closest('button')){root.querySelector('[name=point]').value=row.dataset.point;nav(root,key);return;}
   if(e.target.closest('[data-v22]'))event(root,key,d,state,e).catch(G.err);
 });
 if(key==='point-performance'){
   root.querySelectorAll('[data-section=ranking] tbody tr').forEach((tr,i)=>{
     const point=d.sections.ranking[i];if(!point)return;
     tr.dataset.point=point.point_key;tr.classList.add('rpt22-pick-row');
     tr.tabIndex=0;tr.setAttribute('role','button');tr.setAttribute('aria-label','View '+point.point+' performance');
     if(point.point_key===d.selected_point?.point_key)tr.classList.add('rpt22-chosen');
   });
 }
}
async function show(el,p){
 const key=p.id;
 await prior(el,{...p,id:null});
 const root=el.querySelector('[data-ac10-page]');if(!root||!can('accounts.reports'))return;
 const q=G.query(),today=iso(new Date()),defaults=preset('year12',key==='frequent-travellers');
 const baseDefault=key==='frequent-travellers'?defaults:preset('seven',false);
 const params={from:q.from||baseDefault.from,to:q.to||baseDefault.to};
 const dimensions=key==='frequent-travellers'?['search','min_trips','max_trips','sort','top']:
  key==='point-performance'?['mode','point','bus_id']:
  key==='station-performance'?['schedule_id','bus_id']:['staff_id','bus_id'];
 for(const k of dimensions)if(q[k]!==undefined)params[k]=q[k];
 try{
   const [d,opts]=await Promise.all([G.get('/accounts/reports/'+key+'?'+G.qs(params)),
     G.get('/accounts/reports/v22/options')]);
   const state={visible:300,opts};
   root.innerHTML=render(d,opts,key,state);root.dataset.mode=d.mode||'pickup';
   root.dataset.sort=d.sort||'trips';root.dataset.top=d.top||'100';
   wire(root,key,d,state);
   if(window.__rpt22RefocusSearch&&key==='frequent-travellers'){
     window.__rpt22RefocusSearch=false;
     const field=root.querySelector('[name=search]');
     if(field){field.focus();const end=field.value.length;field.setSelectionRange(end,end);}
   }
 }catch(error){root.innerHTML=`<div class="rpt21-error">Unable to load ${E(S.DEF[key].title)}: ${E(error.message)}</div>`;G.err(error);}
}
G.screens.accounts=async function(el,p={}){
 if(p.tab==='reports'&&keys.has(p.id))return show(el,p);
 return prior(el,p);
};
window.ReportSuiteV22={render,preset,readFilters};
})();
