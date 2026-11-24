import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type Assignment, type RouteRow, type ScheduleBookingChart, type Staff, type TripRow, type Vehicle } from "../../api";
import { SeatLayoutView } from "./SeatLayoutView";
import { copySeatPoster, formatDate, titleFor, type ScheduleSeatLayout, type SeatCell } from "./seatLayoutModel";
import "./schedules.css";

type ManageTab = "Bookings" | "Block" | "Update" | "Cities" | "Pickups" | "Drops" | "Fares";
const errorText = (e: unknown) => e instanceof Error ? e.message : String(e);
const indiaDate = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const currency = (value: number) => "₹" + value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const tabs: ManageTab[] = ["Bookings", "Block", "Update", "Cities", "Pickups", "Drops", "Fares"];

function AssignmentEdit({ trip, rows, vehicles, staff, onChange }: {
  trip: TripRow;
  rows: Assignment[];
  vehicles: Vehicle[];
  staff: Staff[];
  onChange: () => Promise<void>;
}) {
  const [role, setRole] = useState("Driver");
  const [assignee, setAssignee] = useState("");
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const active = rows.filter((x) => x.isActive);
  const getName = (a: Assignment) => a.kind === "vehicle" ?
    vehicles.find((x) => x.id === a.vehicleId)?.registrationNumber ?? "Vehicle #" + a.vehicleId :
    staff.find((x) => x.id === a.staffId)?.name ?? "Staff #" + a.staffId;
  const eligible = staff.filter((x) => x.status === "active" &&
    (role === "Driver" || role === "Driver 2" ? x.role === "driver" :
      role === "Helper" ? ["helper", "attendant"].includes(x.role) :
        role === "Conductor" ? x.role === "conductor" : true));
  const save = async () => {
    if (!assignee || !reason.trim()) { setMsg("Choose an assignee and enter the reason."); return; }
    if (!window.confirm("Update this service assignment? The change will be recorded in the audit trail.")) return;
    setBusy(true); setMsg("");
    try {
      await api.assign(trip.id, role === "vehicle" ?
        { role, vehicleId: Number(assignee), reason: reason.trim() } :
        { role, staffId: Number(assignee), reason: reason.trim() });
      await onChange(); setEditing(false); setAssignee(""); setReason("");
      setMsg("Schedule assignment updated and verified from the server.");
    } catch (e) { setMsg(errorText(e)); } finally { setBusy(false); }
  };
  return <section className="sm-update-card">
    <header className="sm-card-head"><h3>Vehicle &amp; Staff Assignment</h3>
      <button type="button" onClick={() => { setEditing(!editing); setMsg(""); }} className="sm-btn-outline">
        {editing ? "Cancel" : "✎ Edit"}
      </button></header>
    <div className="sm-assignment-columns">
      <div><div className="sm-section-title">VEHICLE <span>Data Source: Schedule</span></div>
        <div className="sm-assignment-items">
          {active.filter((x) => x.kind === "vehicle").map((a) =>
            <div className="sm-staff-card" key={a.id}><span className="sm-staff-icon">▣</span>
              <strong>{getName(a)}</strong></div>)}
          {!active.some((a) => a.kind === "vehicle") && <p className="sm-muted">No vehicle assigned</p>}
        </div></div>
      <div><div className="sm-section-title">STAFF <span>Data Source: Schedule</span></div>
        <div className="sm-assignment-items">
          {active.filter((x) => x.kind !== "vehicle").map((a) =>
            <div className="sm-staff-card" key={a.id}><span className="sm-staff-icon">♙</span>
              <div><small>{a.role.toUpperCase()}</small><strong>{getName(a)}</strong></div></div>)}
          {!active.some((a) => a.kind !== "vehicle") && <p className="sm-muted">No staff assigned</p>}
        </div></div>
    </div>
    {editing && <form className="sm-assignment-form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <label>Assignment role<select aria-label="Assignment role" value={role}
        onChange={(e) => { setRole(e.target.value); setAssignee(""); }}>
        {["vehicle", "Driver", "Driver 2", "Helper", "Conductor"].map((v) =>
          <option value={v} key={v}>{v === "vehicle" ? "Vehicle" : v === "Helper" ? "Helper / Attendant" : v}</option>)}
      </select></label>
      <label>{role === "vehicle" ? "Vehicle" : "Staff"}
        <select required aria-label="Selected assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">Select…</option>
          {role === "vehicle" ? vehicles.filter((v) => v.status === "active").map((v) =>
            <option key={v.id} value={v.id}>{v.registrationNumber}</option>) :
            eligible.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.role})</option>)}
        </select>
      </label>
      <label>Reason <input required value={reason} placeholder="Reason for assignment change"
        onChange={(e) => setReason(e.target.value)}/></label>
      <button disabled={busy} type="submit" className="sm-save-btn">{busy ? "Saving…" : "Update Assignment"}</button>
    </form>}
    {msg && <p role="status" className="sm-edit-status">{msg}</p>}
    <div className="sm-provider-guard">
      <h4>Call Routing</h4>
      <p>Cloud Calling, Passenger Number Masking, Direct to Vehicle, Driver Mobile GPS and escalation settings
        require the corresponding migrated backend configuration. No provider operation is initiated here.</p>
      <h4>Autos &amp; Cabs</h4>
      <p>Off / Pickups / Drops / Both is pending a verified schedule-level business rule and persistence API.</p>
      <h4>Sync with Route / OTA Synchronization</h4>
      <p>Changes are not published to a route template or OTA until a verified synchronization workflow is available.</p>
    </div>
  </section>;
}

function Manage({ trip, close, changed }: { trip: TripRow; close: () => void; changed: () => void }) {
  const [tab, setTab] = useState<ManageTab>("Bookings");
  const [fromSequence, setFromSequence] = useState<number>();
  const [toSequence, setToSequence] = useState<number>();
  const [layout, setLayout] = useState<ScheduleSeatLayout>();
  const [bookings, setBookings] = useState<ScheduleBookingChart[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("Operator seat block");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const handle = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [close]);
  useEffect(() => { setSelected([]); }, [fromSequence, toSequence, trip.id]);
  useEffect(() => {
    let current = true;
    setLayout(undefined); setError("");
    api.scheduleLayout(trip.id, fromSequence, toSequence).then((x) => {
      if (current) setLayout(x);
    }).catch((e) => { if (current) setError(errorText(e)); });
    return () => { current = false; };
  }, [trip.id, fromSequence, toSequence, reloadKey]);
  useEffect(() => {
    let alive = true;
    Promise.allSettled([
      api.bookingChart(trip.id),
      api.assignments(trip.id),
      api.vehicles(), api.staff(), api.routes()
    ]).then(([b, a, v, s, r]) => {
      if (!alive) return;
      if (b.status === "fulfilled") setBookings(b.value);
      if (a.status === "fulfilled") setAssignments(a.value);
      if (v.status === "fulfilled") setVehicles(v.value);
      if (s.status === "fulfilled") setStaff(s.value);
      if (r.status === "fulfilled") setRoutes(r.value);
      const failures = [b, a, v, s, r].filter((x) => x.status === "rejected");
      if (failures.length) setError("Some schedule data could not load. Refresh and check access permissions.");
    });
    return () => { alive = false; };
  }, [trip.id, reloadKey]);
  const route = routes.find((r) => r.id === trip.routeId);
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return bookings.filter((b) => !q || [b.pnr, b.channel, b.status,
      ...b.passengers.flatMap((p) => [p.name, p.seatCode, p.boardingStatus])]
      .some((x) => x.toLowerCase().includes(q)));
  }, [bookings, search]);
  const occupied = layout?.seats.filter((s) => s.state === "booked").length ?? 0;
  const capacity = layout?.seats.length ?? 0;
  const occupancy = capacity ? Math.round(occupied / capacity * 100) : 0;
  const origin = layout ? titleFor(layout) : trip.name;
  const refresh = useCallback(() => setReloadKey((v) => v + 1), []);
  const run = async (fn: () => Promise<string>) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const message = await fn();
      setSelected([]);
      refresh(); changed(); setNotice(message);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const onSeat = (seat: SeatCell) => {
    if (!["available", "blocked"].includes(seat.state)) return;
    setSelected((prev) => prev.includes(seat.seatCode) ? prev.filter((x) => x !== seat.seatCode) :
      [...prev, seat.seatCode]);
  };
  const performBlock = () => {
    if (!layout || !selected.length) return;
    const items = layout.seats.filter((s) => selected.includes(s.seatCode));
    if (!items.length || items.length !== selected.length) { setError("Selected seats have changed. Refresh first."); return; }
    if (items.every((s) => s.state === "available")) {
      if (!reason.trim()) { setError("A reason is required for seat blocking."); return; }
      if (!window.confirm("Block selected seats for the selected route segment?")) return;
      void run(async () => {
        await api.blockSegment(trip.id, selected, reason.trim(), layout.fromSequence, layout.toSequence);
        return "Seat blocks saved to PostgreSQL; live inventory will be refreshed.";
      });
    } else if (items.every((s) => s.state === "blocked")) {
      if (!window.confirm("Release all operator blocks for these seat IDs across the entire trip? This action is NOT limited to the current segment.")) return;
      void run(async () => {
        for (const code of selected) await api.unblock(trip.id, code);
        return "Operator blocks released; availability refreshed.";
      });
    } else setError("Select only available seats to block, or only blocked seats to release.");
  };
  const copy = () => {
    if (!layout || busy) return;
    setBusy(true); setNotice(""); setError("");
    void copySeatPoster(() => api.scheduleLayout(trip.id, layout.fromSequence, layout.toSequence))
      .then((status) => setNotice(status === "copied" ?
        "Seat-layout PNG copied. Paste into WhatsApp, email or another app." :
        "Your browser blocked the image clipboard; a PNG download was started."))
      .catch((e) => setError("Could not create seat image: " + errorText(e)))
      .finally(() => setBusy(false));
  };
  return <div className="sm-modal-backdrop">
    <section className="sm-modal" role="dialog" aria-modal="true" aria-labelledby="sm-modal-title">
      <header className="sm-modal-header">
        <div><strong id="sm-modal-title">Manage · {trip.service}</strong><span>{formatDate(trip.travelDate)}</span></div>
        <button ref={closeRef} onClick={close} aria-label="Close schedule management">✕ Close</button>
      </header>
      <div className="sm-modal-scroll">
        <nav className="sm-tabbar" aria-label="Schedule manage sections">
          {tabs.map((name) => <button type="button" key={name} onClick={() => setTab(name)}
            className={tab === name ? "selected" : ""} aria-current={tab === name ? "page" : undefined}>{name}</button>)}
          <button disabled title="Trip P&L API parity not yet verified">P&amp;L</button>
          <button disabled title="Schedule event-history API not yet migrated">History</button>
        </nav>
        <div className="sm-trip-banner">
          <div className="sm-service-summary"><span className="sm-service-icon">▣</span>
            <div><b>{trip.service} <small className="sm-status-badge">{trip.status.toUpperCase()}</small></b>
              <h2>{origin}</h2></div></div>
          <div><small>DATE</small><strong>{formatDate(trip.travelDate)}</strong></div>
          <div><small>DEPARTS</small><strong>{trip.departure}</strong></div>
          <div><small>COACH</small><strong>{layout?.coachName ?? "Loading…"}</strong></div>
          <div className="sm-occupancy"><small>OCCUPANCY</small><strong>{occupied}/{capacity} · {occupancy}%</strong>
            <div className="sm-occupancy-track"><span style={{width: occupancy + "%"}}/></div></div>
        </div>
        {error && <div className="sm-error" role="alert">{error}</div>}
        {notice && <div className="sm-notice" role="status">{notice}</div>}
        {(tab === "Bookings" || tab === "Block") && <>
          <div className="sm-toolbar">
            <div className="sm-segment">
              <label>From city<select value={layout?.fromSequence ?? ""} aria-label="From city" disabled={!layout}
                onChange={(e) => { setFromSequence(Number(e.target.value));setToSequence(undefined); }}>
                {layout?.stops.slice(0,-1).map((s) => <option value={s.sequence} key={s.sequence}>{s.name}</option>)}
              </select></label>
              <label>To city<select value={layout?.toSequence ?? ""} aria-label="To city" disabled={!layout}
                onChange={(e) => setToSequence(Number(e.target.value))}>
                {layout?.stops.filter((s) => s.sequence > layout.fromSequence).map((s) =>
                  <option value={s.sequence} key={s.sequence}>{s.name}</option>)}
              </select></label>
            </div>
            <div className="sm-toolbar-actions">
              <button onClick={copy} disabled={!layout || busy} className="sm-btn-outline">Copy seat image</button>
              <button disabled title="Public booking link requires operator URL and city-ID mapping configuration">
                Share booking link
              </button>
              <button onClick={refresh} disabled={busy}>↻ Refresh live seats</button>
            </div>
          </div>
          {!layout && !error && <p className="sm-muted" role="status">Loading current seat inventory…</p>}
          {layout && <div className="sm-bookings-content">
            <SeatLayoutView layout={layout} selected={selected} onSeat={onSeat} busy={busy}/>
            <aside className="sm-bookings-side">
              <h3>Operator seat blocks</h3>
              <p className="sm-muted">Select available seats to block, or operator-blocked seats to release.
                Confirmed bookings and active holds cannot be modified here.</p>
              <label>Reason<input value={reason} onChange={(e)=>setReason(e.target.value)} aria-label="Block reason"/></label>
              <div className="sm-selection-count">Selected: <b>{selected.length ? selected.join(", ") : "None"}</b></div>
              <button disabled={!selected.length || busy} onClick={performBlock} className="sm-save-btn">Apply seat action</button>
              <h3>Booking chart</h3>
              <label className="sm-search">Search PNR / passenger / seat<input
                value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search booking chart"/></label>
              <div className="sm-booking-records" data-testid="booking-chart">
                {filtered.map((b) => <details key={b.pnr} className="sm-booking">
                  <summary><b>{b.pnr}</b><small>{b.status} · {b.channel} · {currency(b.totalFare)}</small></summary>
                  {b.passengers.map((p, i) => <p key={i}><b>{p.seatCode}</b> · {p.name}
                    <span> {p.status} / {p.boardingStatus}</span></p>)}
                </details>)}
                {!filtered.length && <p className="sm-muted">No booking records match this search.</p>}
              </div>
            </aside>
          </div>}
        </>}
        {tab === "Update" && <AssignmentEdit trip={trip} rows={assignments} vehicles={vehicles}
          staff={staff} onChange={async () => {
            setAssignments(await api.assignments(trip.id)); refresh(); changed();
          }}/>}
        {tab === "Cities" && <section className="sm-data-card"><h3>Cities &amp; journey timings</h3>
          <table><thead><tr><th>Order</th><th>City</th><th>Day</th><th>Time</th></tr></thead>
            <tbody>{layout?.stops.map((s) => <tr key={s.sequence}><td>{s.sequence}</td>
              <td>{s.name}</td><td>Day {s.day}</td><td>{s.time}</td></tr>)}</tbody></table>
          <p className="sm-muted">Route-city editing requires a dedicated migration and booked-trip impact checks.</p>
        </section>}
        {(tab === "Pickups" || tab === "Drops") && <section className="sm-data-card"><h3>{tab} and timings</h3>
          <table><thead><tr><th>Stop</th><th>Day</th><th>Time</th><th>Stage ID</th></tr></thead>
            <tbody>{layout?.stages.filter((s) => s.kind === (tab === "Pickups" ? "pickup" : "drop"))
              .map((s) => <tr key={s.id}><td>{s.name}</td><td>{s.day}</td><td>{s.time}</td>
                <td>{s.id}</td></tr>)}</tbody></table>
          <p className="sm-muted">Stage editing and changes to already-booked trips are not enabled without the validated API.</p>
        </section>}
        {tab === "Fares" && <section className="sm-data-card"><h3>Segment fares</h3>
          <table><thead><tr><th>From → To</th><th>Seater</th><th>Lower sleeper</th><th>Upper sleeper</th></tr></thead>
            <tbody>{route?.fares.map((f, i) => <tr key={i}>
              <td>{f.fromSequence} → {f.toSequence}</td><td>{currency(f.seater)}</td>
              <td>{currency(f.sleeperLower)}</td><td>{currency(f.sleeperUpper)}</td></tr>)}</tbody></table>
          <p className="sm-muted">Fare updates should be made using the validated Fares module and reflected in live booking quotations.</p>
        </section>}
      </div>
      <footer className="sm-modal-footer"><button onClick={close}>✕ Close</button></footer>
    </section>
  </div>;
}
export function SchedulesPanel() {
  const [date, setDate] = useState(indiaDate());
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [filter, setFilter] = useState("");
  const [manageId, setManageId] = useState<number>();
  const [cycle, setCycle] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    setLoading(true); setError("");
    api.trips(date).then((rows) => { if (current) setTrips(rows); })
      .catch((e) => { if (current) setError(errorText(e)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [date, cycle]);
  const filtered = trips.filter((r) => [r.service, r.name, r.status]
    .some((v) => v.toLowerCase().includes(filter.toLowerCase())));
  const managing = trips.find((x) => x.id === manageId);
  return <section className="sm-schedules-page" data-testid="schedules-page">
    <header className="sm-page-header"><div><p className="sm-eyebrow">OPERATOR OPERATIONS</p>
      <h1>Schedules</h1><span>Services, live inventory and journey assignments</span></div>
      <button className="sm-btn-outline" onClick={()=>setCycle((v)=>v+1)}>↻ Refresh schedules</button></header>
    <div className="sm-filters">
      <label>Journey date<input type="date" value={date} onChange={(e) => setDate(e.target.value)}
        aria-label="Journey date"/></label>
      <label>Search services<input placeholder="Service no., route or status" value={filter}
        onChange={(e) => setFilter(e.target.value)} aria-label="Search schedules"/></label>
      <div className="sm-filter-count">{filtered.length} services</div>
    </div>
    {loading && <p role="status" className="sm-muted">Loading schedules…</p>}
    {error && <p role="alert" className="sm-error">{error}</p>}
    {!loading && !error && <div className="sm-service-list">
      {filtered.map((t) => <article className="sm-service-row" key={t.id}>
        <div className="sm-service-name"><strong>{t.service}</strong>
          <b>{t.name}</b><small className="sm-muted">{t.travelDate} · {t.status}</small></div>
        <div><small>DEPARTURE</small><strong>{t.departure}</strong></div>
        <div><small>BOOKED</small><strong>{t.booked}</strong></div>
        <div><small>ON HOLD</small><strong>{t.held}</strong></div>
        <div><small>BLOCKED</small><strong>{t.blocked}</strong></div>
        <div className="sm-row-actions">
          <button className="sm-save-btn" onClick={() => setManageId(t.id)}>Manage</button>
        </div>
      </article>)}
      {!filtered.length && <p className="sm-empty">No scheduled services found for this date and filter.</p>}
    </div>}
    {manageId && managing && <Manage trip={managing} close={() => setManageId(undefined)}
      changed={() => setCycle((v) => v+1)}/>}
  </section>;
}