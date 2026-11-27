import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, authHeaders } from "../../api";
import { Modal, confirmDialog, toast, toastError } from "../../components/ui/feedback";

// React port of legacy public/js/vehicle-detail-v19.js: Details / Documents / Maintenance / Archive workspace (vd19-* classes).
/* eslint-disable @typescript-eslint/no-explicit-any */
type V = Record<string, any>;
type Detail = { vehicle: V; coaches: { id: number; name: string }[]; documents: V[]; maintenance: V[]; service: V; archive: V[] };
const DOCS: [string, string][] = [["RC", "Registration Certificate (RC)"], ["INSURANCE", "Insurance"], ["PUC", "Pollution Under Control (PUC)"], ["FITNESS", "Fitness Certificate"],
  ["AITP_FORM_2", "AITP Form 2"], ["AITP_FORM_3", "AITP Form 3"], ["VLTD", "VLTD"], ["FDSS", "FDSS"]];
const MIME = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const num = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: 1 }));
const dmy = (v?: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split("-").reverse().join("-") : "—");
const base = (id: number) => `/vehicles/${id}`;
const fileToData = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error("Unable to read selected file")); r.readAsDataURL(f); });
const KEYS = ["registration_number", "coach_template_id", "vehicle_number", "phone_number", "ownership_type", "vehicle_role", "gps_enabled", "gps_device_id", "gps_provider", "dms_enabled",
  "dms_device_id", "dms_provider", "chassis_number", "engine_number", "model_name", "manufacture_year", "purchased_date", "odometer_reading", "notes", "tags"];

async function openFile(url: string, name?: string) {
  const win = window.open("about:blank", "_blank"); if (win) win.opener = null;
  try {
    const r = await fetch(`/api/admin${url}`, { headers: authHeaders() });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.message || "Unable to open file"); }
    const obj = URL.createObjectURL(await r.blob());
    if (win) win.location.href = obj; else { const a = document.createElement("a"); a.href = obj; a.download = name || "document"; a.click(); }
    setTimeout(() => URL.revokeObjectURL(obj), 120000);
  } catch (e) { win?.close(); throw e; }
}

function UploadModal({ id, type, label, existing, onClose, onDone }: { id: number; type: string; label: string; existing?: V; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File>(); const [exp, setExp] = useState(existing?.expiry_date || ""); const [vis, setVis] = useState(existing?.visibility === "public" ? "public" : "private");
  const [no, setNo] = useState(existing?.document_number || ""); const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!file || file.size > 5 * 1024 * 1024 || !MIME.includes(file.type)) { toast("Select a PDF or image up to 5 MB", "warn"); return; }
    setBusy(true);
    try {
      await api.admin(`${base(id)}/documents`, "POST", { documentType: type, documentName: label, fileName: file.name, fileData: await fileToData(file), expiryDate: exp || null, visibility: vis, documentNumber: no });
      onClose(); toast(existing ? "Document replaced; previous file archived" : "Document uploaded", "ok"); onDone();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  return (
    <Modal title={`${existing ? "Replace" : "Upload"} ${label}`} size="lg" onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn p" disabled={busy} onClick={() => void save()}>Save document</button></>}>
      <div className="vd19-upload-form"><p>{existing ? "The previous document is retained in Archive automatically." : "Upload a document for this vehicle."}</p>
        <label>Document file (PDF, PNG, JPEG, WebP; max 5 MB)<input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" required onChange={(e) => setFile(e.target.files?.[0])} /></label>
        <label>Expiry Date<input type="date" name="expiry_date" value={exp} onChange={(e) => setExp(e.target.value)} /></label>
        <label>Visibility<select name="visibility" value={vis} onChange={(e) => setVis(e.target.value)}><option value="public">Public</option><option value="private">Private</option></select></label>
        <label>Document number<input name="document_number" value={no} maxLength={80} onChange={(e) => setNo(e.target.value)} /></label></div>
    </Modal>
  );
}

function MaintModal({ id, record, onClose, onDone }: { id: number; record?: V; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<V>({ label: record?.label || "", type: record?.type || "service", service_date: record?.service_date || "", odometer_km: record?.odometer_km ?? "",
    next_due_date: record?.next_due_date || "", next_due_km: record?.next_due_km ?? "", cost: record?.cost ?? 0, notes: record?.notes || "" });
  const [file, setFile] = useState<File>(); const [busy, setBusy] = useState(false);
  const inp = (k: string, type = "text", extra: V = {}) => <input type={type} name={k} value={f[k]} {...extra} onChange={(e) => setF({ ...f, [k]: e.target.value })} />;
  const n = (x: unknown) => (x === "" || x === null || x === undefined ? null : Number(x));
  const save = async () => {
    const label = String(f.label).trim();
    if (!label) { toast("Maintenance description is required", "warn"); return; }
    if (file && (file.size > 5 * 1024 * 1024 || !MIME.includes(file.type))) { toast("Invalid maintenance attachment", "warn"); return; }
    setBusy(true);
    try {
      const body = { label, type: f.type, serviceDate: f.service_date || null, odometerKm: n(f.odometer_km), nextDueDate: f.next_due_date || null, nextDueKm: n(f.next_due_km), cost: n(f.cost) ?? 0, notes: f.notes,
        ...(file ? { fileName: file.name, fileData: await fileToData(file) } : {}) };
      await api.admin(record ? `${base(id)}/maintenance/${record.id}` : `${base(id)}/maintenance`, record ? "PUT" : "POST", body);
      onClose(); toast("Maintenance saved", "ok"); onDone();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  return (
    <Modal title={record ? "Edit Maintenance" : "Add Maintenance"} size="lg" onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn p" disabled={busy} onClick={() => void save()}>Save Maintenance</button></>}>
      <div className="vd19-maint-form">
        <label>Description *{inp("label", "text", { required: true, maxLength: 120, placeholder: "Service bill / job card" })}</label>
        <label>Type<select name="type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{[["service", "Service"], ["repair", "Repair"], ["inspection", "Inspection"], ["reminder", "Reminder"]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label>Service date{inp("service_date", "date")}</label>
        <label>Odometer (km){inp("odometer_km", "number", { min: 0, step: ".1" })}</label>
        <label>Next service due date{inp("next_due_date", "date")}</label>
        <label>Next service due km{inp("next_due_km", "number", { min: 0, step: ".1" })}</label>
        <label>Cost (₹){inp("cost", "number", { min: 0, step: ".01" })}</label>
        <label>Job card or service bill (PDF/image up to 5 MB)<input type="file" name="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => setFile(e.target.files?.[0])} /></label>
        <label className="full">Notes<textarea name="notes" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
      </div>
    </Modal>
  );
}

export function VehicleDetail({ id, mode: initialMode, canModify, onDone }: { id: number; mode: "view" | "edit"; canModify: boolean; onDone: () => void }) {
  const [mode, setMode] = useState(initialMode);
  const [tab, setTab] = useState<"details" | "documents" | "maintenance" | "archive">("details");
  const [archiveFilter, setArchiveFilter] = useState("all");
  const [data, setData] = useState<Detail>(); const [draft, setDraft] = useState<V>({}); const [orig, setOrig] = useState<V>({});
  const [tag, setTag] = useState({ k: "", v: "" });
  const [upload, setUpload] = useState<{ type: string; label: string; existing?: V }>(); const [maint, setMaint] = useState<{ record?: V }>();
  const reload = useCallback(async () => {
    try { const d = await api.admin<Detail>(`${base(id)}/detail`); setData(d); const v = { ...d.vehicle, tags: { ...(d.vehicle.tags || {}) } }; setDraft(v); setOrig(JSON.parse(JSON.stringify(v))); } catch (e) { toastError(e); }
  }, [id]);
  useEffect(() => { void reload(); }, [reload]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(orig);
  const confirmDiscard = async () => !dirty || (await confirmDialog("Discard unsaved vehicle changes?", { danger: true, ok: "Discard" }));
  if (!data) return <div className="vd19-root"><div className="vd19-workspace"><div className="vd19-empty">Loading…</div></div></div>;
  const edit = mode === "edit";
  const set = (k: string, v: unknown) => setDraft({ ...draft, [k]: v });
  const run = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); await reload(); toast(msg, "ok"); } catch (e) { toastError(e); } };

  const save = async () => {
    if (!edit || !dirty) return;
    if (!String(draft.registration_number || "").trim() || !draft.coach_template_id) { toast("Coach Type and Registration Number are required", "warn"); return; }
    const body: V = {}; for (const k of KEYS) body[k] = draft[k] ?? (k === "tags" ? {} : k.endsWith("_enabled") ? false : "");
    body.manufacture_year = body.manufacture_year === null ? "" : String(body.manufacture_year); body.odometer_reading = body.odometer_reading === null ? "" : String(body.odometer_reading);
    body.coach_template_id = String(body.coach_template_id);
    await run(() => api.admin(`${base(id)}/detail`, "PUT", body), "Vehicle details saved");
  };

  const field = (label: string, key: string, placeholder = "", type = "text", required = false, options?: { id: number; name: string }[]) => {
    const val = draft[key] ?? "";
    let content: ReactNode;
    if (!edit) { const t = options ? options.find((c) => String(c.id) === String(val))?.name || val : val; content = t !== "" && t !== null ? String(t) : <span className="vd19-placeholder">{placeholder || "—"}</span>; }
    else if (options) content = <select id={`vd19-${key}`} name={key} data-vd19-field={key} required={required} value={String(val)} onChange={(e) => set(key, Number(e.target.value))}>{options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>;
    else content = <input id={`vd19-${key}`} data-vd19-field={key} name={key} required={required} type={type} min={type === "number" ? 0 : undefined} step={type === "number" ? "any" : undefined} value={String(val)} placeholder={placeholder} onChange={(e) => set(key, e.target.value)} />;
    return <div className="vd19-field-row"><label htmlFor={`vd19-${key}`}>{label}{required && <em> *</em>}</label><div className="vd19-value">{content}</div></div>;
  };
  const segment = (label: string, key: string, choices: [string, string][]) => {
    const all = choices.concat(!choices.some(([c]) => c === draft[key]) && draft[key] ? [[draft[key], draft[key][0].toUpperCase() + draft[key].slice(1)]] : []);
    return <div className="vd19-field-row vd19-segment-row"><span>{label}</span><div className="vd19-segments">{all.map(([v, t]) => <button key={v} type="button" data-vd19-option={key} data-value={v} disabled={!edit} className={draft[key] === v ? "selected" : ""} onClick={() => set(key, v)}>{t}</button>)}</div></div>;
  };
  const toggled = (label: string, key: string) => <div className="vd19-field-row vd19-toggle-row"><span>{label}</span><label className="vd19-switch"><input type="checkbox" data-vd19-flag={key} checked={!!draft[key]} disabled={!edit} aria-label={label} onChange={(e) => set(key, e.target.checked)} /><i></i></label></div>;
  const coaches = data.coaches.length ? data.coaches : [{ id: draft.coach_template_id, name: draft.coach || "Unassigned coach" }];

  const details = (
    <>
      <div className="vd19-details-grid">
        <div className="vd19-col"><h4>VEHICLE DETAILS</h4>
          <div className="vd19-card">{field("Coach Type", "coach_template_id", "Choose coach type", "text", true, coaches)}{field("Registration Number", "registration_number", "Enter registration", "text", true)}
            {field("Vehicle Number (Fleet ID)", "vehicle_number", "e.g., FLEET-001, BUS-42")}{field("📞 Mobile Number", "phone_number", "e.g., 9113209461", "tel")}</div>
          <div className="vd19-card vd19-segment-card">{segment("Vehicle Ownership", "ownership_type", [["permanent", "Permanent"], ["temporary", "Temporary"]])}{segment("Vehicle Type", "vehicle_role", [["main", "Main Bus"], ["pickup_van", "Pickup Bus"]])}</div>
          <p className="vd19-help">{draft.ownership_type === "permanent" ? "Own fleet. Fleet utilization counts it every day. Runs the trip. Counted in fleet utilization." : "Temporary or attached vehicle. Fleet ownership and utilization are determined by its actual assignment."}</p>
          <h4>GPS &amp; DRIVER MONITORING</h4>
          <div className="vd19-card">{toggled("GPS Enabled", "gps_enabled")}{field("GPS Device ID", "gps_device_id", "e.g., GPS-12345")}{field("GPS Provider", "gps_provider", "e.g., Intouchgps, Fleetx, etc.")}
            {toggled("DMS Enabled", "dms_enabled")}{field("DMS Device ID", "dms_device_id", "e.g., DMS-12345")}{field("DMS Provider", "dms_provider", "e.g., Mobileye, Seeing Machines, etc.")}</div>
          <p className="vd19-help">Enable GPS for real-time vehicle tracking and DMS for driver safety monitoring. Configuration alone does not establish a live GPS connection.</p>
        </div>
        <div className="vd19-col"><h4>VEHICLE SPECIFICATIONS</h4>
          <div className="vd19-card">{field("Chassis Number", "chassis_number", "e.g., MBZS...")}{field("Engine Number", "engine_number", "e.g., ENG...")}{field("Model Name", "model_name", "e.g., Bharat Benz 2623C")}
            {field("Manufacture Year", "manufacture_year", "e.g., 2022", "number")}{field("Purchased Date", "purchased_date", edit ? "dd-mm-yyyy" : "—", "date")}{field("Odometer Reading (km)", "odometer_reading", "e.g., 125000.5", "number")}</div>
          <h4>NOTES</h4>
          <div className="vd19-card vd19-notes">{edit ? <textarea data-vd19-field="notes" name="notes" placeholder="Any additional notes or remarks about this vehicle..." value={draft.notes || ""} onChange={(e) => set("notes", e.target.value)} />
            : <div className="vd19-notes-read">{draft.notes || <span className="vd19-placeholder">Any additional notes or remarks about this vehicle...</span>}</div>}</div>
          <div className="vd19-card vd19-tags"><div className="vd19-tag-head">🏷 <b>Tags</b></div>
            <div className="vd19-tag-list">{Object.entries(draft.tags || {}).length ? Object.entries(draft.tags || {}).map(([k, v]) => (
              <span key={k} className="vd19-tag">{k} = {String(v)}{edit && <button data-vd19-tag-remove={k} title="Remove tag" onClick={() => { const t = { ...draft.tags }; delete t[k]; set("tags", t); }}>×</button>}</span>)) : <div className="vd19-tag-empty">No tags</div>}</div>
            {edit && <div className="vd19-tag-form"><input name="tag_name" placeholder="Name, e.g. corridor" maxLength={60} value={tag.k} onChange={(e) => setTag({ ...tag, k: e.target.value })} /><b>=</b>
              <input name="tag_value" placeholder="Value, e.g. mumbai" maxLength={120} value={tag.v} onChange={(e) => setTag({ ...tag, v: e.target.value })} />
              <button data-vd19-tag-add type="button" onClick={() => { const k = tag.k.trim(), v = tag.v.trim(); if (!k || !v || ["__proto__", "constructor", "prototype"].includes(k)) { toast("Enter a valid tag name and value", "warn"); return; } set("tags", { ...draft.tags, [k]: v }); setTag({ k: "", v: "" }); }}>+ Add</button></div>}
            <p>Labels like depot = mangaluru or corridor = mumbai — the same tags you use on routes and people.</p></div>
        </div>
      </div>
      {edit && <div className="vd19-savebar"><span data-vd19-dirty-msg>{dirty ? "Unsaved changes" : "Changes apply to this vehicle only"}</span><button type="button" data-vd19-save disabled={!dirty} onClick={() => void save()}>💾 Save Vehicle</button></div>}
    </>
  );

  const map = new Map(data.documents.map((d) => [d.document_type, d]));
  const docList: [string, string][] = [...DOCS, ...data.documents.filter((d) => !DOCS.some(([k]) => k === d.document_type)).map((d) => [d.document_type, d.document_name || d.document_type] as [string, string])];
  const documents = (
    <section className="vd19-single"><h4>VEHICLE DOCUMENTS</h4><div className="vd19-document-card">
      {docList.map(([type, label]) => {
        const doc = map.get(type), isPublic = doc?.visibility === "public", active = edit && canModify;
        return (
          <article key={type} className="vd19-document-row"><div className="vd19-doc-left"><span className="vd19-file-icon">📄</span>
            <div><b>{label}</b><div className="vd19-doc-links">
              {doc?.has_file ? <button data-vd19-doc-open={doc.id} onClick={() => openFile(`${base(id)}/documents/${doc.id}/file`, doc.file_name).catch(toastError)}>Open document ↗</button> : <span className="vd19-no-file">No file uploaded</span>}
              {active && <div className="vd19-doc-editlinks"><button data-vd19-doc-upload={type} onClick={() => setUpload({ type, label, existing: doc })}>⬆ {doc ? "Replace" : "Upload"}</button>
                {doc && <><button data-vd19-doc-archive={doc.id} onClick={async () => { if (await confirmDialog("Archive this document? It will no longer appear under active documents.", { ok: "Archive" })) await run(() => api.admin(`${base(id)}/documents/${doc.id}/archive`, "POST", {}), "Document archived"); }}>Archive</button>
                  <button className="danger" data-vd19-doc-delete={doc.id} onClick={async () => { if (await confirmDialog("Permanently delete this document? This cannot be undone.", { ok: "Delete", danger: true })) await run(() => api.admin(`${base(id)}/documents/${doc.id}`, "DELETE"), "Document deleted"); }}>Delete</button></>}</div>}
            </div></div></div>
            <div className="vd19-doc-right">
              <div className="vd19-visibility">{(["public", "private"] as const).map((v) => (
                <button key={v} type="button" data-vd19-visibility={doc?.id || ""} data-value={v} disabled={!active || !doc} className={v === "public" ? (isPublic ? "active" : "") : (!isPublic ? "active private" : "")}
                  onClick={() => doc && void run(() => api.admin(`${base(id)}/documents/${doc.id}`, "PUT", { visibility: v }), "Document visibility updated")}>{v === "public" ? "🌐 Public" : "🔒 Private"}</button>))}</div>
              <div className="vd19-expiry"><small>Expiry Date</small>{active && doc ? <input data-vd19-expiry={doc.id} type="date" aria-label={`Expiry date for ${label}`} defaultValue={doc.expiry_date || ""}
                onChange={(e) => void run(() => api.admin(`${base(id)}/documents/${doc.id}`, "PUT", e.target.value ? { expiryDate: e.target.value } : { clearExpiry: true }), "Expiry date saved")} /> : <span>{dmy(doc?.expiry_date)}</span>}</div>
            </div></article>
        );
      })}</div>
      <p className="vd19-doc-legend">🌐 Public — drivers and crew on this bus's trips can view it &nbsp; 🔒 Private — only people with Vehicles access</p></section>
  );

  const m = data.service || {}, status = m.status || "Inactive";
  const maintenance = (
    <section className="vd19-single"><h4>SERVICE SCHEDULE</h4><div className="vd19-card vd19-service-card">
      <div className="vd19-field-row"><span>Last Service Date</span><b>{dmy(m.last_service_date)}</b></div>
      <div className="vd19-field-row"><span>Next Service Date</span><b>{dmy(m.next_service_date)}</b></div>
      <div className="vd19-field-row"><span>Status</span><b className={`vd19-service-status ${status === "Service due" ? "due" : ""}`}>● {status}</b></div>
      {m.next_service_km != null && <div className="vd19-field-row"><span>Service due at</span><b>{num(m.next_service_km)} km</b></div>}</div>
      <div className="vd19-maint-head"><div><h4>MAINTENANCE RECORDS &amp; REMINDERS</h4><p>Service bills, job cards and the next service due by date or km. These save straight away.</p>
        <span className="vd19-odo">⏲ {num(m.odometer_reading)} km</span></div>
        {edit && <button type="button" data-vd19-maint-add onClick={() => setMaint({})}>+ Add Maintenance</button>}</div>
      {data.maintenance.length ? <div className="vd19-maint-list">{data.maintenance.map((r) => (
        <article key={r.id} className="vd19-maint-record"><div className="vd19-maint-summary"><span className="vd19-tool-icon">🔧</span><div>
          <b>{r.label}</b><p>{r.type || "Service"} · {dmy(r.service_date)} {r.odometer_km != null ? `· ${num(r.odometer_km)} km` : ""}</p>
          <small>{r.next_due_date ? `Due ${dmy(r.next_due_date)}` : ""} {r.next_due_km != null ? `· ${num(r.next_due_km)} km` : ""} {r.cost ? `· ₹${num(r.cost)}` : ""}</small>
          {r.notes ? <p>{r.notes}</p> : null}</div></div>
          <div className="vd19-maint-actions">
            {r.has_file && <button data-vd19-maint-file={r.id} onClick={() => openFile(`${base(id)}/maintenance/${r.id}/file`, r.file_name).catch(toastError)}>↗ {r.file_name || "Job card"}</button>}
            {edit && <><button data-vd19-maint-edit={r.id} onClick={() => setMaint({ record: r })}>✎ Edit</button>
              <button data-vd19-maint-archive={r.id} onClick={async () => { if (await confirmDialog("Archive this maintenance record?", { ok: "Archive" })) await run(() => api.admin(`${base(id)}/maintenance/${r.id}/archive`, "POST", {}), "Maintenance record archived"); }}>Archive</button></>}
          </div></article>))}</div>
        : <div className="vd19-empty">🔧<span>No maintenance records yet.</span></div>}
    </section>
  );

  const list = data.archive, docCount = list.filter((x) => x.kind === "document").length;
  const filtered = list.filter((x) => archiveFilter === "all" || (archiveFilter === "documents" ? x.kind === "document" : x.kind === "maintenance"));
  const archive = (
    <section className="vd19-archive-section"><header><span className="vd19-archive-symbol">🗄</span><div><b>Archive</b><p>Old and replaced documents and archived maintenance records, newest first. Drivers and crew never see these.</p></div></header>
      <div className="vd19-archive-filters">{([["all", "All", list.length], ["documents", "Documents", docCount], ["maintenance", "Maintenance", list.length - docCount]] as const).map(([k, t, n]) =>
        <button key={k} data-vd19-archive-filter={k} className={archiveFilter === k ? "active" : ""} onClick={() => setArchiveFilter(k)}>{t} {n}</button>)}</div>
      {filtered.length ? <div className="vd19-archive-list">{filtered.map((x) => (
        <article key={`${x.kind}${x.id}`} className="vd19-archive-entry"><span>{x.kind === "document" ? "📄" : "🔧"}</span><div><strong>{x.document_name || x.label || x.document_type}</strong>
          <small>{x.kind === "document" ? "Document" : "Maintenance"} · Archived {x.archived_at ? new Date(x.archived_at).toLocaleDateString("en-IN") : "—"} {x.archive_reason ? `· ${x.archive_reason}` : ""}</small></div>
          {x.kind === "document" && x.has_file && canModify && <button data-vd19-doc-open={x.id} onClick={() => openFile(`${base(id)}/documents/${x.id}/file`, x.file_name).catch(toastError)}>Open ↗</button>}</article>))}</div>
        : <div className="vd19-empty vd19-archive-empty">🗄<span>Nothing archived yet. Archived documents and files you replace appear here.</span></div>}
    </section>
  );

  const tabs = [["details", "Details", "📋"], ["documents", "Documents", "📄"], ["maintenance", "Maintenance", "🔧"], ["archive", "Archive", "🗄"]] as const;
  return (
    <div className="vd19-root">
      <div className="vd19-workspace">
        <div className="vd19-heading"><button data-vd19-back title="Back to vehicles" onClick={async () => { if (await confirmDiscard()) onDone(); }}>←</button>
          <div><h2>{edit ? "Edit Vehicle" : "View Vehicle Details"}</h2><small>{draft.registration_number || data.vehicle.registration_number}</small></div>
          <div className="vd19-head-actions">{!edit && canModify ? <button data-vd19-mode="edit" className="vd19-head-edit" onClick={() => setMode("edit")}>✎ Edit</button>
            : edit ? <button data-vd19-mode="view" className="vd19-head-view" onClick={async () => { if (await confirmDiscard()) { setDraft(JSON.parse(JSON.stringify(orig))); setMode("view"); } }}>👁 View</button> : null}</div></div>
        <div className="vd19-content">
          <nav className="vd19-tabs" role="tablist" aria-label="Vehicle details tabs">{tabs.map(([k, l, i]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} data-vd19-tab={k} className={tab === k ? "active" : ""}
              onClick={async () => { if (tab === "details" && !(await confirmDiscard())) return; if (dirty) setDraft(JSON.parse(JSON.stringify(orig))); setTab(k); }}>{i} {l}</button>))}</nav>
          <div className="vd19-section" role="tabpanel">{tab === "details" ? details : tab === "documents" ? documents : tab === "maintenance" ? maintenance : archive}</div>
        </div>
      </div>
      {upload && <UploadModal id={id} {...upload} onClose={() => setUpload(undefined)} onDone={() => void reload()} />}
      {maint && <MaintModal id={id} record={maint.record} onClose={() => setMaint(undefined)} onDone={() => void reload()} />}
    </div>
  );
}
