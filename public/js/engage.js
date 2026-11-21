// Engagement: Chats, Calls, Daily Ops (+ratings), CRM, Sarathi.
(function () {
  // ---------- Chats ----------
  G.screens.chats = async (el, p) => {
    const q = G.query(); const filter = q.f || 'all';
    const d = await G.get(`/chats?${G.qs({ q: q.q })}`);
    const list = d.conversations.filter((c) => filter === 'all' || (filter === 'unread' ? c.unread : filter === 'blocked' ? c.blocked : true));
    const cur = p.id ? decodeURIComponent(p.id) : null;
    el.innerHTML = `<div class="split"><div class="l"><div class="row" style="margin-bottom:8px"><input data-q placeholder="Search name / phone / PNR" value="${esc(q.q || '')}" style="flex:1"/></div>${G.pills([['all', 'All'], ['unread', `Unread (${d.unread_total})`], ['blocked', 'Blocked']], filter, 'data-f')}<div class="list" style="margin-top:8px">${list.map((c) => `<a class="it ${c.conversation_id === cur ? 'on' : ''}" href="#/chats/${encodeURIComponent(c.conversation_id)}" style="display:block"><div class="row between"><b>${esc(c.name)}</b><span class="small muted">${fdt(c.last_ts)}</span></div><div class="small muted">${esc(c.service)} · ${fdate(c.travel_date)} · seat ${esc(c.seat)}</div><div class="row between small"><span>${esc(c.last_message)}</span>${c.unread ? `<span class="badge b">${c.unread}</span>` : ''}${c.blocked ? '<span class="badge bad">blocked</span>' : ''}</div></a>`).join('') || '<div class="empty">No conversations</div>'}</div></div><div class="r" data-conv>${cur ? '' : '<div class="empty">Select a conversation</div>'}</div></div>`;
    G.on(el, 'click', '[data-f]', (b) => (location.hash = `#/chats?${G.qs({ f: b.dataset.f, q: q.q })}`));
    $('[data-q]', el).onchange = (e) => (location.hash = `#/chats?${G.qs({ f: filter, q: e.target.value })}`);
    if (cur) await G.chatPane($('[data-conv]', el), cur, list.find((c) => c.conversation_id === cur));
  };
  G.chatPane = async (el, cid, meta = {}) => {
    const d = await G.get(`/chats/${encodeURIComponent(cid)}`);
    el.innerHTML = `<div class="chat" style="height:calc(100vh - 140px)"><div class="row between" style="padding:8px 0"><div><b>${esc(meta.name || d.booking?.contact?.name || cid)}</b> <span class="muted">${esc(meta.phone || '')}</span> ${d.booking ? `<a href="#" data-pnr="${esc(d.booking.pnr)}">PNR ${esc(d.booking.ticket_number || d.booking.pnr)}</a>` : ''}</div><div class="row">${meta.phone && can('calls.make') ? `<button class="btn sm" data-call>📞 Call</button>` : ''}${can('chats.send') && !meta.blocked ? '<button class="btn sm d" data-block>Block</button>' : ''}</div></div>
      <div class="msgs" data-msgs>${d.messages.map((m) => `<div class="msg ${m.direction === 'out' ? 'out' : ''}">${esc(m.text)}<div class="ts">${esc(m.by || '')} · ${fdt(m.ts)} · ${esc(m.channel)}</div></div>`).join('') || '<div class="empty">No messages yet</div>'}</div>
      ${can('chats.send') && !meta.blocked ? `<div class="row" style="padding-top:8px">${d.templates?.length ? `<select data-tpl style="max-width:180px"><option value="">Templates…</option>${d.templates.map((t) => `<option>${esc(t)}</option>`).join('')}</select>` : ''}<input data-txt placeholder="Type a message" style="flex:1"/><select data-ch><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select><button class="btn p" data-send>Send</button></div>` : ''}</div>`;
    const box = $('[data-msgs]', el); box.scrollTop = box.scrollHeight;
    const send = async () => { const t = $('[data-txt]', el).value.trim(); if (!t) return; await G.post(`/chats/${encodeURIComponent(cid)}`, { text: t, channel: $('[data-ch]', el).value }); G.chatPane(el, cid, meta); };
    const s = $('[data-send]', el); if (s) { s.onclick = () => send().catch(G.err); $('[data-txt]', el).onkeydown = (e) => { if (e.key === 'Enter') send().catch(G.err); }; }
    const tp = $('[data-tpl]', el); if (tp) tp.onchange = () => { $('[data-txt]', el).value = tp.value; };
    const bl = $('[data-block]', el); if (bl) bl.onclick = async () => { const v = await G.prompt('Block sender', [{ name: 'reason', label: 'Reason', type: 'select', options: ['Spam', 'Abusive', 'Other'] }, { name: 'report', label: 'Also report to WhatsApp', type: 'checkbox' }], { ok: 'Block' }); if (v) { await G.post(`/chats/${encodeURIComponent(cid)}/block`, v).catch(G.err); G.toast('Blocked', 'ok'); } };
    const cb = $('[data-call]', el); if (cb) cb.onclick = () => G.callNow({ phone: meta.phone, name: meta.name, pnr: d.booking?.pnr });
    G.on(el, 'click', '[data-pnr]', (b, e) => { e.preventDefault(); G.bookingModal(b.dataset.pnr); });
  };

  // ---------- Calls ----------
  G.callNow = async ({ phone, name, pnr, kind = 'manual' }) => {
    const c = await G.post('/calls', { phone, name, pnr, kind });
    const t0 = Date.now();
    const m = G.modal({ title: `📞 Calling ${esc(name || phone)}`, body: `<p>Manual call log — dial this number from your phone. No telephony provider is connected.</p><p class="muted">${esc(phone)}</p>${G.field({ name: 'notes', label: 'Call notes', type: 'textarea', full: 1 })}`, foot: '<button class="btn" data-miss>No answer</button><button class="btn p" data-end>End call</button>' });
    const fin = (status) => G.put(`/calls/${c.id}`, { status, duration_s: status === 'answered' ? Math.round((Date.now() - t0) / 1000) : 0, notes: m.$('[name=notes]').value }).then(() => { m.close(); G.toast('Call logged', 'ok'); }).catch(G.err);
    m.$('[data-miss]').onclick = () => fin('missed'); m.$('[data-end]').onclick = () => fin('answered');
  };
  G.screens.calls = async (el) => {
    const q = G.query();
    const [d, sd] = await Promise.all([G.get(`/calls?${G.qs({ q: q.q, status: q.status })}`), G.get('/speed-dials').catch(() => ({ dials: [] }))]);
    el.innerHTML = `${G.kpis([['Calls', d.stats.total], ['Answered', d.stats.answered], ['Missed', d.stats.missed], ['Avg duration', `${Math.round(d.stats.avg_duration)}s`]])}
      <div class="row between" style="margin:14px 0 8px">${G.pills([['', 'All'], ['answered', 'Answered'], ['missed', 'Missed']], q.status || '', 'data-st')}<div class="row"><input data-q placeholder="Phone / PNR" value="${esc(q.q || '')}"/>${can('calls.make') ? '<button class="btn sm p" data-dial>📞 Dial</button>' : ''}</div></div>
      ${G.table(d.calls, [{ l: 'When', f: (c) => fdt(c.ts) }, { l: 'Dir', f: (c) => (c.direction === 'incoming' ? '⬇ In' : '⬆ Out') }, { l: 'Kind', f: (c) => esc(String(c.kind).replace(/_/g, ' ')) }, { l: 'Passenger', f: (c) => `${esc(c.passenger_name || '')} <span class="muted">${esc(c.phone)}</span>` }, { l: 'PNR', f: (c) => (c.pnr ? `<a href="#" data-pnr="${esc(c.pnr)}">${esc(c.pnr.slice(-6))}</a>` : '') }, { k: 'agent', l: 'Agent' }, { l: 'Duration', n: 1, f: (c) => (c.duration_s ? `${Math.floor(c.duration_s / 60)}m ${c.duration_s % 60}s` : '—') }, { l: 'Status', f: (c) => statusBadge(c.status) }, { l: 'Notes', f: (c) => esc(c.notes || '') }, { l: '', f: (c) => (can('calls.make') ? `<button class="btn sm" data-cb="${c.id}">Call back</button>` : '') }])}
      <h3 style="margin-top:16px">Speed dials</h3><p class="small muted">Crew can dial these short codes from the bus phone.</p>${G.table(sd.dials, [{ k: 'code', l: 'Code' }, { k: 'label', l: 'Label' }, { k: 'phone', l: 'Number' }, { l: 'Active', f: (r) => statusBadge(r.is_active ? 'active' : 'inactive') }])}`;
    G.on(el, 'click', '[data-st]', (b) => (location.hash = `#/calls?${G.qs({ status: b.dataset.st, q: q.q })}`));
    $('[data-q]', el).onchange = (e) => (location.hash = `#/calls?${G.qs({ status: q.status, q: e.target.value })}`);
    G.on(el, 'click', '[data-pnr]', (b, e) => { e.preventDefault(); G.bookingModal(b.dataset.pnr); });
    G.on(el, 'click', '[data-cb]', (b) => { const c = d.calls.find((x) => x.id == b.dataset.cb); return G.callNow({ phone: c.phone, name: c.passenger_name, pnr: c.pnr }); });
    const db2 = $('[data-dial]', el); if (db2) db2.onclick = async () => { const v = await G.prompt('Dial', [{ name: 'phone', label: 'Phone', required: true }, { name: 'name', label: 'Name' }, { name: 'pnr', label: 'PNR (optional)' }], { ok: 'Call' }); if (v) await G.callNow(v); };
  };

  // ---------- Daily Ops ----------
  G.screens.dailyops = async (el) => {
    const q = G.query(); const date = q.date || addDays(today(), -1);
    const d = await G.get(`/daily-ops?date=${date}`);
    const rt = await G.get('/ratings').catch(() => null);
    const sec = (title, html) => `<div class="card"><b>${title}</b><div style="margin-top:8px">${html}</div></div>`;
    el.innerHTML = `<div class="row" style="margin-bottom:12px"><input type="date" data-d value="${date}"/><span class="muted">Daily operations summary</span></div>
      ${G.kpis([['Trips', `${d.fleet.summary.running}/${d.fleet.summary.trips}`, `${d.fleet.summary.without_bus} without bus`], ['Seats sold', `${d.fleet.summary.seats}/${d.fleet.summary.capacity}`, pct((d.fleet.summary.seats / (d.fleet.summary.capacity || 1)) * 100)], ['Bookings made', num(d.earnings.bookings), `${d.earnings.seats} seats`], ['Earnings', inr(d.earnings.amount), `${d.earnings.cancellations} cancellations`], ['Rating', d.ratings.average ?? '—', `${d.ratings.count} ratings`]])}
      <div class="grid g2" style="margin-top:12px">
        ${sec('🚌 Fleet', G.autoTable(d.fleet.trips))}
        ${sec('💰 Bookings by channel', G.autoTable(d.earnings.by_source))}
        ${sec('📅 Next 7 days', G.autoTable(d.earnings.next7))}
        ${sec('🚫 No-shows', G.autoTable(d.passengers.no_shows_yesterday))}
        ${sec('⭐ Frequent travellers today', G.autoTable(d.passengers.frequent_today))}
        ${sec('📄 Vehicle documents due', G.autoTable(d.staff.vehicle_documents))}
        ${sec('🪪 Driving licences due', G.autoTable(d.staff.licences))}
        ${sec('👎 Low ratings', G.autoTable(d.ratings.low))}
      </div>
      ${rt ? `<h3 style="margin-top:16px">OTA ratings · avg ${rt.avg ?? '—'}★</h3>${G.table(rt.rows.slice(0, 100), [{ l: 'Rated', f: (r) => fdate(r.rated_at) }, { k: 'ota', l: 'OTA' }, { k: 'passenger_name', l: 'Passenger' }, { l: 'Trip', f: (r) => fdate(r.travel_at) }, { l: 'Rating', f: (r) => `<span style="color:#f59e0b">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>` }, { l: 'Review', f: (r) => esc(r.review || '') }, { l: 'Reply', f: (r) => (r.operator_reply ? `<span class="small">${esc(r.operator_reply)}</span>` : can('dailyops.ratings_reply') ? `<button class="btn sm" data-rep="${r.id}">Reply</button>` : '') }])}` : ''}`;
    $('[data-d]', el).onchange = (e) => (location.hash = `#/dailyops?date=${e.target.value}`);
    G.on(el, 'click', '[data-rep]', async (b) => { const v = await G.prompt('Reply to review', [{ name: 'reply', label: 'Reply', type: 'textarea', full: 1, required: true }], { ok: 'Post reply' }); if (v) { await G.post(`/ratings/${b.dataset.rep}/reply`, v); G.toast('Reply posted', 'ok'); G.screens.dailyops(el); } });
  };

  // ---------- CRM ----------
  G.screens.crm = async (el, p) => {
    if (p.id) return customer360(el, p.id);
    const q = G.query();
    const d = await G.get(`/crm/customers?${G.qs({ q: q.q, sort: q.sort })}`);
    el.innerHTML = `<div class="row between" style="margin-bottom:10px"><b>${num(d.total)} customers</b><input data-q placeholder="Search name / phone" value="${esc(q.q || '')}"/></div>
      ${G.table(d.rows, [{ l: 'Customer', f: (c) => `<a href="#/crm/${c.phone}"><b>${esc(c.name)}</b></a><div class="small muted">${esc(c.phone)}</div>` }, { k: 'trips', l: 'Trips', n: 1 }, { k: 'cancelled', l: 'Cancelled', n: 1 }, { l: 'Spend', n: 1, f: (c) => inr(c.spend) }, { l: 'Last travel', f: (c) => fdate(c.last_travel) }, { l: 'Tier', f: (c) => (c.tier ? `<span class="badge b">${esc(c.tier)}</span>` : '') }, { l: 'Miles', n: 1, f: (c) => num(c.miles) }])}`;
    $('[data-q]', el).onchange = (e) => (location.hash = `#/crm?q=${encodeURIComponent(e.target.value)}`);
  };
  async function customer360(el, phone) {
    const c = await G.get(`/crm/customers/${phone}`);
    const spend = c.bookings.filter((b) => b.status !== 'cancelled').reduce((a, b) => a + b.total, 0);
    el.innerHTML = `<div class="row between"><div><a href="#/crm">← Customers</a> &nbsp;<b style="font-size:16px">${esc(c.name)}</b> <span class="muted">${esc(c.phone)}</span> ${c.loyalty?.tier ? `<span class="badge b">${esc(c.loyalty.tier)}</span>` : ''}</div>${can('calls.make') ? '<button class="btn sm" data-call>📞 Call</button>' : ''}</div>
      ${G.kpis([['Trips', c.bookings.length], ['Spend', inr(spend)], ['Miles', num(c.loyalty?.miles)], ['Calls', c.calls.length], ['Ratings', c.ratings.length]])}
      <div class="grid g2" style="margin-top:12px"><div class="card"><b>Bookings</b>${G.table(c.bookings, [{ l: 'Travel', f: (b) => fdate(b.travel_date) }, { k: 'service', l: 'Service' }, { k: 'seats', l: 'Seats' }, { k: 'source', l: 'Channel' }, { l: 'Total', n: 1, f: (b) => inr(b.total) }, { l: 'Status', f: (b) => `<a href="#" data-pnr="${esc(b.pnr)}">${statusBadge(b.status)}</a>` }])}</div>
      <div class="card"><b>Notes</b><div>${c.notes.map((n) => `<div class="small" style="margin:6px 0"><b>${esc(n.by || '')}</b> · ${fdt(n.created_at)}<br>${esc(n.text)}</div>`).join('') || '<div class="empty">No notes</div>'}</div><div class="row"><input data-note placeholder="Add a note" style="flex:1"/><button class="btn sm p" data-addnote>Add</button></div>
      <b style="display:block;margin-top:14px">Messages</b>${c.messages.slice(-10).map((m) => `<div class="msg ${m.direction === 'out' ? 'out' : ''}" style="margin:4px 0">${esc(m.text)}<div class="ts">${fdt(m.ts)}</div></div>`).join('') || '<div class="empty">No messages</div>'}
      <b style="display:block;margin-top:14px">Calls</b>${G.table(c.calls, [{ l: 'When', f: (x) => fdt(x.ts) }, { l: 'Kind', f: (x) => esc(x.kind) }, { l: 'Status', f: (x) => statusBadge(x.status) }])}
      <b style="display:block;margin-top:14px">Ratings</b>${G.table(c.ratings, [{ l: 'Trip', f: (x) => fdate(x.travel_at) }, { k: 'ota', l: 'OTA' }, { l: 'Rating', f: (x) => '★'.repeat(x.rating) }, { l: 'Review', f: (x) => esc(x.review || '') }])}</div></div>`;
    G.on(el, 'click', '[data-pnr]', (b, e) => { e.preventDefault(); G.bookingModal(b.dataset.pnr); });
    $('[data-addnote]', el).onclick = async () => { const t = $('[data-note]', el).value.trim(); if (!t) return; await G.post(`/crm/customers/${phone}/notes`, { text: t }).catch(G.err); customer360(el, phone); };
    const cb = $('[data-call]', el); if (cb) cb.onclick = () => G.callNow({ phone, name: c.name });
  }

  // ---------- Sarathi (AI assistant) ----------
  G.screens.sarathi = async (el) => {
    const [sug, convs] = await Promise.all([G.get('/sarathi/suggestions'), G.get('/sarathi/conversations')]);
    let cid = null;
    el.innerHTML = `<div class="split"><div class="l"><button class="btn p" data-newc style="width:100%;margin-bottom:8px">+ New conversation</button><div class="list">${convs.map((c) => `<div class="it" data-cv="${c.id}"><b class="small">${esc(c.title)}</b><div class="small muted">${fdt(c.created_at)}</div></div>`).join('') || '<div class="empty small">No past conversations</div>'}</div></div>
      <div class="r"><div class="chat" style="height:calc(100vh - 140px)"><div class="msgs" data-msgs><div class="sar-msg assistant">👋 I'm Sarathi. Ask me about occupancy, sales, cancellations, no-shows, routes or staff.</div><div class="chips">${sug.map((s) => `<a class="badge b" data-sug style="cursor:pointer">${esc(s)}</a>`).join(' ')}</div></div><div class="row" style="padding-top:8px"><input data-ask placeholder="Ask Sarathi…" style="flex:1"/><button class="btn p" data-go>Ask</button></div></div></div></div>`;
    const box = $('[data-msgs]', el);
    const render = (m) => `<div class="sar-msg ${m.role}">${esc(m.text)}${m.table && m.table.length ? `<div style="margin-top:8px">${G.autoTable(m.table)}</div>` : ''}</div>`;
    const ask = async (question) => { box.insertAdjacentHTML('beforeend', render({ role: 'user', text: question })); box.scrollTop = box.scrollHeight; const r = await G.post('/sarathi/ask', { question, conversation_id: cid }); cid = r.conversation_id; box.insertAdjacentHTML('beforeend', render({ role: 'assistant', ...r.answer })); box.scrollTop = box.scrollHeight; };
    const go = () => { const i = $('[data-ask]', el); const v = i.value.trim(); if (!v) return; i.value = ''; ask(v).catch(G.err); };
    $('[data-go]', el).onclick = go; $('[data-ask]', el).onkeydown = (e) => { if (e.key === 'Enter') go(); };
    G.on(el, 'click', '[data-sug]', (b) => ask(b.textContent));
    $('[data-newc]', el).onclick = () => G.screens.sarathi(el);
    G.on(el, 'click', '[data-cv]', (b) => { const c = convs.find((x) => x.id == b.dataset.cv); cid = c.id; box.innerHTML = c.messages.map(render).join(''); box.scrollTop = box.scrollHeight; });
  };
})();
