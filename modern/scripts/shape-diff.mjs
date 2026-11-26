// Compares JSON key shapes of legacy (:3100 /api) vs .NET (:5080 /api/admin) for the given paths.
// usage: node modern/scripts/shape-diff.mjs /daily-ops?date=2026-11-26 /calls ...
const LEGACY = process.env.LEGACY_URL ?? "http://localhost:3100";
const NET = process.env.NET_URL ?? "http://localhost:5080";
const otp = await (await fetch(`${LEGACY}/api/auth/request-otp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone: "9999999999" }) })).json();
const { token } = await (await fetch(`${LEGACY}/api/auth/verify-otp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone: "9999999999", otp: otp.dev_hint }) })).json();
const shape = (v, d = 0) => {
  if (Array.isArray(v)) return v.length ? [shape(v[0], d + 1)] : [];
  if (v && typeof v === "object") { if (d > 4) return "{…}"; const o = {}; for (const k of Object.keys(v).sort()) o[k] = shape(v[k], d + 1); return o; }
  return v === null ? "null" : typeof v;
};
const flat = (s, p = "", out = new Map()) => {
  if (Array.isArray(s)) { if (s.length) flat(s[0], p + "[]", out); else out.set(p + "[]", "empty"); }
  else if (s && typeof s === "object") for (const [k, v] of Object.entries(s)) flat(v, p ? `${p}.${k}` : k, out);
  else out.set(p, s);
  return out;
};
for (const path of process.argv.slice(2)) {
  const get = async (u, h) => { const r = await fetch(u, { headers: h }); const t = await r.text(); try { return [r.status, JSON.parse(t)]; } catch { return [r.status, t.slice(0, 200)]; } };
  const [ls, l] = await get(`${LEGACY}/api${path}`, { authorization: `Bearer ${token}` });
  const [ns, n] = await get(`${NET}/api/admin${path}`, { "X-Admin-Key": "dev-owner-key", "X-Tenant": "demo" });
  const a = flat(shape(l)), b = flat(shape(n));
  console.log(`\n=== ${path}  legacy ${ls}  net ${ns}`);
  const miss = [...a.keys()].filter((k) => !b.has(k)), extra = [...b.keys()].filter((k) => !a.has(k));
  console.log(" missing in .NET:", miss.join(", ") || "-");
  console.log(" extra in .NET:  ", extra.slice(0, 40).join(", ") || "-");
}
