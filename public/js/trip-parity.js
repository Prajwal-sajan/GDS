/* JourneyOS / SaveTrip Trip Workspace parity. Loaded after trips.js, overrides only G.screens.trips. */
(function () {
  const safe = (s) => esc(s == null ? '' : s);
  const link = (lat, lng) => Number.isFinite(+lat) && Number.isFinite(+lng) ? `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lng)}#map=15/${encodeURIComponent(lat)}/${encodeURIComponent(lng)}` : '';
  const names = { pickup: 'Pickup', drop: 'Drop', timings: 'Timings', docs: 'Docs' };
  const fmt = (v) => v == null || v === '' ? '—' : safe(v);
  const isLive = (p) => p.status !== 'cancelled' && p.status !== 'hold';
  const htime = (iso) => iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';
  const minutes = (iso, expected, date, day = 1) => {
    if (!iso || !expected || !date) return null;
    const scheduled = new Date(`${date}T${expected}:00`);
    scheduled.setDate(scheduled.getDate() + Number(day || 1) - 1);
    return Math.round((new Date(iso).getTime() - scheduled.getTime()) / 60000);
  };
  function displayLag(lag) { return lag == null ? '<span class="tp-muted">Awaiting arrival</span>' : `<span class="tp-lag ${lag > 5 ? 'late' : lag < -5 ? 'early' : 'ontime'}">${lag > 5 ? 'Delay' : lag < -5 ? 'Early' : 'On-time'} (${lag > 0 ? '+' : ''}${lag} min)</span>`; }
  function messageDate(ts) { if (!ts) return '—'; const d = new Date(ts); return Number.isNaN(d.getTime()) ? safe(ts) : d.toLocaleString('en-IN'); }
  const phone = (p) => safe(String(p || '').replace(/^(\d{2})\d+(\d{3})$/, '$1xxxxx$2'));
  const noData = (s) => `<div class="tp-empty">${safe(s)}</div>`;
  G.screens.trips = async function (el, params) {
    const query = G.query();
    const tab = params[0] || 'current';
    const state = { tab, date: query.date || (tab === 'future' ? addDays(today(), 1) : tab === 'past' ? addDays(today(), -1) : today()), sid: query.sid || '', section: ['pickup','drop','timings','docs'].includes(query.section) ? query.section : 'pickup', t: null, list: [], filter: 'all', expanded: new Set(), busy: false, chats: {}, ratings: {} };
    el.classList.add('trip-workspace');
    el.innerHTML = `<div class="tp-top"><div class="tp-switch">${G.tabs([['current','Current'],['future','Future'],['past','Past']],tab,k=>`#/trips/${k}`)}</div><div class="tp-fields"><label>DATE<input type="date" data-tp-date value="${safe(state.date)}"></label><label>SERVICE<select data-tp-service><option value="">Choose service</option></select></label><button class="tp-primary" data-tp-reload>Submit →</button></div></div><div data-tp-main></div>`;
    const main = $('[data-tp-main]', el);
    const service = $('[data-tp-service]', el);
    const loadList = async () => {
      const data = await G.get(`/trips?${G.qs({ tab: state.tab, date: state.date })}`);
      state.list = data.trips || [];
      if (!state.list.some(t => String(t.id) === String(state.sid))) state.sid = state.list[0]?.id || '';
      service.innerHTML = state.list.map(t=>`<option value="${safe(t.id)}" ${String(t.id) === String(state.sid) ? 'selected' : ''}>${safe(t.service_number)} · ${safe(t.service_name)} · ${safe(t.vehicle?.registration_number || 'Bus unassigned')}</option>`).join('') || '<option value="">No trips for this date</option>';
      await loadTrip();
    };
    const loadTrip = async () => { if (!state.sid) { main.innerHTML=noData('No service scheduled for this date.'); return; } state.t = await G.get(`/trips/${state.sid}`); render(); };
    function crew(t) {
      return `<div class="tp-crew"><span>🚌 Bus: <b>${fmt(t.vehicle?.registration_number)}</b></span>${(t.crew || []).map((c, i)=>`<span>🧑 ${safe(c.role || `Crew ${i+1}`)}: <b>${safe(c.name || 'Unassigned')}</b>${c.phone ? ` · ${phone(c.phone)}` : ''}</span>`).join('')}<span>🧭 ${t.position ? `Bus GPS · ${safe(t.position.state || 'Unknown')} · ${fmt(t.position.speed)} km/h` : 'Bus GPS unavailable'}</span></div>`;
    }
    const active = t => (t.passengers || []).filter(isLive);
    const grouped = (t, kind) => {
      const groups = new Map();
      for (const p of active(t)) {
        const stop = kind === 'pickup' ? p.boarding : p.dropping;
        const key = stop?.id ?? `${stop?.time || '99:99'}|${stop?.name || 'Unassigned'}`;
        if (!groups.has(key)) groups.set(key, { stop, list: [] });
        groups.get(key).list.push(p);
      }
      return [...groups.values()].sort((a,b)=>String(a.stop?.time || '99:99').localeCompare(String(b.stop?.time || '99:99')));
    };
    function summary(t) {
      if (state.section === 'pickup' || state.section === 'drop') {
        const ps = active(t); const boarded = ps.filter(p=>['boarded','dropped'].includes(p.status)).length;
        const dropped = ps.filter(p=>p.status === 'dropped').length;
        return `<div class="tp-summary"><b>⌖ ${state.section === 'pickup' ? 'SUMMARY' : 'DROP SUMMARY'}</b><div>${ps.length} pax <span class="tp-dot">·</span> ${state.section === 'pickup' ? `${ps.filter(p=>p.call_status === 'called').length} Called <span class="tp-dot">·</span> <strong>${boarded} Boarded</strong>` : `${ps.length - dropped} Yet to drop <span class="tp-dot">·</span> <strong>${dropped} Dropped</strong>`}</div></div>`;
      }
      const stops = t.stops || [];
      const tele = t.telemetry || {};
      const bits = [`Total ${stops.length}`,`Pickups ${stops.filter(s=>s.type==='pickup').length}`,`Drops ${stops.filter(s=>s.type==='drop').length}`,`Breaks ${stops.filter(s=>s.type==='break').length}`, `Travelled ${t.km == null ? '—' : t.km+' km'}`,`Fuel ${t.fuel_l == null ? '—' : t.fuel_l+' L'}`,`Mileage ${t.km && t.fuel_l > 0 ? (t.km/t.fuel_l).toFixed(2)+' kmpl' : '—'}`];
      for (const [k, label] of [['driving_score','Driving score'],['hard_brakes','Hard brakes'],['overspeed','Overspeed'],['idling_minutes','Idling minutes']]) if (tele[k] != null) bits.push(`${label} ${safe(tele[k])}`);
      return `<div class="tp-summary"><b>◷ TRIP SUMMARY</b><div class="tp-metrics">${bits.map(b=>`<span>${safe(b)}</span>`).join('')}</div></div>`;
    }
    function passengerRow(p, kind) {
      const location = p.passenger_location;
      const mapLink = location?.lat != null && location?.lng != null ? link(location.lat, location.lng) : '';
      const loc = location ? `<span>Location: ${location.distance_km == null ? 'Shared' : safe(location.distance_km)+' km'} </span>${mapLink ? `<a href="${mapLink}" target="_blank" rel="noopener noreferrer">Map link</a>` : ''}<small>Updated ${messageDate(location.updated_at)}</small>` : '<span class="tp-muted">No location shared</span>';
      const pnr = encodeURIComponent(p.pnr); const seat = encodeURIComponent(p.seat);
      return `<tr><td><b>${safe(p.name)}</b>${p.status === 'checked_in' ? '<span class="tp-check">Check-in: Yes</span>' : ''}</td><td>${phone(p.phone)}</td><td><b>Seats: ${safe(p.seat)}</b><small>Via: <em>${safe(p.source || '—')}</em> · <a href="#" data-tp-pnr="${safe(p.pnr)}">PNR ${safe(p.pnr)}</a></small></td><td><a href="#" data-tp-customer="${pnr}|${seat}" title="Customer profile">${safe(p.trips ?? '—')}T</a></td><td>${kind==='pickup' ? loc : `${safe(p.dropping?.name || '—')}<small>Location sharing: ${location ? 'Available' : 'Not shared'}</small>`}</td><td>${statusBadge(p.status)}${can('trips.update_passengers') ? `<select aria-label="Call status" data-tp-callstatus="${pnr}|${seat}">${[['','Feedback'],['to_call','To call'],['called','Called'],['not_reachable','Not reachable']].map(([v,l])=>`<option value="${v}" ${String(p.call_status || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="tp-small-primary" data-tp-savecall="${pnr}|${seat}">Update</button>` : ''}</td><td><div class="tp-actions">${can('calls.make') ? `<button class="tp-call" data-tp-call="${pnr}|${seat}" title="Log call">☎ ${phone(p.phone)}</button>` : ''}${can('chats.view') ? `<button class="tp-chat" data-tp-history="${pnr}|${seat}" title="Communication history">▣${p.unread ? `<i>${p.unread}</i>` : ''}</button>` : ''}${can('trips.update_passengers') ? `<select data-tp-setstatus="${pnr}|${seat}" aria-label="Passenger action"><option value="">Change status…</option>${['checked_in','boarded','dropped','no_show'].map(v=>`<option value="${v}">${safe(v.replace('_',' '))}</option>`).join('')}</select>` : ''}</div></td></tr>`;
    }
    function boarding(t, kind) {
      const groups = grouped(t,kind); if (!groups.length) return noData('No passengers found for this view.');
      return groups.map((g,i)=>{
        const id = String(g.stop?.id ?? i);
        const countPnr = new Set(g.list.map(p=>p.pnr)).size;
        const open = !state.expanded.has(`closed:${id}`);
        return `<section class="tp-stop"><button class="tp-stop-heading" data-tp-toggle="${safe(id)}" aria-expanded="${open}"><span class="tp-time">◷ ${t12(g.stop?.time)}</span><strong>${safe(g.stop?.name || 'Unassigned')}</strong><span class="tp-chip">PNRs ${countPnr}</span><span class="tp-chip">Passengers ${g.list.length}</span>${g.stop?.pickup_type ? `<span class="tp-chip lavender">${safe(g.stop.pickup_type)}</span>` : ''}<span class="tp-chevron">${open ? '⌃' : '⌄'}</span></button>${g.stop?.exchange_point ? `<p class="tp-exchange">⇄ Bus pickup: ${safe(g.stop.exchange_point)} · ${t12(g.stop.exchange_time)}</p>` : ''}${open ? `<div class="tp-table-scroll"><table class="tp-table"><thead><tr>${['Passengers','Phone','Seats / PNR','RTG','Passenger location / Drop','Status','Actions'].map(s=>`<th>${s}</th>`).join('')}</tr></thead><tbody>${g.list.map(p=>passengerRow(p,kind)).join('')}</tbody></table></div>` : ''}</section>`;
      }).join('');
    }
    function timings(t) {
      return `<div class="tp-table-scroll tp-stops"><table class="tp-table"><thead><tr><th>Type</th><th>Name</th><th>Link</th><th>Status</th><th>Scheduled</th><th>Arrival</th><th>Departure</th>${can('trips.update_passengers') ? '<th>Actions</th>' : ''}</tr></thead><tbody>${(t.stops || []).map(s=>{const lag=minutes(s.event?.atime,s.time,t.travel_date,s.day);const url=link(s.lat ?? s.latitude,s.lng ?? s.longitude);return `<tr><td><span class="tp-type ${safe(s.type)}">${safe(s.type)}</span></td><td><strong>${safe(s.name)}</strong></td><td>${url?`<a href="${url}" target="_blank" rel="noopener noreferrer">⌖ View map</a>`:'<span class="tp-muted">No coordinates</span>'}</td><td>${displayLag(lag)}</td><td>${t12(s.time)} <small>Day ${fmt(s.day)}</small></td><td>${htime(s.event?.atime)}</td><td>${htime(s.event?.dtime)}</td>${can('trips.update_passengers') ? `<td><button class="tp-action" data-tp-event="arrived" data-tp-stage="${safe(s.id)}">Arrived</button><button class="tp-action" data-tp-event="departed" data-tp-stage="${safe(s.id)}">Departed</button></td>` : ''}</tr>`}).join('')}</tbody></table></div>`;
    }
    function docs(t) {
      return `<div class="tp-docs"><div class="tp-doc-panel"><h3>Vehicle</h3><p><strong>${fmt(t.vehicle?.registration_number)}</strong></p><p>Vehicle phone: ${phone(t.vehicle?.phone)}</p>${t.position ? `<p>GPS: ${fmt(t.position.state)} · ${fmt(t.position.speed)} km/h ${link(t.position.lat,t.position.lng) ? `<a href="${link(t.position.lat,t.position.lng)}" target="_blank" rel="noopener noreferrer">Map</a>` : ''}</p>` : '<p class="tp-muted">No current GPS data</p>'}<h3>Documents</h3>${(t.documents || []).map(d=>`<p>${safe(d.document_name)} · ${d.expiry_date ? fdate(d.expiry_date) : 'On file'}</p>`).join('') || '<p class="tp-muted">No vehicle documents on file</p>'}</div><div class="tp-doc-panel"><h3>Driver & helpers</h3>${(t.crew || []).map(c=>`<p><strong>${safe(c.name || 'Unassigned')}</strong> · ${safe(c.role || 'Crew')} · ${phone(c.phone)}</p>`).join('') || '<p class="tp-muted">No crew assigned</p>'}<h3>Trip controls</h3><div class="tp-controls">${can('trips.update_passengers') ? '<button data-tp-delay>Report delay</button>' : ''}${can('trips.chat') ? '<button data-tp-notify>Notify passengers</button>' : ''}<button data-tp-print>Print tripsheet</button></div></div></div>`;
    }
    function render() {
      const t=state.t; const tabs=Object.entries(names).map(([k,n])=>`<button data-tp-section="${k}" class="${state.section===k?'active':''}">${k==='pickup'?'⌖':k==='drop'?'➤':k==='timings'?'◷':'▤'} ${n}</button>`).join('');
      main.innerHTML=`${crew(t)}<div class="tp-section-tabs">${tabs}</div>${summary(t)}<div data-tp-content>${state.section==='pickup'||state.section==='drop' ? boarding(t,state.section) : state.section==='timings'?timings(t):docs(t)}</div>`;
    }
    function passenger(key) { const [pnr,seat]=key.split('|').map(decodeURIComponent); return state.t.passengers.find(p=>String(p.pnr)===pnr && String(p.seat)===seat); }
    async function statusUpdate(key,status) { if (!status) return; const p=passenger(key); if (!p) return; const body={status}; if (status==='no_show') {const otp=await G.stepUp('no_show');if(!otp)return;body.otp=otp;} if(status==='boarded'){const v=await G.prompt('Board passenger',[{name:'boarding_otp',label:'Boarding OTP (optional; last four digits of ticket)'}]);if(!v)return;if(v.boarding_otp)body.boarding_otp=v.boarding_otp;} await G.patch(`/trips/${state.sid}/passengers/${encodeURIComponent(p.pnr)}/${encodeURIComponent(p.seat)}`,body);G.toast('Passenger status updated','ok');await loadTrip(); }
    async function history(key) {
      const p=passenger(key); if(!p)return;
      const results=await Promise.allSettled([G.get(`/chats/${encodeURIComponent(p.conversation_id)}`),G.get(`/calls?${G.qs({q:p.pnr})}`)]);
      const messages=results[0].status==='fulfilled' ? results[0].value.messages || [] : [];
      const calls=results[1].status==='fulfilled' ? (results[1].value.calls||[]).filter(c=>String(c.pnr)===String(p.pnr)) : [];
      const rows=[...messages.map(m=>({type:m.channel||'WhatsApp',direction:m.direction||'out',ts:m.ts,label:m.template||'Message',status:m.delivery_status|| (m.read?'Read':'Recorded'),info:m.text||''})),...calls.map(c=>({type:'Call',direction:c.direction||'out',ts:c.ts,label:c.kind||'Call',status:c.status,info:c.notes||'',duration:c.duration_s}))].sort((a,b)=>new Date(b.ts)-new Date(a.ts));
      const modal=G.modal({title:`Communication history · ${safe(p.name)} · PNR ${safe(p.pnr)}`,size:'xl',body:`<div class="tp-history-tabs"><button data-tp-channel="all">All (${rows.length})</button><button data-tp-channel="Call">Calls (${calls.length})</button><button data-tp-channel="whatsapp">WhatsApp (${messages.filter(m=>String(m.channel).toLowerCase()==='whatsapp').length})</button><button data-tp-channel="sms">SMS (${messages.filter(m=>String(m.channel).toLowerCase()==='sms').length})</button></div><div data-tp-hrows></div>`});
      const output=modal.$('[data-tp-hrows]');const paint=(ch)=>{const filtered=rows.filter(r=>ch==='all'||String(r.type).toLowerCase()===ch.toLowerCase());output.innerHTML=filtered.length?`<div class="tp-table-scroll"><table class="tp-table"><thead><tr><th>Type</th><th>Direction</th><th>Timestamp</th><th>Message type</th><th>Status</th><th>Duration</th><th>Additional info</th></tr></thead><tbody>${filtered.map(r=>`<tr><td>${safe(r.type)}</td><td>${safe(r.direction)}</td><td>${messageDate(r.ts)}</td><td>${safe(r.label)}</td><td>${safe(r.status)}</td><td>${r.duration == null ? '—' : safe(r.duration)+'s'}</td><td>${safe(r.info)}</td></tr>`).join('')}</tbody></table></div>`:noData('No recorded communications in this category.');};paint('all');modal.$$('[data-tp-channel]').forEach(b=>b.onclick=()=>paint(b.dataset.tpChannel));
    }
    const handle=async fn=>{try{await fn();}catch(e){G.err(e);}};
    G.on(el,'change','[data-tp-date]',t=>{state.date=t.value;});
    G.on(el,'change','[data-tp-service]',t=>{state.sid=t.value;handle(loadTrip);});
    G.on(el,'click','[data-tp-reload]',()=>handle(loadList));
    G.on(el,'click','[data-tp-section]',t=>{state.section=t.dataset.tpSection;render();});
    G.on(el,'click','[data-tp-toggle]',t=>{const key='closed:'+t.dataset.tpToggle;state.expanded.has(key)?state.expanded.delete(key):state.expanded.add(key);render();});
    G.on(el,'click','[data-tp-pnr]',(t,e)=>{e.preventDefault();G.bookingModal(t.dataset.tpPnr,loadTrip);});
    G.on(el,'click','[data-tp-customer]',(t,e)=>{e.preventDefault();const p=passenger(t.dataset.tpCustomer);if(p)G.modal({title:`Customer · ${safe(p.name)}`,body:`<div class="tp-customer"><p>Trips: <strong>${fmt(p.trips)}</strong></p><p>Tier: <strong>${fmt(p.tier)}</strong></p><p>Rating: <strong>Not available in trip API</strong></p><p>Check-ins: <strong>${p.status==='checked_in'?'This trip checked in':'Not available'}</strong></p></div>`});});
    G.on(el,'click','[data-tp-history]',t=>handle(()=>history(t.dataset.tpHistory)));
    G.on(el,'click','[data-tp-call]',t=>handle(async()=>{const p=passenger(t.dataset.tpCall);if(p)await G.callNow({phone:p.phone,name:p.name,pnr:p.pnr});}));
    G.on(el,'click','[data-tp-savecall]',t=>handle(async()=>{const p=passenger(t.dataset.tpSavecall);if(!p)return;const select=$$('[data-tp-callstatus]',el).find(x=>x.dataset.tpCallstatus===t.dataset.tpSavecall);await G.patch(`/trips/${state.sid}/passengers/${encodeURIComponent(p.pnr)}/${encodeURIComponent(p.seat)}`,{call_status:select?.value||null});G.toast('Call status updated','ok');await loadTrip();}));
    G.on(el,'change','[data-tp-setstatus]',t=>handle(()=>statusUpdate(t.dataset.tpSetstatus,t.value)));
    G.on(el,'click','[data-tp-event]',t=>handle(async()=>{await G.post(`/trips/${state.sid}/stop-event`,{stage_id:t.dataset.tpStage,kind:t.dataset.tpEvent});G.toast('Stop time recorded','ok');await loadTrip();}));
    G.on(el,'click','[data-tp-delay]',()=>handle(async()=>{const v=await G.prompt('Report delay',[{name:'minutes',label:'Delay minutes',type:'number',value:15},{name:'reason',label:'Reason'},{name:'notify',label:'Notify passengers',type:'checkbox'}]);if(v){await G.post(`/trips/${state.sid}/delay`,v);await loadTrip();}}));
    G.on(el,'click','[data-tp-notify]',()=>handle(async()=>{const v=await G.prompt('Notify passengers',[{name:'template',label:'Template',type:'select',options:[['bus_details','Bus details'],['ticket_confirmation','Confirmation'],['custom','Custom']]},{name:'text',label:'Message',type:'textarea',full:true}]);if(v){const r=await G.post(`/trips/${state.sid}/notify`,v);G.toast(`${r.sent} messages recorded`,'ok');}}));
    G.on(el,'click','[data-tp-print]',()=>window.print());
    await handle(loadList);
  };
})();
