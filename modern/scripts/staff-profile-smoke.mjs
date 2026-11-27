// Smoke: staff profile, bank, rules, ledger and documents (V007). Creates a throwaway staff member and deactivates it afterwards.
const A = "http://localhost:5080/api/admin", H = { "X-Admin-Key": "dev-owner-key", "X-Tenant": "demo", "Content-Type": "application/json" };
const raw = (u, m = "GET", b) => fetch(A + u, { method: m, headers: H, body: b && JSON.stringify(b) });
const j = async (u, m, b) => { const r = await raw(u, m, b); const t = await r.text(); if (!r.ok) throw new Error(`${m} ${u} ${r.status} ${t}`); return t ? JSON.parse(t) : {}; };
const expect = async (u, m, b, code) => { const r = await raw(u, m, b); if (r.status !== code) throw new Error(`expected ${code} got ${r.status} ${await r.text()}`); };
const phone = `9${String(Date.now()).slice(-9)}`;
const base = { name: "Smoke Staff", phone, role: "driver", status: "active", salaryType: "per_trip", salaryAmount: 800, bataPerTrip: 100 };
const profile = { address: "MG Road, Bengaluru", aadhaar: "123412341234", pan: "abcde1234f", employment_type: "Full-time", retention_per_day: 50, overtime_rate: 120,
  emergency_contact: { name: "Kin", phone: "9876543210" }, bank: { account_name: "Smoke", bank_name: "SBI", branch: "MG", account_number: "123456789012", ifsc: "sbin0001234", upi: "s@ybl" },
  payroll_bonus_rules: [{ name: "Night", amount: 200, frequency: "Every trip" }], payroll_deduction_rules: [] };
const s = await j("/staff", "POST", { ...base, profile });
try {
  const row = (await j("/staff")).find((x) => x.id === s.id);
  const p = JSON.parse(row.profileJson);
  if (p.pan !== "ABCDE1234F" || p.bank.ifsc !== "SBIN0001234" || p.payroll_bonus_rules.length !== 1 || p.emergency_contact.phone !== "9876543210") throw new Error("profile not persisted " + row.profileJson);
  await expect(`/staff/${s.id}`, "PUT", { ...base, profile: { ...profile, aadhaar: "123" } }, 400);
  await expect(`/staff/${s.id}`, "PUT", { ...base, profile: { ...profile, bank: { ifsc: "BAD" } } }, 400);
  // a save without profile must not wipe it (bulk status toggles send only base fields)
  await j(`/staff/${s.id}`, "PUT", { ...base, status: "active" });
  if (!(await j("/staff")).find((x) => x.id === s.id).profileJson) throw new Error("profile wiped by status save");
  const ledger = await j(`/payroll/staff/${s.id}/ledger`); if (!Array.isArray(ledger.entries)) throw new Error("ledger");
  const pdf = "data:application/pdf;base64," + Buffer.from("%PDF-1.4 staff").toString("base64");
  await j(`/staff/${s.id}/documents`, "POST", { documentType: "AADHAAR", fileName: "a.pdf", fileData: pdf });
  const r2 = await j(`/staff/${s.id}/documents`, "POST", { documentType: "AADHAAR", fileName: "a2.pdf", fileData: pdf });
  if (r2.replaced !== 1) throw new Error("replace");
  const docs = (await j(`/staff/${s.id}/documents`)).documents; if (docs.length !== 1 || docs[0].file_name !== "a2.pdf") throw new Error("docs list");
  const f = await raw(`/staff/${s.id}/documents/${docs[0].id}/file`); if (!(await f.text()).startsWith("%PDF")) throw new Error("download");
  await expect(`/staff/${s.id}/documents`, "POST", { documentType: "PASSPORT", fileName: "a.pdf", fileData: pdf }, 400);
  console.log("OK", s.id);
} finally {
  await j(`/staff/${s.id}`, "PUT", { ...base, status: "inactive", name: "Smoke Staff (test)" });
}
