/* Additive, API-grounded fleet and coach listing enhancements.
   Mutations deliberately delegate to original implementation; telemetry is never invented. */
(function(){
 'use strict';
 const original=G.screens.fleet;
 const e=v=>esc(String(v??''));
 const n=v=>Number(v)||0;
 const fmt=v=>Number.isFinite(Number(v))?Number(v).toLocaleString('en-IN'):'—';
 const stamp=v=>v?fdt(v):'No timestamp';
 const btn=(label,attrs,cls='')=>`<button class="btn sm ${cls}" ${attrs}>${label}</button>`;
 const state=v=>String(v?.position?.state||'UNKNOWN').toUpperCase();
 const gps=v=>v?.gps_enabled && v?.position?.ts?'Connected':v?.gps_enabled?'No recent fix':'Not configured';
 const odo=v=>v?.odometer_km??v?.health?.odometer_km??v?.odometer_reading??null;
 const hstat=v=>{const s=String(v?.health?.status||'').toUpperCase();return !s?'UNKNOWN':s==='GOOD'?'GOOD':'ISSUE'};
 const cap=(label,value)=>`<div class="fop-cap"><strong>${e(value)}</strong><small>${e(label)}</small></div>`;
 const ttl=(title,sub)=>`${G.tabs([['vehicles','Vehicles','fleet.view'],['coaches','Coaches','fleet.view']],'vehicles',k=>`#/fleet/${k}`)}<div class="row between fop-header"><div><h2>${e(title)}</h2><p class="muted">${e(sub)}</p></div><a class="btn p" href="#/fleet/vehicles?view=manage">Manage vehicles</a></div>`;
 async function vehicles(el){
  const [{vehicles:vehicles=[]},{coaches:coaches=[]}]=await Promise.all([G.get('/vehicles'),G.get('/coaches')]);
  let search='',filter='all',health='all',sort='plate',view='list';
  const originalMarkup=()=>original(el,{tab:'vehicles'});
  el.innerHTML=`${ttl('Vehicles','Operational status and available device reports — no inferred GPS or ECU telemetry')}
  <div class="fop-metrics">${cap('TOTAL',vehicles.length)}${cap('MOVING',vehicles.filter(v=>state(v)==='MOVING').length)}${cap('IDLING',vehicles.filter(v=>state(v)==='IDLING').length)}${cap('STOPPED',vehicles.filter(v=>state(v)==='STOPPED').length)}${cap('GPS NOT CONFIGURED / STALE',vehicles.filter(v=>gps(v)!=='Connected').length)}${cap('HEALTH ISSUES',vehicles.filter(v=>v.health?.status&&v.health.status!=='GOOD').length)}</div>
  <div class="fop-controls"><input data-fop-q placeholder="Search plate or coach…" aria-label="Search vehicles"/><select data-fop-state><option value="all">All states</option><option>MOVING</option><option>IDLING</option><option>STOPPED</option><option>UNKNOWN</option></select><select data-fop-health><option value="all">All health</option><option>GOOD</option><option>ISSUE</option><option>UNKNOWN</option></select><select data-fop-sort><option value="plate">Plate (A–Z)</option><option value="plate-desc">Plate (Z–A)</option><option value="state">State</option></select>${btn('List','data-fop-view="list"')}${btn('Cards','data-fop-view="cards"')}${btn('Native fleet actions','data-fop-native','p')}</div>
  <p class="small muted" data-fop-count></p><div data-fop-list></div><p class="fop-note">GPS, health, fuel and alerts are only shown when present in the authenticated vehicle API. A configured device does not establish live connectivity. For vehicle registration, edit, remove, document management and current position details use Native fleet actions.</p>`;
  const list=el.querySelector('[data-fop-list]');
  const draw=()=>{
   let rows=vehicles.filter(v=>(!search||`${v.registration_number||''} ${v.coach||''} ${v.make||''} ${v.model||''}`.toLowerCase().includes(search))&&(filter==='all'||state(v)===filter)&&(health==='all'||hstat(v)===health));
   rows.sort((a,b)=>sort==='state'?state(a).localeCompare(state(b)):sort==='plate-desc'?String(b.registration_number||'').localeCompare(String(a.registration_number||'')):String(a.registration_number||'').localeCompare(String(b.registration_number||'')));
   el.querySelector('[data-fop-count]').textContent=`Showing ${rows.length} of ${vehicles.length} vehicles`;
   const render=v=>{const st=state(v),h=v.health?.status||'Unknown';return `<div><b>${e(v.registration_number)}</b><small>${e(v.coach||coaches.find(c=>String(c.id)===String(v.coach_template_id))?.name||'Coach not assigned')}</small></div><span class="fop-chip">${e(st)}</span><div>${odo(v)==null?'—':fmt(odo(v))+' km'}</div><div>${v.fuel_l==null?'—':e(v.fuel_l)+' L'}</div><div>${e(gps(v))}<small>${stamp(v.position?.ts)}</small></div><div>${e(h)}</div><div>${v.position?.lat!=null&&v.position?.lng!=null?`${e(Number(v.position.lat).toFixed(4))}, ${e(Number(v.position.lng).toFixed(4))}`:'No reported coordinates'}</div><div>${n(v.doc_alerts)} document alerts</div><div><button class="btn sm" data-fop-show="${e(v.id)}">Details</button></div>`};
   list.className=view==='cards'?'fop-list fop-cards':'fop-list';
   list.innerHTML=view==='cards'?rows.map(v=>`<div class="fop-card">${render(v)}</div>`).join(''): `<div class="fop-scroll"><table class="fop-table"><thead><tr>${['Registration','State','Odometer','Fuel','GPS','Health','Location','Alerts','Actions'].map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(v=>`<tr>${render(v).replace(/^<div>/,'<td>').replace(/<\/div><span class="fop-chip">/,'</td><td><span class="fop-chip">').replace(/<\/span><div>/,'</span></td><td>').replace(/<\/div><div>/g,'</td><td>').replace(/<\/div><div>/g,'</td><td>').replace(/<\/div>$/,'</td>').replace(/<\/small><\/div>/g,'</small></td>')}</tr>`).join('')}</tbody></table></div>`;
   if(view==='list') { // Explicit cell generation avoids DOM assumptions about vehicle fields.
     list.querySelector('tbody').innerHTML=rows.map(v=>`<tr><td><b>${e(v.registration_number)}</b><small>${e(v.coach||'—')}</small></td><td>${e(state(v))}</td><td>${odo(v)==null?'—':fmt(odo(v))+' km'}</td><td>${v.fuel_l==null?'—':e(v.fuel_l)+' L'}</td><td>${e(gps(v))}<small>${stamp(v.position?.ts)}</small></td><td>${e(v.health?.status||'Unknown')}</td><td>${v.position?.lat!=null&&v.position?.lng!=null?`${e(v.position.lat)}, ${e(v.position.lng)}`:'—'}</td><td>${n(v.doc_alerts)}</td><td>${btn('Details',`data-fop-show="${e(v.id)}"`)}${can('fleet.modify')?btn('Docs',`data-fop-docs="${e(v.id)}"`):''}</td></tr>`).join('');
   }
   list.querySelectorAll('[data-fop-docs]').forEach(b=>b.onclick=()=>G.docsModal&&G.docsModal('vehicle',b.dataset.fopDocs,()=>{}));
   list.querySelectorAll('[data-fop-show]').forEach(b=>b.onclick=async()=>{const v=vehicles.find(x=>String(x.id)===String(b.dataset.fopShow));if(!v)return;let detail=null;try{detail=await G.get(`/vehicles/${v.id}/live`)}catch(_){}const d=detail||{};G.modal({title:`Vehicle · ${e(v.registration_number)}`,size:'lg',body:`<div class="grid g2"><div class="card"><b>Vehicle</b><p>Coach: ${e(v.coach||'—')}<br>Status: ${e(v.status||'—')}<br>Role: ${e(v.vehicle_role||'—')}<br>Ownership: ${e(v.ownership_type||'—')}</p></div><div class="card"><b>Location</b><p>${d.fix?.lat!=null?`${e(d.fix.lat)}, ${e(d.fix.lng)}`:'No verified fix'}<br>Last update: ${stamp(d.fix?.ts||v.position?.ts)}</p></div><div class="card"><b>Health</b><p>${e(d.health?.status||v.health?.status||'Not reported')}</p>${(d.health?.alerts||[]).map(a=>`<p>${e(a.message||a)}</p>`).join('')}</div><div class="card"><b>Data source</b><p>Authenticated vehicle endpoint. No provider telemetry is synthesized.</p></div></div>`})});
  };
  el.querySelector('[data-fop-q]').oninput=x=>{search=x.target.value.trim().toLowerCase();draw()};el.querySelector('[data-fop-state]').onchange=x=>{filter=x.target.value;draw()};el.querySelector('[data-fop-health]').onchange=x=>{health=x.target.value;draw()};el.querySelector('[data-fop-sort]').onchange=x=>{sort=x.target.value;draw()};el.querySelectorAll('[data-fop-view]').forEach(b=>b.onclick=()=>{view=b.dataset.fopView;draw()});el.querySelector('[data-fop-native]').onclick=()=>{location.hash='#/fleet/vehicles?view=manage'};draw();
 }
 G.screens.fleet=async(el,p)=>{if((p?.tab||'vehicles')==='vehicles'&&!p?.id&&G.query().view!=='manage')return vehicles(el);return original(el,p)};
})();
