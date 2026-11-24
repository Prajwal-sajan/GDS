/* eslint-disable @typescript-eslint/no-explicit-any */
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../../api";
import { toast, toastError } from "../../components/ui/feedback";
import { Empty, Ic, isoDay, query } from "./AccountsPage";

// React port of legacy Accounts → Reports: catalogue (accounts-parity-v10.js reportCatalogue) and the report detail screens
// fleet-operations-v20.js (fop-*), report-suite-v21.js + specs (rpt21-*) and report-suite-v22.js + specs (rpt22-*).
// Same DOM / classes so the vendored legacy CSS applies unchanged. Data: /api/admin/accounts/reports/{key} (legacy JSON contract).

type Cat = [string, string, string, string, string];
export const CATALOGUE: Cat[] = [
  ["FLEET", "fleet-operations", "Fleet Operations", "Utilization, mileage and driver allocation together per bus, per driver, per day and per trip.", "fleet"],
  ["CREW", "driver-behavior", "Driver Behaviour", "Driving score per driver, worst first: hard brakes, harsh acceleration, over-speed, idling and free run.", "steering"],
  ["CREW", "staff-duty", "Staff Duty Statement", "One driver / staff member every trip with date, bus, route, duty and Daily Ops details.", "clipboard"],
  ["BOOKINGS", "point-usage", "Boarding & Dropping Points", "Which boarding and dropping points were used, how often: bookings, seats, share and days used.", "pins"],
  ["BOOKINGS", "metro-bookings", "Metro Bookings", "Every PNR with a Metro pickup or drop, its metro fare and booking revenue — pick Pickup, Drop or both.", "metro"],
  ["BOOKINGS", "van-bookings", "Pickup Van Bookings", "Every PNR with a Pickup Van pickup or drop and its booking revenue — pick Pickup, Drop or both.", "van"],
  ["BOOKINGS", "point-performance", "Point Performance", "Any one pickup or drop point: PNRs, seats, revenue, share and rank by service, weekday and trip.", "target"],
  ["BOOKINGS", "station-performance", "Station Performance", "City-to-city sales by station pair, boarding and dropping station, schedule and day.", "route"],
  ["BOOKINGS", "no-shows", "No-shows", "Every no-show seat: passenger, trip, fare — whether the seat was resold on that trip and the recovered fare.", "userX"],
  ["BOOKINGS", "cancellations", "Cancellations", "Every cancelled booking: amount, charge kept, who cancelled — seats resold on that trip and refund.", "ban"],
  ["CUSTOMERS", "frequent-travellers", "Frequent Travellers", "Who travels with you most: trips, spend, channels and last trip per passenger.", "repeat"],
  ["FINANCE", "trip-pnl", "Trip P&L / Occupancy", "Per trip: seats sold vs capacity, occupancy, net sales, expenses and profit.", "pie"],
  ["FINANCE", "expenses", "Expenses", "Category-wise expenses for the period: each category’s total and share, then by bus and trip.", "wallet"],
];

export function ReportsTab() {
  const id = location.hash.replace(/^#\/?/, "").split("?")[0].split("/")[2];
  if (!id) return <Catalogue />;
  if (id === "fleet-operations") return <FleetReport />;
  if (V22_KEYS.has(id)) return <SuiteV22 k={id} />;
  if (DEF[id]) return <SuiteV21 k={id} />;
  return <Empty text="Report not found" />;
}

function Catalogue() {
  const [q, setQ] = useState("");
  return (
    <div className="ac10-reports-home">
      <div className="ac10-row-between">
        <div><h2>Reports</h2><p>Pick a report, choose the period, then view, print or save it as PDF.</p></div>
        <label className="ac10-search sm"><Ic k="search" /><input data-report-find="" placeholder="Search 13 reports" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      </div>
      <div className="ac10-report-grid">
        {["FLEET", "CREW", "BOOKINGS", "CUSTOMERS", "FINANCE"].map((k) => (
          <section key={k}><h3>{k}</h3>
            {CATALOGUE.filter((r) => r[0] === k).map((r) => (
              <a key={r[1]} className="ac10-report" href={`#/accounts/reports/${r[1]}`} hidden={!!q && !`${r[2]}${r[3]}`.toLowerCase().includes(q.toLowerCase())}>
                <span className="ac10-reportico"><Ic k={r[4]} s={17} /></span><span><b>{r[2]}</b><small>{r[3]}</small></span><Ic k="arrow" s={14} />
              </a>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- shared helpers
const PATHS: Record<string, string> = {
  print: "M7 8V3h10v5M7 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 15h10v6H7z",
  download: "M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4",
  share: "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.5 11 15.5 6M8.5 14l7 5",
  back: "M20 12H4m8-8-8 8 8 8",
  user: "M20 21a8 8 0 0 0-16 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  bus: "M4 17V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11H4ZM4 13h16M7 17v3m10-3v3",
  calendar: "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
  chevron: "m6 9 6 6 6-6",
  point: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  search: "m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  route: "M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM18 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM9 6h6a4 4 0 0 1 0 8H9a4 4 0 0 0 0 4",
  excel: "M6 2h9l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM14 2v6h6M8 12l6 7m0-7-6 7",
};
const Svg = ({ k, s = 18, sw = "1.8", cls }: { k: string; s?: number; sw?: string; cls?: string }) => (
  <svg className={cls} viewBox="0 0 24 24" width={s} height={s} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round"><path d={PATHS[k] ?? PATHS.bus} /></svg>
);
const n0 = (n: unknown) => Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const n1 = (n: unknown) => Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 1 });
const rupee = (n: unknown) => "₹" + n0(n);
const per = (n: unknown) => (n === null || n === undefined ? "—" : Number(n).toFixed(1).replace(/\.0$/, "") + "%");
const shift = (s: string, n: number) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return isoDay(d); };
const todayIso = () => isoDay(new Date());
function preset(k: string) { let to = todayIso(), from = shift(to, -6); if (k === "month") from = to.slice(0, 7) + "-01"; if (k === "last") { to = shift(to.slice(0, 7) + "-01", -1); from = to.slice(0, 7) + "-01"; } return { from, to }; }
const qs = (o: Record<string, unknown>) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => [k, String(v)])).toString();
const go = (hash: string) => { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent("hashchange")); else location.hash = hash; };
const validRange = (from: string, to: string) => /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;
async function share(title: string) {
  const nav = navigator as Navigator & { share?: (d: { title: string; url: string }) => Promise<void> };
  if (nav.share) { try { await nav.share({ title, url: location.href }); return; } catch (e) { if ((e as Error).name === "AbortError") return; } }
  try { await navigator.clipboard.writeText(location.href); toast("Filtered report link copied", "ok"); } catch { toast("Copy the URL to share this report", "bad"); }
}
const pdfUnavailable = (what = "PDF") => toast(`${what} export is not available in this version yet — use Print and choose “Save as PDF”.`, "bad");

function useReport(path: string, optionsPath: string) {
  const [state, set] = useState<{ d: any; o: any } | { error: string } | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([api.admin(path), api.admin(optionsPath)]).then(([d, o]) => { if (live) set({ d, o }); })
      .catch((e) => { if (live) { set({ error: e instanceof Error ? e.message : String(e) }); toastError(e); } });
    return () => { live = false; };
  }, [path, optionsPath]);
  return state;
}

// ---------------------------------------------------------------- Fleet Operations (fleet-operations-v20.js)
type FCol = [string, string, string?];
const FOP_TABLES: { key: string; heading: string; width: string; cols: FCol[] }[] = [
  { key: "by_bus", heading: "BY BUS", width: "1560px", cols: [["vehicle", "Bus"], ["trips", "Trips", "number"], ["days_ran", "Days ran", "number"], ["days_idle", "Days idle", "number"], ["util_pct", "Util", "pct"], ["km", "Km (GPS)", "number"], ["km_route", "Km (route)", "number"], ["fuel_l", "Fuel (L)", "decimal"], ["kmpl", "km/L", "ratio"], ["diesel", "Diesel", "money"], ["rs_per_km", "₹/km", "ratio"], ["drivers", "Drivers"]] },
  { key: "by_driver", heading: "BY DRIVER", width: "1420px", cols: [["driver", "Driver"], ["phone", "Phone"], ["trips", "Trips", "number"], ["days", "Days", "number"], ["km", "Km (GPS)", "number"], ["fuel_l", "Fuel (L)", "decimal"], ["kmpl", "km/L", "ratio"], ["vs_bus_avg_pct", "vs bus avg", "delta"], ["buses", "Buses"]] },
  { key: "driver_by_bus", heading: "DRIVER × BUS", width: "1350px", cols: [["driver", "Driver"], ["vehicle", "Bus"], ["trips", "Trips", "number"], ["km", "Km (GPS)", "number"], ["fuel_l", "Fuel (L)", "decimal"], ["kmpl", "km/L", "ratio"], ["bus_avg_kmpl", "Bus avg km/L", "ratio"], ["vs_bus_avg_pct", "vs bus avg", "delta"]] },
  { key: "daily", heading: "DAILY", width: "1420px", cols: [["date", "Date"], ["fleet", "Fleet", "number"], ["used", "Used", "number"], ["trips", "Trips", "number"], ["util_pct", "Util", "pct"], ["no_bus", "No bus", "number"], ["turned_off", "Off", "number"], ["km", "Km (GPS)", "number"], ["fuel_l", "Fuel (L)", "decimal"], ["kmpl", "km/L", "ratio"], ["diesel", "Diesel", "money"], ["idle_buses", "Idle buses"]] },
  { key: "rows", heading: "TRIP-WISE", width: "1630px", cols: [["date", "Date"], ["departure_time", "Dep"], ["service", "Service"], ["route", "Route"], ["vehicle", "Bus"], ["drivers", "Driver(s)", "drivers"], ["crew", "Crew", "crew"], ["km", "Km (GPS)", "number"], ["fuel_l", "Fuel (L)", "decimal"], ["kmpl", "km/L", "ratio"], ["diesel", "Diesel", "money"]] },
];
const FOP_TILES: [string, string, string][] = [["Fleet util", "fleet_util_pct", "pct"], ["Trips", "trips", "number"], ["Buses", "buses", "number"], ["Drivers", "drivers", "number"], ["Km (GPS)", "km", "number"], ["Fuel (L)", "fuel_l", "number"],
  ["Mileage", "kmpl", "mileage"], ["Diesel", "diesel", "money"], ["Idle bus-days", "idle_bus_days", "number"], ["Trips without bus", "trips_without_bus", "number"], ["Trips turned off", "trips_turned_off", "number"], ["Trips without driver", "trips_without_driver", "number"]];
const FOP_NUMERIC = new Set(["number", "decimal", "money", "pct", "ratio", "delta"]);
function fopFmt(v: any, kind?: string): string {
  if (v === null || v === undefined || v === "") return "—";
  if (kind === "number") return n0(v);
  if (kind === "decimal") return n1(v);
  if (kind === "money") return rupee(v);
  if (kind === "pct") return per(v);
  if (kind === "ratio") return Number(v).toFixed(2);
  if (kind === "delta") return (Number(v) > 0 ? "+" : "") + Number(v).toFixed(1) + "%";
  if (kind === "drivers") return Array.isArray(v) ? v.map((x: any) => x.name + (x.phone ? ` (${x.phone})` : "")).join(", ") : String(v);
  if (kind === "crew") return Array.isArray(v) ? v.map((x: any) => (x.role || "Crew") + ": " + x.name + (x.phone ? ` (${x.phone})` : "")).join(", ") : String(v);
  return String(v);
}

function FleetReport() {
  const u = query();
  const q = { from: u.from || shift(todayIso(), -6), to: u.to || todayIso(), staff_id: u.staff_id || "", bus_id: u.bus_id || "" };
  const st = useReport(`/accounts/reports/fleet-operations?${qs(q)}`, "/accounts/reports/fleet-operations/options");
  const root = useRef<HTMLDivElement>(null);
  if (!st) return <div className="ac10-loading">Loading Accounts…</div>;
  if ("error" in st) return <div className="fop-error"><b>Unable to load Fleet Operations</b><p>{st.error}</p><a href="#/accounts/reports">Back to Reports</a></div>;
  const { d, o } = st;
  const selected = Object.entries({ seven: preset("seven"), month: preset("month"), last: preset("last") }).find(([, v]) => d.from === v.from && d.to === v.to)?.[0] || "";
  const nav = (over: Record<string, string> = {}) => {
    const get = (k: string) => root.current?.querySelector<HTMLInputElement>(`[name="${k}"]`)?.value || "";
    const v = { from: get("from"), to: get("to"), staff_id: get("staff_id"), bus_id: get("bus_id"), ...over };
    if (!validRange(v.from, v.to)) return toast("Choose a valid date range", "bad");
    go(`#/accounts/reports/fleet-operations?${qs(v)}`);
  };
  const sel = (key: string, icon: string, label: string, opts: { id: any; name: string }[]) => (
    <label className="fop-filter fop-select"><Svg k={icon} s={19} sw="1.85" cls="fop-i" />
      <select name={key} aria-label={label} defaultValue={String(d[key] ?? "")} onChange={() => nav()}>
        <option value="">{label}</option>{opts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select><Svg k="chevron" s={17} sw="1.85" cls="fop-i" /></label>
  );
  return (
    <div className="fop-v20" data-fop-report="" ref={root}>
      <div className="fop-title-row">
        <div className="fop-title-left"><a className="fop-back" href="#/accounts/reports"><Svg k="back" s={20} sw="1.85" cls="fop-i" /> Reports</a><h1>Fleet Operations</h1></div>
        <div className="fop-actions">
          <button data-fop="print" className="fop-primary" onClick={() => window.print()}><Svg k="print" sw="1.85" cls="fop-i" /> Print</button>
          <button data-fop="pdf" className="fop-muted" onClick={() => pdfUnavailable()}><Svg k="download" sw="1.85" cls="fop-i" /> PDF</button>
          <button data-fop="share" className="fop-muted" onClick={() => share(`Fleet Operations ${d.from} to ${d.to}`)}><Svg k="share" sw="1.85" cls="fop-i" /> Share</button>
        </div>
      </div>
      <div className="fop-control-row">
        {sel("staff_id", "user", "All drivers / staff", (o.staff || []).map((x: any) => ({ id: x.id, name: x.name + (x.role ? " · " + x.role : "") })))}
        {sel("bus_id", "bus", "All buses", (o.buses || []).map((x: any) => ({ id: x.id, name: x.registration_number })))}
        {([["from", "Start date"], ["to", "End date"]] as const).map(([key, label]) => (
          <label key={key} className="fop-date"><Svg k="calendar" s={23} sw="1.85" cls="fop-i" /><input type="date" name={key} aria-label={label} required defaultValue={d[key]} onChange={() => nav()} /></label>
        ))}
        <div className="fop-presets">{([["seven", "Last 7 days"], ["month", "This month"], ["last", "Last month"]] as const).map(([key, label]) => (
          <button key={key} data-fop="preset" data-preset={key} className={selected === key ? "active" : ""} onClick={() => nav(preset(key))}>{label}</button>
        ))}</div>
      </div>
      <p className="fop-methodology">Fleet util = trips ÷ fleet buses per day (main buses only; a temporary bus counts only on days it ran). Km / fuel = available trip readings; km/L only from trips with both. Driver km/L vs bus avg = the same buses' km/L over all their trips this period (+ is better). A two-driver trip counts in full for each driver. * Diesel from recorded costs when available, otherwise the trip/route figure. {d.staff_id ? "Filtered to a driver, utilization is not shown — it measures buses. " : ""}Development GPS readings are not verified Intangles telemetry.</p>
      <div className="fop-summary">{FOP_TILES.map(([label, key, kind]) => (
        <div key={key} className="fop-tile"><span>{label}</span><b>{kind === "mileage" ? (d.summary.kmpl === null ? "—" : Number(d.summary.kmpl).toFixed(2) + " km/L") : fopFmt(d.summary[key], kind)}</b></div>
      ))}</div>
      {FOP_TABLES.map((t) => {
        const rows: any[] = d[t.key] || [], total = d.totals?.[t.key] || {};
        const cls = (c: FCol) => (FOP_NUMERIC.has(c[2] ?? "") ? "fop-num" : "");
        return (
          <section key={t.key} className="fop-report-section" data-fop-section={t.key}>
            <div className="fop-section-title">{`${t.heading} `}<span>· {rows.length}</span></div>
            <div className="fop-grid-scroll" tabIndex={0} aria-label={`${t.heading} report table`}>
              <table className={`fop-grid fop-grid-${t.key}`} style={{ minWidth: t.width }}>
                <thead><tr>{t.cols.map((c) => <th key={c[0]} className={cls(c)}>{c[1]}</th>)}</tr></thead>
                <tbody>{rows.length ? rows.map((r, i) => <tr key={i}>{t.cols.map((c) => <td key={c[0]} className={cls(c)}>{fopFmt(r?.[c[0]], c[2])}</td>)}</tr>)
                  : <tr><td colSpan={t.cols.length} className="fop-empty">No records for this period and filters</td></tr>}</tbody>
                <tfoot><tr>{t.cols.map((c, i) => <td key={c[0]} className={cls(c)}>{total[c[0]] === undefined ? (i === 0 ? "Total" : "") : fopFmt(total[c[0]], c[2])}</td>)}</tr></tfoot>
              </table>
            </div>
          </section>
        );
      })}
      <p className="fop-footnote">All figures reflect the selected filters. When a trip has two drivers, each receives full trip km and fuel credit, so driver totals may exceed fleet totals. Route diesel values are estimates when no recorded expense exists.</p>
    </div>
  );
}

// ---------------------------------------------------------------- report-suite specs (v21 + v22)
type RCol = { key: string; label: string; type: string; width: number };
type RSection = { key: string; title: string; cols: RCol[] };
type RDef = { title: string; note: string; metrics: [string, string, string][]; sections: RSection[]; needsStaff?: boolean; bus?: boolean; staff?: boolean; modes?: boolean; needsPoint?: boolean };
const col = (key: string, label: string, type = "text", width = 1): RCol => ({ key, label, type, width });
const T = (k: string, l: string, w = 1) => col(k, l, "text", w), N = (k: string, l: string, w = 1) => col(k, l, "number", w), M = (k: string, l: string, w = 1) => col(k, l, "money", w),
  Pc = (k: string, l: string, w = 1) => col(k, l, "pct", w), Ra = (k: string, l: string, w = 1) => col(k, l, "ratio", w), Dl = (k: string, l: string, w = 1) => col(k, l, "delta", w),
  H = (k: string, l: string, w = 1) => col(k, l, "duration", w), V = (k: string, l: string, w = 1) => col(k, l, "speed", w);
const sec = (key: string, title: string, cols: RCol[]): RSection => ({ key, title, cols });
const DEF: Record<string, RDef> = {
  "staff-duty": { title: "Staff Duty Statement", needsStaff: true, bus: true, staff: true,
    note: "Trips this person was assigned to, with Daily Ops figures per trip. Halt = the trip was turned off (a halt day only when nothing was worked that day). Pickup/drop: actual/scheduled, late at 8+ minutes. km/L uses paired trip km and fuel; bus avg is the same bus over this period.",
    metrics: [["Trips", "trips", "number"], ["Working days", "working_days", "number"], ["Halt days", "halt_days", "number"], ["Km (GPS)", "km", "number"], ["Fuel (L)", "fuel_l", "decimal"], ["Mileage", "mileage", "mileage"], ["Late pickups", "late_pickups", "number"], ["Trips turned off", "trips_turned_off", "number"]],
    sections: [
      sec("rows", "TRIPS", [T("date", "Date", 1.05), T("dep", "Dep", .55), T("service", "Service", .72), T("route", "Route", 1.6), T("bus", "Bus", 1.1), T("status", "Status", .8), T("pickup_scheduled", "Pickup sch.", .85), T("pickup_actual", "Pickup act.", .85),
        T("drop_scheduled", "Drop sch.", .85), T("drop_actual", "Drop act.", .85), N("late", "Late 8+", .65), N("km", "Km", .65), N("fuel_l", "Fuel (L)", .75), Ra("kmpl", "km/L", .6), Ra("bus_avg_kmpl", "Bus avg", .7), Dl("vs_bus_avg_pct", "vs avg", .7), T("other_crew", "Other crew", 1.3)]),
      sec("daily", "DAILY", [T("date", "Date", 1.5), N("trips", "Trips"), N("worked", "Worked"), N("halts", "Halt"), T("status", "Day status", 1.5), N("km", "Km (GPS)", 1.2), N("fuel_l", "Fuel (L)", 1.2)])] },
  "point-usage": { title: "Boarding & Dropping Points", bus: true,
    note: "Own bookings (website, app, staff, agents — not OTA-imported), confirmed or completed, by travel date. Share = the point’s seats ÷ all seats. Days used = travel days with at least one booking at the point.",
    metrics: [["Bookings", "bookings", "number"], ["Seats", "seats", "number"], ["Amount", "amount", "money"], ["Boarding points", "boarding_points", "number"], ["Dropping points", "dropping_points", "number"]],
    sections: [
      sec("boarding", "BOARDING POINTS", [T("point", "Boarding point", 5.3), N("bookings", "Bookings"), N("seats", "Seats"), Pc("share_pct", "Share"), N("days_used", "Days used"), M("amount", "Amount", 1.4)]),
      sec("dropping", "DROPPING POINTS", [T("point", "Dropping point", 5.3), N("bookings", "Bookings"), N("seats", "Seats"), Pc("share_pct", "Share"), N("days_used", "Days used"), M("amount", "Amount", 1.4)]),
      sec("pairs", "BOARDING → DROPPING", [T("boarding", "Boarding", 4.2), T("dropping", "Dropping", 4.2), N("bookings", "Bookings"), N("seats", "Seats"), M("amount", "Amount", 1.4)])] },
  cancellations: { title: "Cancellations", bus: true,
    note: "Bookings cancelled after being confirmed, by travel date. By = passenger or operator. Resold = the booking’s seats on the same trip sold again after cancellation — to anyone, including the same passenger. Recovered = fares from those resales.",
    metrics: [["Cancellations", "cancellations", "number"], ["Seats", "seats", "number"], ["Amount", "amount", "money"], ["Charges kept", "charges_kept", "money"], ["By operator", "by_operator", "number"], ["Bookings resold", "bookings_resold", "resale"], ["Seats resold", "seats_resold", "number"], ["Recovered", "recovered", "money"]],
    sections: [sec("rows", "CANCELLATIONS", [T("date", "Date", 1), T("service", "Service", .7), T("pnr", "PNR", 1.75), T("passenger", "Passenger", 1.45), T("phone", "Phone", 1.1), T("boarding", "Boarding", 2.25), T("source", "Source", 1.1), T("by", "By", .9),
      N("seats", "Seats", .55), M("amount", "Amount", .95), M("charge", "Charge", .9), T("resold_label", "Resold", .7), M("recovered", "Recovered", 1.0)])] },
  "driver-behavior": { title: "Driver Behaviour", bus: true, staff: true,
    note: "Intangles alerts over each trip’s journey (first to last GPS stop stamp — the same window as diesel). Every driver on a trip is charged all its alerts; a two-driver trip is Shared. Score 0–100 = 100 − 5 × penalty points per 100 km: 1 per hard brake, harsh acceleration or freerun, 0.5 per 10 min over-speed, 0.2 per 10 min idling. Over-speed = above the Intangles speed limit. Trips still running or missing Intangles readings show —.",
    metrics: [["Trips recorded", "trips_recorded", "recorded"], ["Drivers", "drivers", "number"], ["Avg driver score", "avg_driver_score", "number"], ["Below 65", "below_65", "number"], ["Trips without driver", "trips_without_driver", "number"]],
    sections: [
      sec("drivers", "DRIVERS (WORST SCORE FIRST)", [T("driver", "Driver", 1.5), T("phone", "Phone", 1), N("trips", "Trips", .5), N("shared", "Shared", .6), N("km", "Km", .85), N("score", "Score", .55), N("hard_brake", "Hard brake", .9), N("harsh_accel", "Harsh accel", .9),
        H("over_speed", "Over-speed", .9), V("top_speed", "Top speed", .9), H("idling", "Idling", .8), N("freerun", "Freerun", .7), T("buses", "Buses", 1.4)]),
      sec("rows", "TRIP-WISE", [T("date", "Date", .9), T("dep", "Dep", .55), T("service", "Service", .75), T("route", "Route", 1.3), T("bus", "Bus", 1), T("drivers", "Drivers", 2.4), N("km", "Km", .6), N("score", "Score", .6),
        N("hard_brake", "Hard brake", .9), N("harsh_accel", "Harsh accel", .9), H("over_speed", "Over-speed", .9), V("top_speed", "Top speed", .9), H("idling", "Idling", .8), N("freerun", "Freerun", .7)])] },
  expenses: { title: "Expenses", bus: true,
    note: "Expense lines = route defaults with each trip’s own entries on top, as in Trip P&L. A running trip carries fixed + running lines + channel commission; a turned-off trip only fixed lines, so the total matches Trip P&L. Diesel uses completed-trip telematics where recorded, otherwise the route figure (explicit operator overrides take precedence). By bus and trip-wise show the largest categories as columns; the rest add up under Other.",
    metrics: [["Total expense", "total_expense", "money"], ["Fixed", "fixed", "money"], ["Running", "running", "money"], ["Channel commission", "channel_commission", "money"], ["Per trip", "per_trip", "money"], ["Trips", "trips", "number"], ["Trips turned off", "trips_turned_off", "number"], ["Buses", "buses", "number"]],
    sections: [sec("categories", "BY CATEGORY", [T("label", "Category", 3.5), T("type", "Type", 1.5), M("amount", "Amount", 1.5), Pc("share_pct", "Share"), N("trips", "Trips"), M("avg_per_trip", "Avg / trip", 1.5)]), sec("by_bus", "BY BUS", []), sec("rows", "TRIP-WISE", [])] },
  "metro-bookings": { title: "Metro Bookings", bus: true, modes: true,
    note: "PNRs (all sources, OTAs included) confirmed or completed, by travel date, whose boarding or dropping point is a Metro feeder stage — the same stages metro billing reads. Revenue = booking amount. Pickup / Drop keeps PNRs with that metro leg; a PNR with both counts under either. Metro fare, Metro pax and Billed are the same figures as the Metro Feeder Statement: a metro leg is charged once the tracking link carrying its ticket was sent, at the ticket price where issued. A PNR with no link sent shows Not billed. PNRs cancelled after the link, or with a ticket on a stage not marked Metro, are listed too because they are charged.",
    metrics: [["Metro PNRs", "metro_pnrs", "number"], ["Seats", "seats", "number"], ["Revenue", "revenue", "money"], ["Billed metro legs", "billed_metro_legs", "number"], ["Metro pax", "metro_pax", "number"], ["Metro fare", "metro_fare", "money"], ["With metro pickup", "with_pickup", "number"], ["With metro drop", "with_drop", "number"], ["Both legs", "both_legs", "number"]],
    sections: [
      sec("pickup_points", "METRO PICKUP POINTS", [T("point", "Boarding point", 5), N("pnrs", "PNRs"), N("seats", "Seats"), M("revenue", "Revenue", 1.6)]),
      sec("drop_points", "METRO DROP POINTS", [T("point", "Dropping point", 5), N("pnrs", "PNRs"), N("seats", "Seats"), M("revenue", "Revenue", 1.6)]),
      sec("daily", "DAILY", [T("date", "Date", 2), N("pnrs", "PNRs"), N("seats", "Seats"), M("revenue", "Revenue", 1.6)]),
      sec("rows", "PNRS", [T("date", "Date", .9), T("service", "Service", .65), T("bus", "Bus", .95), T("pnr", "PNR", 1.6), T("source", "Source", .85), T("leg", "Metro", .8), T("boarding", "Boarding", 2), T("dropping", "Dropping", 1.8),
        N("seats", "Seats", .55), N("metro_pax", "Metro pax", .75), M("metro_fare", "Metro fare", .9), M("amount", "Revenue", 1)])] },
  "no-shows": { title: "No-shows", bus: true,
    note: "No-show = a seat marked NO-SHOW on the trip’s seat map, by travel date. Resold = that same seat sold again after the no-show was marked. Recovered = the fare of that resale. If a mark timestamp is missing, resale cannot be established.",
    metrics: [["No-shows", "no_shows", "number"], ["Fare", "fare", "money"], ["Seats resold", "seats_resold", "no_show_resale"], ["Recovered", "recovered", "money"]],
    sections: [sec("rows", "NO-SHOWS", [T("date", "Date", 1), T("service", "Service", .75), T("bus", "Bus", 1.15), T("pnr", "PNR", 1.9), T("passenger", "Passenger", 1.5), T("phone", "Phone", 1.15), T("boarding", "Boarding", 1.7),
      T("source", "Source", .8), T("seat", "Seat", .55), M("fare", "Fare", .85), T("resold_label", "Resold", .75), M("recovered", "Recovered", .95)])] },
  "van-bookings": { title: "Pickup Van Bookings", bus: true, modes: true,
    note: "PNRs (all sources, OTAs included) confirmed or completed, by travel date, whose boarding or dropping point is a Pickup Van feeder stage. Revenue = booking amount. Pickup / Drop keeps PNRs with that van leg; a PNR with both counts under either. Meets bus at = the exchange point where the van hands over to the main bus. Van = feeder vans assigned to the trip; a trip with two vans lists both since the booking does not say which van carried the passenger. Not assigned = no van on the trip.",
    metrics: [["Van PNRs", "van_pnrs", "number"], ["Seats", "seats", "number"], ["Revenue", "revenue", "money"], ["With van pickup", "with_pickup", "number"], ["Both legs", "both_legs", "number"], ["Vans used", "vans_used", "number"], ["PNRs without van", "pnrs_without_van", "number"]],
    sections: [sec("rows", "PNRS", [T("date", "Date", .9), T("service", "Service", .75), T("bus", "Bus", 1.05), T("van", "Van", 1), T("pnr", "PNR", 1.85), T("source", "Source", .85), T("leg", "Van leg", .85),
      T("boarding", "Boarding", 2.1), T("dropping", "Dropping", 2.1), N("seats", "Seats", .65), M("amount", "Revenue", 1.0)])] },
  "frequent-travellers": { title: "Frequent Travellers",
    metrics: [["Passengers", "passengers_label", "text"], ["Trips", "trips", "number"], ["Spend", "spend", "money"], ["Avg / trip", "avg_trip", "money"], ["Upcoming", "upcoming", "number"], ["Cancelled", "cancelled", "number"]],
    note: "Trips = confirmed or completed bookings in the period, all channels incl. imported bookings, by phone number.",
    sections: [
      sec("rows", "FREQUENT TRAVELLERS", [N("rank", "#", .45), T("passenger", "Passenger", 1.4), T("phone", "Phone", 1.1), N("trips", "Trips", .55), N("travelled", "Travelled", .78), N("upcoming", "Upcoming", .75), N("seats", "Seats", .58),
        M("spend", "Spend", 1), M("avg_trip", "Avg / trip", .9), N("cancelled", "Cancelled", .85), T("first_trip", "First trip", 1.05), T("last_trip", "Last trip", 1.05), T("channels", "Channels", 2.1), T("email", "Email", 1.6)]),
      sec("bands", "ALL PASSENGERS IN THE PERIOD BY TRIP COUNT", [T("band", "Trips", 2), N("passengers", "Passengers", 1.4), Pc("share_pct", "Share", 1.1), N("trips_taken", "Trips taken", 1.4), Pc("share_of_trips", "Share of trips", 1.4), M("spend", "Spend", 1.5)])] },
  "point-performance": { title: "Point Performance", needsPoint: true,
    metrics: [["PNRs", "pnrs", "number"], ["Seats", "seats", "number"], ["Share", "share_pct", "pct"], ["Trips booked", "trips_booked", "number"], ["Seats/trip", "seats_per_trip", "text"], ["Revenue", "revenue", "money"],
      ["Rank", "rank_label", "text"], ["Trips serving", "trips_serving", "number"], ["Cancelled", "cancelled", "number"], ["No-shows", "no_shows", "number"], ["On time", "on_time", "pct"]],
    note: "PNRs from every source (OTAs included), by travel date, at this point on any route — names match ignoring case and spaces. Confirmed / completed count as sold; Cancelled = cancelled after being confirmed (rate = of all confirmed PNRs). No-shows = seats marked NO-SHOW (rate = of seats sold). Share = the point’s seats ÷ all seats sold; Rank = by seats among all points of that kind. Trips = running trips that stop here, booked or not. On time = GPS arrival within 8 min of the stop’s time; trips without a GPS stamp are left out.",
    sections: [
      sec("ranking", "ALL POINTS", [N("rank", "#", .5), T("point", "Point", 4), N("pnrs", "PNRs", .75), N("seats", "Seats", .75), Pc("share_pct", "Share", .85), N("trips_booked", "Trips booked", 1.1), T("seats_per_trip", "Seats/trip", .95), M("revenue", "Revenue", 1.25)]),
      sec("by_service", "BY SCHEDULE", [T("service", "Service", 2), N("pnrs", "PNRs"), N("seats", "Seats"), N("trips_booked", "Trips booked"), T("seats_per_trip", "Seats/trip"), M("revenue", "Revenue", 1.5)]),
      sec("by_source", "BY BOOKING SOURCE", [T("source", "Source", 3), N("pnrs", "PNRs"), N("seats", "Seats"), M("revenue", "Revenue", 1.5)]),
      sec("daily", "DAILY", [T("date", "Date", 2), N("pnrs", "PNRs"), N("seats", "Seats"), M("revenue", "Revenue", 1.5), N("cancelled", "Cancelled"), N("no_shows", "No-shows")])] },
  "station-performance": { title: "Station Performance",
    metrics: [["Seats", "seats", "number"], ["PNRs", "pnrs", "number"], ["Revenue", "revenue", "money"], ["Avg fare / seat", "avg_fare", "money"], ["Station pairs sold", "station_pairs", "number"], ["Stations", "stations", "number"],
      ["Trips", "trips", "number"], ["Seats / trip", "seats_per_trip", "text"], ["End-to-end seats", "end_to_end_label", "text"], ["Cancelled", "cancelled_label", "text"], ["No-shows", "no_show_label", "text"]],
    note: "All sources, by travel date. Station = stop city. Trips serving = trips stopping at both. End-to-end = schedule start to end city.",
    sections: [
      sec("pairs", "STATION PAIRS", [T("from", "From", 1.45), T("to", "To", 1.45), N("pnrs", "PNRs", .7), N("seats", "Seats", .7), Pc("share_pct", "Share", .75), M("avg_fare", "Avg fare", .95), M("revenue", "Revenue", 1.2), N("trips_serving", "Trips serving", 1.15),
        N("trips_booked", "Trips booked", 1.15), T("seats_per_trip", "Seats/trip", 1), N("cancelled", "Cancelled", .95), N("no_shows", "No-shows", .85), N("schedules", "Schedules", .8)]),
      sec("boarding", "BOARDING STATIONS", [T("station", "Boarding station", 3), N("pnrs", "PNRs"), N("seats", "Seats"), Pc("share_pct", "Share"), M("avg_fare", "Avg fare"), M("revenue", "Revenue", 1.4), T("top_station", "Top destination", 1.8)]),
      sec("dropping", "DROPPING STATIONS", [T("station", "Dropping station", 3), N("pnrs", "PNRs"), N("seats", "Seats"), Pc("share_pct", "Share"), M("avg_fare", "Avg fare"), M("revenue", "Revenue", 1.4), T("top_station", "Top origin", 1.8)]),
      sec("by_schedule", "BY SCHEDULE", [T("service", "Service", .9), T("route", "Route", 2), T("dep", "Dep", .65), N("trips", "Trips", .65), N("pnrs", "PNRs", .7), N("seats", "Seats", .7), T("seats_per_trip", "Seats/trip", .95),
        M("avg_fare", "Avg fare", 1), M("revenue", "Revenue", 1.3), N("pairs", "Pairs", .55), T("top_pair", "Top pair", 1.8), Pc("end_to_end_pct", "End-to-end", 1)]),
      sec("by_schedule_pairs", "STATION PAIRS BY SCHEDULE", [T("service", "Service", 1), T("from", "From", 1.4), T("to", "To", 1.4), N("pnrs", "PNRs", .7), N("seats", "Seats", .7), M("avg_fare", "Avg fare", 1), M("revenue", "Revenue", 1.4),
        N("trips_serving", "Trips serving", 1.15), N("trips_booked", "Trips booked", 1.1), T("seats_per_trip", "Seats/trip", .9), N("cancelled", "Cancelled", .9), N("no_shows", "No-shows", .9)]),
      sec("sources", "BY BOOKING SOURCE", [T("source", "Source", 3), N("pnrs", "PNRs"), N("seats", "Seats"), Pc("share_pct", "Share"), M("avg_fare", "Avg fare"), M("revenue", "Revenue", 1.6)]),
      sec("daily", "DAILY", [T("date", "Date", 2), T("day", "Day", .8), N("trips", "Trips"), N("pnrs", "PNRs"), N("seats", "Seats"), N("end_to_end", "End-to-end", 1.2), M("revenue", "Revenue", 1.6), N("cancelled", "Cancelled")])] },
  "trip-pnl": { title: "Trip P&L / Occupancy",
    metrics: [["Trips", "trips", "number"], ["Occupancy", "occupancy_pct", "pct"], ["Net sales", "net_sales", "money"], ["Expense", "expense", "money"], ["Profit", "profit", "money"], ["Loss trips", "loss_trips", "number"]],
    note: "Net sales = own-channel ticket sales less offers, net of GST (as in Sales). A turned-off trip carries only its fixed cost.",
    sections: [sec("rows", "TRIP-WISE P&L", [T("date", "Date", 1.2), T("dep", "Dep", .8), T("service", "Service", 1), T("route", "Route", 2.2), T("bus", "Bus", 1.7), T("seats_label", "Seats", .85), Pc("occupancy_pct", "Occ", .8),
      M("net_sales", "Net sales", 1.3), M("expense", "Expense", 1.3), M("profit", "Profit", 1.3)])] },
};
const V22_KEYS = new Set(["frequent-travellers", "point-performance", "station-performance", "trip-pnl"]);

function sections(key: string, data: any): RSection[] {
  let out = DEF[key].sections.map((s) => ({ ...s, cols: s.cols.slice() }));
  if (key === "expenses") {
    const extra = (data?.top_categories || []).map((item: any) => M(item.key, item.label, 1.2));
    out = out.map((s) => s.key === "by_bus" ? { ...s, cols: [T("bus", "Bus", 1.3), T("trips_label", "Trips", 1.0), ...extra, M("other", "Other", 1.2), M("total", "Total", 1.4)] }
      : s.key === "rows" ? { ...s, cols: [T("date", "Date", 1), T("dep", "Dep", .65), T("service", "Service", .75), T("route", "Route", 1.6), T("bus", "Bus", 1.4), ...extra, M("other", "Other", 1.2), M("total", "Total", 1.4)] } : s);
  }
  if (key === "metro-bookings") {
    const mode = data?.mode || "both";
    if (mode === "pickup") out = out.filter((s) => s.key !== "drop_points");
    if (mode === "drop") out = out.filter((s) => s.key !== "pickup_points");
  }
  if (key === "point-performance") out = out.map((s) => s.key === "ranking" ? { ...s, title: "ALL " + (data?.mode === "drop" ? "DROP" : "PICKUP") + " POINTS", cols: s.cols.map((c) => c.key === "point" ? { ...c, label: data?.mode === "drop" ? "Drop point" : "Pickup point" } : c) } : s);
  if (key === "frequent-travellers") out = out.map((s) => s.key === "rows" ? { ...s, title: "FREQUENT TRAVELLERS — " + (data?.top === "all" ? "ALL" : "TOP " + (data?.top || "100")) + " OF " + Number(data?.summary?.passengers || 0).toLocaleString("en-IN") } : s);
  return out;
}

function rfmt(v: any, type: string): string {
  if (v === undefined || v === null || v === "") return "—";
  if (type === "number") return n0(v);
  if (type === "money") return rupee(v);
  if (type === "pct") return per(v);
  if (type === "ratio") return Number(v).toFixed(2);
  if (type === "minutes") return n0(v) + "m";
  if (type === "duration") { const m = Math.round(Number(v)); return m >= 60 ? Math.floor(m / 60) + "h " + (m % 60) + "m" : m + "m"; }
  if (type === "speed") return n0(v) + " km/h";
  if (type === "delta") return (Number(v) > 0 ? "+" : "") + Number(v).toFixed(1) + "%";
  return String(v);
}

function RTable({ section, data, limit, rowProps }: { section: RSection; data: any; limit?: number; rowProps?: (r: any, i: number) => Record<string, unknown> }) {
  const all: any[] = data.sections?.[section.key] || [], rows = limit !== undefined ? all.slice(0, limit) : all, totals = data.totals?.[section.key] || {}, cols = section.cols;
  const unit = cols.reduce((a, c) => a + (Number(c.width) || 1), 0);
  const cls = (c: RCol) => (c.type === "text" ? "" : "rpt21-num");
  return (
    <section className="rpt21-section" data-section={section.key}>
      <h3>{`${section.title} `}<span>· {rows.length}</span></h3>
      <div className="rpt21-scroll" tabIndex={0} aria-label={`${section.title} report table`}>
        <table className={`rpt21-table ${section.key}`} style={{ minWidth: `${Math.max(930, cols.length * 92)}px` }}>
          <colgroup>{cols.map((c) => <col key={c.key} style={{ width: `${((c.width / unit) * 100).toFixed(3)}%` }} />)}</colgroup>
          <thead><tr>{cols.map((c) => <th key={c.key} className={cls(c)}>{c.label}</th>)}</tr></thead>
          <tbody>{rows.length ? rows.map((x, i) => <tr key={i} {...(rowProps?.(x, i) ?? {})}>{cols.map((c) => <td key={c.key} className={cls(c)}>{rfmt(x[c.key], c.type)}</td>)}</tr>)
            : <tr><td className="rpt21-empty" colSpan={cols.length}>No data for this period</td></tr>}</tbody>
          <tfoot><tr>{cols.map((c, i) => { const v = totals[c.key]; return <td key={c.key} className={cls(c)}>{v !== undefined ? rfmt(v, c.type) : i === 0 ? `${rows.length} records` : " "}</td>; })}</tr></tfoot>
        </table>
      </div>
    </section>
  );
}

function Heading({ title, actions }: { title: string; actions: ReactNode }) {
  return (
    <>
      <div className="rpt21-heading"><a href="#/accounts/reports" className="rpt21-back"><Svg k="back" s={18} /> Reports</a><h1>{title}</h1></div>
      <div className="rpt21-actions">{actions}</div>
    </>
  );
}

function Filter({ name, label, icon, values, selected, needed, iconSize = 20, onChange }: { name: string; label: string; icon: string; values: { id: any; name: string }[]; selected: any; needed?: boolean; iconSize?: number; onChange: () => void }) {
  return (
    <label className={`rpt21-filter ${needed ? "rpt21-needed" : ""}`}><Svg k={icon} s={iconSize} />
      <select name={name} aria-label={label} defaultValue={String(selected ?? "")} onChange={onChange}>
        <option value="">{label}</option>{values.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select><Svg k="chevron" s={16} /></label>
  );
}
const DateBox = ({ name, value, label, onChange }: { name: string; value: string; label: string; onChange: () => void }) => (
  <label className="rpt21-date"><Svg k="calendar" s={21} /><input aria-label={label} type="date" name={name} defaultValue={value} required onChange={onChange} /></label>
);

// ---------------------------------------------------------------- v21 suite (report-suite-v21.js)
function SuiteV21({ k }: { k: string }) {
  const u = query(), def = DEF[k];
  const vals = { from: u.from || shift(todayIso(), -6), to: u.to || todayIso(), bus_id: u.bus_id || "", staff_id: u.staff_id || "", mode: u.mode || "both" };
  const st = useReport(`/accounts/reports/${k}?${qs(vals)}`, "/accounts/reports/v21/options");
  const root = useRef<HTMLDivElement>(null);
  if (!st) return <div className="ac10-loading">Loading Accounts…</div>;
  if ("error" in st) return <div className="rpt21-error">Unable to load {def.title}: {st.error}</div>;
  const { d, o } = st;
  const q = { from: d.from, to: d.to, bus_id: d.bus_id || "", staff_id: d.staff_id || "", mode: d.mode || "both" };
  const selected = Object.entries({ seven: preset("seven"), month: preset("month"), last: preset("last") }).find(([, v]) => q.from === v.from && q.to === v.to)?.[0] || "";
  const disabled = !!def.needsStaff && !d.staff;
  const nav = (over: Record<string, string> = {}) => {
    const get = (n: string) => root.current?.querySelector<HTMLInputElement>(`[name=${n}]`)?.value || "";
    const args = { from: get("from"), to: get("to"), bus_id: get("bus_id"), staff_id: get("staff_id"), mode: q.mode, ...over };
    if (!validRange(args.from, args.to)) return toast("Choose a valid start and end date", "bad");
    go(`#/accounts/reports/${k}?${qs(args)}`);
  };
  const metric = (m: [string, string, string]) => {
    const [, key, type] = m, s = d.summary || {}, v = s[key];
    if (type === "mileage") return v === null || v === undefined ? "—" : Number(v).toFixed(2) + " km/L";
    if (type === "recorded") return rfmt(s.trips_recorded, "number") + "/" + rfmt(s.trips, "number");
    if (type === "resale" || type === "no_show_resale") return rfmt(v, "number") + " (" + per(s.resale_pct) + ")";
    return rfmt(v, type);
  };
  return (
    <div className="rpt21-root" data-report-v21={k} ref={root}>
      <header className="rpt21-top">
        <Heading title={def.title} actions={<>
          <button data-v21="print" className="primary" disabled={disabled} onClick={() => window.print()}><Svg k="print" /> Print</button>
          <button data-v21="pdf" disabled={disabled} onClick={() => pdfUnavailable()}><Svg k="download" /> PDF</button>
          <button data-v21="share" disabled={disabled} onClick={() => share(def.title)}><Svg k="share" /> Share</button>
        </>} />
      </header>
      <div className="rpt21-controls">
        {def.modes && <div className="rpt21-modes" aria-label="Feeder leg">
          {([["both", "Pickup + Drop"], ["pickup", k === "metro-bookings" ? "Metro pickup" : "Van pickup"], ["drop", k === "metro-bookings" ? "Metro drop" : "Van drop"]] as const).map(([m, v]) => (
            <button key={m} data-v21="mode" data-mode={m} className={q.mode === m ? "selected" : ""} onClick={() => nav({ mode: m })}>{v}</button>
          ))}</div>}
        {(def.staff || def.needsStaff) && <Filter name="staff_id" label={def.needsStaff ? "Select driver / staff" : "All drivers / staff"} icon="user" needed={def.needsStaff}
          values={(o.staff || []).map((x: any) => ({ id: x.id, name: x.name + (x.role ? " · " + x.role : "") }))} selected={q.staff_id} onChange={() => nav()} />}
        {def.bus && <Filter name="bus_id" label="All buses" icon="bus" values={(o.buses || []).map((x: any) => ({ id: x.id, name: x.name }))} selected={q.bus_id} onChange={() => nav()} />}
        <DateBox name="from" value={q.from} label="Start date" onChange={() => nav()} /><DateBox name="to" value={q.to} label="End date" onChange={() => nav()} />
        <div className="rpt21-presets">{([["seven", "Last 7 days"], ["month", "This month"], ["last", "Last month"]] as const).map(([p, v]) => (
          <button key={p} data-v21="preset" data-preset={p} className={selected === p ? "selected" : ""} onClick={() => nav(preset(p))}>{v}</button>
        ))}</div>
      </div>
      <p className="rpt21-note">{def.note}</p>
      {disabled ? <div className="rpt21-select-empty">Select a driver or staff member to see their statement.</div> : <>
        <div className="rpt21-summary" role="group" aria-label={`${def.title} summary`}>
          {def.metrics.map((m) => <div key={m[1]} className="rpt21-stat"><span>{m[0]}</span><strong>{metric(m)}</strong></div>)}
        </div>
        {sections(k, d).map((s) => <RTable key={s.key} section={s} data={d} />)}
        <p className="rpt21-methodology">{d.methodology || ""}</p>
      </>}
    </div>
  );
}

// ---------------------------------------------------------------- v22 suite (report-suite-v22.js)
const months = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() + n); return isoDay(d); };
function preset22(k: string, customer: boolean) {
  const to = todayIso(), month = to.slice(0, 7) + "-01";
  if (customer) {
    if (k === "year") return { from: to.slice(0, 4) + "-01-01", to };
    if (k === "six") return { from: months(-6), to };
    if (k === "three") return { from: months(-3), to };
    if (k === "years3") return { from: shift(to, -1095), to };
    return { from: shift(to, -365), to };
  }
  if (k === "month") return { from: month, to };
  if (k === "last") { const t = shift(month, -1); return { from: t.slice(0, 7) + "-01", to: t }; }
  return { from: shift(to, -6), to };
}

function SuiteV22({ k }: { k: string }) {
  const u = query(), def = DEF[k], customer = k === "frequent-travellers";
  const base = customer ? preset22("year12", true) : preset22("seven", false);
  const params: Record<string, string> = { from: u.from || base.from, to: u.to || base.to };
  const dims = customer ? ["search", "min_trips", "max_trips", "sort", "top"] : k === "point-performance" ? ["mode", "point", "bus_id"] : k === "station-performance" ? ["schedule_id", "bus_id"] : ["staff_id", "bus_id"];
  for (const x of dims) if (u[x] !== undefined) params[x] = u[x];
  const st = useReport(`/accounts/reports/${k}?${new URLSearchParams(params)}`, "/accounts/reports/v22/options");
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(300);
  const debounce = useRef<number>(undefined);
  useEffect(() => {
    if (customer && sessionStorage.getItem("rpt22-refocus") === "1" && st && !("error" in st)) {
      sessionStorage.removeItem("rpt22-refocus");
      const f = root.current?.querySelector<HTMLInputElement>("[name=search]");
      if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); }
    }
  }, [st, customer]);
  if (!st) return <div className="ac10-loading">Loading Accounts…</div>;
  if ("error" in st) return <div className="rpt21-error">Unable to load {def.title}: {st.error}</div>;
  const { d, o } = st;
  const disabled = k === "point-performance" && !d.selected_point;
  const nav = (over: Record<string, string> = {}) => {
    const get = (n: string) => root.current?.querySelector<HTMLInputElement>(`[name=${n}]`)?.value ?? "";
    const from = over.from ?? get("from"), to = over.to ?? get("to");
    if (!validRange(from, to)) return toast("Choose a valid date range", "bad");
    const out: Record<string, string> = { from, to };
    if (customer) Object.assign(out, { search: get("search"), min_trips: get("min_trips"), max_trips: get("max_trips") || "any", sort: d.sort || "trips", top: d.top || "100" });
    if (k === "point-performance") Object.assign(out, { mode: d.mode || "pickup", point: get("point"), bus_id: get("bus_id") });
    if (k === "station-performance") Object.assign(out, { schedule_id: get("schedule_id"), bus_id: get("bus_id") });
    if (k === "trip-pnl") Object.assign(out, { staff_id: get("staff_id"), bus_id: get("bus_id") });
    Object.assign(out, over);
    go(`#/accounts/reports/${k}?${qs(out)}`);
  };
  const seg = (items: [string, string][], kind: string, sel: string, cls = "rpt21-presets", on: (v: string) => void) => (
    <div className={cls}>{items.map(([val, name]) => <button key={val} type="button" className={val === sel ? "selected" : ""} data-v22={kind} data-value={val} onClick={() => on(val)}>{name}</button>)}</div>
  );
  const range = () => {
    const v: [string, string][] = customer ? [["year12", "Last 12 months"], ["six", "Last 6 months"], ["three", "Last 3 months"], ["year", "This year"], ["years3", "Last 3 years"]] : [["seven", "Last 7 days"], ["month", "This month"], ["last", "Last month"]];
    const selected = v.find(([x]) => { const p = preset22(x, customer); return d.from === p.from && d.to === p.to; })?.[0] || "";
    return <><DateBox name="from" value={d.from} label="Start date" onChange={() => nav()} /><DateBox name="to" value={d.to} label="End date" onChange={() => nav()} />
      {seg(v, "preset", selected, undefined, (x) => nav(preset22(x, customer)))}</>;
  };
  const chooser = (name: string, label: string, icon: string, choices: { id: any; name: string }[], selected: any, highlight = false) =>
    <Filter name={name} label={label} icon={icon} iconSize={19} values={choices} selected={selected} needed={highlight} onChange={() => nav()} />;
  let controls: ReactNode;
  if (customer) controls = <>
    <div className="rpt22-filter-line rpt22-frequent-top">
      <label className="rpt22-search"><Svg k="search" s={19} /><input name="search" placeholder="Search name or phone" autoComplete="off" aria-label="Search name or phone" defaultValue={d.search}
        onChange={() => { window.clearTimeout(debounce.current); debounce.current = window.setTimeout(() => { sessionStorage.setItem("rpt22-refocus", "1"); nav(); }, 450); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); window.clearTimeout(debounce.current); nav(); } }} /></label>
      <span className="rpt22-trip-label">Trips</span><input className="rpt22-small" name="min_trips" aria-label="Minimum trips" type="number" min={1} max={10000} defaultValue={d.min_trips} onChange={() => nav()} />
      <span className="rpt22-trip-label">to</span><input className="rpt22-small" name="max_trips" aria-label="Maximum trips" type="number" min={1} max={10000} placeholder="any" defaultValue={d.max_trips ?? ""} onChange={() => nav()} />
      {seg([["trips", "Most trips"], ["spend", "Top spend"], ["recent", "Recent"]], "sort", d.sort, undefined, (v) => nav({ sort: v }))}
      {seg([["50", "Top 50"], ["100", "100"], ["500", "500"], ["1000", "1000"], ["all", "All"]], "top", d.top, undefined, (v) => nav({ top: v }))}
    </div>
    <div className="rpt22-filter-line rpt22-dates">{range()}</div></>;
  else if (k === "point-performance") {
    const sel = ["seven", "month", "last"].find((x) => { const p = preset22(x, false); return p.from === d.from && p.to === d.to; }) || "";
    controls = <>
      <div className="rpt22-filter-line">
        {seg([["pickup", "Pickup point"], ["drop", "Drop point"]], "mode", d.mode, "rpt21-modes", (v) => nav({ mode: v, point: "" }))}
        {chooser("point", d.mode === "pickup" ? "Select pickup point" : "Select drop point", "point", (d.points || []).map((x: any) => ({ id: x.key, name: x.point })), d.selected_point?.point_key || d.point, true)}
        {chooser("bus_id", "All buses", "bus", o.buses || [], d.bus_id)}
        <DateBox name="from" value={d.from} label="Start date" onChange={() => nav()} /><DateBox name="to" value={d.to} label="End date" onChange={() => nav()} />
      </div>
      <div className="rpt22-filter-line">{seg([["seven", "Last 7 days"], ["month", "This month"], ["last", "Last month"]], "preset", sel, undefined, (x) => nav(preset22(x, false)))}</div></>;
  } else if (k === "station-performance") controls = <div className="rpt22-filter-line">{chooser("schedule_id", "All schedules", "route", o.schedules || [], d.schedule_id)}{chooser("bus_id", "All buses", "bus", o.buses || [], d.bus_id)}{range()}</div>;
  else controls = <div className="rpt22-filter-line">{chooser("staff_id", "All drivers / staff", "user", (o.staff || []).map((x: any) => ({ id: x.id, name: x.name })), d.staff_id)}{chooser("bus_id", "All buses", "bus", o.buses || [], d.bus_id)}{range()}</div>;

  const display = (m: [string, string, string]) => {
    const v = d.summary?.[m[1]];
    if (v === undefined || v === null) return "—";
    if (m[2] === "money") return rupee(v);
    if (m[2] === "number") return n0(v);
    if (m[2] === "pct") return per(v);
    return String(v);
  };
  const pick = (key: string) => nav({ point: key });
  const defs = sections(k, d).filter((s) => k !== "point-performance" || s.key === "ranking" || d.selected_point);
  const actions = [["print", "Print", "print"], ["pdf", "PDF", "download"], ...(customer ? [["excel", "Excel", "excel"]] : []), ["share", "Share", "share"]] as [string, string, string][];
  return (
    <div className="rpt21-root rpt22-root" data-report-v22={k} ref={root}>
      <div className="rpt21-top">
        <Heading title={def.title} actions={actions.map(([a, label, icon], i) => (
          <button key={a} type="button" data-v22={a} className={i === 0 ? "primary" : ""} disabled={disabled}
            onClick={() => a === "print" ? window.print() : a === "share" ? share(def.title) : pdfUnavailable(a === "excel" ? "Excel" : "PDF")}><Svg k={icon} s={18} /> {label}</button>
        ))} />
      </div>
      <div className="rpt22-controls">{controls}</div>
      <p className="rpt21-note">{def.note}</p>
      {disabled && <p className="rpt22-pick-hint">Pick a {d.mode === "pickup" ? "pickup" : "drop"} point above, or click one below.</p>}
      {!disabled && <div className="rpt21-summary rpt22-summary">{def.metrics.map((m) => (
        <div key={m[1]} className="rpt21-stat"><span>{m[0] === "Trips" && k === "station-performance" ? `Trips (${d.summary.schedules} schedules)` : m[0]}</span><strong>{display(m)}</strong></div>
      ))}</div>}
      {defs.map((s) => {
        const rows: any[] = d.sections[s.key] || [];
        if (customer && s.key === "rows" && rows.length > visible) return (
          <Fragment key={s.key}>
            <RTable section={s} data={d} limit={visible} />
            <div className="rpt22-more" data-more-count={rows.length}>Showing {Math.min(visible, rows.length).toLocaleString("en-IN")} of {rows.length.toLocaleString("en-IN")} passengers
              <button type="button" data-v22="more" onClick={() => setVisible((v) => v + 250)}>Show next 250</button></div>
          </Fragment>
        );
        if (k === "point-performance" && s.key === "ranking") return <RTable key={s.key} section={s} data={d} rowProps={(r) => ({
          "data-point": r.point_key, className: `rpt22-pick-row${r.point_key === d.selected_point?.point_key ? " rpt22-chosen" : ""}`, tabIndex: 0, role: "button", "aria-label": `View ${r.point} performance`,
          onClick: () => pick(r.point_key), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(r.point_key); } },
        })} />;
        return <RTable key={s.key} section={s} data={d} />;
      })}
      {!disabled && <p className="rpt21-methodology">{d.methodology}</p>}
    </div>
  );
}
