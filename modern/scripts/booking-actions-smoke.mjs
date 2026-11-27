// Smoke test for CRM booking workspace actions (comment, edit, refund quote, history, shift options/seats, shift, restore).
// Usage: node modern/scripts/booking-actions-smoke.mjs   (API on :5080, admin key)
const B = "http://localhost:5080/api/admin", H = { "X-Admin-Key": "dev-owner-key", "X-Tenant": "demo", "Content-Type": "application/json" };
const call = async (m, p, body) => {
  const r = await fetch(B + p, { method: m, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); if (!r.ok) throw new Error(`${m} ${p} ${r.status} ${t}`); return t ? JSON.parse(t) : null;
};
const pnr = process.argv[2];
if (!pnr) throw new Error("pass a PNR");
const ok = (c, m) => { if (!c) throw new Error(m); console.log("ok", m); };

const before = (await call("GET", `/crm/booking/${pnr}`)).booking;
const q = await call("GET", `/bookings/${pnr}/refund-quote`); ok(q.refund_pct >= 0 && q.refund_pct <= 100, `quote ${q.refund_pct}%`);
const c = await call("POST", `/bookings/${pnr}/comments`, { text: "smoke comment" }); ok(c.some((x) => x.text === "smoke comment"), "comment stored");
let bad = await fetch(`${B}/bookings/${pnr}/comments`, { method: "POST", headers: H, body: JSON.stringify({ text: "" }) }); ok(bad.status === 400, "empty comment rejected");
const e = await call("PUT", `/bookings/${pnr}`, { contact: { name: "Smoke Contact", phone: before.contact.phone, email: "" }, passengers: before.passengers.map((p) => ({ seat: p.seat, name: p.name })) });
ok(e.fields.length === 2, "edit fields " + e.fields.join(","));
bad = await fetch(`${B}/bookings/${pnr}`, { method: "PUT", headers: H, body: JSON.stringify({ contact: { name: "x", phone: "12", email: "" } }) }); ok(bad.status === 400, "bad mobile rejected");
const after = (await call("GET", `/crm/booking/${pnr}`)).booking; ok(after.contact.name === "Smoke Contact" && after.comments.length >= 1, "crm shows contact + comments");
const date = before.travelDate.slice(0, 10);
const o = await call("GET", `/bookings/${pnr}/shift-options?date=${date}`); ok(o.services.length >= 1, `shift services ${o.services.length}`);
const own = o.services.find((s) => s.id === before.scheduleId) ?? o.services[0];
const s = await call("GET", `/bookings/${pnr}/shift-seats?schedule_id=${own.id}`); ok(s.seats.length >= s.passengers.length, `shift seats ${s.seats.length}`);
// shift within the same trip to free seats, then back to the original seats
const active = before.passengers.filter((p) => p.status !== "cancelled");
const free = s.seats.filter((x) => x.status !== "current").map((x) => x.seat);
if (own.id === before.scheduleId && free.length >= active.length) {
  const map = Object.fromEntries(active.map((p, i) => [p.seat, free[i]]));
  await call("POST", `/bookings/${pnr}/shift-to`, { scheduleId: own.id, seatMap: map }); ok(true, "shifted " + JSON.stringify(map));
  const back = Object.fromEntries(active.map((p, i) => [free[i], p.seat]));
  await call("POST", `/bookings/${pnr}/shift-to`, { scheduleId: own.id, seatMap: back }); ok(true, "shifted back");
}
const h = await call("GET", `/bookings/${pnr}/history`);
ok(h.events.some((x) => x.title === "Comment Added") && h.events.some((x) => x.title === "Booking Updated") && h.events.some((x) => x.title === "Booking Created"), "history " + h.events.map((x) => x.title).join(" | "));
// restore contact name
await call("PUT", `/bookings/${pnr}`, { contact: { name: before.contact.name ?? "Passenger", phone: before.contact.phone, email: before.contact.email ?? "" } });
console.log("ALL PASSED");
