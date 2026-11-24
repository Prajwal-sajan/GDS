import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as signalR from "@microsoft/signalr";
import { api, ApiError, getKey, type Assignment, type Fare, type InvoiceLine, type InvoiceRow, type RouteRow, type SeatRow, type Staff, type TripRow, type Vehicle } from "./api";

export const err = (e: unknown) => (e instanceof ApiError ? `Error ${e.status}: ${e.message}` : e instanceof Error ? e.message : String(e));
export const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const mine = ++seq.current; // ignore responses that arrive after a newer request (e.g. date changed quickly)
    setError(undefined);
    try { const d = await fn(); if (mine === seq.current) setData(d); } catch (e) { if (mine === seq.current) setError(err(e)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { void reload(); }, [reload]);
  return { data, error, reload };
}

/** Realtime hint channel. Events only trigger refetches; the API stays authoritative. */
export function useOpsHub(onTripChanged: (tripId: number) => void) {
  const [state, setState] = useState("offline");
  useEffect(() => {
    const conn = new signalR.HubConnectionBuilder()
      .withUrl("/hubs/ops", { accessTokenFactory: () => getKey() })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.None)
      .build();
    conn.on("tripChanged", (e: { tripId: number }) => onTripChanged(e.tripId));
    conn.onreconnecting(() => setState("reconnecting"));
    conn.onreconnected(() => setState("live"));
    conn.onclose(() => setState("offline"));
    conn.start().then(() => setState("live")).catch(() => setState("offline"));
    return () => { void conn.stop(); };
  }, [onTripChanged]);
  return state;
}

// ---------------------------------------------------------------- Fleet
export function FleetPanel() {
  const { data, error, reload } = useAsync(api.vehicles, []);
  const [form, setForm] = useState({ registrationNumber: "", coachTemplateId: "", status: "active", modelName: "", insuranceExpiry: "", permitExpiry: "", fitnessExpiry: "", pucExpiry: "" });
  const [editing, setEditing] = useState<number>();
  const [msg, setMsg] = useState<string>();
  const soon = (d: string | null) => d && new Date(d).getTime() - Date.now() < 30 * 864e5;
  const edit = (v: Vehicle) => {
    setEditing(v.id);
    setForm({ registrationNumber: v.registrationNumber, coachTemplateId: v.coachTemplateId ? String(v.coachTemplateId) : "", status: v.status, modelName: v.modelName ?? "",
      insuranceExpiry: v.insuranceExpiry ?? "", permitExpiry: v.permitExpiry ?? "", fitnessExpiry: v.fitnessExpiry ?? "", pucExpiry: v.pucExpiry ?? "" });
  };
  const save = async () => {
    try {
      const n = (s: string) => (s ? s : null);
      await api.saveVehicle({ registrationNumber: form.registrationNumber, coachTemplateId: form.coachTemplateId ? Number(form.coachTemplateId) : null, status: form.status,
        modelName: n(form.modelName), insuranceExpiry: n(form.insuranceExpiry), permitExpiry: n(form.permitExpiry), fitnessExpiry: n(form.fitnessExpiry), pucExpiry: n(form.pucExpiry) }, editing);
      setMsg(editing ? "Vehicle updated." : "Vehicle added."); setEditing(undefined); await reload();
    } catch (e) { setMsg(err(e)); }
  };
  return (
    <section>
      <h2>Fleet</h2>
      {error && <p className="error" role="alert">{error}</p>}
      <table>
        <thead><tr><th>Registration</th><th>Model</th><th>Coach</th><th>Status</th><th>Insurance</th><th>Permit</th><th>Fitness</th><th>PUC</th><th /></tr></thead>
        <tbody>{data?.map((v) => (
          <tr key={v.id}>
            <td>{v.registrationNumber}</td><td>{v.modelName ?? "—"}</td><td>{v.coachTemplateId ?? "—"}</td><td>{v.status}</td>
            {[v.insuranceExpiry, v.permitExpiry, v.fitnessExpiry, v.pucExpiry].map((d, i) => <td key={i} className={soon(d) ? "danger" : ""}>{d ?? "—"}</td>)}
            <td><button className="link" onClick={() => edit(v)}>Edit</button></td>
          </tr>))}
          {data?.length === 0 && <tr><td colSpan={9} className="muted">No vehicles</td></tr>}</tbody>
      </table>
      <h3>{editing ? `Edit vehicle` : "Add vehicle"}</h3>
      <form className="grid" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <label>Registration<input required value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} aria-label="Registration" /></label>
        <label>Coach template id<input value={form.coachTemplateId} onChange={(e) => setForm({ ...form, coachTemplateId: e.target.value })} /></label>
        <label>Model<input value={form.modelName} onChange={(e) => setForm({ ...form, modelName: e.target.value })} /></label>
        <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{["active", "maintenance", "retired"].map((s) => <option key={s}>{s}</option>)}</select></label>
        {(["insuranceExpiry", "permitExpiry", "fitnessExpiry", "pucExpiry"] as const).map((k) => (
          <label key={k}>{k.replace("Expiry", " expiry")}<input type="date" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></label>))}
        <button type="submit">Save vehicle</button>
        {editing && <button type="button" className="link" onClick={() => setEditing(undefined)}>Cancel edit</button>}
      </form>
      {msg && <p className="note" role="status">{msg}</p>}
    </section>
  );
}

// ---------------------------------------------------------------- Staff
export function StaffPanel() {
  const { data, error, reload } = useAsync(api.staff, []);
  const [form, setForm] = useState({ name: "", phone: "", role: "driver", licenseNumber: "", licenseExpiry: "" });
  const [msg, setMsg] = useState<string>();
  const add = async () => {
    try {
      await api.saveStaff({ ...form, status: "active", licenseNumber: form.licenseNumber || null, licenseExpiry: form.licenseExpiry || null });
      setMsg("Staff member added."); setForm({ name: "", phone: "", role: "driver", licenseNumber: "", licenseExpiry: "" }); await reload();
    } catch (e) { setMsg(err(e)); }
  };
  const toggle = async (s: Staff) => {
    try { await api.saveStaff({ ...s, status: s.status === "active" ? "inactive" : "active" }, s.id); await reload(); } catch (e) { setMsg(err(e)); }
  };
  return (
    <section>
      <h2>Staff</h2>
      {error && <p className="error" role="alert">{error}</p>}
      <table>
        <thead><tr><th>Name</th><th>Phone</th><th>Role</th><th>Status</th><th>Licence</th><th>Licence expiry</th><th /></tr></thead>
        <tbody>{data?.map((s) => (
          <tr key={s.id}><td>{s.name}</td><td>{s.phone}</td><td>{s.role}</td><td>{s.status}</td><td>{s.licenseNumber ?? "—"}</td><td>{s.licenseExpiry ?? "—"}</td>
            <td><button className="link" onClick={() => void toggle(s)}>{s.status === "active" ? "Deactivate" : "Activate"}</button></td></tr>))}</tbody>
      </table>
      <h3>Add staff</h3>
      <form className="grid" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <label>Name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Staff name" /></label>
        <label>Phone<input required pattern="\d{10,13}" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} aria-label="Staff phone" /></label>
        <label>Role<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{["driver", "helper", "conductor", "cleaner"].map((r) => <option key={r}>{r}</option>)}</select></label>
        <label>Licence no.<input value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} /></label>
        <label>Licence expiry<input type="date" value={form.licenseExpiry} onChange={(e) => setForm({ ...form, licenseExpiry: e.target.value })} /></label>
        <button type="submit">Add staff</button>
      </form>
      {msg && <p className="note" role="status">{msg}</p>}
    </section>
  );
}

// ---------------------------------------------------------------- Dispatch (assignments, seat blocks, counter booking)
export function DispatchPanel() {
  const [date, setDate] = useState(today());
  const trips = useAsync<TripRow[]>(() => api.trips(date), [date]);
  const [tripId, setTripId] = useState<number>();
  const trip = trips.data?.find((t) => t.id === tripId);
  const vehicles = useAsync(api.vehicles, []);
  const staff = useAsync(api.staff, []);
  const routes = useAsync(api.routes, []);
  const assignments = useAsync<Assignment[]>(() => (tripId ? api.assignments(tripId) : Promise.resolve([])), [tripId]);
  const seats = useAsync<SeatRow[]>(() => (tripId ? api.seats(tripId) : Promise.resolve([])), [tripId]);
  const [msg, setMsg] = useState<string>();
  const [selected, setSelected] = useState<string[]>([]);

  const onTripChanged = useCallback((id: number) => { if (id === tripId) { void seats.reload(); void assignments.reload(); } void trips.reload(); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tripId]);
  const live = useOpsHub(onTripChanged);

  useEffect(() => { setSelected([]); }, [tripId]);
  const run = async (f: () => Promise<string>) => {
    setMsg(undefined);
    try { setMsg(await f()); await Promise.all([seats.reload(), assignments.reload(), trips.reload()]); } catch (e) { setMsg(err(e)); }
  };
  const name = (a: Assignment) => a.kind === "vehicle"
    ? vehicles.data?.find((v) => v.id === a.vehicleId)?.registrationNumber ?? `#${a.vehicleId}`
    : staff.data?.find((s) => s.id === a.staffId)?.name ?? `#${a.staffId}`;

  const [assign, setAssign] = useState({ role: "Driver", id: "", reason: "" });
  const route = routes.data?.find((r) => r.id === trip?.routeId);
  const [pax, setPax] = useState({ name: "", age: "30", gender: "M", mobile: "", method: "cash", reference: "", bp: "", dp: "" });

  return (
    <section>
      <div className="row">
        <label>Date<input type="date" value={date} onChange={(e) => { setDate(e.target.value); setTripId(undefined); }} aria-label="Dispatch date" /></label>
        <label>Service
          <select value={tripId ?? ""} onChange={(e) => setTripId(e.target.value ? Number(e.target.value) : undefined)} aria-label="Service">
            <option value="">Select…</option>
            {trips.data?.map((t) => <option key={t.id} value={t.id}>{t.service} · {t.name} · {t.departure}</option>)}
          </select>
        </label>
        <span className={`badge b-${live === "live" ? "acknowledged" : "pending"}`} data-testid="live">{live}</span>
      </div>
      {msg && <p className="note" role="status">{msg}</p>}
      {trips.error && <p className="error" role="alert">{trips.error}</p>}
      {trip && (
        <>
          <h2>Crew & vehicle</h2>
          <table><thead><tr><th>Role</th><th>Assigned</th><th>Since</th><th>Status</th></tr></thead>
            <tbody>{assignments.data?.map((a) => (
              <tr key={a.id} className={a.isActive ? "" : "muted"}><td>{a.role}</td><td>{name(a)}</td><td>{new Date(a.assignedAt).toLocaleString()}</td>
                <td>{a.isActive ? "active" : `replaced${a.replacedReason ? ` (${a.replacedReason})` : ""}`}</td></tr>))}
              {assignments.data?.length === 0 && <tr><td colSpan={4} className="muted">Nothing assigned</td></tr>}</tbody></table>
          <form className="row" onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const id = Number(assign.id);
              await api.assign(trip.id, assign.role === "vehicle" ? { role: "vehicle", vehicleId: id, reason: assign.reason } : { role: assign.role, staffId: id, reason: assign.reason });
              return assign.role === "vehicle" ? "Bus changed." : `${assign.role} assigned.`;
            });
          }}>
            <label>Role<select value={assign.role} onChange={(e) => setAssign({ ...assign, role: e.target.value, id: "" })} aria-label="Assignment role">
              {["vehicle", "Driver", "Driver 2", "Helper", "Conductor"].map((r) => <option key={r}>{r}</option>)}</select></label>
            <label>{assign.role === "vehicle" ? "Vehicle" : "Staff"}
              <select required value={assign.id} onChange={(e) => setAssign({ ...assign, id: e.target.value })} aria-label="Assignee">
                <option value="">Select…</option>
                {assign.role === "vehicle"
                  ? vehicles.data?.filter((v) => v.status === "active").map((v) => <option key={v.id} value={v.id}>{v.registrationNumber}</option>)
                  : staff.data?.filter((s) => s.status === "active").map((s) => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
              </select></label>
            <label>Reason<input value={assign.reason} onChange={(e) => setAssign({ ...assign, reason: e.target.value })} /></label>
            <button type="submit">Assign</button>
          </form>

          <h2>Seats</h2>
          <p className="muted">Select free seats to block or book; select blocked seats to release.</p>
          <div className="seatmap" data-testid="seatmap">
            {seats.data?.map((s) => (
              <button key={s.seatCode} type="button" title={`${s.seatCode} ${s.deck} ${s.seatType} ${s.state}`}
                className={`seat s-${s.state} ${selected.includes(s.seatCode) ? "sel" : ""}`}
                disabled={s.state === "booked" || s.state === "held"}
                onClick={() => setSelected((x) => (x.includes(s.seatCode) ? x.filter((c) => c !== s.seatCode) : [...x, s.seatCode]))}>
                {s.seatCode}
              </button>))}
          </div>
          <div className="row">
            <button disabled={!selected.length} onClick={() => void run(async () => { await api.block(trip.id, selected, "operator quota"); const n = selected.length; setSelected([]); return `Blocked ${n} seat(s).`; })}>Block selected</button>
            <button disabled={!selected.length} onClick={() => void run(async () => { for (const s of selected) await api.unblock(trip.id, s); const n = selected.length; setSelected([]); return `Released ${n} seat(s).`; })}>Release selected</button>
          </div>

          <h2>Counter booking</h2>
          <form className="grid" onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              if (!selected.length) throw new Error("Select at least one free seat");
              const r = await api.counterBook({
                tripId: trip.id, boardingPointId: Number(pax.bp), droppingPointId: Number(pax.dp), paymentMethod: pax.method, paymentReference: pax.reference || null,
                channel: pax.method === "agent_credit" ? "agent" : "counter",
                passengers: selected.map((s, i) => ({ seat: s, name: pax.name, age: Number(pax.age), gender: pax.gender, mobile: pax.mobile, email: null, primary: i === 0 })),
              });
              setSelected([]);
              return `Booked ${r.pnr} · ₹${r.totalFare} · payment ${r.payments.map((p) => `${p.method} ${p.status}`).join(", ")}`;
            });
          }}>
            <label>Boarding<select required value={pax.bp} onChange={(e) => setPax({ ...pax, bp: e.target.value })} aria-label="Boarding point">
              <option value="">Select…</option>{route?.stages.filter((s) => s.kind === "pickup").map((s) => <option key={s.id} value={s.id}>{s.name} {s.time}</option>)}</select></label>
            <label>Dropping<select required value={pax.dp} onChange={(e) => setPax({ ...pax, dp: e.target.value })} aria-label="Dropping point">
              <option value="">Select…</option>{route?.stages.filter((s) => s.kind === "drop").map((s) => <option key={s.id} value={s.id}>{s.name} {s.time}</option>)}</select></label>
            <label>Passenger name<input required value={pax.name} onChange={(e) => setPax({ ...pax, name: e.target.value })} aria-label="Passenger name" /></label>
            <label>Age<input type="number" min={1} max={120} value={pax.age} onChange={(e) => setPax({ ...pax, age: e.target.value })} /></label>
            <label>Gender<select value={pax.gender} onChange={(e) => setPax({ ...pax, gender: e.target.value })}><option>M</option><option>F</option></select></label>
            <label>Mobile<input required pattern="\d{10}" value={pax.mobile} onChange={(e) => setPax({ ...pax, mobile: e.target.value })} aria-label="Mobile" /></label>
            <label>Payment<select value={pax.method} onChange={(e) => setPax({ ...pax, method: e.target.value })} aria-label="Payment method">
              {["cash", "upi", "card", "agent_credit"].map((m) => <option key={m}>{m}</option>)}</select></label>
            <label>Reference<input value={pax.reference} onChange={(e) => setPax({ ...pax, reference: e.target.value })} /></label>
            <button type="submit">Book {selected.length || ""} seat(s)</button>
          </form>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Fares
export function FaresPanel() {
  const { data, error, reload } = useAsync<RouteRow[]>(api.routes, []);
  const [routeId, setRouteId] = useState<number>();
  const [rows, setRows] = useState<Fare[]>([]);
  const [msg, setMsg] = useState<string>();
  const route = data?.find((r) => r.id === routeId);
  useEffect(() => { setRows(route?.fares.map((f) => ({ ...f })) ?? []); }, [route]);
  const set = (i: number, k: keyof Fare, v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: Number(v) } : x)));
  return (
    <section>
      <div className="row"><label>Route<select value={routeId ?? ""} onChange={(e) => setRouteId(Number(e.target.value) || undefined)} aria-label="Route">
        <option value="">Select…</option>{data?.map((r) => <option key={r.id} value={r.id}>{r.serviceNumber} · {r.name}</option>)}</select></label></div>
      {error && <p className="error" role="alert">{error}</p>}
      {route && (
        <form onSubmit={(e) => {
          e.preventDefault();
          if (!confirm("Publish new fares? Open holds keep their quoted fare; RedBus will be notified for future services.")) return;
          void api.saveFares(route.id, rows).then((r) => { setMsg(`Fares saved; ${r.updated} upcoming services refreshed.`); void reload(); }).catch((x) => setMsg(err(x)));
        }}>
          <table><thead><tr><th>From seq</th><th>To seq</th><th>Seater</th><th>Sleeper lower</th><th>Sleeper upper</th></tr></thead>
            <tbody>{rows.map((f, i) => (
              <tr key={`${f.fromSequence}-${f.toSequence}`}><td>{f.fromSequence}</td><td>{f.toSequence}</td>
                {(["seater", "sleeperLower", "sleeperUpper"] as const).map((k) => (
                  <td key={k}><input type="number" min={0} step="0.01" value={f[k]} onChange={(e) => set(i, k, e.target.value)} aria-label={`${k} ${f.fromSequence}-${f.toSequence}`} /></td>))}
              </tr>))}</tbody></table>
          <button type="submit">Save fares</button>
        </form>
      )}
      {msg && <p className="note" role="status">{msg}</p>}
    </section>
  );
}

// ---------------------------------------------------------------- Reconciliation
const STATUS_LABEL: Record<string, string> = { matched: "Matched", mismatched: "Mismatched", needs_review: "Needs review", unmatched_ota: "Missing in GDS", unmatched_gds: "Missing in OTA" };

async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function ReconciliationPanel() {
  const list = useAsync<InvoiceRow[]>(api.invoices, []);
  const [open, setOpen] = useState<InvoiceRow>();
  const [filter, setFilter] = useState("");
  const lines = useAsync<InvoiceLine[]>(() => (open ? api.invoiceLines(open.id, filter || undefined) : Promise.resolve([])), [open, filter]);
  const detail = useAsync(() => (open ? api.invoice(open.id) : Promise.resolve(undefined)), [open]);
  const [msg, setMsg] = useState<string>();
  const [up, setUp] = useState({ invoiceNumber: "", periodStart: today(), periodEnd: today(), operatorCode: "" });
  const [file, setFile] = useState<File>();
  const totals = detail.data?.totals as Record<string, number> | undefined;

  const upload = async () => {
    if (!file) return;
    if (file.size > 20_000_000) { setMsg("File is larger than 20 MB"); return; }
    try {
      const isPdf = file.name.toLowerCase().endsWith(".pdf");
      const content = isPdf ? { pdfBase64: await toBase64(file) } : { csv: await file.text() };
      const r = await api.uploadInvoice({ ...up, invoiceNumber: up.invoiceNumber || null, operatorCode: up.operatorCode || null, fileName: file.name, ...content });
      setMsg(r.duplicate ? "This file was already uploaded; showing the existing invoice." : "Invoice uploaded and compared.");
      await list.reload();
      const inv = (await api.invoices()).find((x) => x.id === r.id);
      setOpen(inv);
    } catch (e) { setMsg(err(e)); }
  };
  const resolve = async (l: InvoiceLine, action: string) => {
    const note = action === "dispute" ? prompt("Dispute reason (required)") ?? "" : action === "clear" ? "" : prompt("Note (optional)") ?? "";
    if (action === "dispute" && !note.trim()) return;
    try { await api.resolve(open!.id, l.id, action, note); await Promise.all([lines.reload(), detail.reload(), list.reload()]); } catch (e) { setMsg(err(e)); }
  };
  const money = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(2));
  const warnings = useMemo(() => (detail.data?.warningsJson ? (JSON.parse(detail.data.warningsJson) as string[]) : []), [detail.data]);

  return (
    <section>
      <div className="banner">Compares RedBus statement rows against GDS-recorded bookings. Rows without captured GDS settlement evidence are flagged for review — never auto-matched.
        Upload the RedBus payment-advice PDF (invoice number, operator code and amounts are read from it) or a normalised CSV (section, pnr, doj, fare, tax, commission, commission_tax, operator_offer, cancellation_charge, take_home).</div>
      <h2>Upload statement</h2>
      <form className="grid" onSubmit={(e) => { e.preventDefault(); void upload(); }}>
        <label>Invoice number (CSV only)<input required={!file?.name.toLowerCase().endsWith(".pdf")} value={up.invoiceNumber} onChange={(e) => setUp({ ...up, invoiceNumber: e.target.value })} aria-label="Invoice number" /></label>
        <label>Operator code<input value={up.operatorCode} onChange={(e) => setUp({ ...up, operatorCode: e.target.value })} /></label>
        <label>Period start<input type="date" required value={up.periodStart} onChange={(e) => setUp({ ...up, periodStart: e.target.value })} aria-label="Period start" /></label>
        <label>Period end<input type="date" required value={up.periodEnd} onChange={(e) => setUp({ ...up, periodEnd: e.target.value })} aria-label="Period end" /></label>
        <label>PDF or CSV file<input type="file" accept=".pdf,application/pdf,.csv,text/csv" required onChange={(e) => setFile(e.target.files?.[0])} aria-label="Statement file" /></label>
        <button type="submit">Upload & compare</button>
      </form>
      {msg && <p className="note" role="status">{msg}</p>}

      <h2>Invoices</h2>
      {list.error && <p className="error" role="alert">{list.error}</p>}
      <table><thead><tr><th>Invoice</th><th>File</th><th>Period</th><th>Status</th><th>Rows</th><th>Outstanding</th><th>Uploaded</th><th /></tr></thead>
        <tbody>{list.data?.map((i) => (
          <tr key={i.id} className={open?.id === i.id ? "selected" : ""}><td>{i.invoiceNumber}</td><td>{i.fileName}</td><td>{i.periodStart} → {i.periodEnd}</td><td>{i.status}</td>
            <td>{i.lines}</td><td>{i.outstanding}</td><td>{new Date(i.uploadedAt).toLocaleString()} · {i.uploadedBy}</td>
            <td><button className="link" onClick={() => setOpen(i)}>Open</button></td></tr>))}
          {list.data?.length === 0 && <tr><td colSpan={8} className="muted">No invoices uploaded</td></tr>}</tbody></table>

      {open && (
        <>
          <h2>Invoice {open.invoiceNumber}</h2>
          {warnings.length > 0 && <div className="banner warn">{warnings.length} parsing warning(s): {warnings.slice(0, 5).join("; ")}</div>}
          {totals && (
            <div className="cards" data-testid="recon-totals">
              {(["matched", "mismatched", "needsReview", "missingInGds", "missingInOta", "outstanding"] as const).map((k) => <div className="card" key={k}><div className="muted">{k}</div><div className="value">{String(totals[k])}</div></div>)}
              <div className="card"><div className="muted">At risk (₹)</div><div className="value">{money(totals.atRisk)}</div></div>
            </div>)}
          <div className="row">
            <label>Status<select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Line status">
              <option value="">All</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <button onClick={() => void api.recheck(open.id).then(() => Promise.all([lines.reload(), detail.reload()])).catch((e) => setMsg(err(e)))}>Recheck against GDS</button>
            <button onClick={() => void api.exportInvoice(open.id, open.invoiceNumber).catch((e) => setMsg(err(e)))}>Export CSV</button>
          </div>
          <table><thead><tr><th>PNR</th><th>Section</th><th>Status</th><th>DOJ (GDS / OTA)</th><th>Fare (GDS / OTA)</th><th>Take-home (GDS / OTA)</th><th>Δ</th><th>Why</th><th>Resolution</th><th /></tr></thead>
            <tbody>{lines.data?.map((l) => (
              <tr key={l.id}>
                <td>{l.pnr}</td><td>{l.section}</td><td><span className={`badge r-${l.status}`}>{STATUS_LABEL[l.status] ?? l.status}</span></td>
                <td>{l.expectedDoj ?? "—"} / {l.doj ?? "—"}</td><td>{money(l.expectedFare)} / {money(l.fare)}</td><td>{money(l.expectedTakeHome)} / {money(l.takeHome)}</td>
                <td>{money(l.delta)}</td><td className="wrap">{l.why}</td>
                <td className="wrap">{l.resolutionAction ? `${l.resolutionAction}${l.resolutionNote ? `: ${l.resolutionNote}` : ""}` : "—"}</td>
                <td>{l.status !== "matched" && (l.resolutionAction
                  ? <button className="link" onClick={() => void resolve(l, "clear")}>Reopen</button>
                  : <>
                    <button className="link" onClick={() => void resolve(l, "accept_ota")}>Accept</button>
                    <button className="link" onClick={() => void resolve(l, "investigating")}>Investigate</button>
                    <button className="link danger" onClick={() => void resolve(l, "dispute")}>Dispute</button>
                  </>)}</td>
              </tr>))}
              {lines.data?.length === 0 && <tr><td colSpan={10} className="muted">No rows</td></tr>}</tbody></table>
        </>
      )}
    </section>
  );
}
