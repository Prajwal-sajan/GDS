// Smoke: coach CRUD (V006). Creates, reads, updates and deletes a throwaway coach.
const B = "http://localhost:5080/api/admin/coaches", H = { "X-Admin-Key": "dev-owner-key", "X-Tenant": "demo", "Content-Type": "application/json" };
const j = async (u, m = "GET", b) => { const r = await fetch(u, { method: m, headers: H, body: b && JSON.stringify(b) }); const t = await r.text(); if (!r.ok) throw new Error(`${m} ${u} ${r.status} ${t}`); return JSON.parse(t); };
const p = await j(`${B}/layout-preset?kind=seater&pattern=2%2B2`); console.log("preset", p.seats.length);
const n = await j(B, "POST", { name: "Smoke Coach", busType: "A/C Seater", pattern: "2+2", amenities: ["WiFi"], seats: p.seats }); console.log("created", n);
const d = await j(`${B}/${n.id}`); console.log("get", d.name, d.seats.length, d.amenities);
console.log("put", await j(`${B}/${n.id}`, "PUT", { name: "Smoke Coach 2", amenities: ["WiFi", "CCTV"] }));
const d2 = await j(`${B}/${n.id}`); if (d2.name !== "Smoke Coach 2" || d2.amenities.length !== 2) throw new Error("update not persisted");
console.log("delete", await j(`${B}/${n.id}`, "DELETE"));
console.log("OK");
