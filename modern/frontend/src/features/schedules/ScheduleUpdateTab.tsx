import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, type ScheduleRow } from "../../api";
import { confirmDialog, toast, toastError } from "../../components/ui/feedback";

// Schedule overlay → Update tab (legacy schedule-update-v51 behaviour and u51-* markup), as a typed React component.
// GET /schedules/{id}/update-v51 · PUT .../update-v51/assignment · PUT .../update-v51/sync. Never fabricates crew, route
// sync, OTA connectivity or call-provider state: everything shown comes from the API response.

interface CrewMember { staff_id: number | string; role: string; name?: string; phone?: string; phone_override?: string }
type CallKey = "cloud_calling" | "number_masking" | "direct_to_vehicle" | "driver_gps";
type CabMode = "Off" | "Pickups" | "Drops" | "Both";
interface UpdateData {
  schedule_id: number; can_modify: boolean; sync_with_route?: boolean; vehicle_id?: number | null; vehicle_options: { id: number; label: string }[];
  staff_options?: { id: number; name: string; phone?: string }[]; crew: CrewMember[]; call_settings: Record<CallKey, boolean>; escalation_contacts: string[];
  cab_mode: CabMode; assignment_source: string; call_source: string; cab_source: string; ota_sync_message?: string; vehicle_number?: string | null; vehicle_position?: string | null;
}
interface Draft { vehicle_id: string; crew: { staff_id: string; role: string; phone_override: string }[]; call_settings: Record<CallKey, boolean>; escalation: string; cab_mode: CabMode }

const ICONS: Record<string, string> = {
  bus: "M4 17V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11M4 13h16M4 17h16M7 17v3m10-3v3M7 9h2m6 0h2", user: "M20 21a8 8 0 0 0-16 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  users: "M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m13-15a4 4 0 0 1 0 8m7 7v-2a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  calendar: "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z", clock: "M12 6v6l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  edit: "M12 20h9M16 3a2 2 0 0 1 3 3L7 18l-4 1 1-4L16 3Z", save: "M5 3h12l4 4v14H3V3h2Zm2 0v6h10V3M7 21v-9h10v9", x: "M18 6 6 18M6 6l12 12",
  pin: "M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Zm-8 2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  phone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.5 3a2 2 0 0 1-.6 1.7L7.3 10a16 16 0 0 0 6.7 6.7l1.6-1.7a2 2 0 0 1 1.7-.6l3 .5a2 2 0 0 1 1.7 2Z",
  cloud: "M19 18H6a4 4 0 0 1-1-7.87A7 7 0 0 1 19.7 9 4.5 4.5 0 0 1 19 18Z", shield: "M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z", gps: "m12 22 9-20-20 9 8 3 3 8Z",
  alert: "m12 2 10 18H2L12 2Zm0 7v4m0 3h.01", route: "M3 12h18M7 5l-4 7 4 7m10-14 4 7-4 7", refresh: "M20 11a8 8 0 1 0-2 6M20 4v7h-7", tag: "M3 5h8l10 10-6 6L3 9zM7 8h.01",
  plus: "M12 5v14M5 12h14", trash: "M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v6m4-6v6", check: "M20 6 9 17l-5-5", layout: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
};
const I = ({ k, n = 21 }: { k: string; n?: number }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width={n} height={n} fill="none" stroke="currentColor" strokeWidth={1.85} strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[k]} /></svg>
);
const Square = ({ k, kind = "primary" }: { k: string; kind?: string }) => <span className={`u51-icon u51-${kind}`}><I k={k} n={24} /></span>;
const ROLES = ["Driver", "Helper", "Attendant", "Conductor", "Pickup Van"];
const roleLabel = (r: string) => (r === "Helper" ? "Helper / Attendant" : r);
const CALLS: [CallKey, string, string][] = [["cloud_calling", "Cloud Calling", "cloud"], ["number_masking", "Passenger Number Masking", "shield"], ["direct_to_vehicle", "Direct to Vehicle", "bus"], ["driver_gps", "Driver Mobile GPS", "gps"]];
const CABS: CabMode[] = ["Off", "Pickups", "Drops", "Both"];

const fmtDate = (x: string) => { const d = new Date(x + "T12:00:00Z"); return /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(+d) ? new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "short" }).format(d) : x || "—"; };
const fmtTime = (x: string | null | undefined) => { if (!/^\d{1,2}:\d\d/.test(String(x || ""))) return "—"; const [h, m] = String(x).split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; };
const Source = ({ v }: { v: string }) => <span className={`u51-source${v === "Route" ? "" : " u51-scheduled"}`}><span aria-hidden="true">●</span> Data Source: {v}</span>;
const Phone = ({ v }: { v?: string | null }) => (v ? <a className="u51-phone" href={`tel:${v.replace(/[^0-9+]/g, "")}`}><I k="phone" n={16} />{v}</a> : null);
const splitPhones = (s: string) => s.split(",").map((v) => v.replace(/[\s()-]/g, "")).filter(Boolean);

export function UpdateTab({ row }: { row: ScheduleRow }) {
  const [d, setD] = useState<UpdateData>();
  const [error, setError] = useState<string>();
  const [edit, setEdit] = useState<Draft | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setD(await api.admin<UpdateData>(`/schedules/${row.id}/update-v51`)); setError(undefined); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); toastError(e); }
  }, [row.id]);
  useEffect(() => { void load(); }, [load]);

  if (error) return <div className="sx-empty">{error}</div>;
  if (!d) return <div className="sx-loading">Loading schedule update…</div>;

  const sync = d.sync_with_route !== false;
  const pct = row.capacity ? Math.round((row.booked / row.capacity) * 100) : 0;
  const patchCrew = (i: number, x: Partial<Draft["crew"][number]>) => setEdit((e) => (e ? { ...e, crew: e.crew.map((c, j) => (j === i ? { ...c, ...x } : c)) } : e));

  const startEdit = () => {
    if (!d.can_modify) return toast("Schedule modification permission required", "bad");
    setEdit({ vehicle_id: d.vehicle_id ? String(d.vehicle_id) : "", crew: d.crew.map((c) => ({ staff_id: String(c.staff_id ?? ""), role: c.role, phone_override: c.phone_override || "" })),
      call_settings: { ...d.call_settings }, escalation: d.escalation_contacts.join(","), cab_mode: d.cab_mode });
  };
  const save = async () => {
    if (!edit || busy) return;
    if (!edit.vehicle_id && d.vehicle_id && !d.vehicle_options.length) return toast("Vehicle selection is not available with your permissions", "bad");
    if (edit.crew.some((c) => !c.staff_id)) return toast("Choose an active staff member for every row, or remove the unused row", "warn");
    const escalation = splitPhones(edit.escalation);
    if (escalation.some((x) => !/^\+?[0-9]{10,15}$/.test(x))) return toast("Escalation contacts must be 10–15 digit phone numbers", "bad");
    if (!(await confirmDialog("Apply these vehicle, staff, call-routing and cab settings to this trip? Route synchronization will be disabled.", { ok: "Update Assignment" }))) return;
    setBusy(true);
    try {
      await api.admin(`/schedules/${row.id}/update-v51/assignment`, "PUT", {
        vehicle_id: edit.vehicle_id ? Number(edit.vehicle_id) : null,
        crew: edit.crew.map((c) => ({ role: c.role, staff_id: Number(c.staff_id), phone_override: c.phone_override || "" })),
        call_settings: edit.call_settings, escalation_contacts: escalation, cab_mode: edit.cab_mode,
      });
      setEdit(null); await load(); toast("Trip assignment and overrides saved; route template unchanged", "ok");
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  const toggleSync = async (want: boolean) => {
    if (!d.can_modify) return toast("Schedule modification permission required", "bad");
    if (!(await confirmDialog(want ? "Enable Sync with Route? Current trip-specific assignment and call/cab overrides will be replaced with route values."
      : "Disable Sync with Route? This trip will keep its current settings until explicitly changed.", { ok: want ? "Enable Sync" : "Disable Sync" }))) return;
    try { await api.admin(`/schedules/${row.id}/update-v51/sync`, "PUT", { enabled: want }); setEdit(null); await load(); toast(`Schedule route synchronization ${want ? "enabled" : "disabled"}`, "ok"); }
    catch (e) { toastError(e); }
  };

  const vehicleLabel = d.vehicle_options.find((v) => String(v.id) === String(d.vehicle_id))?.label || d.vehicle_number || "Unassigned vehicle";
  const staffSelect = (c: Draft["crew"][number], i: number): ReactNode => {
    const opts = d.staff_options ?? [];
    const member = opts.find((o) => String(o.id) === c.staff_id);
    const known = member ?? d.crew.find((o) => String(o.staff_id) === c.staff_id);
    return (
      <div key={i} className="u51-edit-row" data-u51-row={i}>
        <select aria-label={`Role ${i + 1}`} className="u51-input" value={c.role} onChange={(e) => patchCrew(i, { role: e.currentTarget.value })}>
          {(ROLES.includes(c.role) ? ROLES : [...ROLES, c.role]).map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</select>
        <select aria-label={`Staff ${i + 1}`} className="u51-input" value={c.staff_id} onChange={(e) => patchCrew(i, { staff_id: e.currentTarget.value, phone_override: "" })}>
          <option value="">Select staff</option>
          {opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          {c.staff_id && !member && <option value={c.staff_id}>{known?.name || "Assigned staff unavailable"}</option>}
        </select>
        <input className="u51-input u51-staff-phone" aria-label={`Phone ${i + 1}`} placeholder="Staff phone" value={c.phone_override || member?.phone || known?.phone || ""}
          onChange={(e) => patchCrew(i, { phone_override: e.currentTarget.value })} />
        <button type="button" className="u51-delete" aria-label={`Remove staff ${i + 1}`} title="Remove staff" onClick={() => setEdit((e) => (e ? { ...e, crew: e.crew.filter((_, j) => j !== i) } : e))}><I k="trash" /></button>
      </div>
    );
  };
  const calls = edit?.call_settings ?? d.call_settings;
  const cab = edit?.cab_mode ?? d.cab_mode;

  return (
    <div className="sx-update-shell u51-root" data-u51-root="">
      <section className="u51-trip">
        <div className="u51-trip-left"><Square k="bus" /><div><div className="u51-service"><b>{row.serviceNumber}</b> <span className="u51-status"><i></i>{row.status.toUpperCase()}</span></div>
          <h3>{row.origin} <span>→</span> {row.destination}</h3></div></div>
        <div className="u51-summary-item"><I k="calendar" /><div><small>DATE</small><strong>{fmtDate(row.travelDate)}</strong></div></div>
        <div className="u51-summary-item"><I k="clock" /><div><small>DEPARTS → ARRIVES</small><strong>{fmtTime(row.departureTime)} <span>→ {fmtTime(row.arrivalTime)}</span></strong></div></div>
        <div className="u51-summary-item u51-coach"><I k="bus" /><div><small>COACH</small><strong>{row.coach || "Not assigned"}</strong></div></div>
        <div className="u51-occ"><div><small>OCCUPANCY</small><strong>{row.booked}/{row.capacity} · {pct}%</strong></div><div className="u51-progress"><span style={{ width: `${Math.max(0, Math.min(pct, 100))}%` }}></span></div></div>
      </section>

      <section className="u51-card u51-assignment">
        <header className="u51-cardhead"><h3><Square k="bus" /> Vehicle &amp; Staff Assignment</h3>
          {edit ? <button type="button" className="u51-small-btn" onClick={() => setEdit(null)}><I k="x" n={16} /> Cancel</button>
            : <button type="button" className="u51-small-btn" disabled={!d.can_modify} onClick={startEdit}><I k="edit" n={18} /> Edit</button>}</header>
        <div className="u51-assign-grid">
          <div className="u51-vehicle-col"><div className="u51-section-label">VEHICLE <Source v={d.assignment_source} /></div>
            {edit ? <select className="u51-input u51-vehicle-select" aria-label="Assigned vehicle" disabled={!d.vehicle_options.length} value={edit.vehicle_id}
              onChange={(e) => { const v = e.currentTarget.value; setEdit((x) => (x ? { ...x, vehicle_id: v } : x)); }}>
              <option value="">Select vehicle</option>{d.vehicle_options.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select>
              : <div className="u51-plate"><Square k="bus" kind="blue" /><b>{vehicleLabel}</b></div>}
            {d.vehicle_position && <small className="u51-vehicle-loc"><I k="pin" n={14} />{d.vehicle_position}</small>}
          </div>
          <div className="u51-staff-col"><div className="u51-section-label">STAFF <Source v={d.assignment_source} /></div>
            {edit ? <>
              <div className="u51-edit-staff">{edit.crew.map(staffSelect)}</div>
              <button type="button" className="u51-add" onClick={() => (edit.crew.length < 8 ? setEdit({ ...edit, crew: [...edit.crew, { staff_id: "", role: "Driver", phone_override: "" }] }) : toast("Maximum eight crew assignments", "warn"))}><I k="plus" n={17} /> Add Staff</button>
            </> : <div className="u51-read-crew">{d.crew.length ? d.crew.map((c, i) => (
              <article key={i} className="u51-crew-card"><Square k="user" kind={/helper|attendant/i.test(c.role) ? "orange" : "blue"} />
                <div><small>{(roleLabel(c.role) || "Staff").toUpperCase()}</small><strong>{c.name || "—"}</strong></div><Phone v={c.phone} /></article>
            )) : <p className="u51-empty">No crew assigned</p>}</div>}
          </div>
        </div>

        <div className="u51-section-label">CALL ROUTING <Source v={d.call_source} /></div>
        <div className="u51-calls">{CALLS.map(([key, label, ico]) => (
          <label key={key} className="u51-call-row"><Square k={ico} kind={key === "driver_gps" ? "soft" : "primary"} /><span>{label}</span>
            {edit ? <input type="checkbox" className="u51-toggle" checked={!!calls[key]} aria-label={label} onChange={(e) => { const on = e.currentTarget.checked; setEdit((x) => (x ? { ...x, call_settings: { ...x.call_settings, [key]: on } } : x)); }} />
              : <span className={`u51-chip-state ${calls[key] ? "on" : "off"}`}>{calls[key] ? <><I k="check" n={15} /> ON</> : <><I k="x" n={15} /> OFF</>}</span>}
          </label>
        ))}</div>
        <div className="u51-escalation"><Square k="alert" kind="red" />
          {edit ? <div className="u51-escalation-edit"><label htmlFor="u51-escalation-phones">Escalation</label>
            <input id="u51-escalation-phones" className="u51-input" value={edit.escalation} placeholder="Comma-separated verified phone numbers" onChange={(e) => { const v = e.currentTarget.value; setEdit((x) => (x ? { ...x, escalation: v } : x)); }} /></div>
            : <><strong>Escalation</strong><div className="u51-escalation-phones">{d.escalation_contacts.length ? d.escalation_contacts.map((x) => <Phone key={x} v={x} />) : <span className="u51-muted">Not configured</span>}</div></>}
        </div>

        <div className="u51-section-label">AUTOS &amp; CABS <Source v={d.cab_source} /></div>
        <div className="u51-cab-row"><Square k="route" /><span>Ride to boarding point / from drop</span>
          {edit ? <div className="u51-cab-actions" role="group" aria-label="Cab coverage">{CABS.map((x) => (
            <button key={x} type="button" className={cab === x ? "selected" : ""} aria-pressed={cab === x} onClick={() => setEdit((e) => (e ? { ...e, cab_mode: x } : e))}>{x}</button>
          ))}</div> : <span className={`u51-chip-state ${cab === "Off" ? "off" : "on"}`}>{cab.toUpperCase()}</span>}
        </div>
        {edit && <div className="u51-action-footer"><button type="button" className="u51-save" disabled={busy} onClick={() => void save()}><I k="save" /> Update Assignment</button>
          <p>Updating will disable “Sync with Route” to preserve your changes.</p></div>}
      </section>

      <section className="u51-card"><header className="u51-cardhead"><h3><Square k="calendar" /> Schedule Details</h3></header>
        <div className="u51-schedule-row">
          <div className="u51-detail-pill"><Square k="tag" /><span><small>SERVICE NO*</small><strong>{row.serviceNumber}</strong></span></div>
          <div className="u51-detail-pill"><Square k="tag" kind="violet" /><span><small>NAME*</small><strong>{row.serviceName || "—"}</strong></span></div>
          <div className="u51-detail-pill u51-coachpill"><Square k="bus" /><span><small>COACH TYPE*</small><strong>{row.coach || "—"}</strong></span>
            <button type="button" onClick={() => toast("Coach transfer requires an authorized seat migration workflow; use the vehicle selector with a matching coach layout.", "warn")}>Coach Transfer</button></div>
          <div className="u51-indicators" aria-label="Reference schedule indicators">{["users", "users", "layout"].map((ico, i) => (
            <span key={i} className={i === 2 ? "selected" : ""} title="Unmapped reference indicator — requires confirmed product semantics"><I k={ico} /><small>{i === 2 ? "ON" : "OFF"}</small></span>
          ))}</div>
        </div>
      </section>

      <section className="u51-card u51-sync"><header className="u51-cardhead">
        <h3><Square k="refresh" /><span>Sync with Route<small>Route changes (coach, timings, stages, fares) will apply to this schedule.</small></span></h3>
        <label className="u51-switch" title="Sync with route"><input type="checkbox" checked={sync} disabled={!d.can_modify} aria-label="Sync with Route" onChange={(e) => void toggleSync(e.currentTarget.checked)} /><span></span></label>
      </header></section>
      <section className="u51-ota">
        <label><input type="checkbox" checked={missing} onChange={(e) => setMissing(e.currentTarget.checked)} /><span><b>Missing on RedBus / AbhiBus?</b> Tick this and Sync to re-push this trip’s seats — not needed on a normal save.</span></label>
        <button type="button" className="u51-ota-button" aria-disabled="true" title={d.ota_sync_message} onClick={() => toast(d.ota_sync_message || "OTA integration is not connected; no push was performed", "warn")}>
          <I k="refresh" n={20} /> Sync with OTAs <span className="u51-warning">!</span></button>
        {missing ? <div className="u51-ota-note">{d.ota_sync_message}</div>
          : <div className="u51-tooltip" role="status"><b>⚠ WHAT’S MISSING</b><small>Tick the box above to confirm this re-push. An authorized OTA connector is also required.</small></div>}
      </section>
    </div>
  );
}
