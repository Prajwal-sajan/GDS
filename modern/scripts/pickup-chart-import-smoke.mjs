// Smoke: pickup chart import (legacy v40 preview/commit). Reference-only: bookings and seat inventory must not change.
const API = "http://localhost:5080/api/admin";
const H = { "X-Admin-Key": "dev-owner-key", "X-Tenant": "demo" };
const ok = (c, m) => { if (!c) { console.error("FAIL", m); process.exit(1); } console.log("ok", m); };
const j = async (p, o = {}) => { const r = await fetch(API + p, { ...o, headers: { ...H, ...(o.headers ?? {}) } }); return { status: r.status, body: await r.json().catch(() => null) }; };

const today = new Date().toISOString().slice(0, 10);
const to = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);
const list = await j(`/schedules?from=${today}&to=${to}`);
const s = list.body.schedules[0]; ok(s, "schedule found");
const d = (await j(`/schedule-detail/${s.id}`)).body;
const pick = d.stages.find((x) => x.kind === "pickup"), drop = d.stages.filter((x) => x.kind === "drop").at(-1);
const seatsBefore = JSON.stringify((await j(`/trips/${s.id}/seats`)).body.map((x) => x.state));

const csv = `Seat,Mobile,PNR,Name,Gender,Pickup,Drop,Fare,Source\n1,9876543210,EXT1001,Asha K,F,${pick?.name ?? "X"},${drop?.name ?? "Y"},950,redBus\n2,123,EXT1002,"Ravi, M",M,Unknown Point,${drop?.name ?? "Y"},950,Abhibus\n,,,,\n`;
const up = (body, name, gds, mime = "text/csv") => j(`/schedules/${s.id}/pickup-chart/preview`, { method: "POST", body, headers: { "Content-Type": mime, "X-Pickup-Chart-Filename": encodeURIComponent(name), "X-Pickup-Chart-GDS": gds } });

ok((await up(csv, "c.csv", "Nope")).status === 400, "unknown GDS rejected");
ok((await up(csv, "c.pdf", "EzeeInfo")).status === 415, "extension mismatch rejected");
ok((await up("a,b\n1,2", "c.csv", "EzeeInfo")).status === 422, "headerless CSV rejected");
ok((await up(`Service: ZZZ-NOPE\nSeat,PNR,Name\n1,ABCD1,X`, "c.csv", "EzeeInfo")).body?.blocking_issues?.length === 1, "service mismatch is blocking");

const p = await up(csv, "chart.csv", "Detect automatically");
ok(p.status === 200 && p.body.passenger_count === 2, "preview parsed 2 rows");
ok(p.body.input_layout === "csv" && p.body.inventory_will_change === false, "csv layout, reference-only");
ok(p.body.warnings.some((w) => w.includes("Unknown Point")), "unmatched pickup warned");
ok(p.body.warnings.some((w) => w.includes("phone")), "invalid phone warned");
ok(p.body.rows[1].name === "Ravi, M", "quoted CSV cell");

ok((await j(`/schedules/${s.id}/pickup-chart/commit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ previewId: p.body.preview_id, confirm: false }) })).status === 400, "unconfirmed commit rejected");
const c = await j(`/schedules/${s.id}/pickup-chart/commit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ previewId: p.body.preview_id, confirm: true }) });
ok(c.status === 200 && c.body.passenger_count === 2 && c.body.bookings_changed === false, "committed");
ok((await j(`/schedules/${s.id}/pickup-chart/commit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ previewId: p.body.preview_id, confirm: true }) })).status === 404, "double commit rejected");

const imp = (await j(`/schedules/${s.id}/pickup-chart/imported`)).body.imported;
ok(imp && imp.rows.length === 2 && imp.rows[0].seat === "1", "imported chart readable");
if (pick) ok(imp.rows[0].boarding_id === pick.id, "pickup matched to stage");
ok(JSON.stringify((await j(`/trips/${s.id}/seats`)).body.map((x) => x.state)) === seatsBefore, "seat inventory unchanged");

const pdf = await up(Buffer.from("%PDF-1.4\n%%EOF"), "t.pdf", "EzeeInfo", "application/pdf");
ok([422, 503].includes(pdf.status), `pdf path handled (${pdf.status}: ${pdf.body?.message ?? pdf.body?.error})`);
console.log(`cleanup: trip ${s.id}`);
console.log("ALL OK");
