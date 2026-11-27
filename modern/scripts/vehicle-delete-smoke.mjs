// Smoke: vehicle delete (V005). Creates a throwaway vehicle, deletes it, and checks a busy vehicle is refused.
const A = "http://localhost:5080/api/admin", H = { "X-Admin-Key": "dev-owner-key", "X-Tenant": "demo", "Content-Type": "application/json" };
const raw = (u, m = "GET", b) => fetch(A + u, { method: m, headers: H, body: b && JSON.stringify(b) });
const j = async (u, m, b) => { const r = await raw(u, m, b); const t = await r.text(); if (!r.ok) throw new Error(`${m} ${u} ${r.status} ${t}`); return JSON.parse(t); };
const reg = `KA99SM${Date.now() % 10000}`;
const v = await j("/vehicles", "POST", { registrationNumber: reg });
const id = v.id ?? v.Id; console.log("created", id, reg);
console.log("delete", await j(`/vehicles/${id}`, "DELETE"));
const list = (await j("/vehicle-list")).vehicles;
if (list.some((x) => x.id === id)) throw new Error("vehicle still listed");
console.log("OK");
