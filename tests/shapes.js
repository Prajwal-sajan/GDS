// Dev helper: prints the top-level shape of key endpoints (used to wire UI screens).
const app = require('../server/index');
const srv = app.listen(0, async () => {
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  const j = (m, u, b, t) => fetch(base + u, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json());
  await j('POST', '/auth/request-otp', { phone: '9999999999' });
  const { token } = await j('POST', '/auth/verify-otp', { phone: '9999999999', otp: '1234' });
  const shape = (v, d = 0) => { if (Array.isArray(v)) return v.length ? [shape(v[0], d + 1)] : []; if (v && typeof v === 'object') { if (d > 2) return '{…}'; return Object.fromEntries(Object.entries(v).slice(0, 40).map(([k, x]) => [k, shape(x, d + 1)])); } return typeof v === 'string' ? (v.length > 30 ? v.slice(0, 30) : v) : v; };
  const urls = process.argv.slice(2);
  for (const u of urls) { const r = await j('GET', u, null, token); console.log('### ' + u + '\n' + JSON.stringify(shape(r))); }
  srv.close(); process.exit(0);
});
