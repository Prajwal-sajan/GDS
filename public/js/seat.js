// Seat layout renderer, booking flow and booking detail (cancel / shift / modify).
G.renderSeats = function (map, selected = []) {
  const legend = `<div class="legend"><span><i></i>Available</span><span><i style="background:#2563eb;border-color:#2563eb"></i>Selected</span><span><i style="background:#dbeafe;border-color:#60a5fa"></i>Booked</span><span><i style="background:#fce7f3;border-color:#f472b6"></i>Ladies</span><span><i style="background:#fef3c7;border-color:#f59e0b"></i>Hold</span><span><i style="background:#e5e7eb"></i>Blocked</span><span><i style="background:repeating-linear-gradient(45deg,#fff,#fff 3px,#eef2ff 3px,#eef2ff 6px)"></i>Other leg</span><span><i style="background:#fee2e2;border-color:#f87171"></i>No-show</span></div>`;
  const decks = map.decks.map((d) => {
    const cols = d.cols; const rows = d.rows;
    const cells = d.seats.map((s) => {
      const cls = ['seat', s.type, selected.includes(s.code) ? 'sel' : s.status].join(' ');
      const tip = s.booking ? `${s.booking.name} · ${s.booking.pnr} · ${s.booking.from}→${s.booking.to} · ${s.booking.boarding}` : s.block ? `Blocked: ${s.block.reason}` : `₹${s.fare}`;
      return `<div class="${cls}" data-seat="${esc(s.code)}" title="${esc(tip)}" style="grid-row:${s.row + 1}/span ${s.h};grid-column:${s.col + 1}/span ${s.w}"><b>${esc(s.code)}</b><span class="fr">${s.booking ? esc((s.booking.name || '').split(' ')[0]) : s.status === 'blocked' ? 'blocked' : '₹' + s.fare}</span></div>`;
    }).join('');
    return `<div class="deck"><div class="dh"><span>${d.deck}</span>${d.deck === 'LOWER' ? '<span>🛞 Driver</span>' : ''}</div><div class="dg" style="grid-template-columns:repeat(${cols},48px);grid-template-rows:repeat(${rows},34px)">${cells}</div></div>`;
  }).join('');
  return `<div class="col" style="gap:10px">${legend}<div class="decks">${decks}</div></div>`;
};

// Full booking console for one schedule (used by Trips "Book" and Schedules).
G.bookingConsole = async function (scheduleId, onDone) {
  const sch = await G.get(`/schedules/${scheduleId}`);
  const cities = sch.route.via_cities;
  let fromC = cities[0].city_id, toC = cities[cities.length - 1].city_id;
  let selected = []; let map; let blockMode = false;
  const m = G.modal({ title: `${esc(sch.service_number)} · ${esc(sch.service_name)} · ${fdate(sch.travel_date)} ${t12(sch.departure_time)}`, size: 'xl', body: `
    <div class="row" style="margin-bottom:10px">
      <label class="f">From<select data-fc>${cities.slice(0, -1).map((c) => `<option value="${c.city_id}">${esc(c.name)}</option>`).join('')}</select></label>
      <label class="f">To<select data-tc>${cities.slice(1).map((c) => `<option value="${c.city_id}" ${c.city_id === toC ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <span class="sp" style="flex:1"></span>
      ${can('bookings.block_seats') ? '<label class="chk"><input type="checkbox" data-bm/> Block / unblock mode</label>' : ''}
      <span class="muted" data-cnt></span>
    </div>
    <div style="display:grid;grid-template-columns:auto 1fr;gap:16px"><div data-map></div><div data-side></div></div>` });
  const loadMap = async () => { map = await G.get(`/schedules/${scheduleId}/seat-layout?from_city_id=${fromC}&to_city_id=${toC}`); draw(); };
  const draw = () => {
    m.$('[data-map]').innerHTML = G.renderSeats(map, selected);
    const all = map.decks.flatMap((d) => d.seats); const av = all.filter((s) => s.status === 'available').length;
    m.$('[data-cnt]').textContent = `${av} available · ${all.length - av} filled/blocked`;
    side();
  };
  const stagesFor = (type, city) => sch.route.stages.filter((s) => s.type === type && s.city_id == city);
  const side = async () => {
    const el = m.$('[data-side]');
    if (blockMode) { el.innerHTML = `<div class="card"><h3>Block seats</h3><p class="muted small">Selected: ${selected.join(', ') || '—'}</p><div class="grid g2">${G.field({ name: 'reason', label: 'Reason', value: 'Reserved' })}${G.field({ name: 'gender', label: 'Gender quota', type: 'select', options: [['', 'Any'], ['F', 'Ladies only'], ['M', 'Gents only']] })}</div><div class="row" style="margin-top:10px"><button class="btn p" data-blk>Block</button><button class="btn" data-ublk>Unblock</button><button class="btn" data-follow>Follow route</button></div></div>`; return; }
    if (!selected.length) { el.innerHTML = `<div class="card"><h3>Select seats</h3><p class="muted">Click available seats to book. Click a booked seat to open its booking.</p></div>`; return; }
    const seats = map.decks.flatMap((d) => d.seats).filter((s) => selected.includes(s.code));
    const coupons = await G.get('/coupons/available').catch(() => []);
    el.innerHTML = `<form class="col" data-bf style="gap:10px">
      <div class="card"><h3>Passengers</h3>${seats.map((s, i) => `<div class="row" style="margin-bottom:6px"><span class="badge b" style="min-width:42px">${s.code}</span><input name="name_${i}" placeholder="Name" style="flex:1" ${i === 0 ? 'data-first' : ''}/><input name="age_${i}" type="number" placeholder="Age" style="width:64px"/><select name="gender_${i}"><option value="M">Male</option><option value="F">Female</option></select><input name="fare_${i}" type="number" value="${s.fare}" style="width:84px" title="Fare"/></div>`).join('')}</div>
      <div class="card grid g2"><label class="f">Mobile<input name="phone" maxlength="10" placeholder="10-digit mobile"/></label><label class="f">Email<input name="email" type="email"/></label>
        <label class="f">Boarding point<select name="bp">${stagesFor('pickup', fromC).map((s) => `<option value="${s.id}">${t12(s.time)} · ${esc(s.name)}</option>`).join('')}</select></label>
        <label class="f">Dropping point<select name="dp">${stagesFor('drop', toC).map((s) => `<option value="${s.id}">${t12(s.time)} · ${esc(s.name)}</option>`).join('')}</select></label></div>
      <div class="card grid g2">
        ${G.user.role !== 'agent' ? G.field({ name: 'source', label: 'Booking source', type: 'select', options: [['branch', 'Branch / Counter'], ['phone', 'Phone booking'], ['website', 'Website'], ['agent', 'Agent']] }) : ''}
        <label class="f">Agent (if agent booking)<input name="agent_phone" placeholder="Agent phone"/></label>
        <label class="f">Coupon<select name="coupon"><option value="">— none —</option>${coupons.map((c) => `<option>${esc(c.code)}</option>`).join('')}</select></label>
        <label class="f">Miles to redeem<input name="miles_used" type="number" value="0"/></label>
        ${G.field({ name: 'payment_mode', label: 'Payment', type: 'select', options: [['paid', 'Paid now'], ['unpaid', 'Hold (pay later)'], ['settle_later', 'Settle later (agent)']] })}
        ${G.field({ name: 'payment_method', label: 'Method', type: 'select', options: [['upi', 'UPI'], ['cash', 'Cash'], ['card', 'Card'], ['online', 'Online']] })}
        <label class="f" style="grid-column:1/-1">Remarks<input name="remarks"/></label>
      </div>
      <div class="card" data-q><span class="muted">Calculating…</span></div>
      <div class="row end"><button type="button" class="btn" data-clear>Clear</button><button type="button" class="btn p" data-book>Book ${seats.length} seat(s)</button></div></form>`;
    const f = $('[data-bf]', el);
    const quote = async () => { const v = G.formVal(f); try { const q = await G.post('/bookings/quote', { schedule_id: scheduleId, from_city_id: fromC, to_city_id: toC, seats: selected, fares: seats.map((_, i) => v[`fare_${i}`]), coupon: v.coupon || null, source: v.source || 'agent', agent_phone: v.agent_phone || null, miles_used: v.miles_used }); $('[data-q]', el).innerHTML = `<h3>Fare summary</h3><div class="pnl-row"><span>Base fare</span><b>${inr(q.gross, 2)}</b></div><div class="pnl-row"><span>Discount</span><span class="pos">-${inr(q.discount, 2)}</span></div>${q.miles_discount ? `<div class="pnl-row"><span>Miles</span><span class="pos">-${inr(q.miles_discount, 2)}</span></div>` : ''}<div class="pnl-row"><span>GST (5%)</span><span>${inr(q.gst, 2)}</span></div><div class="pnl-row"><span class="b">Total</span><b>${inr(q.total, 2)}</b></div>${q.commission ? `<div class="pnl-row muted"><span>Commission</span><span>${inr(q.commission, 2)}</span></div>` : ''}`; } catch (e) { $('[data-q]', el).innerHTML = `<span class="neg">${esc(e.message)}</span>`; } };
    f.addEventListener('change', quote); quote();
    $('[data-clear]', el).onclick = () => { selected = []; draw(); };
    $('[data-book]', el).onclick = async () => {
      const v = G.formVal(f);
      try {
        const payload = { schedule_id: scheduleId, from_city_id: fromC, to_city_id: toC, boarding_stage_id: Number(v.bp), dropping_stage_id: Number(v.dp), source: v.source || 'agent', agent_phone: v.agent_phone || null, payment_mode: v.payment_mode, payment_method: v.payment_method, coupon: v.coupon || null, miles_used: v.miles_used || 0, remarks: v.remarks, contact: { name: v.name_0, phone: v.phone, email: v.email }, passengers: seats.map((s, i) => ({ seat: s.code, name: v[`name_${i}`], age: v[`age_${i}`], gender: v[`gender_${i}`], fare: v[`fare_${i}`] })) };
        let b; try { b = await G.post('/bookings', payload); } catch (err) { if (err.status === 409 && /seat rules|couple booking/.test(err.message) && can('bookings.block_seats') && (await G.confirm(`${esc(err.message)}.<br>Override the route seat rule for this booking?`, { ok: 'Override & book' }))) b = await G.post('/bookings', { ...payload, override_rules: true }); else throw err; }
        G.toast(`Booked · PNR ${b.pnr}`, 'ok'); selected = []; await loadMap(); onDone && onDone();
      } catch (e) { G.err(e); }
    };
  };
  m.$('[data-fc]').onchange = (e) => { fromC = Number(e.target.value); selected = []; loadMap(); };
  m.$('[data-tc]').onchange = (e) => { toC = Number(e.target.value); selected = []; loadMap(); };
  const bm = m.$('[data-bm]'); if (bm) bm.onchange = () => { blockMode = bm.checked; selected = []; draw(); };
  G.on(m.el, 'click', '[data-seat]', (t) => {
    const s = map.decks.flatMap((d) => d.seats).find((x) => x.code === t.dataset.seat);
    if (!blockMode && s.booking && s.status !== 'other_leg') return G.bookingModal(s.booking.pnr, loadMap);
    if (!blockMode && s.status !== 'available' && s.status !== 'other_leg') return G.toast(s.block ? `Blocked — ${s.block.reason}` : 'Seat not available');
    selected = selected.includes(s.code) ? selected.filter((x) => x !== s.code) : [...selected, s.code]; draw();
  });
  G.on(m.el, 'click', '[data-blk],[data-ublk],[data-follow]', async (t) => {
    if (!selected.length) return G.toast('Select seats first', 'bad');
    const v = G.formVal(m.$('[data-side]'));
    const action = t.hasAttribute('data-blk') ? 'block' : t.hasAttribute('data-ublk') ? 'unblock' : 'follow_route';
    await G.post(`/schedules/${scheduleId}/blocks`, { seats: selected, reason: v.reason, gender: v.gender || null, action }); G.toast('Seats updated', 'ok'); selected = []; await loadMap();
  });
  await loadMap();
};

// Booking detail with cancel / shift / modify / payment / comments.
G.bookingModal = async function (pnr, onChange) {
  const b = await G.get(`/bookings/${pnr}`);
  const refresh = () => { m.close(); onChange && onChange(); G.bookingModal(pnr, onChange); };
  const pax = b.passengers.map((p) => `<tr><td><label class="chk"><input type="checkbox" data-ps value="${esc(p.seat)}" ${p.status === 'cancelled' ? 'disabled' : ''}/> ${esc(p.seat)}</label></td><td>${esc(p.name)}</td><td>${esc(p.gender)}/${esc(p.age ?? '')}</td><td class="n">${inr(p.fare)}</td><td>${statusBadge(p.status)}</td></tr>`).join('');
  const m = G.modal({ title: `Booking ${esc(b.pnr)} ${statusBadge(b.status)}`, size: 'lg', body: `
    <div class="grid g3" style="margin-bottom:12px">
      <div class="kpi"><div class="l">Journey</div><div class="b">${esc(b.service_number)} · ${fdate(b.travel_date)}</div><div class="s">${esc(b.from)} → ${esc(b.to)}</div></div>
      <div class="kpi"><div class="l">Contact</div><div class="b">${esc(b.contact.name)}</div><div class="s">${esc(b.contact.phone)} ${b.contact.email ? '· ' + esc(b.contact.email) : ''}</div></div>
      <div class="kpi"><div class="l">Payment</div><div class="b">${inr(b.fare.total, 2)} ${statusBadge(b.payment)}</div><div class="s">${esc(b.source)} · ${esc(b.payment_method || '')} · Ticket ${esc(b.ticket_number)}</div></div>
    </div>
    <div class="grid g2" style="margin-bottom:12px"><div class="card"><div class="muted small">Boarding</div><b>${t12(b.boarding?.time)} · ${esc(b.boarding?.name)}</b></div><div class="card"><div class="muted small">Dropping</div><b>${t12(b.dropping?.time)} · ${esc(b.dropping?.name)}</b></div></div>
    <table class="t"><thead><tr><th>Seat</th><th>Name</th><th>Gender/Age</th><th class="n">Fare</th><th>Status</th></tr></thead><tbody>${pax}</tbody></table>
    <div class="grid g2" style="margin-top:12px">
      <div class="card"><h3>Fare breakup</h3><div class="pnl-row"><span>Gross</span><span>${inr(b.fare.gross, 2)}</span></div><div class="pnl-row"><span>Discount ${b.coupon ? `(${esc(b.coupon)})` : ''}</span><span>-${inr(b.fare.discount, 2)}</span></div><div class="pnl-row"><span>GST</span><span>${inr(b.fare.gst, 2)}</span></div><div class="pnl-row"><b>Total</b><b>${inr(b.fare.total, 2)}</b></div><div class="pnl-row muted"><span>Commission</span><span>${inr(b.fare.commission, 2)}</span></div>
        ${(b.cancellations || []).map((c) => `<div class="pnl-row neg"><span>Cancelled ${esc(c.seats.join(','))} · ${fdt(c.at)} by ${esc(c.by)}</span><span>Refund ${inr(c.refund, 2)} (${c.refund_pct}%)</span></div>`).join('')}</div>
      <div class="card"><h3>Comments</h3><div class="col small">${(b.comments || []).map((c) => `<div><b>${esc(c.by)}</b> <span class="muted">${fdt(c.at)}</span><br/>${esc(c.text)}</div>`).join('') || '<span class="muted">No comments</span>'}</div><div class="row" style="margin-top:8px"><input data-cmt placeholder="Add comment" style="flex:1"/><button class="btn sm" data-addc>Add</button></div></div>
    </div>`,
    foot: `${b.status === 'hold' ? '<button class="btn" data-release>Release hold</button><button class="btn p" data-confirm>Confirm payment</button>' : ''}
      ${b.status === 'confirmed' && b.payment !== 'paid' && can('accounts.ledger') ? '<button class="btn" data-paid>Mark paid</button>' : ''}
      ${b.status === 'confirmed' && can('bookings.modify') ? '<button class="btn" data-edit>Edit details</button><button class="btn" data-shift>Shift</button>' : ''}
      ${b.status === 'confirmed' && can('bookings.cancel') ? '<button class="btn d" data-cancel>Cancel</button>' : ''}` });
  const on = (sel, fn) => { const el = m.$(sel); if (el) el.onclick = () => Promise.resolve(fn()).catch(G.err); };
  on('[data-addc]', async () => { await G.post(`/bookings/${pnr}/comments`, { text: m.$('[data-cmt]').value }); refresh(); });
  on('[data-release]', async () => { await G.post(`/bookings/${pnr}/release`, { reason: 'Released by operator' }); G.toast('Hold released', 'ok'); refresh(); });
  on('[data-confirm]', async () => { await G.post(`/bookings/${pnr}/confirm-payment`, { method: 'upi' }); G.toast('Payment confirmed', 'ok'); refresh(); });
  on('[data-paid]', async () => { await G.post(`/bookings/${pnr}/mark-paid`); refresh(); });
  on('[data-cancel]', async () => {
    const seats = m.$$('[data-ps]:checked').map((x) => x.value);
    const q = await G.get(`/bookings/${pnr}/refund-quote`);
    const v = await G.prompt(`Cancel ${seats.length ? seats.join(', ') : 'all seats'}`, [
      { name: 'by', label: 'Cancelled by', type: 'select', options: [['passenger', `Passenger (policy ${q.refund_pct}% refund, ${q.hours_before}h before)`], ['operator', 'Operator (100% refund)']] },
      { name: 'refund_pct', label: 'Override refund % (optional)', type: 'number' },
      { name: 'reason', label: 'Reason', full: true }, { name: 'notify', label: 'Notify passenger on WhatsApp', type: 'checkbox', value: true }], { ok: 'Cancel booking' });
    if (!v) return;
    const r = await G.post(`/bookings/${pnr}/cancel`, { seats, by: v.by, reason: v.reason, refund_pct: v.refund_pct, notify: v.notify });
    G.toast(`Cancelled · refund ${inr(r.refund, 2)}`, 'ok'); refresh();
  });
  on('[data-edit]', async () => {
    const v = await G.prompt('Edit booking', [{ name: 'name', label: 'Contact name', value: b.contact.name }, { name: 'phone', label: 'Mobile', value: b.contact.phone }, { name: 'email', label: 'Email', value: b.contact.email || '' }, ...b.passengers.map((p, i) => ({ name: `p_${i}`, label: `Seat ${p.seat} name`, value: p.name }))]);
    if (!v) return; await G.put(`/bookings/${pnr}`, { contact: { name: v.name, phone: v.phone, email: v.email }, passengers: b.passengers.map((p, i) => ({ seat: p.seat, name: v[`p_${i}`] })) }); G.toast('Updated', 'ok'); refresh();
  });
  on('[data-shift]', async () => {
    const list = (await G.get(`/schedules?from=${b.travel_date}&to=${addDays(b.travel_date, 7)}`)).schedules.filter((s) => s.status === 'active');
    const v = await G.prompt('Shift booking', [{ name: 'schedule_id', label: 'Target trip', type: 'select', full: true, value: b.schedule_id, options: list.map((s) => [s.id, `${fdate(s.travel_date)} · ${s.service_number} ${t12(s.departure_time)} · ${s.capacity - s.seats_booked} free`]) }, ...b.passengers.filter((p) => p.status !== 'cancelled').map((p) => ({ name: `seat_${p.seat}`, label: `New seat for ${p.seat}`, value: p.seat }))], { ok: 'Shift' });
    if (!v) return; const seat_map = {}; for (const p of b.passengers) if (v[`seat_${p.seat}`]) seat_map[p.seat] = v[`seat_${p.seat}`];
    await G.post(`/bookings/${pnr}/shift`, { schedule_id: Number(v.schedule_id), seat_map }); G.toast('Booking shifted', 'ok'); refresh();
  });
};

// Global PNR / phone search
G.searchModal = () => {
  const m = G.modal({ title: 'Search bookings', size: 'lg', body: `<input data-q placeholder="PNR, ticket, phone or name (min 3 chars)" style="width:100%" autofocus/><div data-r style="margin-top:10px"></div>` });
  let tm; m.$('[data-q]').oninput = (e) => { clearTimeout(tm); tm = setTimeout(async () => { const r = await G.get(`/bookings/search?q=${encodeURIComponent(e.target.value)}`); m.$('[data-r]').innerHTML = G.table(r.results, [{ k: 'pnr', l: 'PNR', f: (x) => `<a href="#" data-pnr="${esc(x.pnr)}">${esc(x.pnr)}</a>` }, { k: 'name', l: 'Name' }, { k: 'phone', l: 'Phone' }, { l: 'Travel', f: (x) => `${fdate(x.travel_date)} · ${esc(x.service)}` }, { l: 'Seats', f: (x) => esc(x.seats.join(', ')) }, { l: 'Status', f: (x) => statusBadge(x.status) }, { l: 'Amount', n: 1, f: (x) => inr(x.total) }], { empty: 'Type to search' }); }, 250); };
  G.on(m.el, 'click', '[data-pnr]', (t, e) => { e.preventDefault(); G.bookingModal(t.dataset.pnr); });
  setTimeout(() => m.$('[data-q]').focus(), 50);
};
