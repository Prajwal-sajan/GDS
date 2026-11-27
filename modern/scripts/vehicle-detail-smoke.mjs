// Smoke: vehicle detail workspace (V005). Details save, document upload/replace/visibility/archive/delete, maintenance CRUD.
const A = "http://localhost:5080/api/admin", H = { "X-Admin-Key": "dev-owner-key", "X-Tenant": "demo", "Content-Type": "application/json" };
const j = async (u, m = "GET", b) => { const r = await fetch(A + u, { method: m, headers: H, body: b && JSON.stringify(b) }); const t = await r.text(); if (!r.ok) throw new Error(`${m} ${u} ${r.status} ${t}`); return t ? JSON.parse(t) : {}; };
const expectFail = async (u, m, b, code) => { const r = await fetch(A + u, { method: m, headers: H, body: JSON.stringify(b) }); if (r.status !== code) throw new Error(`expected ${code} got ${r.status} for ${u}`); };
const coach = (await j("/coach-list")).coaches[0];
const v = await j("/vehicles", "POST", { registrationNumber: `KA99VD${Date.now() % 10000}`, coachTemplateId: coach.id });
const id = v.id ?? v.Id, b = `/vehicles/${id}`;
try {
  await j(`${b}/detail`, "PUT", { chassis_number: "MBZS123", engine_number: "ENG9", dms_enabled: true, purchased_date: "2024-05-01", manufacture_year: "2022", odometer_reading: "125000", tags: { depot: "mangaluru" }, ownership_type: "permanent", vehicle_role: "main" });
  let d = await j(`${b}/detail`);
  if (d.vehicle.chassis_number !== "MBZS123" || d.vehicle.tags.depot !== "mangaluru" || d.vehicle.dms_enabled !== true || d.vehicle.odometer_reading !== 125000) throw new Error("details not persisted " + JSON.stringify(d.vehicle));
  await expectFail(`${b}/detail`, "PUT", { manufacture_year: "1800" }, 400);
  const pdf = "data:application/pdf;base64," + Buffer.from("%PDF-1.4 smoke").toString("base64");
  await expectFail(`${b}/documents`, "POST", { documentType: "RC", fileName: "x.pdf", fileData: "data:application/pdf;base64," + Buffer.from("nope").toString("base64") }, 400);
  const d1 = await j(`${b}/documents`, "POST", { documentType: "RC", documentName: "RC", fileName: "rc.pdf", fileData: pdf, expiryDate: "2027-01-01", visibility: "private" });
  const d2 = await j(`${b}/documents`, "POST", { documentType: "RC", documentName: "RC", fileName: "rc2.pdf", fileData: pdf });
  if (d2.replaced !== 1) throw new Error("replace did not archive previous");
  await j(`${b}/documents/${d2.document.id}`, "PUT", { visibility: "public" });
  const file = await fetch(`${A}${b}/documents/${d2.document.id}/file`, { headers: H }); if ((await file.text()).indexOf("%PDF") !== 0) throw new Error("file download");
  const m = await j(`${b}/maintenance`, "POST", { label: "Oil change", type: "service", serviceDate: "2026-10-01", nextDueDate: "2026-11-01", cost: 4500 });
  d = await j(`${b}/detail`);
  if (d.service.status !== "Service due" || d.maintenance.length !== 1 || d.archive.length !== 1) throw new Error("overview " + JSON.stringify(d.service));
  await j(`${b}/maintenance/${m.record.id}`, "PUT", { label: "Oil change + filter", cost: 5000 });
  await j(`${b}/maintenance/${m.record.id}/archive`, "POST", {});
  await j(`${b}/documents/${d2.document.id}/archive`, "POST", {});
  d = await j(`${b}/detail`); if (d.archive.length !== 3 || d.documents.length !== 0) throw new Error("archive count " + d.archive.length);
  console.log("doc ids", d1.document.id, d2.document.id, "OK");
} finally {
  await fetch(`${A}${b}`, { method: "DELETE", headers: H }).then((r) => console.log("cleanup", r.status));
}
