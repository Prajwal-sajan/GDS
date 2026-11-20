// Auth, CRM, chats, calls, daily ops, ratings, Sarathi, settings/IAM, alerts.
const express = require('express');
const db = require('../db');
const U = require('../util');
const D = require('../domain');
const Rp = require('../reports');
const A = require('../auth');
const { can } = A;

const h = (fn) => (req, res) => { try { const out = fn(req, res); if (out !== undefined) res.json(out); } catch (e) { res.status(e.status || 500).json({ success: false, message: e.message }); } };

// ---------- Public auth ----------
const pub = express.Router();
pub.post('/auth/request-otp', h((req, res) => { const r2 = A.requestOtp(String(req.body.phone || '')); if (!r2.ok) res.status(404); return r2; }));
pub.post('/auth/verify-otp', h((req, res) => { const r2 = A.verifyOtp(String(req.body.phone || ''), req.body.otp); if (!r2.ok) res.status(401); return r2; }));
pub.get('/public/operator', h(() => { const o = db.meta('operator'); return { operator_name: o.operator_name, app_name: o.app_name, tagline: o.tagline, brand_hex: o.brand_hex, logo_url: o.logo_url }; }));

const r = express.Router();
r.get('/auth/me', h((req) => ({ user: req.user, operator: db.meta('operator'), roles: Object.fromEntries(Object.entries(A.roles()).map(([k, v]) => [k, v.name])) })));
r.post('/auth/step-up', h((req) => A.requestStepUp(req.user, req.body.purpose || 'generic')));
r.get('/auth/switchable-users', h((req) => (['owner', 'admin'].includes(db.col('users').get(req.user.real_user_id)?.role) ? db.col('users').filter((u) => u.status === 'ACTIVE').map(A.publicUser) : [])));

// ---------- Alerts ----------
r.get('/alerts', h((req) => { const since = req.query.since || U.addDays(U.today(), -1); const all = db.col('alerts').filter((a) => a.ts > since); return { alerts: all.slice(-50).reverse(), server_time: U.nowIso() }; }));

// ---------- CRM ----------
r.get('/crm/customers', can('crm.view'), h((req) => {
  const q = String(req.query.q || '').toLowerCase().trim(); const agg = {};
  for (const b of db.col('bookings').all()) { const k = b.contact.phone; const a = (agg[k] ||= { phone: k, name: b.contact.name, trips: 0, cancelled: 0, spend: 0, last_travel: '', sources: {} }); if (b.status === 'cancelled') a.cancelled++; else if (b.status === 'confirmed') { a.trips++; a.spend += b.fare.total; } if (b.travel_date > a.last_travel) a.last_travel = b.travel_date; a.sources[b.source] = (a.sources[b.source] || 0) + 1; }
  let rows = Object.values(agg); if (q) rows = rows.filter((x) => `${x.name} ${x.phone}`.toLowerCase().includes(q));
  rows.sort((a, b) => b.trips - a.trips || b.spend - a.spend);
  return { total: rows.length, rows: rows.slice(0, Number(req.query.limit) || 100).map((x) => ({ ...x, spend: U.round2(x.spend), ...(db.col('customers').find((c) => c.phone === x.phone) || { miles: 0, tier: 'Bronze' }), name: x.name })) };
}));
r.get('/crm/customers/:phone', can('crm.view'), h((req) => {
  const p = req.params.phone; const bookings = db.col('bookings').filter((b) => b.contact.phone === p).sort((a, b) => b.travel_date.localeCompare(a.travel_date));
  if (!bookings.length) throw D.httpErr(404, 'Customer not found');
  return { phone: p, name: bookings[0].contact.name, loyalty: db.col('customers').find((c) => c.phone === p) || { miles: 0, tier: 'Bronze' }, bookings: bookings.map((b) => ({ pnr: b.pnr, travel_date: b.travel_date, service: db.col('routes').get(b.route_id)?.service_number, seats: b.passengers.map((x) => x.seat).join(','), status: b.status, total: b.fare.total, source: b.source })), messages: db.col('messages').filter((m) => m.phone === p).slice(-50), calls: db.col('calls').filter((c) => c.phone === p), ratings: db.col('ota_ratings').filter((x) => x.phone === p), notes: db.col('crm_notes').filter((n) => n.phone === p) };
}));
r.post('/crm/customers/:phone/notes', can('crm.view'), h((req) => db.col('crm_notes').insert({ phone: req.params.phone, text: req.body.text, by: req.user.name, at: U.nowIso() })));

// ---------- Chats ----------
r.get('/chats', can('chats.view'), h((req) => {
  const by = U.groupBy(db.col('messages').all(), (m) => m.conversation_id); const q = String(req.query.q || '').toLowerCase();
  let list = Object.entries(by).map(([id, ms]) => { const last = ms[ms.length - 1]; const first = ms.find((m) => m.direction === 'in') || ms[0]; const parts = id.split('_'); return { conversation_id: id, name: first.by && first.by !== 'system' && first.direction === 'in' ? first.by : parts[0], phone: last.phone, service: parts[1], travel_date: parts[2], ticket: parts[4], seat: parts[5], last_message: last.text, last_ts: last.ts, channel: last.channel, unread: ms.filter((m) => m.direction === 'in' && !m.read).length, blocked: !!db.col('chat_blocks').find((b) => b.phone === last.phone) }; });
  if (req.query.filter === 'unread') list = list.filter((c) => c.unread); if (q) list = list.filter((c) => `${c.name} ${c.phone} ${c.ticket}`.toLowerCase().includes(q));
  return { conversations: list.sort((a, b) => b.last_ts.localeCompare(a.last_ts)), unread_total: U.sum(list, (c) => c.unread) };
}));
r.get('/chats/:cid', can('chats.view'), h((req) => { const ms = db.col('messages').filter((m) => m.conversation_id === req.params.cid); ms.forEach((m) => { if (m.direction === 'in') m.read = true; }); db.persist(); const tk = req.params.cid.split('_')[4]; return { messages: ms, booking: db.col('bookings').find((b) => b.ticket_number == tk) || null, templates: ['Live tracking: https://track.example/{pnr}', 'Your bus is delayed by 15 minutes. Sorry for the inconvenience.', 'Pickup point: {boarding}. Please reach 10 minutes early.', 'Thank you for travelling with us!'] }; }));
r.post('/chats/:cid', can('chats.send'), h((req) => { const last = db.col('messages').filter((m) => m.conversation_id === req.params.cid).pop(); if (!last) throw D.httpErr(404, 'Conversation not found'); if (!String(req.body.text || '').trim()) throw D.httpErr(400, 'Message is empty'); if (db.col('chat_blocks').find((b) => b.phone === last.phone)) throw D.httpErr(400, 'User is blocked'); return db.col('messages').insert({ conversation_id: req.params.cid, direction: 'out', channel: req.body.channel || last.channel || 'whatsapp', text: String(req.body.text).slice(0, 2000), phone: last.phone, ts: U.nowIso(), read: true, by: req.user.name }); }));
r.post('/chats/:cid/block', can('chats.send'), h((req) => { const last = db.col('messages').filter((m) => m.conversation_id === req.params.cid).pop(); const ex = db.col('chat_blocks').find((b) => b.phone === last.phone); if (ex) { db.col('chat_blocks').remove(ex.id); return { blocked: false }; } db.col('chat_blocks').insert({ phone: last.phone, reason: req.body.reason || 'spam', report: !!req.body.report, by: req.user.name, at: U.nowIso() }); return { blocked: true }; }));

// ---------- Calls ----------
r.get('/calls', can('calls.view'), h((req) => { let rows = db.col('calls').all().slice(); const { status, direction, q } = req.query; if (status) rows = rows.filter((c) => c.status === status); if (direction) rows = rows.filter((c) => c.direction === direction); if (q) rows = rows.filter((c) => `${c.phone} ${c.passenger_name} ${c.pnr}`.toLowerCase().includes(String(q).toLowerCase())); rows.sort((a, b) => b.ts.localeCompare(a.ts)); return { calls: rows, stats: { total: rows.length, answered: rows.filter((c) => c.status === 'answered').length, missed: rows.filter((c) => c.status === 'missed').length, avg_duration: Math.round(U.sum(rows, (c) => c.duration_s) / (rows.length || 1)) } }; }));
// No telephony provider is integrated: calls are operator-logged records. Status is what the operator reports.
const CALL_STATUSES = ['answered', 'missed', 'busy', 'not_reachable', 'logged'];
r.post('/calls', can('calls.make'), h((req) => {
  const b = req.body.pnr ? db.col('bookings').find((x) => x.pnr === req.body.pnr) : null;
  const phone = String(req.body.phone || b?.contact.phone || '').replace(/\D/g, '').slice(-10);
  if (!/^\d{10}$/.test(phone)) throw D.httpErr(400, 'Valid phone required');
  const status = CALL_STATUSES.includes(req.body.status) ? req.body.status : 'logged';
  const duration = Math.max(0, Number(req.body.duration_s) || 0);
  const c = db.col('calls').insert({ direction: req.body.direction === 'incoming' ? 'incoming' : 'outgoing', kind: req.body.kind || 'manual', phone, passenger_name: b?.contact.name || req.body.name || '', pnr: b?.pnr || req.body.pnr || null, schedule_id: b?.schedule_id || null, status, duration_s: duration, notes: req.body.notes || '', agent: req.user.name, ts: U.nowIso(), provider: null });
  return { ...c, message: 'Call record saved (no telephony provider connected).' };
}));
r.put('/calls/:id', can('calls.make'), h((req) => {
  const c = db.col('calls').get(req.params.id); if (!c) throw D.httpErr(404, 'Call not found');
  const patch = {};
  if (req.body.notes !== undefined) patch.notes = String(req.body.notes);
  if (req.body.status !== undefined) { if (!CALL_STATUSES.includes(req.body.status)) throw D.httpErr(400, 'Invalid call status'); patch.status = req.body.status; }
  if (req.body.duration_s !== undefined) patch.duration_s = Math.max(0, Number(req.body.duration_s) || 0);
  return db.col('calls').update(c.id, patch);
}));
r.get('/speed-dials', can('calls.view'), h(() => ({ settings: db.meta('speed_dial'), dials: db.col('speed_dials').all() })));
r.post('/speed-dials', can('settings.modify'), h((req) => { const b = req.body; if (!/^\d{1,2}$/.test(b.code || '')) throw D.httpErr(400, 'Code must be 1-2 digits'); if (db.col('speed_dials').find((d) => d.code === b.code)) throw D.httpErr(409, 'Code in use'); return db.col('speed_dials').insert({ code: b.code, kind: b.kind || 'number', phone: b.phone, label: b.label || '', is_active: true }); }));
r.delete('/speed-dials/:id', can('settings.modify'), h((req) => ({ success: db.col('speed_dials').remove(req.params.id) })));

// ---------- Daily ops & ratings ----------
r.get('/daily-ops', can('dailyops.view'), h((req) => Rp.dailyOps(req.query.date || U.addDays(U.today(), -1))));
r.get('/ratings', can('dailyops.view'), h((req) => { let rows = db.col('ota_ratings').all().slice(); if (req.query.max) rows = rows.filter((x) => x.rating <= Number(req.query.max)); if (req.query.ota) rows = rows.filter((x) => x.ota === req.query.ota); rows.sort((a, b) => b.rated_at.localeCompare(a.rated_at)); const all = db.col('ota_ratings').all(); return { rows, avg: U.round2(U.sum(all, (x) => x.rating) / (all.length || 1)), distribution: [1, 2, 3, 4, 5].map((n) => all.filter((x) => x.rating === n).length) }; }));
r.post('/ratings/:id/reply', can('dailyops.ratings_reply'), h((req) => db.col('ota_ratings').update(req.params.id, { operator_reply: req.body.reply, replied_by: req.user.name, replied_at: U.nowIso() })));

// ---------- Sarathi (rule-based analyst) ----------
function period(q) {
  const t = U.today(); if (/yesterday/.test(q)) return [U.addDays(t, -1), U.addDays(t, -1), 'yesterday']; if (/today/.test(q)) return [t, t, 'today'];
  if (/last month|past month|30 days/.test(q)) return [U.addDays(t, -30), t, 'the last 30 days']; if (/tomorrow/.test(q)) return [U.addDays(t, 1), U.addDays(t, 1), 'tomorrow'];
  return [U.addDays(t, -6), t, 'the last 7 days'];
}
const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;
function sarathiAnswer(question) {
  const q = question.toLowerCase(); const [from, to, label] = period(q); const an = Rp.analytics({ from, to }); const T = { ...an.totals, trips: U.sum(an.rows, (x) => x.trips) };
  if (/occupan/.test(q)) return { text: `Average occupancy for ${label} was ${T.occupancy_pct}% across ${T.trips} trips.`, table: an.rows.map((x) => ({ date: x.date, occupancy: `${x.occupancy_pct}%`, trips: x.trips })) };
  if (/cancel/.test(q)) { const c = Rp.REPORTS.cancellations({ from, to }); return { text: `${c.rows.length} cancellations in ${label}; cancellation charges ${inr(T.cancel_charges)}, refunds ${inr(T.refunds)}.`, table: c.rows.slice(0, 15) }; }
  if (/no.?show/.test(q)) { const c = Rp.REPORTS['no-shows']({ from, to }); return { text: `${c.rows.length} no-shows recorded in ${label}.`, table: c.rows.slice(0, 15) }; }
  if (/profit|p&l|pnl|expense/.test(q)) return { text: `For ${label}: net sales ${inr(T.net_sales)}, expenses ${inr(T.expense)}, profit ${inr(T.profit)}.`, table: an.rows.map((x) => ({ date: x.date, net_sales: x.net_sales, expense: x.expense, profit: x.profit })) };
  if (/passenger|travell?ed|seats/.test(q)) return { text: `${T.seats} passengers travelled in ${label} on ${T.trips} trips (avg ${Math.round(T.seats / (T.trips || 1))} per trip).`, table: an.rows.map((x) => ({ date: x.date, passengers: x.seats, trips: x.trips })) };
  if (/channel|source|ota|redbus|abhibus/.test(q)) { const g = U.groupBy(db.col('bookings').filter((b) => b.status === 'confirmed' && b.travel_date >= from && b.travel_date <= to), (b) => b.source); const table = Object.entries(g).map(([s, bs]) => ({ channel: s, bookings: bs.length, seats: U.sum(bs, (b) => b.passengers.length), revenue: U.round2(U.sum(bs, (b) => b.fare.total)) })).sort((a, b) => b.revenue - a.revenue); return { text: `Top channel in ${label} is ${table[0]?.channel || '—'} with ${inr(table[0]?.revenue || 0)}.`, table }; }
  if (/route|service|best|worst/.test(q)) { const g = U.groupBy(db.col('bookings').filter((b) => b.status === 'confirmed' && b.travel_date >= from && b.travel_date <= to), (b) => db.col('routes').get(b.route_id)?.service_number); const table = Object.entries(g).map(([s, bs]) => ({ service: s, seats: U.sum(bs, (b) => b.passengers.length), revenue: U.round2(U.sum(bs, (b) => b.fare.total)) })).sort((a, b) => b.revenue - a.revenue); return { text: `Best performing service in ${label}: ${table[0]?.service} (${inr(table[0]?.revenue || 0)}). Lowest: ${table[table.length - 1]?.service}.`, table }; }
  if (/document|expir|insurance|permit|licen/.test(q)) { const lim = U.addDays(U.today(), 30); const table = db.col('documents').filter((d) => d.expiry_date && d.expiry_date <= lim).map((d) => ({ owner: d.owner_type === 'vehicle' ? db.col('vehicles').get(d.owner_id)?.registration_number : db.col('staff').get(d.owner_id)?.name, document: d.document_name, expiry: d.expiry_date })); return { text: `${table.length} documents expired or expiring within 30 days.`, table }; }
  if (/revenue|sales|earn|income|asp/.test(q)) return { text: `Net sales for ${label}: ${inr(T.net_sales)} from ${T.seats} seats (ASP ${inr(T.asp)}). Offers given ${inr(T.offers)}.`, table: an.rows.map((x) => ({ date: x.date, net_sales: x.net_sales, seats: x.seats, asp: x.asp })) };
  return { text: 'I can answer questions on passengers, revenue, occupancy, cancellations, no-shows, profit, channels, routes and expiring documents. Try "How many passengers travelled this week?"', table: [] };
}
r.get('/sarathi/suggestions', can('sarathi.ask'), h(() => ['How many passengers travelled this week?', 'What was yesterday\'s revenue?', 'Show occupancy for the last 30 days', 'Which channel gives the most revenue?', 'Which service performed best this week?', 'How many cancellations yesterday?', 'Which documents are expiring soon?', 'What is the profit this week?']));
r.get('/sarathi/conversations', can('sarathi.ask'), h((req) => db.col('sarathi').filter((c) => c.user_id === req.user.id).reverse()));
r.post('/sarathi/ask', can('sarathi.ask'), h((req) => {
  const question = String(req.body.question || '').trim(); if (!question) throw D.httpErr(400, 'Ask a question');
  const ans = sarathiAnswer(question); const S = db.col('sarathi');
  let conv = req.body.conversation_id ? S.get(req.body.conversation_id) : null;
  if (!conv) conv = S.insert({ user_id: req.user.id, title: question.slice(0, 60), messages: [], created_at: U.nowIso() });
  conv.messages.push({ role: 'user', text: question, ts: U.nowIso() }, { role: 'assistant', ...ans, ts: U.nowIso() }); db.persist();
  return { conversation_id: conv.id, answer: ans };
}));

// ---------- Settings ----------
r.get('/settings', can('settings.view'), h(() => ({ operator: db.meta('operator'), miles: db.meta('miles'), day_rates: db.meta('day_rates'), tier_multipliers: db.meta('tier_multipliers'), blackout_dates: db.meta('blackout_dates'), seat_upgrade_policy: db.meta('seat_upgrade_policy'), hold_settings: db.meta('hold_settings'), speed_dial: db.meta('speed_dial'), branches: db.col('branches').all() })));
const SETTABLE = ['operator', 'miles', 'day_rates', 'tier_multipliers', 'blackout_dates', 'seat_upgrade_policy', 'hold_settings', 'speed_dial'];
r.put('/settings/:key', can('settings.modify'), h((req) => {
  const k = req.params.key; if (!SETTABLE.includes(k)) throw D.httpErr(404, 'Unknown setting');
  if (k === 'operator' && req.body.brand_hex && !/^#[0-9a-f]{6}$/i.test(req.body.brand_hex)) throw D.httpErr(400, 'Invalid colour');
  if (k === 'hold_settings' && Number(req.body.default_minutes) > Number(req.body.max_minutes ?? db.meta('hold_settings').max_minutes)) throw D.httpErr(400, 'Default hold cannot exceed max');
  const cur = db.meta(k); const next = Array.isArray(req.body) ? req.body : { ...cur, ...req.body }; db.meta(k, next);
  D.audit('settings', k, k, { before: cur, after: next }, req.user); return next;
}));
r.post('/branches', can('settings.modify'), h((req) => db.col('branches').insert({ name: req.body.name, city_id: req.body.city_id, address: req.body.address || '', phone: req.body.phone || '' })));
r.delete('/branches/:id', can('settings.modify'), h((req) => ({ success: db.col('branches').remove(req.params.id) })));

// IAM
r.get('/iam/users', can('settings.view'), h(() => db.col('users').all().map((u) => ({ ...u, ...A.publicUser(u), status: u.status }))));
r.post('/iam/users', can('iam.manage_users'), h((req) => { const b = req.body; if (!/^\d{10}$/.test(b.phone || '')) throw D.httpErr(400, 'Valid 10-digit phone required'); if (db.col('users').find((u) => u.phone === b.phone)) throw D.httpErr(409, 'User exists'); if (!A.roles()[b.role]) throw D.httpErr(400, 'Unknown role'); if (b.role === 'owner' && req.user.role !== 'owner') throw D.httpErr(403, 'Only owner can add owners'); return db.col('users').insert({ phone: b.phone, name: b.name || b.phone, role: b.role, status: 'ACTIVE', branch_id: b.branch_id || null, commission_pct: b.commission_pct, agent_type: b.agent_type, credit_limit: b.credit_limit }); }));
r.put('/iam/users/:id', can('iam.manage_users'), h((req) => { const u = db.col('users').get(req.params.id); if (!u) throw D.httpErr(404, 'Not found'); if (u.role === 'owner' && req.user.role !== 'owner') throw D.httpErr(403, 'Cannot edit owner'); if (u.id === req.user.real_user_id && req.body.status === 'INACTIVE') throw D.httpErr(400, 'You cannot deactivate yourself'); const { phone, ...rest } = req.body; return db.col('users').update(u.id, rest); }));
r.get('/iam/roles', can('settings.view'), h(() => ({ catalog: A.CATALOG, roles: Object.entries(A.roles()).map(([key, v]) => ({ key, ...v, builtin: !!A.DEFAULT_ROLES[key], users: db.col('users').count((u) => u.role === key) })) })));
r.put('/iam/roles/:key', can('iam.manage_roles'), h((req) => { const k = req.params.key; if (k === 'owner') throw D.httpErr(400, 'Owner role cannot be changed'); const all = Object.values(A.CATALOG).flat(); const custom = db.meta('roles') || {}; custom[k] = { name: req.body.name || A.roles()[k]?.name || k, permissions: (req.body.permissions || []).filter((p) => all.includes(p)) }; db.meta('roles', custom); return custom[k]; }));
r.delete('/iam/roles/:key', can('iam.manage_roles'), h((req) => { const k = req.params.key; if (db.col('users').count((u) => u.role === k)) throw D.httpErr(400, 'Role has users assigned'); const custom = db.meta('roles') || {}; delete custom[k]; db.meta('roles', custom); return { success: true }; }));

// Notification subscriptions
r.get('/notifications/subscriptions', can('settings.view'), h(() => ({ subscriptions: db.col('notification_subscriptions').all(), events: ['booking.created', 'booking.cancelled', 'booking.modified', 'hold.expired', 'passenger.pre_boarding', 'trip.delayed', 'trip.started', 'vehicle.approaching', 'passenger.rating_request', 'document.expiring'], channels: ['whatsapp', 'sms', 'push', 'email'] })));
r.post('/notifications/subscriptions', can('settings.modify'), h((req) => db.col('notification_subscriptions').insert({ subscriber_type: req.body.subscriber_type || 'group', subscriber_ref: req.body.subscriber_ref || '', display_name: req.body.display_name || '', event_types: req.body.event_types || [], channel: req.body.channel || 'push', enabled: req.body.enabled !== false })));
r.put('/notifications/subscriptions/:id', can('settings.modify'), h((req) => db.col('notification_subscriptions').update(req.params.id, req.body)));
r.delete('/notifications/subscriptions/:id', can('settings.modify'), h((req) => ({ success: db.col('notification_subscriptions').remove(req.params.id) })));

// Audit
r.get('/history', can('settings.view'), h((req) => db.col('edit_history').filter((e) => (!req.query.entity || e.entity === req.query.entity)).slice(-200).reverse()));

module.exports = { pub, r };
