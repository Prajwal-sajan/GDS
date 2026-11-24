import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type DailyOpsReport } from "../../api";
import "./dailyops.css";

const today = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const msg = (e: unknown) => e instanceof Error ? e.message : String(e);
type Section = "fleet" | "sales" | "alerts" | "ratings";

export function DailyOpsPanel({ onOpenBooking }: { onOpenBooking: (pnr: string) => void }) {
  const [date, setDate] = useState(today());
  const [section, setSection] = useState<Section>("fleet");
  const [report, setReport] = useState<DailyOpsReport>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("all");

  const load = useCallback(async () => {
    setBusy(true); setError(""); setReport(undefined);
    try { setReport(await api.report<DailyOpsReport>("daily-ops", new URLSearchParams({ date }).toString())); }
    catch (e) { setError(msg(e)); }
    finally { setBusy(false); }
  }, [date]);
  useEffect(() => { void load(); }, [load]);

  const fleet = useMemo(() => (report?.fleet.trips ?? []).filter(t =>
    (status === "all" || status === "unassigned" && !t.vehicle || t.status === status) &&
    (t.service + " " + t.route + " " + (t.vehicle ?? "")).toLowerCase().includes(filter.toLowerCase())
  ), [report, filter, status]);
  const warns = (report?.fleet.summary.withoutBus ?? 0) +
    (report?.compliance.vehicleDocuments.length ?? 0) + (report?.compliance.licences.length ?? 0);
  return <section data-testid="dailyops-page" className="dailyops-page">
    <div className="dailyops-head">
      <div><h2>Daily Operations</h2><p className="muted">Live operations, dispatch and compliance from the same PostgreSQL GDS.</p></div>
      <div className="row"><label>Operation date<input aria-label="Operation date" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <button type="button" disabled={busy} onClick={() => void load()}>Refresh</button></div>
    </div>
    {busy && <p role="status">Loading daily operations…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {report && <>
      <div className="dailyops-kpis">
        {([
          ["Scheduled services", report.fleet.summary.trips],
          ["Running", report.fleet.summary.running],
          ["Unassigned buses", report.fleet.summary.withoutBus],
          ["Seats sold", report.fleet.summary.seats],
          ["Tickets booked", report.earnings.bookings],
          ["Tickets issued value", inr(report.earnings.amount)],
          ["Compliance alerts", warns],
        ] as [string,string|number][]).map(([label, val]) =>
          <div className="dailyops-kpi" key={label}><small>{label}</small><strong>{val}</strong></div>)}
      </div>
      <nav aria-label="Daily Ops sections" className="dailyops-tabs">
        {([
          ["fleet", "Fleet & Dispatch"], ["sales", "Sales & Outlook"], ["alerts", "Compliance & No-Shows"], ["ratings", "Passenger Experience"]
        ] as const).map(([id,label]) =>
          <button key={id} type="button" className={section === id ? "active" : "link"} aria-current={section === id ? "page" : undefined}
            onClick={() => setSection(id)}>{label}</button>)}
      </nav>
      {section === "fleet" && <>
        <div className="row dailyops-filters">
          <label>Search service/route/bus<input aria-label="Filter services" value={filter} onChange={e => setFilter(e.target.value)} /></label>
          <label>Bus status<select aria-label="Fleet status" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="all">All services</option><option value="active">Active</option><option value="cancelled">Cancelled</option>
            <option value="unassigned">No bus assigned</option></select></label>
        </div>
        <table><thead><tr><th>Service</th><th>Route</th><th>Status</th><th>Vehicle</th><th>Crew</th><th>Sold/capacity</th><th>Occupancy</th><th>Net sales (ex GST)</th></tr></thead>
          <tbody>{fleet.map(t => <tr key={t.tripId} className={!t.vehicle && t.status === "active" ? "dailyops-attention" : ""}>
            <td>{t.service}<small>#{t.tripId}</small></td><td>{t.route}</td><td>{t.status}</td>
            <td>{t.vehicle || "Not assigned"}</td>
            <td>{t.crew.map(c => c.role + ": " + c.name).join("; ") || "Not assigned"}</td>
            <td>{t.seats} / {t.capacity}</td><td>{t.occupancyPct}%</td><td>{inr(t.netSales)}</td></tr>)}
            {fleet.length === 0 && <tr><td colSpan={8} className="muted">No matching services</td></tr>}</tbody>
        </table>
        <p className="muted">Vehicle and crew assignment changes are made through Schedules → Manage → Update. Missing assignments are not automatically resolved.</p>
      </>}
      {section === "sales" && <>
        <h3>Today's booking activity</h3>
        <div className="dailyops-inline"><span>Issued seats: <b>{report.earnings.seats}</b></span><span>Cancellation count: <b>{report.earnings.cancelledToday}</b></span>
          <span>Issued ticket value: <b>{inr(report.earnings.amount)}</b></span></div>
        <h3>Booking channels</h3>
        <table><thead><tr><th>Channel</th><th>Bookings</th><th>Issued amount</th></tr></thead><tbody>
          {report.earnings.byChannel.map(c => <tr key={c.channel}><td>{c.channel}</td><td>{c.bookings}</td><td>{inr(c.amount)}</td></tr>)}
          {report.earnings.byChannel.length === 0 && <tr><td colSpan={3}>No bookings recorded</td></tr>}
        </tbody></table>
        <h3>Seven-day fleet outlook</h3>
        <table><thead><tr><th>Date</th><th>Active services</th><th>Booked seats</th><th>Capacity</th><th>Occupancy</th></tr></thead><tbody>
          {report.earnings.next7.map(d => <tr key={d.date}><td>{d.date}</td><td>{d.trips}</td><td>{d.seats}</td>
            <td>{d.capacity}</td><td>{d.occupancyPct}%</td></tr>)}
        </tbody></table>
      </>}
      {section === "alerts" && <>
        <h3>Vehicle documents expiring or expired</h3>
        <table><thead><tr><th>Vehicle</th><th>Document</th><th>Expiry</th><th>Status</th></tr></thead><tbody>
          {report.compliance.vehicleDocuments.map((d,i) => <tr key={i}><td>{d.vehicle || "—"}</td><td>{d.document}</td><td>{d.expiryDate}</td>
            <td>{d.state}</td></tr>)}
          {report.compliance.vehicleDocuments.length === 0 && <tr><td colSpan={4}>No document expiry alerts</td></tr>}
        </tbody></table>
        <h3>Crew licences expiring or expired</h3>
        <table><thead><tr><th>Name</th><th>Role</th><th>Licence expiry</th><th>Status</th></tr></thead><tbody>
          {report.compliance.licences.map((s,i) => <tr key={i}><td>{s.name}</td><td>{s.role}</td><td>{s.licenseExpiry}</td><td>{s.state}</td></tr>)}
          {report.compliance.licences.length === 0 && <tr><td colSpan={4}>No licence expiry alerts</td></tr>}
        </tbody></table>
        <h3>Yesterday's no-shows</h3>
        <table><thead><tr><th>PNR</th><th>Service</th><th>Seat</th><th>Passenger</th><th>Action</th></tr></thead><tbody>
          {report.passengers.noShowsYesterday.map((n,i) => <tr key={i}><td>{n.pnr}</td><td>{n.service}</td><td>{n.seat}</td><td>{n.passenger}</td>
            <td><button className="link" onClick={() => onOpenBooking(n.pnr)}>Open ticket</button></td></tr>)}
          {report.passengers.noShowsYesterday.length === 0 && <tr><td colSpan={5}>No no-shows recorded</td></tr>}
        </tbody></table>
      </>}
      {section === "ratings" && <>
        <div className="dailyops-inline"><span>14-day rating: <b>{report.ratings.average ?? "Not available"}</b></span>
          <span>Rating count: <b>{report.ratings.count}</b></span></div>
        <h3>Low ratings requiring follow-up</h3>
        <table><thead><tr><th>OTA</th><th>PNR</th><th>Rating</th><th>Review</th><th>Reply status</th></tr></thead><tbody>
          {report.ratings.low.map(r => <tr key={r.id}><td>{r.ota}</td><td>{r.pnr ?? "—"}</td><td>{r.rating}</td>
            <td>{r.review ?? "—"}</td><td>{r.operatorReply ? "Recorded (not published)" : "Awaiting reply"}</td></tr>)}
          {report.ratings.low.length === 0 && <tr><td colSpan={5}>No low-rating reviews recorded</td></tr>}
        </tbody></table>
        <p className="muted">Replies are recorded internally until an authorized OTA ratings API is connected.</p>
      </>}
    </>}
  </section>;
}
