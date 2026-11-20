// Reporting engine: trip P&L, accounts analytics, receivables, and the operator report catalogue.
const db = require('./db');
const U = require('./util');
const D = require('./domain');

const live = (b) => b.status === 'confirmed';
const paxLive = (b) => b.passengers.filter((p) => p.status !== 'cancelled');

function routeOf(s) { return db.col('routes').get(s.route_id); }
function vehicleOf(s) { return s.vehicle_id ? db.col('vehicles').get(s.vehicle_id) : null; }
function staffOf(id) { return db.col('staff').get(id); }
function schedulesIn(from, to, pred = () => true) { return db.col('schedules').filter((s) => s.travel_date >= from && s.travel_date <= to && pred(s)); }
function bookingsFor(sid) { return db.col('bookings').filter((b) => b.schedule_id == sid); }
function paxNet(b) { const tot = U.sum(b.passengers, (p) => p.fare) || 1; return U.sum(paxLive(b), (p) => p.fare) / tot * b.fare.net; }
function cancelCharges(b) { return U.sum(b.cancellations || [], (c) => c.charge) / (1 + D.GST_PCT / 100); }

function tripExpense(s, commission) {
  const r = routeOf(s);
  if (s.status !== 'active') return { fixed: 0, running: 0, commission: 0, total: 0, items: [] };
  const items = [...(r.expenses?.fixed || []).map((x) => ({ ...x, type: 'fixed' })), ...(r.expenses?.running || []).map((x) => ({ ...x, type: 'running' })), ...db.col('trip_expenses').filter((e) => e.schedule_id == s.id).map((e) => ({ key: e.key, label: e.label, per_day: e.amount, type: 'running', manual: true }))];
  const fixed = U.sum(items.filter((i) => i.type === 'fixed'), (i) => i.per_day);
  const running = U.sum(items.filter((i) => i.type === 'running'), (i) => i.per_day);
  return { fixed, running, commission: U.round2(commission), total: U.round2(fixed + running + commission), items };
}

function tripPnl(s) {
  const r = routeOf(s);
  const bs = bookingsFor(s.id);
  const conf = bs.filter(live);
  const coach = D.coachForSchedule(s);
  const seats = U.sum(conf, (b) => paxLive(b).length);
  const netSales = U.sum(conf, paxNet);
  const gst = netSales * D.GST_PCT / 100;
  const commission = U.sum(conf, (b) => paxNet(b) * b.fare.commission_pct / 100);
  const cxl = U.sum(bs, cancelCharges);
  const exp = tripExpense(s, commission);
  const byChannel = {};
  for (const b of conf) { const k = b.source; byChannel[k] = byChannel[k] || { channel: k, bookings: 0, seats: 0, net: 0, commission: 0 }; byChannel[k].bookings++; byChannel[k].seats += paxLive(b).length; byChannel[k].net += paxNet(b); byChannel[k].commission += paxNet(b) * b.fare.commission_pct / 100; }
  const capacity = coach?.layout.capacity || 0;
  return {
    schedule_id: s.id, date: s.travel_date, departure_time: s.departure_time, service: r.service_number, route: `${D.cityName(r.origin_city_id)} → ${D.cityName(r.destination_city_id)}`,
    vehicle: vehicleOf(s)?.registration_number || '', running: s.status === 'active', capacity, seats, occupancy_pct: capacity ? U.round2(seats / capacity * 100) : 0,
    net_sales: U.round2(netSales), gst: U.round2(gst), commission: U.round2(commission), cancellation_charges: U.round2(cxl), expense: exp.total, expense_breakdown: exp,
    profit: U.round2(netSales + cxl - exp.total), by_channel: Object.values(byChannel).map((x) => ({ ...x, net: U.round2(x.net), commission: U.round2(x.commission) })),
  };
}

function analytics({ from, to, basis = 'travel_date', source = 'all' }) {
  const fleet = db.col('vehicles').filter((v) => v.vehicle_role === 'main' && v.status === 'active').length || 1;
  const inRange = (b) => { const d = basis === 'booking_date' ? b.booked_at.slice(0, 10) : b.travel_date; return d >= from && d <= to; };
  const bs = db.col('bookings').filter((b) => inRange(b) && (source === 'all' || b.source === source));
  const days = {};
  for (const d of U.dateRange(from, to)) days[d] = { date: d, bookings: 0, seats: 0, sales: 0, offers: 0, net_sales: 0, gst_own: 0, gst_95: 0, cancel_charges: 0, cancelled_pnrs: 0, cancelled_seats: 0, refunds: 0, expense: 0, capacity: 0, trips: 0 };
  for (const b of bs) {
    const d = basis === 'booking_date' ? b.booked_at.slice(0, 10) : b.travel_date; const row = days[d]; if (!row) continue;
    if (live(b)) {
      const net = paxNet(b); const ratio = net / (b.fare.net || 1);
      row.bookings++; row.seats += paxLive(b).length; row.sales += b.fare.gross * ratio; row.offers += b.fare.discount * ratio; row.net_sales += net;
      if (['redbus', 'abhibus'].includes(b.source)) row.gst_95 += net * 0.05; else row.gst_own += net * 0.05;
    }
    if (b.cancellations?.length) { row.cancel_charges += cancelCharges(b); row.cancelled_pnrs++; row.cancelled_seats += U.sum(b.cancellations, (c) => c.seats.length); row.refunds += U.sum(b.cancellations, (c) => c.refund); }
  }
  for (const s of schedulesIn(from, to)) {
    const row = days[s.travel_date]; if (!row) continue;
    if (s.status !== 'active') continue;
    const p = tripPnl(s); row.expense += p.expense; row.capacity += p.capacity; row.trips++;
  }
  const rows = Object.values(days).map((r) => ({ ...r, ...Object.fromEntries(['sales', 'offers', 'net_sales', 'gst_own', 'gst_95', 'cancel_charges', 'refunds', 'expense'].map((k) => [k, U.round2(r[k])])), gst: U.round2(r.gst_own + r.gst_95), asp: r.seats ? U.round2(r.net_sales / r.seats) : 0, occupancy_pct: r.capacity ? U.round2(r.seats / r.capacity * 100) : 0, fleet_util_pct: U.round2(r.trips / fleet * 100), profit: U.round2(r.net_sales + r.cancel_charges - r.expense) }));
  const t = (k) => U.round2(U.sum(rows, (r) => r[k]));
  const seats = t('seats'), cap = t('capacity'), trips = t('trips');
  const totals = { bookings: t('bookings'), seats, sales: t('sales'), offers: t('offers'), net_sales: t('net_sales'), asp: seats ? U.round2(t('net_sales') / seats) : 0, occupancy_pct: cap ? U.round2(seats / cap * 100) : 0, fleet_util_pct: U.round2(trips / (fleet * rows.length || 1) * 100), cancel_charges: t('cancel_charges'), cancelled_pnrs: t('cancelled_pnrs'), cancelled_seats: t('cancelled_seats'), refunds: t('refunds'), gst: U.round2(t('gst_own') + t('gst_95')), gst_own: t('gst_own'), gst_95: t('gst_95'), expense: t('expense'), profit: t('profit') };
  const bySource = U.groupBy(bs.filter(live), (b) => b.source);
  const channels = Object.entries(bySource).map(([k, arr]) => ({ source: k, bookings: arr.length, seats: U.sum(arr, (b) => paxLive(b).length), net_sales: U.round2(U.sum(arr, paxNet)) }));
  return { from, to, basis, source, totals, rows, channels };
}

function transactions({ from, to, source = 'all', search = '' , user }) {
  const out = [];
  for (const b of db.col('bookings').all()) {
    if (source !== 'all' && b.source !== source) continue;
    if (user && user.permissions.includes('accounts.own_only') && b.booked_by?.phone !== user.phone && b.agent_phone !== user.phone) continue;
    const r = db.col('routes').get(b.route_id);
    const base = { pnr: b.pnr, ticket: b.ticket_number, travel_date: b.travel_date, service: r?.service_number, source: b.source, passenger: b.contact.name, phone: b.contact.phone, seats: b.passengers.map((p) => p.seat).join(', '), payment: b.payment, method: b.payment_method, booked_by: b.booked_by?.name };
    const bd = b.booked_at.slice(0, 10);
    if (bd >= from && bd <= to) out.push({ ...base, type: 'booking', date: b.booked_at, fare: b.fare.gross, discount: b.fare.discount, net: b.fare.net, gst: b.fare.gst, total: b.fare.total, commission: b.fare.commission, status: b.status });
    for (const c of b.cancellations || []) { const cd = c.at.slice(0, 10); if (cd >= from && cd <= to) out.push({ ...base, type: 'cancellation', date: c.at, fare: 0, discount: 0, net: 0, gst: 0, total: -c.refund, refund: c.refund, charge: c.charge, by: c.by, status: 'cancelled', seats: c.seats.join(', ') }); }
  }
  const q = search.toLowerCase();
  return out.filter((x) => !q || `${x.pnr} ${x.passenger} ${x.phone}`.toLowerCase().includes(q)).sort((a, b) => b.date.localeCompare(a.date));
}

function receivables({ from, to }) {
  const bs = db.col('bookings').filter((b) => b.travel_date >= from && b.travel_date <= to && live(b));
  const agg = {};
  for (const b of bs) {
    let key, type, name;
    if (b.source === 'agent') { key = `agent:${b.agent_phone}`; type = 'agent'; name = db.col('users').find((u) => u.phone === b.agent_phone)?.name || b.agent_phone; }
    else if (['redbus', 'abhibus', 'paytm'].includes(b.source)) { key = `ota:${b.source}`; type = 'ota'; name = b.source; }
    else if (b.source === 'branch') { key = `branch:${b.booked_by?.phone}`; type = 'branch'; name = b.booked_by?.name || 'Branch'; }
    else { key = 'website'; type = 'operator'; name = 'Website'; }
    const a = (agg[key] = agg[key] || { channel_key: key, channel_type: type, display_name: name, bookings: 0, total: 0, commission: 0, gst_on_commission: 0, tds: 0, paid: 0 });
    a.bookings++; a.total += b.fare.total; a.commission += b.fare.commission; a.gst_on_commission += b.fare.gst_on_commission; a.tds += type === 'ota' ? b.fare.net * 0.001 : 0;
    if (b.payment === 'paid' && type !== 'ota') a.paid += b.fare.total;
  }
  for (const e of db.col('ledger').all()) if (agg[e.channel_key] && e.date >= from && e.date <= to) agg[e.channel_key].paid += e.type === 'credit' ? e.amount : -e.amount;
  const rows = Object.values(agg).map((a) => { const ded = a.commission + a.gst_on_commission + a.tds; return { ...a, total: U.round2(a.total), commission: U.round2(a.commission), gst_on_commission: U.round2(a.gst_on_commission), tds: U.round2(a.tds), deductions: U.round2(ded), paid: U.round2(a.paid), receivable: U.round2(a.total - ded - a.paid) }; });
  const grp = (t) => U.round2(U.sum(rows.filter((r) => r.channel_type === t), (r) => r.receivable));
  return { from, to, summary: { agents: grp('agent'), branches: grp('branch'), otas: grp('ota'), operator: grp('operator') }, rows };
}

function ledger(channel_key) {
  const [type, id] = channel_key.split(':');
  const entries = [];
  for (const b of db.col('bookings').all()) {
    const match = (type === 'agent' && b.agent_phone === id) || (type === 'ota' && b.source === id) || (type === 'branch' && b.source === 'branch' && b.booked_by?.phone === id);
    if (!match) continue;
    if (b.status === 'confirmed' || b.cancellations?.length) entries.push({ date: b.booked_at.slice(0, 10), kind: 'ticket', ref: b.pnr, debit: U.round2(b.fare.total - b.fare.commission), credit: b.payment === 'paid' && type !== 'ota' ? U.round2(b.fare.total - b.fare.commission) : 0, note: `${b.passengers.length} seat(s) · ${b.travel_date}` });
    for (const c of b.cancellations || []) entries.push({ date: c.at.slice(0, 10), kind: 'cancellation', ref: b.pnr, debit: 0, credit: c.refund, note: `Refund ${c.refund_pct}%` });
  }
  for (const e of db.col('ledger').filter((x) => x.channel_key === channel_key)) entries.push({ date: e.date, kind: 'manual', ref: e.note || '', debit: e.type === 'debit' ? e.amount : 0, credit: e.type === 'credit' ? e.amount : 0, note: `by ${e.by}`, id: e.id });
  entries.sort((a, b) => a.date.localeCompare(b.date));
  let bal = 0; for (const e of entries) { bal += e.debit - e.credit; e.balance = U.round2(bal); }
  return { channel_key, entries, total_debits: U.round2(U.sum(entries, (e) => e.debit)), total_credits: U.round2(U.sum(entries, (e) => e.credit)), balance: U.round2(bal) };
}

// ---------- Report catalogue ----------
const REPORTS = {
  'fleet-operations': ({ from, to }) => {
    const rows = schedulesIn(from, to, (s) => s.status === 'active').map((s) => { const r = routeOf(s); const p = tripPnl(s); return { schedule_id: s.id, date: s.travel_date, departure_time: s.departure_time, service: r.service_number, route: p.route, vehicle: p.vehicle, drivers: (s.crew || []).filter((c) => c.role === 'Driver').map((c) => ({ name: staffOf(c.staff_id)?.name, phone: staffOf(c.staff_id)?.phone })), crew: (s.crew || []).filter((c) => c.role !== 'Driver').map((c) => ({ role: c.role, name: staffOf(c.staff_id)?.name })), km: s.km || null, fuel_l: s.fuel_l || null, kmpl: s.km && s.fuel_l ? U.round2(s.km / s.fuel_l) : null, seats: p.seats, occupancy_pct: p.occupancy_pct }; });
    const byBus = Object.values(U.groupBy(rows, (r) => r.vehicle)).map((a) => ({ vehicle: a[0].vehicle, days_ran: a.length, km: U.round2(U.sum(a, (x) => x.km)), fuel_l: U.round2(U.sum(a, (x) => x.fuel_l)), kmpl: U.sum(a, (x) => x.fuel_l) ? U.round2(U.sum(a, (x) => x.km) / U.sum(a, (x) => x.fuel_l)) : null }));
    const days = U.daysBetween(from, to) + 1; const fleet = db.col('vehicles').count((v) => v.vehicle_role === 'main');
    return { rows, by_bus: byBus, summary: { trips: rows.length, buses: new Set(rows.map((r) => r.vehicle)).size, drivers: new Set(rows.flatMap((r) => r.drivers.map((d) => d.name))).size, km: U.round2(U.sum(rows, (r) => r.km)), fuel_l: U.round2(U.sum(rows, (r) => r.fuel_l)), fleet_util_pct: U.round2(rows.length / (fleet * days) * 100), idle_bus_days: Math.max(0, fleet * days - rows.length), trips_without_bus: rows.filter((r) => !r.vehicle).length, trips_without_driver: rows.filter((r) => !r.drivers.length).length, trips_turned_off: schedulesIn(from, to, (s) => s.status !== 'active').length } };
  },
  'driver-behavior': ({ from, to }) => {
    const rows = schedulesIn(from, to, (s) => s.status === 'active' && s.telemetry).map((s) => ({ schedule_id: s.id, date: s.travel_date, service: routeOf(s).service_number, vehicle: vehicleOf(s)?.registration_number, drivers: (s.crew || []).filter((c) => c.role === 'Driver').map((c) => staffOf(c.staff_id)?.name), km: s.km, ...s.telemetry }));
    const byDriver = {};
    for (const r of rows) for (const d of r.drivers) { const x = (byDriver[d] = byDriver[d] || { driver: d, trips: 0, score_sum: 0, hard_brake: 0, over_speed: 0, idling: 0, top_speed: 0 }); x.trips++; x.score_sum += r.driving_score; x.hard_brake += r.hard_brake; x.over_speed += r.over_speed; x.idling += r.idling; x.top_speed = Math.max(x.top_speed, r.max_speed_kmh); }
    const drivers = Object.values(byDriver).map((x) => ({ ...x, score: Math.round(x.score_sum / x.trips) })).sort((a, b) => a.score - b.score);
    return { rows, drivers, summary: { trips_recorded: rows.length, avg_driver_score: drivers.length ? Math.round(U.sum(drivers, (d) => d.score) / drivers.length) : 0, below_65: drivers.filter((d) => d.score < 65).length } };
  },
  'staff-duty': ({ from, to, staff_id }) => {
    const st = staffOf(staff_id); if (!st) return { rows: [], summary: {} };
    const rows = db.col('attendance').filter((a) => a.staff_id == staff_id && a.date >= from && a.date <= to).map((a) => { const s = db.col('schedules').get(a.schedule_id); return { date: a.date, status: a.status, service: s ? routeOf(s).service_number : '', vehicle: s ? vehicleOf(s)?.registration_number : '', km: s?.km || null, amount: a.amount, state: a.state }; });
    return { staff: { id: st.id, name: st.name, role: st.role, phone: st.phone }, rows, summary: { working_days: rows.filter((r) => r.status === 'present').length, halt_days: rows.filter((r) => r.status === 'halt').length, km: U.round2(U.sum(rows, (r) => r.km)), amount: U.sum(rows, (r) => r.amount) } };
  },
  'point-usage': ({ from, to }) => {
    const bs = db.col('bookings').filter((b) => live(b) && b.travel_date >= from && b.travel_date <= to);
    const agg = (f) => { const m = {}; for (const b of bs) { const r = db.col('routes').get(b.route_id); const k = f(r, b); const x = (m[k] = m[k] || { point: k, bookings: 0, seats: 0, amount: 0, days: new Set() }); x.bookings++; x.seats += paxLive(b).length; x.amount += b.fare.total; x.days.add(b.travel_date); } const tot = U.sum(Object.values(m), (x) => x.seats) || 1; return Object.values(m).map((x) => ({ ...x, amount: U.round2(x.amount), days_used: x.days.size, days: undefined, share_pct: U.round2(x.seats / tot * 100) })).sort((a, b) => b.seats - a.seats); };
    return { boarding: agg((r, b) => D.stageName(r, b.boarding_stage_id)), dropping: agg((r, b) => D.stageName(r, b.dropping_stage_id)), pairs: agg((r, b) => `${D.stageName(r, b.boarding_stage_id)} → ${D.stageName(r, b.dropping_stage_id)}`).slice(0, 50) };
  },
  'metro-bookings': ({ from, to }) => {
    const rows = [];
    for (const b of db.col('bookings').filter((x) => live(x) && x.travel_date >= from && x.travel_date <= to)) {
      const r = db.col('routes').get(b.route_id); const st = r.stages.find((x) => x.id == b.boarding_stage_id);
      if (st?.pickup_type === 'Metro') rows.push({ travel_date: b.travel_date, pnr: b.pnr, service_number: r.service_number, source: b.source, leg: 'pickup', boarding_point: st.name, pickup_exchange: st.exchange_point, seats: paxLive(b).length, amount: b.fare.total, metro_pax: paxLive(b).length, metro_fare: 20 * paxLive(b).length });
    }
    const points = Object.values(U.groupBy(rows, (r) => r.boarding_point)).map((a) => ({ point: a[0].boarding_point, pnrs: a.length, pax: U.sum(a, (x) => x.metro_pax), fare: U.sum(a, (x) => x.metro_fare) })).sort((a, b) => b.pax - a.pax);
    return { rows, points, summary: { metro_pnrs: rows.length, metro_pax: U.sum(rows, (r) => r.metro_pax), metro_fare: U.sum(rows, (r) => r.metro_fare) } };
  },
  'van-bookings': ({ from, to }) => {
    const rows = [];
    for (const b of db.col('bookings').filter((x) => live(x) && x.travel_date >= from && x.travel_date <= to)) { const r = db.col('routes').get(b.route_id); const st = r.stages.find((x) => x.id == b.boarding_stage_id); if (st?.pickup_type === 'Van') rows.push({ travel_date: b.travel_date, pnr: b.pnr, boarding_point: st.name, seats: paxLive(b).length, amount: b.fare.total }); }
    return { rows, summary: { van_pnrs: rows.length, seats: U.sum(rows, (r) => r.seats) } };
  },
  'point-performance': (q) => { const pu = REPORTS['point-usage'](q); const trips = schedulesIn(q.from, q.to, (s) => s.status === 'active').length || 1; return { ranking: pu.boarding.map((x, i) => ({ rank: i + 1, ...x, seats_per_trip: U.round2(x.seats / trips) })) }; },
  'station-performance': ({ from, to }) => {
    const services = db.col('routes').all().map((r) => { const ss = schedulesIn(from, to, (s) => s.route_id === r.id); const bs = ss.flatMap((s) => bookingsFor(s.id)); const conf = bs.filter(live); const seats = U.sum(conf, (b) => paxLive(b).length); const amount = U.sum(conf, (b) => b.fare.total); const pairs = U.groupBy(conf, (b) => `${D.cityName(b.from_city_id)} → ${D.cityName(b.to_city_id)}`); const top = Object.entries(pairs).sort((a, b) => b[1].length - a[1].length)[0]; return { route_id: r.id, service: r.service_number, route: `${D.cityName(r.origin_city_id)} → ${D.cityName(r.destination_city_id)}`, time: r.departure_time, trips: ss.filter((s) => s.status === 'active').length, bookings: conf.length, seats, amount: U.round2(amount), avg_fare: seats ? U.round2(amount / seats) : 0, seats_per_trip: ss.length ? U.round2(seats / ss.length) : 0, pairs: Object.keys(pairs).length, top_pair: top ? top[0] : '', through_pct: conf.length ? U.round2(conf.filter((b) => b.from_city_id == r.origin_city_id && b.to_city_id == r.destination_city_id).length / conf.length * 100) : 0, cancelled: bs.filter((b) => b.status === 'cancelled').length }; });
    const pairs = Object.values(U.groupBy(db.col('bookings').filter((b) => live(b) && b.travel_date >= from && b.travel_date <= to), (b) => `${b.from_city_id}-${b.to_city_id}`)).map((a) => ({ pair: `${D.cityName(a[0].from_city_id)} → ${D.cityName(a[0].to_city_id)}`, bookings: a.length, seats: U.sum(a, (b) => paxLive(b).length), amount: U.round2(U.sum(a, (b) => b.fare.total)) })).sort((a, b) => b.seats - a.seats);
    return { services, pairs };
  },
  'no-shows': ({ from, to }) => {
    const rows = [];
    for (const b of db.col('bookings').filter((x) => x.travel_date >= from && x.travel_date <= to)) for (const p of b.passengers.filter((x) => x.status === 'no_show')) { const r = db.col('routes').get(b.route_id); const s = db.col('schedules').get(b.schedule_id); rows.push({ travel_date: b.travel_date, pnr: b.pnr, service_number: r.service_number, vehicle_number: vehicleOf(s)?.registration_number, seat: p.seat, passenger_name: p.name, contact_phone: b.contact.phone, boarding_point: D.stageName(r, b.boarding_stage_id), source: b.source, fare: p.fare }); }
    return { rows, summary: { no_shows: rows.length, fare: U.round2(U.sum(rows, (r) => r.fare)) } };
  },
  cancellations: ({ from, to }) => {
    const rows = [];
    for (const b of db.col('bookings').filter((x) => x.travel_date >= from && x.travel_date <= to)) for (const c of b.cancellations || []) { const r = db.col('routes').get(b.route_id); rows.push({ travel_date: b.travel_date, cancelled_at: c.at, pnr: b.pnr, service_number: r.service_number, passenger_name: b.contact.name, contact_phone: b.contact.phone, boarding_point: D.stageName(r, b.boarding_stage_id), source: b.source, by: c.by, seats: c.seats.length, refund: c.refund, charge: c.charge, refund_pct: c.refund_pct, reason: c.reason }); }
    return { rows, summary: { cancelled_pnrs: new Set(rows.map((r) => r.pnr)).size, seats: U.sum(rows, (r) => r.seats), refunds: U.round2(U.sum(rows, (r) => r.refund)), charges: U.round2(U.sum(rows, (r) => r.charge)), by_operator: rows.filter((r) => r.by === 'operator').length } };
  },
  'frequent-travellers': ({ from, to, min_trips = 2, top = 100, search = '' }) => {
    const m = {};
    for (const b of db.col('bookings').filter((x) => x.travel_date >= from && x.travel_date <= to)) { const k = b.contact.phone; const x = (m[k] = m[k] || { phone: k, name: b.contact.name, trips: 0, seats: 0, spend: 0, cancelled: 0, upcoming: 0, first_trip: b.travel_date, last_trip: b.travel_date, sources: {} }); if (live(b)) { x.trips++; x.seats += paxLive(b).length; x.spend += b.fare.total; x.sources[b.source] = (x.sources[b.source] || 0) + 1; if (b.travel_date >= U.today()) x.upcoming++; } else if (b.status === 'cancelled') x.cancelled++; if (b.travel_date < x.first_trip) x.first_trip = b.travel_date; if (b.travel_date > x.last_trip) x.last_trip = b.travel_date; }
    const all = Object.values(m); const q = String(search).toLowerCase();
    const rows = all.filter((x) => x.trips >= min_trips && (!q || `${x.name} ${x.phone}`.toLowerCase().includes(q))).sort((a, b) => b.trips - a.trips || b.spend - a.spend).slice(0, Number(top)).map((x) => ({ ...x, spend: U.round2(x.spend), tier: db.col('customers').find((c) => c.phone === x.phone)?.tier || 'Bronze' }));
    const bands = [[1, 1], [2, 2], [3, 5], [6, 10], [11, 9999]].map(([a, b]) => { const g = all.filter((x) => x.trips >= a && x.trips <= b); return { band: b === 9999 ? `${a}+ trips` : a === b ? `${a} trip${a > 1 ? 's' : ''}` : `${a}-${b} trips`, customers: g.length, trips: U.sum(g, (x) => x.trips) }; });
    const repeat = all.filter((x) => x.trips >= 2);
    return { rows, bands, summary: { customers: all.length, repeat_customers: repeat.length, repeat_pct: all.length ? U.round2(repeat.length / all.length * 100) : 0, trips: U.sum(all, (x) => x.trips), spend: U.round2(U.sum(all, (x) => x.spend)) } };
  },
  'trip-pnl': ({ from, to }) => { const rows = schedulesIn(from, to).map(tripPnl).map(({ expense_breakdown, by_channel, ...r }) => r); return { rows, summary: { trips: rows.length, net_sales: U.round2(U.sum(rows, (r) => r.net_sales)), expense: U.round2(U.sum(rows, (r) => r.expense)), profit: U.round2(U.sum(rows, (r) => r.profit)), loss_trips: rows.filter((r) => r.running && r.profit < 0).length, occupancy_pct: U.round2(U.sum(rows, (r) => r.seats) / (U.sum(rows.filter((r) => r.running), (r) => r.capacity) || 1) * 100) } }; },
  expenses: ({ from, to }) => {
    const cats = {}; let trips = 0;
    for (const s of schedulesIn(from, to, (x) => x.status === 'active')) { trips++; const p = tripPnl(s); for (const it of p.expense_breakdown.items) { const k = `${it.type}.${it.key}`; const c = (cats[k] = cats[k] || { key: k, label: it.label, type: it.type, amount: 0, trips: 0 }); c.amount += it.per_day; c.trips++; } const ck = 'running.channel_commission'; const c = (cats[ck] = cats[ck] || { key: ck, label: 'Channel commission', type: 'running', amount: 0, trips: 0 }); c.amount += p.commission; c.trips++; }
    const total = U.sum(Object.values(cats), (c) => c.amount) || 1;
    const categories = Object.values(cats).map((c) => ({ ...c, amount: Math.round(c.amount), share_pct: U.round2(c.amount / total * 100), avg_per_trip: Math.round(c.amount / (c.trips || 1)) })).sort((a, b) => b.amount - a.amount);
    return { categories, summary: { total_expense: Math.round(total), trips, per_trip: trips ? Math.round(total / trips) : 0 } };
  },
};

function dailyOps(date) {
  const T = date || U.today();
  const ss = db.col('schedules').filter((s) => s.travel_date === T);
  const fleet = ss.map((s) => { const r = routeOf(s); const p = tripPnl(s); return { schedule_id: s.id, service: r.service_number, name: r.name, route: p.route, departure_time: s.departure_time, status: s.status, trip_status: s.trip_status, vehicle: vehicleOf(s)?.registration_number || null, crew: (s.crew || []).map((c) => ({ role: c.role, name: staffOf(c.staff_id)?.name, phone: staffOf(c.staff_id)?.phone })), seats: p.seats, capacity: p.capacity, occupancy_pct: p.occupancy_pct, net_sales: p.net_sales }; }).sort((a, b) => a.departure_time.localeCompare(b.departure_time));
  const todayBookings = db.col('bookings').filter((b) => b.booked_at.slice(0, 10) === T);
  const bySource = Object.entries(U.groupBy(todayBookings.filter(live), (b) => b.source)).map(([k, a]) => ({ source: k, bookings: a.length, seats: U.sum(a, (b) => paxLive(b).length), amount: U.round2(U.sum(a, (b) => b.fare.total)) }));
  const yesterday = U.addDays(T, -1);
  const yNoShows = REPORTS['no-shows']({ from: yesterday, to: yesterday }).rows;
  const in30 = U.addDays(T, 30);
  const vehDocs = db.col('documents').filter((d) => d.owner_type === 'vehicle' && d.expiry_date && d.expiry_date <= in30).map((d) => ({ vehicle: db.col('vehicles').get(d.owner_id)?.registration_number, document: d.document_name, expiry_date: d.expiry_date, state: d.expiry_date < T ? 'EXPIRED' : 'EXPIRING SOON' }));
  const licences = db.col('staff').filter((s) => s.license_expiry && s.license_expiry <= in30).map((s) => ({ name: s.name, role: s.role, phone: s.phone, license_expiry: s.license_expiry, state: s.license_expiry < T ? 'EXPIRED' : 'EXPIRING SOON' }));
  const ratings = db.col('ota_ratings').filter((r) => r.rated_at >= U.addDays(T, -14));
  return {
    date: T,
    fleet: { trips: fleet, summary: { trips: fleet.length, running: fleet.filter((f) => f.status === 'active').length, without_bus: fleet.filter((f) => !f.vehicle).length, seats: U.sum(fleet, (f) => f.seats), capacity: U.sum(fleet, (f) => f.capacity) } },
    earnings: { bookings: todayBookings.filter(live).length, seats: U.sum(todayBookings.filter(live), (b) => paxLive(b).length), amount: U.round2(U.sum(todayBookings.filter(live), (b) => b.fare.total)), cancellations: todayBookings.filter((b) => b.status === 'cancelled').length, by_source: bySource, next7: U.dateRange(T, U.addDays(T, 6)).map((d) => { const s2 = db.col('schedules').filter((s) => s.travel_date === d && s.status === 'active'); const seats = U.sum(s2, (s) => U.sum(bookingsFor(s.id).filter(live), (b) => paxLive(b).length)); const cap = U.sum(s2, (s) => D.coachForSchedule(s)?.layout.capacity || 0); return { date: d, trips: s2.length, seats, capacity: cap, occupancy_pct: cap ? U.round2(seats / cap * 100) : 0 }; }) },
    passengers: { no_shows_yesterday: yNoShows, frequent_today: db.col('bookings').filter((b) => b.travel_date === T && live(b)).filter((b) => db.col('bookings').count((x) => x.contact.phone === b.contact.phone && live(x)) >= 3).map((b) => ({ name: b.contact.name, phone: b.contact.phone, pnr: b.pnr, service: routeOf(db.col('schedules').get(b.schedule_id)).service_number })) },
    staff: { vehicle_documents: vehDocs, licences },
    ratings: { average: ratings.length ? U.round2(U.sum(ratings, (r) => r.rating) / ratings.length) : null, count: ratings.length, low: ratings.filter((r) => r.rating <= 2).map((r) => ({ ...r, service: routeOf(db.col('schedules').get(r.schedule_id) || {})?.service_number })) },
  };
}

module.exports = { tripPnl, tripExpense, analytics, transactions, receivables, ledger, REPORTS, dailyOps, paxLive, live };
