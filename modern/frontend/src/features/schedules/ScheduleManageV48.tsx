import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api, type ScheduleDetail, type ScheduleRow, type TripSheet, type TripSheetPassenger } from "../../api";
import { confirmDialog, promptDialog, toast, toastError } from "../../components/ui/feedback";
import { can } from "../../auth/permissions";

// React port of legacy public/js/schedule-manage-v48.js (Schedules → Manage → Bookings): station-tool summaries,
// timings, live location, delay and notify flows, and the V48 seat diagram. Same classes as the vendored CSS.

const PATHS: Record<string, ReactNode> = {
  close: <path d="M18 6 6 18M6 6l12 12" />,
  stations: <><circle cx="5" cy="5" r="2" /><circle cx="19" cy="7" r="2" /><circle cx="12" cy="20" r="2" /><path d="M7 6l10 1M6 7l5 11M18 9l-5 9" /></>,
  pickups: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2" /></>,
  drops: <><path d="M12 22s8-7 8-12a8 8 0 1 0-16 0c0 5 8 12 8 12Z" /><circle cx="12" cy="10" r="2" /><path d="m8 11 3 3 5-6" /></>,
  bookedby: <><circle cx="9" cy="8" r="4" /><path d="M2 21v-3a6 6 0 0 1 12 0v3m4-9a4 4 0 0 0 0-8m1 17v-3a6 6 0 0 0-3-5" /></>,
  bookings: <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M9 6h6M9 10h6M9 14h6M9 18h6" /></>,
  location: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
  timings: <path d="M4 4h3v4H4zM4 11h3v4H4zM4 18h3v4H4zM11 6h10M11 13h10M11 20h10" />,
  delay: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 3" /></>,
  refresh: <path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2" /></>,
};
export const I48 = ({ n, s = 21 }: { n: string; s?: number }) =>
  <svg className="sx48-svg" viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[n] ?? PATHS.pin}</svg>;

export type SummaryKind = "stations" | "pickups" | "drops" | "bookedby" | "bookings";
const SECTIONS: Record<SummaryKind, [string, string, string]> = {
  stations: ["Multi-station", "stations", "purple"], pickups: ["Pickup points", "pickups", "green"], drops: ["Drop-off points", "drops", "pink"],
  bookedby: ["Booked by", "bookedby", "orange"], bookings: ["Booking history", "bookings", "blue"],
};
const TZ = "Asia/Kolkata";
export function datetime48(x?: string | null, short = false) {
  const ms = Date.parse(String(x ?? ""));
  if (!Number.isFinite(ms)) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "2-digit", month: short ? "short" : "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(ms));
}
export function hm48(v?: string | null) {
  if (!v) return "—";
  const m = String(v).match(/^([01]?\d|2[0-3]):([0-5]\d)/);
  if (!m) return String(v);
  const h = Number(m[1]);
  return `${String(h % 12 || 12).padStart(2, "0")}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
}
const numSort = (a: string, b: string) => {
  const x = String(a).match(/^(\d+)(.*)$/), y = String(b).match(/^(\d+)(.*)$/);
  if (!x || !y) return String(a).localeCompare(String(b), "en");
  return Number(x[1]) - Number(y[1]) || x[2].localeCompare(y[2]);
};
/** legacy live(): passengers of confirmed PNRs that are not cancelled/released/expired. */
export function live48(sheet: TripSheet | undefined, d: ScheduleDetail) {
  const active = new Set(d.history.filter((b) => b.status.toLowerCase() === "confirmed").map((b) => b.pnr));
  return (sheet?.passengers ?? []).filter((p) => active.has(p.pnr) && !["cancelled", "released", "expired"].includes(p.status.toLowerCase()));
}

/** legacy overlay(): .sx48-overlay dialog with optional search + refresh; Esc closes; focus trapped. */
export function Sx48Overlay({ title, icon, color, subtitle, wide, search, onRefresh, onClose, onPnr, children }: {
  title: string; icon: string; color: string; subtitle: string; wide?: boolean; search?: boolean; onRefresh?: () => Promise<unknown>;
  onClose: () => void; onPnr?: (pnr: string) => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    const last = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("[data-sx48-close]")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); onClose(); return; }
      if (e.key !== "Tab" || !ref.current) return;
      const t = [...ref.current.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),a[href]")];
      if (!t.length) return;
      if (e.shiftKey && document.activeElement === t[0]) { e.preventDefault(); t[t.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === t[t.length - 1]) { e.preventDefault(); t[0].focus(); }
    };
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("keydown", key, true); if (last?.isConnected) last.focus(); };
  }, [onClose]);
  useEffect(() => {
    const s = q.trim().toLowerCase();
    for (const el of ref.current?.querySelectorAll<HTMLElement>("[data-sx48-filter]") ?? [])
      el.hidden = !!s && !`${el.textContent} ${el.dataset.sx48SearchTerms ?? ""}`.toLowerCase().includes(s);
  }, [q, children]);
  return createPortal(
    <div className="sx48-overlay" role="presentation" ref={ref} onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onClick={(e) => { const b = (e.target as Element).closest<HTMLElement>("[data-sx48-pnr]"); if (b && onPnr) { onClose(); onPnr(b.dataset.sx48Pnr!); } }}>
      <section className={`sx48-dialog${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="sx48-dialog-head"><span className={`sx48-head-icon ${color}`}><I48 n={icon} s={26} /></span>
          <div><h2>{title}</h2><p>{subtitle}</p></div>
          {onRefresh && <button type="button" className="sx48-refresh" data-sx48-refresh="" aria-label="Refresh" onClick={() => void onRefresh().catch((e) => toast((e as Error).message || "GPS refresh failed", "bad"))}><I48 n="refresh" /></button>}
          <button type="button" className="sx48-close" data-sx48-close="" aria-label="Close" onClick={onClose}><I48 n="close" /></button></header>
        <div className="sx48-scroll">
          {search && <label className="sx48-search"><I48 n="search" s={20} /><input type="search" data-sx48-search="" placeholder="Search PNR, seat, city or name" aria-label="Search bookings" value={q} onChange={(e) => setQ(e.target.value)} /></label>}
          <div className="sx48-content">{children}</div></div>
      </section>
    </div>, document.body);
}

const Chips = ({ ps }: { ps: { seat: string; pnr: string }[] }) =>
  <div className="sx48-chips">{[...ps].sort((a, b) => numSort(a.seat, b.seat)).map((p, i) =>
    <button key={p.pnr + p.seat + i} type="button" className="sx48-chip" data-sx48-pnr={p.pnr} title="View ticket">{p.seat}</button>)}</div>;

/** legacy summary(type): stations / pickups / drops / booked by / booking history popups. */
export function SummaryPopup({ kind, sheet, detail, onClose, onPnr }: { kind: SummaryKind; sheet?: TripSheet; detail: ScheduleDetail; onClose: () => void; onPnr: (pnr: string) => void }) {
  const ps = live48(sheet, detail);
  const bs = detail.history.filter((b) => b.status.toLowerCase() === "confirmed" && ps.some((p) => p.pnr === b.pnr));
  const [title, icon, color] = SECTIONS[kind];
  const subtitle = `${ps.length} seats in ${bs.length} bookings`;
  if (kind === "bookings") {
    const hist = [...detail.history].sort((a, b) => String(b.bookedAt ?? "").localeCompare(String(a.bookedAt ?? "")));
    const seatsOf = (pnr: string, fallback: string[]) => {
      const mine = (sheet?.passengers ?? []).filter((p) => p.pnr === pnr);
      return (mine.length ? mine.filter((p) => p.status.toLowerCase() !== "cancelled").map((p) => p.seat) : fallback).map((seat) => ({ seat, pnr }));
    };
    return <Sx48Overlay title={title} icon={icon} color={color} subtitle={subtitle} wide search onClose={onClose} onPnr={onPnr}>
      <div className="sx48-table-wrap"><table className="sx48-table sx48-booktable"><thead><tr>{["#", "PNR", "ROUTE", "SEATS", "FARE", "BOOKED BY", "SOURCE", "BOOKED ON"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{hist.map((b, i) => <tr key={b.pnr + i} data-sx48-filter="" data-sx48-search-terms={[b.pnr, b.pnr.slice(-6), b.contactName, b.source, b.seats.join(" "), detail.origin, detail.destination].join(" ")}>
          <td className="muted">{i + 1}</td>
          <td><button type="button" className="sx48-booklink" data-sx48-pnr={b.pnr}>{b.pnr.length > 6 ? b.pnr.slice(-6) : b.pnr}</button>{b.status.toLowerCase() === "hold" && <span className="sx48-hold">HOLD</span>}</td>
          <td>{detail.origin} → {detail.destination}</td>
          <td><Chips ps={seatsOf(b.pnr, b.seats)} /></td>
          <td>₹{Number(b.totalAmount || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
          <td>{b.source || "GDS"}</td><td className="muted">{b.source || "GDS"}</td>
          <td className="muted">{datetime48(b.bookedAt, true)}</td></tr>)}
          {!hist.length && <tr><td colSpan={8} className="muted">No bookings on this service.</td></tr>}</tbody></table></div>
    </Sx48Overlay>;
  }
  type Row = { label: string; ps: TripSheetPassenger[]; time?: string; day?: number; order: number };
  const rows = new Map<string, Row>();
  const add = (key: string, p: TripSheetPassenger, x: Partial<Row> = {}) => { if (!rows.has(key)) rows.set(key, { label: key, ps: [], order: 0, ...x }); rows.get(key)!.ps.push(p); };
  const timed = kind === "pickups" || kind === "drops";
  for (const p of ps) {
    if (kind === "stations") add(`${p.from || detail.origin || "—"} – ${p.to || detail.destination || "—"}`, p);
    else if (kind === "bookedby") add(String(p.source || "Unknown").replace(/^redbus$/i, "redBus"), p);
    else {
      const st = kind === "pickups" ? p.boarding : p.dropping;
      if (!st) continue;
      const day = st.day || 1, t = st.time ?? "";
      add(st.name || "Unassigned", p, { time: st.time, day, order: (day - 1) * 1440 + (parseInt(t.slice(0, 2)) || 0) * 60 + (parseInt(t.slice(3, 5)) || 0) });
    }
  }
  const list = [...rows.values()].sort((a, b) => timed ? a.order - b.order : a.label.localeCompare(b.label));
  const headers = kind === "pickups" ? ["BOARDING POINT", "TIME · DAY", "SEATS", "BOOKED SEATS"] : kind === "drops" ? ["DROP-OFF POINT", "TIME · DAY", "SEATS", "BOOKED SEATS"]
    : kind === "stations" ? ["MULTI STATION", "SEATS", "BOOKED SEATS"] : ["BOOKED BY", "SEATS", "BOOKED SEATS"];
  return <Sx48Overlay title={title} icon={icon} color={color} subtitle={subtitle} wide={timed} onClose={onClose} onPnr={onPnr}>
    <div className="sx48-table-wrap"><table className="sx48-table"><thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>
      {list.map((r) => <tr key={r.label} data-sx48-filter=""><td><b>{r.label}</b></td>
        {timed && <td className="muted">{hm48(r.time)} · Day {r.day}</td>}
        <td className="sx48-count">{r.ps.length}</td><td><Chips ps={r.ps} /></td></tr>)}
      <tr className="sx48-table-total"><th>Total</th>{timed && <td></td>}<th>{ps.length}</th><td></td></tr>
    </tbody></table></div>
  </Sx48Overlay>;
}

/** legacy timings(): trip summary chips + per-stop schedule / actual arrival & departure. */
export function TimingsPopup({ sheet, onClose }: { sheet?: TripSheet; onClose: () => void }) {
  const stops = sheet?.stops ?? [];
  const c = { pickup: 0, drop: 0, break: 0 } as Record<string, number>;
  for (const s of stops) if (s.type in c) c[s.type]++;
  return <Sx48Overlay title="Timings" icon="timings" color="indigo" subtitle={sheet?.vehicle?.registration || "Vehicle not assigned"} wide onClose={onClose}>
    <section className="sx48-trip-summary"><div className="sx48-trip-caption"><I48 n="delay" s={17} /> TRIP SUMMARY</div>
      <div className="sx48-total-chips"><span className="total">Total {stops.length}</span><span>Pickups {c.pickup}</span><span>Drops {c.drop}</span><span>Breaks {c.break}</span></div></section>
    <div className="sx48-table-wrap"><table className="sx48-table sx48-time-table"><thead><tr>{["Type", "Name", "Link", "Status", "Sched:", "Arr:", "Dep:"].map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>
      {stops.map((s, i) => {
        const kind = String(s.type || "Stop"), lat = Number(s.lat), lng = Number(s.lng);
        const valid = s.lat != null && s.lng != null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
        const href = valid ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}` : null;
        const status = s.departedAt ? "Departed" : s.arrivedAt ? "Arrived" : "N/A";
        return <tr key={s.id ?? i} className={`sx48-stop ${kind}`}>
          <td><span className="sx48-stopkind"><I48 n="pin" s={18} />{kind[0].toUpperCase() + kind.slice(1)}</span></td>
          <td><strong>{s.name}</strong></td>
          <td>{href ? <a href={href} target="_blank" rel="noopener noreferrer"><I48 n="pin" s={17} /> View Map</a> : "N/A"}</td>
          <td className="muted">{status}</td>
          <td><b>{hm48(s.time)}</b><small>Day {s.day || 1}</small></td>
          <td>{s.arrivedAt ? datetime48(s.arrivedAt) : "N/A"}</td>
          <td>{s.departedAt ? datetime48(s.departedAt) : "N/A"}</td></tr>;
      })}
      {!stops.length && <tr><td colSpan={7} className="muted">No stops on this trip.</td></tr>}
    </tbody></table></div>
  </Sx48Overlay>;
}

type Pos = { lat?: number; lng?: number; latitude?: number; longitude?: number; speed_kmh?: number; speed?: number; updated_at?: string; updatedAt?: string; address?: string } | null;
export function validGps(p: Pos) {
  const lat = Number(p?.lat ?? p?.latitude), lng = Number(p?.lng ?? p?.longitude);
  return p && (p.lat != null || p.latitude != null) && (p.lng != null || p.longitude != null) && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
export const fetchPosition = async (vehicleId?: number): Promise<Pos> => {
  if (!vehicleId) return null;
  const r = await api.admin<{ vehicles: { id: number; position: Pos }[] }>("/vehicle-list").catch(() => ({ vehicles: [] }));
  return r.vehicles.find((v) => v.id === vehicleId)?.position ?? null;
};
/** legacy location(): latest verified GPS point on an OSM map, or the no-data state. */
export function LocationPopup({ sheet, onClose, reload }: { sheet?: TripSheet; onClose: () => void; reload: () => Promise<unknown> }) {
  const [pos, setPos] = useState<Pos>(null);
  const load = () => fetchPosition(sheet?.vehicle?.id).then(setPos);
  useEffect(() => { void load(); }, [sheet?.vehicle?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const g = validGps(pos), d = 0.022;
  const speed = pos?.speed_kmh ?? pos?.speed ?? null, upd = pos?.updated_at ?? pos?.updatedAt;
  return <Sx48Overlay title="Live location" icon="location" color="indigo" subtitle={sheet?.vehicle?.registration || "Unassigned vehicle"} wide onClose={onClose}
    onRefresh={async () => { await reload(); await load(); }}>
    {!g ? <div className="sx48-no-data">No verified GPS coordinates are available for this service.</div> : <>
      <div className="sx48-gps-status"><span>{speed == null ? "Speed not reported" : Number(speed) < 1 ? "Stopped" : "Moving"}</span><span>Updated {upd ? datetime48(upd, true) : "time unavailable"}</span></div>
      <p className="sx48-gps-address"><I48 n="pin" s={20} />{pos?.address || `Coordinates ${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}`}</p>
      <div className="sx48-map"><iframe title="Vehicle position — OpenStreetMap" loading="lazy" referrerPolicy="no-referrer"
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(`${g.lng - d},${g.lat - d},${g.lng + d},${g.lat + d}`)}&layer=mapnik&marker=${encodeURIComponent(`${g.lat},${g.lng}`)}`} /></div>
      <p className="sx48-map-foot"><span>© OpenStreetMap contributors</span><a href={`https://www.openstreetmap.org/?mlat=${g.lat}&mlon=${g.lng}#map=16/${g.lat}/${g.lng}`} target="_blank" rel="noopener noreferrer">Open map</a>
        <span>GPS point is the latest available backend observation; external map tiles require internet access.</span></p>
    </>}
  </Sx48Overlay>;
}

/** legacy delay(): prompt → validate → confirm → POST /trips/{id}/delay (notify:false). */
export async function delay48(row: ScheduleRow, after?: () => Promise<unknown>) {
  if (!can("trips.update_passengers") && !can("schedules.modify")) return toast("No permission to adjust trip timings", "bad");
  const f = await promptDialog("Bus Delay / Early", [
    { name: "direction", label: "Adjust trip time", type: "select", options: [["Delay", "Delay"], ["Advance", "Advance"]], value: "Delay" },
    { name: "hours", label: "Hours", type: "number", value: 0 },
    { name: "minutes", label: "Minutes", type: "number", value: 15 },
    { name: "reason", label: "Reason for change", required: true, full: true },
  ], { ok: "Review adjustment" });
  if (!f) return;
  const h = Number(f.hours), m = Number(f.minutes);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 12 || m < 0 || m > 59 || h * 60 + m <= 0) return toast("Enter 1–720 minutes in hours/minutes fields", "bad");
  const mins = (f.direction === "Advance" ? -1 : 1) * (h * 60 + m);
  if (!(await confirmDialog(`${mins < 0 ? "Advance" : "Delay"} ${row.serviceNumber} by ${Math.abs(mins)} minutes? Only unreached stops should change. No passenger message will be sent automatically.`, { ok: "Apply timing change" }))) return;
  try {
    const r = await api.admin<{ adjustedStops?: number; adjusted_stops?: number }>(`/trips/${row.id}/delay`, "POST", { minutes: mins, reason: String(f.reason ?? "").trim(), notify: false });
    toast(`Trip timing update recorded; ${r?.adjustedStops ?? r?.adjusted_stops ?? 0} unreached stops adjusted`, "ok");
    if (after) await after();
  } catch (e) { toastError(e); }
}

export const NOTIFY_OPTIONS = [
  ["ticket_confirmation", "Ticket Confirmation", "Resend booking confirmation"],
  ["bus_details", "Bus Details", "Tracker + bus + driver"],
  ["bus_delay", "Bus Delay / Early", "Reason + minutes + tracker"],
  ["bus_cancellation", "Bus Cancellation", "Inform pax; use Cancel for refund"],
] as const;
/** legacy notifyMenu(): dropdown under a Notify button; closes on outside click / Esc. */
export function NotifyMenu({ onPick, onClose, anchor }: { onPick: (template: string) => void; onClose: () => void; anchor?: HTMLElement | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const out = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchor ? !(ref.current?.contains(t) || anchor.contains(t)) : !ref.current?.parentElement?.contains(t)) onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); } };
    document.addEventListener("mousedown", out); document.addEventListener("keydown", key, true);
    ref.current?.querySelector("button")?.focus();
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", key, true); };
  }, [onClose, anchor]);
  // anchored mode (legacy seat-bottom Notify button sits directly in its toolbar): float the menu under the button
  const r = anchor?.getBoundingClientRect();
  const style = r ? { position: "fixed" as const, top: r.bottom + 4, right: "auto", left: Math.max(8, Math.min(r.left, window.innerWidth - 300)), zIndex: 1000 } : undefined;
  const menu = <div className="sx48-notify-menu" role="menu" aria-label="Notify selected passengers" ref={ref} style={style}>
    {NOTIFY_OPTIONS.map(([id, label, d]) => <button key={id} type="button" role="menuitem" data-v48-notify={id} onClick={() => { onClose(); onPick(id); }}><strong>{label}</strong><small>{d}</small></button>)}
  </div>;
  return anchor ? createPortal(menu, document.body) : menu;
}
/** legacy notify(S, pnrs, template). */
export async function notify48(row: ScheduleRow, pnrs: string[], template: string) {
  if (!can("trips.chat") && !can("schedules.modify")) return toast("No permission to notify passengers", "bad");
  const ids = [...new Set(pnrs.filter(Boolean))];
  if (!ids.length) return toast("Select passengers before choosing a notification type", "warn");
  let text = "", send = template;
  if (template === "bus_delay") {
    const i = await promptDialog("Bus Delay / Early", [
      { name: "direction", label: "Type", type: "select", options: [["Delayed", "Delayed"], ["Early", "Early"]], value: "Delayed" },
      { name: "minutes", label: "Minutes", type: "number", required: true, value: 15 },
      { name: "reason", label: "Reason", required: true, full: true },
    ], { ok: "Review message" });
    if (!i) return;
    const m = Number(i.minutes);
    if (!Number.isInteger(m) || m < 1 || m > 720 || !String(i.reason ?? "").trim()) return toast("Valid minutes and reason are required", "bad");
    text = `Your bus ${row.serviceNumber} is ${String(i.direction).toLowerCase()} by ${m} minutes. Reason: ${String(i.reason).trim()}. Please check your latest boarding instructions.`;
    send = "custom";
  } else if (template === "bus_cancellation") {
    const i = await promptDialog("Bus Cancellation Notice", [{ name: "message", label: "Cancellation message", type: "textarea", required: true, full: true,
      value: `Your bus ${row.serviceNumber} has been cancelled. Please contact the operator for cancellation and refund details.` }], { ok: "Review notice" });
    if (!i) return;
    text = String(i.message ?? "").trim();
    if (!text) return toast("Cancellation notice text required", "bad");
  } else if (!["ticket_confirmation", "bus_details"].includes(template)) return toast("Unsupported notification", "bad");
  if (!(await confirmDialog(`Record ${template.replace(/_/g, " ")} for ${ids.length} selected PNR(s)? This does not verify SMS/WhatsApp delivery${template === "bus_cancellation" ? " and does not cancel tickets or initiate refunds." : ""}`, { ok: "Record notification" }))) return;
  try {
    const r = await api.admin<{ recorded: number }>(`/trips/${row.id}/notify`, "POST", { template: send, pnrs: ids, text });
    toast(`${r?.recorded ?? 0} message record(s) saved; external delivery remains unverified`, "ok");
  } catch (e) { toastError(e); }
}

export type LayoutSeat = { code: string; row: number; col: number; w: number; h: number; type: string; status: string; fare: number | null; pnr: string | null; reservationCount: number };
export type SeatLayout = { from: number; to: number; decks: { deck: string; rows: number; cols: number; seats: LayoutSeat[] }[] };
const stateOf = (s: LayoutSeat) => s.status === "booked_female" ? "female" : s.status === "booked_male" ? "male" : s.status === "hold" ? "hold" : s.status === "blocked" ? "blocked" : s.status === "no_show" ? "no-show" : "available";
/** legacy seatDiagram(S). */
export function SeatDiagram48({ layout, selected, onSeat }: { layout?: SeatLayout; selected: Set<string>; onSeat: (s: LayoutSeat) => void }) {
  if (!layout?.decks.length) return <div className="sx48-no-data">Seat inventory unavailable for this segment.</div>;
  return <div className="sx48-deck-holder">{layout.decks.map((d) => {
    const lower = d.deck.toUpperCase() === "LOWER";
    return <section key={d.deck} className={`sx48-deck ${lower ? "lower" : "upper"}`} aria-label={`${d.deck} deck`}>
      <header><b>{d.deck}</b>{lower && <span className="sx48-wheel"><svg viewBox="0 0 44 44" width="43" height="43" aria-hidden="true"><circle cx="22" cy="22" r="19" fill="#032f79" stroke="#fff" strokeWidth="2" />
        <circle cx="22" cy="22" r="16" fill="none" stroke="#6db6ff" strokeWidth="3" /><circle cx="22" cy="22" r="5" fill="#dbf2ff" />
        <path d="m22 17-4-11M18 25 7 32M26 25 37 32" stroke="#fff" strokeWidth="4" strokeLinecap="round" /></svg></span>}</header>
      <div className="sx48-seatgrid" style={{ gridTemplateColumns: `repeat(${d.cols || 4},minmax(0,1fr))`, gridTemplateRows: `repeat(${d.rows || 12},34px)` }}>
        {d.seats.map((s) => {
          const berth = s.type === "sleeper" || s.h > 1, st = selected.has(s.code) ? "selected" : stateOf(s), price = s.fare == null ? NaN : Number(s.fare);
          return <button key={s.code} type="button" data-sx-seat={s.code} className={`sx48-seat ${berth ? "berth" : "chair"} ${st}`}
            style={{ gridColumn: `${s.col + 1}/span ${s.w || 1}`, gridRow: `${s.row + 1}/span ${s.h || 1}` }}
            title={`Seat ${s.code} · ${st}${Number.isFinite(price) ? ` · ₹${price}` : ""}`} aria-label={`Seat ${s.code} · ${st}`} onClick={() => onSeat(s)}>
            <span className="sx48-price sx-seat-fare">{Number.isFinite(price) ? Math.round(price) : "—"}</span><strong>{s.code}</strong>
            {s.reservationCount > 0 && <span className={`sx48-quantity${berth ? " bottom" : ""}`}>×{s.reservationCount}</span>}</button>;
        })}</div>
      {lower && <><div className="sx48-exit" aria-label="Emergency exit"><I48 n="drops" s={24} /></div><div className="sx48-door"></div></>}
    </section>;
  })}</div>;
}
