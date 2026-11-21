// GDS hub: Schedules & Routes.
(function () {
  const autoTable = (rows, money = /fare|amount|sales|net|total|refund|commission|revenue|expense|profit|gst|spend|balance|paid|receivable|debit|credit/i) => {
    if (!rows || !rows.length) return '<div class="empty">No records</div>';
    const keys = Object.keys(rows[0]).filter((k) => typeof rows[0][k] !== 'object' || rows[0][k] === null);
    return G.table(rows, keys.map((k) => ({ k, l: k.replace(/_/g, ' '), n: typeof rows[0][k] === 'number', f: (r) => (typeof r[k] === 'number' && money.test(k) ? inr(r[k], 2) : typeof r[k] === 'number' ? num(r[k]) : esc(r[k])) })));
  };
  G.autoTable = autoTable;

  G.screens.gds = async (el, p) => {
    const tab = p.tab || 'schedules';
    el.innerHTML = `${tab === 'routes' ? '' : G.tabs([['schedules', 'Schedules', 'schedules.view'], ['deleted', 'Deleted trips', 'schedules.view']], tab, (k) => `#/gds/${k}`)}<div data-body></div>`;
    const body = $('[data-body]', el);
    if (tab === 'routes') return p.id ? routeEditor(body, p.id) : routesList(body);
    if (tab === 'deleted') return deletedTrips(body);
    return schedulesList(body);
  };

  // ---------- Schedules ----------
  async function schedulesList(el) {
    const q = G.query(); const from = q.from || today(), to = q.to || addDays(today(), 7);
    el.innerHTML = `<div class="row" style="margin-bottom:10px">${G.range(from, to)}<input data-q placeholder="Service / bus" value="${esc(q.q || '')}"/><button class="btn p" data-go>Apply</button></div><div data-t></div>`;
    const d = await G.get(`/schedules?${G.qs({ from, to })}`);
    const draw = () => { const s = ($('[data-q]', el).value || '').toLowerCase(); $('[data-t]', el).innerHTML = G.table(d.schedules.filter((x) => !s || `${x.service_number} ${x.vehicle?.registration_number || ''}`.toLowerCase().includes(s)), [
      { l: 'Date', f: (r) => fdate(r.travel_date) }, { l: 'Service', f: (r) => `<b>${esc(r.service_number)}</b> <span class="muted">${esc(r.origin)} → ${esc(r.destination)}</span>` },
      { l: 'Dep', f: (r) => t12(r.departure_time) }, { l: 'Bus', f: (r) => esc(r.vehicle?.registration_number || r.vehicle || '—') }, { l: 'Seats', n: 1, f: (r) => `${r.seats_booked}/${r.capacity}` }, { l: 'Occ', n: 1, f: (r) => pct(r.occupancy_pct) }, { l: 'Revenue', n: 1, f: (r) => inr(r.revenue) },
      { l: 'Status', f: (r) => statusBadge(r.status) + (r.sync_with_route === false ? ' <span class="badge warn">custom fares</span>' : '') },
      { l: '', f: (r) => `<button class="btn sm" data-book="${r.id}">Book</button> <button class="btn sm" data-fares="${r.id}">Fares</button> <button class="btn sm" data-pnl="${r.id}">P&amp;L</button> <button class="btn sm" data-hist="${r.id}">History</button> ${can('schedules.toggle') ? `<button class="btn sm" data-tog="${r.id}">${r.status === 'active' ? 'Disable' : 'Enable'}</button>` : ''} ${can('schedules.delete') ? `<button class="btn sm d" data-delsch="${r.id}">Delete</button>` : ''}` },
    ]); };
    draw(); $('[data-q]', el).oninput = draw;
    $('[data-go]', el).onclick = () => { location.hash = `#/gds/schedules?${G.qs({ from: $('[data-from]', el).value, to: $('[data-to]', el).value, q: $('[data-q]', el).value })}`; };
    const reload = () => schedulesList(el);
    G.on(el, 'click', '[data-book]', (b) => G.bookingConsole(b.dataset.book, reload));
    G.on(el, 'click', '[data-tog]', async (b) => { await G.post(`/schedules/${b.dataset.tog}/toggle`); G.toast('Updated', 'ok'); reload(); });
    G.on(el, 'click', '[data-delsch]', async (b) => { if (!(await G.confirm('Delete this trip? Bookings must be shifted or cancelled first.', { danger: 1, ok: 'Delete' }))) return; await G.del(`/schedules/${b.dataset.delsch}`); G.toast('Trip deleted', 'ok'); reload(); });
    G.on(el, 'click', '[data-pnl]', async (b) => { const x = await G.get(`/schedules/${b.dataset.pnl}/pnl`); G.modal({ title: 'Trip P&L', size: 'lg', body: G.pnlCard ? G.pnlCard(x) : `<pre>${esc(JSON.stringify(x, null, 2))}</pre>` }); });
    G.on(el, 'click', '[data-hist]', async (b) => { const x = await G.get(`/schedules/${b.dataset.hist}/history`); G.modal({ title: 'Edit history', size: 'lg', body: historyTable(x.history) }); });
    G.on(el, 'click', '[data-fares]', (b) => faresEditor(b.dataset.fares, reload));
  }
  const historyTable = (h) => G.table(h, [{ l: 'When', f: (r) => fdt(r.at) }, { k: 'section', l: 'Section' }, { l: 'By', f: (r) => `${esc(r.name)} <span class="muted">${esc(r.role)}</span>` }, { l: 'Change', f: (r) => `<code class="small">${esc(JSON.stringify(r.changes)).slice(0, 220)}</code>` }]);
  G.historyTable = historyTable;

  async function faresEditor(id, done) {
    const f = await G.get(`/schedules/${id}/fares`);
    const rec = f.recommendation;
    const m = G.modal({ title: 'Trip fares', size: 'lg', body: `
      <label class="chk"><input type="checkbox" data-sync ${f.synced ? 'checked' : ''}/> Follow route fares</label>
      ${rec ? `<div class="card" style="margin:10px 0"><b>Recommended</b> — occupancy ${pct(rec.occupancy_pct)} vs expected ${pct(rec.expected_occupancy_pct)}: seater ${inr(rec.seater)}, lower ${inr(rec.sleeper_lower)}, upper ${inr(rec.sleeper_upper)} <button class="btn sm p" data-rec>Apply</button></div>` : ''}
      <div class="tw"><table class="t"><thead><tr><th>From</th><th>To</th><th class="n">Seater</th><th class="n">Sleeper lower</th><th class="n">Sleeper upper</th></tr></thead><tbody>
      ${f.fares.map((x, i) => `<tr data-i="${i}"><td>${esc(x.from)}</td><td>${esc(x.to)}</td>${['seater', 'sleeper_lower', 'sleeper_upper'].map((k) => `<td class="n"><input type="number" data-k="${k}" value="${x[k] ?? ''}" style="width:90px"/></td>`).join('')}</tr>`).join('')}</tbody></table></div>`,
      foot: '<button class="btn" data-x2>Close</button><button class="btn p" data-save>Save fares</button>' });
    m.$('[data-x2]').onclick = m.close;
    if (rec) m.$('[data-rec]').onclick = () => G.post(`/schedules/${id}/apply-recommendation`).then(() => { G.toast('Recommendation applied', 'ok'); m.close(); done(); }).catch(G.err);
    m.$('[data-save]').onclick = () => { const fares = f.fares.map((x, i) => { const o = { ...x }; m.$$(`tr[data-i="${i}"] input`).forEach((inp) => (o[inp.dataset.k] = Number(inp.value))); return o; }); G.put(`/schedules/${id}/fares`, { sync_with_route: m.$('[data-sync]').checked, fares }).then(() => { G.toast('Fares saved', 'ok'); m.close(); done(); }).catch(G.err); };
  }

  async function deletedTrips(el) {
    const d = await G.get('/schedules/deleted');
    const rows = d.deleted || d.schedules || d.trips || (Array.isArray(d) ? d : []);
    el.innerHTML = G.table(rows, [{ l: 'Date', f: (r) => fdate(r.travel_date) }, { l: 'Service', f: (r) => esc(r.service_number || r.route_id) }, { l: 'Deleted by', f: (r) => esc(r.by || r.deleted_by || '') }, { l: '', f: (r) => `<button class="btn sm" data-res="${r.route_id}|${r.travel_date}">Restore</button>` }], { empty: 'No deleted trips' });
    G.on(el, 'click', '[data-res]', async (b) => { const [route_id, travel_date] = b.dataset.res.split('|'); await G.post('/schedules/restore', { route_id: Number(route_id), travel_date }); G.toast('Trip restored', 'ok'); deletedTrips(el); });
  }

  // ---------- Routes ----------
  async function routesList(el) {
    const st = G.query().status || 'active';
    const d = await G.get(`/routes?status=${st}`);
    el.innerHTML = `<div class="row between" style="margin-bottom:10px">${G.pills([['active', 'Active'], ['inactive', 'Inactive'], ['deleted', 'Deleted'], ['all', 'All']], st, 'data-st')}${can('routes.create') ? '<button class="btn p" data-new>+ New route</button>' : ''}</div>
      ${G.table(d.routes, [{ l: 'Service', f: (r) => `<a href="#/gds/routes/${r.id}"><b>${esc(r.service_number)}</b></a> <span class="muted">${esc(r.name)}</span>` }, { l: 'Route', f: (r) => `${esc(r.origin)} → ${esc(r.destination)}` }, { l: 'Timing', f: (r) => `${t12(r.departure_time)} – ${t12(r.arrival_time)}` }, { k: 'coach', l: 'Coach' }, { k: 'vehicle', l: 'Bus' }, { l: 'Stops', f: (r) => `${r.pickups} P · ${r.drops} D · ${r.breaks} B` }, { l: 'Fare', n: 1, f: (r) => (r.main_fare ? inr(r.main_fare.seater) : '—') }, { k: 'upcoming_trips', l: 'Upcoming', n: 1 }, { l: 'Status', f: (r) => statusBadge(r.status) + (r.status === 'deleted' && can('routes.modify') ? ` <button class="btn sm" data-restore="${r.id}">Restore</button>` : '') }], { empty: 'No routes' })}`;
    G.on(el, 'click', '[data-st]', (b) => (location.hash = `#/gds/routes?status=${b.dataset.st}`));
    G.on(el, 'click', '[data-restore]', async (b) => { await G.post(`/routes/${b.dataset.restore}/restore`); G.toast('Route restored (inactive)', 'ok'); routesList(el); });
    const nb = $('[data-new]', el); if (nb) nb.onclick = async () => {
      const [{ cities }, { coaches }] = await Promise.all([G.get('/cities'), G.get('/coaches')]);
      const co = cities.map((c) => [c.id, c.name]);
      const v = await G.prompt('New route', [{ name: 'service_number', label: 'Service number', required: true }, { name: 'name', label: 'Service name' }, { name: 'origin_city_id', label: 'Origin', type: 'select', options: co }, { name: 'destination_city_id', label: 'Destination', type: 'select', options: co, value: co[1]?.[0] }, { name: 'departure_time', label: 'Departure', type: 'time', required: true }, { name: 'arrival_time', label: 'Arrival', type: 'time' }, { name: 'coach_template_id', label: 'Coach', type: 'select', options: coaches.map((c) => [c.id, c.name]) }, { name: 'fare', label: 'Main fare (seater)', type: 'number', value: 1000 }], { ok: 'Create' });
      if (!v) return; const rt = await G.post('/routes', v); G.toast('Route created — add stops, then activate', 'ok'); location.hash = `#/gds/routes/${rt.id}`;
    };
  }

  const SECTIONS = [['details', 'Details'], ['stops', 'Stops'], ['fares', 'Fares'], ['rules', 'Seat rules & blocks'], ['refund', 'Refund policy'], ['expenses', 'Expenses'], ['calls', 'Call settings'], ['halts', 'GPS halts'], ['history', 'History']];
  async function routeEditor(el, id) {
    const sec = G.query().s || 'details';
    const rt = await G.get(`/routes/${id}`);
    const editable = can('routes.modify');
    const save = async (patch, msg = 'Saved') => { await G.put(`/routes/${id}`, patch); G.toast(msg, 'ok'); routeEditor(el, id); };
    el.innerHTML = `<div class="row between" style="margin-bottom:10px"><div><a href="#/gds/routes">← Routes</a> &nbsp;<b style="font-size:16px">${esc(rt.service_number)}</b> <span class="muted">${esc(rt.name)} · ${esc(rt.summary.origin)} → ${esc(rt.summary.destination)}</span> ${statusBadge(rt.status)}</div>
      <div class="row">${editable ? `<button class="btn sm" data-validate>Validate</button><button class="btn sm" data-shift>Shift time</button>${rt.status === 'active' ? '<button class="btn sm" data-deact>Deactivate</button>' : rt.status !== 'deleted' ? '<button class="btn sm p" data-act>Activate</button>' : ''}` : ''}${can('routes.create') ? '<button class="btn sm" data-dup>Duplicate</button>' : ''}${can('routes.delete') && rt.status !== 'deleted' ? '<button class="btn sm d" data-delrt>Delete</button>' : ''}</div></div>
      ${G.pills(SECTIONS, sec, 'data-sec')}<div class="card" style="margin-top:10px" data-sb></div>`;
    G.on(el, 'click', '[data-sec]', (b) => (location.hash = `#/gds/routes/${id}?s=${b.dataset.sec}`));
    const sb = $('[data-sb]', el);
    const act = (s, fn) => { const b = $(s, el); if (b) b.onclick = () => fn().catch(G.err); };
    act('[data-act]', () => save({ status: 'active' }, 'Route activated'));
    act('[data-deact]', async () => { if (await G.confirm('Deactivate route? Future trips will be disabled.', { danger: 1 })) await save({ status: 'inactive' }, 'Route deactivated'); });
    act('[data-validate]', async () => { const v = await G.get(`/routes/${id}/validate`); G.modal({ title: v.ok ? '✅ Route is valid' : '⚠ Route has issues', body: v.issues.length ? v.issues.map((i) => `<div class="row"><span class="badge ${i.level === 'error' ? 'bad' : 'warn'}">${i.level}</span> ${esc(i.message)}</div>`).join('') : '<p>No issues found.</p>' }); });
    act('[data-shift]', async () => { const v = await G.prompt('Shift route timings', [{ name: 'direction', label: 'Direction', type: 'select', options: [['delay', 'Later (delay)'], ['advance', 'Earlier (advance)']] }, { name: 'hours', label: 'Hours', type: 'number', value: 0 }, { name: 'minutes', label: 'Minutes', type: 'number', value: 15 }, { name: 'from_date', label: 'Apply to trips from', type: 'date', value: today() }]); if (!v) return; await G.post(`/routes/${id}/shift-time`, v); G.toast('Timings shifted', 'ok'); routeEditor(el, id); });
    act('[data-dup]', async () => { const v = await G.prompt('Duplicate route', [{ name: 'service_number', label: 'New service number', required: true, value: `${rt.service_number}-2` }]); if (!v) return; const n = await G.post(`/routes/${id}/duplicate`, v); location.hash = `#/gds/routes/${n.id}`; });
    act('[data-delrt]', async () => { if (!(await G.confirm(`Delete route ${esc(rt.service_number)}? All future trips are disabled.`, { danger: 1, ok: 'Continue' }))) return; const otp = await G.stepUp(`route_delete_${id}`, `/routes/${id}/delete-otp`); if (!otp) return; await G.api('DELETE', `/routes/${id}`, { otp }); G.toast('Route deleted', 'ok'); location.hash = '#/gds/routes'; });

    if (sec === 'details') {
      const [{ coaches }, { vehicles }] = await Promise.all([G.get('/coaches'), G.get('/vehicles')]);
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      sb.innerHTML = `<form class="grid g3" data-f>${[{ name: 'service_number', label: 'Service number', value: rt.service_number }, { name: 'name', label: 'Service name', value: rt.name }, { name: 'departure_time', label: 'Departure', type: 'time', value: rt.departure_time }, { name: 'arrival_time', label: 'Arrival', type: 'time', value: rt.arrival_time }, { name: 'duration_minutes', label: 'Duration (min)', type: 'number', value: rt.duration_minutes }, { name: 'distance_km', label: 'Distance (km)', type: 'number', value: rt.distance_km }, { name: 'coach_template_id', label: 'Coach', type: 'select', options: [['', '—'], ...coaches.map((c) => [c.id, `${c.name} (${c.capacity})`])], value: rt.coach_template_id }, { name: 'vehicle_id', label: 'Bus', type: 'select', options: [['', '—'], ...vehicles.map((v) => [v.id, v.registration_number])], value: rt.vehicle_id }, { name: 'start_date', label: 'Start date', type: 'date', value: rt.start_date }, { name: 'end_date', label: 'End date', type: 'date', value: rt.end_date }, { name: 'rp_type', label: 'Runs', type: 'select', options: [['daily', 'Daily'], ['weekdays', 'Selected weekdays'], ['every_n', 'Alternate days']], value: rt.run_pattern?.type }].map(G.field).join('')}
        <div style="grid-column:1/-1" class="row">${days.map((d, i) => `<label class="chk"><input type="checkbox" data-day="${i}" ${(rt.run_pattern?.days || []).includes(i) ? 'checked' : ''}/> ${d}</label>`).join('')}</div>
        <div style="grid-column:1/-1"><b>Auto pricing</b></div>${[{ name: 'ap_enabled', label: 'Enable auto pricing', type: 'checkbox', value: rt.auto_pricing?.enabled }, { name: 'ap_min', label: 'Min fare', type: 'number', value: rt.auto_pricing?.min }, { name: 'ap_max', label: 'Max fare', type: 'number', value: rt.auto_pricing?.max }].map(G.field).join('')}</form>
        ${editable ? '<div class="row" style="margin-top:12px"><button class="btn p" data-save>Save details</button></div>' : ''}
        <h3 style="margin-top:18px">Via cities</h3>${G.table(rt.via_cities, [{ k: 'name', l: 'City' }, { k: 'day', l: 'Day' }, { l: 'Time', f: (r) => t12(r.time) }])}`;
      act('[data-save]', async () => { const v = G.formVal($('[data-f]', sb)); const rp = { type: v.rp_type }; if (v.rp_type === 'weekdays') rp.days = $$('[data-day]', sb).filter((x) => x.checked).map((x) => Number(x.dataset.day)); if (v.rp_type === 'every_n') Object.assign(rp, { first_date: v.start_date, run: 1, rest: 1 }); await save({ service_number: v.service_number, name: v.name, departure_time: v.departure_time, arrival_time: v.arrival_time, duration_minutes: v.duration_minutes, distance_km: v.distance_km, coach_template_id: v.coach_template_id ? Number(v.coach_template_id) : null, vehicle_id: v.vehicle_id ? Number(v.vehicle_id) : null, start_date: v.start_date, end_date: v.end_date || null, run_pattern: rp, auto_pricing: { ...rt.auto_pricing, enabled: v.ap_enabled, min: v.ap_min, max: v.ap_max } }); });
    }

    if (sec === 'stops') {
      const { cities } = await G.get('/cities');
      const stages = rt.stages.slice().sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
      sb.innerHTML = `<div class="row between" style="margin-bottom:8px"><span class="muted">${stages.length} stops</span>${editable ? '<div class="row"><button class="btn sm" data-imp>Import CSV</button><button class="btn sm p" data-add>+ Add stop</button></div>' : ''}</div>
        ${G.table(stages, [{ l: 'Type', f: (r) => `<span class="badge ${r.type === 'pickup' ? 'b' : r.type === 'drop' ? 'ok' : 'warn'}">${r.type}</span>` }, { k: 'name', l: 'Name' }, { l: 'City', f: (r) => esc(cities.find((c) => c.id === r.city_id)?.name || '') }, { k: 'day', l: 'Day' }, { l: 'Time', f: (r) => t12(r.time) }, { k: 'landmark', l: 'Landmark' }, { k: 'contact_number', l: 'Contact' }, { l: 'Pin', f: (r) => (r.lat ? `<a target="_blank" href="https://maps.google.com/?q=${r.lat},${r.lng}">map</a>` : '<span class="badge warn">no pin</span>') }, { l: '', f: (r) => (editable ? `<button class="btn sm" data-edst="${r.id}">Edit</button> <button class="btn sm d" data-rmst="${r.id}">✕</button>` : '') }])}`;
      const stopForm = (s = {}) => [{ name: 'type', label: 'Type', type: 'select', options: ['pickup', 'drop', 'break'], value: s.type }, { name: 'name', label: 'Name', required: true, value: s.name }, { name: 'city_id', label: 'City', type: 'select', options: [['', '—'], ...cities.map((c) => [c.id, c.name])], value: s.city_id }, { name: 'day', label: 'Day', type: 'number', value: s.day || 1 }, { name: 'time', label: 'Time', type: 'time', required: true, value: s.time }, { name: 'landmark', label: 'Landmark', value: s.landmark }, { name: 'address', label: 'Address', value: s.address, full: 1 }, { name: 'contact_number', label: 'Contact', value: s.contact_number }, { name: 'lat', label: 'Latitude', type: 'number', step: 'any', value: s.lat }, { name: 'lng', label: 'Longitude', type: 'number', step: 'any', value: s.lng }];
      const norm = (v) => ({ ...v, city_id: v.city_id ? Number(v.city_id) : null, day: Number(v.day) || 1 });
      act('[data-add]', async () => { const v = await G.prompt('Add stop', stopForm()); if (v) await save({ stages: [...rt.stages, norm(v)] }, 'Stop added'); });
      G.on(sb, 'click', '[data-edst]', async (b) => { const s = rt.stages.find((x) => x.id == b.dataset.edst); const v = await G.prompt('Edit stop', stopForm(s)); if (v) await save({ stages: rt.stages.map((x) => (x.id === s.id ? { ...x, ...norm(v) } : x)) }); });
      G.on(sb, 'click', '[data-rmst]', async (b) => { if (await G.confirm('Remove this stop?', { danger: 1 })) await save({ stages: rt.stages.filter((x) => x.id != b.dataset.rmst) }, 'Stop removed'); });
      act('[data-imp]', async () => { const v = await G.prompt('Import stops', [{ name: 'csv', label: 'CSV with header: type,name,city,day,time,lat,lng,address,landmark,contact', type: 'textarea', rows: 8, full: 1, required: true }, { name: 'mode', label: 'Mode', type: 'select', options: [['append', 'Append'], ['replace', 'Replace all']] }], { ok: 'Import', size: 'lg' }); if (!v) return; const lines = v.csv.trim().split(/\r?\n/); const head = lines.shift().split(',').map((x) => x.trim().toLowerCase()); const rows = lines.map((l) => Object.fromEntries(l.split(',').map((c, i) => [head[i], c.trim()]))); const r = await G.post(`/routes/${id}/stops/import`, { rows, mode: v.mode }); G.toast(`Imported ${r.imported}, skipped ${r.skipped.length}`, r.skipped.length ? 'warn' : 'ok'); routeEditor(el, id); });
    }

    if (sec === 'fares') {
      sb.innerHTML = `<p class="muted">City-pair fares. Saving updates all trips that follow route fares.</p><div class="tw"><table class="t"><thead><tr><th>From</th><th>To</th><th class="n">Seater</th><th class="n">Sleeper lower</th><th class="n">Sleeper upper</th></tr></thead><tbody>${rt.fares.map((x, i) => `<tr data-i="${i}"><td>${esc(x.from)}</td><td>${esc(x.to)}</td>${['seater', 'sleeper_lower', 'sleeper_upper'].map((k) => `<td class="n"><input type="number" data-k="${k}" value="${x[k] ?? ''}" style="width:90px" ${editable ? '' : 'disabled'}/></td>`).join('')}</tr>`).join('')}</tbody></table></div>${editable ? '<button class="btn p" style="margin-top:10px" data-save>Save fares</button>' : ''}`;
      act('[data-save]', () => save({ fares: rt.fares.map((x, i) => { const o = { from_city_id: x.from_city_id, to_city_id: x.to_city_id }; $$(`tr[data-i="${i}"] input`, sb).forEach((inp) => (o[inp.dataset.k] = Number(inp.value))); return o; }) }, 'Fares saved'));
    }

    if (sec === 'rules') {
      sb.innerHTML = `<div class="row between"><h3>Seat fare rules</h3>${editable ? '<button class="btn sm" data-addrule>+ Rule</button>' : ''}</div>${G.table(rt.seat_fare_rules, [{ l: 'Seats', f: (r) => esc((r.seats || []).join(', ')) }, { l: 'Adjustment', f: (r) => esc(r.kind === 'percent' ? `${r.value}%` : inr(r.value)) }, { k: 'label', l: 'Label' }, { l: '', f: (r, i) => (editable ? `<button class="btn sm d" data-rmrule="${i}">✕</button>` : '') }], { empty: 'No seat fare rules' })}
        <div class="row between" style="margin-top:16px"><h3>Seat blocks (quota)</h3>${editable ? '<button class="btn sm" data-addblk>+ Block</button>' : ''}</div>${G.table(rt.seat_blocks, [{ l: 'Seats', f: (r) => esc((r.seats || []).join(', ')) }, { k: 'reason', l: 'Reason' }, { k: 'auto_release_hours', l: 'Auto-release (h before)' }, { l: 'Period', f: (r) => (r.from || r.to ? `${fdate(r.from)} – ${fdate(r.to)}` : 'Always') }, { l: '', f: (r, i) => (editable ? `<button class="btn sm d" data-rmblk="${i}">✕</button>` : '') }], { empty: 'No blocked seats' })}`;
      const seats = (s) => s.split(/[\s,]+/).filter(Boolean);
      act('[data-addrule]', async () => { const v = await G.prompt('Seat fare rule', [{ name: 'seats', label: 'Seats (comma separated)', required: true, full: 1 }, { name: 'kind', label: 'Type', type: 'select', options: [['amount', 'Flat ₹ change'], ['percent', '% change']] }, { name: 'value', label: 'Value (negative = discount)', type: 'number', value: 100 }, { name: 'label', label: 'Label' }]); if (v) await save({ seat_fare_rules: [...rt.seat_fare_rules, { ...v, days: [], seats: seats(v.seats) }] }); });
      act('[data-addblk]', async () => { const v = await G.prompt('Block seats', [{ name: 'seats', label: 'Seats (comma separated)', required: true, full: 1 }, { name: 'reason', label: 'Reason', value: 'Quota' }, { name: 'from', label: 'From date', type: 'date' }, { name: 'to', label: 'To date', type: 'date' }, { name: 'auto_release_hours', label: 'Auto-release hours before departure', type: 'number', value: 6 }]); if (v) await save({ seat_blocks: [...rt.seat_blocks, { ...v, from: v.from || null, to: v.to || null, seats: seats(v.seats) }] }); });
      G.on(sb, 'click', '[data-rmrule]', (b) => save({ seat_fare_rules: rt.seat_fare_rules.filter((_, i) => i != b.dataset.rmrule) }));
      G.on(sb, 'click', '[data-rmblk]', (b) => save({ seat_blocks: rt.seat_blocks.filter((_, i) => i != b.dataset.rmblk) }));
    }

    if (sec === 'refund') {
      const rows = rt.refund_slabs.slice().sort((a, b) => b.hours_before - a.hours_before);
      sb.innerHTML = `<p class="muted">Refund % by hours before departure.</p><div data-rows>${rows.map((s) => `<div class="row" style="margin:4px 0">More than <input type="number" data-h value="${s.hours_before}" style="width:80px"/> hours → refund <input type="number" data-p value="${s.refund_pct}" style="width:80px"/> % <button class="btn sm d" data-rm>✕</button></div>`).join('')}</div>${editable ? '<div class="row" style="margin-top:8px"><button class="btn sm" data-addslab>+ Slab</button><button class="btn p" data-save>Save policy</button></div>' : ''}`;
      G.on(sb, 'click', '[data-rm]', (b) => b.parentElement.remove());
      act('[data-addslab]', async () => { $('[data-rows]', sb).insertAdjacentHTML('beforeend', '<div class="row" style="margin:4px 0">More than <input type="number" data-h value="0" style="width:80px"/> hours → refund <input type="number" data-p value="0" style="width:80px"/> % <button class="btn sm d" data-rm>✕</button></div>'); });
      act('[data-save]', () => save({ refund_slabs: $$('[data-rows] .row', sb).map((r) => ({ hours_before: Number($('[data-h]', r).value), refund_pct: Number($('[data-p]', r).value) })) }, 'Refund policy saved'));
    }

    if (sec === 'expenses') {
      const ex = rt.expenses || { fixed: [], running: [] };
      const blk = (k, title) => `<div class="row between" style="margin-top:12px"><h3>${title} · ${inr((ex[k] || []).reduce((a, x) => a + x.per_day, 0))}/day</h3>${editable ? `<button class="btn sm" data-addex="${k}">+ Add</button>` : ''}</div>${G.table(ex[k] || [], [{ k: 'label', l: 'Expense' }, { l: 'Per day', n: 1, f: (r) => inr(r.per_day) }, { l: '', f: (r, i) => (editable ? `<button class="btn sm d" data-rmex="${k}|${i}">✕</button>` : '') }], { empty: 'None' })}`;
      sb.innerHTML = blk('fixed', 'Fixed costs') + blk('running', 'Running costs');
      G.on(sb, 'click', '[data-addex]', async (b) => { const k = b.dataset.addex; const v = await G.prompt('Add expense', [{ name: 'label', label: 'Name', required: true }, { name: 'per_day', label: 'Amount per day', type: 'number', required: true }]); if (v) await save({ expenses: { ...ex, [k]: [...(ex[k] || []), { key: v.label.toLowerCase().replace(/\W+/g, '_'), ...v }] } }); });
      G.on(sb, 'click', '[data-rmex]', (b) => { const [k, i] = b.dataset.rmex.split('|'); return save({ expenses: { ...ex, [k]: ex[k].filter((_, j) => j != i) } }); });
    }

    if (sec === 'calls') {
      const c = rt.call_settings || {}; const a = c.automated_calls || {};
      const f = [['cloud_calling', 'Cloud calling', c], ['number_masking', 'Number masking', c], ['direct_to_vehicle', 'Route passenger calls to vehicle', c], ['driver_gps', 'Use driver phone GPS', c], ['boarding_call', 'Automated boarding call', a], ['bus_near_call', '"Bus is near" call', a], ['rating_call', 'Post-trip rating call', a]];
      sb.innerHTML = `${f.map(([k, l, o]) => `<label class="chk" style="display:block;margin:6px 0"><input type="checkbox" data-cs="${k}" ${o[k] ? 'checked' : ''} ${editable ? '' : 'disabled'}/> ${l}</label>`).join('')}${editable ? '<button class="btn p" data-save>Save</button>' : ''}`;
      act('[data-save]', () => { const g = (k) => $(`[data-cs="${k}"]`, sb).checked; return save({ call_settings: { cloud_calling: g('cloud_calling'), number_masking: g('number_masking'), direct_to_vehicle: g('direct_to_vehicle'), driver_gps: g('driver_gps'), automated_calls: { boarding_call: g('boarding_call'), bus_near_call: g('bus_near_call'), rating_call: g('rating_call') } } }, 'Call settings saved'); });
    }

    if (sec === 'halts') {
      const h = await G.get(`/routes/${id}/halts?days=15`);
      sb.innerHTML = `<p class="muted">Compared against GPS halts from ${h.trips} completed trips in the last ${h.days} days.</p>${G.table(h.stops, [{ k: 'name', l: 'Stop' }, { k: 'kind', l: 'Kind' }, { l: 'Pin offset', n: 1, f: (r) => `${r.offset_m} m` }, { l: 'Time delta', n: 1, f: (r) => `${r.time_delta_min > 0 ? '+' : ''}${r.time_delta_min} min` }, { l: 'Suggested time', f: (r) => t12(r.suggested_time) }, { l: 'Verdict', f: (r) => `<span class="badge ${r.status === 'fine' ? 'ok' : 'warn'}">${r.status.replace('_', ' ')}</span>` }, { l: '', f: (r) => (editable && r.status === 'change_time' ? `<button class="btn sm" data-fix="${r.stage_id}|${r.suggested_time}">Apply time</button>` : '') }])}`;
      G.on(sb, 'click', '[data-fix]', (b) => { const [sid, t] = b.dataset.fix.split('|'); return save({ stages: rt.stages.map((s) => (s.id == sid ? { ...s, time: t } : s)) }, 'Stop time updated'); });
    }

    if (sec === 'history') {
      const h = await G.get(`/routes/${id}/history`);
      sb.innerHTML = historyTable(h.history);
    }
  }
})();
