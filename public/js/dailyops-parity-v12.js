/* SaveTrip reference parity — Daily Operations v12. Scoped UI, existing APIs; no fabricated OTA metrics. */
(() => {
  'use strict';
  if (!window.G || !G.screens) return;
  const E = s => esc(s ?? '');
  const N = v => Number.isFinite(Number(v)) ? Number(v) : 0;
  const F = s => s ? fdate(String(s).slice(0,10)) : '—';
  const fmt = s => s == null ? '—' : N(s).toLocaleString('en-IN');
  const niceDate = s => s ? `${s.slice(8,10)}-${s.slice(5,7)}-${s.slice(0,4)}` : '';
  const todayStr = () => today();
  const dayPlus = (s,n) => addDays(s,n);
  const fromTime = (s) => s && /^\d\d:\d\d/.test(s) ? s.slice(0,5) : '—';
  const iconPaths = {
    clipboard:'<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4.5h6M9 8h6M9 12h6M9 16h4"/>',
    star:'<path d="m12 2 3.05 6.18 6.82.99-4.94 4.81 1.17 6.8L12 17.57l-6.1 3.21 1.16-6.8-4.93-4.8 6.82-.99z"/>',
    refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.4 9A7 7 0 0 1 18 6l2 1M4 17l2 1a7 7 0 0 0 12.6-3"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
    close:'<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/>',
    chat:'<rect x="3" y="4" width="18" height="14" rx="3"/><path d="m7 18-1 3 5-3"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    send:'<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    phone:'<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.34 1.91.66 2.81a2 2 0 0 1-.45 2.11L8.05 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.32 1.85.54 2.81.66A2 2 0 0 1 22 16.92z"/>',
    bus:'<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 10h16M7 18v3M17 18v3M8 14h.01M16 14h.01"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    gauge:'<path d="M5 18a9 9 0 1 1 14 0"/><path d="m12 13 5-4"/><circle cx="12" cy="13" r="1"/>',
    check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    signal:'<path d="M3 21v-2M7 21v-5M11 21v-8M15 21v-11M19 21V6"/>',
    eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    rupee:'<path d="M6 3h12M6 8h12M6 3c8 0 8 10 0 10l8 8"/>',
    thumbs:'<path d="M17 14V2M9 18H6a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3h3l4-5v14l-4-4M17 8h4v7h-4"/>',
    settings:'<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06-2 2-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-1 1.48V21h-4v-.08A1.6 1.6 0 0 0 9.9 19.4a1.6 1.6 0 0 0-1.77.32l-.06.06-2-2 .06-.06a1.6 1.6 0 0 0 .32-1.77A1.6 1.6 0 0 0 5 15H4v-4h1a1.6 1.6 0 0 0 1.48-1 1.6 1.6 0 0 0-.32-1.77L6.1 8.2l2-2 .06.06A1.6 1.6 0 0 0 9.9 6.6 1.6 1.6 0 0 0 11 5.1V4h4v1.1A1.6 1.6 0 0 0 16 6.6a1.6 1.6 0 0 0 1.77-.32l.06-.06 2 2-.06.06A1.6 1.6 0 0 0 19.4 10 1.6 1.6 0 0 0 21 11h1v4h-1a1.6 1.6 0 0 0-1.6 0Z"/>',
    search:'<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
    chevron:'<path d="m8 10 4 4 4-4"/>',
    activity:'<path d="M3 12h4l3-7 4 14 3-7h4"/>',
    flag:'<path d="M5 22V4M5 4c6-4 8 4 15 0v12c-7 4-9-4-15 0"/>',
    warn:'<path d="m12 3 10 18H2Z"/><path d="M12 9v4M12 17h.01"/>',
    info:'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    arrow:'<path d="m9 18 6-6-6-6"/>',
    filter:'<path d="M4 7h16M7 12h10M10 17h4"/>'
  };
  const svg = (name,size=20) => `<svg class="ds-svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]||iconPaths.info}</svg>`;
  const btn = (action,label,cls='') => `<button type="button" class="ds-btn ${cls}" data-ds-action="${E(action)}">${label}</button>`;
  const card = (icon,value,label,color,extra='') => `<div class="ds-kpi ${color}"><span class="ds-kpi-icon">${svg(icon,22)}</span><div class="ds-kpi-text"><b>${value}</b><small>${E(label)}</small>${extra?`<em>${extra}</em>`:''}</div></div>`;
  const chip = (label,color='') => `<span class="ds-chip ${color}">${label}</span>`;
  const empty = (msg) => `<div class="ds-empty">${svg('info',25)} <span>${E(msg)}</span></div>`;
  const filterBy = (date, from, to) => Boolean(date && String(date).slice(0,10) >= from && String(date).slice(0,10) <= to);
  const readStore = (id) => { try { return JSON.parse(localStorage.getItem(`dailyops-v12:${id}`) || '{}'); } catch { return {}; } };
  const writeStore = (id, v) => localStorage.setItem(`dailyops-v12:${id}`, JSON.stringify(v));
  const access = perm => !window.can || can(perm);

  G.screens.dailyops = async (el) => {
    const state = {page:'report',view:'overview',ratingMode:'service',date:todayStr(),range:7,from:dayPlus(todayStr(),-6),to:todayStr(),service:'all',search:'',stars:0,follow:'All',opened:new Set(),busy:false,d:null,ratings:[],calls:null,chats:null,selectedService:null};
    const safeFetch = (url) => G.get(url).catch(() => null);
    const loadDaily = async () => {
      const [d,calls,chats,ratings,trips] = await Promise.all([safeFetch('/daily-ops?date='+encodeURIComponent(state.date)),safeFetch('/calls'),safeFetch('/chats'),safeFetch('/ratings'),safeFetch('/trips?date='+encodeURIComponent(state.date))]);
      state.d = d; state.calls = calls; state.chats = chats; state.ratings = Array.isArray(ratings?.rows) ? ratings.rows : [];
      // Enrich only with genuine existing Trip API data, when authorized.
      if (d && Array.isArray(d.fleet?.trips)) {
        const tripMap = new Map((trips?.trips||[]).map(t=>[String(t.id),t]));
        for (const row of d.fleet.trips) {
          const t = tripMap.get(String(row.schedule_id)); if (!t) continue;
          row.checkins = t.counts?.checked_in ?? null;
          row.chat_count = t.unread_chats ?? null;
          row.performance = t.delay_minutes != null && Number(t.delay_minutes)!==0 ? `${Number(t.delay_minutes)>0?'+':''}${t.delay_minutes} min` : null;
          row.call_count = calls?.calls?.filter(c=>String(c.schedule_id)===String(row.schedule_id)&&String(c.ts||'').slice(0,10)===state.date).length ?? null;
        }
        const detailCards=await Promise.all(d.fleet.trips.slice(0,12).map(r=>safeFetch('/trips/'+encodeURIComponent(r.schedule_id))));
        detailCards.forEach((detail,i)=>{
          const row=d.fleet.trips[i]; const pax=detail?.passengers;
          if (!Array.isArray(pax)) return;
          const active=pax.filter(p=>!['cancelled','released','hold'].includes(p.status));
          row.pnr_count=new Set(active.map(p=>p.pnr)).size;
          row.checkins=active.filter(p=>p.status==='checked_in').length;
        });
      }
    };
    const table = (heads,body,cls='') => `<div class="ds-scroll-table"><table class="ds-table ${cls}"><thead><tr>${heads.map(([title,ico])=>`<th>${ico?`<span class="ds-th-icon">${svg(ico,17)}</span>`:''}${E(title)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
    const nav = () => `<div class="ds-subnav">${[['report','Daily report','clipboard'],['ratings','Ratings','star']].map(([k,name,ico])=>`<button class="ds-subnav-btn ${state.page===k?'on':''}" data-ds-action="page:${k}"><span class="ds-subnav-icon">${svg(ico,22)}</span>${name}</button>`).join('')}</div>`;
    const report = () => {
      if (!state.d) return `<div class="ds-report"><div class="ds-report-head"><div class="ds-title"><span class="ds-title-icon">${svg('clipboard',26)}</span><div><h2>Daily Operations Report</h2><small>Per-service operational metrics</small></div></div><div class="ds-report-controls"><input type="date" aria-label="Report date" data-ds-change="date" value="${E(state.date)}">${btn('refresh',`${svg('refresh')} Refresh`,'primary')}</div></div>${empty('Daily operations data unavailable. Check your permissions or API connection.')}</div>`;
      const d=state.d; const fleet=d.fleet?.trips||[];const summary=d.fleet?.summary||{};
      const calls=(state.calls?.calls||[]).filter(x => String(x.ts||'').slice(0,10)===state.date);
      const ch=(state.chats?.conversations||[]).filter(x => String(x.last_ts||'').slice(0,10)===state.date);
      const missed=state.calls?calls.filter(x=>x.direction==='incoming').length:null;
      const outgoing=state.calls?calls.filter(x=>x.direction!=='incoming').length:null;
      const active=fleet.filter(x=>x.status==='active').length;
      const cancelled=fleet.filter(x=>x.status==='cancelled').length;
      const totalPNR=fleet.every(x=>x.pnr_count!=null)?fleet.reduce((a,x)=>a+N(x.pnr_count),0):null;
      const knownCheckins=fleet.every(x=>x.checkins!=null)?fleet.reduce((a,x)=>a+N(x.checkins),0):null;
      const knownChats=fleet.every(x=>x.chat_count!=null)?fleet.reduce((a,x)=>a+N(x.chat_count),0):null;
      const kpis = [
        card('calendar',`${fmt(active)} / ${fmt(fleet.length)}`,'SCHEDULES / OPERATED','green'),
        card('close',fmt(cancelled),'CANCELLED','red'),
        card('users',`${fmt(summary.seats)} / ${fmt(totalPNR)}`,'PASSENGERS / PNR','blue'),
        card('send','— / —','TRACKING','indigo'),
        card('bell','— / —','LIVE ALERTS','purple'),
        card('check',`${knownCheckins==null?'—':fmt(knownCheckins)} / —`,'CHECK-INS','green'),
        card('chat',knownChats==null?(state.chats?fmt(ch.length):'—'):fmt(knownChats),'CHATS','orange'),
        card('phone',state.calls?`${fmt(missed)}  ${fmt(outgoing)}`:'— / —','CALLS (IN / OUT)','purple')
      ];
      const heads=[['SERVICE','bus'],['DEPARTURE','clock'],['VEHICLE','bus'],['PERFORMANCE','gauge'],['OPERATED','check'],['STAFF','users'],['PASSENGERS','users'],['TRACKING','send'],['LIVE ALERTS','bell'],['CHECK-INS','check'],['CHATS','chat'],['CALLS','phone'],['PICKUP','pin'],['DROP','flag']];
      const rows=fleet.map((r,i)=>{
        const crew=(r.crew||[]).map(x=>`<div class="ds-crew"><span>${E(x.role||'Crew')}:</span> ${E(x.name||'Unassigned')}</div>`).join('') || '<span class="ds-muted">—</span>';
        const label=E(r.service||r.name||'Service');
        return `<tr><td><button class="ds-service" data-ds-action="service:${E(r.schedule_id)}">${svg('bus',16)} ${label}</button><small class="ds-cell-note">${E(r.route||r.name||'')}</small></td><td class="ds-departure">${E(fromTime(r.departure_time))}</td><td class="ds-vehicle">${E(r.vehicle||'—')}</td><td class="ds-muted">${r.performance==null?'—':E(r.performance)}</td><td>${r.status==='active'?chip(`${svg('check',15)} Yes`,'ok'):chip(E(r.status||'Unknown'),r.status==='cancelled'?'bad':'warn')}</td><td class="ds-staff-cell">${crew}</td><td class="ds-num"><button class="ds-number-link" data-ds-action="service:${E(r.schedule_id)}">${fmt(r.seats)}</button><small class="ds-cell-note">${r.pnr_count==null?'PNR not linked':`${fmt(r.pnr_count)} PNR`}</small></td><td class="ds-num">${r.tracking_count==null?'<span class="ds-muted">—</span>':fmt(r.tracking_count)}<small class="ds-cell-note">${r.tracking_viewers==null?'':'viewers '+fmt(r.tracking_viewers)}</small></td><td class="ds-num muted-count">${r.live_alerts==null?'—':fmt(r.live_alerts)}</td><td class="ds-num">${r.checkins==null?'—':fmt(r.checkins)}</td><td class="ds-num">${r.chat_count==null?'—':fmt(r.chat_count)}</td><td class="ds-num">${r.call_count==null?'—':fmt(r.call_count)}</td><td class="ds-muted">${E(r.pickup_performance||'—')}</td><td class="ds-muted">${E(r.drop_performance||'—')}</td></tr>`;
      }).join('');
      return `<div class="ds-report"><div class="ds-report-head"><div class="ds-title"><span class="ds-title-icon">${svg('clipboard',26)}</span><div><h2>Daily Operations Report</h2><small>Per-service operational metrics</small></div></div><div class="ds-report-controls"><label class="ds-date-field">${svg('calendar',20)}<input type="date" aria-label="Report date" data-ds-change="date" value="${E(state.date)}"></label>${btn('refresh',`${svg('refresh',20)} Refresh`,'primary')}</div></div><div class="ds-kpi-grid">${kpis.join('')}</div><div class="ds-table-container">${table(heads, rows||`<tr><td colspan="14">${empty('No scheduled services for this date.')}</td></tr>`,'ds-report-table')}</div><p class="ds-data-note">${svg('info',16)} Report figures are loaded from the connected GDS. Tracking viewers, live alerts and pickup/drop performance appear as — until their sources are connected; check-ins and PNRs use the Trip API when authorized.</p></div>`;
    };
    const filteredRatings = (useDate=true) => state.ratings.filter(x =>
      (!useDate || filterBy(x.travel_at||x.rated_at,state.from,state.to)) &&
      (state.service==='all'||String(x.schedule_id||x.service||'')===state.service) &&
      (!state.search||`${x.passenger_name} ${x.pnr} ${x.phone} ${x.review} ${x.ota}`.toLowerCase().includes(state.search.toLowerCase())) &&
      (!state.stars||N(x.rating)===state.stars)
    );
    const average = a => a.length ? (a.reduce((n,x)=>n+N(x.rating),0)/a.length).toFixed(2) : '—';
    const counts = a => [1,2,3,4,5].map(i=>a.filter(x=>N(x.rating)===i).length);
    const ratingsHeader = () => {
      const all=state.ratings;const filtered=filteredRatings();const low14=all.filter(x => N(x.rating)<=2 && String(x.rated_at||'').slice(0,10)>=dayPlus(todayStr(),-13));
      const stats=[card('star',average(all),'OTA RATINGS AVAILABLE','green','From connected GDS records'),card('users','—','RATED THIS WEEK','blue','Requires total OTA passengers'),card('thumbs',fmt(low14.length),'1–2★ IN 14 DAYS','red','Review and follow up'),card('chat',average(filtered),'AVERAGE IN THESE DATES','purple',`${fmt(filtered.length)} ratings`)].join('');
      const services=[...new Map(all.filter(x=>x.schedule_id||x.service).map(x=>[String(x.schedule_id||x.service),String(x.service||x.service_number||x.schedule_id)])).entries()];
      return `<div class="ds-ratings-head"><div class="ds-title"><span class="ds-title-icon">${svg('star',27)}</span><div><h2>OTA Ratings</h2><small>Ratings from connected GDS records · RedBus search ranking not connected</small></div></div><div class="ds-head-actions">${btn('settings',`${svg('settings',19)} Settings`,'primary')}${btn('refresh',`${svg('refresh',19)} Refresh`,'primary')}</div></div><div class="ds-filter-panel"><label><small>Service</small><select data-ds-change="service"><option value="all">All services</option>${services.map(([id,label])=>`<option value="${E(id)}" ${state.service===id?'selected':''}>${E(label)}</option>`).join('')}</select></label><label><small>${state.view==='rank'?'Rank from':'From'}</small><input type="date" data-ds-change="from" value="${E(state.from)}"></label><label><small>${state.view==='rank'?'Rank to':'To'}</small><input type="date" data-ds-change="to" value="${E(state.to)}"></label><div class="ds-range-buttons">${[7,30,90,180].map(days=>btn('range:'+days,`${days} days`,state.range===days?'on':'' )).join('')}</div></div><div class="ds-rating-tabs">${[['overview','Overview'],['rank','Search rank'],['action',`Needs action <i class="ds-red-dot">${fmt(low14.length)}</i>`],['all','All ratings'],['unrated','Not rated']].map(([k,n])=>btn('tab:'+k,n,state.view===k?'on':'')).join('')}</div><div class="ds-rating-kpis">${stats}</div>`;
    };
    const groupForRatings = (mode,items) => {
      const map=new Map();for(const x of items){const key= mode==='bus' ? String(x.vehicle_registration||x.vehicle||'Vehicle unlinked') : mode==='driver' ? String(x.driver_name||'Driver unlinked') : String(x.service||x.service_number||x.schedule_id||'Service unlinked');if(!map.has(key))map.set(key,[]);map.get(key).push(x)}return [...map.entries()];
    };
    const ratingsOverview = () => {
      const data=filteredRatings();const grouped=groupForRatings(state.ratingMode,data);
      const modeHead=state.ratingMode==='service'?'Service / bus':'Bus / service';
      const byDriver=groupForRatings('driver',data.filter(x=>x.driver_name)).map(([key,arr])=>{
        const cnt=counts(arr);return `<tr><td>${E(key)}</td><td>${fmt(arr.length)}</td><td>${average(arr)}</td>${cnt.map(n=>`<td class="ds-num ds-muted">${fmt(n)}</td>`).join('')}</tr>`;
      });
      const rowHtml=grouped.map(([key,arr],i)=>{
        const dist=counts(arr);return `<tr class="ds-clickable-row" data-ds-action="expand:${E(key)}"><td><span class="ds-row-chevron">${svg('arrow',15)}</span><b>${E(key)}</b><small class="ds-cell-note">${E(arr[0]?.ota||'OTA')}</small></td><td>${E(arr[0]?.ota||'—')}</td><td class="ds-num">—</td><td class="ds-num">—</td><td class="ds-num">—</td><td class="ds-muted">—</td><td class="ds-num">${fmt(arr.length)}</td><td class="ds-num">${average(arr)}</td>${dist.map(n=>`<td class="ds-num ds-muted">${fmt(n)}</td>`).join('')}</tr>${state.opened.has(key)?`<tr><td colspan="13" class="ds-nested-cell"><div class="ds-nested-title">Ratings for ${E(key)}</div>${arr.map(x=>`<div>${E(x.passenger_name||'Passenger')} · ${E(x.pnr||'')} · ${'★'.repeat(Math.min(5,N(x.rating)))} <span class="ds-muted">${F(x.rated_at)}</span></div>`).join('')}</td></tr>`:''}`;
      }).join('');
      return `<section class="ds-section"><header><h3>Service Ratings</h3><p>OTA all-time score next to ratings for the chosen dates. Click a service to expand its linked review records.</p></header><div class="ds-mode-row">${btn('mode:service','By service',state.ratingMode==='service'?'on':'')}${btn('mode:bus','By bus',state.ratingMode==='bus'?'on':'')}<small>Click a row to see what is under it.</small></div>${table([[modeHead],['Source'],['RedBus score · all trips'],['Ratings · all time'],['7 days'],['5★ ratings needed'],['Ratings'],['Average'],['1★'],['2★'],['3★'],['4★'],['5★']],rowHtml||'<tr><td colspan="13">No linked reviews in this range.</td></tr>','ds-rating-table')}<p class="ds-section-note">RedBus all-time scores and ranking changes require an authorized provider feed. The star counts and date-range averages above are from existing GDS review records; all-time provider values are not inferred.</p></section><section class="ds-section"><header><h3>Ratings by driver</h3></header>${table([['Driver'],['Ratings'],['Average'],['1★'],['2★'],['3★'],['4★'],['5★']],byDriver.join('')||`<tr><td colspan="8">${empty('The current ratings API does not link each rating to a driver. Connect an authorized trip-to-crew history feed to enable this table.')}</td></tr>`,'ds-rating-table')}</section>`;
    };
    const ratingsRanks = () => {
      const groups=groupForRatings('service',filteredRatings(false));const dts=Array.from({length:Math.min(14,Math.max(1,Math.round((new Date(state.to+'T00:00:00')-new Date(state.from+'T00:00:00'))/86400000)+1))},(_,i)=>dayPlus(state.to,-i));
      return `<section class="ds-section"><header><h3>Search Rankings</h3><p>Where each service appears in RedBus search results. 1 is the top of the list, so a smaller number is better. Provider ranking data is not connected.</p></header>${table([['Service'],['Source'],['Rank now'],['Typical rank'],['Best'],['Worst'],['RedBus seats / trip']], groups.map(([key,rows])=>`<tr><td><b>${E(key)}</b><small class="ds-cell-note">${E(rows[0].ota||'—')}</small></td><td>${E(rows[0].ota||'—')}</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>`).join('')||'<tr><td colspan="7">No service data returned.</td></tr>','ds-rating-table')}<h3 class="ds-day-title">Day by day</h3>${table([['Travel date'],...groups.map(([key])=>[key])],`<tr><td><strong>Typical</strong></td>${groups.map(()=>'<td class="ds-muted">—</td>').join('')}</tr>${dts.map(date=>`<tr><td>${F(date)} ${date>=todayStr()?chip('upcoming','lightblue'):''}</td>${groups.map(()=>'<td class="ds-muted">—</td>').join('')}</tr>`).join('')}`,'ds-rating-table')}<p class="ds-section-note">No RedBus ranking values are fabricated. Add a permitted ranking feed to populate rank, best/worst, seat counts and daily history.</p></section>`;
    };
    const ratingRow = x => {
      const saved=readStore(x.id);const stars=N(x.rating);const pill=stars<=2?'bad':stars>=4?'ok':'warn';
      const follow=E(saved.status||'Open');
      return `<article class="ds-review" data-ds-review="${E(x.id)}"><div class="ds-review-top"><div><span class="ds-review-star ${pill}">★ ${stars}</span> <b>${E(x.service||x.service_number||'Trip')} · ${E(x.ota||'OTA')}</b>${x.challenge_status?` ${chip(E(x.challenge_status),'lightblue')}`:''}<small>${F(x.rated_at)} · ${E(x.travel_at||'')} · ${E(x.pnr||'No PNR')}</small></div><div class="ds-review-person"><b>${E(x.passenger_name||'Passenger')}</b><small>${E(x.phone||'')}</small></div></div>${x.review?`<p class="ds-review-text">“${E(x.review)}”</p>`:''}${x.operator_reply?`<p class="ds-operator-reply">Your reply: ${E(x.operator_reply)}</p>`:''}<div class="ds-review-meta">${E(x.vehicle_registration||'')} ${E(x.driver_name||'')}</div>${state.view==='action'?`<div class="ds-review-controls"><select aria-label="Follow-up status" data-ds-follow="${E(x.id)}">${['Open','Called','Working','Resolved'].map(s=>`<option ${follow===s?'selected':''}>${s}</option>`).join('')}</select><textarea rows="1" data-ds-comment="${E(x.id)}" placeholder="What did the passenger say?">${E(saved.note||'')}</textarea>${btn('comment:'+x.id,`${svg('chat',16)} Add comment`,'comment')}</div>`:''}${!x.operator_reply&&access('dailyops.ratings_reply')?`<div class="ds-reply-action">${btn('reply:'+x.id,'Save operator reply in GDS','link')}</div>`:''}</article>`;
    };
    const ratingsList = () => {
      const low=state.view==='action';const data=(low?state.ratings.filter(x=>N(x.rating)<=2&&String(x.rated_at||'').slice(0,10)>=dayPlus(todayStr(),-13)):filteredRatings()).filter(x=>
        (state.service==='all'||String(x.schedule_id||x.service||'')===state.service)&&
        (!state.search||`${x.passenger_name} ${x.pnr} ${x.phone} ${x.review} ${x.ota}`.toLowerCase().includes(state.search.toLowerCase()))&&
        (!state.stars||N(x.rating)===state.stars)&&(!low||state.follow==='All'||(readStore(x.id).status||'Open')===state.follow));
      return `<section class="ds-section ds-review-list"><header class="ds-reviews-head"><div><h3>${low?'1–2★ ratings last 14 days':'All ratings'}</h3><p>${low?'Always the last 14 days, whatever dates are picked':`${F(state.from)} – ${F(state.to)}`}</p></div><label class="ds-search">${svg('search')}<input data-ds-input="search" value="${E(state.search)}" placeholder="PNR, name, phone, review"></label></header>${low?'<div class="ds-helptext">Call the passenger, then reply on the OTA portal — or challenge the rating there if it is unfair.</div>':''}<div class="ds-review-filter">${low?`<span>Follow-up</span>${['All','Open','Called','Working','Resolved'].map(s=>btn('follow:'+s,s,state.follow===s?'on':'')).join('')}`:[5,4,3,2,1].map(s=>btn('stars:'+s,`${s} ★`,state.stars===s?'on':'')).join('')}${state.stars?btn('stars:0','Clear','muted'):''}</div>${data.map(ratingRow).join('')||empty('No ratings match the selected filters.')}</section>`;
    };
    const unrated=()=>`<section class="ds-section"><header><h3>Not rated</h3><p>Passengers with no OTA rating during the selected dates.</p></header>${empty('The GDS review API only returns submitted ratings. To list non-respondents accurately, connect OTA invitation records with complete bookings and consent status.')}</section>`;
    const ratings = () => `<div class="ds-ratings">${ratingsHeader()}${state.view==='overview'?ratingsOverview():state.view==='rank'?ratingsRanks():state.view==='unrated'?unrated():ratingsList()}</div>`;
    const render = () => {el.innerHTML=`<div class="ds-root">${nav()}${state.page==='report'?report():ratings()}<span class="ds-live-note" role="status" aria-live="polite"></span></div>`;};
    const status = msg => {const n=el.querySelector('.ds-live-note');if(n)n.textContent=msg;};
    const refresh=async()=>{if(state.busy)return;state.busy=true;status('Refreshing…');try{await loadDaily();render()}finally{state.busy=false;}};
    const reply=async id=>{
      const x=state.ratings.find(x=>String(x.id)===String(id));if(!x)return;
      if(!access('dailyops.ratings_reply'))return G.toast('You do not have permission to save replies','bad');
      const data=await G.prompt('Save GDS operator reply',[{name:'reply',label:'Reply text',type:'textarea',full:1,required:true,value:x.operator_reply||''}],{ok:'Save reply'});
      if(data){await G.post(`/ratings/${encodeURIComponent(id)}/reply`,data);G.toast('Reply saved in GDS (not sent to OTA)','ok');await refresh()}
    };
    const detail=async sid=>{
      const r=state.d?.fleet?.trips?.find(x=>String(x.schedule_id)===String(sid));if(!r)return;
      const crew=(r.crew||[]).map(x=>`${E(x.role)}: ${E(x.name||'Unassigned')}`).join('<div>')||'—';
      const m=G.modal({title:`${E(r.service)} · ${E(state.date)}`,size:'lg',body:`<div class="ds-detail"><p><b>Route:</b> ${E(r.route||r.name||'—')}</p><p><b>Departure:</b> ${E(r.departure_time)} · <b>Vehicle:</b> ${E(r.vehicle||'—')}</p><p><b>Staff:</b><div>${crew}</div></p><p><b>Passengers:</b> ${fmt(r.seats)} · <b>Capacity:</b> ${fmt(r.capacity)} · <b>Occupancy:</b> ${r.occupancy_pct==null?'—':`${N(r.occupancy_pct).toFixed(1)}%`}</p><p><b>Net sales:</b> ${inr(r.net_sales)}</p><p class="ds-muted">This detail is from the existing Daily Ops API.</p><button class="ds-btn primary" data-ds-trip>Open trip workspace</button></div>`});
      m.$('[data-ds-trip]').onclick=()=>{m.close();location.hash=`#/trips?date=${encodeURIComponent(state.date)}&sid=${encodeURIComponent(sid)}`;};
    };
    const settings=()=>G.modal({title:'OTA Ratings · Settings',body:`<div class="ds-settings"><h3>Ratings and ranking sources</h3><p><b>GDS rating records:</b> Connected via <code>/api/ratings</code></p><p><b>RedBus ranking:</b> Not connected</p><p><b>Ratings by vehicle/driver:</b> Requires trip-to-crew history</p><p><b>OTA responses/challenges:</b> Not synchronized</p><p>Only supported fields are displayed as real data. Fields without a source are marked —.</p></div>`});
    G.on(el,'click','[data-ds-action]',async b=>{
      const [a,...rest]=b.dataset.dsAction.split(':');const val=rest.join(':');
      if(a==='page'){state.page=val;state.search='';state.stars=0;render();return}
      if(a==='tab'){state.view=val;state.search='';state.stars=0;render();return}
      if(a==='refresh'){await refresh();return}
      if(a==='range'){state.range=Number(val);state.to=todayStr();state.from=dayPlus(state.to,1-state.range);render();return}
      if(a==='mode'){state.ratingMode=val;render();return}
      if(a==='expand'){state.opened.has(val)?state.opened.delete(val):state.opened.add(val);render();return}
      if(a==='service'){await detail(val);return}
      if(a==='settings'){settings();return}
      if(a==='stars'){state.stars=Number(val);render();return}
      if(a==='follow'){state.follow=val;render();return}
      if(a==='comment'){
        const row=b.closest('[data-ds-review]');const id=val;const old=readStore(id);writeStore(id,{...old,status:row.querySelector('[data-ds-follow]')?.value||old.status||'Open',note:row.querySelector('[data-ds-comment]')?.value||''});G.toast('Follow-up note saved in this browser (not synced)','ok');return;
      }
      if(a==='reply'){await reply(val);return}
    });
    G.on(el,'change','[data-ds-change]',async b=>{const prop=b.dataset.dsChange;state[prop]=b.value;if(['from','to'].includes(prop))state.range=0;if(prop==='date'){await refresh();return}render();});
    G.on(el,'change','[data-ds-follow]',b=>{const id=b.dataset.dsFollow;writeStore(id,{...readStore(id),status:b.value});});
    G.on(el,'input','[data-ds-input]',b=>{state.search=b.value;const focused=document.activeElement;const cursor=b.selectionStart;render();const newInput=el.querySelector('[data-ds-input]');if(newInput){newInput.focus();try{newInput.setSelectionRange(cursor,cursor)}catch{}}});
    await loadDaily();render();
  };
  window.__DAILYOPS_V12_BUILD__='dailyops-v12-20261121';
})();
