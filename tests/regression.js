// End-to-end API regression suite. Runs against a fresh seeded DB in a temp dir.
// Usage: npm test
const os = require('os');
const path = require('path');
const fs = require('fs');
process.env.GDS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gds-test-'));
process.env.GDS_RESEED = '1';
const app = require('../server/index');

let base, server, pass = 0, fail = 0;
const tokens = {};
async function call(method, url, body, who = 'owner', headers = {}) {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(tokens[who] ? { Authorization: `Bearer ${tokens[who]}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const ct = res.headers.get('content-type') || ''; return { status: res.status, body: ct.includes('json') ? await res.json() : await res.text() };
}
async function t(name, fn) { try { await fn(); pass++; console.log(`  ✓ ${name}`); } catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); } }
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || 'expected'}: ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
async function login(who, phone) { await call('POST', '/api/auth/request-otp', { phone }, null); const r = await call('POST', '/api/auth/verify-otp', { phone, otp: '1234' }, null); tokens[who] = r.body.token; return r; }

(async () => {
  server = app.listen(0); base = `http://127.0.0.1:${server.address().port}`;
  console.log('Auth & RBAC');
  await t('unknown phone rejected', async () => eq((await call('POST', '/api/auth/request-otp', { phone: '1111111111' }, null)).status, 404));
  await t('wrong OTP rejected', async () => { await call('POST', '/api/auth/request-otp', { phone: '9999999999' }, null); eq((await call('POST', '/api/auth/verify-otp', { phone: '9999999999', otp: '0000' }, null)).status, 401); });
  await t('owner login', async () => { const r = await login('owner', '9999999999'); ok(r.body.token); });
  await t('agent / accountant / exec login', async () => { await login('agent', '9444444441'); await login('acct', '9666666666'); await login('exec', '9777777777'); ok(tokens.agent && tokens.acct && tokens.exec); });
  await t('no token → 401', async () => eq((await call('GET', '/api/trips', null, null)).status, 401));
  await t('agent cannot see staff', async () => eq((await call('GET', '/api/staff', null, 'agent')).status, 403));
  await t('exec cannot edit settings', async () => eq((await call('PUT', '/api/settings/operator', { tagline: 'x' }, 'exec')).status, 403));
  await t('/auth/me returns permissions', async () => { const r = await call('GET', '/api/auth/me'); ok(r.body.user.permissions.includes('iam.manage_roles')); });
  await t('owner view-as agent narrows permissions', async () => { const ag = (await call('GET', '/api/iam/users')).body.find((u) => u.phone === '9444444441'); const r = await call('GET', '/api/staff', null, 'owner', { 'x-view-as': String(ag.id) }); eq(r.status, 403); });

  console.log('Trips');
  let trip;
  await t('current trips listed', async () => { const r = await call('GET', '/api/trips?tab=current'); ok(r.body.trips.length >= 6, 'expected ≥6 trips today'); trip = r.body.trips[0]; });
  await t('trip detail has stops + passengers', async () => { const r = await call('GET', `/api/trips/${trip.id}`); ok(r.body.stops.length > 10); ok(r.body.passengers.length > 0); trip = r.body; });
  await t('no-show requires step-up OTP', async () => { const p = trip.passengers.find((x) => x.status !== 'cancelled'); eq((await call('PATCH', `/api/trips/${trip.id}/passengers/${p.pnr}/${p.seat}`, { status: 'no_show' })).status, 403); await call('POST', '/api/auth/step-up', { purpose: 'no_show' }); eq((await call('PATCH', `/api/trips/${trip.id}/passengers/${p.pnr}/${p.seat}`, { status: 'no_show', otp: '1234' })).status, 200); });
  await t('boarding OTP mismatch rejected', async () => { const p = trip.passengers.find((x) => x.status === 'booked' || x.status === 'checked_in') || trip.passengers[1]; eq((await call('PATCH', `/api/trips/${trip.id}/passengers/${p.pnr}/${p.seat}`, { status: 'boarded', boarding_otp: '0000' })).status, 400); });
  await t('delay with notify messages passengers', async () => { const r = await call('POST', `/api/trips/${trip.id}/delay`, { minutes: 20, reason: 'Traffic', notify: true }); ok(r.body.notified > 0); });

  console.log('Booking lifecycle');
  const fut = (await call('GET', '/api/trips?tab=future')).body.trips.find((x) => x.status === 'active');
  let layout, pnr, seat;
  await t('seat layout available seats', async () => { layout = (await call('GET', `/api/schedules/${fut.id}/seat-layout`)).body; seat = layout.decks.flatMap((d) => d.seats).find((s) => s.status === 'available'); ok(seat, 'no free seat'); });
  const rtd = (await call('GET', `/api/routes/${fut.route_id}`)).body;
  const bp = rtd.stages.find((s) => s.type === 'pickup' && s.city_id === rtd.origin_city_id), dp = rtd.stages.filter((s) => s.type === 'drop' && s.city_id === rtd.destination_city_id)[0];
  const bookBody = (seatCode, extra = {}) => ({ schedule_id: fut.id, from_city_id: rtd.origin_city_id, to_city_id: rtd.destination_city_id, boarding_stage_id: bp.id, dropping_stage_id: dp.id, source: 'branch', payment_mode: 'paid', payment_method: 'upi', contact: { name: 'Test User', phone: '9123456780' }, passengers: [{ seat: seatCode, name: 'Test User', gender: 'M', age: 30 }], ...extra });
  await t('quote applies coupon & GST', async () => { const r = await call('POST', '/api/bookings/quote', { schedule_id: fut.id, seats: [seat.code], coupon: 'OFF100' }); ok(r.body.discount === 100, `discount ${r.body.discount}`); ok(r.body.gst > 0); });
  await t('invalid phone rejected', async () => eq((await call('POST', '/api/bookings', { ...bookBody(seat.code), contact: { name: 'x', phone: '12' } })).status, 400));
  await t('book seat', async () => { const r = await call('POST', '/api/bookings', bookBody(seat.code)); eq(r.status, 200, r.body.message); pnr = r.body.pnr; ok(pnr); });
  await t('double booking same seat → 409', async () => eq((await call('POST', '/api/bookings', bookBody(seat.code))).status, 409));
  await t('seat now booked on layout', async () => { const l = (await call('GET', `/api/schedules/${fut.id}/seat-layout`)).body; ok(/booked/.test(l.decks.flatMap((d) => d.seats).find((s) => s.code === seat.code).status)); });
  await t('booking search by phone', async () => { const r = await call('GET', '/api/bookings/search?q=9123456780'); ok(r.body.results.some((x) => x.pnr === pnr)); });
  await t('shift seat', async () => { const free = (await call('GET', `/api/schedules/${fut.id}/seat-layout`)).body.decks.flatMap((d) => d.seats).find((s) => s.status === 'available'); const r = await call('POST', `/api/bookings/${pnr}/shift`, { seat_map: { [seat.code]: free.code } }); eq(r.status, 200, r.body.message); seat = free; });
  await t('refund quote follows slabs', async () => { const r = await call('GET', `/api/bookings/${pnr}/refund-quote`); ok(r.body.refund_pct >= 0 && r.body.refund <= r.body.paid); });
  await t('operator cancel = 100% refund', async () => { const r = await call('POST', `/api/bookings/${pnr}/cancel`, { by: 'operator', reason: 'test' }); eq(r.status, 200, r.body.message); eq(r.body.refund_pct, 100); });
  await t('cancel twice → 400', async () => eq((await call('POST', `/api/bookings/${pnr}/cancel`, {})).status, 400));
  await t('agent booking forced to agent source', async () => { const s2 = (await call('GET', `/api/schedules/${fut.id}/seat-layout`)).body.decks.flatMap((d) => d.seats).find((s) => s.status === 'available'); const r = await call('POST', '/api/bookings', bookBody(s2.code, { source: 'website' }), 'agent'); eq(r.status, 200, r.body.message); eq(r.body.source, 'agent'); });
  await t('block seat then booking blocked', async () => { const s3 = (await call('GET', `/api/schedules/${fut.id}/seat-layout`)).body.decks.flatMap((d) => d.seats).find((s) => s.status === 'available'); await call('POST', `/api/schedules/${fut.id}/blocks`, { seats: [s3.code], reason: 'VIP' }); eq((await call('POST', '/api/bookings', bookBody(s3.code))).status, 409); });

  console.log('Schedules & routes');
  await t('schedule list window', async () => ok((await call('GET', '/api/schedules')).body.schedules.length >= 30));
  await t('toggle schedule off/on', async () => { eq((await call('POST', `/api/schedules/${fut.id}/toggle`, { active: false })).body.status, 'disabled'); eq((await call('POST', `/api/schedules/${fut.id}/toggle`, { active: true })).body.status, 'active'); });
  await t('fare recommendation', async () => ok((await call('GET', `/api/schedules/${fut.id}/fares`)).body.recommendation.factor > 0));
  await t('schedule history audited', async () => ok((await call('GET', `/api/schedules/${fut.id}/history`)).body.history.length > 0));
  await t('route delete requires OTP', async () => { eq((await call('DELETE', `/api/routes/${fut.route_id}`)).status >= 400, true); });
  await t('route validate', async () => eq((await call('GET', `/api/routes/${fut.route_id}/validate`)).status, 200));

  console.log('Fleet & staff');
  await t('vehicles with documents', async () => ok((await call('GET', '/api/vehicles')).body.vehicles.length === 7));
  await t('duplicate vehicle rejected', async () => eq((await call('POST', '/api/vehicles', { registration_number: 'KA01AB1001' })).status, 409));
  await t('staff validation', async () => eq((await call('POST', '/api/staff', { name: 'X', phone: '9000012345', pan: 'bad' })).status, 400));
  await t('advance create & recover', async () => { const st = (await call('GET', '/api/staff?role=driver')).body.staff[0]; const a = (await call('POST', '/api/advances', { staff_id: st.id, amount: 500 })).body; const r = await call('POST', `/api/advances/${a.id}/recover`, { amount: 500 }); eq(r.body.status, 'recovered'); });

  console.log('Accounts');
  await t('analytics totals', async () => { const r = await call('GET', '/api/accounts/analytics'); ok(r.body.totals.net_sales > 0); eq(r.body.rows.length, 7); });
  await t('transactions CSV', async () => { const r = await call('GET', '/api/accounts/transactions?format=csv'); ok(String(r.body).startsWith('pnr,')); });
  await t('agent sees only own transactions', async () => { const r = await call('GET', `/api/accounts/transactions?from=2000-01-01&to=2100-01-01`, null, 'agent'); ok(r.body.rows.every((x) => x.source === 'agent')); });
  await t('receivables summary', async () => ok('otas' in (await call('GET', '/api/accounts/receivables')).body.summary));
  await t('all reports run', async () => { const list = (await call('GET', '/api/accounts/reports')).body.reports; for (const k of list) { const r = await call('GET', `/api/accounts/reports/${k}?staff_id=1`); eq(r.status, 200, `${k}: ${r.body.message}`); } });
  await t('reconciliation upload matches', async () => { const bks = (await call('GET', '/api/accounts/transactions?source=redbus&from=2000-01-01&to=2100-01-01')).body.rows.filter((x) => x.type === 'booking').slice(0, 3); const csv = ['pnr,fare,commission,payout', ...bks.map((b) => `${b.pnr},${b.net},0,0`), 'NOPE123,100,10,90'].join('\n'); const r = await call('POST', '/api/reconciliation/settlements', { ota_slug: 'redbus', csv }); eq(r.status, 200, r.body.message); eq(r.body.unmatched_ota_count, 1); });
  await t('coupon create + duplicate', async () => { eq((await call('POST', '/api/coupons', { code: 'TEST50', discount_value: 50 })).status, 200); eq((await call('POST', '/api/coupons', { code: 'TEST50' })).status, 409); });
  await t('accountant cannot book', async () => eq((await call('POST', '/api/bookings', {}, 'acct')).status, 403));

  console.log('Engagement & ops');
  await t('chats list & reply', async () => { const c = (await call('GET', '/api/chats')).body.conversations[0]; ok(c); const r = await call('POST', `/api/chats/${encodeURIComponent(c.conversation_id)}`, { text: 'Hello' }); eq(r.status, 200, r.body.message); });
  await t('calls list & click-to-call', async () => { ok((await call('GET', '/api/calls')).body.calls.length > 0); eq((await call('POST', '/api/calls', { phone: '9123456780' })).status, 200); });
  await t('daily ops', async () => ok((await call('GET', '/api/daily-ops')).body.fleet.trips.length > 0));
  await t('ratings & reply', async () => { const r = (await call('GET', '/api/ratings')).body; ok(r.rows.length); eq((await call('POST', `/api/ratings/${r.rows[0].id}/reply`, { reply: 'Sorry' })).status, 200); });
  await t('CRM 360', async () => { const c = (await call('GET', '/api/crm/customers')).body.rows[0]; ok((await call('GET', `/api/crm/customers/${c.phone}`)).body.bookings.length); });
  await t('Sarathi answers passengers', async () => { const r = await call('POST', '/api/sarathi/ask', { question: 'How many passengers travelled this week?' }); ok(/passengers travelled/.test(r.body.answer.text)); });
  await t('Sarathi follow-up keeps conversation', async () => { const a = await call('POST', '/api/sarathi/ask', { question: 'revenue yesterday' }); const b = await call('POST', '/api/sarathi/ask', { question: 'occupancy', conversation_id: a.body.conversation_id }); eq(a.body.conversation_id, b.body.conversation_id); });
  await t('alerts feed', async () => ok(Array.isArray((await call('GET', '/api/alerts')).body.alerts)));

  console.log('Settings & IAM');
  await t('invalid brand colour', async () => eq((await call('PUT', '/api/settings/operator', { brand_hex: 'blue' })).status, 400));
  await t('custom role + user', async () => { eq((await call('PUT', '/api/iam/roles/checker', { name: 'Checker', permissions: ['trips.view', 'bogus'] })).body.permissions.length, 1); eq((await call('POST', '/api/iam/users', { phone: '9300000001', name: 'Chk', role: 'checker' })).status, 200); await login('chk', '9300000001'); eq((await call('GET', '/api/trips', null, 'chk')).status, 200); eq((await call('GET', '/api/schedules', null, 'chk')).status, 403); });
  await t('role with users cannot be deleted', async () => eq((await call('DELETE', '/api/iam/roles/checker')).status, 400));
  await t('SPA served', async () => { const r = await fetch(base + '/trips'); eq(r.status, 200); });

  console.log('Route business rules & call logging');
  {
    const day = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
    const sch = (await call('GET', `/api/schedules?from=${day}&to=${day}`)).body.schedules.find((s) => s.route_id === 1);
    const freePair = async () => { const m = (await call('GET', `/api/schedules/${sch.id}/seat-layout`)).body; const seats = m.decks.flatMap((d) => d.seats.map((s) => ({ ...s, deck: d.deck }))); for (const a of seats) { const b = seats.find((x) => x.deck === a.deck && x.row === a.row && x.col === a.col + 1); if (b && a.status === 'available' && b.status === 'available') return [a.code, b.code]; } return null; };
    const book = (pax, extra = {}) => call('POST', '/api/bookings', { schedule_id: sch.id, contact: { name: pax[0].name, phone: '9876501234' }, passengers: pax, ...extra });
    await t('gender adjacency enforced when disabled', async () => {
      ok(sch, 'schedule'); eq((await call('PUT', '/api/routes/1', { business_rules: { gents_next_to_ladies: false, ladies_next_to_gents: false, couple_exception: true } })).status, 200);
      const [a, b] = await freePair(); eq((await book([{ seat: a, name: 'Lady', gender: 'F', age: 30 }])).status, 200);
      const r = await book([{ seat: b, name: 'Gent', gender: 'M', age: 30 }]); eq(r.status, 409, 'adjacent gent'); ok(/seat rules/.test(JSON.stringify(r.body)), 'message');
      eq((await book([{ seat: b, name: 'Gent', gender: 'M', age: 30 }], { override_rules: true })).status, 200, 'staff override');
    });
    await t('couple exception allows 2-seat mixed booking', async () => { const [a, b] = await freePair(); eq((await book([{ seat: a, name: 'Wife', gender: 'F', age: 30 }, { seat: b, name: 'Husband', gender: 'M', age: 32 }])).status, 200); });
    await t('advance booking window enforced', async () => { await call('PUT', '/api/routes/1', { business_rules: { advance_booking_days: 2 } }); const [a] = await freePair(); eq((await book([{ seat: a, name: 'Early', gender: 'M', age: 30 }])).status, 400); await call('PUT', '/api/routes/1', { business_rules: {} }); });
    await t('manual call log keeps reported status', async () => { const c = (await call('POST', '/api/calls', { phone: '9876501234', status: 'missed', notes: 'no answer' })).body; eq(c.status, 'missed'); ok(!/Connecting/.test(c.message), 'no fake telephony'); eq((await call('POST', '/api/calls', { phone: '9876501234' })).body.status, 'logged'); eq((await call('PUT', `/api/calls/${c.id}`, { status: 'bogus' })).status, 400); const u = (await call('PUT', `/api/calls/${c.id}`, { duration_s: 30 })).body; eq(u.status, 'missed', 'partial update keeps status'); eq(u.notes, 'no answer'); });
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  server.close(); fs.rmSync(process.env.GDS_DATA_DIR, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})();
