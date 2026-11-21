// Core domain logic: coach layouts, schedule generation, seat inventory, fares,
// booking lifecycle (hold → confirm → cancel / shift), refunds and audit.
const db = require('./db');
const U = require('./util');

const GST_PCT = 5;
const SOURCES = ['redbus', 'abhibus', 'paytm', 'website', 'branch', 'agent'];

// ---------- Coach layouts ----------
// Builds a deck grid. type: 'sleeper' | 'seater'. pattern like '2+1'.
function buildLayout({ kind = 'seater_sleeper', pattern = '2+1' }) {
  const decks = [];
  if (kind === 'sleeper') {
    decks.push(sleeperDeck('LOWER', 'L', 6, pattern));
    decks.push(sleeperDeck('UPPER', 'U', 6, pattern));
  } else if (kind === 'seater') {
    const seats = []; let n = 1;
    const [l, r] = pattern.split('+').map(Number);
    for (let row = 0; row < 10; row++) {
      for (let c = 0; c < l + r; c++) {
        const col = c < l ? c : c + 1; // aisle gap
        seats.push({ code: String(n++), row, col, type: 'seater', w: 1, h: 1 });
      }
    }
    decks.push({ deck: 'LOWER', rows: 10, cols: l + r + 1, seats });
  } else {
    // Seater lower (2+1 → seaters on 2 side, sleepers on 1 side) + sleeper upper — like A/C Seater/Sleeper (2+1)
    const seats = []; let n = 1;
    for (let row = 0; row < 6; row++) { seats.push({ code: `${n}L`, row: row * 2, col: 3, type: 'sleeper', w: 1, h: 2 }); n++; }
    let s = 1;
    for (let row = 0; row < 12; row++) for (const col of [0, 1]) seats.push({ code: String(s++), row, col, type: 'seater', w: 1, h: 1 });
    decks.push({ deck: 'LOWER', rows: 12, cols: 4, seats });
    decks.push(sleeperDeck('UPPER', 'U', 6, '2+1'));
  }
  const capacity = decks.reduce((a, d) => a + d.seats.length, 0);
  return { decks, capacity };
}
function sleeperDeck(name, suffix, rows, pattern) {
  const [l, r] = pattern.split('+').map(Number);
  const seats = []; let n = 1;
  for (let row = 0; row < rows; row++) {
    for (let c = 0; c < l + r; c++) {
      const col = c < l ? c : c + 1;
      seats.push({ code: `${n++}${suffix}`, row: row * 2, col, type: 'sleeper', w: 1, h: 2 });
    }
  }
  return { deck: name, rows: rows * 2, cols: l + r + 1, seats };
}
function seatClass(seat) {
  if (!seat) return 'seater';
  if (seat.type === 'seater') return 'seater';
  return /U$/.test(seat.code) ? 'sleeper_upper' : 'sleeper_lower';
}

// ---------- Route helpers ----------
function routeCities(route) {
  // ordered list of {city_id, order, day, time}
  return [...(route.via_cities || [])].sort((a, b) => a.order - b.order);
}
function cityOrder(route, cityId) { const c = routeCities(route).find((x) => x.city_id == cityId); return c ? c.order : -1; }
function cityName(id) { const c = db.col('cities').get(id); return c ? c.name : '?'; }

function runsOn(route, date) {
  if (route.status !== 'active') return false;
  if (route.start_date && date < route.start_date) return false;
  if (route.end_date && date > route.end_date) return false;
  const p = route.run_pattern || { type: 'daily' };
  switch (p.type) {
    case 'weekdays': return (p.days || []).includes(U.dow(date));
    case 'every_n': { const d = U.daysBetween(p.first_date || route.start_date, date); const cyc = (p.run || 1) + (p.rest || 0); return d >= 0 && (d % (p.n || cyc)) < (p.run || 1); }
    case 'monthdates': return (p.dates || []).includes(Number(date.slice(8)));
    case 'ranges': return (p.ranges || []).some((r) => date >= r.from && (!r.to || date <= r.to));
    default: return true;
  }
}

function scheduleId(date, routeIdx) { return Number(`1000${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8)}${U.pad(routeIdx, 3)}`); }

// Make sure schedules exist for routes in [from, to].
function ensureSchedules(from, to) {
  const routes = db.col('routes').filter((r) => r.status === 'active');
  const S = db.col('schedules');
  let created = 0;
  for (const date of U.dateRange(from, to)) {
    for (const r of routes) {
      if (!runsOn(r, date)) continue;
      const id = scheduleId(date, r.id);
      if (S.get(id)) continue;
      if ((r.deleted_trips || []).includes(date)) continue;
      const crew = crewFor(r, date);
      S.insert({
        id, route_id: r.id, travel_date: date, departure_time: r.departure_time, arrival_time: r.arrival_time,
        vehicle_id: crew.vehicle_id, crew: crew.crew, status: 'active', is_active: true, manually_disabled: false,
        sync_with_route: true, trip_status: 'scheduled', stop_events: {}, seat_blocks: [], unblocked: [],
        fare_override: null, delay_minutes: 0,
      });
      created++;
    }
  }
  return created;
}
function crewFor(route, date) {
  const a = route.assignments || [];
  if (!a.length) return { vehicle_id: route.vehicle_id || null, crew: [] };
  const idx = a.length > 1 ? Math.abs(U.daysBetween(route.start_date || '2026-01-01', date)) % a.length : 0;
  return { vehicle_id: a[idx].vehicle_id, crew: (a[idx].crew || []).map((c) => ({ ...c })) };
}

function tripsheetId(s) { const r = db.col('routes').get(s.route_id); return `1000_${r ? r.service_number : s.route_id}_${s.travel_date}`; }

// ---------- Inventory ----------
function coachForSchedule(s) {
  const v = s.vehicle_id ? db.col('vehicles').get(s.vehicle_id) : null;
  const r = db.col('routes').get(s.route_id);
  const tplId = (v && v.coach_template_id) || (r && r.coach_template_id);
  return db.col('coaches').get(tplId);
}
function activeBookings(scheduleId) {
  return db.col('bookings').filter((b) => b.schedule_id == scheduleId && ['confirmed', 'hold'].includes(b.status));
}
function segOverlap(a1, a2, b1, b2) { return a1 < b2 && b1 < a2; }

function blockedSeatsFor(s) {
  const r = db.col('routes').get(s.route_id);
  const out = {};
  const fromRoute = s.sync_with_route !== false ? (r.seat_blocks || []) : [];
  for (const blk of [...fromRoute, ...(s.seat_blocks || [])]) {
    if (blk.from && s.travel_date < blk.from) continue;
    if (blk.to && s.travel_date > blk.to) continue;
    if (blk.auto_release_hours) {
      const dep = new Date(`${s.travel_date}T${s.departure_time}:00`);
      if (Date.now() > dep.getTime() - blk.auto_release_hours * 3600e3) continue;
    }
    for (const seat of blk.seats || []) if (!(s.unblocked || []).includes(seat)) out[seat] = { reason: blk.reason || 'Blocked', gender: blk.gender || null, source: blk.source || 'route' };
  }
  return out;
}

// Seat map: status for each seat for a given segment.
function seatMap(s, fromCity, toCity) {
  const r = db.col('routes').get(s.route_id);
  const coach = coachForSchedule(s);
  const cities = routeCities(r);
  const fo = fromCity ? cityOrder(r, fromCity) : cities[0]?.order ?? 0;
  const to = toCity ? cityOrder(r, toCity) : cities[cities.length - 1]?.order ?? 1;
  const blocks = blockedSeatsFor(s);
  const occ = {};
  for (const b of activeBookings(s.id)) {
    const bo = cityOrder(r, b.from_city_id), bt = cityOrder(r, b.to_city_id);
    for (const p of b.passengers) {
      if (p.status === 'cancelled') continue;
      const overlaps = segOverlap(fo, to, bo, bt);
      const cur = occ[p.seat];
      const entry = { pnr: b.pnr, name: p.name, gender: p.gender, status: b.status === 'hold' ? 'hold' : p.status, overlaps, payment: b.payment, source: b.source, boarding: stageName(r, b.boarding_stage_id), dropping: stageName(r, b.dropping_stage_id), from: cityName(b.from_city_id), to: cityName(b.to_city_id) };
      if (!cur || overlaps) occ[p.seat] = entry;
    }
  }
  const decks = (coach?.layout?.decks || []).map((d) => ({
    deck: d.deck, rows: d.rows, cols: d.cols,
    seats: d.seats.map((seat) => {
      const o = occ[seat.code];
      let status = 'available';
      if (o && o.overlaps) status = o.status === 'hold' ? 'hold' : o.status === 'no_show' ? 'no_show' : (o.gender === 'F' ? 'booked_female' : 'booked_male');
      else if (o && !o.overlaps) status = 'other_leg';
      if (status === 'available' && blocks[seat.code]) status = 'blocked';
      return { ...seat, status, booking: o || null, block: blocks[seat.code] || null, fare: fareFor(s, seat, fromCity, toCity) };
    }),
  }));
  return { schedule_id: s.id, coach: coach ? { id: coach.id, name: coach.name, capacity: coach.layout.capacity } : null, decks };
}
function stageName(r, stageId) { const st = (r.stages || []).find((x) => x.id == stageId); return st ? st.name : ''; }

// ---------- Fares ----------
function baseFare(route, s, fromCity, toCity, cls) {
  const fares = (s && s.fare_override) || route.fares || [];
  const f = fares.find((x) => x.from_city_id == fromCity && x.to_city_id == toCity)
    || fares.find((x) => x.from_city_id == route.origin_city_id && x.to_city_id == route.destination_city_id);
  if (!f) return 0;
  const main = fares.find((x) => x.from_city_id == route.origin_city_id && x.to_city_id == route.destination_city_id);
  let v = f[cls] ?? f.seater ?? 0;
  if (f === main && s && s.auto_price && s.auto_price[cls]) v = s.auto_price[cls];
  return v;
}
function fareFor(s, seat, fromCity, toCity) {
  const r = db.col('routes').get(s.route_id);
  fromCity = fromCity || r.origin_city_id; toCity = toCity || r.destination_city_id;
  let fare = baseFare(r, s, fromCity, toCity, seatClass(seat));
  for (const rule of r.seat_fare_rules || []) {
    if (!(rule.seats || []).includes(seat.code)) continue;
    if (rule.days && rule.days.length && !rule.days.includes(U.dow(s.travel_date))) continue;
    fare += rule.kind === 'percent' ? (fare * rule.value) / 100 : rule.value;
  }
  return U.round2(fare);
}

function commissionPct(source, agentPhone) {
  const op = db.meta('operator') || {};
  const cfg = (op.ota_commission || {})[source];
  if (cfg !== undefined) return cfg;
  if (source === 'agent') {
    const a = db.col('users').find((u) => u.phone === agentPhone && u.role === 'agent');
    return a?.commission_pct ?? 5;
  }
  return 0;
}

function priceBooking({ seatsFares, source, coupon, agentPhone, milesUsed = 0 }) {
  const gross = U.sum(seatsFares); // listed fare (GST-exclusive)
  let discount = 0;
  if (coupon) {
    const c = db.col('coupons').find((x) => x.code === coupon.toUpperCase() && x.is_active);
    if (!c) throw httpErr(400, 'Invalid coupon');
    if (c.min_fare && gross < c.min_fare) throw httpErr(400, `Min fare ₹${c.min_fare} required for ${c.code}`);
    if (c.valid_until && U.today() > c.valid_until) throw httpErr(400, 'Coupon expired');
    if (c.channels && c.channels.length && !c.channels.includes(source)) throw httpErr(400, 'Coupon not valid on this channel');
    discount = c.discount_type === 'percentage' ? (gross * c.discount_value) / 100 : c.discount_value;
    if (c.max_discount_amount) discount = Math.min(discount, c.max_discount_amount);
  }
  const milesCfg = db.meta('miles') || {};
  const milesDisc = milesUsed ? Math.min(milesUsed * (milesCfg.miles_to_rupee_ratio || 0.1), gross * (milesCfg.max_discount_percent || 30) / 100) : 0;
  discount += milesDisc;
  const net = Math.max(0, gross - discount);
  const gst = U.round2((net * GST_PCT) / 100);
  const commPct = commissionPct(source, agentPhone);
  const commission = U.round2((net * commPct) / 100);
  return { gross: U.round2(gross), discount: U.round2(discount), net: U.round2(net), gst, total: U.round2(net + gst), commission_pct: commPct, commission, gst_on_commission: U.round2(commission * 0.18), miles_discount: U.round2(milesDisc) };
}

function httpErr(status, message) { const e = new Error(message); e.status = status; return e; }

// ---------- Booking lifecycle ----------
function nextTicket() { const n = (db.meta('ticket_seq') || 95000) + 1; db.meta('ticket_seq', n); return String(n).padStart(6, '0'); }
function makePnr(ticket) { const d = new Date(); return `ST${String(d.getFullYear()).slice(2)}${U.pad(d.getMonth() + 1)}${U.pad(d.getDate())}${U.pad(d.getHours())}${U.pad(d.getMinutes())}${U.pad(d.getSeconds())}${ticket}`; }

// Route business rules (configured in Route Master → Seat & Boarding Rules).
// A rule is only enforced when explicitly set to false; staff can bypass with override_rules.
function enforceRouteRules(r, s, map, input) {
  const br = r.business_rules || {};
  if (input.override_rules) return;
  const days = Number(br.advance_booking_days);
  if (br.advance_booking_days != null && Number.isFinite(days) && U.daysBetween(U.today(), s.travel_date) > days) throw httpErr(400, `Bookings open only ${days} days before travel`);
  if (br.gents_next_to_ladies !== false && br.ladies_next_to_gents !== false) return;
  const where = {};
  for (const d of map.decks) for (const x of d.seats) where[x.code] = { deck: d.deck, row: x.row, col: x.col, seat: x };
  const adj = (a, b) => where[a] && where[b] && where[a].deck === where[b].deck && where[a].row === where[b].row && Math.abs(where[a].col - where[b].col) === 1;
  const g = (x) => (String(x || 'M').toUpperCase().startsWith('F') ? 'F' : 'M');
  const clash = (mine, other) => (mine === 'M' && other === 'F' && br.gents_next_to_ladies === false) || (mine === 'F' && other === 'M' && br.ladies_next_to_gents === false);
  const mine = input.passengers.map((p) => ({ seat: p.seat, g: g(p.gender) }));
  for (const p of mine) {
    for (const code of Object.keys(where)) {
      if (!adj(p.seat, code)) continue;
      const st = where[code].seat;
      const bookedG = st.status === 'booked_female' ? 'F' : st.status === 'booked_male' ? 'M' : st.status === 'hold' && st.booking ? g(st.booking.gender) : null;
      if (bookedG && clash(p.g, bookedG)) throw httpErr(409, `Seat ${p.seat} is next to a ${bookedG === 'F' ? 'lady' : 'gent'} passenger — not allowed by route seat rules`);
      const sameBooking = mine.find((q) => q.seat === code);
      if (sameBooking && clash(p.g, sameBooking.g) && (br.couple_exception === false || mine.length > 2)) throw httpErr(409, `Seats ${p.seat}/${code}: mixed-gender adjacent seats are allowed only for a 2-seat couple booking`);
    }
  }
}

function createBooking(input, actor) {
  const s = db.col('schedules').get(input.schedule_id);
  if (!s) throw httpErr(404, 'Schedule not found');
  if (s.status !== 'active') throw httpErr(400, 'Schedule is not on sale');
  const r = db.col('routes').get(s.route_id);
  const fromCity = input.from_city_id || r.origin_city_id, toCity = input.to_city_id || r.destination_city_id;
  if (cityOrder(r, fromCity) >= cityOrder(r, toCity)) throw httpErr(400, 'Invalid from/to cities');
  const map = seatMap(s, fromCity, toCity);
  const seats = Object.fromEntries(map.decks.flatMap((d) => d.seats).map((x) => [x.code, x]));
  if (!input.passengers?.length) throw httpErr(400, 'At least one passenger is required');
  if (!/^\d{10}$/.test(String(input.contact?.phone || ''))) throw httpErr(400, 'Enter a valid 10-digit mobile number');
  for (const p of input.passengers) {
    const st = seats[p.seat];
    if (!st) throw httpErr(400, `Seat ${p.seat} does not exist`);
    if (st.status === 'blocked' && !input.override_block) throw httpErr(409, `Seat ${p.seat} is blocked`);
    if (!['available', 'other_leg', 'blocked'].includes(st.status)) throw httpErr(409, `Seat ${p.seat} is already booked`);
    if (!p.name) throw httpErr(400, `Passenger name required for seat ${p.seat}`);
  }
  enforceRouteRules(r, s, map, input);
  const source = input.source || 'branch';
  const fares = input.passengers.map((p) => (p.fare != null ? Number(p.fare) : seats[p.seat].fare));
  const price = priceBooking({ seatsFares: fares, source, coupon: input.coupon, agentPhone: input.agent_phone, milesUsed: input.miles_used });
  const ticket = nextTicket();
  const payMode = input.payment_mode || 'paid'; // paid | unpaid (hold until paid) | settle_later
  const holdMin = input.hold_minutes || db.meta('hold_settings')?.default_minutes || 15;
  const b = db.col('bookings').insert({
    pnr: makePnr(ticket), ticket_number: ticket, schedule_id: s.id, route_id: r.id, travel_date: s.travel_date,
    source, channel: source, status: payMode === 'unpaid' ? 'hold' : 'confirmed', payment: payMode,
    payment_method: input.payment_method || (payMode === 'paid' ? 'cash' : null),
    booked_at: U.nowIso(), booked_by: { phone: actor?.phone, name: actor?.name, role: actor?.role },
    agent_phone: input.agent_phone || null, branch_id: input.branch_id || null,
    contact: { name: input.contact.name || input.passengers[0].name, phone: input.contact.phone, email: input.contact.email || '' },
    from_city_id: fromCity, to_city_id: toCity, boarding_stage_id: input.boarding_stage_id, dropping_stage_id: input.dropping_stage_id,
    passengers: input.passengers.map((p, i) => ({ seat: p.seat, name: p.name, gender: p.gender || 'M', age: Number(p.age) || 30, fare: fares[i], status: 'booked', call_status: null })),
    fare: price, coupon: input.coupon || null, comments: input.comment ? [{ text: input.comment, by: actor?.name, at: U.nowIso() }] : [],
    hold_expires_at: payMode === 'unpaid' ? new Date(Date.now() + holdMin * 60e3).toISOString() : null,
    miles_used: input.miles_used || 0,
  });
  if (input.coupon) db.col('coupon_redemptions').insert({ code: input.coupon.toUpperCase(), pnr: b.pnr, amount: price.discount, at: U.nowIso(), source });
  awardMiles(b);
  notify('booking.created', b);
  audit('schedule', s.id, 'bookings', { op: 'book', pnr: b.pnr, seats: b.passengers.map((p) => p.seat) }, actor);
  return b;
}

function awardMiles(b) {
  const cfg = db.meta('miles'); if (!cfg?.is_active) return;
  const C = db.col('customers');
  let c = C.find((x) => x.phone === b.contact.phone);
  if (!c) c = C.insert({ phone: b.contact.phone, name: b.contact.name, miles: 0, tier: 'Bronze' });
  if (b.miles_used) c.miles = Math.max(0, c.miles - b.miles_used);
  const mult = (db.meta('tier_multipliers') || []).find((t) => t.tier_name === c.tier)?.multiplier || 1;
  c.miles += Math.round(b.fare.net * mult);
  c.tier = c.miles > 20000 ? 'Platinum' : c.miles > 8000 ? 'Gold' : c.miles > 3000 ? 'Silver' : 'Bronze';
  db.persist();
}

function refundFor(b, cancelledBy = 'passenger', overridePct = null) {
  const s = db.col('schedules').get(b.schedule_id);
  const r = db.col('routes').get(b.route_id);
  const dep = new Date(`${s.travel_date}T${s.departure_time}:00`).getTime();
  const hrs = (dep - Date.now()) / 3600e3;
  let pct;
  if (overridePct != null) pct = Number(overridePct);
  else if (cancelledBy === 'operator') pct = 100;
  else {
    const slabs = [...(r.refund_slabs || [])].sort((a, b2) => b2.hours_before - a.hours_before);
    const slab = slabs.find((x) => hrs >= x.hours_before);
    pct = slab ? slab.refund_pct : 0;
  }
  const paid = b.fare.total;
  const refund = U.round2((paid * pct) / 100);
  return { hours_before: U.round2(hrs), refund_pct: pct, refund, charge: U.round2(paid - refund), paid };
}

function cancelBooking(pnr, { seats, by = 'operator', reason = '', refund_pct = null, notify: doNotify = true } = {}, actor) {
  const b = db.col('bookings').find((x) => x.pnr === pnr);
  if (!b) throw httpErr(404, 'Booking not found');
  if (b.status === 'cancelled') throw httpErr(400, 'Already cancelled');
  const rtRules = db.col('routes').get(b.route_id)?.business_rules || {};
  if (by === 'passenger' && rtRules.allow_cancellation === false) throw httpErr(400, 'Cancellation is disabled for this route');
  const target = seats && seats.length ? b.passengers.filter((p) => seats.includes(p.seat)) : b.passengers.filter((p) => p.status !== 'cancelled');
  const ratio = U.sum(target, (p) => p.fare) / (U.sum(b.passengers.filter((p) => p.status !== 'cancelled'), (p) => p.fare) || 1);
  const calc = refundFor(b, by, refund_pct);
  const part = { refund: U.round2(calc.refund * ratio), charge: U.round2(calc.charge * ratio), refund_pct: calc.refund_pct };
  target.forEach((p) => (p.status = 'cancelled'));
  const allCancelled = b.passengers.every((p) => p.status === 'cancelled');
  b.cancellations = b.cancellations || [];
  b.cancellations.push({ at: U.nowIso(), by, reason, seats: target.map((p) => p.seat), ...part, actor: actor?.name });
  if (allCancelled) b.status = 'cancelled';
  b.cancelled_at = U.nowIso();
  db.persist();
  if (doNotify) notify('booking.cancelled', b);
  audit('schedule', b.schedule_id, 'bookings', { op: 'cancel', pnr, seats: target.map((p) => p.seat), ...part }, actor);
  return { booking: b, ...part };
}

function shiftBooking(pnr, { schedule_id, seat_map = {}, boarding_stage_id, dropping_stage_id }, actor) {
  const b = db.col('bookings').find((x) => x.pnr === pnr);
  if (!b) throw httpErr(404, 'Booking not found');
  const target = db.col('schedules').get(schedule_id || b.schedule_id);
  const map = seatMap(target, b.from_city_id, b.to_city_id);
  const seats = Object.fromEntries(map.decks.flatMap((d) => d.seats).map((x) => [x.code, x]));
  for (const [from, to] of Object.entries(seat_map)) {
    const st = seats[to];
    if (!st) throw httpErr(400, `Seat ${to} missing`);
    const mine = st.booking && st.booking.pnr === pnr;
    if (!mine && !['available', 'other_leg'].includes(st.status)) throw httpErr(409, `Seat ${to} unavailable`);
  }
  for (const p of b.passengers) if (seat_map[p.seat]) p.seat = seat_map[p.seat];
  const prev = b.schedule_id;
  b.schedule_id = target.id; b.travel_date = target.travel_date; b.route_id = target.route_id;
  if (boarding_stage_id) b.boarding_stage_id = boarding_stage_id;
  if (dropping_stage_id) b.dropping_stage_id = dropping_stage_id;
  db.persist();
  notify('booking.modified', b);
  audit('schedule', prev, 'bookings', { op: 'shift', pnr, to_schedule: target.id, seat_map }, actor);
  return b;
}

function expireHolds() {
  const now = Date.now();
  for (const b of db.col('bookings').filter((x) => x.status === 'hold' && x.hold_expires_at && new Date(x.hold_expires_at).getTime() < now)) {
    b.status = 'expired'; b.expired_at = U.nowIso();
    notify('hold.expired', b);
  }
  db.persist();
}

// ---------- Notifications & audit ----------
function notify(event, b) {
  const s = db.col('schedules').get(b.schedule_id);
  const v = s?.vehicle_id ? db.col('vehicles').get(s.vehicle_id) : null;
  const r = db.col('routes').get(b.route_id);
  db.col('alerts').insert({
    action: event, title: `${event.replace('.', ' ')} — ${v ? v.registration_number : r?.service_number || ''}`,
    body: `${b.contact.name} · ${b.passengers.length} seat · ${stageName(r, b.boarding_stage_id)}`,
    pnr: b.pnr, seats: b.passengers.map((p) => p.seat).join(','), schedule_id: b.schedule_id, travel_date: b.travel_date, ts: U.nowIso(),
  });
  const subs = db.col('notification_subscriptions').filter((x) => x.enabled && x.subscriber_type === 'passenger' && x.event_types.includes(event));
  for (const sub of subs) {
    db.col('messages').insert({ conversation_id: passengerConvId(b, b.passengers[0]), direction: 'out', channel: sub.channel, template: event.replace('.', '_'), text: templateText(event, b, r), phone: b.contact.phone, ts: U.nowIso(), read: true, by: 'system' });
  }
}
function templateText(event, b, r) {
  const t = { 'booking.created': `Hi ${b.contact.name}, your ticket ${b.pnr} on ${r?.service_number} (${b.travel_date}) is confirmed. Seats: ${b.passengers.map((p) => p.seat).join(', ')}.`,
    'booking.cancelled': `Your booking ${b.pnr} has been cancelled.`, 'booking.modified': `Your booking ${b.pnr} has been updated.`, 'hold.expired': `Your seat hold for ${b.pnr} expired.` };
  return t[event] || `${event}: ${b.pnr}`;
}
function passengerConvId(b, p) { const r = db.col('routes').get(b.route_id); return `1000_${r?.service_number}_${b.travel_date}_${b.contact.phone}_${b.ticket_number}_${p?.seat || ''}`; }

function audit(entity, entity_id, section, changes, actor) {
  db.col('edit_history').insert({ entity, entity_id: String(entity_id), section, changes, phone: actor?.phone || 'system', name: actor?.name || 'System', role: actor?.role || 'system', at: U.nowIso() });
}

module.exports = {
  GST_PCT, SOURCES, buildLayout, seatClass, routeCities, cityOrder, cityName, runsOn, scheduleId, ensureSchedules, crewFor, tripsheetId,
  coachForSchedule, activeBookings, blockedSeatsFor, seatMap, stageName, baseFare, fareFor, commissionPct, priceBooking, httpErr,
  createBooking, cancelBooking, shiftBooking, refundFor, expireHolds, notify, audit, passengerConvId, awardMiles,
};
