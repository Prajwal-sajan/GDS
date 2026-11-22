(function(){
'use strict';
if(!window.G?.screens?.accounts||window.__reportSuiteV21)return;
window.__reportSuiteV21=true;
const previous=G.screens.accounts,S=window.ReportSuiteSpecsV21;
if(!S)throw new Error('Report Suite specs must be loaded before UI');
const keys=new Set(Object.keys(S.DEF));
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon={print:'M7 8V3h10v5M7 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 15h10v6H7z',
 download:'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',
 share:'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.5 11 15.5 6M8.5 14l7 5',
 back:'M20 12H4m8-8-8 8 8 8',
 user:'M20 21a8 8 0 0 0-16 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
 bus:'M4 17V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11H4ZM4 13h16M7 17v3m10-3v3',
 calendar:'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
 chevron:'m6 9 6 6 6-6'};
const svg=(k,s=18)=>`<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="${icon[k]}"/></svg>`;
const num=n=>Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:0});
const decimal=n=>Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:1});
const amount=n=>'₹'+num(n);
const pct=n=>n===null||n===undefined?'—':Number(n).toFixed(1).replace(/\.0$/,'')+'%';
function format(v,type){
 if(v===undefined||v===null||v==='')return '—';
 if(type==='number')return num(v);
 if(type==='money')return amount(v);
 if(type==='pct')return pct(v);
 if(type==='ratio')return Number(v).toFixed(2);
 if(type==='minutes')return num(v)+'m';
 if(type==='duration'){const minutes=Math.round(Number(v));return minutes>=60?Math.floor(minutes/60)+'h '+minutes%60+'m':minutes+'m';}
 if(type==='speed')return num(v)+' km/h';
 if(type==='delta')return (Number(v)>0?'+':'')+Number(v).toFixed(1)+'%';
 return E(v);
}
function metricValue(d,metric){
 const [,key,type]=metric,stats=d.summary||{};let v=stats[key];
 if(type==='mileage')return v===null||v===undefined?'—':Number(v).toFixed(2)+' km/L';
 if(type==='recorded')return format(stats.trips_recorded,'number')+'/'+format(stats.trips,'number');
 if(type==='resale')return format(v,'number')+' ('+pct(stats.resale_pct)+')';
 if(type==='no_show_resale')return format(v,'number')+' ('+pct(stats.resale_pct)+')';
 return format(v,type);
}
function table(section,data){
 const rows=data.sections?.[section.key]||[],totals=data.totals?.[section.key]||{},cols=section.cols;
 const widths=cols.map(c=>Number(c.width)||1),unit=widths.reduce((a,b)=>a+b,0);
 const rowCells=r=>cols.map(c=>`<td class="${c.type==='text'?'':'rpt21-num'}">${format(r[c.key],c.type)}</td>`).join('');
 return `<section class="rpt21-section" data-section="${E(section.key)}"><h3>${E(section.title)} <span>· ${rows.length}</span></h3>
 <div class="rpt21-scroll" tabindex="0" aria-label="${E(section.title)} report table">
 <table class="rpt21-table ${E(section.key)}" style="min-width:${Math.max(930,cols.length*92)}px">
 <colgroup>${cols.map(c=>`<col style="width:${(c.width/unit*100).toFixed(3)}%">`).join('')}</colgroup>
 <thead><tr>${cols.map(c=>`<th class="${c.type==='text'?'':'rpt21-num'}">${E(c.label)}</th>`).join('')}</tr></thead>
 <tbody>${rows.length?rows.map(x=>`<tr>${rowCells(x)}</tr>`).join(''):
 `<tr><td class="rpt21-empty" colspan="${cols.length}">No data for this period</td></tr>`}</tbody>
 <tfoot><tr>${cols.map((c,i)=>{
    const v=totals[c.key];return `<td class="${c.type==='text'?'':'rpt21-num'}">${v!==undefined?format(v,c.type):i===0?rows.length+' records':' '}</td>`;
 }).join('')}</tr></tfoot></table></div></section>`;
}
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const shift=(s,n)=>{const d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return iso(d)};
const preset=k=>{let to=iso(new Date()),from=shift(to,-6);if(k==='month')from=to.slice(0,7)+'-01';if(k==='last'){to=shift(to.slice(0,7)+'-01',-1);from=to.slice(0,7)+'-01'}return {from,to}};
function filterSelect(key,label,ico,values,selected,needs=false){
 return `<label class="rpt21-filter ${needs?'rpt21-needed':''}">${svg(ico,20)}
 <select name="${key}" aria-label="${E(label)}"><option value="">${E(label)}</option>
 ${values.map(x=>`<option value="${E(x.id)}" ${String(x.id)===String(selected)?'selected':''}>${E(x.name)}</option>`).join('')}
 </select>${svg('chevron',16)}</label>`;
}
function render(d,options,key){
 const def=S.DEF[key],q={from:d.from,to:d.to,bus_id:d.bus_id||'',staff_id:d.staff_id||'',mode:d.mode||'both'};
 const selected=Object.entries({seven:preset('seven'),month:preset('month'),last:preset('last')}).find(([,v])=>q.from===v.from&&q.to===v.to)?.[0]||'';
 const disabled=def.needsStaff&&!d.staff;
 const staff=(options.staff||[]).map(x=>({id:x.id,name:x.name+(x.role?' · '+x.role:'')}));
 const bus=(options.buses||[]).map(x=>({id:x.id,name:x.name}));
 const modes=def.modes?`<div class="rpt21-modes" aria-label="Feeder leg">
 ${[['both','Pickup + Drop'],['pickup',key==='metro-bookings'?'Metro pickup':'Van pickup'],
 ['drop',key==='metro-bookings'?'Metro drop':'Van drop']].map(([k,v])=>
 `<button data-v21="mode" data-mode="${k}" class="${q.mode===k?'selected':''}">${v}</button>`).join('')}</div>`:'';
 const st=def.staff||def.needsStaff?filterSelect('staff_id',def.needsStaff?'Select driver / staff':'All drivers / staff','user',staff,q.staff_id,def.needsStaff):'';
 const bu=def.bus?filterSelect('bus_id','All buses','bus',bus,q.bus_id):'';
 const fromTo=['from','to'].map((k,i)=>`<label class="rpt21-date">${svg('calendar',21)}
 <input aria-label="${i?'End date':'Start date'}" type="date" name="${k}" value="${E(q[k])}" required></label>`).join('');
 const presets=`<div class="rpt21-presets">${[['seven','Last 7 days'],['month','This month'],['last','Last month']].map(([k,v])=>
 `<button data-v21="preset" data-preset="${k}" class="${selected===k?'selected':''}">${v}</button>`).join('')}</div>`;
 const title=def.title,subtitle=def.note;
 const showEmpty=disabled?`<div class="rpt21-select-empty">Select a driver or staff member to see their statement.</div>`:'';
 return `<div class="rpt21-root" data-report-v21="${E(key)}">
 <header class="rpt21-top"><div class="rpt21-heading"><a href="#/accounts/reports" class="rpt21-back">${svg('back',18)} Reports</a><h1>${E(title)}</h1></div>
 <div class="rpt21-actions"><button data-v21="print" class="primary" ${disabled?'disabled':''}>${svg('print')} Print</button>
 <button data-v21="pdf" ${disabled?'disabled':''}>${svg('download')} PDF</button>
 <button data-v21="share" ${disabled?'disabled':''}>${svg('share')} Share</button></div></header>
 <div class="rpt21-controls">${modes}${st}${bu}${fromTo}${presets}</div>
 <p class="rpt21-note">${E(subtitle)}</p>
 ${showEmpty||`<div class="rpt21-summary" role="group" aria-label="${E(title)} summary">
 ${def.metrics.map(m=>`<div class="rpt21-stat"><span>${E(m[0])}</span><strong>${metricValue(d,m)}</strong></div>`).join('')}</div>
 ${S.sections(key,d).map(s=>table(s,d)).join('')}
 <p class="rpt21-methodology">${E(d.methodology||'')}</p>`}
 </div>`;
}
function navigate(root,key){
 const get=name=>root.querySelector('[name='+name+']')?.value||'';
 const from=get('from'),to=get('to');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to){
 G.toast('Choose a valid start and end date','bad');return;
 }
 const args={from,to,bus_id:get('bus_id'),staff_id:get('staff_id'),mode:root.dataset.mode||''};
 const previousMode=G.query().mode||'both';
 if(!args.mode)args.mode=previousMode;
 const dest='#/accounts/reports/'+key+'?'+G.qs(args);
 if(location.hash===dest)window.dispatchEvent(new Event('hashchange'));else location.hash=dest;
}
function fetchPdf(key,d){
 const headers={Authorization:'Bearer '+localStorage.getItem('token')};
 if(G.viewAs)headers['x-view-as']=String(G.viewAs);
 const q=G.qs({from:d.from,to:d.to,staff_id:d.staff_id||'',bus_id:d.bus_id||'',mode:d.mode||'both'});
 return fetch('/api/accounts/reports/'+key+'.pdf?'+q,{headers});
}
async function download(key,d,b){
 b.disabled=true;
 try{
 const response=await fetchPdf(key,d);
 if(!response.ok){const message=await response.json().catch(()=>({}));throw new Error(message.message||'PDF generation failed');}
 const blob=await response.blob();if(!blob.type.includes('pdf'))throw new Error('Unexpected PDF download response');
 const object=URL.createObjectURL(blob),a=document.createElement('a');a.href=object;
 a.download=key+'_'+d.from+'_'+d.to+'.pdf';document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(object),12000);
 G.toast('PDF downloaded','ok');
 }finally{b.disabled=false;}
}
async function action(root,key,d,event){
 const b=event.target.closest('[data-v21]');if(!b||b.disabled)return;
 const op=b.dataset.v21;
 if(op==='preset'){
 const r=preset(b.dataset.preset);root.querySelector('[name=from]').value=r.from;root.querySelector('[name=to]').value=r.to;navigate(root,key);
 }else if(op==='mode'){root.dataset.mode=b.dataset.mode;navigate(root,key);
 }else if(op==='pdf'){await download(key,d,b);
 }else if(op==='print'){window.print();
 }else if(op==='share'){
   if(navigator.share){try{await navigator.share({title:S.DEF[key].title,url:location.href});return;}catch(e){if(e.name==='AbortError')return;}}
   try{await navigator.clipboard.writeText(location.href);G.toast('Filtered report link copied','ok');}
   catch(e){G.toast('Copy the URL to share this report','bad');}
 }
}
async function show(el,p){
 const key=p.id,def=S.DEF[key];
 await previous(el,{...p,id:null});
 const root=el.querySelector('[data-ac10-page]');if(!root||!can('accounts.reports'))return;
 const qs=G.query(),vals={from:qs.from||shift(iso(new Date()),-6),to:qs.to||iso(new Date()),
 bus_id:qs.bus_id||'',staff_id:qs.staff_id||'',mode:qs.mode||'both'};
 try{
 const q=G.qs(vals);
 const [d,opts]=await Promise.all([G.get('/accounts/reports/'+key+'?'+q),
   G.get('/accounts/reports/v21/options')]);
 root.innerHTML=render(d,opts,key);root.dataset.mode=d.mode||'both';
 root.addEventListener('change',ev=>{if(ev.target.matches('.rpt21-controls select,.rpt21-controls input'))navigate(root,key)});
 root.addEventListener('click',ev=>{if(ev.target.closest('[data-v21]'))action(root,key,d,ev).catch(G.err)});
 }catch(e){root.innerHTML=`<div class="rpt21-error">Unable to load ${E(def.title)}: ${E(e.message)}</div>`;G.err(e);}
}
G.screens.accounts=async function(el,p={}){
 if(p.tab==='reports'&&keys.has(p.id))return show(el,p);
 return previous(el,p);
};
window.ReportSuiteV21={render,table,preset};
})();
