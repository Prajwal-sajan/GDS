// Fleet: vehicles, coaches, staff, attendance & payroll.
(function () {
  G.screens.fleet = async (el, p) => {
    const tab = p.tab || 'vehicles';
    const ALL = [['vehicles', 'Vehicles', 'fleet.view'], ['coaches', 'Coaches', 'fleet.view'], ['staff', 'Staff', 'staff.view'], ['attendance', 'Attendance', 'staff.view'], ['payouts', 'Payouts', 'staff.payroll'], ['advances', 'Advances', 'staff.payroll'], ['reimbursements', 'Reimbursements', 'staff.payroll']];
    const group = ['vehicles', 'coaches'].includes(tab) ? ALL.slice(0, 2) : ALL.slice(2);
    el.innerHTML = `${G.tabs(group, tab, (k) => `#/fleet/${k}`)}<div data-body></div>`;
    const body = $('[data-body]', el);
    const fn = { vehicles, coaches, staff, attendance, payouts, advances, reimbursements }[tab] || vehicles;
    return fn(body, p.id);
  };

  // ---------- Vehicles ----------
  async function vehicles(el) {
    const [{ vehicles: V }, { coaches: C }] = await Promise.all([G.get('/vehicles'), G.get('/coaches')]);
    const live = V.filter((v) => v.position?.state === 'MOVING').length;
    el.innerHTML = `${G.kpis([['Vehicles', V.length], ['Moving now', live], ['Document alerts', V.reduce((a, v) => a + v.doc_alerts, 0)], ['Health issues', V.filter((v) => v.health?.status && v.health.status !== 'GOOD').length]])}
      <div class="row between" style="margin:14px 0 8px"><b>Fleet</b><div class="row"><button class="btn sm" data-pos>Live positions</button>${can('fleet.modify') ? '<button class="btn sm p" data-new>+ Add vehicle</button>' : ''}</div></div>
      ${G.table(V, [{ l: 'Bus', f: (v) => `<b>${esc(v.registration_number)}</b><div class="small muted">${esc(v.make || '')} ${esc(v.model || '')}</div>` }, { k: 'coach', l: 'Coach' }, { l: 'Role', f: (v) => esc(v.vehicle_role) }, { l: 'Ownership', f: (v) => esc(v.ownership_type) }, { l: 'Now', f: (v) => `<span class="badge ${v.position?.state === 'MOVING' ? 'b' : ''}">${esc(v.position?.state || '—')}</span> ${v.position?.speed ? `${v.position.speed} km/h` : ''}` }, { l: 'Next trip', f: (v) => (v.next_trip ? `${esc(v.next_trip.service)} · ${fdate(v.next_trip.travel_date)} ${t12(v.next_trip.departure_time)}` : '—') }, { l: 'Documents', f: (v) => v.documents.filter((d) => d.state !== 'ok').map((d) => `${statusBadge(d.state)} <span class="small">${esc(d.document_type)}</span>`).join('<br>') || `<span class="badge ok">${v.documents.length} ok</span>` }, { l: 'Health', f: (v) => statusBadge(v.health?.status === 'GOOD' ? 'active' : v.health?.status) }, { l: 'Status', f: (v) => statusBadge(v.status) }, { l: '', f: (v) => `<button class="btn sm" data-docs="${v.id}">Docs</button> <button class="btn sm" data-live="${v.id}">Live</button> ${can('fleet.modify') ? `<button class="btn sm" data-ed="${v.id}">Edit</button>` : ''} ${can('fleet.delete') ? `<button class="btn sm d" data-rm="${v.id}">✕</button>` : ''}` }])}`;
    const reload = () => vehicles(el);
    const form = (v = {}) => [{ name: 'registration_number', label: 'Registration no.', required: true, value: v.registration_number }, { name: 'coach_template_id', label: 'Coach', type: 'select', options: C.map((c) => [c.id, c.name]), value: v.coach_template_id }, { name: 'make', label: 'Make', value: v.make }, { name: 'model', label: 'Model', value: v.model }, { name: 'vehicle_role', label: 'Role', type: 'select', options: [['main', 'Main bus'], ['pickup_van', 'Pickup van'], ['spare', 'Spare']], value: v.vehicle_role }, { name: 'ownership_type', label: 'Ownership', type: 'select', options: ['permanent', 'leased', 'attached'], value: v.ownership_type }, { name: 'status', label: 'Status', type: 'select', options: ['active', 'inactive', 'maintenance'], value: v.status }, { name: 'gps_enabled', label: 'GPS device fitted', type: 'checkbox', value: v.gps_enabled }];
    const nb = $('[data-new]', el); if (nb) nb.onclick = async () => { const v = await G.prompt('Add vehicle', form()); if (v) { await G.post('/vehicles', v); G.toast('Vehicle added', 'ok'); reload(); } };
    G.on(el, 'click', '[data-ed]', async (b) => { const v0 = V.find((x) => x.id == b.dataset.ed); const v = await G.prompt('Edit vehicle', form(v0)); if (v) { await G.put(`/vehicles/${v0.id}`, v); G.toast('Saved', 'ok'); reload(); } });
    G.on(el, 'click', '[data-rm]', async (b) => { if (await G.confirm('Remove this vehicle?', { danger: 1 })) { await G.del(`/vehicles/${b.dataset.rm}`); reload(); } });
    G.on(el, 'click', '[data-docs]', (b) => G.docsModal('vehicle', b.dataset.docs, reload));
    G.on(el, 'click', '[data-live]', async (b) => {
      const x = await G.get(`/vehicles/${b.dataset.live}/live`); const f = x.fix || {};
      G.modal({ title: `Live · ${esc(x.plate)}`, size: 'lg', body: `<div class="grid g2"><div class="card"><b>Position</b><p>${f.lat ? `${f.lat.toFixed(5)}, ${f.lng.toFixed(5)}` : '—'} · ${esc(f.state || '')} ${f.speed ? `${f.speed} km/h` : ''}</p>${f.lat ? `<a class="btn sm" target="_blank" href="https://maps.google.com/?q=${f.lat},${f.lng}">Open in Maps</a>` : ''}<p class="small muted">Updated ${f.ts ? fdt(f.ts) : '—'}</p></div><div class="card"><b>Health</b><p>${statusBadge(x.health?.status)}</p>${(x.health?.alerts || []).map((a) => `<div class="small">⚠ ${esc(a.message || a)}</div>`).join('')}</div></div>
        ${x.service ? `<div class="card" style="margin-top:10px"><b>${esc(x.service.serviceNumber)} · ${esc(x.service.origin)} → ${esc(x.service.destination)}</b><div class="small muted">${fdt(x.service.departure)}</div>${G.table(x.service.staff, [{ k: 'role', l: 'Role' }, { k: 'name', l: 'Name' }, { l: 'Phone', f: (r) => `<a href="tel:${esc(r.phone)}">${esc(r.phone)}</a>` }])}</div>` : '<div class="empty">No trip assigned</div>'}` });
    });
    $('[data-pos]', el).onclick = async () => { const x = await G.get('/vehicles/positions'); G.modal({ title: 'Live positions', size: 'lg', body: G.table(x.vehicles, [{ k: 'plate', l: 'Bus' }, { l: 'Service', f: (r) => esc(r.service || '—') }, { l: 'State', f: (r) => `<span class="badge ${r.state === 'MOVING' ? 'b' : ''}">${esc(r.state)}</span>` }, { l: 'Speed', n: 1, f: (r) => `${r.speed || 0} km/h` }, { l: 'Location', f: (r) => (r.lat ? `<a target="_blank" href="https://maps.google.com/?q=${r.lat},${r.lng}">${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}</a>` : '—') }]) }); };
  }

  // Shared documents modal for vehicles & staff
  G.docsModal = async (type, id, done) => {
    const draw = async (m) => {
      const { documents } = await G.get(`/documents/${type}/${id}`); const T = today();
      m.$('[data-list]').innerHTML = G.table(documents, [{ k: 'document_type', l: 'Type' }, { k: 'document_number', l: 'Number' }, { l: 'Expiry', f: (d) => `${fdate(d.expiry_date)} ${d.expiry_date && d.expiry_date < T ? statusBadge('EXPIRED') : d.expiry_date && d.expiry_date <= addDays(T, 30) ? statusBadge('EXPIRING SOON') : ''}` }, { l: 'File', f: (d) => (d.file_name ? `<a href="#" data-file="${d.id}">${esc(d.file_name)}</a>` : '—') }, { l: '', f: (d) => (can('fleet.documents') ? `<button class="btn sm d" data-rmd="${d.id}">✕</button>` : '') }], { empty: 'No documents' });
    };
    const m = G.modal({ title: 'Documents', size: 'lg', body: `<div data-list></div>${can('fleet.documents') ? `<h3 style="margin-top:14px">Upload</h3><form class="grid g3" data-f>${[{ name: 'document_type', label: 'Type', type: 'select', options: type === 'vehicle' ? ['RC', 'INSURANCE', 'PERMIT', 'FITNESS', 'PUC', 'TAX', 'OTHER'] : ['LICENSE', 'AADHAAR', 'PAN', 'BADGE', 'OTHER'] }, { name: 'document_number', label: 'Number' }, { name: 'expiry_date', label: 'Expiry', type: 'date' }].map(G.field).join('')}<label class="f">File<input type="file" data-file-in/></label></form><button class="btn p" data-up style="margin-top:8px">Upload</button>` : ''}`, onMount: (m2) => draw(m2) });
    G.on(m.el, 'click', '[data-rmd]', async (b) => { await G.del(`/documents/${b.dataset.rmd}`); draw(m); done && done(); });
    G.on(m.el, 'click', '[data-file]', async (b, e) => { e.preventDefault(); await G.download(`/documents/${b.dataset.file}/file`, b.textContent); });
    const up = m.$('[data-up]'); if (up) up.onclick = async () => { const v = G.formVal(m.$('[data-f]')); const f = m.$('[data-file-in]').files[0]; if (f) { v.file_name = f.name; v.file_data = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); }); } await G.post(`/documents/${type}/${id}`, v).catch(G.err); G.toast('Uploaded', 'ok'); draw(m); done && done(); };
  };

  // ---------- Coaches ----------
  async function coaches(el) {
    const { coaches: C } = await G.get('/coaches');
    el.innerHTML = `<div class="row between" style="margin-bottom:8px"><b>${C.length} coach layouts</b>${can('fleet.modify') ? '<button class="btn sm p" data-new>+ New coach</button>' : ''}</div><div class="grid g3">${C.map((c) => `<div class="card"><div class="row between"><b>${esc(c.name)}</b><span class="badge">${c.capacity} seats</span></div><div class="small muted">${esc(c.bus_type)} · ${esc(c.pattern)} · ${c.layout.decks.length} deck(s)</div><div class="small" style="margin:6px 0">${(c.amenities || []).map((a) => `<span class="badge">${esc(a)}</span>`).join(' ')}</div><div class="small muted">${c.vehicles} buses · ${c.routes} routes</div><div class="row" style="margin-top:8px"><button class="btn sm" data-view="${c.id}">Layout</button>${can('fleet.modify') ? `<button class="btn sm" data-ed="${c.id}">Edit</button>` : ''}${can('fleet.delete') ? `<button class="btn sm d" data-rm="${c.id}">Delete</button>` : ''}</div></div>`).join('')}</div>`;
    const reload = () => coaches(el);
    G.on(el, 'click', '[data-view]', (b) => { const c = C.find((x) => x.id == b.dataset.view); const map = { decks: c.layout.decks.map((d) => ({ ...d, seats: d.seats.map((s) => ({ ...s, status: 'available', fare: '' })) })) }; G.modal({ title: esc(c.name), size: 'lg', body: G.renderSeats(map) }); });
    const form = (c = {}) => [{ name: 'name', label: 'Name', required: true, value: c.name }, { name: 'bus_type', label: 'Bus type', value: c.bus_type }, { name: 'kind', label: 'Layout', type: 'select', options: [['seater_sleeper', 'Seater + Sleeper'], ['sleeper', 'All sleeper'], ['seater', 'All seater']] }, { name: 'pattern', label: 'Pattern', type: 'select', options: ['2+1', '2+2', '1+1'], value: c.pattern }, { name: 'amenities', label: 'Amenities (comma separated)', value: (c.amenities || []).join(', '), full: 1 }];
    const norm = (v) => ({ ...v, amenities: v.amenities.split(',').map((s) => s.trim()).filter(Boolean) });
    const nb = $('[data-new]', el); if (nb) nb.onclick = async () => { const v = await G.prompt('New coach', form()); if (v) { await G.post('/coaches', norm(v)); reload(); } };
    G.on(el, 'click', '[data-ed]', async (b) => { const c = C.find((x) => x.id == b.dataset.ed); const v = await G.prompt('Edit coach (changing layout regenerates seats)', form(c)); if (v) { const n = norm(v); if (n.kind === 'seater_sleeper' && n.pattern === c.pattern) delete n.kind; await G.put(`/coaches/${c.id}`, n); reload(); } });
    G.on(el, 'click', '[data-rm]', async (b) => { if (await G.confirm('Delete coach layout?', { danger: 1 })) { await G.del(`/coaches/${b.dataset.rm}`); reload(); } });
  }

  // ---------- Staff ----------
  const ROLES = ['driver', 'helper', 'cleaner', 'conductor', 'pickup_driver', 'manager', 'office'];
  async function staff(el) {
    const q = G.query(); const role = q.role || 'all';
    const { staff: S } = await G.get(`/staff?${G.qs({ role, q: q.q, status: q.status })}`);
    el.innerHTML = `<div class="row between" style="margin-bottom:10px">${G.pills([['all', 'All'], ...ROLES.slice(0, 4).map((r) => [r, r])], role, 'data-role')}<div class="row"><input data-q placeholder="Search name / phone" value="${esc(q.q || '')}"/>${can('staff.modify') ? '<button class="btn sm p" data-new>+ Add staff</button>' : ''}</div></div>
      ${G.table(S, [{ l: 'Name', f: (s) => `<b>${esc(s.name)}</b><div class="small muted">${esc(s.phone)}</div>` }, { l: 'Role', f: (s) => esc(s.role) }, { l: 'Salary', f: (s) => `${inr(s.salary_amount)} <span class="small muted">${esc(s.salary_type)}</span>` }, { k: 'trips_this_month', l: 'Duties (month)', n: 1 }, { l: 'Advance due', n: 1, f: (s) => (s.advance_outstanding ? inr(s.advance_outstanding) : '—') }, { l: 'Licence', f: (s) => (s.license_state ? `${fdate(s.license_expiry)} ${s.license_state !== 'ok' ? statusBadge(s.license_state) : ''}` : '—') }, { l: 'Status', f: (s) => statusBadge(s.status) }, { l: '', f: (s) => `<button class="btn sm" data-led="${s.id}">Ledger</button> <button class="btn sm" data-docs="${s.id}">Docs</button> ${can('staff.modify') ? `<button class="btn sm" data-ed="${s.id}">Edit</button>` : ''} ${can('staff.delete') && s.status === 'active' ? `<button class="btn sm d" data-rm="${s.id}">Deactivate</button>` : ''}` }])}`;
    const reload = () => staff(el);
    G.on(el, 'click', '[data-role]', (b) => (location.hash = `#/fleet/staff?${G.qs({ role: b.dataset.role, q: $('[data-q]', el).value })}`));
    $('[data-q]', el).onchange = (e) => (location.hash = `#/fleet/staff?${G.qs({ role, q: e.target.value })}`);
    const form = (s = {}) => [{ name: 'name', label: 'Name', required: true, value: s.name }, { name: 'phone', label: 'Mobile (10 digits)', required: true, value: s.phone }, { name: 'role', label: 'Role', type: 'select', options: ROLES, value: s.role }, { name: 'salary_type', label: 'Salary type', type: 'select', options: [['monthly', 'Monthly'], ['per_trip', 'Per trip']], value: s.salary_type }, { name: 'salary_amount', label: 'Salary amount', type: 'number', value: s.salary_amount }, { name: 'license_number', label: 'Licence no.', value: s.license_number }, { name: 'license_expiry', label: 'Licence expiry', type: 'date', value: s.license_expiry }, { name: 'aadhaar', label: 'Aadhaar (12 digits)', value: s.aadhaar }, { name: 'pan', label: 'PAN', value: s.pan }, { name: 'emergency_contact', label: 'Emergency contact', value: s.emergency_contact }];
    const nb = $('[data-new]', el); if (nb) nb.onclick = async () => { const v = await G.prompt('Add staff', form()); if (v) { await G.post('/staff', v); G.toast('Staff added', 'ok'); reload(); } };
    G.on(el, 'click', '[data-ed]', async (b) => { const s = S.find((x) => x.id == b.dataset.ed); const v = await G.prompt('Edit staff', form(s)); if (v) { await G.put(`/staff/${s.id}`, v); reload(); } });
    G.on(el, 'click', '[data-rm]', async (b) => { if (await G.confirm('Deactivate this staff member?', { danger: 1 })) { await G.del(`/staff/${b.dataset.rm}`); reload(); } });
    G.on(el, 'click', '[data-docs]', (b) => G.docsModal('staff', b.dataset.docs));
    G.on(el, 'click', '[data-led]', async (b) => { const L = await G.get(`/staff/${b.dataset.led}/ledger`); G.modal({ title: `Ledger · ${esc(L.staff_name)}`, size: 'lg', body: `${G.kpis([['Earned', inr(L.total_credits)], ['Paid / advanced', inr(L.total_debits)], ['Balance', inr(L.balance)]])}<div style="margin-top:10px">${G.table(L.entries.slice().reverse(), [{ l: 'Date', f: (r) => fdate(r.date) }, { k: 'kind', l: 'Type' }, { k: 'note', l: 'Note' }, { l: 'Credit', n: 1, f: (r) => (r.credit ? inr(r.credit) : '') }, { l: 'Debit', n: 1, f: (r) => (r.debit ? inr(r.debit) : '') }, { l: 'Balance', n: 1, f: (r) => inr(r.balance) }])}</div>` }); });
  }

  // ---------- Attendance ----------
  async function attendance(el) {
    const q = G.query(); const from = q.from || addDays(today(), -6), to = q.to || today();
    const d = await G.get(`/attendance?${G.qs({ from, to })}`);
    const payroll = can('staff.payroll');
    el.innerHTML = `<div class="row between" style="margin-bottom:10px"><div class="row">${G.range(from, to)}<button class="btn sm" data-go>Apply</button></div>${payroll ? '<div class="row"><button class="btn sm" data-gen>Generate from trips</button><button class="btn sm" data-add>+ Manual entry</button><button class="btn sm p" data-appr>Approve all drafts</button></div>' : ''}</div>
      <div class="tw"><table class="t"><thead><tr><th>Staff</th>${d.dates.map((x) => `<th>${x.slice(8)}</th>`).join('')}<th class="n">Present</th><th class="n">Amount</th><th>Drafts</th></tr></thead><tbody>${d.staff.map((s) => `<tr><td><b>${esc(s.name)}</b><div class="small muted">${esc(s.role)}</div></td>${d.dates.map((x) => { const c = s.days[x]; return `<td title="${c ? esc(`${c.status} · ${c.state}${c.service ? ` · ${c.service}` : ''} · ₹${c.amount}`) : ''}">${c ? `<span class="badge ${c.status === 'present' ? (c.state === 'approved' ? 'ok' : 'warn') : 'bad'}" ${payroll ? `data-cell="${c.id}"` : ''} style="cursor:pointer">${c.status === 'present' ? 'P' : c.status === 'leave' ? 'L' : 'A'}</span>` : '<span class="muted">·</span>'}</td>`; }).join('')}<td class="n">${s.present}</td><td class="n">${inr(s.amount)}</td><td>${s.draft ? `<span class="badge warn">${s.draft}</span>` : ''}</td></tr>`).join('') || `<tr><td colspan="${d.dates.length + 4}" class="empty">No attendance — generate it from trip crew</td></tr>`}</tbody></table></div>
      <p class="small muted">P = present · A = absent · L = leave. Amber = draft, green = approved. Click a cell to edit.</p>`;
    const reload = () => attendance(el);
    $('[data-go]', el).onclick = () => (location.hash = `#/fleet/attendance?${G.qs({ from: $('[data-from]', el).value, to: $('[data-to]', el).value })}`);
    const act = (s, fn) => { const b = $(s, el); if (b) b.onclick = () => fn().catch(G.err); };
    act('[data-gen]', async () => { const r = await G.post('/attendance/generate', { from, to }); G.toast(`${r.generated} entries generated`, 'ok'); reload(); });
    act('[data-appr]', async () => { const r = await G.post('/attendance/approve', { from, to }); G.toast(`${r.approved} entries approved`, 'ok'); reload(); });
    act('[data-add]', async () => { const { staff: S } = await G.get('/staff'); const v = await G.prompt('Manual attendance', [{ name: 'staff_id', label: 'Staff', type: 'select', options: S.map((s) => [s.id, `${s.name} (${s.role})`]) }, { name: 'date', label: 'Date', type: 'date', value: today() }, { name: 'status', label: 'Status', type: 'select', options: ['present', 'absent', 'leave'] }, { name: 'amount', label: 'Amount', type: 'number', value: 0 }]); if (v) { await G.post('/attendance', v); reload(); } });
    G.on(el, 'click', '[data-cell]', async (b) => { const v = await G.prompt('Edit attendance', [{ name: 'status', label: 'Status', type: 'select', options: ['present', 'absent', 'leave'] }, { name: 'amount', label: 'Amount', type: 'number' }, { name: 'state', label: 'State', type: 'select', options: ['draft', 'approved'] }]); if (v) { if (v.amount == null) delete v.amount; await G.put(`/attendance/${b.dataset.cell}`, v); reload(); } });
  }

  // ---------- Payouts ----------
  async function payouts(el) {
    const st = G.query().status || '';
    const [sum, { payouts: P }] = await Promise.all([G.get('/payouts/summary'), G.get(`/payouts${st ? `?status=${st}` : ''}`)]);
    el.innerHTML = `${G.kpis([['Paid this month', inr(sum.total_paid_this_month)], ['Pending approval', inr(sum.total_pending_approval)], ['Approved, unpaid', inr(sum.total_approved_unpaid)], ['Payouts this month', sum.payouts_count_this_month]])}
      <div class="row between" style="margin:14px 0 8px">${G.pills([['', 'All'], ['draft', 'Draft'], ['approved', 'Approved'], ['paid', 'Paid']], st, 'data-st')}<button class="btn sm p" data-gen>Generate payouts</button></div>
      ${G.table(P, [{ k: 'payout_no', l: 'Payout' }, { l: 'Staff', f: (r) => `${esc(r.staff_name)} <span class="small muted">${esc(r.staff_role)}</span>` }, { l: 'Period', f: (r) => `${fdate(r.period_start)} – ${fdate(r.period_end)}` }, { k: 'days', l: 'Days', n: 1 }, { l: 'Gross', n: 1, f: (r) => inr(r.gross) }, { l: 'Adv. recovered', n: 1, f: (r) => inr(r.advances_recovered) }, { l: 'Reimb.', n: 1, f: (r) => inr(r.reimbursements) }, { l: 'Net', n: 1, f: (r) => `<b>${inr(r.net)}</b>` }, { l: 'Status', f: (r) => statusBadge(r.status) }, { l: '', f: (r) => (r.status === 'draft' ? `<button class="btn sm" data-edp="${r.id}">Adjust</button> <button class="btn sm p" data-ap="${r.id}">Approve</button> <button class="btn sm d" data-rmp="${r.id}">✕</button>` : r.status === 'approved' ? `<button class="btn sm p" data-pay="${r.id}">Mark paid</button>` : esc(r.reference || r.payment_mode || '')) }], { empty: 'No payouts' })}`;
    const reload = () => payouts(el);
    G.on(el, 'click', '[data-st]', (b) => (location.hash = `#/fleet/payouts?status=${b.dataset.st}`));
    G.on(el, 'click', '[data-ap]', async (b) => { await G.post(`/payouts/${b.dataset.ap}/approve`); reload(); });
    G.on(el, 'click', '[data-rmp]', async (b) => { if (await G.confirm('Delete draft payout?', { danger: 1 })) { await G.del(`/payouts/${b.dataset.rmp}`); reload(); } });
    G.on(el, 'click', '[data-edp]', async (b) => { const p = P.find((x) => x.id == b.dataset.edp); const v = await G.prompt('Adjust payout', [{ name: 'gross', label: 'Gross', type: 'number', value: p.gross }, { name: 'deductions', label: 'Other deductions', type: 'number', value: p.deductions }, { name: 'note', label: 'Note', full: 1 }]); if (v) { await G.put(`/payouts/${p.id}`, v); reload(); } });
    G.on(el, 'click', '[data-pay]', async (b) => { const v = await G.prompt('Record payment', [{ name: 'payment_mode', label: 'Mode', type: 'select', options: ['bank', 'upi', 'cash'] }, { name: 'reference', label: 'Reference / UTR' }]); if (v) { await G.post(`/payouts/${b.dataset.pay}/pay`, v); G.toast('Payout marked paid', 'ok'); reload(); } });
    $('[data-gen]', el).onclick = async () => {
      const d = new Date(); const from = `${today().slice(0, 7)}-01`; const to = today();
      const m = G.modal({ title: 'Generate payouts', size: 'lg', body: `<div class="row">${G.range(from, to)}<button class="btn sm" data-prev>Preview</button><label class="chk"><input type="checkbox" data-ded checked/> Deduct outstanding advances</label></div><div data-pv style="margin-top:10px"></div>`, foot: '<button class="btn p" data-mk>Create drafts</button>' });
      let rows = [];
      const prev = async () => { const r = await G.get(`/payouts/preview?${G.qs({ from: m.$('[data-from]').value, to: m.$('[data-to]').value })}`); rows = r.rows; m.$('[data-pv]').innerHTML = G.table(rows, [{ l: '', f: (x) => `<input type="checkbox" data-sid="${x.staff_id}" checked/>` }, { k: 'name', l: 'Staff' }, { k: 'role', l: 'Role' }, { k: 'days', l: 'Days', n: 1 }, { l: 'Gross', n: 1, f: (x) => inr(x.gross) }, { l: 'Advances due', n: 1, f: (x) => inr(x.advances_outstanding) }, { l: 'Reimb.', n: 1, f: (x) => inr(x.reimbursements) }, { l: 'Prev. balance', n: 1, f: (x) => inr(x.prev_balance) }], { empty: 'Nothing to pay — approve attendance first' }); };
      m.$('[data-prev]').onclick = () => prev().catch(G.err); prev().catch(G.err);
      m.$('[data-mk]').onclick = async () => { const ids = m.$$('[data-sid]').filter((x) => x.checked).map((x) => Number(x.dataset.sid)); if (!ids.length) return G.toast('Select staff', 'bad'); const r = await G.post('/payouts/generate', { from: m.$('[data-from]').value, to: m.$('[data-to]').value, staff_ids: ids, deduct_advances: m.$('[data-ded]').checked }).catch(G.err); if (!r) return; G.toast(`${r.created} draft payouts created`, 'ok'); m.close(); reload(); };
      void d;
    };
  }

  // ---------- Advances ----------
  async function advances(el) {
    const { advances: A, summary } = await G.get('/advances');
    el.innerHTML = `${G.kpis([['Outstanding', inr(summary.total_outstanding)], ['Disbursed this month', inr(summary.total_disbursed_this_month)], ['Advances', A.length]])}
      <div class="row between" style="margin:14px 0 8px"><b>Advances & loans</b><button class="btn sm p" data-new>+ New advance</button></div>
      ${G.table(A, [{ l: 'Date', f: (r) => fdate(r.date_issued) }, { l: 'Staff', f: (r) => `${esc(r.staff_name)} <span class="small muted">${esc(r.staff_role)}</span>` }, { k: 'advance_type', l: 'Type' }, { l: 'Amount', n: 1, f: (r) => inr(r.amount) }, { l: 'Recovered', n: 1, f: (r) => inr(r.amount_recovered) }, { l: 'Balance', n: 1, f: (r) => `<b>${inr(r.balance)}</b>` }, { k: 'recovery_method', l: 'Recovery' }, { k: 'reason', l: 'Reason' }, { l: 'Status', f: (r) => statusBadge(r.status) }, { l: '', f: (r) => (r.status !== 'recovered' ? `<button class="btn sm" data-rec="${r.id}">Recover</button> <button class="btn sm d" data-rm="${r.id}">✕</button>` : '') }])}`;
    const reload = () => advances(el);
    $('[data-new]', el).onclick = async () => { const { staff: S } = await G.get('/staff'); const v = await G.prompt('New advance', [{ name: 'staff_id', label: 'Staff', type: 'select', options: S.map((s) => [s.id, `${s.name} (${s.role})`]) }, { name: 'amount', label: 'Amount', type: 'number', required: true }, { name: 'advance_type', label: 'Type', type: 'select', options: ['salary', 'trip', 'loan', 'emergency'] }, { name: 'payment_mode', label: 'Paid via', type: 'select', options: ['cash', 'upi', 'bank'] }, { name: 'recovery_method', label: 'Recovery', type: 'select', options: [['one_time', 'One time from next payout'], ['installments', 'Installments']] }, { name: 'num_installments', label: 'Installments', type: 'number' }, { name: 'date_issued', label: 'Date', type: 'date', value: today() }, { name: 'reason', label: 'Reason', full: 1 }]); if (v) { await G.post('/advances', v); G.toast('Advance recorded', 'ok'); reload(); } };
    G.on(el, 'click', '[data-rec]', async (b) => { const a = A.find((x) => x.id == b.dataset.rec); const v = await G.prompt('Record recovery', [{ name: 'amount', label: `Amount (balance ${inr(a.balance)})`, type: 'number', value: a.balance, required: true }]); if (v) { await G.post(`/advances/${a.id}/recover`, v); reload(); } });
    G.on(el, 'click', '[data-rm]', async (b) => { if (await G.confirm('Delete advance?', { danger: 1 })) { await G.del(`/advances/${b.dataset.rm}`); reload(); } });
  }

  // ---------- Reimbursements ----------
  async function reimbursements(el) {
    const { reimbursements: R, summary } = await G.get('/reimbursements');
    el.innerHTML = `${G.kpis([['Pending', inr(summary.total_pending)], ['Pending claims', summary.pending_count]])}
      <div class="row between" style="margin:14px 0 8px"><b>Expense claims</b><button class="btn sm p" data-new>+ New claim</button></div>
      ${G.table(R, [{ l: 'Date', f: (r) => fdate(r.date) }, { k: 'staff_name', l: 'Staff' }, { k: 'category', l: 'Category' }, { k: 'description', l: 'Description' }, { l: 'Amount', n: 1, f: (r) => inr(r.amount) }, { l: 'Status', f: (r) => statusBadge(r.status) }, { l: '', f: (r) => (r.status === 'pending' ? `<button class="btn sm p" data-act="${r.id}|approve">Approve</button> <button class="btn sm d" data-act="${r.id}|reject">Reject</button>` : r.status === 'approved' ? `<button class="btn sm" data-act="${r.id}|pay">Pay now</button>` : '') }])}`;
    $('[data-new]', el).onclick = async () => { const { staff: S } = await G.get('/staff'); const v = await G.prompt('New claim', [{ name: 'staff_id', label: 'Staff', type: 'select', options: S.map((s) => [s.id, s.name]) }, { name: 'category', label: 'Category', type: 'select', options: ['Diesel', 'Tolls', 'Food', 'Repairs', 'Parking', 'Other'] }, { name: 'amount', label: 'Amount', type: 'number', required: true }, { name: 'date', label: 'Date', type: 'date', value: today() }, { name: 'description', label: 'Description', full: 1 }]); if (v) { await G.post('/reimbursements', v); reimbursements(el); } };
    G.on(el, 'click', '[data-act]', async (b) => { const [id, a] = b.dataset.act.split('|'); await G.post(`/reimbursements/${id}/${a}`); reimbursements(el); });
  }
})();
