import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api";
import { Modal, toast } from "../../components/ui/feedback";

// React port of legacy public/js/schedule-insights-v36.js: "Search services" modal, "Bus halts" overview and the
// occupancy/holiday calendar popover. Same si36-* markup so the vendored schedule-insights-v36.css renders it identically.
const PATH: Record<string, ReactNode> = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="2" /></>,
  send: <path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13" />,
  calendar: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M8 2v4m8-4v4M3 10h18" /></>,
  chevron: <path d="m6 9 6 6 6-6" />, left: <path d="m15 18-6-6 6-6" />, right: <path d="m9 18 6-6-6-6" />,
  swap: <path d="M4 8h16m-4-4 4 4-4 4M20 16H4m4-4-4 4 4 4" />, check: <path d="m5 12 5 5L20 7" />,
};
const Svg = ({ k, size = 21 }: { k: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATH[k]}</svg>
);
const pad = (x: number) => String(x).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateObj = (v: string) => { if (!/^\d{4}-\d\d-\d\d$/.test(v)) return null; const d = new Date(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10), 12); return iso(d) === v ? d : null; };
const addDay = (v: string, n: number) => { const d = dateObj(v); if (!d) return ""; d.setDate(d.getDate() + n); return iso(d); };
const todayIst = () => { const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const g = (k: string) => p.find((x) => x.type === k)?.value; return `${g("year")}-${g("month")}-${g("day")}`; };
const niceDate = (v: string) => dateObj(v)?.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) ?? v;
const monthNice = (m: string) => new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, 1, 12).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const nextMonth = (m: string, step: number) => iso(new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 + step, 1, 12)).slice(0, 7);

type City = { id: number; name: string };
export type ServiceSearch = { date: string; fromCityId: string; toCityId: string };

function CityDrop({ id, cities, value, open, onToggle, onPick }: { id: "origin" | "destination"; cities: City[]; value: string; open: boolean; onToggle: () => void; onPick: (v: string) => void }) {
  const [q, setQ] = useState("");
  const choices = [{ id: "", name: "All" }, ...cities.map((c) => ({ id: String(c.id), name: c.name }))];
  const chosen = choices.find((c) => c.id === value) ?? choices[0];
  const shown = choices.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()));
  return <>
    <button type="button" data-si36-toggle={id} className={`si36-select ${id}`} aria-haspopup="listbox" aria-expanded={open} onClick={onToggle}>
      <span data-si36-selected={id}>{chosen.name}</span><Svg k="chevron" size={18} />
    </button>
    <div className="si36-options" role="listbox" aria-label={id === "origin" ? "Origin" : "Destination"} data-si36-options={id} hidden={!open}>
      <label className="si36-option-search"><Svg k="search" size={17} />
        <input type="search" data-si36-find={id} placeholder="Search city" aria-label={`Search ${id} cities`} value={q} ref={(el) => { if (el && open) el.focus(); }}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && shown[0]) { e.preventDefault(); onPick(shown[0].id); } if (e.key === "Escape") { e.stopPropagation(); onToggle(); } }} />
      </label>
      <div className="si36-option-items">{shown.map((c) => (
        <button key={c.id} type="button" role="option" data-si36-option={id} aria-selected={c.id === value} onClick={() => onPick(c.id)}><span>{c.name}</span><Svg k="check" size={17} /></button>
      ))}</div>
    </div>
  </>;
}

export function SearchServicesModal({ date, onSearch, onClear, onClose }: { date: string; onSearch: (s: ServiceSearch) => void; onClear: (date: string) => void; onClose: () => void }) {
  const [cities, setCities] = useState<City[]>([]);
  const [st, setSt] = useState({ origin: "", destination: "", date: dateObj(date) ? date : todayIst() });
  const [openDrop, setOpenDrop] = useState<"origin" | "destination" | null>(null);
  useEffect(() => { api.cityList().then((r) => setCities(r.cities.filter((c) => c.name).map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name)))).catch(() => toast("Cities could not be loaded", "warn")); }, []);
  const t = todayIst(), d = dateObj(st.date)!;
  const rel = st.date === t ? "Today" : st.date === addDay(t, 1) ? "Tomorrow" : "Selected date";
  const submit = () => {
    if (st.origin && st.destination && st.origin === st.destination) { toast("Choose different origin and destination cities", "warn"); return; }
    onClose(); onSearch({ date: st.date, fromCityId: st.origin, toCityId: st.destination });
  };
  const end = (id: "origin" | "destination") => (
    <div className={`si36-end ${id}`}>
      <label><span className="si36-dot"></span><Svg k={id === "origin" ? "send" : "pin"} size={18} /> {id === "origin" ? "Origin" : "Destination"}</label>
      <CityDrop id={id} cities={cities} value={st[id]} open={openDrop === id} onToggle={() => setOpenDrop((o) => (o === id ? null : id))}
        onPick={(v) => { setSt((s) => ({ ...s, [id]: v })); setOpenDrop(null); }} />
    </div>
  );
  return (
    <Modal portal size="lg" className="si36-overlay si36-search-modal" onClose={onClose} title={<span className="si36-dialog-title"><Svg k="search" size={24} /> Search services</span>}>
      <div className="si36-search-content" onClick={(e) => { if (!(e.target as HTMLElement).closest(".si36-end")) setOpenDrop(null); }}>
        <div className="si36-pair">
          {end("origin")}
          <button type="button" className="si36-swap" data-si36-swap aria-label="Swap origin and destination" title="Swap origin and destination"
            onClick={() => { setSt((s) => ({ ...s, origin: s.destination, destination: s.origin })); setOpenDrop(null); }}><Svg k="swap" size={22} /></button>
          {end("destination")}
        </div>
        <div className="si36-date-label"><Svg k="calendar" size={19} /> Date</div>
        <div className="si36-date-line">
          <label className="si36-date-entry">
            <span className="si36-date-day"><small data-si36-month>{d.toLocaleDateString("en-IN", { month: "short" }).toUpperCase()}</small><strong data-si36-number>{d.getDate()}</strong></span>
            <span className="si36-date-info"><strong data-si36-long>{niceDate(st.date)}</strong><small data-si36-relative>{rel}</small></span>
            <span className="si36-chevron"><Svg k="chevron" size={18} /></span>
            <input type="date" data-si36-picker aria-label="Search service date" value={st.date} onChange={(e) => { if (dateObj(e.target.value)) setSt((s) => ({ ...s, date: e.target.value })); }} />
          </label>
          <button type="button" className={`si36-quick${rel === "Today" ? " active" : ""}`} data-si36-quick="0" onClick={() => setSt((s) => ({ ...s, date: t }))}>Today</button>
          <button type="button" className={`si36-quick${rel === "Tomorrow" ? " active" : ""}`} data-si36-quick="1" onClick={() => setSt((s) => ({ ...s, date: addDay(t, 1) }))}>Tomorrow</button>
        </div>
        <footer className="si36-search-actions">
          <button type="button" data-si36-all onClick={() => { onClose(); onClear(st.date); }}>Show all services</button>
          <button type="button" data-si36-submit onClick={submit}>Search</button>
        </footer>
      </div>
    </Modal>
  );
}

type HaltRow = { id: number; service_number: string; origin: string | null; destination: string | null; provider_evidence: boolean; from_date: string | null; to_date: string | null;
  trips: number | null; pins_to_move: number | null; times_to_change: number | null; fine: number | null; waiting: number };
type Halts = { data_status: string; routes: HaltRow[]; totals: { pins_to_move: number | null; times_to_change: number | null } };

export function BusHaltsModal({ onClose }: { onClose: () => void }) {
  const [days, setDays] = useState(15);
  const [data, setData] = useState<Halts>();
  const [err, setErr] = useState<string>();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true; setData(undefined); setErr(undefined);
    api.admin<Halts>(`/routes/halts-overview?days=${days}`).then((r) => live && setData(r)).catch((e) => live && setErr(e instanceof Error ? e.message : String(e)));
    return () => { live = false; };
  }, [days, tick]);
  const v = (x: number | null, ok: boolean) => (ok && x != null ? String(x) : "—");
  const range = (r: HaltRow) => (r.from_date && r.to_date ? `${niceDate(r.from_date).replace(/,\s*\d{4}$/, "")} to ${niceDate(r.to_date).replace(/,\s*\d{4}$/, "")}` : "Awaiting GPS evidence");
  const summary = err ? "Halt evidence could not be loaded." : !data ? "Loading verified halt evidence…"
    : data.data_status === "awaiting_verified_gps" ? "Verified GPS halt evidence is not yet connected. Stop corrections cannot be determined."
    : `${data.totals.pins_to_move} pins more than 50 m from the halt and ${data.totals.times_to_change} times off by 10 min or more, across ${data.routes.length} routes. A change is suggested once 3 trips agree.`;
  return (
    <Modal portal size="xl" className="si36-overlay si36-halts-modal" onClose={onClose}
      title={<div className="si36-halt-title"><strong>Bus halts</strong><small>Pickup and drop points against where the bus really halted, per route. Each route is one direction.</small></div>}>
      <div className="si36-halt-controls"><span>Last</span>
        <select aria-label="Halt evidence lookback" data-si36-days value={days} onChange={(e) => setDays(+e.target.value)}>{[7, 15, 30].map((d) => <option key={d} value={d}>{d} days</option>)}</select>
      </div>
      <p className="si36-halt-summary" data-si36-halt-summary role="status">{summary}</p>
      <div className="si36-halt-table-scroll"><table className="si36-halt-table">
        <thead><tr>{["ROUTE", "TRIPS", "PINS TO MOVE", "TIMES TO CHANGE", "FINE", "WAITING", ""].map((s, i) => <th key={i}>{s}</th>)}</tr></thead>
        <tbody>
          {err ? <tr><td colSpan={7} className="si36-halt-empty">{err} <button type="button" data-si36-halt-retry onClick={() => setTick((n) => n + 1)}>Retry</button></td></tr>
            : !data ? <tr><td colSpan={7} className="si36-halt-empty">Loading routes…</td></tr>
            : data.routes.length === 0 ? <tr><td colSpan={7} className="si36-halt-empty">No active routes found.</td></tr>
            : data.routes.map((r) => (
              <tr key={r.id}>
                <td><div className="si36-route-name"><strong>{r.service_number}</strong><small>{r.origin} → {r.destination} · {range(r)}</small></div></td>
                <td>{v(r.trips, r.provider_evidence)}</td>
                <td><span className="si36-count blue">{v(r.pins_to_move, r.provider_evidence)}</span></td>
                <td><span className="si36-count amber">{v(r.times_to_change, r.provider_evidence)}</span></td>
                <td>{v(r.fine, r.provider_evidence)}</td>
                <td>{r.waiting}</td>
                <td><a className="si36-open-route" href={`#/gds/routes/${r.id}?rvtab=pickups&rvmode=view`} data-si36-open-route onClick={onClose}>Open route</a></td>
              </tr>
            ))}
        </tbody>
      </table></div>
      <p className="si36-halt-footer">Waiting: stops with fewer than 3 agreeing GPS-verified trips. Only passenger pickup and drop stops count. Pin warnings: over 50 m; time warnings: over 10 minutes. Pin and time warnings may overlap.</p>
    </Modal>
  );
}

type MonthData = { daily: { date: string; booked_seats: number; capacity: number; services: number; percent: number | null }[];
  holidays: { date: string; name: string; kind: string; source_url: string }[]; holidays_verified_for_year: boolean };
const cache = new Map<string, MonthData>();

export function CalendarPopover({ date, anchor, onPick, onClose }: { date: string; anchor: HTMLElement | null; onPick: (d: string) => void; onClose: () => void }) {
  const selected = dateObj(date) ? date : todayIst();
  const [month, setMonth] = useState(selected.slice(0, 7));
  const [data, setData] = useState<MonthData>();
  const [err, setErr] = useState<string>();
  const [tick, setTick] = useState(0);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<React.CSSProperties>({});
  useEffect(() => {
    let live = true; setErr(undefined);
    const hit = cache.get(month); setData(hit);
    if (!hit) api.admin<MonthData>(`/schedules/month-insights?month=${month}`).then((r) => { cache.set(month, r); if (live) setData(r); })
      .catch((e) => live && setErr(e instanceof Error ? e.message : String(e)));
    return () => { live = false; };
  }, [month, tick]);
  useLayoutEffect(() => {
    const place = () => {
      if (!anchor?.isConnected) return;
      const r = anchor.getBoundingClientRect(), w = Math.min(440, innerWidth - 18), h = Math.min(690, innerHeight - 16);
      const below = innerHeight - r.bottom, above = r.top;
      setPos({ width: w, left: Math.max(9, Math.min(innerWidth - w - 9, r.right - w)), maxHeight: "calc(100dvh - 16px)",
        top: below >= Math.min(h, 500) || below >= above ? Math.min(r.bottom + 7, innerHeight - 100) : Math.max(8, r.top - h - 7) });
    };
    place(); addEventListener("resize", place); return () => removeEventListener("resize", place);
  }, [anchor, data]);
  useEffect(() => {
    const off = (e: MouseEvent) => { const t = e.target as Node; if (!pop.current?.contains(t) && !anchor?.contains(t)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const id = setTimeout(() => document.addEventListener("click", off, true), 0);
    document.addEventListener("keydown", esc);
    return () => { clearTimeout(id); document.removeEventListener("click", off, true); document.removeEventListener("keydown", esc); };
  }, [anchor, onClose]);
  const pick = (d: string) => { if (!dateObj(d)) return; onClose(); onPick(d); };
  let body: ReactNode;
  if (err) body = <div className="si36-cal-error">{err} <button data-si36-cal-retry onClick={() => { cache.delete(month); setTick((n) => n + 1); }}>Retry</button></div>;
  else if (!data) body = <div className="si36-cal-loading">Loading {monthNice(month)}…</div>;
  else {
    const y = +month.slice(0, 4), m = +month.slice(5, 7), n = new Date(y, m, 0).getDate(), offset = new Date(y, m - 1, 1).getDay();
    const items = new Map(data.daily.map((d) => [d.date, d])), t = todayIst();
    const cells: ReactNode[] = Array.from({ length: offset }, (_, i) => <span key={`p${i}`} aria-hidden="true" className="si36-cal-pad" />);
    for (let i = 1; i <= n; i++) {
      const d = `${month}-${pad(i)}`, it = items.get(d), p = it?.percent, has = p != null;
      const level = !has ? "unknown" : p >= 70 ? "good" : p >= 40 ? "mid" : "low";
      const fest = data.holidays.filter((x) => x.date === d).map((x) => x.name).join(", ");
      const tip = has ? `${it!.booked_seats} booked / ${it!.capacity} seats · ${p}% · ${it!.services} services` : "No scheduled seat inventory";
      cells.push(
        <button key={d} type="button" role="gridcell" className={`si36-cal-day ${level}${fest ? " holiday" : ""}${d === selected ? " selected" : ""}${d === t ? " today" : ""}`}
          data-si36-date={d} title={tip + (fest ? ` · ${fest}` : "")} aria-label={`${d}: ${tip}${fest ? `, ${fest}` : ""}`} onClick={() => pick(d)}>
          <span className="si36-cal-ring" style={{ ["--si36-pct" as string]: `${has ? p : 0}%` }}><b>{i}</b></span><small>{has ? `${p}%` : "—"}</small>
        </button>);
    }
    body = <>
      <header className="si36-cal-head">
        <button type="button" data-si36-cal-nav="-1" aria-label="Previous month" onClick={() => setMonth((x) => nextMonth(x, -1))}><Svg k="left" size={24} /></button>
        <h3>{monthNice(month)}</h3>
        <button type="button" data-si36-cal-nav="1" aria-label="Next month" onClick={() => setMonth((x) => nextMonth(x, 1))}><Svg k="right" size={24} /></button>
      </header>
      <div role="grid" aria-label="Monthly booked seat percentage">
        <div className="si36-cal-week">{["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((x) => <b key={x}>{x}</b>)}</div>
        <div className="si36-cal-grid">{cells}</div>
      </div>
      <div className="si36-cal-legend"><span className="si36-legend-green">●</span> ≥70% <span className="si36-legend-orange">●</span> 40–69%<span className="si36-legend-red">●</span> &lt;40% <span className="si36-legend-booked"></span> booked</div>
      <div className="si36-holiday-list">{data.holidays.length ? data.holidays.map((h) => (
        <button key={h.date + h.name} type="button" data-si36-holiday={h.date} title={`${h.kind} · ${h.source_url}`} className="si36-holiday-item" onClick={() => pick(h.date)}>
          <span>{+h.date.slice(-2)}</span><b>{h.name}</b><small>{h.kind === "gazetted" ? "Govt holiday" : h.kind === "restricted" ? "Restricted" : "Observance"}</small>
        </button>
      )) : <p className="si36-noholidays">{data.holidays_verified_for_year ? "No listed government holidays or observances this month." : "Verified government holiday data is unavailable for this year."}</p>}</div>
      <p className="si36-cal-foot">Occupancy = booked passenger seats ÷ scheduled capacity. Data is from this GDS. Holiday dates vary by state; observances are not automatically public holidays.</p>
    </>;
  }
  return createPortal(<div ref={pop} className="si36-calendar-pop" role="dialog" aria-label="Schedule occupancy calendar" style={pos}><div data-si36-cal-body>{body}</div></div>, document.body);
}
