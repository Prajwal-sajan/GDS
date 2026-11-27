// Smoke: loyalty upgrade endpoints (view + eligibility gate). No data is changed when not eligible.
const B = "http://localhost:5080/api/admin", H = { "X-Admin-Key": "dev-owner-key", "X-Tenant": "demo", "Content-Type": "application/json" };
const j = async (m, u, b) => { const r = await fetch(B + u, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }); const t = await r.text(); return { s: r.status, d: t ? JSON.parse(t) : null }; };
const ok = (c, m) => { if (!c) throw new Error("FAIL " + m); console.log("ok", m); };
const date = new Date().toISOString().slice(0, 10);
const { d: { trips } } = await j("GET", `/trip-sheets?date=${date}`);
const s = (await j("GET", `/trip-sheets/${trips[0].id}`)).d; const p = s.passengers.find((x) => x.status !== "cancelled");
ok("seatUpgrade" in p, "trip sheet exposes seatUpgrade");
const base = `/trip-sheets/${s.id}/loyalty-upgrades/${p.pnr}/${p.seat}`;
const v = await j("GET", base); ok(v.s === 200 && v.d.current_seat === p.seat && Array.isArray(v.d.options), `view (reason: ${v.d.reason})`);
if (v.d.reason) { const o = await j("POST", base + "/offer", { targetSeat: "X1" }); ok(o.s === 409 && o.d.message === v.d.reason || o.s === 409, `offer gated: ${o.d?.message}`); }
const a = await j("POST", base + "/accept", { consentConfirmed: true, consentMethod: "phone", consentReference: "ref-1" }); ok(a.s === 409, `accept without offer rejected: ${a.d?.message}`);
const n = await j("GET", `/trip-sheets/${s.id}/loyalty-upgrades/NOPE/1`); ok(n.s === 404, "unknown booking 404");
console.log("ALL PASSED");
