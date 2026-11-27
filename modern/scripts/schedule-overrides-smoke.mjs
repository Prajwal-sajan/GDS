// Smoke: schedule overlay per-trip stop overrides, trip seat fare rules (priced), edit history, apply delay.
const API = "http://localhost:5080/api/admin";
const H = { "X-Admin-Key": "dev-owner-key", "X-Tenant": "demo", "Content-Type": "application/json" };
const ok = (c, m) => { if (!c) { console.error("FAIL", m); process.exit(1); } console.log("ok", m); };
const j = async (p, method = "GET", body) => { const r = await fetch(API + p, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };

const today = new Date().toISOString().slice(0, 10);
const to = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);
const s = (await j(`/schedules?from=${today}&to=${to}`)).body.schedules[0]; ok(s, "schedule found");
const pre = (await j(`/schedule-detail/${s.id}`)).body;
await j(`/schedules/${s.id}/stage-overrides`, "PUT", { overrides: {}, reset: pre.stageOverrides ?? [] }); // clean slate
const d0 = (await j(`/schedule-detail/${s.id}`)).body;
const st = d0.stages.find((x) => x.kind === "pickup"); ok(st, "pickup stage");

// --- stage overrides
ok((await j(`/schedules/${s.id}/stage-overrides`, "PUT", { overrides: { 999999999: { name: "x" } } })).status === 400, "unknown stop rejected");
ok((await j(`/schedules/${s.id}/stage-overrides`, "PUT", { overrides: { [st.id]: { time: "25:99" } } })).status === 400, "bad time rejected");
ok((await j(`/schedules/${s.id}/stage-overrides`, "PUT", { overrides: { [st.id]: { day: "9" } } })).status === 400, "bad day rejected");
ok((await j(`/schedules/${s.id}/stage-overrides`, "PUT", { overrides: { [st.id]: { lat: "200" } } })).status === 400, "bad lat rejected");
ok((await j(`/schedules/${s.id}/stage-overrides`, "PUT", { overrides: { [st.id]: { landmark: "Smoke Gate 4", time: "6:05" } } })).status === 200, "override saved");
ok((await j(`/schedules/${s.id}/stage-overrides`, "PUT", { overrides: { [st.id]: { contact_number: "9876500000" } } })).status === 200, "partial override merged");
let d = (await j(`/schedule-detail/${s.id}`)).body;
let ov = d.stages.find((x) => x.id === st.id);
ok(ov.overridden && ov.landmark === "Smoke Gate 4" && ov.time.startsWith("06:05") && ov.contactNumber === "9876500000", "detail reflects merged override");
ok(d.stageOverrides.includes(st.id), "stageOverrides lists id");
const sheet = await j(`/trip-sheets/${s.id}`);
ok(sheet.status === 200 && JSON.stringify(sheet.body).includes("06:05"), "trip sheet reflects override time");
ok((await j(`/schedules/${s.id}/stage-overrides`, "PUT", { overrides: {}, reset: [st.id] })).status === 200, "reset");
d = (await j(`/schedule-detail/${s.id}`)).body;
ov = d.stages.find((x) => x.id === st.id);
ok(!ov.overridden && ov.landmark === st.landmark && ov.time === st.time, "reset restores route template");

// --- seat fare rules
const pnr = d0.history.find((x) => x.status === "confirmed")?.pnr ?? d0.history[0]?.pnr;
const crmSeat = async (c) => { if (!pnr) return undefined; const b = (await j(`/crm/booking/${pnr}`)).body; return b?.map?.decks?.flatMap((x) => x.seats).find((y) => c ? y.code === c : y.status === "available"); };
const code = (await crmSeat())?.code ?? (await j(`/trips/${s.id}/seats`)).body[0].seatCode;
const fareOf = async () => Number((await crmSeat(code))?.fare ?? NaN);
const before = await fareOf();
console.log(pnr ? `pricing via CRM booking ${pnr}, seat ${code}, base ${before}` : "no booking on trip — pricing check skipped");
ok((await j(`/schedules/${s.id}/seat-fare-rules`, "PUT", { rules: [{ name: "X", seats: ["ZZ99"], days: [], kind: "flat", value: 10 }] })).status === 400, "unknown seat rejected");
ok((await j(`/schedules/${s.id}/seat-fare-rules`, "PUT", { rules: [{ name: "X", seats: [code], days: [], kind: "percent", value: 150 }] })).status === 400, "percent > 100 rejected");
ok((await j(`/schedules/${s.id}/seat-fare-rules`, "PUT", { rules: [{ name: "Premium", seats: [code], days: [], kind: "flat", value: 100 }] })).status === 200, "rule saved");
d = (await j(`/schedule-detail/${s.id}`)).body;
ok(d.seatFareRules.length === 1 && d.seatFareRules[0].seats[0] === code, "detail lists rule");
if (Number.isFinite(before)) ok(await fareOf() === before + 100, `seat ${code} priced +100 (${before} → ${before + 100})`);
ok((await j(`/schedules/${s.id}/seat-fare-rules`, "PUT", { rules: [] })).status === 200, "rules cleared");
if (Number.isFinite(before)) ok(await fareOf() === before, "fare restored");

// --- history
const h = (await j(`/schedules/${s.id}/history`)).body.history;
ok(h.some((x) => x.section === "stops") && h.some((x) => x.section === "fares"), "edit history lists stops + fares");

// --- apply delay (absolute; restored after)
const prev = d0.delayMinutes ?? 0;
ok((await j(`/trips/${s.id}/delay`, "POST", { minutes: 15, reason: "" })).status === 400, "delay without reason rejected");
const r = await j(`/trips/${s.id}/delay`, "POST", { minutes: 15, reason: "Smoke traffic", notify: false });
ok(r.status === 200 && r.body.delay_minutes === 15, "delay applied");
ok((await j(`/schedule-detail/${s.id}`)).body.delayMinutes === 15, "detail shows delay");
await j(`/trips/${s.id}/delay`, "POST", { minutes: prev, reason: prev ? "restore" : "", notify: false });
console.log("ALL OK");
