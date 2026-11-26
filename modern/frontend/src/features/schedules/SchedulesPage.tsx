import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type Me, type ScheduleRow } from "../../api";
import { confirmDialog, toast, toastError } from "../../components/ui/feedback";
import { addDays, inr, shortDate, t12, today } from "../../services/format";
import { ScheduleOverlay } from "./ScheduleOverlay";

// React port of the legacy GDS → Schedules list (public/js/schedules-screenshot-v6.js: dates(), top(), drawList(),
// handleRootClick()). Same DOM, class names and SVG paths, so the vendored legacy CSS renders it identically.
const P = {
  chevronLeft: "m15 18-6-6 6-6", chevronRight: "m9 18 6-6-6-6", search: "m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  calendar: "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z", x: "M18 6 6 18M6 6l12 12",
  check: "M20 6 9 17l-5-5", star: "m12 2 3.2 6.7 7.3 1.1-5.3 5.3 1.3 7.5-6.5-3.5-6.5 3.5 1.3-7.5L1.7 9.8 9 8.7 12 2Z",
  arrowDown: "M12 5v14m-6-6 6 6 6-6", trash: "M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v6m4-6v6",
} as const;
function I({ name, size = 16 }: { name: keyof typeof P; size?: number }) {
  return <svg className="sx-svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[name]} /></svg>;
}

type SortKey = "service" | "departure" | "arrival" | "collection";
const HEADS: [SortKey | "", string][] = [["service", "SERVICE"], ["departure", "DEPARTURE"], ["arrival", "ARRIVAL"], ["", "FARES (₹)"], ["collection", "COLLECTION"], ["", "DETAILS"], ["", "STATUS"], ["", "ACTIONS"]];
const OPS = ["owner", "admin", "ops"];

export function SchedulesPage({ me }: { me: Me }) {
  const canOperate = OPS.includes(me.role);
  const [start, setStart] = useState(today);          // first day of the 7-day strip (legacy S.date)
  const [selected, setSelected] = useState(today);    // legacy S.selectedDate
  const [list, setList] = useState<ScheduleRow[]>();
  const [error, setError] = useState<string>();
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [jump, setJump] = useState(selected);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "departure", dir: 1 });
  const [workspace, setWorkspace] = useState<{ row: ScheduleRow; tab: string }>();
  const closeWorkspace = useCallback(() => { setWorkspace(undefined); void refreshRef.current(); }, []);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++seq.current; // a slower, older response must never overwrite a newer week
    try { const d = await api.schedules(start, addDays(start, 6)); if (mine === seq.current) { setList(d.schedules); setError(undefined); } }
    catch (e) { if (mine === seq.current) setError(e instanceof Error ? e.message : String(e)); }
  }, [start]);
  useEffect(() => { void refresh(); }, [refresh]);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const goTo = (d: string) => { setStart(d); setSelected(d); setJump(d); setCalOpen(false); };
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const value = (s: ScheduleRow) => (sort.key === "service" ? s.serviceNumber : sort.key === "arrival" ? s.arrivalTime ?? "" : sort.key === "collection" ? s.sale ?? 0 : s.departureTime);
    return (list ?? []).filter((s) => s.travelDate === selected && (!q || [s.serviceNumber, s.serviceName, s.origin, s.destination, s.coach].join(" ").toLowerCase().includes(q)))
      .sort((a, b) => { const av = value(a), bv = value(b); return (typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), "en", { numeric: true })) * sort.dir; });
  }, [list, selected, search, sort]);

  const toggle = async (s: ScheduleRow) => {
    if (!canOperate) return;
    const next = !(s.status === "active" && s.bookable);
    if (!(await confirmDialog(`${next ? "Activate" : "Disable"} ${s.serviceNumber} on ${shortDate(s.travelDate)}?`, { ok: next ? "Activate" : "Disable", danger: !next }))) return;
    try { await api.toggleSchedule(s.id, next); toast("Schedule status updated", "ok"); await refresh(); } catch (e) { toastError(e); }
  };

  const remove = async (s: ScheduleRow) => {
    if (!canOperate) return;
    if (!(await confirmDialog(`Delete schedule ${s.serviceNumber} on ${shortDate(s.travelDate)}? Confirmed bookings must be cancelled or shifted first.`, { ok: "Delete schedule", danger: true }))) return;
    try { await api.admin(`/schedules/${s.id}`, "DELETE"); toast("Schedule deleted", "ok"); await refresh(); } catch (e) { toastError(e); }
  };

  const strip = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const nice = (d: string) => { const dt = new Date(`${d}T12:00:00`); return [dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), dt.toLocaleDateString("en-GB", { weekday: "short" })]; };

  return (
    <div className="sx-schedules" data-screenshot-version="2026-11-21-routes-schedules-v7">
      <div className="sx-main">
        <div className="sx-date-controls">
          <div className="sx-date-strip">
            <button data-sx-prev className="sx-iconbtn" aria-label="Previous seven days" onClick={() => goTo(addDays(start, -7))}><I name="chevronLeft" /></button>
            {strip.map((d) => (
              <button key={d} data-sx-date={d} className={selected === d ? "on" : ""} aria-pressed={selected === d} onClick={() => setSelected(d)}><b>{nice(d)[0]}</b><small>{nice(d)[1]}</small></button>
            ))}
            <button data-sx-next className="sx-iconbtn" aria-label="Next seven days" onClick={() => goTo(addDays(start, 7))}><I name="chevronRight" /></button>
            <button className="sx-iconbtn" data-sx-find title="Search schedules" aria-label="Search schedules" aria-expanded={searchOpen} onClick={() => setSearchOpen((o) => !o)}><I name="search" /></button>
            <button className="sx-iconbtn sx-calendar" data-sx-today title="Choose schedule date" aria-label="Open date picker" aria-expanded={calOpen} onClick={() => setCalOpen((o) => !o)}><I name="calendar" /></button>
          </div>
          <div className="sx-searchbox" data-sx-searchbox hidden={!searchOpen}>
            <I name="search" /><input data-sx-query placeholder="Search service, route, vehicle" aria-label="Search schedules" value={search} onChange={(e) => setSearch(e.target.value)} ref={(el) => { if (el && searchOpen) el.focus(); }} />
            <button className="sx-iconbtn" data-sx-find aria-label="Close search" onClick={() => { setSearch(""); setSearchOpen(false); }}><I name="x" /></button>
          </div>
          <div className="sx-calendar-popup" data-sx-calendar-popup hidden={!calOpen}>
            <label>Go to date <input type="date" value={jump} data-sx-jump-date onChange={(e) => setJump(e.target.value)} /></label>
            <button type="button" data-sx-jump-go onClick={() => (/^\d{4}-\d{2}-\d{2}$/.test(jump) ? goTo(jump) : toast("Choose a date", "warn"))}>Go</button>
            <button type="button" data-sx-jump-today onClick={() => goTo(today())}>Today</button>
          </div>
        </div>
        <div data-sx-list>
          {error ? (
            <div className="sx-empty" role="alert">Unable to load schedules: {error} <button data-sx-retry onClick={() => void refresh()}>Retry</button></div>
          ) : !list ? (
            <div className="sx-empty">Loading…</div>
          ) : (
            <div className="sx-grid-scroll">
              <table className="sx-main-table">
                <thead><tr>{HEADS.map(([key, label]) => (
                  <th key={label}>{key ? (
                    <button type="button" className="sx-sort-head" data-sx-sort={key} aria-label={`Sort by ${label}`} aria-pressed={sort.key === key}
                      onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : 1 }))}>{label} {sort.key === key ? (sort.dir === 1 ? "↑" : "↓") : "⇅"}</button>
                  ) : label}</th>
                ))}</tr></thead>
                <tbody>
                  {rows.map((s) => <Row key={s.id} s={s} canOperate={canOperate} onToggle={() => void toggle(s)} onDelete={() => void remove(s)} onOpen={(tab) => setWorkspace({ row: s, tab })} />)}
                  {rows.length === 0 && <tr><td colSpan={8} className="sx-empty">No schedules on {shortDate(selected)}. Choose another date or adjust search.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {workspace && (
        <ScheduleOverlay row={workspace.row} tab={workspace.tab} onClose={closeWorkspace} />
      )}
    </div>
  );
}

function Row({ s, canOperate, onToggle, onDelete, onOpen }: { s: ScheduleRow; canOperate: boolean; onToggle: () => void; onDelete: () => void; onOpen: (tab: string) => void }) {
  const active = s.status === "active" && s.bookable;
  const fares = s.mainFare ? [...new Set([s.mainFare.seater, s.mainFare.sleeperLower, s.mainFare.sleeperUpper].map((v) => inr(v)))].join(" / ") : "Fare not set";
  const open = (tab: string) => ({ "data-sx-open": s.id, "data-sx-open-tab": tab, onClick: () => onOpen(tab), disabled: !canOperate, title: canOperate ? undefined : "Your role cannot manage schedules" });
  return (
    <tr data-sx-row={s.id}>
      <td>
        <b>{s.serviceNumber}</b> <a href={`#/gds/routes/${s.routeId}`} className="sx-route-name">{s.serviceName}</a>
        <div className="sx-muted">{s.coach || "Coach"} · {s.origin} → {s.destination}</div>
        <a className="sx-via" href={`#/gds/routes/${s.routeId}?rvtab=cities`}><I name="check" size={12} /> <I name="star" size={12} /> via route cities / schedule</a>
      </td>
      <td><b>{s.origin}</b><small>{t12(s.departureTime)}<br />{shortDate(s.travelDate)}</small></td>
      <td><b>{s.destination}</b><small>{t12(s.arrivalTime)}<br />{shortDate(addDays(s.travelDate, s.arrivalDayOffset))}</small></td>
      <td className="sx-farecell">
        <b>{fares}</b>
        <span className="sx-pill sx-update"><I name="arrowDown" size={12} /> Fare source: Route</span>
        <span className="sx-pill sx-sold">{s.booked} seat{s.booked === 1 ? "" : "s"} sold</span>
      </td>
      <td>
        <div className="sx-collection">
          <div className="sx-ring-wrap">
            <span className="sx-ring" style={{ ["--fill" as string]: Math.min(100, Math.max(0, s.occupancyPct)) }}>{Math.round(s.occupancyPct)}%</span>
            <small className="sx-booked-count">{s.booked}/{s.capacity} booked</small>
          </div>
          <div className="sx-collection-values">
            <strong className="sx-collected" title="Total sale">{inr(s.sale ?? 0)}</strong>
            <strong className="sx-payout" title={s.expenseBasis === "none" ? "No expense template or recorded expense" : `Total expense (${s.expenseBasis})`}>{s.expense != null && s.expenseBasis !== "none" ? inr(s.expense) : "—"}</strong>
            <strong className="sx-green" title="Net profit">{s.profit != null && s.expenseBasis !== "none" ? inr(s.profit) : "—"}</strong>
          </div>
        </div>
      </td>
      <td><div className="sx-triple">
        <button {...open("pickups")} className="green">Pickups</button><button {...open("drops")} className="orange">Drops</button><button {...open("fares")} className="violet">Fares</button>
      </div></td>
      <td>
        <label className="sx-switch" title={`${active ? "Disable" : "Enable"} schedule`}>
          <input data-sx-toggle={s.id} type="checkbox" checked={active} disabled={!canOperate || s.status !== "active"} onChange={onToggle} aria-label={`${active ? "Disable" : "Enable"} ${s.serviceNumber} schedule`} /><span />
        </label>
        <button data-sx-delete={s.id} className="sx-tiny sx-delete-schedule" disabled={!canOperate} aria-label={`Delete ${s.serviceNumber} schedule`}
          title="Delete schedule" onClick={onDelete}><I name="trash" size={18} /></button>
      </td>
      <td><div className="sx-triple">
        <button className="blue" {...open("bookings")}>Manage</button>
        <button className="lime" data-sx-book={s.id} disabled={!canOperate || !active} onClick={() => onOpen("book")}>Book ({s.free})</button>
        <button className="dark" {...open("block")}>Block ({s.blocked + s.held})</button>
      </div></td>
    </tr>
  );
}
