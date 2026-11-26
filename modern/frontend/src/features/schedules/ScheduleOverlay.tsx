import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PnlTab, pnlConfirmLeave } from "./SchedulePnlTab";
import { api, type ScheduleDetail, type ScheduleRow, type ScheduleStage } from "../../api";
import { toast, toastError } from "../../components/ui/feedback";
import { inr, shortDate, t12 } from "../../services/format";
import { DispatchPanel } from "../../Operations";

// React port of the legacy schedule management overlay (public/js/schedules-screenshot-v6.js: openModal(), tabs, bt(),
// previewNote()). Same DOM/classes so the vendored legacy CSS renders it identically. Data comes from
// GET /api/admin/schedule-detail/{id}; controls the backend does not support yet are aria-disabled + explain via toast.
const P = {
  bus: "M4 17V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11M4 13h16M4 17h16M7 17v3m10-3v3M7 9h2m6 0h2",
  map: "M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15",
  users: "M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m13-15a4 4 0 0 1 0 8m7 7v-2a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  pin: "M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Zm-8 2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  phone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.5 3a2 2 0 0 1-.6 1.7L7.3 10a16 16 0 0 0 6.7 6.7l1.6-1.7a2 2 0 0 1 1.7-.6l3 .5a2 2 0 0 1 1.7 2Z",
  x: "M18 6 6 18M6 6l12 12", check: "M20 6 9 17l-5-5", plus: "M12 5v14M5 12h14", trash: "M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v6m4-6v6",
  edit: "M12 20h9M16 3a2 2 0 0 1 3 3L7 18l-4 1 1-4L16 3Z", shield: "M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z",
  history: "M3 12a9 9 0 1 0 3-6.7M3 3v5h5m4-1v5l3 2", clock: "M12 6v6l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  save: "M5 3h12l4 4v14H3V3h2Zm2 0v6h10V3M7 21v-9h10v9",
  arrowUp: "M12 19V5m-6 6 6-6 6 6", arrowDown: "M12 5v14m-6-6 6 6 6-6",
  link: "M10 13a5 5 0 0 0 7 .3l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7-.3l-3 3a5 5 0 0 0 7 7l1.5-1.5",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm9-3-2.2-1 .2-2.4-2.4-2.4-2.4.2L12 4l-2.2 2.4-2.4-.2L5 8.6l.2 2.4L3 12l2.2 1-.2 2.4L7.4 18l2.4-.2L12 20l2.2-2.2 2.4.2 2.4-2.4-.2-2.4Z",
  rupee: "M7 5h11M7 9h11m-9-4a5 5 0 0 1 0 10l7 5", chart: "M3 3v18h18M8 17v-5m5 5V7m5 10v-8",
} as const;
type IconName = keyof typeof P;
function I({ name, size = 16 }: { name: IconName; size?: number }) {
  return <svg className="sx-svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[name]} /></svg>;
}

const PREVIEW = "This control is preview-only: the backend does not support editing it yet, so nothing was changed.";
const preview = (what: string) => toast(`${what}: ${PREVIEW}`);
/** legacy bt(): <button type=button class="sx-btn {cls}">svg<span>label</span></button> */
function Bt({ icon, label, cls = "", onClick, disabled, attrs }: { icon: IconName; label: string; cls?: string; onClick?: () => void; disabled?: boolean; attrs?: Record<string, string> }) {
  return (
    <button type="button" className={`sx-btn ${cls}`} aria-disabled={disabled || undefined} {...attrs}
      onClick={() => (disabled ? preview(label) : onClick?.())}>
      <I name={icon} /><span>{label}</span>
    </button>
  );
}
function PreviewNote({ children = "Interface preview only — no live provider or OTA changes are submitted." }: { children?: ReactNode }) {
  return <div className="sx-preview-note"><I name="shield" size={15} /> {children}</div>;
}

const TABS: [string, IconName, string][] = [
  ["bookings", "users", "Bookings"], ["block", "shield", "Block"], ["update", "settings", "Update"], ["cities", "pin", "Cities"],
  ["pickups", "arrowUp", "Pickups"], ["drops", "arrowDown", "Drops"], ["fares", "rupee", "Fares"], ["pnl", "chart", "P&L"], ["history", "history", "History"],
];
const OPERATIONAL = new Set(["bookings", "block", "update"]);
/** legacy fdt: 23 Nov, 07:36 pm */
const fdt = (s: string) => new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export function ScheduleOverlay({ row, tab: initialTab, onClose: close }: { row: ScheduleRow; tab: string; onClose: () => void }) {
  const [tab, setTabRaw] = useState(TABS.some(([k]) => k === initialTab) ? initialTab : "bookings");
  const modal = useRef<HTMLDivElement>(null);
  const [min, setMin] = useState(false);
  // legacy handleOverlayClick: leaving the P&L tab (tab switch or close) confirms before discarding unsaved expenses
  const leave = async () => tab !== "pnl" || (await pnlConfirmLeave());
  const setTab = (k: string) => { void leave().then((ok) => ok && setTabRaw(k)); };
  const onClose = () => { void leave().then((ok) => ok && close()); };
  const [detail, setDetail] = useState<ScheduleDetail>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let live = true;
    api.scheduleDetail(row.id).then((d) => live && setDetail(d)).catch((e) => { if (live) { setError(String(e?.message ?? e)); toastError(e); } });
    return () => { live = false; };
  }, [row.id]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key); window.addEventListener("hashchange", onClose);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("hashchange", onClose); };
  }, [onClose]);

  let body: ReactNode;
  if (OPERATIONAL.has(tab)) body = (
    <div data-testid="schedule-workspace" data-tab={tab}>
      <DispatchPanel initial={{ date: row.travelDate, tripId: row.id }} />
    </div>
  );
  else if (error) body = <div className="sx-empty">{error}</div>;
  else if (!detail) body = <div className="sx-loading">Loading schedule…</div>;
  else if (tab === "history") body = <HistoryTab d={detail} />;
  else if (tab === "pickups" || tab === "drops") body = <StopsTab key={tab} d={detail} kind={tab === "pickups" ? "pickup" : "drop"} />;
  else if (tab === "cities") body = <CitiesTab d={detail} />;
  else if (tab === "pnl") body = <PnlTab sid={row.id} overlay={modal} />;
  else body = (
    <div className="sx-empty" aria-disabled="true">
      {tab === "fares" ? "Seat-wise fare editing" : "Trip P&L"} is not available yet: the backend has no {tab === "fares" ? "per-trip fare override" : "trip expense ledger"} API, so no figures are shown rather than estimated ones.
    </div>
  );

  return (
    <div className={`sx-backdrop sx38-workspace${min ? " sx-minimized" : ""}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sx-modal${tab === "pnl" ? " sxp-active" : ""}`} role="dialog" aria-modal="true" aria-label="Schedule management" ref={modal}
        onClick={(e) => { if (tab === "pnl" && (e.target as Element).closest(".sx-modal-footer [data-sx-close]")) onClose(); }}>
        <header data-sx-modal-head="">
          {tab === "pnl" ? <>
            <div className="sx-head-identity"><div><h2>Schedule <small>{row.serviceNumber} - {row.serviceName || `${row.origin} ${row.destination}`}</small></h2></div></div>
            <div className="sx-head-actions"><button type="button" data-sx-minimize="" title="Minimize" onClick={() => setMin((m) => !m)}>−</button><button type="button" data-sx-close="" title="Close schedule" onClick={onClose}><I name="x" size={26} /></button></div>
          </> : <>
          <div className="sx-head-identity">
            <span className="sx-head-logo"><I name="bus" size={23} /></span>
            <div><h2>{row.serviceNumber} <small>{row.serviceName}</small></h2><p>{row.origin} → {row.destination} <span>• {shortDate(row.travelDate)}</span></p></div>
          </div>
          <div className="sx-head-actions"><button className="sx-close-round" data-sx-close="" title="Close schedule" onClick={onClose}><I name="x" /></button></div>
          </>}
        </header>
        <nav data-sx-modal-tabs="">
          {TABS.map(([k, icon, label]) => (
            <button key={k} data-sx-tab={k} className={k === tab ? "on" : ""} onClick={() => setTab(k)}><I name={icon} size={14} /> {label}</button>
          ))}
        </nav>
        <main data-sx-modal-body="">{body}</main>
        {tab === "pnl" ? <footer key="pnl" className="sx-modal-footer" /> : <footer key="std" className="sx-modal-footer">
          <span data-sx-footer-info="" className="sx-muted">Operator data shown where available · unsupported controls are preview-only</span>
          <div>
            {OPERATIONAL.has(tab)
              ? <Bt icon="x" label="Close" cls="primary" attrs={{ "data-sx-close": "" }} onClick={onClose} />
              : <><Bt icon="x" label="Close" attrs={{ "data-sx-close": "" }} onClick={onClose} /><Bt icon="check" label="Save changes" cls="primary" attrs={{ "data-sx-save": "" }} disabled /></>}
          </div>
        </footer>}
      </div>
    </div>
  );
}

function HistoryTab({ d }: { d: ScheduleDetail }) {
  const [q, setQ] = useState("");
  const route = `${d.origin} → ${d.destination}`;
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? d.history.filter((h) => [h.pnr, h.seats.join(" "), route, h.contactName].join(" ").toLowerCase().includes(n)) : d.history;
  }, [d.history, q, route]);
  const count = (s: string) => d.history.filter((h) => h.status === s).length;
  return (
    <section className="sx-history-ui">
      <header>
        <h3><I name="history" /> Schedule history</h3>
        <input data-sx-historysearch="" placeholder="Search PNR, seat, city or name" value={q} onChange={(e) => setQ(e.target.value)} />
        <Bt icon="history" label="Edit history" attrs={{ "data-sx-edithistory": "" }} disabled />
      </header>
      <div className="sx-timeline-badges"><span>All {d.history.length}</span><span>Bookings {count("confirmed")}</span><span>Holds 0</span><span>Cancelled {count("cancelled")}</span></div>
      <div className="sx-table-outer"><table className="sx-table">
        <thead><tr>{["PNR", "ROUTE", "SEATS", "FARE", "BOOKED BY", "SOURCE", "BOOKED ON", "STATUS"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.pnr}>
              <td><button data-sx-pnr={h.pnr} className="sx-link" onClick={() => { location.hash = `#/bookings?q=${encodeURIComponent(h.pnr)}`; }}>{h.pnr}</button></td>
              <td>{route}</td><td>{h.seats.join(", ")}</td><td>{inr(h.totalAmount)}</td><td>{h.contactName}</td><td>{h.source}</td><td>{fdt(h.bookedAt)}</td><td>{h.status}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={8} className="sx-empty">No bookings yet</td></tr>}
        </tbody>
      </table></div>
    </section>
  );
}

function StopsTab({ d, kind }: { d: ScheduleDetail; kind: "pickup" | "drop" }) {
  const stages = useMemo(() => d.stages.filter((s) => s.kind === kind).sort((a, b) => a.day - b.day || a.time.localeCompare(b.time)), [d.stages, kind]);
  const cities = useMemo(() => [...new Set(stages.map((s) => s.city))], [stages]);
  const [city, setCity] = useState(cities[0]);
  const shown = stages.filter((s) => s.city === city);
  return (
    <div className="sx-stops-ui">
      <div className="sx-stop-header">
        <div><small><I name="link" size={11} /> Data Source: Route</small><h3>{kind === "pickup" ? "Pickup Points" : "Drop-off Points"}</h3></div>
        <Bt icon="edit" label="Edit" cls="outline" attrs={{ "data-sx-editstops": "" }} disabled />
      </div>
      <div className="sx-stop-cities">
        {cities.map((c) => <button key={c} data-sx-stopcity={c} className={c === city ? "on" : ""} onClick={() => setCity(c)}>{c} <small>{stages.filter((s) => s.city === c).length}</small></button>)}
      </div>
      <div className="sx-stop-cards">
        {shown.map((s, i) => <StopCard key={s.id} s={s} n={i + 1} />)}
        {!shown.length && <div className="sx-empty">No {kind} stops for this city.</div>}
      </div>
      <PreviewNote>Stop pin and arrival-time corrections need verified GPS halt evidence. Changes in this screen remain preview-only.</PreviewNote>
    </div>
  );
}

function StopCard({ s, n }: { s: ScheduleStage; n: number }) {
  const metro = s.pickupType?.toLowerCase() === "metro" || /metro/i.test(s.name);
  return (
    <article className="sx-stop-card">
      <span className="sx-stop-time">{t12(s.time)} {s.day > 1 && <small>DAY {s.day}</small>}</span>
      <div className="sx-stop-content">
        <div className="sx-stop-name"><span className="sx-circle">{n}</span><b>{s.name}</b></div>
        {metro && <span className="sx-metro"><I name="bus" size={13} /> Free metro Pickup</span>}
        <p>{s.landmark || s.address || ""}</p>
        <span className="sx-stop-type"><I name="pin" size={14} />{` ${s.pickupType || "Bus Stop"}`}</span>
        {s.contactNumber && <a href={`tel:${s.contactNumber}`} className="sx-stop-phone"><I name="phone" size={13} />{` ${s.contactNumber}`}</a>}
        {s.lat != null && s.lng != null && <a href={`https://www.google.com/maps?q=${s.lat},${s.lng}`} target="_blank" rel="noopener" className="sx-stop-coords"><I name="pin" size={13} />{` ${s.lat}, ${s.lng}`}</a>}
        <div className="sx-stop-count"><span>{s.passengers} passengers</span><Bt icon="edit" label="Edit" cls="mini" attrs={{ "data-sx-editstop": String(s.id) }} disabled /></div>
      </div>
    </article>
  );
}

function CitiesTab({ d }: { d: ScheduleDetail }) {
  const [dir, setDir] = useState<"Delay" | "Advance">("Delay");
  const cities = d.stops;
  const first = cities[0], last = cities[cities.length - 1];
  const pairs = cities.flatMap((a, i) => cities.slice(i + 1).map((b) => [a, b] as const));
  return (
    <div className="sx-cities-editor sx48-cities">
      <div className="sx-source-chip"><I name="link" /> Data Source: Route</div>
      <div className="sx-time-shift sx48-adjust">
        <b>Adjust Trip Time</b>
        <div className="sx-segment">{(["Delay", "Advance"] as const).map((k) => <button key={k} data-sx-shift-direction={k} className={dir === k ? "active" : ""} onClick={() => setDir(k)}>{k}</button>)}</div>
        <label><input type="number" name="delay_hr" defaultValue="0" min="0" max="12" aria-label="Delay hours" /><span>h</span></label>
        <label><input type="number" name="delay_min" defaultValue="00" min="0" max="59" aria-label="Delay minutes" /><span>m</span></label>
        <Bt icon="clock" label={dir === "Delay" ? "Apply delay" : "Apply advance"} cls="primary" attrs={{ "data-sx-applydelay": "" }} disabled />
        <p>Applies as soon as you press it — it does not wait for Save. Only unreached stops will move. Changes to the route template are not made.</p>
      </div>
      <div className="sx-two-card sx48-city-endpoints">
        <div className="sx-origin"><span className="sx48-city-symbol"><I name="pin" size={24} /></span><div><small>ORIGIN</small><h3>{d.origin}</h3><p>{first?.state ?? ""} <span className="sx48-daychip">Day {first?.day ?? 1} · {t12(d.departureTime)}</span></p></div></div>
        <div className="sx-destination"><span className="sx48-city-symbol"><I name="pin" size={24} /></span><div><small>DESTINATION</small><h3>{d.destination}</h3><p>{last?.state ?? ""} <span className="sx48-daychip">Day {last?.day ?? d.arrivalDay} · {t12(d.arrivalTime)}</span></p></div></div>
      </div>
      <section className="sx-light-card">
        <header><b><I name="pin" /> Via Cities <span>{Math.max(0, cities.length - 2)}</span></b></header>
        <div className="sx-table-outer"><table className="sx-table">
          <thead><tr>{["STATE", "CITY", "DAY", "TIME", "ORIGIN", "DESTINATION"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {cities.slice(1, -1).map((c) => (
              <tr key={c.cityId}>
                <td>{c.state || "—"}</td><td><I name="pin" size={12} />{` ${c.name}`}</td><td><span className="sx-pill">{c.day || 2}</span></td><td>{t12(c.time)}</td>
                {(["origin", "destination"] as const).map((k) => <td key={k}><label className="sx-switch sx-small"><input data-sx-via={`${c.cityId}|${k}`} type="checkbox" checked readOnly aria-disabled="true" onClick={(e) => { e.preventDefault(); preview("Via-city toggle"); }} /><span></span></label></td>)}
              </tr>
            ))}
            {cities.length <= 2 && <tr><td colSpan={6} className="sx-empty">No via cities</td></tr>}
          </tbody>
        </table></div>
      </section>
      <section className="sx-light-card sx48-route-pairs">
        <header><b><I name="map" /> Routes <span className="sx48-combination-count">{pairs.length} city pairs</span></b><button data-sx-add-subroute="" aria-disabled="true" onClick={() => preview("Add sub-route")}><I name="plus" /> Add sub-route</button></header>
        <div className="sx-table-outer"><table className="sx-table">
          <thead><tr>{["ROUTE / SLOT ID", "ORIGIN → DESTINATION", "TIMING", "FARE %", "ACTIONS"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {pairs.map(([a, b], i) => (
              <tr key={`${a.cityId}-${b.cityId}`}>
                <td><small>{i === 0 ? d.routeId : "—"}</small><span className="sx48-route-kind">{i === 0 ? "MAIN-ROUTE" : "SUB-ROUTE · preview"}</span></td>
                <td>{a.name} → {b.name}</td>
                <td><span className="sx-pill">{t12(a.time || d.departureTime)} → {t12(b.time || d.arrivalTime)}</span></td>
                <td><input className="sx-short" type="number" data-sx-subrate={i} defaultValue={i === 0 ? 100 : 99} min="0" max="100" readOnly aria-disabled="true" /></td>
                <td>{i === 0 ? "—" : <button data-sx-remove-subroute={i} aria-disabled="true" onClick={() => preview("Remove sub-route")}><I name="trash" /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </section>
      <PreviewNote>Via-city toggles and proposed fare percentages are saved as schedule preferences only. Published city-pair routes and fares must be managed in authorized Routes/Fares workflows. No synthetic sub-route ID is published.</PreviewNote>
    </div>
  );
}
