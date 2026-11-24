// Trips (tripsheets / pickup charts), schedules and bookings API.
const express = require('express');
const db = require('../db');
const U = require('../util');
const D = require('../domain');
const Rp = require('../reports');
const { can, checkStepUp } = require('../auth');

const r = express.Router();
const Policy=require('../access-runtime-v27');
const h = (fn) => (req, res) => { try { const out = fn(req, res); if (out !== undefined) res.json(out); } catch (e) { res.status(e.status || 500).json({ success: false, message: e.message }); } };

const staff = (id) => db.col('staff').get(id);
// Route stages with schedule-level (single trip) stop overrides applied.
const STAGE_EDITABLE = ['name', 'time', 'day', 'address', 'landmark', 'contact_number', 'lat', 'lng'];
function stagesFor(s, route) {
  const ov = s.stage_overrides || {};
  return (route.stages || []).map((st) => { const o = ov[st.id]; if (!o) return st; const x = { ...st, overridden: true }; for (const k of STAGE_EDITABLE) if (o[k] !== undefined && o[k] !== '') x[k] = ['day', 'lat', 'lng'].includes(k) ? Number(o[k]) : o[k]; return x; });
}
function scheduleCard(s) {
  const route = db.col('routes').get(s.route_id);
  const v = s.vehicle_id ? db.col('vehicles').get(s.vehicle_id) : null;
  const coach = D.coachForSchedule(s);
  const bs = db.col('bookings').filter((b) => b.schedule_id == s.id);
  const conf = bs.filter(Rp.live);
  const seats = U.sum(conf, (b) => Rp.paxLive(b).length);
  const pax = conf.flatMap((b) => Rp.paxLive(b));
  const unread = db.col('messages').count((m) => m.direction === 'in' && !m.read && m.conversation_id.startsWith(`1000_${route.service_number}_${s.travel_date}_`));
  return {
    id: s.id, tripsheet_id: D.tripsheetId(s), route_id: s.route_id, service_number: route.service_number, service_name: route.name,
    origin: D.cityName(route.origin_city_id), destination: D.cityName(route.destination_city_id), travel_date: s.travel_date,
    departure_time: s.departure_time, arrival_time: s.arrival_time, arrival_day_offset: Math.max(0, (Number(s.arrival_day_override||D.routeCities(route).slice(-1)[0]?.day) || (String(s.arrival_time) < String(s.departure_time) ? 2 : 1)) - 1), status: s.status, trip_status: s.trip_status, delay_minutes: s.delay_minutes || 0,
    vehicle: v ? { id: v.id, registration_number: v.registration_number, phone: v.phone_number } : null,
    coach: coach ? coach.name : null, capacity: coach?.layout.capacity || 0, seats_booked: seats, occupancy_pct: coach ? U.round2(seats / coach.layout.capacity * 100) : 0,
    crew: (s.crew || []).map((c) => ({ ...c, name: staff(c.staff_id)?.name, phone: staff(c.staff_id)?.phone })),
    counts: { boarded: pax.filter((p) => ['boarded', 'dropped'].includes(p.status)).length, no_show: pax.filter((p) => p.status === 'no_show').length, checked_in: pax.filter((p) => p.status === 'checked_in').length, to_call: pax.filter((p) => p.call_status === 'to_call').length, called: pax.filter((p) => p.call_status === 'called').length, hold: bs.filter((b) => b.status === 'hold').length },
    revenue: U.round2(U.sum(conf, (b) => b.fare.total)), unread_chats: unread, sync_with_route: s.sync_with_route !== false,
    main_fare: (s.fare_override || route.fares || []).find(f => String(f.from_city_id) === String(route.origin_city_id) && String(f.to_city_id) === String(route.destination_city_id)) || null,
  };
}

// ---------------- Trips ----------------
r.get('/trips', can('trips.view'), h((req) => {
  const tab = req.query.tab || 'current';
  const T = U.today();
  let from = req.query.date || T, to = req.query.date || T;
  if (!req.query.date) { if (tab === 'future') { from = U.addDays(T, 1); to = U.addDays(T, 7); } if (tab === 'past') { from = U.addDays(T, -7); to = U.addDays(T, -1); } }
  D.ensureSchedules(from, to);
  const q = (req.query.q || '').toLowerCase();
  let list = db.col('schedules').filter((s) => s.travel_date >= from && s.travel_date <= to).map(scheduleCard);
  if (q) list = list.filter((c) => `${c.service_number} ${c.service_name} ${c.vehicle?.registration_number || ''} ${c.origin} ${c.destination}`.toLowerCase().includes(q));
  list.sort((a, b) => (tab === 'past' ? b.travel_date.localeCompare(a.travel_date) : a.travel_date.localeCompare(b.travel_date)) || a.departure_time.localeCompare(b.departure_time));
  return { tab, from, to, trips: list };
}));

r.get('/trips/:sid', can('trips.view'), h((req) => {
  const s = db.col('schedules').get(req.params.sid); if (!s) throw D.httpErr(404, 'Trip not found');
  const route = db.col('routes').get(s.route_id);
  const stages = stagesFor(s, route);
  const bs = db.col('bookings').filter((b) => b.schedule_id == s.id && b.status !== 'expired' && b.status !== 'released');
  const passengers = [];
  for (const b of bs) for (const p of b.passengers) {
    const bst = stages.find((x) => x.id == b.boarding_stage_id), dst = stages.find((x) => x.id == b.dropping_stage_id);
    const conv = D.passengerConvId(b, p);
    passengers.push({ pnr: b.pnr, ticket: b.ticket_number, booked_at:b.booked_at, seat: p.seat, name: p.name, gender: p.gender, age: p.age, status: b.status === 'cancelled' || p.status === 'cancelled' ? 'cancelled' : b.status === 'hold' ? 'hold' : p.status, call_status: p.call_status, phone: b.contact.phone, source: b.source, payment: b.payment, fare: p.fare, from: D.cityName(b.from_city_id), to: D.cityName(b.to_city_id), boarding: bst ? { id: bst.id, name: bst.name, time: bst.time, day: bst.day, pickup_type: bst.pickup_type } : null, dropping: dst ? { id: dst.id, name: dst.name, time: dst.time, day: dst.day } : null, tier: db.col('customers').find((c) => c.phone === b.contact.phone)?.tier || 'Bronze', trips: db.col('bookings').count((x) => x.contact.phone === b.contact.phone && x.status === 'confirmed'), unread: db.col('messages').count((m) => m.conversation_id === conv && m.direction === 'in' && !m.read), conversation_id: conv, comments: b.comments, seat_upgrade:p.seat_upgrade||null });
  }
  const stops = stages.map((st) => ({ ...st, pickups: passengers.filter((p) => p.boarding?.id === st.id && p.status !== 'cancelled').length, drops: passengers.filter((p) => p.dropping?.id === st.id && p.status !== 'cancelled').length, event: (s.stop_events || {})[st.id] || null }));
  const v = s.vehicle_id ? db.col('vehicles').get(s.vehicle_id) : null;
  const docs = v ? db.col('documents').filter((d) => d.owner_type === 'vehicle' && d.owner_id === v.id) : [];
  return { ...scheduleCard(s), stops, passengers, documents: docs, telemetry: s.telemetry || null, km: s.km, fuel_l: s.fuel_l, position: v?.position || null, pnl: req.user.permissions.includes('schedules.financial') ? Rp.tripPnl(s) : null };
}));

r.patch('/trips/:sid/passengers/:pnr/:seat', can('trips.update_passengers'), h((req) => {
  const b = db.col('bookings').find((x) => x.pnr === req.params.pnr && x.schedule_id == req.params.sid);
  if (!b) throw D.httpErr(404, 'Passenger not found');
  const p = b.passengers.find((x) => x.seat === req.params.seat); if (!p) throw D.httpErr(404, 'Seat not on booking');
  const { status, call_status, otp, boarding_otp } = req.body;
  if (status === 'no_show' && !checkStepUp(req.user, 'no_show', otp)) throw D.httpErr(403, 'OTP required to mark NO-SHOW');
  if (status === 'boarded' && boarding_otp && boarding_otp !== b.ticket_number.slice(-4)) throw D.httpErr(400, 'Boarding OTP does not match');
  if (status) p.status = status;
  if (call_status !== undefined) p.call_status = call_status;
  db.persist();
  D.audit('schedule', b.schedule_id, 'passengers', { pnr: b.pnr, seat: p.seat, status, call_status }, req.user);
  return { success: true, passenger: p };
}));

r.post('/trips/:sid/stop-event', can('trips.update_passengers'), h((req) => {
  const s = db.col('schedules').get(req.params.sid); if (!s) throw D.httpErr(404, 'Trip not found');
  const { stage_id, kind } = req.body; // kind: arrived | departed
  s.stop_events = s.stop_events || {}; const e = (s.stop_events[stage_id] = s.stop_events[stage_id] || {});
  e[kind === 'departed' ? 'dtime' : 'atime'] = U.nowIso();
  if (s.trip_status === 'scheduled') s.trip_status = 'live';
  db.persist(); return { success: true, event: e };
}));

r.post('/trips/:sid/status', can('trips.update_passengers'), h((req) => {
  const s = db.col('schedules').get(req.params.sid); if (!s) throw D.httpErr(404, 'Trip not found');
  const { trip_status } = req.body; if (!['scheduled', 'live', 'completed'].includes(trip_status)) throw D.httpErr(400, 'Invalid status');
  s.trip_status = trip_status;
  if (trip_status === 'completed') for (const b of db.col('bookings').filter((x) => x.schedule_id == s.id && x.status === 'confirmed')) for (const p of b.passengers) if (['booked', 'checked_in', 'boarded'].includes(p.status)) p.status = p.status === 'booked' ? 'no_show' : 'dropped';
  db.persist(); D.audit('schedule', s.id, 'trip', { trip_status }, req.user); return scheduleCard(s);
}));

// v48: signed time adjustments are idempotent. Future stops move by the
// difference between new and previous delay; visited stops remain fixed.
// This is schedule-only, never a mutation to the operator's route template.
function adjustedClock(hhmm,day,delta){
 const m=String(hhmm||'').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
 if(!m)throw D.httpErr(400,'Invalid scheduled stop time');
 const start=(Number(day||1)-1)*1440+Number(m[1])*60+Number(m[2])+delta;
 if(start<0||start>=16*1440)throw D.httpErr(409,'Timing adjustment would move a stop outside supported journey days');
 return {time:String(Math.floor(start%1440/60)).padStart(2,'0')+':'+String(start%60).padStart(2,'0'),
  day:Math.floor(start/1440)+1};
}
r.post('/trips/:sid/delay', can('trips.update_passengers'), h((req) => {
 const schedule=db.col('schedules').get(req.params.sid);
 if(!schedule)throw D.httpErr(404,'Trip not found');
 if(schedule.status==='cancelled'||schedule.trip_status==='completed')
  throw D.httpErr(409,'Cannot adjust a cancelled or completed service');
 const mins=Number(req.body.minutes),reason=String(req.body.reason||'').trim();
 if(!Number.isInteger(mins)||Math.abs(mins)>720)
  throw D.httpErr(400,'Timing change must be an integer between -720 and +720 minutes');
 if(mins!==0&&!reason)throw D.httpErr(400,'Reason is required for a timing change');
 if(req.body.notify&&!req.user.permissions.includes('trips.chat'))
  throw D.httpErr(403,'Messaging permission is required to record notifications');
 const previous=Number(schedule.delay_minutes||0),delta=mins-previous;
 const route=db.col('routes').get(schedule.route_id);
 if(!route)throw D.httpErr(404,'Route not found');
 const overrides={...(schedule.stage_overrides||{})};
 const modified=[];
 for(const st of route.stages||[]){
  const ev=(schedule.stop_events||{})[st.id]||{};
  if(ev.atime||ev.dtime||ev.arrival_time||ev.departure_time)continue;
  if(delta===0)continue;
  const old=overrides[st.id]||{};
  const shift=adjustedClock(old.time||st.time,old.day??st.day,delta);
  overrides[st.id]={...old,...shift};
  modified.push({id:st.id,time:shift.time,day:shift.day});
 }
 // Validate all mutations before saving. Departing the origin after a pickup
 // event has been recorded must not move that already-reached schedule stop.
 const seen=Object.values(schedule.stop_events||{}).some(x=>x?.atime||x?.dtime);
 const dep=!seen&&delta?adjustedClock(schedule.departure_time,1,delta):null;
 const lastStage=(route.stages||[]).at(-1),lastEvent=lastStage?(schedule.stop_events||{})[lastStage.id]||{}:{};
 const arrivalDay=Number(schedule.arrival_day_override||D.routeCities(route).at(-1)?.day||
   (String(schedule.arrival_time)<String(schedule.departure_time)?2:1));
 const arrival=delta&&!lastEvent.atime&&!lastEvent.dtime?
  adjustedClock(schedule.arrival_time,arrivalDay,delta):null;
 if(dep)schedule.departure_time=dep.time;
 if(arrival){schedule.arrival_time=arrival.time;schedule.arrival_day_override=arrival.day;}
 schedule.stage_overrides=overrides;
 schedule.delay_minutes=mins;
 schedule.delay_reason=reason;
 const recorded=[];
 if(req.body.notify){
  for(const b of db.col('bookings').filter(x=>String(x.schedule_id)===String(schedule.id)&&
      x.status==='confirmed'&&(x.passengers||[]).length)){
   const msg=db.col('messages').insert({
    conversation_id:D.passengerConvId(b,b.passengers[0]),direction:'out',channel:'whatsapp',
    template:'trip_delayed',text:'Your bus '+(mins>=0?'is delayed by':'is early by')+' '+
     Math.abs(mins)+' minutes. Reason: '+reason,phone:b.contact.phone,ts:U.nowIso(),
    read:true,by:req.user.name});
   recorded.push(msg.id);
  }
 }
 db.persist();
 D.audit('schedule',schedule.id,'trip',{op:'adjust_trip_time',previous_delay_minutes:previous,
   delay_minutes:mins,delta_minutes:delta,reason,adjusted_stops:modified.length},req.user);
 return {success:true,delay_minutes:mins,delta_minutes:delta,adjusted_stops:modified.length,
  modified_stops:modified,recorded:recorded.length,notified:recorded.length,delivery_verified:false};
}));

r.post('/trips/:sid/notify', can('trips.chat'), h((req) => {
  const s = db.col('schedules').get(req.params.sid); if (!s) throw D.httpErr(404, 'Trip not found');
  const { template, pnrs, text } = req.body;
  if(!Array.isArray(pnrs)||!pnrs.length||pnrs.length>200)throw D.httpErr(400,'Select at least one passenger PNR (maximum 200)');
  if(!['ticket_confirmation','bus_details','bus_cancellation','custom'].includes(template))throw D.httpErr(400,'Unsupported notification template');
  if(['custom','bus_cancellation'].includes(template)&&(!String(text||'').trim()||String(text).length>1000))throw D.httpErr(400,'Message text is required (maximum 1000 characters)');
  const v = s.vehicle_id ? db.col('vehicles').get(s.vehicle_id) : null;
  const msg = { ticket_confirmation: (b) => `Ticket ${b.pnr} confirmed. Seats ${b.passengers.map((p) => p.seat).join(', ')}.`, bus_details: (b) => `Bus ${v?.registration_number || 'TBA'} · Driver contact ${v?.phone_number || ''}. Track: /track/${b.pnr}`, bus_cancellation: () => text || 'We regret to inform that your bus has been cancelled. A full refund will be processed.', custom: () => text };
  const f = msg[template] || msg.custom; let n = 0;
  for (const b of db.col('bookings').filter((x) => x.schedule_id == s.id && x.status === 'confirmed' && (!pnrs || pnrs.includes(x.pnr)))) { db.col('messages').insert({ conversation_id: D.passengerConvId(b, b.passengers[0]), direction: 'out', channel: 'whatsapp', template, text: f(b), phone: b.contact.phone, ts: U.nowIso(), read: true, by: req.user.name }); n++; }
  return { success:true, recorded:n, delivery_verified:false };
}));

r.post('/trips/:sid/cancel', can('bookings.cancel'), h((req) => {
  const s = db.col('schedules').get(req.params.sid); if (!s) throw D.httpErr(404, 'Trip not found');
  const results = [];
  for (const b of db.col('bookings').filter((x) => x.schedule_id == s.id && x.status === 'confirmed')) results.push(D.cancelBooking(b.pnr, { by: 'operator', reason: req.body.reason || 'Bus cancelled', refund_pct: 100, notify: req.body.notify !== false }, req.user));
  s.status = 'cancelled'; s.is_active = false; db.persist();
  D.audit('schedule', s.id, 'trip', { op: 'bus_cancel', bookings: results.length }, req.user);
  return { success: true, cancelled: results.length, refunds: U.round2(U.sum(results, (x) => x.refund)) };
}));

// ---------------- Schedules ----------------
r.get('/schedules', can('schedules.view'), h((req) => {
  const T = U.today(); const from = req.query.from || T, to = req.query.to || U.addDays(T, 6);
  D.ensureSchedules(from, to);
  let list = db.col('schedules').filter((s) => s.travel_date >= from && s.travel_date <= to);
  if (req.query.route_id) list = list.filter((s) => s.route_id == req.query.route_id);
  if (req.query.status && req.query.status !== 'all') list = list.filter((s) => s.status === req.query.status);
  const fromCity = req.query.from_city_id, toCity = req.query.to_city_id;
  if (fromCity || toCity) list = list.filter((s) => { const rt = db.col('routes').get(s.route_id); if(!rt)return false; const a = fromCity ? D.cityOrder(rt, fromCity) : -1, b = toCity ? D.cityOrder(rt, toCity) : -1; return (fromCity ? a >= 0 : true) && (toCity ? b >= 0 : true) && (!fromCity || !toCity || b > a); });
  return { from, to, schedules: list.map((s) => { const c = scheduleCard(s); if (req.user.permissions.includes('schedules.financial')) { const p = Rp.tripPnl(s); c.expense_total = p.expense; c.net_profit = p.profit; } return c; }).sort((a, b) => a.travel_date.localeCompare(b.travel_date) || a.departure_time.localeCompare(b.departure_time)) };
}));
r.get('/schedules/deleted', can('schedules.view'), h(() => ({ deleted: db.col('routes').all().flatMap((rt) => (rt.deleted_trips || []).map((d) => ({ route_id: rt.id, service_number: rt.service_number, travel_date: d }))) })));
r.post('/schedules/restore', can('schedules.modify'), h((req) => { const rt = db.col('routes').get(req.body.route_id); rt.deleted_trips = (rt.deleted_trips || []).filter((d) => d !== req.body.travel_date); db.persist(); D.ensureSchedules(req.body.travel_date, req.body.travel_date); return { success: true }; }));

r.get('/schedules/:id', can('schedules.view'), h((req) => {
  const s = db.col('schedules').get(req.params.id); if (!s) throw D.httpErr(404, 'Schedule not found');
  const route = db.col('routes').get(s.route_id);
  return { ...scheduleCard(s), route: { id: route.id, service_number: route.service_number, name: route.name, via_cities: D.routeCities(route).map((c) => ({ ...c, name: D.cityName(c.city_id) })), stages: stagesFor(s, route) }, fares: s.fare_override || route.fares, fare_synced: !s.fare_override, seat_blocks: s.seat_blocks, unblocked: s.unblocked, auto_price: s.auto_price || null, telemetry: s.telemetry || null, stage_overrides: s.stage_overrides || {}, seat_fare_rules: s.seat_fare_rules || [], expense_overrides: s.expense_overrides || {}, ui_settings: s.ui_settings || {} };
}));

r.get('/schedules/:id/seat-layout', can('schedules.view'), h((req) => {
  const s = db.col('schedules').get(req.params.id); if (!s) throw D.httpErr(404, 'Schedule not found');
  D.expireHolds();
  return D.seatMap(s, req.query.from_city_id, req.query.to_city_id,req.user);
}));

r.put('/schedules/:id', can('schedules.modify'), h((req) => {
  const s = db.col('schedules').get(req.params.id); if (!s) throw D.httpErr(404, 'Schedule not found');
  const before = { vehicle_id: s.vehicle_id, crew: s.crew, departure_time: s.departure_time, sync_with_route: s.sync_with_route };
  const { vehicle_id, crew, departure_time, sync_with_route, stage_overrides, seat_fare_rules, expense_overrides, ui_settings } = req.body;
  if(vehicle_id!==undefined)Policy.explicitAccess(req,'Assign bus');
  if(crew!==undefined)Policy.explicitAccess(req,'Assign crew (driver, conductor, helper)');
  if(expense_overrides!==undefined)Policy.explicitAccess(req,'Edit expenses');
  if(departure_time!==undefined)Policy.explicitAccess(req,'Edit timings, coach & delay');
  if (vehicle_id !== undefined) s.vehicle_id = vehicle_id || null;
  if (crew) s.crew = crew;
  if (departure_time) { if (!/^\d{1,2}:\d{2}$/.test(departure_time)) throw D.httpErr(400, 'Departure time must be HH:MM'); s.departure_time = departure_time; }
  if (sync_with_route !== undefined) s.sync_with_route = !!sync_with_route;
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  if (stage_overrides !== undefined) {
    if (!isObj(stage_overrides)) throw D.httpErr(400, 'stage_overrides must be an object');
    const route = db.col('routes').get(s.route_id); const ids = new Set(route.stages.map((x) => String(x.id)));
    for (const [k, v] of Object.entries(stage_overrides)) { if (!ids.has(String(k))) throw D.httpErr(400, `Unknown stop ${k}`); if (v?.time && !/^\d{1,2}:\d{2}$/.test(v.time)) throw D.httpErr(400, 'Stop time must be HH:MM'); }
    s.stage_overrides = stage_overrides;
  }
  if (seat_fare_rules !== undefined) {
    if (!Array.isArray(seat_fare_rules)) throw D.httpErr(400, 'seat_fare_rules must be a list');
    s.seat_fare_rules = seat_fare_rules.map((x) => ({ name: String(x.name || 'Rule'), seats: (x.seats || []).map(String), days: (x.days || []).map(Number).filter((d) => d >= 0 && d <= 6), kind: x.kind === 'percent' ? 'percent' : 'flat', value: Number(x.value) || 0 })).filter((x) => x.seats.length && x.value);
  }
  if (expense_overrides !== undefined) {
    if (!isObj(expense_overrides)) throw D.httpErr(400, 'expense_overrides must be an object');
    if (!req.user.permissions.includes('schedules.financial')) throw D.httpErr(403, 'Financial permission required');
    s.expense_overrides = Object.fromEntries(Object.entries(expense_overrides).map(([k, v]) => [k, Math.max(0, Number(v) || 0)]));
    s.pnl_expense_version = (s.pnl_expense_version || 0) + 1;
  }
  if (ui_settings !== undefined) { if (!isObj(ui_settings)) throw D.httpErr(400, 'ui_settings must be an object'); s.ui_settings = ui_settings; }
  db.persist(); if (Object.keys(req.body).some((k) => k !== 'ui_settings')) D.audit('schedule', s.id, 'fields', { before, after: req.body }, req.user);
  return scheduleCard(s);
}));

r.post('/schedules/:id/toggle', can('schedules.toggle'), h((req) => {
  const s = db.col('schedules').get(req.params.id); if (!s) throw D.httpErr(404, 'Schedule not found');
  const on = req.body.active !== undefined ? !!req.body.active : s.status !== 'active';
  s.status = on ? 'active' : 'disabled'; s.is_active = on; s.manually_disabled = !on;
  db.persist(); D.audit('schedule', s.id, 'block', { op: on ? 'enable' : 'disable' }, req.user);
  return scheduleCard(s);
}));

r.delete('/schedules/:id', can('schedules.delete'), h((req) => {
  const s = db.col('schedules').get(req.params.id); if (!s) throw D.httpErr(404, 'Schedule not found');
  if (db.col('bookings').count((b) => b.schedule_id == s.id && b.status === 'confirmed')) throw D.httpErr(409, 'Schedule has confirmed bookings — cancel or shift them first');
  const rt = db.col('routes').get(s.route_id); rt.deleted_trips = [...new Set([...(rt.deleted_trips || []), s.travel_date])];
  db.col('schedules').remove(s.id); D.audit('schedule', s.id, 'block', { op: 'delete' }, req.user);
  return { success: true };
}));

r.get('/schedules/:id/fares', can('schedules.view'), h((req) => { const s = db.col('schedules').get(req.params.id); const rt = db.col('routes').get(s.route_id); return { synced: !s.fare_override, fares: (s.fare_override || rt.fares).map((f) => ({ ...f, from: D.cityName(f.from_city_id), to: D.cityName(f.to_city_id) })), auto_pricing: rt.auto_pricing, auto_price: s.auto_price || null, recommendation: recommend(s) }; }));
r.put('/schedules/:id/fares', can('schedules.fares'), h((req) => {
  const s = db.col('schedules').get(req.params.id);
  if (req.body.sync_with_route) s.fare_override = null; else s.fare_override = req.body.fares.map(({ from, to, ...f }) => f);
  db.persist(); D.audit('schedule', s.id, 'fares', { sync_fares_with_route: !!req.body.sync_with_route, fares: s.fare_override }, req.user);
  return { success: true };
}));
function recommend(s) {
  // Demand-based repricing: compare current occupancy against the time-to-departure curve.
  const card = scheduleCard(s); const rt = db.col('routes').get(s.route_id);
  const hrs = (new Date(`${s.travel_date}T${s.departure_time}:00`) - Date.now()) / 3600e3;
  const expected = hrs > 168 ? 15 : hrs > 72 ? 35 : hrs > 24 ? 60 : 85;
  const gap = card.occupancy_pct - expected; const main = (s.fare_override || rt.fares).find((f) => f.from_city_id == rt.origin_city_id && f.to_city_id == rt.destination_city_id) || {};
  const factor = Math.max(0.85, Math.min(1.25, 1 + gap / 200));
  const ap = rt.auto_pricing || { min: 600, max: 3000 };
  const clamp = (x) => Math.round(Math.max(ap.min, Math.min(ap.max, x)) / 10) * 10;
  return { expected_occupancy_pct: expected, occupancy_pct: card.occupancy_pct, factor: U.round2(factor), seater: clamp((main.seater || 0) * factor), sleeper_lower: clamp((main.sleeper_lower || 0) * factor), sleeper_upper: clamp((main.sleeper_upper || 0) * factor), computed_at: U.nowIso() };
}
r.post('/schedules/:id/apply-recommendation', can('schedules.fares'), h((req) => { const s = db.col('schedules').get(req.params.id); const rec = recommend(s); s.auto_price = { seater: rec.seater, sleeper_lower: rec.sleeper_lower, sleeper_upper: rec.sleeper_upper, at: rec.computed_at }; db.persist(); D.audit('schedule', s.id, 'fares', { op: 'auto_price', ...s.auto_price }, req.user); return rec; }));

r.post('/schedules/:id/blocks', can('bookings.block_seats'), h((req) => {
  const s = db.col('schedules').get(req.params.id);
  const { seats, reason, gender, action } = req.body;
  const expires_at=Policy.checkBlock(req,seats,action);
  if (action === 'unblock') { s.unblocked = [...new Set([...(s.unblocked || []), ...seats])]; s.seat_blocks = (s.seat_blocks || []).map((b) => ({ ...b, seats: b.seats.filter((x) => !seats.includes(x)) })).filter((b) => b.seats.length); }
  else if (action === 'follow_route') { s.unblocked = (s.unblocked || []).filter((x) => !seats.includes(x)); }
  else { s.seat_blocks = [...(s.seat_blocks || []), { seats, reason: reason || 'Blocked', gender: gender || null, source: 'schedule', by: req.user.name, at: U.nowIso(),expires_at }]; s.unblocked = (s.unblocked || []).filter((x) => !seats.includes(x)); }
  db.persist(); D.audit('schedule', s.id, 'block', { op: action || 'block', seats, reason }, req.user);
  return D.seatMap(s);
}));

r.get('/schedules/:id/pnl', can('schedules.financial'), h((req) => Rp.tripPnl(db.col('schedules').get(req.params.id))));
r.post('/schedules/:id/expenses', can('schedules.financial'), h((req) => {
  Policy.explicitAccess(req,'Edit expenses');
  const schedule = db.col('schedules').get(req.params.id);
  if (!schedule) throw D.httpErr(404, 'Schedule not found');
  if (schedule.status !== 'active') throw D.httpErr(409, 'Cannot add expense to disabled schedule');
  const amount = Number(req.body.amount), label = String(req.body.label || '').trim();
  if (req.body.amount == null || req.body.amount === '' || !Number.isFinite(amount) || amount < 0 || amount > 100000000)
    throw D.httpErr(400, 'Expense amount must be ₹0–₹10 crore');
  if (!label || label.length > 80) throw D.httpErr(400, 'Expense name must be 1–80 characters');
  const row = db.col('trip_expenses').insert({ schedule_id: schedule.id, key: String(req.body.key || 'manual').slice(0, 80),
    label, amount: Math.round(amount * 100) / 100, type: req.body.type === 'fixed' ? 'fixed' : 'running',
    source: '', by: req.user.name });
  schedule.pnl_expense_version = (schedule.pnl_expense_version || 0) + 1;
  db.persist();
  D.audit('schedule', schedule.id, 'pnl_expenses', { added: row.id, label: row.label, amount: row.amount }, req.user);
  return row;
}));
r.get('/schedules/:id/history', can('schedules.view'), h((req) => ({ history: db.col('edit_history').filter((e) => e.entity === 'schedule' && e.entity_id == req.params.id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, Number(req.query.limit) || 100) })));
r.get('/schedules/:id/booking-history', can('schedules.view'), h((req) => ({ history: db.col('bookings').filter((b) => b.schedule_id == req.params.id).map((b) => ({ pnr: b.pnr, ticket_number: b.ticket_number, source: b.source, status: b.status, contact_name: b.contact.name, total_seats: b.passengers.length, total_amount: b.fare.total, blocked_at: b.booked_at, confirmed_at: b.status !== 'hold' ? b.booked_at : null, cancelled_at: b.cancelled_at || null, expired_at: b.expired_at || null, passengers: b.passengers })).sort((a, b) => b.blocked_at.localeCompare(a.blocked_at)) })));

// ---------------- Bookings ----------------
r.get('/payment-options', can('bookings.create'), h((req) => { const amt = Number(req.query.amount) || 0; const me = db.col('users').get(req.user.id); const isAgent = me?.role === 'agent'; const comm = isAgent ? me.commission_pct || 0 : 0; return { agent_type: isAgent ? me.agent_type : 'staff', ticket_amount: amt, commission_percent: comm, ticket_net_payable: U.round2(amt * (1 - comm / 100)), options: ['paid', 'unpaid', 'settle_later'], credit_limit: me?.credit_limit || null }; }));
r.post('/bookings', can('bookings.create'), h((req) => {
  const body = { ...req.body };
  Policy.checkOnBehalf(req,body);
  if(body.agent_phone && req.user.role!=='agent' && !req.user.permissions.includes('bookings.on_behalf'))throw D.httpErr(403,'Cannot book on behalf of agents');
  if (req.user.role === 'agent') { body.source = 'agent'; body.agent_phone = req.user.phone; delete body.override_rules; }
  return D.createBooking(body, req.user);
}));
r.post('/bookings/quote', can('bookings.create'), h((req) => {
  const s = db.col('schedules').get(req.body.schedule_id); const map = D.seatMap(s, req.body.from_city_id, req.body.to_city_id);
  const seats = Object.fromEntries(map.decks.flatMap((d) => d.seats).map((x) => [x.code, x]));
  const fares = (req.body.seats || []).map((c, i) => (req.body.fares?.[i] != null ? Number(req.body.fares[i]) : seats[c]?.fare || 0));
  if(req.body.agent_phone && req.user.role!=='agent'){Policy.checkOnBehalf(req,req.body);if(!req.user.permissions.includes('bookings.on_behalf'))throw D.httpErr(403,'Cannot quote on behalf of agents');}
  return D.priceBooking({ seatsFares: fares, source: req.body.source || 'branch', coupon: req.body.coupon, agentPhone: req.user.role==='agent'?req.user.phone:req.body.agent_phone, milesUsed: req.body.miles_used, contactPhone:req.body.contact?.phone||req.body.contact_phone||req.body.phone, travelDate:s.travel_date,paymentMode:req.body.payment_mode||'paid' });
}));
r.get('/bookings/search', can('bookings.view_all'), h((req) => {
  const q = String(req.query.q || '').toLowerCase().trim(); if (q.length < 3) return { results: [] };
  const res = db.col('bookings').filter((b) => b.pnr.toLowerCase().includes(q) || b.ticket_number.includes(q) || b.contact.phone.includes(q) || b.contact.name.toLowerCase().includes(q))
   .filter(b=>Policy.bookingAllowed(req,b)).slice(-50).reverse();
  return { results: res.map((b) => ({ pnr: b.pnr, ticket: b.ticket_number, name: b.contact.name, phone: (req.user.permissions.includes('bookings.see_phone')&&Policy.viewPhone(req))?b.contact.phone:'••••••••••', travel_date: b.travel_date, schedule_id: b.schedule_id, service: db.col('routes').get(b.route_id)?.service_number, seats: b.passengers.map((p) => p.seat), status: b.status, total: b.fare.total, source: b.source })) };
}));
r.get('/bookings/:pnr', can('bookings.view_all'), h((req) => {
  const b = db.col('bookings').find((x) => x.pnr === req.params.pnr || x.ticket_number === req.params.pnr); if (!b) throw D.httpErr(404, 'Booking not found');
  Policy.requireBooking(req,b);
  const rt = db.col('routes').get(b.route_id);
  return Policy.maskedBooking({ ...b, service_number: rt.service_number, from: D.cityName(b.from_city_id), to: D.cityName(b.to_city_id), boarding: rt.stages.find((x) => x.id == b.boarding_stage_id), dropping: rt.stages.find((x) => x.id == b.dropping_stage_id), refund_quote: b.status === 'confirmed' ? D.refundFor(b) : null }, req.user.permissions.includes('bookings.see_phone')&&Policy.viewPhone(req));
}));
r.get('/bookings/:pnr/refund-quote', can('bookings.cancel'), h((req) => { const b = db.col('bookings').find((x) => x.pnr === req.params.pnr); return D.refundFor(b, req.query.by || 'passenger', req.query.refund_pct ?? null); }));
r.post('/bookings/:pnr/cancel', can('bookings.cancel'), h((req) => {
  const booking=db.col('bookings').find(x=>x.pnr===req.params.pnr);
  Policy.requireBooking(req,booking,'Cancel tickets');
  Policy.checkCancel(req,booking);
  return D.cancelBooking(req.params.pnr,req.body,req.user);
}));
r.post('/bookings/:pnr/shift', can('bookings.modify'), h((req) => {
  Policy.requireBooking(req,db.col('bookings').find(x=>x.pnr===req.params.pnr),'Shift seat / date');
  return D.shiftBooking(req.params.pnr,req.body,req.user);
}));
r.post('/bookings/:pnr/confirm-payment', can('bookings.modify'), h((req) => { const b = db.col('bookings').find((x) => x.pnr === req.params.pnr); if (b.status !== 'hold') throw D.httpErr(400, 'Not on hold'); b.status = 'confirmed'; const oldPayment=b.payment;b.payment = 'paid';try{D.awardMiles(b);}catch(e){b.payment=oldPayment;throw e;} b.payment_method = req.body.method || 'upi'; b.hold_expires_at = null; db.persist(); D.notify('payment.received', b); return b; }));
r.post('/bookings/:pnr/release', can('bookings.release_hold'), h((req) => { const b = db.col('bookings').find((x) => x.pnr === req.params.pnr); if (b.status !== 'hold') throw D.httpErr(400, 'Not on hold'); b.status = 'released'; b.release_reason = req.body.reason || 'Force release'; b.cancelled_at = U.nowIso(); db.persist(); D.audit('schedule', b.schedule_id, 'bookings', { op: 'release', pnr: b.pnr, reason: b.release_reason }, req.user); return b; }));
r.post('/bookings/:pnr/mark-paid', can('accounts.ledger'), h((req) => { const b = db.col('bookings').find((x) => x.pnr === req.params.pnr); const oldPayment=b.payment;b.payment='paid';try{D.awardMiles(b);}catch(e){b.payment=oldPayment;throw e;} db.persist(); return b; }));
r.post('/bookings/:pnr/comments',can('bookings.comments'),h(req=>{
  Policy.checkComment(req);
  const b=Policy.requireBooking(req,db.col('bookings').find(x=>x.pnr===req.params.pnr),'Add comments to a PNR');
  const text=String(req.body?.text||'').trim();
  if(!text||text.length>2000)throw D.httpErr(400,'Enter a staff-only comment (maximum 2000 characters)');
  b.comments=b.comments||[];
  const record={text,by:req.user.name,at:U.nowIso()};
  b.comments.push(record);
  D.audit('schedule',b.schedule_id,'bookings',{op:'comment',pnr:b.pnr},req.user);
  db.persist();
  return b.comments;
}));
r.put('/bookings/:pnr',can('bookings.modify'),h(req=>{
  const b=Policy.requireBooking(req,db.col('bookings').find(x=>x.pnr===req.params.pnr),'Edit passengers & points');
  if(b.status!=='confirmed')throw D.httpErr(409,'Only confirmed tickets may be edited');
  const {contact,passengers,boarding_stage_id,dropping_stage_id}=req.body||{};
  const update={},fields=[];
  if(contact!==undefined){
    if(!contact||typeof contact!=='object'||Array.isArray(contact))throw D.httpErr(400,'Invalid contact');
    const name=String(contact.name||'').trim(),phone=String(contact.phone||'').trim(),email=String(contact.email||'').trim();
    if(!name||name.length>120)throw D.httpErr(400,'Contact name is required (maximum 120 characters)');
    if(!/^\d{10}$/.test(phone))throw D.httpErr(400,'Mobile must contain 10 digits');
    if(email.length>254||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))throw D.httpErr(400,'Enter a valid email address');
    update.contact={name,phone,email};fields.push('Contact & Journey Details');
  }
  if(passengers!==undefined){
    if(!Array.isArray(passengers)||!passengers.length||passengers.length>b.passengers.length)
      throw D.httpErr(400,'Provide valid passenger seat records');
    const seen=new Set(),pax=[];
    for(const input of passengers){
      const seat=String(input.seat||'');
      if(seen.has(seat))throw D.httpErr(400,'Duplicate passenger seat');
      seen.add(seat);
      const existing=b.passengers.find(p=>String(p.seat)===seat);
      if(!existing)throw D.httpErr(400,'Seat does not belong to this PNR');
      if(existing.status==='cancelled'){
        // The older booking editor may submit unchanged cancelled rows.
        // Never modify or reactivate a cancelled passenger.
        if(input.name!==undefined&&String(input.name)!==String(existing.name))
          throw D.httpErr(400,'Cancelled passenger records cannot be edited');
        continue;
      }
      const old=existing;
      const name=String(input.name??old.name??'').trim(),age=Number(input.age??old.age);
      const rawGender=String(input.gender??old.gender??'').trim().toUpperCase();
      const gender=rawGender==='FEMALE'?'F':rawGender==='MALE'?'M':
        rawGender==='OTHER'?'O':rawGender;
      if(!name||name.length>120||!Number.isInteger(age)||age<1||age>120||!['M','F','O'].includes(gender))
        throw D.httpErr(400,'Each passenger needs a name, age 1–120 and gender M/F/O');
      pax.push({old,name,age,gender});
    }
    if(!pax.length)throw D.httpErr(400,'No active passenger updates supplied');
    update.passengers=pax;fields.push('Passenger Information');
  }
  const route=db.col('routes').get(b.route_id),schedule=db.col('schedules').get(b.schedule_id);
  if(!route||!schedule)throw D.httpErr(404,'Booked trip not found');
  const stages=(route.stages||[]).map(st=>({...st,...(schedule.stage_overrides?.[st.id]||{})}));
  const verify=(id,type,city)=>{
    const st=stages.find(x=>String(x.id)===String(id));
    if(!st||st.type!==type||String(st.city_id)!==String(city))throw D.httpErr(400,'Pickup/drop must belong to the booked city and stop type');
    return st.id;
  };
  if(boarding_stage_id!=null&&boarding_stage_id!==''){
    update.boarding_stage_id=verify(boarding_stage_id,'pickup',b.from_city_id);
    fields.push('Pickup Point');
  }
  if(dropping_stage_id!=null&&dropping_stage_id!==''){
    update.dropping_stage_id=verify(dropping_stage_id,'drop',b.to_city_id);
    fields.push('Drop Point');
  }
  if(!fields.length)throw D.httpErr(400,'No editable booking fields submitted');
  if(update.contact)Object.assign(b.contact,update.contact);
  if(update.passengers)update.passengers.forEach(x=>Object.assign(x.old,{name:x.name,age:x.age,gender:x.gender}));
  if(update.boarding_stage_id!=null)b.boarding_stage_id=update.boarding_stage_id;
  if(update.dropping_stage_id!=null)b.dropping_stage_id=update.dropping_stage_id;
  D.audit('schedule',b.schedule_id,'bookings',{op:'edit',pnr:b.pnr,fields},req.user);
  db.persist();
  D.notify('booking.modified',b);
  return Policy.maskedBooking(b,Policy.viewPhone(req));
}));

module.exports = r;
