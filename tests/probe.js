// Dev helper: dumps shapes of overlay-consumed endpoints using real ids.
const app = require('../server/index');
const srv = app.listen(0, async () => {
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  let token;
  const j = (m, u, b) => fetch(base + u, { method: m, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json());
  await j('POST', '/auth/request-otp', { phone: '9999999999' });
  token = (await j('POST', '/auth/verify-otp', { phone: '9999999999', otp: '1234' })).token;
  const shape = (v, d = 0) => { if (Array.isArray(v)) return v.length ? [shape(v[0], d + 1)] : []; if (v && typeof v === 'object') { if (d > 3) return '{…}'; return Object.fromEntries(Object.entries(v).slice(0, 50).map(([k, x]) => [k, shape(x, d + 1)])); } return typeof v === 'string' ? v.slice(0, 24) : v; };
  const out = async (u) => { const r = await j('GET', u); console.log('### ' + u + '\n' + JSON.stringify(shape(r))); return r; };
  const today = new Date().toISOString().slice(0, 10);
  const list = await out(`/schedules?from=${today}&to=${today}`);
  const sid = list.schedules[0].id;
  const det = await out(`/schedules/${sid}`);
  const vc = det.route?.via_cities || [];
  await out(`/schedules/${sid}/seat-layout?from_city_id=${vc[0]?.city_id}&to_city_id=${vc[vc.length - 1]?.city_id}`);
  for (const u of [`/schedules/${sid}/booking-history`, `/schedules/${sid}/fares`, `/schedules/${sid}/history`, `/trips/${sid}`, `/trips?tab=today&date=${today}`, '/vehicles', '/coaches', '/staff', '/calls', '/chats', '/accounts/channels', '/reconciliation/config', `/accounts/analytics?from=${today}&to=${today}`, `/accounts/receivables?from=${today}&to=${today}`]) await out(u);
  const v = (await j('GET', '/vehicles')).vehicles?.[0]; if (v) await out(`/vehicles/${v.id}/live`);
  const r = (await j('GET', '/routes')).routes?.[0]; if (r) { await out(`/routes/${r.id}`); await out(`/routes/${r.id}/halts?days=15`); }
  srv.close(); process.exit(0);
});
