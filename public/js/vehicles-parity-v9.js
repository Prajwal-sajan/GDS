/* SaveTrip screenshot-driven Vehicles + Coaches UX parity, v9.
   Intentionally loads AFTER savetrip-visual.js, BEFORE main.js.
   All provider-driven values are read from the GDS API; unavailable values remain unavailable.
   Backend changes are limited to existing authorized vehicle/coach CRUD endpoints. */
(function () {
  'use strict';
  if (!window.G?.screens?.fleet || window.G.__vehiclesV9) return;
  G.__vehiclesV9 = true;
  const nativeFleet = G.screens.fleet;
  const readLayout=(tab)=>{try{return localStorage.getItem('gds_'+tab+'_layout_v37')==='list'?'list':'grid'}catch(_){return 'grid'}};
  const saveLayout=(tab,view)=>{try{localStorage.setItem('gds_'+tab+'_layout_v37',view)}catch(_){}};
  const E = v => esc(String(v ?? ''));
  const arr = v => Array.isArray(v) ? v : [];
  const value = v => v === null || v === undefined || v === '' ? '—' : E(v);
  const number = v => v === null || v === undefined || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('en-IN');
  const date = v => v ? fdt(v) : 'Not reported';
  const h = (tag, a, text) => `<${tag} ${a}>${text}</${tag}>`;
  const icPaths = {
    bus:'<rect x="3" y="4" width="18" height="15" rx="3"/><path d="M3 11h18M7 19v2m10-2v2M7 15h.01M17 15h.01"/>',
    snowflake:'<path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07M9 5l3 3 3-3M9 19l3-3 3 3"/>',
    bed:'<path d="M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7M3 14h18M5 9V5h14v4M3 18v2m18-2v2"/>',
    armchair:'<path d="M5 11V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5M5 11h14a2 2 0 0 1 2 2v4H3v-4a2 2 0 0 1 2-2ZM6 17v3m12-3v3"/>',
    video:'<rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    activity:'<path d="M2 12h4l3-7 6 14 3-7h4"/>',
    heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/><path d="M4 12h4l2-3 3 6 2-3h5"/>',
    signal:'<path d="M3 20h.01M7 20v-4m4 4v-8m4 8V8m4 12V4"/>',
    sort:'<path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15M15 6v15"/>',
    eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    pencil:'<path d="m14 5 5 5M3 21l5-1 12-12a3.5 3.5 0 0 0-5-5L3 15l0 6Z"/>',
    copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    trash:'<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
    power:'<path d="M12 2v9M6.3 5.5a9 9 0 1 0 11.4 0"/>',
    stop:'<rect x="5" y="5" width="14" height="14" rx="2"/>',
    play:'<path d="m8 5 11 7-11 7V5Z"/>',
    pause:'<rect x="5" y="4" width="5" height="16" rx="1"/><rect x="14" y="4" width="5" height="16" rx="1"/>',
    wifiOff:'<path d="m2 2 20 20M4.9 9.1A14 14 0 0 1 19 9m-9.5 4.5a7 7 0 0 1 5.5 0M12 19h.01M2 6a20 20 0 0 1 20 0"/>',
    alert:'<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3h.01"/>',
    ban:'<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6 18.4 18.4"/>',
    fuel:'<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M3 21h13M7 7h5v6H7zM15 8l3 3v6a2 2 0 0 0 4 0V8l-3-3"/>',
    gauge:'<path d="M5.4 19a9 9 0 1 1 13.2 0M12 12l4-5"/><circle cx="12" cy="12" r="1"/>',
    pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 10h18c0-2-3-3-3-10M10 22h4"/>',
    refresh:'<path d="M20 11a8 8 0 0 0-14-5L4 8m0-5v5h5M4 13a8 8 0 0 0 14 5l2-2m0 5v-5h-5"/>',
    x:'<path d="m5 5 14 14M19 5 5 19"/>',
    check:'<path d="m4 12 5 5L20 6"/>',
    share:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4m-6.8 9 6.8 4"/>',
    expand:'<path d="M9 3H3v6M15 21h6v-6M3 3l7 7m11 11-7-7"/>',
    locate:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
    down:'<path d="m6 9 6 6 6-6"/>',
    wrench:'<path d="M14 6a5 5 0 0 0-6 6l-5 5a3 3 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-4 1-3-3 1-4Z"/>',
    zap:'<path d="m13 2-9 12h7l-1 8 10-12h-7l0-8Z"/>',
    thermometer:'<path d="M10 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0Zm3-5v9"/>',
    cog:'<circle cx="12" cy="12" r="3"/><path d="M10 2h4l1 3 3 1 3-1 2 4-2 2v2l2 2-2 4-3-1-3 1-1 3h-4l-1-3-3-1-3 1-2-4 2-2v-2l-2-2 2-4 3 1 3-1 1-3Z"/>',
    wind:'<path d="M2 8h14a3 3 0 1 0-3-3M2 12h19M2 16h13a3 3 0 1 1-3 3"/>',
    shield:'<path d="M12 2 21 6v6c0 5-4 8-9 10-5-2-9-5-9-10V6l9-4Z"/>',
    steering:'<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><path d="M2 12h7m6 0h7M12 15v7"/>',
    exit:'<path d="M4 3h12v18H4zM9 12h10m-4-4 4 4-4 4M10 9h.01"/>',
    toilet:'<path d="M5 3h14v6H5zM5 9v3a7 7 0 0 0 14 0V9M12 19v3M8 22h8"/>',
    file:'<path d="M6 2h8l5 5v15H6zM14 2v6h5M9 12h7m-7 4h7"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
    droplet:'<path d="M12 2s-7 9-7 13a7 7 0 0 0 14 0c0-4-7-13-7-13Z"/>',
    battery:'<rect x="3" y="7" width="17" height="10" rx="2"/><path d="M20 10h2v4h-2M11 8l-3 5h3l-1 4 5-6h-3l1-3"/>',
    download:'<path d="M12 3v13m-5-5 5 5 5-5M4 19v3h16v-3"/>',
    phone:'<path d="M5 3 9 6l-2 4a17 17 0 0 0 7 7l4-2 3 4-2 2C10 23 1 14 3 5Z"/>',
    layers:'<path d="m12 2 9 5-9 5-9-5 9-5Zm-9 10 9 5 9-5M3 17l9 5 9-5"/>'
  };
  const icon=(name,size=19)=>`<svg class="vp-i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icPaths[name]||icPaths.bus}</svg>`;
  const button=(name,kind,attrs='',text='')=>`<button type="button" class="vp-icon vp-icon--${kind}" ${attrs} title="${E(text||name)}" aria-label="${E(text||name)}">${icon(name)}</button>`;
  const b=(txt,kind='',attrs='')=>`<button type="button" class="vp-btn ${kind}" ${attrs}>${txt}</button>`;
  const q=(s,root=document)=>root.querySelector(s);
  const qa=(s,root=document)=>Array.from(root.querySelectorAll(s));
  async function read(url,fb){try{return await G.get(url)}catch(err){G.toast(err.message,'bad');return fb}}
  const pos = v=>v?.position||{};
  const state=v=>String(pos(v).state||'UNKNOWN').toUpperCase();
  const healthStatus=v=>String(v?.health?.status||'UNKNOWN').toUpperCase();
  const validGPS=p=>Number.isFinite(Number(p?.lat))&&Number.isFinite(Number(p?.lng))&&p.lat!==null&&p.lng!==null&&Math.abs(Number(p.lat))<=90&&Math.abs(Number(p.lng))<=180;
  const fresh=p=>p?.ts&&Date.now()-new Date(p.ts).getTime()<15*60*1000&&Date.now()-new Date(p.ts).getTime()>-60000;
  const gpsStatus=v=>!v.gps_enabled?'Offline':validGPS(pos(v))&&fresh(pos(v))?'Connected':'Offline';
  const odo=v=>v?.odometer_reading??v?.health?.odometer_km??null;
  const fuel=v=>v?.fuel_l??v?.health?.fuel?.fuel_l??v?.health?.fuel?.remaining_l??null;
  const adBlue=v=>v?.adblue_l??v?.health?.fuel?.adblue_l??null;
  const signal=v=>gpsStatus(v)==='Connected'?`<span class="vp-gps ok">${icon('signal',18)} Connected</span>`:`<span class="vp-gps bad">${icon('wifiOff',18)} Offline</span>`;
  const dot=(text,variant)=>`<span class="vp-chip ${variant}">${text}</span>`;
  const plate=v=>String(v?.registration_number||v?.plate||'Vehicle');
  const category=c=>/sleeper/i.test(c?.name||'')? 'Sleeper':'Seater';
  const ac=c=>/non\s*a\/c/i.test(c?.name||'')?false:/a\/c/i.test(c?.name||'');
  const coachCounts=c=>{const s=arr(c?.layout?.decks).flatMap(d=>arr(d.seats));const sleeper=s.filter(x=>String(x.type).toLowerCase().includes('sleep')).length;return {sleeper,seater:s.length-sleeper,capacity:s.length}};
  const toText=(obj,keys)=>keys.map(k=>obj?.[k]).find(x=>x!==null&&x!==undefined&&x!=='' )??null;
  const knownNumber=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
  const formatAge=x=>{if(!x)return 'No GPS update';let ms=Date.now()-new Date(x).getTime();if(!Number.isFinite(ms))return 'Unknown update';if(ms<0)return 'Clock mismatch';if(ms<60000)return 'Just now';if(ms<3600000)return `${Math.floor(ms/60000)} min ago`;if(ms<86400000)return `${Math.floor(ms/3600000)}h ago`;return `${Math.floor(ms/86400000)}d ago`};
  function tabs(active){return `<nav class="vp-areas" aria-label="Vehicle submenus"><a href="#/fleet/vehicles" class="${active==='vehicles'?'selected':''}">Vehicles</a><a href="#/fleet/coaches" class="${active==='coaches'?'selected':''}">Coaches</a></nav>`}
  const sinceAge=x=>{const ms=Date.now()-new Date(x).getTime();if(!x||!Number.isFinite(ms)||ms<0)return 'Since —';if(ms<3600000)return `Since ${Math.max(1,Math.floor(ms/60000))} min`;const h=Math.floor(ms/3600000);return `Since ${h} hr${h===1?'':'s'}`};
  const personSvg='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="7" r="4"/><path d="M4 21v-1a7 7 0 0 1 16 0v1"/></svg>';
  function metr(iconName,val,label,cl){return `<div class="vp-metric ${cl||''}"><span class="vp-metric-icon">${icon(iconName,21)}</span><div class="vp-metric-number">${E(val)}</div><small>${E(label)}</small></div>`}
  function panelModal(title,subtitle,body,{size='wide',footer='',onMount}={}){
    const m=G.modal({title:`<div class="vp-modal-title"><span class="vp-modal-icon">${icon('bus',25)}</span><div><strong>${E(title)}</strong><small>${E(subtitle)}</small></div></div>`,size:'lg',body,foot:footer,onMount});
    m.el.classList.add('vp-overlay','vp-overlay-'+size);
    return m;
  }
  const select=(field,opts,value0)=>`<label class="vp-field"><span>${E(field)}</span><select name="${E(field.toLowerCase().replace(/[^a-z0-9]+/g,'_'))}">${opts.map(o=>{const [v,t]=Array.isArray(o)?o:[o,o];return `<option value="${E(v)}" ${String(v)===String(value0)?'selected':''}>${E(t)}</option>`}).join('')}</select></label>`;
  const input=(label,name,val,attr='')=>`<label class="vp-field"><span>${E(label)}</span><input name="${E(name)}" value="${E(val??'')}" ${attr}/></label>`;
  function lookups(){return Promise.all([G.get('/vehicles'),G.get('/coaches')])}

  async function vehiclesPage(el){
    let data=await lookups(), V=arr(data[0].vehicles), C=arr(data[1].coaches);
    let s={query:'',state:'All states',health:'All health',gps:'All GPS',sort:'plate',layout:readLayout('vehicles')};
    const metrics=()=>`${metr('bus',V.length,'TOTAL','total')}${metr('play',V.filter(v=>state(v)==='MOVING').length,'MOVING','moving')}${metr('pause',V.filter(v=>state(v)==='IDLING').length,'IDLING','idling')}${metr('stop',V.filter(v=>state(v)==='STOPPED').length,'STOPPED','stopped')}${metr('wifiOff',V.filter(v=>gpsStatus(v)==='Offline').length,'GPS OFFLINE','offline')}${metr('alert',V.filter(v=>healthStatus(v)==='CRITICAL').length,'CRITICAL','critical')}${metr('ban',V.filter(v=>v.health?.def_inhibit).length,'DEF INHIBIT','def')}`;
    el.innerHTML=`<div class="vp-scope">${tabs('vehicles')}<section class="vp-toolbar-card"><div class="vp-metrics" data-vp-metrics>${metrics()}</div><div class="vp-controls"><label class="vp-search">${icon('search')}<input data-filter="query" placeholder="Search plate or coach…" aria-label="Search plate or coach"/></label><label class="vp-select">${icon('activity')}<select data-filter="state"><option>All states</option>${['Moving','Idling','Stopped','Unknown'].map(x=>`<option>${x}</option>`).join('')}</select>${icon('down',13)}</label><label class="vp-select">${icon('heart')}<select data-filter="health"><option>All health</option><option>Good</option><option>Issues</option><option>Unknown</option></select>${icon('down',13)}</label><label class="vp-select">${icon('signal')}<select data-filter="gps"><option>All GPS</option><option>Connected</option><option>Offline</option></select>${icon('down',13)}</label><label class="vp-select sort">${icon('sort')}<select data-filter="sort"><option value="plate">Sort: Name (A–Z)</option><option value="plateDesc">Sort: Name (Z–A)</option><option value="state">Sort: State</option><option value="health">Sort: Health</option></select>${icon('down',13)}</label><span class="vp-showing" data-showing></span><div class="vp-view-switch">${button('list','plain','data-layout="list" aria-pressed="true"','List view')}${button('grid','plain','data-layout="grid" aria-pressed="false"','Grid view')}</div></div><div class="vp-toolbar-actions">${b(`${icon('map')} Fleet Map`,'outline','data-action="fleet-map"')}${can('fleet.modify')?b(`${icon('plus')} Add Vehicle`,'primary','data-action="add-vehicle"'):''}</div></section><div data-result></div><p class="vp-datasource">Vehicle position, health and fuel values depend on your connected data feed. The development GDS currently uses simulated positions; this view does not verify physical GPS devices or ECU measurements.</p></div>`;
    const root=q('.vp-scope',el);
    const update=()=>{
      let rows=V.filter(v=>(!s.query||[plate(v),v.coach,v.make,v.model].join(' ').toLowerCase().includes(s.query))&&(s.state==='All states'||state(v)===s.state.toUpperCase())&&(s.health==='All health'||(s.health==='Good'?healthStatus(v)==='GOOD':s.health==='Issues'?healthStatus(v)!=='GOOD'&&healthStatus(v)!=='UNKNOWN':healthStatus(v)==='UNKNOWN'))&&(s.gps==='All GPS'||gpsStatus(v)===s.gps));
      rows.sort((a,b)=>s.sort==='plateDesc'?plate(b).localeCompare(plate(a)):s.sort==='state'?state(a).localeCompare(state(b)):s.sort==='health'?healthStatus(a).localeCompare(healthStatus(b)):plate(a).localeCompare(plate(b)));
      q('[data-showing]',root).textContent=`Showing ${rows.length} of ${V.length}`;
      q('[data-vp-metrics]',root).innerHTML=metrics();
      const header=['REGISTRATION','STATE','ODOMETER','FUEL / ADBLUE','GPS','HEALTH','LOCATION','ALERTS','STATUS','ACTIONS'];
      const row=v=>{
        const p=pos(v), health=v.health||{}, st=state(v), veh=plate(v), stCl=st==='MOVING'?'moving':st==='IDLING'?'idling':st==='STOPPED'?'stopped':'unknown';
        const healthCl=healthStatus(v)==='GOOD'?'good':healthStatus(v)==='UNKNOWN'?'unknown':'warning';
        const alertCount=arr(health.alerts).filter(a=>String(a.status||'').toUpperCase()!=='GOOD').length + (Number(v.doc_alerts)||0);
        const reg=`<strong class="vp-reg">${E(veh)}</strong><small>${E(v.coach||C.find(c=>c.id===v.coach_template_id)?.name||'No coach assigned')}</small><small class="vp-fresh"><span class="vp-green-dot"></span>${validGPS(p)?`Position ${formatAge(p.ts)}`:'No GPS fix'}</small>`;
        const stateHtml=`<span class="vp-state ${stCl}">${icon(st==='MOVING'?'play':st==='IDLING'?'pause':'stop',14)} ${E(st)}</span><small>${validGPS(p)?sinceAge(p.state_since||v.state_since||p.ts):'No position'}</small>`;
        const odometer=`<strong>${odo(v)!==null?number(odo(v))+' km':'—'}</strong><small>${knownNumber(health.engine_hours)?number(health.engine_hours)+' hrs':'Engine hours N/A'}</small>`;
        const tank=(n,label,tone)=>`<div class="vp-tank">${icon(label==='Fuel'?'fuel':'droplet',17)}<span class="vp-tank-bar"><span class="${tone}" style="width:${knownNumber(n)?Math.min(100,Math.max(0,Number(n))):0}%"></span></span><b>${knownNumber(n)?`${E(n)} L`:'N/A'}</b></div>`;
        const fHtml=tank(fuel(v),'Fuel','green')+tank(adBlue(v),'AdBlue','amber');
        const loc=validGPS(p)?`<button type="button" class="vp-link vp-loc" data-action="location" data-id="${E(v.id)}">${icon('pin',16)} <span>Live location</span></button><small>${E(v.location_name||v.address||`${Number(p.lat).toFixed(4)}, ${Number(p.lng).toFixed(4)}`)} · ${knownNumber(p.speed)?E(p.speed):'—'} km/h</small>`:`<span class="vp-muted">No reported location</span>`;
        const acts=`<div class="vp-actions">${button('eye','blue',`data-action="view" data-id="${E(v.id)}"`,'View vehicle')}${can('fleet.modify')?button('pencil','purple',`data-action="edit" data-id="${E(v.id)}"`,'Edit vehicle'):''}${can('fleet.modify')?button('copy','mint',`data-action="duplicate" data-id="${E(v.id)}"`,'Duplicate vehicle'):''}${can('fleet.delete')?button('trash','red',`data-action="delete" data-id="${E(v.id)}"`,'Delete vehicle'):''}</div>`;
        return [reg,stateHtml,odometer,fHtml,`<button class="vp-clearbtn" data-action="location" data-id="${E(v.id)}">${signal(v)}</button>`,`<button class="vp-clearbtn" data-action="health" data-id="${E(v.id)}"><span class="vp-health ${healthCl}">${icon('check',15)} ${E(healthStatus(v)==='UNKNOWN'?'N/A':healthStatus(v))}</span>${alertCount?`<small class="vp-issues">ISSUES ${alertCount.toString().padStart(2,'0')}</small>`:''}</button>`,loc,`<button class="vp-clearbtn vp-bell ${alertCount?'has':''}" data-action="alerts" data-id="${E(v.id)}">${icon('bell',19)}${alertCount?`<span class="vp-alert-num">${alertCount}</span>`:''}</button>`,`<label class="vp-onoff"><input aria-label="${E(veh)} active status" type="checkbox" data-active="${E(v.id)}" ${v.status==='active'?'checked':''} ${!can('fleet.modify')?'disabled':''}/><span class="vp-thumb"></span><b>${v.status==='active'?'Active':'Inactive'}</b></label>`,acts];
      };
      q('[data-result]',root).innerHTML=rows.length?(s.layout==='grid'?window.VehicleCardsV37.renderVehicles(rows,row,icon,E):`<div class="vp-table-scroll"><table class="vp-table vp-vehicle-table"><thead><tr>${header.map((c,i)=>`<th>${icon(['bus','activity','gauge','fuel','signal','heart','pin','bell','power','sort'][i],18)} ${c}</th>`).join('')}</tr></thead><tbody>${rows.map(v=>`<tr>${row(v).map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`):`<div class="vp-empty">No vehicles match the current filters. Clear a filter to see more.</div>`;
      qa('[data-layout]',root).forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.layout===s.layout)));
    };
    root.addEventListener('input',e=>{if(e.target.dataset.filter==='query'){s.query=e.target.value.toLowerCase().trim();update()}});
    root.addEventListener('change',async e=>{
      if(e.target.dataset.filter&&e.target.dataset.filter!=='query'){s[e.target.dataset.filter]=e.target.value;update();return}
      if(e.target.dataset.active){let v=V.find(x=>String(x.id)===e.target.dataset.active);if(!v)return;const target=e.target.checked?'active':'inactive';try{await G.put(`/vehicles/${v.id}`,{status:target});v.status=target;G.toast('Vehicle status saved','ok');update()}catch(err){e.target.checked=!e.target.checked;G.err(err)}}
    });
    root.addEventListener('click',async e=>{
      const layout=e.target.closest('[data-layout]');if(layout){s.layout=layout.dataset.layout;saveLayout('vehicles',s.layout);update();return}
      const action=e.target.closest('[data-action]');if(!action)return;
      const id=action.dataset.id,v=V.find(x=>String(x.id)===id);
      if(action.dataset.action==='fleet-map'){await fleetMap(V);return}
      if(action.dataset.action==='add-vehicle'){await vehicleForm(null,C,()=>vehiclesPage(el));return}
      if(!v)return;
      if(action.dataset.action==='view'){if(window.VehicleDetailV19)await VehicleDetailV19.open({id:v.id,mode:'view',host:el,onDone:()=>vehiclesPage(el)});else await vehicleOverview(v,C);return}
      if(action.dataset.action==='edit'){if(window.VehicleDetailV19)await VehicleDetailV19.open({id:v.id,mode:'edit',host:el,onDone:()=>vehiclesPage(el)});else await vehicleForm(v,C,()=>vehiclesPage(el));return}
      if(action.dataset.action==='duplicate'){if(!can('fleet.modify'))return;const ok=await G.confirm(`Duplicate ${E(plate(v))}? A new unique registration is required.`);if(!ok)return;let vals=await G.prompt('Duplicate vehicle',[{name:'registration_number',label:'New registration number',required:true}]);if(!vals)return;try{await G.post('/vehicles',{registration_number:vals.registration_number,coach_template_id:v.coach_template_id,make:v.make,model:v.model,ownership_type:v.ownership_type,vehicle_role:v.vehicle_role,gps_enabled:false,status:'inactive'});G.toast('Vehicle copied; GPS disabled until configured','ok');vehiclesPage(el)}catch(err){G.err(err)}return}
      if(action.dataset.action==='delete'){if(!can('fleet.delete'))return;if(!await G.confirm(`Delete vehicle ${E(plate(v))}?`,{danger:1}))return;try{await G.del(`/vehicles/${v.id}`);G.toast('Vehicle deleted','ok');vehiclesPage(el)}catch(err){G.err(err)}return}
      if(action.dataset.action==='health'){await healthModal(v);return}
      if(action.dataset.action==='alerts'){await alertsModal(v);return}
      if(action.dataset.action==='location'){await locationModal(v);return}
    });
    update();
  }
  async function vehicleForm(v,C,done){
    const fields=[{name:'registration_number',label:'Registration number *',value:v?.registration_number,required:true},{name:'coach_template_id',label:'Coach *',type:'select',options:C.map(c=>[c.id,c.name]),value:v?.coach_template_id},{name:'make',label:'Make',value:v?.make},{name:'model',label:'Model',value:v?.model},{name:'vehicle_role',label:'Vehicle role',type:'select',options:[['main','Main bus'],['pickup_van','Pickup Van'],['spare','Spare']],value:v?.vehicle_role||'main'},{name:'ownership_type',label:'Ownership',type:'select',options:['permanent','leased','attached'],value:v?.ownership_type||'permanent'},{name:'status',label:'Status',type:'select',options:['active','inactive','maintenance'],value:v?.status||'active'},{name:'gps_enabled',label:'GPS device configured',type:'checkbox',value:v?.gps_enabled}];
    const r=await G.prompt(v?'Edit Vehicle':'Add Vehicle',fields,{size:'lg'});if(!r)return;
    try{if(v)await G.put(`/vehicles/${v.id}`,r);else await G.post('/vehicles',r);G.toast('Vehicle saved','ok');done()}catch(err){G.err(err)}
  }
  async function vehicleOverview(v,C){
    const x=await read(`/vehicles/${v.id}/live`,{}),p=x.fix||v.position||{};
    const body=`<div class="vp-overview-grid"><div class="vp-info-card"><h3>${icon('bus')} Vehicle details</h3><dl>${[['Registration',plate(v)],['Coach',v.coach||C.find(c=>c.id===v.coach_template_id)?.name],['Make',v.make],['Model',v.model],['Role',v.vehicle_role],['Ownership',v.ownership_type],['Status',v.status],['Odometer',odo(v)==null?'—':number(odo(v))+' km']].map(([k,val])=>`<dt>${E(k)}</dt><dd>${value(val)}</dd>`).join('')}</dl></div><div class="vp-info-card"><h3>${icon('pin')} Location</h3><p>${validGPS(p)?`${E(Number(p.lat).toFixed(5))}, ${E(Number(p.lng).toFixed(5))}`:'No reported GPS fix'}</p><small>Updated: ${E(date(p.ts))} · ${E(gpsStatus(v))}</small><h3>${icon('heart')} Health</h3><p>${E(healthStatus(v))} · ${arr(x.health?.alerts).length} reported signals</p></div></div>`;
    const m=panelModal('View Vehicle',plate(v),body,{footer:`<div class="vp-footer">${b('Location','outline','data-vp="location"')}${b('Vehicle Health','outline','data-vp="health"')}${b('Alerts','outline','data-vp="alerts"')}${b('Documents','outline','data-vp="docs"')}${b('Close','primary','data-vp="close"')}</div>`});
    m.el.addEventListener('click',e=>{const a=e.target.closest('[data-vp]');if(!a)return;const x=a.dataset.vp;if(x==='close'){m.close();return}m.close();if(x==='location')locationModal(v);if(x==='health')healthModal(v);if(x==='alerts')alertsModal(v);if(x==='docs')G.docsModal('vehicle',v.id)});
  }
  const metrics={
    ENGINE:[['Engine speed','engine_speed','rpm'],['Engine load','engine_load','%'],['Engine torque','engine_torque','%'],['Accelerator pedal','accelerator_pedal','%'],['Coolant temperature','coolant_temperature','°C'],['Oil pressure','oil_pressure','kPa'],['Oil temperature','oil_temperature','°C'],['Boost pressure','boost_pressure','kPa'],['Intake manifold temperature','intake_manifold_temperature','°C']],
    'FUEL & ADBLUE':[['Fuel level','fuel_level','%'],['Fuel rate','fuel_rate','L/h'],['Average fuel economy','average_fuel_economy','km/L'],['Fuel temperature','fuel_temperature','°C'],['Total fuel used','total_fuel_used','L'],['AdBlue tank level','adblue_tank_level','%'],['AdBlue tank temperature','adblue_tank_temperature','°C']],
    'EXHAUST AFTER-TREATMENT':[['DPF soot load','dpf_soot_load','%'],['DPF ash load','dpf_ash_load','%'],['DPF differential pressure','dpf_differential_pressure','kPa'],['DOC inlet temperature','doc_inlet_temperature','°C'],['DOC outlet temperature','doc_outlet_temperature','°C']],
    'ELECTRICAL & CHASSIS':[['Battery voltage','battery_voltage','V'],['Ambient temperature','ambient_temperature','°C'],['Barometric pressure','barometric_pressure','kPa']]
  };
  const lookupMetric=(v,keys)=>{if(!v||typeof v!=='object')return null;let a=toText(v,keys);if(a!==null)return a;return null};
  function engineCards(health){
    const sources={'ENGINE':health.engine||health.metrics||health.engine_data||{},'FUEL & ADBLUE':health.fuel||health.fuel_adblue||{},'EXHAUST AFTER-TREATMENT':health.exhaust||health.after_treatment||{},'ELECTRICAL & CHASSIS':health.electrical||health.chassis||{}};
    return Object.entries(metrics).map(([heading,fields])=>`<h4 class="vp-engine-heading">${E(heading)}</h4><div class="vp-engine-grid">${fields.map(([label,key,unit])=>{const src=sources[heading],other=health.engine||health.metrics||{};const v=lookupMetric(src,[key,key.replaceAll('_','')])??lookupMetric(other,[key]);return `<div class="vp-engine-card"><small>${E(label)}</small><strong>${v===null?'—':E(v)} <span>${v===null?'':E(unit)}</span></strong></div>`}).join('')}</div>`).join('');
  }
  function predictionRows(health){
    const predictions=arr(health.predictions).length?arr(health.predictions):arr(health.alerts);
    if(!predictions.length)return '<div class="vp-unavailable">Predictive readings have not been received from the tracking device.</div>';
    return predictions.map(a=>{const text=a.title||a.message||a.name||'Signal';const reading=a.reading??a.value;const unit=a.unit||'';const range=a.ideal_range||a.range||a.target||'';const good=String(a.status||'').toUpperCase()==='GOOD';return `<div class="vp-prediction">${icon(/temperature/i.test(text)?'thermometer':/pressure/i.test(text)?'wind':/voltage/i.test(text)?'battery':'gauge',23)}<div><b>${E(text)}</b><div class="vp-pred-reading"><strong>${reading==null?'Reading unavailable':E(reading)+' '+E(unit)}</strong><span>${range?`Ideal range: ${E(range)}`:''}</span></div><small>${a.since||a.ts?`Since: ${E(date(a.since||a.ts))}`:'No observation timestamp'}</small></div><span class="vp-status ${good?'good':'warning'}">${E(a.status||'Reported')}</span></div>`}).join('');
  }
  async function healthModal(v){
    const x=await read(`/vehicles/${v.id}/live`,{}),health=x.health||v.health||{},faults=arr(health.fault_codes||health.faults),hasFeed=Array.isArray(health.fault_codes)||Array.isArray(health.faults),p=x.fix||v.position;
    const active=faults.filter(f=>f.active===true||/active|open/i.test(f.status||'')),inactive=faults.filter(f=>!active.includes(f));
    const modal=panelModal(plate(v),`Vehicle Health · updated ${formatAge(health.updated_at||health.ts||p?.ts)}`,`<div class="vp-health-body"><h3 class="vp-section-heading">Health Alerts</h3><div class="vp-health-columns"><section class="vp-health-box"><header>${icon('wrench')}<b>Fault Codes</b><nav class="vp-segments"><button class="active" data-fault="active">Active (${active.length})</button><button data-fault="inactive">Inactive (${inactive.length})</button></nav></header><div class="vp-fault-content" data-fault-body></div></section><section class="vp-health-box"><header>${icon('activity')}<b>Predictive Algorithms</b></header><div class="vp-predictions">${predictionRows(health)}</div></section></div><section class="vp-health-box vp-engine"><header>${icon('gauge')}<b>Last engine data</b><span>Updated ${formatAge(health.updated_at||p?.ts)}</span></header>${engineCards(health)}</section></div>`,{size:'health'});
    const fill=(filter)=>{const rows=filter==='active'?active:inactive;q('[data-fault-body]',modal.el).innerHTML=rows.length?rows.map(f=>`<div class="vp-fault-row">${icon('wrench')}<div><b>${E(f.code||f.name||'Fault')}</b><small>${E(f.description||f.message||'')}</small></div><span>${E(f.status||'Recorded')}</span></div>`).join(''):`<div class="vp-no-fault">${icon(hasFeed?'check':'alert',41)}<b>${hasFeed?`No ${filter} fault codes`:'Fault code feed unavailable'}</b><small>Fault codes are reported from the vehicle ECU via the tracking device as they change state.</small></div>`};
    fill('active');modal.el.addEventListener('click',e=>{const x=e.target.closest('[data-fault]');if(!x)return;qa('[data-fault]',modal.el).forEach(y=>y.classList.toggle('active',x===y));fill(x.dataset.fault)});
  }
  const alertCategory=a=>{let s=String(a.type||a.category||a.title||a.message||'').toLowerCase();if(/overspeed|speeding|over.speed/.test(s))return 'OVERSPEED';if(/brak/.test(s))return 'HARD BRAKE';if(/idl/.test(s))return 'IDLING';if(/stop|stoppage|halt/.test(s))return 'STOPPAGE';return 'OTHER'};
  async function alertsModal(v){
    const data=await read('/alerts',{alerts:[]}),all=arr(data.alerts).filter(a=>String(a.vehicle_id??a.vehicleId??a.plate??a.registration_number??'')===String(v.id)||String(a.plate||a.registration_number||'').replaceAll(/[^A-Z0-9]/gi,'').toUpperCase()===plate(v).replaceAll(/[^A-Z0-9]/gi,'').toUpperCase());
    const popup=panelModal('Alerts',plate(v),`<div class="vp-alert-filter"><select data-hours aria-label="Alert history"><option value="48">48h</option><option value="24">24h</option><option value="168">7 days</option></select><div class="vp-alert-pills" data-alert-pills></div></div><div class="vp-alert-items" data-alert-items></div>`,{size:'alerts'});
    let selected='All',hours=48;
    const refresh=()=>{
      const since=Date.now()-hours*3600000,rows=all.filter(a=>{const when=new Date(a.ts||a.created_at||'').getTime();return Number.isFinite(when)&&when>=since});
      const categories=['All','OVERSPEED','HARD BRAKE','IDLING','STOPPAGE'];
      q('[data-alert-pills]',popup.el).innerHTML=categories.map(cat=>`<button data-alert-type="${E(cat)}" class="${selected===cat?'active':''}">${E(cat)} ${cat==='All'?rows.length:rows.filter(a=>alertCategory(a)===cat).length}</button>`).join('');
      const filtered=selected==='All'?rows:rows.filter(a=>alertCategory(a)===selected);
      q('[data-alert-items]',popup.el).innerHTML=filtered.length?filtered.map(a=>{const cat=alertCategory(a),cl=cat==='OVERSPEED'?'red':cat==='STOPPAGE'?'orange':'purple';const addr=a.address||a.location||'Location not supplied';const time=a.ts||a.created_at;return `<article class="vp-alert-card ${cl}"><span class="vp-alert-symbol">${icon(cat==='OVERSPEED'?'gauge':cat==='STOPPAGE'?'clock':cat==='HARD BRAKE'?'alert':'pause',25)}</span><div><b>${E(plate(v))}</b><p>${E(a.message||a.title||cat)}</p><small>${icon('pin',15)} ${E(addr)}</small></div><time>${E(time?date(time):'Timestamp unavailable')}</time></article>`}).join(''):'<div class="vp-empty">No matching recorded vehicle alerts. GPS behavior events require a provider-backed event feed.</div>';
    };
    popup.el.addEventListener('change',e=>{if(e.target.matches('[data-hours]')){hours=Number(e.target.value);refresh()}});
    popup.el.addEventListener('click',e=>{const x=e.target.closest('[data-alert-type]');if(x){selected=x.dataset.alertType;refresh()}});
    refresh();
  }
  // OSM tile view: no images baked in, no claimed geolocation when vehicle position is absent.
  function mapShell(id){return `<div class="vp-map" data-vp-map="${E(id)}"><div class="vp-map-tiles"></div><div class="vp-map-markers"></div><div class="vp-map-controls">${button('locate','plain','data-map-action="reset"','Show all')}${button('plus','plain','data-map-action="zoom-in"','Zoom in')}${b('−','vp-map-minus','data-map-action="zoom-out" aria-label="Zoom out"')}${button('layers','plain','data-map-action="layers"','Map layers')}${button('steering','plain','data-map-action="street-view"','Street-level view')}${b('3D','vp-map-three','data-map-action="3d" aria-pressed="false"')}</div><small class="vp-attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors</small></div>`}
  const tileXY=(lat,lng,z)=>{const sin=Math.sin(Math.max(-85,Math.min(85,lat))*Math.PI/180);return {x:(lng+180)/360*2**z,y:(.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*2**z}};
  const unproject=(x,y,z)=>({lng:x/2**z*360-180,lat:180/Math.PI*Math.atan(Math.sinh(Math.PI*(1-2*y/2**z)))});
  function mountMap(root,vehicles,{single=false}={}){
    const map=q('.vp-map',root);if(!map)return;
    const pins=vehicles.filter(v=>validGPS(v.position)).map(v=>({...v,position:{...v.position,lat:Number(v.position.lat),lng:Number(v.position.lng)}}));
    let zoom=single?14:6,center=pins.length?{lat:pins.reduce((n,v)=>n+v.position.lat,0)/pins.length,lng:pins.reduce((n,v)=>n+v.position.lng,0)/pins.length}:{lat:17.38,lng:78.48};
    const tiles=q('.vp-map-tiles',map),markers=q('.vp-map-markers',map);let count=0;
    const draw=()=>{if(!map.isConnected)return;let w=map.clientWidth,h=map.clientHeight;if(!w||!h)return;let c=tileXY(center.lat,center.lng,zoom),ox=c.x*256-w/2,oy=c.y*256-h/2,firstX=Math.floor(ox/256),firstY=Math.floor(oy/256),cols=Math.ceil(w/256)+2,rows=Math.ceil(h/256)+2;let html='';for(let i=0;i<cols;i++)for(let j=0;j<rows;j++){const x=firstX+i,y=firstY+j;const world=2**zoom;if(y<0||y>=world)continue;const sx=(x*256-ox),sy=(y*256-oy);html+=`<img draggable="false" alt="" style="left:${sx}px;top:${sy}px" src="https://tile.openstreetmap.org/${zoom}/${((x%world)+world)%world}/${y}.png">`};tiles.innerHTML=html;
      markers.innerHTML=pins.map(v=>{const p=tileXY(v.position.lat,v.position.lng,zoom),x=p.x*256-ox,y=p.y*256-oy;if(x<-100||x>w+100||y<-110||y>h+100)return '';return `<button class="vp-map-pin" title="${E(plate(v))}" style="left:${x}px;top:${y}px" data-map-vehicle="${E(v.id)}"><span class="vp-map-plate">${E(plate(v))}</span><span class="vp-red-bus">${icon('bus',24)}</span></button>`}).join('')};
    const fit=()=>{if(!pins.length){draw();return}const w=map.clientWidth||1000,h=map.clientHeight||500;center={lat:pins.reduce((n,v)=>n+v.position.lat,0)/pins.length,lng:pins.reduce((n,v)=>n+v.position.lng,0)/pins.length};for(let z=14;z>=3;z--){const coords=pins.map(v=>tileXY(v.position.lat,v.position.lng,z)),dx=(Math.max(...coords.map(p=>p.x))-Math.min(...coords.map(p=>p.x)))*256,dy=(Math.max(...coords.map(p=>p.y))-Math.min(...coords.map(p=>p.y)))*256;if(dx<w-200&&dy<h-180){zoom=z;break}zoom=3}draw()};
    const zoomBy=dir=>{const z=Math.max(2,Math.min(18,zoom+dir));if(z!==zoom){zoom=z;draw()}};
    let start=null;
    map.addEventListener('pointerdown',e=>{if(e.target.closest('button,a'))return;start={x:e.clientX,y:e.clientY,old:tileXY(center.lat,center.lng,zoom)};try{map.setPointerCapture(e.pointerId)}catch(_){}});
    map.addEventListener('pointerup',()=>{start=null});map.addEventListener('pointercancel',()=>{start=null});
    map.addEventListener('pointermove',e=>{if(!start)return;const {x,y}=start.old;center=unproject(x-(e.clientX-start.x)/256,y-(e.clientY-start.y)/256,zoom);draw()});
    map.addEventListener('wheel',e=>{if(e.target.closest('button'))return;e.preventDefault();zoomBy(e.deltaY<0?1:-1)},{passive:false});
    map.addEventListener('click',e=>{const x=e.target.closest('[data-map-action]');if(!x)return;if(x.dataset.mapAction==='zoom-in')zoomBy(1);else if(x.dataset.mapAction==='zoom-out')zoomBy(-1);else if(x.dataset.mapAction==='reset')fit();else if(x.dataset.mapAction==='3d'){map.classList.toggle('is-3d');x.setAttribute('aria-pressed',String(map.classList.contains('is-3d')));G.toast(map.classList.contains('is-3d')?'Perspective preview enabled':'2D map enabled','')}else if(x.dataset.mapAction==='street-view'){G.toast('Street imagery requires a connected street-view provider','')}else G.toast('OpenStreetMap standard layer','')});
    map.addEventListener('click',e=>{const a=e.target.closest('[data-map-vehicle]');if(!a)return;const v=pins.find(x=>String(x.id)===a.dataset.mapVehicle);if(v){locationModal(v)}});
    new ResizeObserver(()=>{if(count++===0){if(!single)fit();else draw()}else draw()}).observe(map);
    if(!pins.length)map.insertAdjacentHTML('beforeend','<div class="vp-map-no-pins">No GPS positions reported. Map pins are shown only for reported coordinates.</div>');
    return {fit,draw};
  }
  async function fleetMap(V){
    const out=V.filter(v=>validGPS(v.position));
    const m=panelModal('Fleet Map',`${out.length} of ${V.length} on map · Moving ${V.filter(v=>state(v)==='MOVING').length}`,`${mapShell('fleet')}<p class="vp-map-disclaimer">Map positions are supplied by the GDS. This development server may simulate locations.</p>`,{size:'map',footer:`<div class="vp-footer">${b(`${icon('expand')} Show all`,'outline','data-vp-map-show')}${b('Close','outline','data-vp-map-close')}</div>`});
    const ctl=mountMap(m.el,V);
    q('[data-vp-map-close]',m.el).onclick=()=>m.close();q('[data-vp-map-show]',m.el).onclick=()=>ctl?.fit();
  }
  async function locationModal(v){
    const x=await read(`/vehicles/${v.id}/live`,{}),p=x.fix||v.position||{},service=x.service,staff=arr(service?.staff);
    const position=validGPS(p),vm={...v,position:p};
    const name=v.location_name||v.address||(position?`${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}`:'No recorded position');
    const crew=staff.length?staff.map(s=>`<span class="vp-crew">${personSvg} <small>${E(s.role)}</small> <b>${E(s.name||'Unnamed')}</b> ${s.phone?`<a href="tel:${E(s.phone)}">${E(s.phone)} ${icon('phone',15)}</a>`:''}</span>`).join(''):'<span class="vp-muted">No crew assigned</span>';
    const m=panelModal('Live location',`${plate(v)} · ${v.coach||'Coach'}`,`<div class="vp-live-trip"><div><span class="vp-next-trip">Next trip</span><b>${E(service?.serviceNumber||v.next_trip?.service||'No trip assigned')} ${E(service?.serviceName||'')}</b><small>${E(service?.origin||'')} ${service?'→':''} ${E(service?.destination||'')}</small></div><span>${service?.departure?E(date(service.departure)):'No trip departure'}</span></div><div class="vp-crew-list">${crew}</div><div class="vp-position-label">${dot(E(p.state||'Unknown'),'state')} ${dot(`Updated ${formatAge(p.ts)}`,'muted')}<h3>${icon('pin')} ${E(name)}</h3></div>${mapShell('single')}<p class="vp-map-disclaimer">${position?'Location is the coordinate returned by the GDS (its demo backend can simulate GPS).':'GPS provider has not returned a position.'}</p>`,{size:'map',footer:`<div class="vp-footer">${b(`${icon('share')} Share`,'outline','data-share-location')}${b(`${icon('refresh')} Refresh`,'outline','data-refresh-location')}${b('Close','primary','data-close-location')}</div>`});
    mountMap(m.el,position?[vm]:[],{single:true});
    q('[data-close-location]',m.el).onclick=()=>m.close();q('[data-refresh-location]',m.el).onclick=()=>{m.close();locationModal(v)};
    q('[data-share-location]',m.el).onclick=async()=>{if(!position){G.toast('No coordinate to share','bad');return}const url=`https://www.openstreetmap.org/?mlat=${Number(p.lat)}&mlon=${Number(p.lng)}#map=15/${Number(p.lat)}/${Number(p.lng)}`;try{await navigator.clipboard.writeText(url);G.toast('Map link copied','ok')}catch{G.toast('Copy link from the browser address bar','')}};
  }
  const amenities=[['airConditioning','Air Conditioning'],['video','Video/Entertainment'],['washroom','Washroom'],['cctv','CCTV'],['emergencyExit','Emergency Exit'],['firstAidKit','First Aid Kit'],['fireExtinguisher','Fire Extinguisher'],['gpsTracking','GPS Tracking'],['wifi','WiFi'],['chargingPoint','Charging Point'],['readingLight','Reading Light'],['waterBottle','Water Bottle'],['blankets','Blankets'],['pillow','Pillow'],['bedSheet','Bed Sheet'],['snacks','Snacks'],['personalTv','Personal TV'],['pushBackSeats','Push Back Seats'],['emergencyHammer','Emergency Hammer'],['seatBelts','Seat Belts'],['fireDetectionSystem','Fire Detection System'],['panicButton','Panic Button']];
  const amenKey=a=>String(a).toLowerCase().replace(/[^a-z0-9]/g,'');
  const amenHas=(list,key,label)=>arr(list).some(a=>[key,label].some(x=>amenKey(a)===amenKey(x)));
  async function coachesPage(el){
    const data=await G.get('/coaches'),C=arr(data.coaches);
    let s={query:'',ac:'all',berths:'all',sort:'asc',layout:readLayout('coaches')};
    const berthLabels={all:'All berths',seater:'Seater',sleeper:'Sleeper'};
    const berthIcons={all:icon('bed',19),seater:icon('armchair',19),sleeper:icon('bed',19)};
    const berthOptions=()=>['all','seater','sleeper'].map(key=>
      `<button type="button" role="option" tabindex="-1" class="vp-berth-option" aria-selected="${s.berths===key}"
       data-coach-berth="${key}"><span class="vp-berth-optico">${berthIcons[key]}</span>
       <span>${berthLabels[key]}</span><span class="vp-berth-number" data-coach-berth-count="${key}">0</span>
       <span class="vp-berth-checked">${icon('check',20)}</span></button>`).join('');
    const berthWidget=`<div class="vp-berth-filter" data-berth-wrap>
      <button type="button" class="vp-berth-toggle" data-coach-berth-toggle
       aria-haspopup="listbox" aria-expanded="false" aria-controls="vp-berth-options">
       <span class="vp-berth-icon">${icon('bed',21)}</span>
       <span data-coach-berth-label>All berths</span><span class="vp-berth-caret">${icon('down',16)}</span></button>
      <div class="vp-berth-menu" id="vp-berth-options" role="listbox" aria-label="Filter coach berths"
       data-coach-berth-menu hidden>${berthOptions()}</div></div>`;
    el.innerHTML=`<div class="vp-scope">${tabs('coaches')}<section class="vp-toolbar-card vp-coaches-tools"><div class="vp-metrics vp-coach-metrics">${metr('bus',C.length,'COACHES','total')}${metr('snowflake',C.filter(ac).length,'AC','ice')}${metr('bed',C.filter(c=>coachCounts(c).sleeper>0).length,'SLEEPER','purple')}${metr('armchair',C.filter(c=>coachCounts(c).seater>0).length,'SEATER','amber')}${metr('video',C.filter(c=>amenHas(c.amenities,'video','Video/Entertainment')).length,'VIDEO','def')}</div><div class="vp-controls vp-coach-controls"><label class="vp-search">${icon('search')}<input placeholder="Search name or type…" data-coach="query" aria-label="Search coaches"/></label><label class="vp-select">${icon('snowflake')}<select data-coach="ac"><option value="all">All</option><option value="ac">A/C</option><option value="non">Non A/C</option></select>${icon('down',13)}</label>${berthWidget}<label class="vp-select sort">${icon('sort')}<select data-coach="sort"><option value="asc">Sort: Name (A–Z)</option><option value="desc">Sort: Name (Z–A)</option><option value="seats">Sort: Most seats</option></select>${icon('down',13)}</label><span class="vp-showing" data-showing></span><div class="vp-view-switch">${button('list','plain','data-layout="list"','List view')}${button('grid','plain','data-layout="grid"','Grid view')}</div></div><div class="vp-toolbar-actions">${can('fleet.modify')?b(`${icon('plus')} Add Coach`,'primary','data-action="add-coach"'):''}</div></section><div data-result></div></div>`;
    const root=q('.vp-scope',el);
    const update=()=>{
      const possible=C.filter(c=>(!s.query||`${c.name} ${c.bus_type} ${c.pattern}`.toLowerCase().includes(s.query))&&(s.ac==='all'||(s.ac==='ac'?ac(c):!ac(c))));
      const facet={all:possible.length,seater:possible.filter(c=>coachCounts(c).seater>0).length,
        sleeper:possible.filter(c=>coachCounts(c).sleeper>0).length};
      for(const opt of qa('[data-coach-berth]',root)){
        const key=opt.dataset.coachBerth;
        opt.setAttribute('aria-selected',String(key===s.berths));
        const count=q('[data-coach-berth-count]',opt);if(count)count.textContent=String(facet[key]??0);
      }
      q('[data-coach-berth-label]',root).textContent=berthLabels[s.berths];
      let rows=possible.filter(c=>s.berths==='all'||(s.berths==='seater'?coachCounts(c).seater>0:coachCounts(c).sleeper>0));
      rows.sort((a,b)=>s.sort==='seats'?coachCounts(b).capacity-coachCounts(a).capacity:s.sort==='desc'?b.name.localeCompare(a.name):a.name.localeCompare(b.name));
      q('[data-showing]',root).textContent=`Showing ${rows.length} of ${C.length}`;
      const columns=['NAME','TYPE','LAYOUT','SEATS','FEATURES','STATUS','ACTIONS'];
      const cells=c=>{const counts=coachCounts(c),name=c.name||'Unnamed coach',sub=c.alt_name||c.alternative_name||'';const acts=`<div class="vp-actions">${button('eye','blue',`data-action="view" data-id="${E(c.id)}"`,'View coach')}${can('fleet.modify')?button('pencil','purple',`data-action="edit" data-id="${E(c.id)}"`,'Edit coach'):''}${can('fleet.modify')?button('copy','mint',`data-action="duplicate" data-id="${E(c.id)}"`,'Duplicate coach'):''}${can('fleet.delete')?button('trash','red',`data-action="delete" data-id="${E(c.id)}"`,'Delete coach'):''}</div>`;
        const seatLabel=[counts.seater?`${counts.seater} Seater`:'',counts.sleeper?`${counts.sleeper} Sleeper`:'' ].filter(Boolean).join('<br>')||'No seat layout';
        return [`<b>${E(name)}</b>${sub?` <span class="vp-coach-alias">${E(sub)}</span>`:''}`,`<span class="vp-coach-type ${/pickup/i.test(c.bus_type||'')?'pickup':''}">${E(/pickup/i.test(c.bus_type||'')?'Pickup Van':'Regular')}</span>`,`<span class="vp-layout-pill">${E(c.pattern||'—')}</span>`,seatLabel,ac(c)?`<span class="vp-ac-chip">${icon('snowflake',14)} AC</span>`:'<span class="vp-muted">—</span>',`<label class="vp-onoff"><input type="checkbox" data-coach-status="${E(c.id)}" ${c.status!=='inactive'?'checked':''} ${!can('fleet.modify')?'disabled':''}/><span class="vp-thumb"></span><b>${c.status!=='inactive'?'Active':'Inactive'}</b></label>`,acts];
      };
      q('[data-result]',root).innerHTML=rows.length?(s.layout==='grid'?window.VehicleCardsV37.renderCoaches(rows,cells,coachCounts,icon,E):`<div class="vp-table-scroll"><table class="vp-table vp-coach-table"><thead><tr>${columns.map((c,i)=>`<th>${icon(['bus','layers','grid','armchair','zap','power','sort'][i],18)} ${c}</th>`).join('')}</tr></thead><tbody>${rows.map(c=>`<tr>${cells(c).map(v=>`<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`):'<div class="vp-empty">No coaches match your filters.</div>';
      qa('[data-layout]',root).forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.layout===s.layout)));
    };
    root.addEventListener('input',e=>{if(e.target.dataset.coach==='query'){s.query=e.target.value.toLowerCase().trim();update()}});
    root.addEventListener('change',async e=>{if(e.target.dataset.coach&&e.target.dataset.coach!=='query'){s[e.target.dataset.coach]=e.target.value;update();return}if(e.target.dataset.coachStatus){const c=C.find(c=>String(c.id)===e.target.dataset.coachStatus);try{await G.put(`/coaches/${c.id}`,{status:e.target.checked?'active':'inactive'});c.status=e.target.checked?'active':'inactive';update();G.toast('Coach status saved','ok')}catch(err){e.target.checked=!e.target.checked;G.err(err)}}});
    const toggleBerths=q('[data-coach-berth-toggle]',root),menuBerths=q('[data-coach-berth-menu]',root);
    const showBerths=open=>{menuBerths.hidden=!open;toggleBerths.setAttribute('aria-expanded',String(open));};
    root.addEventListener('keydown',e=>{
      if(!e.target.closest('[data-berth-wrap]'))return;
      const options=qa('[data-coach-berth]',menuBerths);
      if(e.key==='Escape'){showBerths(false);toggleBerths.focus();e.preventDefault();return}
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){
        e.preventDefault();if(menuBerths.hidden)showBerths(true);
        const focused=options.indexOf(document.activeElement);
        const next=focused<0?options.findIndex(o=>o.dataset.coachBerth===s.berths):
          (focused+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;
        options[Math.max(next,0)]?.focus();
      }
      if(e.key==='Enter'||e.key===' '){
        if(e.target===toggleBerths){e.preventDefault();showBerths(menuBerths.hidden);}
        else if(e.target.dataset.coachBerth){e.preventDefault();e.target.click();}
      }
    });
    if(document?.addEventListener){
      const outside=e=>{if(!root.isConnected){document.removeEventListener('click',outside,true);return}
        if(!e.target.closest?.('[data-berth-wrap]'))showBerths(false);};
      document.addEventListener('click',outside,true);
    }
    root.addEventListener('click',async e=>{
      const btn=e.target.closest('[data-coach-berth-toggle]');
      if(btn){showBerths(menuBerths.hidden);return}
      const opt=e.target.closest('[data-coach-berth]');
      if(opt){s.berths=opt.dataset.coachBerth;showBerths(false);update();toggleBerths.focus();return}
      if(!menuBerths.hidden)showBerths(false);
      const layout=e.target.closest('[data-layout]');if(layout){s.layout=layout.dataset.layout;saveLayout('coaches',s.layout);update();return}const a=e.target.closest('[data-action]');if(!a)return;const c=C.find(c=>String(c.id)===a.dataset.id),act=a.dataset.action;if(act==='add-coach'){coachModal({id:null,name:'',bus_type:'A/C Seater',pattern:'2+2',amenities:[],layout:{decks:[],capacity:0}},true,()=>coachesPage(el));return}if(!c)return;
      if(act==='view'){coachModal(c,false,()=>coachesPage(el));return}if(act==='edit'){coachModal(c,true,()=>coachesPage(el));return}
      if(act==='duplicate'){let v=await G.prompt('Duplicate Coach',[{name:'name',label:'New coach name',value:`${c.name} Copy`,required:true}]);if(!v)return;try{await G.post('/coaches',{name:v.name,bus_type:c.bus_type,pattern:c.pattern,layout:c.layout,amenities:c.amenities,emergency_exits:c.emergency_exits});G.toast('Coach duplicated','ok');coachesPage(el)}catch(err){G.err(err)}return}
      if(act==='delete'){if(!await G.confirm('Delete this coach? A coach assigned to a route or vehicle cannot be removed.',{danger:1}))return;try{await G.del(`/coaches/${c.id}`);G.toast('Coach removed','ok');coachesPage(el)}catch(err){G.err(err)}}});
    update();
  }
  function layoutTableSeats(layout){const rows=[];arr(layout?.decks).forEach((d,deck)=>arr(d.seats).forEach((s,i)=>rows.push({...s,code:s.code||s.id||s.name||String(i+1),deck:deck?'Upper':'Lower',grid:`R${Number(s.row||0)+1}C${Number(s.col||0)+1}Z0`,deckIndex:deck,localIndex:i})));return rows}
  function coachDiagram(layout){
    const decks=arr(layout?.decks);
    if(!decks.length)return '<div class="vp-layout-blank">No seat layout configured. Edit this coach and choose Generate Layout to create one.</div>';
    return `<div class="vp-decks">${decks.map((deck,i)=>{const seats=arr(deck.seats),maxCol=Math.max(4,...seats.map(s=>(Number(s.col)||0)+(Number(s.w)||1))),maxRow=Math.max(8,...seats.map(s=>(Number(s.row)||0)+(Number(s.h)||1))),cols=Number(deck.cols)||maxCol,rows=Number(deck.rows)||maxRow;
      return `<div class="vp-deck"><header><b>${E(deck.deck|| (i?'UPPER':'LOWER'))}</b>${i===0?`<span class="vp-wheel">${icon('steering',29)}</span>`:''}</header><div class="vp-grid-seats" style="--cols:${cols};--rows:${rows}">${seats.map((s,si)=>{const sleeper=String(s.type||'').toLowerCase().includes('sleep'),fixture=/exit|wash|toilet/i.test(s.type||'');return `<button type="button" class="vp-seat ${sleeper?'sleeper':'seater'} ${fixture?'fixture':''}" data-layout-seat="${i}:${si}" style="grid-row:${Number(s.row||0)+1} / span ${Math.max(1,Number(s.h)||1)};grid-column:${Number(s.col||0)+1} / span ${Math.max(1,Number(s.w)||1)}" title="${E(s.code||s.name||'Seat')} · ${E(s.type||'Seater')}"><span>${E(s.code||s.name||'—')}</span>${sleeper?'<small>SLB</small>':''}</button>`}).join('')}</div><span class="vp-emergency-exit">${icon('exit',17)}</span></div>`}).join('')}</div>`;
  }
  function createLayout(kind,pattern='2+2'){
    const sleeper=(name,suffix,rows)=>{const [l,r]=pattern.split('+').map(Number);const seats=[];for(let row=0,num=1;row<rows;row++)for(let col=0;col<l+r;col++)seats.push({code:`${num++}${suffix}`,row:row*2,col:col<l?col:col+1,type:'sleeper',w:1,h:2});return {deck:name,rows:rows*2,cols:l+r+1,seats}};
    if(kind==='sleeper'){const a=[sleeper('LOWER','L',6),sleeper('UPPER','U',6)];return {decks:a,capacity:a.reduce((n,d)=>n+d.seats.length,0)}}
    if(kind==='seater'){let n=1;const [l,r]=pattern.split('+').map(Number),d={deck:'LOWER',rows:12,cols:l+r+1,seats:[]};for(let i=0;i<12;i++)for(let j=0;j<l+r;j++)d.seats.push({code:String(n++),row:i,col:j<l?j:j+1,type:'seater',w:1,h:1});return {decks:[d],capacity:d.seats.length}}
    const d={deck:'LOWER',rows:12,cols:4,seats:[]};for(let i=0;i<6;i++)d.seats.push({code:`${i+1}L`,row:i*2,col:3,type:'sleeper',w:1,h:2});for(let i=0;i<12;i++)for(const col of [0,1])d.seats.push({code:String(i*2+col+1),row:i,col,type:'seater',w:1,h:1});const up=sleeper('UPPER','U',6);return {decks:[d,up],capacity:d.seats.length+up.seats.length};
  }
  function coachModal(coach,editing=false,done=()=>{}){
    let draft=JSON.parse(JSON.stringify(coach)),tab='type',search='',selected=new Set();draft.amenities=arr(draft.amenities);draft.layout=draft.layout||{decks:[],capacity:0};draft.upperDeck=arr(draft.layout.decks).length>1;
    const coach21=window.Coach21V46, target21=()=>!!coach21?.isTarget(draft), assigned=()=>!!(Number(coach?.vehicles||0)||Number(coach?.routes||0));
    if(target21())tab='seats';
    const cats=['Coach Type','Amenities','Seat Layout'];
    const m=panelModal(editing?(draft.id?'Edit Coach':'Add Coach'):'View Coach',coach.name||'New Coach',`<div class="vp-coach-modal"><nav class="vp-modal-tabs">${cats.map((label,i)=>`<button type="button" data-tab="${['type','amenities','seats'][i]}" class="${['type','amenities','seats'][i]===tab?'active':''}">${icon(['bus','zap','grid'][i])} ${label}</button>`).join('')}</nav><div class="vp-coach-content" data-coach-content></div></div>`,{size:'coach',footer:`<div class="vp-footer">${b('Cancel','outline','data-modal-cancel')}${editing?b(target21()?`${icon('check')} Update Coach`:`${icon('check')} Save Changes`,'primary','data-modal-save'):''}</div>`});
    if(target21())m.el.classList.add('cv46-target');
    const root=q('[data-coach-content]',m.el);
    function typeHTML(){const counts=coachCounts(draft),cname=draft.name||'',bt=draft.bus_type||'A/C Seater',pickup=/pickup/i.test(bt),cat=/seater.*sleeper/i.test(bt)?'Seater/Sleeper':/sleeper/i.test(bt)?'Sleeper':'Seater';
      return `<div class="vp-edit-fields">${input('Coach Name *','name',cname,editing?'required':'disabled')}${input('Alternative name','alt_name',draft.alt_name||'',editing?'':'disabled')}${select('Coach Type *',[['Regular','Regular'],['Pickup Van','Pickup Van']],pickup?'Pickup Van':'Regular')}${select('A/C Type *',['A/C','Non A/C'],/non a\/c/i.test(bt)?'Non A/C':'A/C')}${select('Bus Category *',['Seater','Sleeper','Seater/Sleeper'],cat)}${select('Layout Type *',['2+2','2+1','1+1'],draft.pattern||'2+2')}${select('Bus Manufacturer *',target21()?['Standard','Ashok Leyland','Bharat Benz','Volvo','Scania','Other']:['Standard','Bharat Benz','Volvo','Scania','Other'],draft.manufacturer||'Standard')}${input('Bus Type','bus_type',draft.bus_type||'',editing?'':'disabled')}${input('Total Seater Seats','seater_total',counts.seater,'readonly')}${input('Total Semi Sleeper Seats','semi_total',draft.semi_total||0,'readonly')}${input('Total Sleeper Berths','sleeper_total',counts.sleeper,'readonly')}</div><label class="vp-checkbox"><input type="checkbox" name="upper_deck" ${arr(draft.layout.decks).length>1?'checked':''} ${editing?'':'disabled'}/> Has Upper Deck</label>`}
    function amenitiesHTML(){return `<div class="vp-amenities-grid">${amenities.map(([key,label])=>`<label class="vp-amenity"><input type="checkbox" data-amenity="${key}" ${amenHas(draft.amenities,key,label)?'checked':''} ${editing?'':'disabled'}/><span>${E(label)}</span></label>`).join('')}</div>`}
    function seatsHTML(){
      if(target21()){
        const counts=coach21.layoutCounts(draft.layout),
          rows=coach21.tableRows(draft.layout,draft.emergency_exits),
          disabled=(!editing||assigned()),
          total=counts.capacity,
          safe=E;
        const typeClass=x=>String(x||'').toLowerCase().replace(/[^a-z0-9_]/g,'');
        const rowHTML=(seat,i)=>{
          const isSeat=seat.kind==='seat',editable=editing,
            removeDisabled=!editing||assigned(),
            rowID=isSeat?seat.ref:seat.kind==='virtual-fixture'?'back-exit':'fixture-'+seat.ref;
          const canRemove=editing&&!assigned();
          return '<tr data-seat-row="'+i+'">'+
            '<td class="cv46-index">'+(i+1)+'</td>'+
            '<td><input class="cv46-name" type="text" maxlength="50" data-seat-label="'+(isSeat?safe(seat.ref):seat.kind==='virtual-fixture'?'back-exit':'fixture-'+safe(seat.ref))+'" '+
              'title="'+safe(isSeat?'Booking seat ID: '+seat.code+' · display name can be changed independently':seat.label)+'" '+
              'value="'+safe(seat.label)+'" '+(editable?'':'disabled')+' /></td>'+
            '<td><span class="cv46-kind '+typeClass(seat.type)+'">'+safe(seat.type)+'</span></td>'+
            '<td class="cv46-deck-label">'+safe(seat.deck==='LOWER'?'Lower':'Upper')+'</td>'+
            '<td>'+ (seat.orientation==='Vertical'?'<span class="cv46-orientation">↕ Vertical</span>':'<span class="cv46-dash">—</span>') +'</td>'+
            '<td class="cv46-grid-pos">'+safe(seat.position)+'</td>'+
            '<td><button type="button" class="cv46-remove" data-cv46-remove="'+safe(rowID)+'" '+
              (canRemove?'':'disabled title="Assigned coaches cannot change physical positions"')+
              ' aria-label="Delete '+safe(seat.label)+'">'+icon('trash',20)+'</button></td>'+
          '</tr>';
        };
        const legend=[['Available','available'],['Male (Booked)','male'],['Female (Booked)','female'],
          ['Blocked','blocked'],['No-show','no-show'],['Selected','selected']];
        return '<div class="cv46-editor">'+
          '<section class="vp-config-panel cv46-summary"><div><h3>Current Configuration</h3>'+
            '<p><b>Bus Type:</b> '+safe((draft.manufacturer&&draft.manufacturer!=='Standard'?draft.manufacturer+' ':'')+(draft.bus_type||draft.name||'A/C Seater/Sleeper (2+1)'))+'</p>'+
            '<p><b>Layout:</b> 2+1 (4 columns with gangway, max 16 rows)</p>'+
            '<p><b>Seaters:</b> '+counts.seaters+' | <b>Semi-Sleepers:</b> '+Number(draft.semi_total||0)+' | <b>Sleepers:</b> '+counts.sleepers+'</p>'+
            '<p class="vp-config-total"><b>Total Seats:</b> '+total+'</p></div>'+
            b('Generate Layout','primary','data-generate '+(disabled?'disabled title="Physical layout editing is unavailable for assigned coaches"':''))+
          '</section>'+
          '<div class="vp-seat-legend cv46-legend">'+legend.map(([name,kind])=>'<span><i class="'+kind+'"></i>'+name+'</span>').join('')+'</div>'+
          '<div class="vp-diagram-wrap cv46-diagram">'+coach21.renderDiagram(draft.layout,{selected:[...selected],disabled:!editing,emergencyExits:draft.emergency_exits})+'</div>'+
          '<div class="vp-config-header cv46-config-head"><h3>Seat Configuration <small>('+total+' Total seats)</small></h3>'+
           '<div class="cv46-config-actions"><label class="cv46-search">'+icon('search',18)+
             '<input type="search" data-search-seat value="'+safe(search)+'" placeholder="Search by seat ID or type" aria-label="Search seat configuration" /></label>'+
             '<button type="button" class="cv46-add" data-cv46-add '+(disabled?'disabled':'')+'>'+icon('plus',17)+' Add Seat</button>'+
             '<button type="button" class="cv46-reset" data-cv46-reset '+(!editing?'disabled':'')+'>Reset Names</button>'+
           '</div></div>'+
          '<p class="cv46-tip">Tip: Click on any Display Name field below to edit it. Changes are applied in real-time to the seat grid above.</p>'+
          '<div class="vp-seat-table-scroll cv46-seat-table-scroll"><table class="vp-table vp-seat-config cv46-seat-table">'+
            '<thead><tr><th>#</th><th>Display Name (Editable)</th><th>Type</th><th>Deck</th><th>Orientation</th><th>Position (Grid)</th><th>Actions</th></tr></thead>'+
            '<tbody>'+rows.map(rowHTML).join('')+'</tbody></table></div>'+
          (assigned()?'<p class="cv46-assigned-note">This coach is assigned to a vehicle or route. Display names may be changed without changing inventory seat IDs; adding, deleting or regenerating physical seats requires a controlled inventory migration.</p>':'')+
        '</div>';
      }
      let counts=coachCounts(draft),seats=layoutTableSeats(draft.layout),
        fixtureList=[...arr(draft.layout.decks).flatMap((d,i)=>arr(d.fixtures).map(f=>({code:f.name||f.code||f.type||'Fixture',type:f.type||'FIXTURE',deck:i?'Upper':'Lower',orientation:f.orientation||'—',position:f.position||'Not specified',fixture:true}))),
          ...[...new Set([...arr(draft.emergency_exits),...(amenHas(draft.amenities,'washroom','Washroom')?['Toilet']:[])])].map(name=>({code:name,type:/wash|toilet/i.test(name)?'WASH_ROOM':/roof/i.test(name)?'ROOF_EXIT':/back/i.test(name)?'BACK_EXIT':'EE_EXIT',deck:'Lower',orientation:/wash|toilet/i.test(name)?'Horizontal':'—',position:'Not specified',fixture:true}))],
        allSeats=[...seats,...fixtureList];
      return '<div class="vp-config-panel"><div><h3>Current Configuration</h3><p><b>Bus Type:</b> '+E(draft.bus_type||draft.name||'Unspecified')+'</p><p><b>Layout:</b> '+E(draft.pattern||'—')+' · '+arr(draft.layout.decks).length+' deck(s)</p><p><b>Seaters:</b> '+counts.seater+' | <b>Semi-Sleepers:</b> '+E(draft.semi_total||0)+' | <b>Sleepers:</b> '+counts.sleeper+'</p><p class="vp-config-total"><b>Total seats:</b> '+counts.capacity+'</p></div>'+b(icon('refresh')+' Generate Layout','primary','data-generate '+(editing?'':'disabled'))+'</div>'+
        '<div class="vp-seat-legend">'+[['Available','available'],['Male (Booked)','male'],['Female (Booked)','female'],['Blocked','blocked'],['No-show','no-show'],['Selected','selected']].map(([t,cl])=>'<span><i class="'+cl+'"></i> '+t+'</span>').join('')+'</div>'+
        '<div class="vp-diagram-wrap">'+coachDiagram(draft.layout)+'</div><div class="vp-config-header"><h3>Seat Configuration <small>('+seats.length+' Total seats)</small></h3><label class="vp-search">'+icon('search')+'<input type="search" data-search-seat value="'+E(search)+'" placeholder="Search by seat ID or type…" /></label></div>'+
        '<div class="vp-seat-table-scroll"><table class="vp-table vp-seat-config"><thead><tr><th>#</th><th>Display Name (Editable)</th><th>Type</th><th>Deck</th><th>Orientation</th><th>Position (Grid)</th></tr></thead><tbody>'+
        allSeats.map((item,i)=>'<tr data-seat-row="'+i+'"><td>'+(i+1)+'</td><td><input type="text" data-seat-label="'+(item.fixture?'fixture':item.deckIndex+':'+item.localIndex)+'" value="'+E(item.code)+'" '+(editing&&!item.fixture?'':'disabled')+' /></td><td><span class="vp-seat-kind '+E(String(item.type||'seater').toLowerCase())+'">'+E(item.type||'SEATER')+'</span></td><td>'+E(item.deck)+'</td><td>'+E(item.orientation||'—')+'</td><td>'+E(item.position||item.grid)+'</td></tr>').join('')+
        '</tbody></table></div>';
    }
    const draw=()=>{qa('[data-tab]',m.el).forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));root.innerHTML=tab==='type'?typeHTML():tab==='amenities'?amenitiesHTML():seatsHTML();if(!editing)qa('select',root).forEach(el=>el.disabled=true)};
    m.el.addEventListener('click',async e=>{
      const t=e.target.closest('[data-tab]');if(t){tab=t.dataset.tab;draw();return}
      if(e.target.closest('[data-modal-cancel]')){m.close();return}
      if(e.target.closest('[data-generate]')){if(!editing)return;if(target21()){if(assigned()){G.toast('Physical layout cannot change while assigned to vehicles or routes','warn');return;}if(draft.id&&!await G.confirm('Regenerate the 46-seat 2+1 layout? This replaces seat positions in the unsaved draft.'))return;draft.layout=coach21.build();draft.upperDeck=true;selected.clear();draw();G.toast('46-seat layout generated in editor; click Update Coach to save','ok');return;}const bt=draft.bus_type||draft.name||'',kind=/seater.*sleeper/i.test(bt)?'seater_sleeper':/sleeper/i.test(bt)?'sleeper':'seater';if(draft.id&&!(await G.confirm('Regenerate this coach layout? Existing seat positions and labels will be replaced in this unsaved draft.')))return;if(draft.id&&(coach.vehicles>0||coach.routes>0)){G.toast('Coach is in use. Existing seat layouts cannot be regenerated safely.','bad');return}draft.layout=createLayout(kind,draft.pattern||'2+2');if(!draft.upperDeck&&draft.layout.decks.length>1)draft.layout.decks=draft.layout.decks.slice(0,1);if(draft.upperDeck&&draft.layout.decks.length===1){let lower=draft.layout.decks[0];draft.layout.decks.push({deck:'UPPER',rows:lower.rows,cols:lower.cols,seats:arr(lower.seats).map(t=>({...t,code:String(t.code)+'U'}))})}draft.layout.capacity=draft.layout.decks.reduce((n,d)=>n+arr(d.seats).length,0);selected.clear();draw();G.toast('Layout generated in editor; save to persist','ok');return}
      if(target21()&&editing){
        if(e.target.closest('[data-cv46-add]')){
          if(assigned())return G.toast('Cannot add physical seats to a coach used by a vehicle or route','warn');
          const vals=await G.prompt('Add Seat',[
            {name:'code',label:'Seat ID',required:true},
            {name:'deck',label:'Deck',type:'select',options:[['LOWER','Lower'],['UPPER','Upper']]},
            {name:'type',label:'Seat Type',type:'select',options:[['seater','Seater'],['sleeper','Sleeper']]}
          ],{ok:'Add Seat'});
          if(!vals)return;
          try{coach21.addSeat(draft.layout,vals);const scroll=root.scrollTop;draw();root.scrollTop=scroll;G.toast('Seat added to unsaved layout','ok');}
          catch(err){G.toast(err.message,'bad');}
          return;
        }
        if(e.target.closest('[data-cv46-reset]')){
          if(!await G.confirm('Restore all seat display names to booking seat IDs?'))return;
          for(const deck of arr(draft.layout?.decks)){
            for(const seat of arr(deck.seats))delete seat.display_name;
            for(const fixture of arr(deck.fixtures))delete fixture.display_name;
          if(draft.layout?.fixture_aliases)delete draft.layout.fixture_aliases.back_exit;
          }
          const scroll=root.scrollTop;draw();root.scrollTop=scroll;
          G.toast('Seat display names reset; Update Coach to persist','ok');return;
        }
        const del=e.target.closest('[data-cv46-remove]');
        if(del){
          if(assigned())return G.toast('Cannot delete assigned physical seats or exits','warn');
          const ref=del.dataset.cv46Remove;
          if(!await G.confirm('Remove '+E(ref)+' from this coach layout?'))return;
          try{
            if(ref==='back-exit')draft.emergency_exits=arr(draft.emergency_exits).filter(x=>!/back\s*exit/i.test(String(x)));
            else if(ref.startsWith('fixture-')){
              const [deck,index]=ref.slice(8).split(':').map(Number);
              const f=draft.layout?.decks?.[deck]?.fixtures?.[index];
              if(!f)throw Error('Exit not found');
              draft.layout.decks[deck].fixtures.splice(index,1);
              if(/back\s*exit/i.test(String(f.name||f.code)))
                draft.emergency_exits=arr(draft.emergency_exits).filter(x=>!/back\s*exit/i.test(String(x)));
            }else coach21.removeSeat(draft.layout,ref);
            const scroll=root.scrollTop;selected.clear();draw();root.scrollTop=scroll;
            G.toast('Removed in editor; Update Coach to save','ok');
          }catch(err){G.toast(err.message,'bad')}
          return;
        }
      }
      const seat=e.target.closest('[data-layout-seat]');if(seat){if(!editing)return;const ref=seat.dataset.layoutSeat;selected.has(ref)?selected.delete(ref):selected.add(ref);seat.classList.toggle(target21()?'selected':'vp-seat-focus',selected.has(ref));return}
      if(e.target.closest('[data-modal-save]')){
        if(!editing)return;const name=String(draft.name||'').trim();if(!name)return G.toast('Coach name is required','bad');
        if(target21()){draft.layout.capacity=coach21.activeCount(draft.layout);try{coach21.validateLayout(draft.layout)}catch(error){G.toast(error.message,'bad');return;}}
        if(draft.id&&assigned()&&(target21()?coach21.structuralSignature(coach.layout)!==coach21.structuralSignature(draft.layout):JSON.stringify(coach.layout||{})!==JSON.stringify(draft.layout||{})))return G.toast('Assigned coaches cannot change physical seat positions or inventory IDs','bad');
        const body={name,bus_type:draft.bus_type||name,pattern:draft.pattern||'2+2',amenities:draft.amenities,layout:draft.layout,alt_name:draft.alt_name||'',manufacturer:draft.manufacturer||'Standard'};if(target21())body.emergency_exits=arr(draft.emergency_exits);
        try{if(draft.id){await G.put(`/coaches/${draft.id}`,body)}else{await G.post('/coaches',body)}m.close();G.toast('Coach saved','ok');done()}catch(err){G.err(err)}return;
      }
    });
    m.el.addEventListener('input',e=>{const t=e.target;if(t.matches('[data-search-seat]')){search=t.value;qa('[data-seat-row]',root).forEach(tr=>tr.hidden=!tr.innerText.toLowerCase().includes(search.toLowerCase()));return}if(t.matches('[data-seat-label]')){const id=t.dataset.seatLabel;if(target21()&&id==='back-exit'){draft.layout.fixture_aliases={...(draft.layout.fixture_aliases||{}),back_exit:t.value};const exit=q('[data-cv46-exit-label]',root);if(exit)exit.title=t.value;return;}if(target21()&&id.startsWith('fixture-')){const [deck,index]=id.slice(8).split(':').map(Number);const fixture=draft.layout?.decks?.[deck]?.fixtures?.[index];if(fixture)fixture.display_name=t.value;return;}const [deck,index]=id.split(':').map(Number),record=draft.layout?.decks?.[deck]?.seats?.[index];if(record){if(target21()){record.display_name=t.value;const gridLabel=q('[data-cv46-label="'+deck+':'+index+'"]',root);if(gridLabel)gridLabel.textContent=t.value;}else record.code=t.value;}return}if(t.name){const map={name:'name',alt_name:'alt_name',bus_type:'bus_type'};if(map[t.name])draft[map[t.name]]=t.value}});
    m.el.addEventListener('change',e=>{
      const t=e.target;if(t.dataset.amenity){if(!editing)return;draft.amenities=amenities.filter(([key,label])=>key===t.dataset.amenity?(t.checked):amenHas(draft.amenities,key,label)).map(x=>x[0]);return}
      if(t.name==='coach_type'){draft.bus_type=t.value==='Pickup Van'?'Pickup Van':(draft.bus_type||'Regular');return}
      if(t.name==='a_c_type'){draft.bus_type=(t.value==='Non A/C'?'Non A/C':'A/C')+' '+(draft.bus_type.replace(/^((non\s*)?a\/c)\s*/i,'')||'Seater');return}
      if(t.name==='bus_category'){draft.bus_type=(/non a\/c/i.test(draft.bus_type)?'Non A/C':'A/C')+' '+t.value;return}
      if(t.name==='layout_type'){draft.pattern=t.value;return}
      if(t.name==='bus_manufacturer'){draft.manufacturer=t.value;return}
      if(t.name==='upper_deck'){draft.upperDeck=t.checked;G.toast('Upper-deck choice saved in editor. Use Generate Layout to apply it.','')}
    });
    draw();
  }
  G.screens.fleet=async function(el,p={}){
    const tab=p.tab||'vehicles';
    if(p.id||!['vehicles','coaches'].includes(tab))return nativeFleet(el,p);
    try{return tab==='vehicles'?await vehiclesPage(el):await coachesPage(el)}catch(err){G.err(err);el.innerHTML=`<div class="vp-empty">Unable to load ${E(tab)}. ${E(err.message)} <a href="#/fleet/${E(tab)}">Retry</a></div>`}
  };
})();
