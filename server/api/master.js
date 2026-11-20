// Master data: routes, coaches, vehicles (fleet), staff & payroll.
const express = require('express');
const db = require('../db');
const U = require('../util');
const D = require('../domain');
const { can, checkStepUp } = require('../auth');

const r = express.Router();
const h = (fn) => (req, res) => { try { const out = fn(req, res); if (out !== undefined) res.json(out); } catch (e) { res.status(e.status || 500).json({ success: false, message: e.message }); } };
const need = (x, msg = 'Not found') => { if (!x) throw D.httpErr(404, msg); return x; };

// ---------------- Cities ----------------
r.get('/cities', h(() => ({ cities: db.col('cities').all() })));
r.post('/cities', can('routes.create'), h((req) => { if (!req.body.name) throw D.httpErr(400, 'City name required'); return db.col('cities').insert({ name: req.body.name, state: req.body.state || '', lat: Number(req.body.lat) || null, lng: Number(req.body.lng) || null }); }));
r.get('/city-pairs', h(() => {
  const m = {};
  for (const rt of db.col('routes').filter((x) => x.status === 'active')) { const v = D.routeCities(rt); for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) { const k = `${v[i].city_id}-${v[j].city_id}`; m[k] = m[k] || { origin_id: v[i].city_id, destination_id: v[j].city_id, origin_name: D.cityName(v[i].city_id), destination_name: D.cityName(v[j].city_id), is_main: v[i].city_id == rt.origin_city_id && v[j].city_id == rt.destination_city_id, route_count: 0 }; m[k].route_count++; } }
  return { pairs: Object.values(m).sort((a, b) => b.is_main - a.is_main || b.route_count - a.route_count) };
}));

// ---------------- Routes ----------------
function routeSummary(rt) {
  const v = rt.vehicle_id ? db.col('vehicles').get(rt.vehicle_id) : null;
  const coach = db.col('coaches').get(rt.coach_template_id);
  const main = (rt.fares || []).find((f) => f.from_city_id == rt.origin_city_id && f.to_city_id == rt.destination_city_id);
  const upcoming = db.col('schedules').count((s) => s.route_id === rt.id && s.travel_date >= U.today() && s.status === 'active');
  return { id: rt.id, service_number: rt.service_number, name: rt.name, origin: D.cityName(rt.origin_city_id), destination: D.cityName(rt.destination_city_id), origin_city_id: rt.origin_city_id, destination_city_id: rt.destination_city_id, departure_time: rt.departure_time, arrival_time: rt.arrival_time, duration_minutes: rt.duration_minutes, distance_km: rt.distance_km, status: rt.status, vehicle: v?.registration_number || null, coach: coach?.name || null, pickups: rt.stages.filter((s) => s.type === 'pickup').length, drops: rt.stages.filter((s) => s.type === 'drop').length, breaks: rt.stages.filter((s) => s.type === 'break').length, main_fare: main || null, upcoming_trips: upcoming, run_pattern: rt.run_pattern, tags: rt.tags };
}
r.get('/routes', can('routes.view'), h((req) => { const st = req.query.status || 'active'; return { routes: db.col('routes').filter((x) => st === 'all' || x.status === st).map(routeSummary) }; }));
r.get('/routes/:id', can('routes.view'), h((req) => { const rt = need(db.col('routes').get(req.params.id)); return { ...rt, summary: routeSummary(rt), via_cities: D.routeCities(rt).map((c) => ({ ...c, name: D.cityName(c.city_id) })), fares: (rt.fares || []).map((f) => ({ ...f, from: D.cityName(f.from_city_id), to: D.cityName(f.to_city_id) })) }; }));
r.post('/routes', can('routes.create'), h((req) => {
  const b = req.body;
  if (!b.service_number || !b.origin_city_id || !b.destination_city_id || !b.departure_time) throw D.httpErr(400, 'Service number, origin, destination and departure time are required');
  if (db.col('routes').find((x) => x.service_number === b.service_number && x.status !== 'deleted')) throw D.httpErr(409, 'Service number already in use');
  const rt = db.col('routes').insert({
    service_number: b.service_number, name: b.name || b.service_number, origin_city_id: Number(b.origin_city_id), destination_city_id: Number(b.destination_city_id), departure_time: b.departure_time, arrival_time: b.arrival_time || '', duration_minutes: Number(b.duration_minutes) || null, distance_km: Number(b.distance_km) || null,
    coach_template_id: b.coach_template_id ? Number(b.coach_template_id) : null, vehicle_id: b.vehicle_id ? Number(b.vehicle_id) : null, assignments: b.vehicle_id ? [{ vehicle_id: Number(b.vehicle_id), crew: [] }] : [], status: 'inactive',
    run_pattern: b.run_pattern || { type: 'daily' }, start_date: b.start_date || U.today(), end_date: b.end_date || null,
    via_cities: [{ city_id: Number(b.origin_city_id), order: 0, day: 1, time: b.departure_time }, { city_id: Number(b.destination_city_id), order: 1, day: 2, time: b.arrival_time || '' }],
    stages: [], fares: [{ from_city_id: Number(b.origin_city_id), to_city_id: Number(b.destination_city_id), seater: Number(b.fare) || 1000, sleeper_lower: Math.round((Number(b.fare) || 1000) * 1.25), sleeper_upper: Math.round((Number(b.fare) || 1000) * 1.15) }],
    seat_fare_rules: [], seat_blocks: [], refund_slabs: [{ hours_before: 24, refund_pct: 75 }, { hours_before: 12, refund_pct: 50 }, { hours_before: 0, refund_pct: 0 }],
    expenses: { fixed: [], running: [] }, call_settings: { cloud_calling: true, number_masking: true, direct_to_vehicle: true, driver_gps: true, automated_calls: { boarding_call: true, bus_near_call: true, rating_call: true } },
    auto_pricing: { enabled: false, min: 600, max: 3000, strategy: 'balanced' }, tags: {}, sub_routes: [], deleted_trips: [],
  });
  D.audit('route', rt.id, 'fields', { op: 'create' }, req.user);
  return rt;
}));
const ROUTE_SECTIONS = ['service_number', 'name', 'departure_time', 'arrival_time', 'duration_minutes', 'distance_km', 'coach_template_id', 'vehicle_id', 'assignments', 'status', 'run_pattern', 'start_date', 'end_date', 'via_cities', 'stages', 'fares', 'seat_fare_rules', 'seat_blocks', 'refund_slabs', 'expenses', 'call_settings', 'auto_pricing', 'tags', 'sub_routes', 'business_rules'];
r.put('/routes/:id', can('routes.modify'), h((req) => {
  const rt = need(db.col('routes').get(req.params.id));
  const changes = {};
  for (const k of ROUTE_SECTIONS) if (req.body[k] !== undefined) { changes[k] = [rt[k], req.body[k]]; rt[k] = req.body[k]; }
  if (req.body.stages) { let n = Math.max(10000, ...db.col('routes').all().flatMap((x) => x.stages.map((s) => s.id || 0))); for (const s of rt.stages) if (!s.id) s.id = ++n; }
  if (rt.status === 'active') { const ok = validateRoute(rt); if (ok.length) throw D.httpErr(400, `Cannot activate: ${ok.join('; ')}`); }
  db.persist();
  const section = Object.keys(changes).some((k) => k === 'stages') ? 'stops' : Object.keys(changes).some((k) => k === 'fares' || k === 'seat_fare_rules') ? 'fares' : 'fields';
  D.audit('route', rt.id, section, { op: 'update', changes: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, typeof v[1] === 'object' ? { changed: true } : v])) }, req.user);
  // propagate time changes to future schedules that follow route
  if (changes.departure_time) for (const s of db.col('schedules').filter((x) => x.route_id === rt.id && x.travel_date >= (req.body.effective_from || U.today()) && x.sync_with_route !== false)) s.departure_time = rt.departure_time;
  if (changes.status && rt.status === 'active') D.ensureSchedules(U.today(), U.addDays(U.today(), 30));
  if (changes.status && rt.status !== 'active') for (const s of db.col('schedules').filter((x) => x.route_id === rt.id && x.travel_date >= U.today())) { s.status = 'disabled'; s.is_active = false; }
  return { ...rt, summary: routeSummary(rt) };
}));
function validateRoute(rt) {
  const issues = [];
  if (!rt.coach_template_id) issues.push('set a coach');
  if (!rt.stages.some((s) => s.type === 'pickup')) issues.push('add at least one pickup point');
  if (!rt.stages.some((s) => s.type === 'drop')) issues.push('add at least one drop point');
  if (!(rt.fares || []).length) issues.push('add fares');
  return issues;
}
r.get('/routes/:id/validate', can('routes.view'), h((req) => {
  const rt = need(db.col('routes').get(req.params.id));
  const issues = validateRoute(rt).map((m) => ({ level: 'error', message: m }));
  const stops = [...rt.stages].filter((s) => s.type !== 'break').sort((a, b) => a.day - b.day || U.toMin(a.time) - U.toMin(b.time));
  for (const s of rt.stages) { if (!s.lat || !s.lng) issues.push({ level: 'warn', stage_id: s.id, message: `${s.name}: no map location` }); if (!s.time) issues.push({ level: 'warn', stage_id: s.id, message: `${s.name}: missing time` }); }
  for (let i = 1; i < stops.length; i++) { const a = stops[i - 1], b = stops[i]; if (a.lat && b.lat) { const km = U.haversineKm(a, b); const mins = (b.day - a.day) * 1440 + U.toMin(b.time) - U.toMin(a.time); if (mins > 0 && km / (mins / 60) > 100) issues.push({ level: 'warn', stage_id: b.id, message: `${b.name}: ${Math.round(km)} km from ${a.name} in ${mins} min — time or pin probably wrong` }); } }
  return { ok: !issues.some((i) => i.level === 'error'), issues };
}));
r.post('/routes/:id/shift-time', can('routes.modify'), h((req) => {
  const rt = need(db.col('routes').get(req.params.id)); const delta = (Number(req.body.hours) || 0) * 60 + (Number(req.body.minutes) || 0) * (req.body.direction === 'advance' ? -1 : 1);
  const mv = (o) => { const m = U.toMin(o.time) + (o.day - 1) * 1440 + delta; o.time = U.fromMin(m); o.day = 1 + Math.floor(m / 1440); };
  rt.departure_time = U.fromMin(U.toMin(rt.departure_time) + delta); rt.stages.forEach(mv); rt.via_cities.forEach(mv);
  for (const s of db.col('schedules').filter((x) => x.route_id === rt.id && x.travel_date >= (req.body.from_date || U.today()) && x.sync_with_route !== false)) s.departure_time = rt.departure_time;
  db.persist(); D.audit('route', rt.id, 'fields', { op: 'shift_time', minutes: delta }, req.user); return routeSummary(rt);
}));
r.post('/routes/:id/stops/import', can('routes.modify'), h((req) => {
  // body: { rows: [{type,name,city,day,time,lat,lng,address,landmark,contact}], mode: 'append'|'replace' }
  const rt = need(db.col('routes').get(req.params.id)); const rows = req.body.rows || []; const errs = []; const out = [];
  let n = Math.max(10000, ...db.col('routes').all().flatMap((x) => x.stages.map((s) => s.id || 0)));
  rows.forEach((row, i) => { const c = db.col('cities').find((x) => x.name.toLowerCase() === String(row.city || '').toLowerCase()); if (!row.name || !row.time || (!c && row.type !== 'break')) return errs.push({ row: i + 1, message: 'Name, time and a known city are required' }); out.push({ id: ++n, type: row.type || 'pickup', name: row.name, city_id: c?.id || null, day: Number(row.day) || 1, time: row.time, lat: Number(row.lat) || null, lng: Number(row.lng) || null, address: row.address || '', landmark: row.landmark || '', contact_number: row.contact || '' }); });
  rt.stages = req.body.mode === 'replace' ? out : [...rt.stages, ...out]; db.persist(); D.audit('route', rt.id, 'stops', { op: 'import', added: out.length }, req.user);
  return { imported: out.length, skipped: errs };
}));
r.get('/routes/:id/history', can('routes.view'), h((req) => ({ history: db.col('edit_history').filter((e) => e.entity === 'route' && e.entity_id == req.params.id && (!req.query.section || req.query.section === 'all' || e.section === req.query.section)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, Number(req.query.limit) || 100) })));
r.get('/routes/:id/halts', can('routes.view'), h((req) => {
  // GPS halt analysis: compare scheduled pins/times against completed-trip stop events (simulated where GPS missing).
  const rt = need(db.col('routes').get(req.params.id)); const days = Number(req.query.days) || 15; const from = U.addDays(U.today(), -days);
  const trips = db.col('schedules').filter((s) => s.route_id === rt.id && s.travel_date >= from && s.trip_status === 'completed');
  const R = U.rng(rt.id * 97);
  const stops = rt.stages.filter((s) => s.type !== 'break').map((s) => { const off = R.int(5, 160); const dt = R.int(-6, 14); return { stage_id: s.id, kind: s.type === 'pickup' ? 'boarding' : 'dropping', name: s.name, trips_halted: trips.length, offset_m: off, time_delta_min: dt, suggested_time: U.fromMin(U.toMin(s.time) + dt), status: off > 120 ? 'move_pin' : Math.abs(dt) > 10 ? 'change_time' : 'fine' }; });
  return { route_id: rt.id, days, trips: trips.length, stops };
}));
r.post('/routes/:id/delete-otp', can('routes.delete'), h((req) => require('../auth').requestStepUp(req.user, `route_delete_${req.params.id}`)));
r.delete('/routes/:id', can('routes.delete'), h((req) => {
  const rt = need(db.col('routes').get(req.params.id));
  if (!checkStepUp(req.user, `route_delete_${rt.id}`, req.body?.otp || req.query.otp)) throw D.httpErr(403, 'Valid OTP required to delete route');
  rt.status = 'deleted'; for (const s of db.col('schedules').filter((x) => x.route_id === rt.id && x.travel_date >= U.today())) { s.status = 'disabled'; s.is_active = false; }
  db.persist(); D.audit('route', rt.id, 'fields', { op: 'delete' }, req.user); return { success: true };
}));
r.post('/routes/:id/restore', can('routes.modify'), h((req) => { const rt = need(db.col('routes').get(req.params.id)); rt.status = 'inactive'; db.persist(); D.audit('route', rt.id, 'fields', { op: 'restore' }, req.user); return routeSummary(rt); }));
r.post('/routes/:id/duplicate', can('routes.create'), h((req) => { const rt = need(db.col('routes').get(req.params.id)); const { id, created_at, updated_at, ...rest } = JSON.parse(JSON.stringify(rt)); return db.col('routes').insert({ ...rest, service_number: req.body.service_number || `${rt.service_number}-COPY`, status: 'inactive', deleted_trips: [] }); }));

// ---------------- Coaches ----------------
r.get('/coaches', can('fleet.view'), h(() => ({ coaches: db.col('coaches').all().map((c) => ({ ...c, capacity: c.layout.capacity, vehicles: db.col('vehicles').count((v) => v.coach_template_id === c.id), routes: db.col('routes').count((x) => x.coach_template_id === c.id && x.status !== 'deleted') })) })));
r.get('/coaches/:id', can('fleet.view'), h((req) => need(db.col('coaches').get(req.params.id))));
r.post('/coaches', can('fleet.modify'), h((req) => { const b = req.body; const layout = b.layout || D.buildLayout({ kind: b.kind || 'seater_sleeper', pattern: b.pattern || '2+1' }); return db.col('coaches').insert({ name: b.name || 'New coach', bus_type: b.bus_type || '', pattern: b.pattern || '2+1', layout, amenities: b.amenities || [], emergency_exits: b.emergency_exits || [] }); }));
r.put('/coaches/:id', can('fleet.modify'), h((req) => { const c = need(db.col('coaches').get(req.params.id)); const b = req.body; if (b.kind) b.layout = D.buildLayout({ kind: b.kind, pattern: b.pattern || c.pattern }); if (b.layout) b.layout.capacity = b.layout.decks.reduce((a, d) => a + d.seats.length, 0); return db.col('coaches').update(c.id, b); }));
r.delete('/coaches/:id', can('fleet.delete'), h((req) => { if (db.col('vehicles').count((v) => v.coach_template_id == req.params.id) || db.col('routes').count((x) => x.coach_template_id == req.params.id && x.status !== 'deleted')) throw D.httpErr(409, 'Coach is in use'); db.col('coaches').remove(req.params.id); return { success: true }; }));

// ---------------- Vehicles ----------------
function vehicleView(v) {
  const T = U.today(); const docs = db.col('documents').filter((d) => d.owner_type === 'vehicle' && d.owner_id === v.id);
  const next = db.col('schedules').filter((s) => s.vehicle_id === v.id && s.travel_date >= T && s.status === 'active').sort((a, b) => a.travel_date.localeCompare(b.travel_date) || a.departure_time.localeCompare(b.departure_time))[0];
  return { ...v, coach: db.col('coaches').get(v.coach_template_id)?.name, documents: docs.map((d) => ({ ...d, state: !d.expiry_date ? 'ok' : d.expiry_date < T ? 'EXPIRED' : d.expiry_date <= U.addDays(T, 30) ? 'EXPIRING SOON' : 'ok' })), doc_alerts: docs.filter((d) => d.expiry_date && d.expiry_date <= U.addDays(T, 30)).length, next_trip: next ? { schedule_id: next.id, service: db.col('routes').get(next.route_id)?.service_number, travel_date: next.travel_date, departure_time: next.departure_time } : null };
}
r.get('/vehicles', can('fleet.view'), h(() => ({ vehicles: db.col('vehicles').all().map(vehicleView) })));
r.get('/vehicles/positions', can('fleet.view'), h(() => {
  // Simulated live positions: moving buses interpolate along their route during a live trip.
  const out = []; const now = Date.now();
  for (const v of db.col('vehicles').all()) {
    const s = db.col('schedules').filter((x) => x.vehicle_id === v.id && x.status === 'active').find((x) => { const dep = new Date(`${x.travel_date}T${x.departure_time}:00`).getTime(); return now >= dep && now <= dep + 14 * 3600e3; });
    let pos = v.position;
    if (s) { const rt = db.col('routes').get(s.route_id); const pts = rt.stages.filter((x) => x.lat); const dep = new Date(`${s.travel_date}T${s.departure_time}:00`).getTime(); const f = Math.min(1, (now - dep) / (13 * 3600e3)); const i = Math.min(pts.length - 2, Math.floor(f * (pts.length - 1))); const t = f * (pts.length - 1) - i; const a = pts[i], b = pts[i + 1]; pos = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t, speed: 62, state: 'MOVING', ts: now }; v.position = pos; }
    out.push({ id: v.id, plate: v.registration_number, ...pos, service: s ? db.col('routes').get(s.route_id).service_number : null, schedule_id: s?.id || null });
  }
  return { now, vehicles: out };
}));
r.get('/vehicles/:id', can('fleet.view'), h((req) => vehicleView(need(db.col('vehicles').get(req.params.id)))));
r.get('/vehicles/:id/live', can('fleet.view'), h((req) => {
  const v = need(db.col('vehicles').get(req.params.id)); const T = U.today();
  const s = db.col('schedules').filter((x) => x.vehicle_id === v.id && x.travel_date >= U.addDays(T, -1) && x.status === 'active').sort((a, b) => a.travel_date.localeCompare(b.travel_date))[0];
  const rt = s ? db.col('routes').get(s.route_id) : null;
  return { vehicleId: v.id, plate: v.registration_number, fix: v.position, service: s ? { scheduleId: s.id, travelDate: s.travel_date, serviceNumber: rt.service_number, serviceName: rt.name, origin: D.cityName(rt.origin_city_id), destination: D.cityName(rt.destination_city_id), departure: `${s.travel_date}T${s.departure_time}`, staff: (s.crew || []).map((c) => ({ name: db.col('staff').get(c.staff_id)?.name, phone: db.col('staff').get(c.staff_id)?.phone, role: c.role })), path: rt.stages.filter((x) => x.lat).map((x) => [x.lat, x.lng]) } : null, health: v.health };
}));
r.post('/vehicles', can('fleet.modify'), h((req) => { const b = req.body; if (!b.registration_number) throw D.httpErr(400, 'Registration number required'); if (db.col('vehicles').find((v) => v.registration_number.replace(/\s/g, '') === b.registration_number.replace(/\s/g, ''))) throw D.httpErr(409, 'Vehicle already exists'); return db.col('vehicles').insert({ status: 'active', ownership_type: 'permanent', vehicle_role: 'main', gps_enabled: false, dms_enabled: false, position: { lat: 17.385, lng: 78.4867, speed: 0, state: 'STOPPED', ts: Date.now() }, health: { status: 'GOOD', alerts: [] }, tags: {}, ...b, coach_template_id: b.coach_template_id ? Number(b.coach_template_id) : null }); }));
r.put('/vehicles/:id', can('fleet.modify'), h((req) => { need(db.col('vehicles').get(req.params.id)); const b = { ...req.body }; if (b.coach_template_id) b.coach_template_id = Number(b.coach_template_id); return db.col('vehicles').update(req.params.id, b); }));
r.delete('/vehicles/:id', can('fleet.delete'), h((req) => { if (db.col('schedules').count((s) => s.vehicle_id == req.params.id && s.travel_date >= U.today() && s.status === 'active')) throw D.httpErr(409, 'Vehicle is assigned to upcoming trips'); db.col('vehicles').remove(req.params.id); return { success: true }; }));

// ---------------- Documents (vehicles & staff) ----------------
r.get('/documents/:owner_type/:owner_id', h((req) => ({ documents: db.col('documents').filter((d) => d.owner_type === req.params.owner_type && d.owner_id == req.params.owner_id) })));
r.post('/documents/:owner_type/:owner_id', can('fleet.documents'), h((req) => db.col('documents').insert({ owner_type: req.params.owner_type, owner_id: Number(req.params.owner_id), document_type: req.body.document_type || 'OTHER', document_name: req.body.document_name || req.body.document_type, document_number: req.body.document_number || null, expiry_date: req.body.expiry_date || null, issue_date: req.body.issue_date || null, visibility: req.body.visibility || 'private', file_name: req.body.file_name || null, file_data: req.body.file_data || null, category: 'compliance', verification_status: 'pending' })));
r.put('/documents/:id', can('fleet.documents'), h((req) => db.col('documents').update(req.params.id, req.body)));
r.delete('/documents/:id', can('fleet.documents'), h((req) => ({ success: db.col('documents').remove(req.params.id) })));
r.get('/documents/:id/file', h((req, res) => { const d = need(db.col('documents').get(req.params.id)); if (!d.file_data) throw D.httpErr(404, 'No file uploaded'); const [meta, b64] = d.file_data.split(','); res.setHeader('Content-Type', meta.replace('data:', '').replace(';base64', '')); res.send(Buffer.from(b64, 'base64')); }));

// ---------------- Staff ----------------
function staffView(s) { const T = U.today(); const m = T.slice(0, 7); const att = db.col('attendance').filter((a) => a.staff_id === s.id && a.date.startsWith(m)); const adv = db.col('advances').filter((a) => a.staff_id === s.id && a.status !== 'recovered'); return { ...s, trips_this_month: att.filter((a) => a.status === 'present').length, advance_outstanding: U.sum(adv, (a) => a.amount - a.amount_recovered), license_state: !s.license_expiry ? null : s.license_expiry < T ? 'EXPIRED' : s.license_expiry <= U.addDays(T, 30) ? 'EXPIRING SOON' : 'ok' }; }
r.get('/staff', can('staff.view'), h((req) => { const role = req.query.role; const q = (req.query.q || '').toLowerCase(); return { staff: db.col('staff').filter((s) => (!role || role === 'all' || s.role === role) && (!q || `${s.name} ${s.phone}`.toLowerCase().includes(q)) && (req.query.status === 'all' || s.status === (req.query.status || 'active'))).map(staffView) }; }));
r.get('/staff/:id', can('staff.view'), h((req) => staffView(need(db.col('staff').get(req.params.id)))));
r.post('/staff', can('staff.modify'), h((req) => { const b = req.body; if (!b.name || !/^\d{10}$/.test(b.phone || '')) throw D.httpErr(400, 'Name and 10-digit mobile number are required'); if (b.aadhaar && !/^\d{12}$/.test(b.aadhaar)) throw D.httpErr(400, 'Aadhaar must be 12 digits'); if (b.pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(b.pan)) throw D.httpErr(400, 'PAN format: 5 letters + 4 digits + 1 letter'); if (db.col('staff').find((s) => s.phone === b.phone)) throw D.httpErr(409, 'Staff with this phone exists'); return db.col('staff').insert({ status: 'active', salary_type: 'monthly', salary_amount: 0, bank: {}, ...b }); }));
r.put('/staff/:id', can('staff.modify'), h((req) => { need(db.col('staff').get(req.params.id)); return db.col('staff').update(req.params.id, req.body); }));
r.delete('/staff/:id', can('staff.delete'), h((req) => { const s = need(db.col('staff').get(req.params.id)); s.status = 'inactive'; db.persist(); return { success: true }; }));
r.post('/staff/match', can('staff.view'), h((req) => { const s = db.col('staff').find((x) => x.phone === req.body.phone); if (s) return { matched: true, staff: s }; if (req.body.auto_create && req.body.name) return { matched: false, created: true, staff: db.col('staff').insert({ name: req.body.name, phone: req.body.phone, role: req.body.role || 'driver', status: 'active', salary_type: 'per_trip', salary_amount: 0, bank: {} }) }; return { matched: false }; }));

// Attendance — auto-generated from trip crew; draft → approved.
r.get('/attendance', can('staff.view'), h((req) => { const from = req.query.from || U.addDays(U.today(), -7), to = req.query.to || U.today(); const rows = db.col('attendance').filter((a) => a.date >= from && a.date <= to && (!req.query.staff_id || a.staff_id == req.query.staff_id)); const staffIds = [...new Set(rows.map((a) => a.staff_id))]; return { from, to, dates: U.dateRange(from, to), staff: staffIds.map((id) => { const s = db.col('staff').get(id); const mine = rows.filter((a) => a.staff_id === id); return { staff_id: id, name: s?.name, role: s?.role, phone: s?.phone, days: Object.fromEntries(mine.map((a) => [a.date, { id: a.id, status: a.status, state: a.state, amount: a.amount, service: a.schedule_id ? db.col('routes').get(db.col('schedules').get(a.schedule_id)?.route_id)?.service_number : null }])), present: mine.filter((a) => a.status === 'present').length, amount: U.sum(mine, (a) => a.amount), draft: mine.filter((a) => a.state === 'draft').length }; }) }; }));
r.post('/attendance/generate', can('staff.payroll'), h((req) => { const from = req.body.from, to = req.body.to; let n = 0; for (const s of db.col('schedules').filter((x) => x.travel_date >= from && x.travel_date <= to && x.status === 'active' && x.travel_date <= U.today())) for (const c of s.crew || []) { if (db.col('attendance').find((a) => a.staff_id === c.staff_id && a.date === s.travel_date)) continue; db.col('attendance').insert({ staff_id: c.staff_id, date: s.travel_date, status: 'present', schedule_id: s.id, source: 'auto', state: 'draft', amount: db.col('staff').get(c.staff_id)?.salary_amount || 0 }); n++; } return { generated: n }; }));
r.put('/attendance/:id', can('staff.payroll'), h((req) => db.col('attendance').update(req.params.id, { ...req.body, source: 'manual_edited' })));
r.post('/attendance', can('staff.payroll'), h((req) => db.col('attendance').insert({ staff_id: Number(req.body.staff_id), date: req.body.date, status: req.body.status || 'present', schedule_id: null, source: 'manual', state: 'draft', amount: Number(req.body.amount) || 0 })));
r.post('/attendance/approve', can('staff.payroll'), h((req) => { let n = 0; for (const a of db.col('attendance').filter((x) => (req.body.ids ? req.body.ids.includes(x.id) : x.date >= req.body.from && x.date <= req.body.to) && x.state === 'draft')) { a.state = 'approved'; n++; } db.persist(); return { approved: n }; }));

// Payouts
function prevBalance(staffId, before) { const p = db.col('payouts').filter((x) => x.staff_id === staffId && x.period_end < before); const credits = U.sum(db.col('attendance').filter((a) => a.staff_id === staffId && a.date < before && a.state === 'approved'), (a) => a.amount); const debits = U.sum(p.filter((x) => x.status === 'paid'), (x) => x.net) + U.sum(db.col('advances').filter((a) => a.staff_id === staffId && a.date_issued < before), (a) => a.amount); return { previous_credits: credits, previous_debits: debits, previous_balance: U.round2(credits - debits) }; }
r.get('/payouts', can('staff.payroll'), h((req) => ({ payouts: db.col('payouts').filter((p) => !req.query.status || p.status === req.query.status).map((p) => ({ ...p, staff_name: db.col('staff').get(p.staff_id)?.name, staff_role: db.col('staff').get(p.staff_id)?.role })).sort((a, b) => b.period_end.localeCompare(a.period_end)) })));
r.get('/payouts/summary', can('staff.payroll'), h(() => { const m = U.today().slice(0, 7); const P = db.col('payouts').all(); return { total_paid_this_month: U.sum(P.filter((p) => p.status === 'paid' && (p.paid_at || '').startsWith(m)), (p) => p.net), total_pending_approval: U.sum(P.filter((p) => p.status === 'draft'), (p) => p.net), total_approved_unpaid: U.sum(P.filter((p) => p.status === 'approved'), (p) => p.net), payouts_count_this_month: P.filter((p) => (p.paid_at || '').startsWith(m)).length }; }));
r.get('/payouts/preview', can('staff.payroll'), h((req) => { const { from, to } = req.query; const rows = []; for (const s of db.col('staff').filter((x) => x.status === 'active')) { const att = db.col('attendance').filter((a) => a.staff_id === s.id && a.date >= from && a.date <= to && a.state === 'approved'); if (!att.length && s.salary_type !== 'monthly') continue; if (db.col('payouts').find((p) => p.staff_id === s.id && p.period_start === from && p.period_end === to)) continue; const gross = s.salary_type === 'monthly' ? Math.round(s.salary_amount * (U.daysBetween(from, to) + 1) / 30) : U.sum(att, (a) => a.amount); const adv = U.sum(db.col('advances').filter((a) => a.staff_id === s.id && a.status === 'disbursed'), (a) => a.amount - a.amount_recovered); const reimb = U.sum(db.col('reimbursements').filter((x) => x.staff_id === s.id && x.status === 'approved'), (x) => x.amount); const prev = prevBalance(s.id, from); rows.push({ staff_id: s.id, name: s.name, role: s.role, days: att.length, gross, advances_outstanding: adv, reimbursements: reimb, prev_balance: prev.previous_balance, net: gross + reimb }); } return { from, to, rows }; }));
r.post('/payouts/generate', can('staff.payroll'), h((req) => { const { from, to, staff_ids = [], deduct_advances } = req.body; const out = []; let seq = db.col('payouts').count() + 1; for (const s of db.col('staff').filter((x) => staff_ids.includes(x.id))) { const att = db.col('attendance').filter((a) => a.staff_id === s.id && a.date >= from && a.date <= to && a.state === 'approved'); const gross = s.salary_type === 'monthly' ? Math.round(s.salary_amount * (U.daysBetween(from, to) + 1) / 30) : U.sum(att, (a) => a.amount); let ded = 0; if (deduct_advances) for (const a of db.col('advances').filter((x) => x.staff_id === s.id && x.status === 'disbursed')) { const due = a.amount - a.amount_recovered; const take = Math.min(due, gross - ded); a.amount_recovered += take; if (a.amount_recovered >= a.amount) a.status = 'recovered'; ded += take; } const reimb = db.col('reimbursements').filter((x) => x.staff_id === s.id && x.status === 'approved'); const rsum = U.sum(reimb, (x) => x.amount); reimb.forEach((x) => (x.status = 'in_payout')); out.push(db.col('payouts').insert({ payout_no: `PAY-${to.slice(0, 7)}-${String(seq++).padStart(3, '0')}`, staff_id: s.id, period_start: from, period_end: to, days: att.length, gross, deductions: 0, advances_recovered: ded, reimbursements: rsum, net: gross - ded + rsum, status: 'draft' })); } return { created: out.length, payouts: out }; }));
r.post('/payouts/:id/approve', can('staff.payroll'), h((req) => db.col('payouts').update(req.params.id, { status: 'approved', approved_by: req.user.name })));
r.post('/payouts/:id/pay', can('staff.payroll'), h((req) => { const p = db.col('payouts').update(req.params.id, { status: 'paid', paid_at: U.today(), payment_mode: req.body.payment_mode || 'bank', reference: req.body.reference || null }); for (const x of db.col('reimbursements').filter((r2) => r2.staff_id === p.staff_id && r2.status === 'in_payout')) x.status = 'paid'; db.persist(); return p; }));
r.put('/payouts/:id', can('staff.payroll'), h((req) => { const p = db.col('payouts').get(req.params.id); const b = req.body; const gross = b.gross ?? p.gross, ded = b.deductions ?? p.deductions; return db.col('payouts').update(p.id, { ...b, net: gross - ded - p.advances_recovered + (p.reimbursements || 0), status: 'draft' }); }));
r.delete('/payouts/:id', can('staff.payroll'), h((req) => ({ success: db.col('payouts').remove(req.params.id) })));
r.get('/staff/:id/ledger', can('staff.payroll'), h((req) => { const id = Number(req.params.id); const e = []; for (const a of db.col('attendance').filter((x) => x.staff_id === id && x.state === 'approved')) e.push({ date: a.date, kind: 'duty', credit: a.amount, debit: 0, note: a.status }); for (const a of db.col('advances').filter((x) => x.staff_id === id)) e.push({ date: a.date_issued, kind: 'advance', credit: 0, debit: a.amount, note: a.advance_type }); for (const p of db.col('payouts').filter((x) => x.staff_id === id && x.status === 'paid')) e.push({ date: p.paid_at, kind: 'payout', credit: 0, debit: p.net, note: p.payout_no }); for (const x of db.col('reimbursements').filter((r2) => r2.staff_id === id && ['approved', 'paid', 'in_payout'].includes(r2.status))) e.push({ date: x.date, kind: 'reimbursement', credit: x.amount, debit: 0, note: x.category }); e.sort((a, b) => a.date.localeCompare(b.date)); let bal = 0; for (const x of e) { bal += x.credit - x.debit; x.balance = bal; } return { staff_id: id, staff_name: db.col('staff').get(id)?.name, entries: e, total_credits: U.sum(e, (x) => x.credit), total_debits: U.sum(e, (x) => x.debit), balance: bal }; }));

// Advances & reimbursements
r.get('/advances', can('staff.payroll'), h(() => ({ advances: db.col('advances').all().map((a) => ({ ...a, balance: a.amount - a.amount_recovered, staff_name: db.col('staff').get(a.staff_id)?.name, staff_role: db.col('staff').get(a.staff_id)?.role })).reverse(), summary: (() => { const m = U.today().slice(0, 7); const A = db.col('advances').all(); return { total_outstanding: U.sum(A, (a) => a.amount - a.amount_recovered), total_disbursed_this_month: U.sum(A.filter((a) => a.date_issued.startsWith(m)), (a) => a.amount), overdue_count: 0 }; })() })));
r.post('/advances', can('staff.payroll'), h((req) => { const b = req.body; if (!b.staff_id || !(Number(b.amount) > 0)) throw D.httpErr(400, 'Staff and amount required'); return db.col('advances').insert({ staff_id: Number(b.staff_id), advance_type: b.advance_type || 'salary', amount: Number(b.amount), date_issued: b.date_issued || U.today(), reason: b.reason || null, payment_mode: b.payment_mode || 'cash', recovery_method: b.recovery_method || 'one_time', num_installments: b.num_installments || null, interest_rate: b.interest_rate || null, amount_recovered: 0, status: 'disbursed' }); }));
r.post('/advances/:id/recover', can('staff.payroll'), h((req) => { const a = need(db.col('advances').get(req.params.id)); a.amount_recovered = Math.min(a.amount, a.amount_recovered + Number(req.body.amount)); if (a.amount_recovered >= a.amount) a.status = 'recovered'; db.persist(); return a; }));
r.delete('/advances/:id', can('staff.payroll'), h((req) => ({ success: db.col('advances').remove(req.params.id) })));
r.get('/reimbursements', can('staff.payroll'), h(() => ({ reimbursements: db.col('reimbursements').all().map((x) => ({ ...x, staff_name: db.col('staff').get(x.staff_id)?.name })).reverse(), summary: { total_pending: U.sum(db.col('reimbursements').filter((x) => x.status === 'pending'), (x) => x.amount), pending_count: db.col('reimbursements').count((x) => x.status === 'pending') } })));
r.post('/reimbursements', can('staff.payroll'), h((req) => db.col('reimbursements').insert({ staff_id: Number(req.body.staff_id), category: req.body.category || 'Other', amount: Number(req.body.amount), date: req.body.date || U.today(), description: req.body.description || '', receipt: req.body.receipt || null, status: 'pending' })));
r.post('/reimbursements/:id/:action', can('staff.payroll'), h((req) => { const st = { approve: 'approved', reject: 'rejected', pay: 'paid' }[req.params.action]; if (!st) throw D.httpErr(400, 'Unknown action'); return db.col('reimbursements').update(req.params.id, { status: st, by: req.user.name }); }));
r.delete('/reimbursements/:id', can('staff.payroll'), h((req) => ({ success: db.col('reimbursements').remove(req.params.id) })));

module.exports = r;
