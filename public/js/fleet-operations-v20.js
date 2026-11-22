(function(){
'use strict';
if(!window.G?.screens?.accounts||window.__fleetOpsV20)return;
window.__fleetOpsV20=true;
const original=G.screens.accounts;
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={
 print:'M7 8V3h10v5M7 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 15h10v6H7z',
 download:'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',
 share:'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.5 11 15.5 6M8.5 14l7 5',
 back:'M20 12H4m8-8-8 8 8 8',
 user:'M20 21a8 8 0 0 0-16 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
 bus:'M4 17V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11H4ZM4 13h16M7 17v3m10-3v3',
 calendar:'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
 chevron:'m6 9 6 6 6-6'
};
const svg=(k,size=18)=>`<svg class="fop-i" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[k]||paths.bus}"/></svg>`;
const num=n=>Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:0});
const dec=n=>Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:1});
const rupee=n=>'₹'+num(n);
const per=n=>n===null||n===undefined?'—':Number(n).toFixed(1).replace(/\.0$/,'')+'%';
const ratio=n=>n===null||n===undefined?'—':Number(n).toFixed(2);
const diff=n=>n===null||n===undefined?'—':(Number(n)>0?'+':'')+Number(n).toFixed(1)+'%';
const fmt=(v,kind)=>{
 if(v===null||v===undefined||v==='')return '—';
 if(kind==='number')return num(v);
 if(kind==='decimal')return dec(v);
 if(kind==='money')return rupee(v);
 if(kind==='pct')return per(v);
 if(kind==='ratio')return ratio(v);
 if(kind==='delta')return diff(v);
 if(kind==='drivers')return Array.isArray(v)?E(v.map(x=>x.name+(x.phone?' ('+x.phone+')':'')).join(', ')):E(v);
 if(kind==='crew')return Array.isArray(v)?E(v.map(x=>(x.role||'Crew')+': '+x.name+(x.phone?' ('+x.phone+')':'')).join(', ')):E(v);
 return E(v);
};
const tables=[
 {key:'by_bus',heading:'BY BUS',width:'1560px',cols:[['vehicle','Bus'],['trips','Trips','number'],['days_ran','Days ran','number'],['days_idle','Days idle','number'],['util_pct','Util','pct'],['km','Km (GPS)','number'],['km_route','Km (route)','number'],['fuel_l','Fuel (L)','decimal'],['kmpl','km/L','ratio'],['diesel','Diesel','money'],['rs_per_km','₹/km','ratio'],['drivers','Drivers']]},
 {key:'by_driver',heading:'BY DRIVER',width:'1420px',cols:[['driver','Driver'],['phone','Phone'],['trips','Trips','number'],['days','Days','number'],['km','Km (GPS)','number'],['fuel_l','Fuel (L)','decimal'],['kmpl','km/L','ratio'],['vs_bus_avg_pct','vs bus avg','delta'],['buses','Buses']]},
 {key:'driver_by_bus',heading:'DRIVER × BUS',width:'1350px',cols:[['driver','Driver'],['vehicle','Bus'],['trips','Trips','number'],['km','Km (GPS)','number'],['fuel_l','Fuel (L)','decimal'],['kmpl','km/L','ratio'],['bus_avg_kmpl','Bus avg km/L','ratio'],['vs_bus_avg_pct','vs bus avg','delta']]},
 {key:'daily',heading:'DAILY',width:'1420px',cols:[['date','Date'],['fleet','Fleet','number'],['used','Used','number'],['trips','Trips','number'],['util_pct','Util','pct'],['no_bus','No bus','number'],['turned_off','Off','number'],['km','Km (GPS)','number'],['fuel_l','Fuel (L)','decimal'],['kmpl','km/L','ratio'],['diesel','Diesel','money'],['idle_buses','Idle buses']]},
 {key:'rows',heading:'TRIP-WISE',width:'1630px',cols:[['date','Date'],['departure_time','Dep'],['service','Service'],['route','Route'],['vehicle','Bus'],['drivers','Driver(s)','drivers'],['crew','Crew','crew'],['km','Km (GPS)','number'],['fuel_l','Fuel (L)','decimal'],['kmpl','km/L','ratio'],['diesel','Diesel','money']]}
];
const tiles=[
 ['Fleet util','fleet_util_pct','pct'],['Trips','trips','number'],['Buses','buses','number'],['Drivers','drivers','number'],['Km (GPS)','km','number'],['Fuel (L)','fuel_l','number'],
 ['Mileage','kmpl','mileage'],['Diesel','diesel','money'],['Idle bus-days','idle_bus_days','number'],
 ['Trips without bus','trips_without_bus','number'],['Trips turned off','trips_turned_off','number'],['Trips without driver','trips_without_driver','number']
];
const localISO=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const todayISO=()=>localISO(new Date());
const shift=(str,n)=>{const d=new Date(str+'T12:00:00');d.setDate(d.getDate()+n);return localISO(d)};
function preset(k){let to=todayISO(),from=shift(to,-6);if(k==='month')from=to.slice(0,7)+'-01';if(k==='last'){to=shift(to.slice(0,7)+'-01',-1);from=to.slice(0,7)+'-01'}return {from,to};}
function table(d,config){
 const rows=d[config.key]||[],total=d.totals?.[config.key]||{},cols=config.cols;
 const numeric=new Set(['number','decimal','money','pct','ratio','delta']);
 const cell=(v,c)=>`<td class="${numeric.has(c[2])?'fop-num':''}">${fmt(v?.[c[0]],c[2])}</td>`;
 return `<section class="fop-report-section" data-fop-section="${config.key}"><div class="fop-section-title">${config.heading} <span>· ${rows.length}</span></div>
 <div class="fop-grid-scroll" tabindex="0" aria-label="${config.heading} report table"><table class="fop-grid fop-grid-${config.key}" style="min-width:${config.width}">
 <thead><tr>${cols.map(c=>`<th class="${numeric.has(c[2])?'fop-num':''}">${E(c[1])}</th>`).join('')}</tr></thead>
 <tbody>${rows.length?rows.map(r=>`<tr>${cols.map(c=>cell(r,c)).join('')}</tr>`).join(''):`<tr><td colspan="${cols.length}" class="fop-empty">No records for this period and filters</td></tr>`}</tbody>
 <tfoot><tr>${cols.map((c,i)=>`<td class="${numeric.has(c[2])?'fop-num':''}">${total[c[0]]===undefined?(i===0?'Total':''):fmt(total[c[0]],c[2])}</td>`).join('')}</tr></tfoot>
 </table></div></section>`;
}
function render(d,options){
 const q={from:d.from,to:d.to,bus_id:d.bus_id||'',staff_id:d.staff_id||''};
 const selected=Object.entries({seven:preset('seven'),month:preset('month'),last:preset('last')}).find(([,v])=>q.from===v.from&&q.to===v.to)?.[0]||'';
 const select=(key,icon,label,opts)=>`<label class="fop-filter fop-select">${svg(icon,19)}<select name="${key}" aria-label="${label}">
 <option value="">${label}</option>${opts.map(x=>`<option value="${E(x.id)}" ${String(q[key])===String(x.id)?'selected':''}>${E(x.name)}</option>`).join('')}</select>${svg('chevron',17)}</label>`;
 const staff=(options.staff||[]).map(x=>({id:x.id,name:x.name+(x.role?' · '+x.role:'')}));
 const buses=(options.buses||[]).map(x=>({id:x.id,name:x.registration_number}));
 return `<div class="fop-v20" data-fop-report><div class="fop-title-row">
 <div class="fop-title-left"><a class="fop-back" href="#/accounts/reports">${svg('back',20)} Reports</a><h1>Fleet Operations</h1></div>
 <div class="fop-actions"><button data-fop="print" class="fop-primary">${svg('print')} Print</button>
 <button data-fop="pdf" class="fop-muted">${svg('download')} PDF</button>
 <button data-fop="share" class="fop-muted">${svg('share')} Share</button></div></div>
 <div class="fop-control-row">${select('staff_id','user','All drivers / staff',staff)}${select('bus_id','bus','All buses',buses)}
 ${[['from','Start date'],['to','End date']].map(([key,label])=>`<label class="fop-date">${svg('calendar',23)}<input type="date" name="${key}" aria-label="${label}" required value="${E(q[key])}"></label>`).join('')}
 <div class="fop-presets">${[['seven','Last 7 days'],['month','This month'],['last','Last month']].map(([key,label])=>`<button data-fop="preset" data-preset="${key}" class="${selected===key?'active':''}">${label}</button>`).join('')}</div></div>
 <p class="fop-methodology">Fleet util = trips ÷ fleet buses per day (main buses only; a temporary bus counts only on days it ran). Km / fuel = available trip readings; km/L only from trips with both. Driver km/L vs bus avg = the same buses' km/L over all their trips this period (+ is better). A two-driver trip counts in full for each driver. * Diesel from recorded costs when available, otherwise the trip/route figure. ${d.staff_id?'Filtered to a driver, utilization is not shown — it measures buses. ':''}Development GPS readings are not verified Intangles telemetry.</p>
 <div class="fop-summary">${tiles.map(([label,key,kind])=>`<div class="fop-tile"><span>${label}</span><b>${kind==='mileage'?(d.summary.kmpl===null?'—':ratio(d.summary.kmpl)+' km/L'):fmt(d.summary[key],kind)}</b></div>`).join('')}</div>
 ${tables.map(t=>table(d,t)).join('')}
 <p class="fop-footnote">All figures reflect the selected filters. When a trip has two drivers, each receives full trip km and fuel credit, so driver totals may exceed fleet totals. Route diesel values are estimates when no recorded expense exists.</p></div>`;
}
async function pdfDownload(d){
 const btn=document.querySelector('[data-fop="pdf"]');if(btn)btn.disabled=true;
 try{
 const query=G.qs({from:d.from,to:d.to,staff_id:d.staff_id||'',bus_id:d.bus_id||''});
 const headers={Authorization:'Bearer '+localStorage.getItem('token')};
 if(G.viewAs)headers['x-view-as']=String(G.viewAs);
 const resp=await fetch('/api/accounts/reports/fleet-operations.pdf?'+query,{headers});
 if(!resp.ok){const err=await resp.json().catch(()=>({}));throw new Error(err.message||'Unable to create PDF');}
 const blob=await resp.blob();
 if(!blob.type.includes('pdf'))throw new Error('Server did not return a PDF');
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=`fleet-operations_${d.from}_${d.to}.pdf`;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),15000);
 G.toast('Fleet Operations PDF downloaded','ok');
 }finally{if(btn)btn.disabled=false;}
}
function navigation(root){
 const get=k=>root.querySelector(`[name="${k}"]`)?.value||'';
 const from=get('from'),to=get('to');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to){G.toast('Choose a valid date range','bad');return;}
 location.hash='#/accounts/reports/fleet-operations?'+G.qs({from,to,staff_id:get('staff_id'),bus_id:get('bus_id')});
}
async function handle(root,d,event){
 const b=event.target.closest('[data-fop]');if(!b)return;
 const action=b.dataset.fop;
 if(action==='preset'){const dates=preset(b.dataset.preset);root.querySelector('[name=from]').value=dates.from;root.querySelector('[name=to]').value=dates.to;navigation(root);}
 if(action==='pdf')await pdfDownload(d);
 if(action==='print')window.print();
 if(action==='share'){
   if(navigator.share){try{await navigator.share({title:'Fleet Operations '+d.from+' to '+d.to,url:location.href});return;}catch(e){if(e.name==='AbortError')return;}}
   try{await navigator.clipboard.writeText(location.href);G.toast('Filtered report link copied','ok');}
   catch(e){G.toast('Copy your report URL to share','bad');}
 }
}
async function show(el,p){
 await original(el,p);
 const root=el.querySelector('[data-ac10-page]');
 if(!root||!can('accounts.reports'))return;
 const u=G.query(),q={from:u.from||shift(todayISO(),-6),to:u.to||todayISO(),staff_id:u.staff_id||'',bus_id:u.bus_id||''};
 try{
 const query=G.qs(q);
 const [d,opts]=await Promise.all([G.get('/accounts/reports/fleet-operations?'+query),G.get('/accounts/reports/fleet-operations/options')]);
 root.innerHTML=render(d,opts);
 root.addEventListener('click',evt=>{if(evt.target.closest('[data-fop]'))handle(root,d,evt).catch(G.err)});
 root.addEventListener('change',evt=>{if(evt.target.matches('.fop-control-row select,.fop-control-row input'))navigation(root)});
 }catch(err){root.innerHTML=`<div class="fop-error"><b>Unable to load Fleet Operations</b><p>${E(err.message)}</p><a href="#/accounts/reports">Back to Reports</a></div>`;G.err(err);}
}
G.screens.accounts=async function(el,p={}){
 if(p.tab==='reports'&&p.id==='fleet-operations')return show(el,p);
 return original(el,p);
};
window.FleetOpsV20={render,table,preset};
})();
