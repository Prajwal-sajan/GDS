// Smoke: trips passenger status / stop events / communications. Restores state afterwards.
const B = "http://localhost:5080/api/admin", H = { "X-Admin-Key": "dev-owner-key", "X-Tenant": "demo", "Content-Type": "application/json" };
const j = async (m, u, b) => { const r = await fetch(B + u, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }); const t = await r.text(); if (!r.ok) throw new Error(`${m} ${u} ${r.status} ${t}`); return t ? JSON.parse(t) : null; };
const ok = (c, m) => { if (!c) throw new Error("FAIL " + m); console.log("ok", m); };
const date = process.argv[2] || new Date().toISOString().slice(0, 10);
const { trips } = await j("GET", `/trip-sheets?date=${date}`);
let t, p;
for (const x of trips) { const s = await j("GET", `/trip-sheets/${x.id}`); p = s.passengers.find((q) => q.status === "booked"); if (p) { t = s; break; } }
ok(t, `trip with booked pax on ${date}`);
const origEv = t.stops[0];
await j("PATCH", `/trip-sheets/${t.id}/passengers/${p.pnr}/${p.seat}`, { callStatus: "called" });
await j("PATCH", `/trip-sheets/${t.id}/passengers/${p.pnr}/${p.seat}`, { status: "checked_in" });
let s = await j("GET", `/trip-sheets/${t.id}`); let q = s.passengers.find((x) => x.pnr === p.pnr && x.seat === p.seat);
ok(q.callStatus === "called" && q.status === "checked_in", "call status + check-in persisted");
await j("PATCH", `/trip-sheets/${t.id}/passengers/${p.pnr}/${p.seat}`, { status: "dropped" });
s = await j("GET", `/trip-sheets/${t.id}`); ok(s.passengers.find((x) => x.pnr === p.pnr && x.seat === p.seat).status === "dropped", "dropped");
try { await j("PATCH", `/trip-sheets/${t.id}/passengers/${p.pnr}/${p.seat}`, { callStatus: "bogus" }); ok(false, "reject bad"); } catch (e) { ok(/Invalid call status/.test(e.message), "invalid call status rejected"); }
await j("PATCH", `/trip-sheets/${t.id}/passengers/${p.pnr}/${p.seat}`, { status: "booked", callStatus: "" });
await j("POST", `/trip-sheets/${t.id}/stop-event`, { stageId: origEv.id, kind: "arrived" });
s = await j("GET", `/trip-sheets/${t.id}`); ok(s.stops[0].arrivedAt, "stop arrived stamped");
const c = await j("GET", `/trip-sheets/${t.id}/passengers/${p.pnr}/communications`);
ok(Array.isArray(c.rows) && typeof c.outCalls === "number", `communications (${c.rows.length} rows)`);
console.log("ALL PASSED", t.id, p.pnr);
