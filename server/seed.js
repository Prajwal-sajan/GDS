// Seeds a realistic operator dataset (Hyderabad ⇄ Bengaluru corridor) relative to today.
// Run: npm run seed   (wipes data/db.json)
const db = require('./db');
const U = require('./util');
const D = require('./domain');

const R = U.rng(20261120);
const FIRST = ['Ravi', 'Suresh', 'Anil', 'Kiran', 'Priya', 'Lakshmi', 'Arjun', 'Rahul', 'Sneha', 'Divya', 'Manoj', 'Vikram', 'Pooja', 'Kavya', 'Rohith', 'Akhil', 'Harsha', 'Naveen', 'Deepa', 'Swathi', 'Imran', 'Faisal', 'Ayesha', 'Sana', 'Venkat', 'Ramesh', 'Srinivas', 'Meena', 'Anusha', 'Teja', 'Sai', 'Nikhil', 'Bhavana', 'Gopi', 'Mahesh', 'Ganesh', 'Shruthi', 'Keerthi', 'Varun', 'Ajay'];
const LAST = ['Reddy', 'Kumar', 'Rao', 'Sharma', 'Naidu', 'Gowda', 'Patel', 'Khan', 'Iyer', 'Varma', 'Shetty', 'Chowdary', 'Prasad', 'Nair', 'Singh'];
const FEMALE = new Set(['Priya', 'Lakshmi', 'Sneha', 'Divya', 'Pooja', 'Kavya', 'Deepa', 'Swathi', 'Ayesha', 'Sana', 'Meena', 'Anusha', 'Bhavana', 'Shruthi', 'Keerthi']);
const phone = () => String(R.pick([6, 7, 8, 9])) + String(R.int(100000000, 999999999));

function seed() {
  db.reset();
  const T = U.today();

  // ---------- Operator & settings ----------
  db.meta('operator', {
    operator_id: 1000, operator_name: 'Demo Travels', app_name: 'Demo Travels', tagline: 'Travel with Comfort',
    helpline_number: '080-40000000', support_email: 'support@demotravels.in', customer_central_number: '9000000001',
    outgoing_number: '080 40000000', emergency_phone: '9000000002', escalation_contacts: '9000000003',
    gst_number: '29AAAAA0000A1Z5', gst_registration_name: 'Demo Travels Private Limited', is_gst_receivable: true,
    brand_hex: '#2563eb', font_family: 'Poppins', logo_url: '',
    cloud_calling_enabled: true, is_number_masking_enabled: true, direct_to_vehicle: true, is_driver_gps_required: true,
    vehicle_number_as_driver_contact: true, driver_personal_numbers_enabled: false,
    ota_commission: { redbus: 13, abhibus: 12, paytm: 10, website: 0, branch: 0 },
  });
  db.meta('miles', { miles_to_rupee_ratio: 0.1, max_discount_percent: 30, min_redeemable_miles: 1000, min_booking_amount: 50, is_active: true });
  db.meta('day_rates', [0, 1, 2, 3, 4, 5, 6].map((d) => ({ day_of_week: d, redemption_rate: [0,75,75,75,30,0,30][d] })));
  db.meta('tier_multipliers', [{ tier_name: 'Bronze', multiplier: 1 }, { tier_name: 'Silver', multiplier: 1.1 }, { tier_name: 'Gold', multiplier: 1.2 }, { tier_name: 'Platinum', multiplier: 1.5 }]);
  db.meta('blackout_dates', [{date:'2026-03-31',rate:0,reason:''}]);
  db.meta('seat_upgrade_policy', { enabled: true, windows: [{ name: 'T-15m', start: 15, notification_channels: ['whatsapp'] }], fare_class_map: { seater: ['sleeper'], semi_sleeper: ['sleeper'] }, default_consent: 'opt_in', auto_apply_when_free: false, max_offers_per_trip: 6 });
  db.meta('hold_settings', { default_minutes: 15, max_minutes: 120 });
  db.meta('speed_dial', { enabled: true, bus_last4_enabled: true });
  db.meta('ticket_seq', 93000);
  db.meta('reconciliation_config', [
    { ota_slug: 'redbus', ota_display_name: 'RedBus', commission_percent: 13, commission_base: 'fare_only', tds_percent: 0.1, gst_on_commission_percent: 18, tax_on_fare_percent: 5, settlement_mode: 'DOJ', settlement_cycle_days: 7, is_active: true },
    { ota_slug: 'abhibus', ota_display_name: 'AbhiBus', commission_percent: 12, commission_base: 'fare_only', tds_percent: 0.1, gst_on_commission_percent: 18, tax_on_fare_percent: 5, settlement_mode: 'DOJ', settlement_cycle_days: 7, is_active: true },
    { ota_slug: 'paytm', ota_display_name: 'Paytm', commission_percent: 10, commission_base: 'fare_only', tds_percent: 0.1, gst_on_commission_percent: 18, tax_on_fare_percent: 5, settlement_mode: 'DOB', settlement_cycle_days: 7, is_active: true },
  ]);

  // ---------- Cities ----------
  const C = db.col('cities');
  const city = {};
  for (const [id, name, state, lat, lng] of [[107258, 'Hyderabad', 'Telangana', 17.385, 78.4867], [102257, 'Bengaluru', 'Karnataka', 12.9716, 77.5946], [105258, 'Kurnool', 'Andhra Pradesh', 15.8281, 78.0373], [104257, 'Ananthapur', 'Andhra Pradesh', 14.6819, 77.6006], [103260, 'Chennai', 'Tamil Nadu', 13.0827, 80.2707], [108252, 'Vijayawada', 'Andhra Pradesh', 16.5062, 80.648]]) {
    city[name] = C.insert({ id, name, state, lat, lng });
  }

  // ---------- Coaches ----------
  const coachA = db.col('coaches').insert({ name: 'A/C Seater/Sleeper (2+1)', bus_type: 'A/C Seater/Sleeper', pattern: '2+1', layout: D.buildLayout({ kind: 'seater_sleeper' }), amenities: ['washroom', 'cctv', 'gpsTracking', 'chargingPoint', 'readingLight', 'waterBottle', 'blankets'], emergency_exits: ['Roof Exit', 'Back Exit'] });
  const coachB = db.col('coaches').insert({ name: 'A/C Sleeper (2+1)', bus_type: 'A/C Sleeper', pattern: '2+1', layout: D.buildLayout({ kind: 'sleeper' }), amenities: ['cctv', 'gpsTracking', 'chargingPoint', 'readingLight', 'waterBottle', 'blankets', 'pillow', 'bedSheet'], emergency_exits: ['Roof Exit', 'Side Exit'] });
  const coachV = db.col('coaches').insert({ name: 'Pickup Van (2+2)', bus_type: 'Non A/C Seater', pattern: '2+2', layout: D.buildLayout({ kind: 'seater', pattern: '2+2' }), amenities: [] });

  // ---------- Vehicles ----------
  const V = db.col('vehicles');
  const plates = [['KA 01 AB 1001', coachA.id], ['KA 01 AB 1002', coachA.id], ['KA 01 AB 1003', coachB.id], ['KA 01 AB 1004', coachB.id], ['KA 01 AB 1005', coachA.id], ['KA 01 AB 1006', coachB.id], ['TS 12 UE 3327', coachV.id]];
  const vehicles = plates.map(([plate, tpl], i) => V.insert({
    registration_number: plate, coach_template_id: tpl, phone_number: phone(), status: 'active', ownership_type: 'permanent',
    vehicle_role: tpl === coachV.id ? 'pickup_van' : 'main', gps_enabled: true, dms_enabled: i < 4, model_name: tpl === coachV.id ? 'Force Traveller' : 'Volvo 9600', manufacture_year: 2022 + (i % 3),
    chassis_number: `MAT${100000 + i}`, engine_number: `ENG${500000 + i}`, odometer_reading: 300000 + i * 45000,
    insurance_expiry: U.addDays(T, 30 + i * 40), permit_expiry: U.addDays(T, 120 + i * 10), fitness_expiry: U.addDays(T, i === 1 ? 6 : 200), puc_expiry: U.addDays(T, i === 2 ? -3 : 90),
    last_service_date: U.addDays(T, -20 - i), next_service_date: U.addDays(T, 10 + i * 3), sim_number: phone(),
    position: { lat: i % 2 ? 12.8157 : 17.4755, lng: i % 2 ? 77.6912 : 78.4141, speed: 0, state: 'STOPPED', ts: Date.now() },
    health: { status: i === 3 ? 'MINOR' : 'GOOD', odometer_km: 300000 + i * 45000, engine_hours: 12000 + i * 900, alerts: [{ message: 'Battery voltage within range', status: 'GOOD', reading: 27.8, unit: 'V' }, { message: 'Engine temperature within range', status: 'GOOD', reading: 86, unit: '°C' }, ...(i === 3 ? [{ message: 'Coolant level low', status: 'MINOR', reading: 62, unit: '%' }] : [])] },
    tags: {},
  }));
  for (const v of vehicles) for (const [type, name, exp] of [['RC', 'RC (Registration Certificate)', null], ['INSURANCE', 'Insurance', v.insurance_expiry], ['PUC', 'PUC (Pollution Certificate)', v.puc_expiry], ['PERMIT', 'National Permit', v.permit_expiry], ['FITNESS', 'Fitness Certificate', v.fitness_expiry]]) {
    db.col('documents').insert({ owner_type: 'vehicle', owner_id: v.id, document_type: type, document_name: name, expiry_date: exp, visibility: 'public', category: 'compliance', file_url: null, verification_status: 'verified' });
  }

  // ---------- Staff & users ----------
  const S = db.col('staff');
  const mkStaff = (name, role, extra = {}) => S.insert({ name, phone: phone(), role, status: 'active', salary_type: role === 'driver' || role === 'helper' ? 'per_trip' : 'monthly', salary_amount: { driver: 1250, helper: 650, conductor: 800 }[role] || 18000, bata_per_trip: { driver: 250, helper: 150 }[role] || 0, retention_per_day: role === 'driver' ? 100 : 0, license_number: role === 'driver' ? `KA0${R.int(1, 9)}20${R.int(10, 23)}000${R.int(1000, 9999)}` : null, license_expiry: role === 'driver' ? U.addDays(T, R.int(-10, 900)) : null, aadhaar: String(R.int(100000000000, 999999999999)), pan: null, bank: { account_name: name, bank_name: 'State Bank of India', account_number: String(R.int(1e10, 9e10)), ifsc: 'SBIN0001234', upi: `${name.toLowerCase().replace(/\s/g, '')}@ybl` }, joining_date: U.addDays(T, -R.int(60, 900)), designation: role === 'driver' ? 'Senior Driver' : '', emergency_contact: { name: 'Family', phone: phone() }, ...extra });
  const drivers = Array.from({ length: 14 }, (_, i) => mkStaff(`${FIRST[(i * 3) % FIRST.length]} ${LAST[i % LAST.length]}`, 'driver'));
  const helpers = Array.from({ length: 7 }, (_, i) => mkStaff(`${FIRST[(i * 5 + 2) % FIRST.length]} ${LAST[(i + 4) % LAST.length]}`, 'helper'));
  const vanDriver = mkStaff('Dasharath (Pickup Van)', 'driver');
  for (const [n, r] of [['Devraj', 'manager'], ['Radha', 'booking_executive'], ['Nagesh', 'accountant'], ['Mahi', 'pickup_manager']]) mkStaff(n, r);

  const U_ = db.col('users');
  U_.insert({ phone: '9999999999', name: 'Admin', role: 'owner', status: 'ACTIVE', email: 'owner@demotravels.in' });
  U_.insert({ phone: '9888888888', name: 'Devraj', role: 'manager', status: 'ACTIVE' });
  U_.insert({ phone: '9777777777', name: 'Radha', role: 'booking_executive', status: 'ACTIVE' });
  U_.insert({ phone: '9666666666', name: 'Nagesh', role: 'accountant', status: 'ACTIVE' });
  U_.insert({ phone: '9555555555', name: 'Mahi', role: 'pickup_manager', status: 'ACTIVE' });
  const agents = [['9444444441', 'Sri Sai Travels'], ['9444444442', 'Balaji Tours'], ['9444444443', 'Kaveri Agency']].map(([p, n]) => U_.insert({ phone: p, name: n, role: 'agent', status: 'ACTIVE', commission_pct: 8, agent_type: 'postpaid', credit_limit: 20000, settlement_cycle_days: 7 }));
  db.col('branches').insert({ name: 'Ameerpet Office', city_id: 107258, address: 'Ameerpet, Hyderabad', phone: '9000000011' });
  db.col('branches').insert({ name: 'Madiwala Office', city_id: 102257, address: 'Madiwala, Bengaluru', phone: '9000000012' });

  // ---------- Stops ----------
  const hydPickups = [
    ['LB Nagar Metro Station (Free metro Pickup)', 17.349097, 78.54837, '17:45', 'Metro'], ['Dilsukhnagar Metro Station (Free metro Pickup)', 17.368442, 78.526358, '17:51', 'Metro'],
    ['Malakpet Metro Station (Free metro Pickup)', 17.37708, 78.494621, '17:53', 'Metro'], ['Paradise Metro Station (Free metro Pickup)', 17.443589, 78.486062, '18:02', 'Metro'],
    ['Ameerpet Metro (Free Metro Pickup)', 17.430803, 78.448791, '18:30', 'Metro'], ['Kukatpally', 17.485122, 78.411455, '18:59', null], ['KPHB', 17.490719, 78.407219, '19:10', null],
    ['JNTU', 17.4957, 78.3969, '19:17', null], ['Miyapur', 17.496235, 78.36553, '19:30', null], ['Kondapur', 17.455935, 78.364434, '19:44', null],
    ['Gachibowli', 17.436838, 78.362802, '20:25', null], ['Aramghar', 17.3313, 78.4277, '20:30', null], ['Shamshabad Toll Gate', 17.247656, 78.373588, '20:40', null], ['Shadnagar', 17.006121, 78.194688, '21:15', null],
  ];
  const blrDrops = [
    ['Chikkabalapura Bypass', 13.446382, 77.736001, '05:35'], ['Yelahanka', 13.09522, 77.597928, '06:15'], ['Hebbal Esteem mall', 13.046186, 77.591648, '06:30'], ['Hennur Cross', 13.029728, 77.63136, '06:37'],
    ['Kalyan Nagar', 13.023244, 77.646474, '06:40'], ['TIN Factory', 12.997555, 77.670256, '06:50'], ['Marathahalli', 12.959897, 77.701451, '07:00'], ['Bellandur', 12.928152, 77.681457, '07:10'],
    ['HSR Layout', 12.921444, 77.644623, '07:20'], ['Silk Board', 12.91751, 77.624313, '07:30'], ['Electronic City', 12.840802, 77.676537, '07:45'], ['Bommasandra', 12.815185, 77.691501, '07:55'],
  ];
  let stageSeq = 1;
  const stage = (o) => ({ id: 10000 + stageSeq++, contact_number: '9000000001', address: o.name, landmark: '', ...o });

  function buildRoute(service, name, dir, dep, coachId, vehIdx, fareBase) {
    const shift = U.toMin(dep) - U.toMin(dir === 'HB' ? '17:30' : '19:00');
    const t = (hhmm, day) => { const m = U.toMin(hhmm) + shift + (day - 1) * 1440; return { time: U.fromMin(m), day: 1 + Math.floor(m / 1440) }; };
    let stages, via;
    if (dir === 'HB') {
      stages = [
        ...hydPickups.map(([n, lat, lng, tm, pt]) => stage({ type: 'pickup', name: n, city_id: 107258, lat, lng, ...t(tm, 1), pickup_type: pt, exchange_point: pt ? 'JNTU Metro station' : null, exchange_time: pt ? t('19:20', 1).time : null })),
        stage({ type: 'break', name: 'Highway Dhaba (Jadcherla)', city_id: null, lat: 16.79404, lng: 78.140912, ...t('22:00', 1), break_kind: 'Meal — Dinner' }),
        stage({ type: 'drop', name: 'Kurnool', city_id: 105258, lat: 15.824744, lng: 78.021115, ...t('00:20', 2) }), stage({ type: 'pickup', name: 'Kurnool', city_id: 105258, lat: 15.824744, lng: 78.021115, ...t('00:25', 2) }),
        stage({ type: 'break', name: 'Highway Rest Stop', city_id: null, lat: 15.02992, lng: 77.62285, ...t('02:30', 2), break_kind: 'Rest / Restroom' }),
        stage({ type: 'drop', name: 'Ananthapur', city_id: 104257, lat: 14.696234, lng: 77.585826, ...t('03:00', 2) }), stage({ type: 'pickup', name: 'Ananthapur', city_id: 104257, lat: 14.696234, lng: 77.585826, ...t('03:05', 2) }),
        ...blrDrops.map(([n, lat, lng, tm]) => stage({ type: 'drop', name: n, city_id: 102257, lat, lng, ...t(tm, 2) })),
      ];
      via = [{ city_id: 107258, order: 0, ...t('17:45', 1) }, { city_id: 105258, order: 1, ...t('00:20', 2) }, { city_id: 104257, order: 2, ...t('03:00', 2) }, { city_id: 102257, order: 3, ...t('05:35', 2) }];
    } else {
      const rev = (hhmm) => U.fromMin(U.toMin('19:00') + ((U.toMin('07:55') - U.toMin(hhmm) + 1440) % 1440) - 0);
      stages = [
        ...[...blrDrops].reverse().map(([n, lat, lng], i) => stage({ type: 'pickup', name: n, city_id: 102257, lat, lng, ...t(U.fromMin(U.toMin('19:00') + i * 12), 1), pickup_type: null })),
        stage({ type: 'drop', name: 'Ananthapur', city_id: 104257, lat: 14.696234, lng: 77.585826, ...t('23:45', 1) }), stage({ type: 'pickup', name: 'Ananthapur', city_id: 104257, lat: 14.696234, lng: 77.585826, ...t('23:50', 1) }),
        stage({ type: 'break', name: 'Highway Rest Stop', city_id: null, lat: 15.02992, lng: 77.62285, ...t('00:30', 2), break_kind: 'Meal — Dinner' }),
        stage({ type: 'drop', name: 'Kurnool', city_id: 105258, lat: 15.824744, lng: 78.021115, ...t('02:15', 2) }), stage({ type: 'pickup', name: 'Kurnool', city_id: 105258, lat: 15.824744, lng: 78.021115, ...t('02:20', 2) }),
        ...[...hydPickups].reverse().slice(0, 11).map(([n, lat, lng], i) => stage({ type: 'drop', name: n, city_id: 107258, lat, lng, ...t(U.fromMin(U.toMin('05:00') + i * 8), 2) })),
      ];
      void rev;
      via = [{ city_id: 102257, order: 0, ...t('19:00', 1) }, { city_id: 104257, order: 1, ...t('23:45', 1) }, { city_id: 105258, order: 2, ...t('02:15', 2) }, { city_id: 107258, order: 3, ...t('05:00', 2) }];
    }
    const o = dir === 'HB' ? 107258 : 102257, d = dir === 'HB' ? 102257 : 107258;
    const ids = via.map((x) => x.city_id);
    const fares = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const f = Math.round(fareBase * (j - i) / 3 / 10) * 10 || 300;
      fares.push({ from_city_id: ids[i], to_city_id: ids[j], seater: f, sleeper_lower: Math.round(f * 1.25), sleeper_upper: Math.round(f * 1.15) });
    }
    const a1 = { vehicle_id: vehicles[vehIdx].id, crew: [{ staff_id: drivers[vehIdx * 2].id, role: 'Driver' }, { staff_id: drivers[vehIdx * 2 + 1].id, role: 'Driver' }, { staff_id: helpers[vehIdx % helpers.length].id, role: 'Helper' }] };
    const last = stages[stages.length - 1];
    return db.col('routes').insert({
      service_number: service, name, origin_city_id: o, destination_city_id: d, departure_time: dep, arrival_time: last.time, duration_minutes: 750, distance_km: 581.3,
      coach_template_id: coachId, vehicle_id: vehicles[vehIdx].id, assignments: [a1], status: 'active', run_pattern: { type: 'daily' }, start_date: U.addDays(T, -60), end_date: null,
      via_cities: via, stages, fares, seat_fare_rules: [{ kind: 'amount', label: 'Front sleepers', seats: ['1L', '2L', '1U'], value: 100, days: [] }],
      seat_blocks: [{ seats: ['6U'], reason: 'Crew berth', from: null, to: null, auto_release_hours: 2 }],
      refund_slabs: [{ hours_before: 48, refund_pct: 90 }, { hours_before: 24, refund_pct: 75 }, { hours_before: 12, refund_pct: 50 }, { hours_before: 0, refund_pct: 0 }],
      expenses: {
        fixed: [{ key: 'emi_loan', label: 'EMI / Loan', per_day: 3500 }, { key: 'aitp_permit', label: 'AITP Permit', per_day: 1500 }, { key: 'insurance', label: 'Insurance', per_day: 520 }, { key: 'office_salary', label: 'Office Salary', per_day: 1000 }, { key: 'state_tax', label: 'State Tax', per_day: 250 }],
        running: [{ key: 'diesel', label: 'Diesel', per_day: 14800 }, { key: 'driver_bata', label: 'Driver Bata', per_day: 2500 }, { key: 'tolls', label: 'Tolls', per_day: 2400 }, { key: 'helper_bata', label: 'Helper Bata', per_day: 730 }, { key: 'tyres', label: 'Tyres', per_day: 650 }, { key: 'pickup_van', label: 'Pickup Van', per_day: 500 }, { key: 'laundry', label: 'Laundry', per_day: 350 }, { key: 'adblue', label: 'Adblue', per_day: 160 }, { key: 'bus_cleaning', label: 'Bus Cleaning', per_day: 85 }, { key: 'bus_parking', label: 'Bus Parking', per_day: 75 }],
      },
      call_settings: { cloud_calling: true, number_masking: true, direct_to_vehicle: true, driver_gps: true, automated_calls: { boarding_call: true, bus_near_call: true, rating_call: true } },
      auto_pricing: { enabled: false, min: 600, max: 3000, strategy: 'balanced' }, tags: {}, sub_routes: [], deleted_trips: [], business_rules: {},
    });
  }
  buildRoute('HB1', 'Rajahamsa', 'HB', '17:30', coachA.id, 0, 1400);
  buildRoute('BH1', 'Rajahamsa', 'BH', '19:00', coachA.id, 1, 1400);
  buildRoute('HB2', 'Airavat Sleeper', 'HB', '19:30', coachB.id, 2, 1600);
  buildRoute('BH2', 'Airavat Sleeper', 'BH', '20:30', coachB.id, 3, 1600);
  buildRoute('HB3', 'Night Rider', 'HB', '20:25', coachA.id, 4, 1300);
  buildRoute('BH3', 'Night Rider', 'BH', '20:50', coachB.id, 5, 1500);

  // ---------- Schedules & bookings ----------
  D.ensureSchedules(U.addDays(T, -30), U.addDays(T, 10));
  const srcW = [['redbus', 45], ['abhibus', 25], ['paytm', 5], ['website', 10], ['branch', 10], ['agent', 5]];
  const pickSrc = () => { let x = R.int(1, 100); for (const [s, w] of srcW) { if ((x -= w) <= 0) return s; } return 'branch'; };
  const customers = Array.from({ length: 900 }, () => { const f = R.pick(FIRST); return { name: `${f} ${R.pick(LAST)}`, phone: phone(), gender: FEMALE.has(f) ? 'F' : 'M' }; });
  const repeaters = customers.slice(0, 120);
  const admin = { phone: '9999999999', name: 'Admin', role: 'owner' };
  for (const s of db.col('schedules').all()) {
    const days = U.daysBetween(T, s.travel_date);
    const target = days > 7 ? 0 : days > 2 ? R.int(5, 14) : days >= 0 ? R.int(18, 34) : R.int(22, 40);
    const r = db.col('routes').get(s.route_id);
    if (days < -3 && R.chance(0.03)) { s.status = 'cancelled'; s.is_active = false; s.manually_disabled = true; continue; }
    let made = 0, guard = 0;
    while (made < target && guard++ < 200) {
      const map = D.seatMap(s);
      const free = map.decks.flatMap((d) => d.seats).filter((x) => x.status === 'available');
      if (!free.length) break;
      const n = R.chance(0.8) ? 1 : R.int(2, 3);
      const seats = []; for (let k = 0; k < n && free.length; k++) seats.push(free.splice(R.int(0, free.length - 1), 1)[0]);
      const cust = R.chance(0.35) ? R.pick(repeaters) : R.pick(customers);
      const full = R.chance(0.8);
      const fromC = full ? r.origin_city_id : R.pick(r.via_cities.slice(0, 2)).city_id;
      const fromOrder = D.cityOrder(r, fromC);
      const toC = full ? r.destination_city_id : R.pick(r.via_cities.filter((v) => v.order > fromOrder)).city_id;
      const bps = r.stages.filter((x) => x.type === 'pickup' && x.city_id == fromC), dps = r.stages.filter((x) => x.type === 'drop' && x.city_id == toC);
      const src = pickSrc();
      try {
        const b = D.createBooking({
          schedule_id: s.id, from_city_id: fromC, to_city_id: toC, boarding_stage_id: R.pick(bps).id, dropping_stage_id: R.pick(dps).id, source: src,
          agent_phone: src === 'agent' ? R.pick(agents).phone : null, payment_mode: src === 'agent' && R.chance(0.5) ? 'settle_later' : 'paid', payment_method: R.pick(['upi', 'cash', 'card', 'online']),
          contact: { name: cust.name, phone: cust.phone }, passengers: seats.map((x, i) => ({ seat: x.code, name: i ? `${R.pick(FIRST)} ${R.pick(LAST)}` : cust.name, gender: i ? R.pick(['M', 'F']) : cust.gender, age: R.int(19, 62) })),
          coupon: src === 'website' && R.chance(0.3) ? 'SAVE10' : null,
        }, admin);
        // backdate booking time
        b.booked_at = new Date(new Date(`${s.travel_date}T10:00:00`).getTime() - R.int(1, 20) * 86400e3 * (R() < 0.6 ? 0.2 : 1)).toISOString();
        made++;
        if (days < 0) {
          for (const p of b.passengers) p.status = R.chance(0.03) ? 'no_show' : 'dropped';
        } else if (days === 0) {
          for (const p of b.passengers) p.call_status = R.pick([null, 'called', 'to_call']);
        }
        if (R.chance(0.05)) D.cancelBooking(b.pnr, { by: R.chance(0.8) ? 'passenger' : 'operator', reason: 'Change of plans', notify: false }, admin);
      } catch (e) { /* seat clash — retry */ }
    }
    if (days < 0) { s.trip_status = 'completed'; s.km = U.round2(575 + R() * 20); s.fuel_l = U.round2(140 + R() * 15); s.telemetry = { idling: R.int(0, 5), stoppage: R.int(3, 10), hard_brake: R.int(0, 4), harsh_accel: R.int(0, 3), over_speed: R.int(0, 3), max_speed_kmh: R.int(78, 98), driving_score: R.int(62, 99) }; s.delay_minutes = R.int(-5, 40); }
    if (days === 0) s.trip_status = 'scheduled';
  }
  db.col('alerts').all().splice(0); // seed noise
  const msgs = db.col('messages').all(); for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].by === 'system') msgs.splice(i, 1);

  // ---------- Coupons ----------
  db.col('coupons').insert({ code: 'OFF100', description: 'Flat ₹100 off', discount_type: 'flat', discount_value: 100, min_fare: 500, audience: 'all', channels: [], is_active: true, stackable: false, per_user_limit: null, total_limit: null, valid_from: null, valid_until: null });
  db.col('coupons').insert({ code: 'SAVE10', description: 'Flat 10% off', discount_type: 'percentage', discount_value: 10, min_fare: 800, max_discount_amount: 300, audience: 'all', channels: [], is_active: true, stackable: false });
  db.col('coupons').insert({ code: 'WELCOME15', description: 'Flat 15% off — first trip', discount_type: 'percentage', discount_value: 15, min_fare: 800, max_discount_amount: 400, audience: 'first_time', channels: ['website'], is_active: false });

  // ---------- Notification subscriptions ----------
  for (const [ev, ch] of [[['booking.created', 'booking.cancelled', 'booking.modified', 'passenger.pre_boarding', 'trip.delayed', 'vehicle.approaching', 'passenger.rating_request'], 'whatsapp']]) db.col('notification_subscriptions').insert({ subscriber_type: 'passenger', subscriber_ref: '*', display_name: 'Passenger', event_types: ev, channel: ch, enabled: true });
  db.col('notification_subscriptions').insert({ subscriber_type: 'group', subscriber_ref: 'office', display_name: 'Office (default)', event_types: ['booking.cancelled', 'trip.delayed', 'hold.expired'], channel: 'push', enabled: true });
  db.col('notification_subscriptions').insert({ subscriber_type: 'group', subscriber_ref: 'crew', display_name: 'Crew (default)', event_types: ['booking.created'], channel: 'push', enabled: true });
  db.col('speed_dials').insert({ code: '1', kind: 'number', phone: '9000000005', label: 'Ops desk', is_active: true });

  // ---------- Chats & calls (today / yesterday) ----------
  const recent = db.col('bookings').filter((b) => b.status === 'confirmed' && [T, U.addDays(T, -1)].includes(b.travel_date));
  for (const b of recent.slice(0, 40)) {
    const conv = D.passengerConvId(b, b.passengers[0]);
    const q = R.pick(['Where is the bus now?', 'What is the exact pickup location?', 'Can I board at the next stop?', 'Bus is late, please update', 'Is there charging point?', 'I want to change my seat']);
    db.col('messages').insert({ conversation_id: conv, direction: 'in', channel: R.pick(['whatsapp', 'app']), text: q, phone: b.contact.phone, ts: new Date(Date.now() - R.int(5, 600) * 60e3).toISOString(), read: R.chance(0.4), by: b.contact.name });
    if (R.chance(0.5)) db.col('messages').insert({ conversation_id: conv, direction: 'out', channel: 'whatsapp', text: 'Hi, we will share the live tracking link shortly.', phone: b.contact.phone, ts: U.nowIso(), read: true, by: 'Admin' });
    db.col('calls').insert({ direction: R.pick(['incoming', 'outgoing']), kind: R.pick(['manual', 'boarding_call', 'bus_near_call']), phone: b.contact.phone, passenger_name: b.contact.name, pnr: b.pnr, schedule_id: b.schedule_id, status: R.pick(['answered', 'answered', 'missed', 'busy']), duration_s: R.int(0, 240), agent: 'Admin', ts: new Date(Date.now() - R.int(5, 900) * 60e3).toISOString(), recording_url: null });
  }

  // ---------- Attendance, payouts, advances ----------
  for (const s of db.col('schedules').filter((x) => x.travel_date < T && x.status === 'active')) {
    for (const c of s.crew || []) db.col('attendance').insert({ staff_id: c.staff_id, date: s.travel_date, status: 'present', schedule_id: s.id, source: 'auto', state: U.daysBetween(s.travel_date, T) > 7 ? 'approved' : 'draft', amount: (db.col('staff').get(c.staff_id)?.salary_amount || 0) });
  }
  for (const st of drivers.slice(0, 6)) db.col('advances').insert({ staff_id: st.id, advance_type: 'salary', amount: 1000 * R.int(1, 3), date_issued: U.addDays(T, -R.int(1, 20)), payment_mode: 'cash', recovery_method: 'one_time', amount_recovered: 0, status: 'disbursed' });
  db.col('reimbursements').insert({ staff_id: drivers[0].id, category: 'Tolls', amount: 450, date: U.addDays(T, -2), receipt: null, status: 'pending', description: 'FASTag recharge failed — cash toll' });
  const ps = U.addDays(T, -37), pe = U.addDays(T, -8);
  for (const st of [...drivers, ...helpers]) {
    const days = db.col('attendance').count((a) => a.staff_id === st.id && a.date >= ps && a.date <= pe);
    if (!days) continue;
    const gross = days * st.salary_amount;
    db.col('payouts').insert({ payout_no: `PAY-${T.slice(0, 7)}-${String(st.id).padStart(3, '0')}`, staff_id: st.id, period_start: ps, period_end: pe, days, gross, deductions: 0, advances_recovered: 0, net: gross, status: R.chance(0.7) ? 'paid' : 'approved', paid_at: U.addDays(T, -5), payment_mode: 'bank' });
  }
  if (vanDriver) void 0;

  // ---------- Accounts: ledger, documents, settlements, ratings ----------
  for (const a of agents) db.col('ledger').insert({ channel_key: `agent:${a.phone}`, channel_type: 'agent', type: 'credit', amount: 5000, note: 'UTR 4521XXXX', date: U.addDays(T, -3), by: 'Admin' });
  const mon = U.addDays(T.slice(0, 7) + '-01', -1).slice(0, 7); // last closed billing month
  for (const [kind, label, name, amount, status] of [['invoice', 'Tax Invoice', 'ST/26-27/11', 112244.2, 'Paid'], ['metro', 'Metro Feeder Statement', 'MFS-2026-00042', 26365, null], ['calls', 'Cloud Calling Statement', 'CS-2026-00033', 4822.6, null], ['calls', 'AI Calling Statement', 'CS-2026-00034', 21655, null], ['chats', 'Chat Statement', 'CHS-2026-00035', 4510.66, null], ['operator', 'Operator Statement', 'OS-2026-00132', 121811.93, null], ['platform', 'Platform Sales Statement', 'PSS-2026-00091', null, null]]) db.col('invoices').insert({ kind, label, name, month: mon, date: U.addDays(U.addDays(T.slice(0,7)+'-01',-1),0), amount, status, is_demo_reference: true });
  db.col('settlements').insert({ ota_slug: 'redbus', file_name: 'redbus-settlement.pdf', invoice_number: 'RB-000014', billing_period_start: U.addDays(T, -14), billing_period_end: U.addDays(T, -8), status: 'matched', created_at: U.addDays(T, -6) });
  for (const b of db.col('bookings').filter((x) => ['redbus', 'abhibus'].includes(x.source) && x.travel_date < T).slice(0, 80)) {
    const rating = R.chance(0.15) ? R.int(1, 2) : R.int(3, 5);
    db.col('ota_ratings').insert({ ota: b.source, pnr: b.pnr, passenger_name: b.contact.name, phone: b.contact.phone, schedule_id: b.schedule_id, travel_at: b.travel_date, rating, rated_at: U.addDays(b.travel_date, 1), review: rating <= 2 ? R.pick(['Bus was late by 1 hour', 'AC not working properly', 'Driver rash driving', 'Pickup point confusion']) : R.pick([null, 'Good journey', 'Clean bus, on time']), operator_reply: null });
  }

  db.col('trip_expenses'); db.col('sarathi');
  db.persistNow();
  return { routes: db.col('routes').count(), schedules: db.col('schedules').count(), bookings: db.col('bookings').count(), vehicles: db.col('vehicles').count(), staff: db.col('staff').count() };
}

if (require.main === module) console.log('Seeded', seed());
module.exports = { seed };
