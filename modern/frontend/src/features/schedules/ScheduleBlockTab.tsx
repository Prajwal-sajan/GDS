import { useEffect, useMemo, useState } from "react";
import { api, type ScheduleDetail, type ScheduleRow } from "../../api";
import { confirmDialog, toast, toastError } from "../../components/ui/feedback";
import { can, permissions } from "../settings/legacy";

// Schedule overlay → Block tab. React port of legacy schedules-screenshot-v6.js bookingTab() + blockPanel() + seatsGraphic()
// (same classes). Seats: GET /trips/{id}/seats; block: POST /trips/{id}/blocks; unblock: DELETE /trips/{id}/blocks/{seat};
// Delay: POST /trips/{id}/delay; Notify: POST /trips/{id}/notify. Notifications are recorded (no messaging provider connected).
type Seat = { seatCode: string; deck: string; row: number; col: number; seatType: string; occupied: boolean; state: string; gender: string | null };
type Fares = { fares: { fromSequence: number; toSequence: number; seater: number; sleeperLower: number; sleeperUpper: number }[]; cities: { sequence: number; cityId: number; name: string }[] };

const P: Record<string, string> = {
  layout: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z", copy: "M8 4h12v14H8zM4 8H3v13h13v-2", link: "M10 13a5 5 0 0 0 7 .3l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7-.3l-3 3a5 5 0 0 0 7 7l1.5-1.5",
  bus: "M4 17V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11M4 13h16M4 17h16M7 17v3m10-3v3M7 9h2m6 0h2", user: "M20 21a8 8 0 0 0-16 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  pin: "M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Zm-8 2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z", clock: "M12 6v6l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 12a2 2 0 0 0 4 0", shield: "M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z",
  rupee: "M7 5h11M7 9h11m-9-4a5 5 0 0 1 0 10l7 5", check: "M20 6 9 17l-5-5", refresh: "M20 11a8 8 0 1 0-2 6M20 4v7h-7", arrowDown: "M12 5v14m-6-6 6 6 6-6",
  map: "M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15", arrowUp: "M12 19V5m-6 6 6-6 6 6", credit: "M2 6h20v12H2zM2 10h20", file: "M6 2h8l5 5v15H6zM14 2v6h5",
};
const I = ({ n, s = 16 }: { n: string; s?: number }) => <svg className="sx-svg" width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[n]} /></svg>;
const Bt = ({ n, label, cls = "", onClick, attrs }: { n: string; label: string; cls?: string; onClick?: () => void; attrs?: Record<string, string> }) =>
  <button type="button" className={`sx-btn ${cls}`} onClick={onClick} {...attrs}><I n={n} /><span>{label}</span></button>;
const groupOf = (s: Seat) => /^[0-9]+[LU]$/.test(s.seatCode) ? (s.seatCode.endsWith("U") && s.col > 0 ? "DUB" : "SLB") : "SS";
/** legacy seatColor() */
const color = (s: Seat, chosen: boolean) => chosen ? "selected" : s.state === "blocked" ? "blocked" : s.state === "held" ? "hold"
  : s.state === "booked" ? ((s.gender ?? "").toLowerCase().startsWith("f") ? "female" : "male") : "available";

export function BlockTab({ row, detail }: { row: ScheduleRow; detail: ScheduleDetail }) {
  const [seats, setSeats] = useState<Seat[]>();
  const [fares, setFares] = useState<Fares>();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("Operator quota");
  const [gender, setGender] = useState("Any");
  const [hide, setHide] = useState(false);
  const [panel, setPanel] = useState<"" | "delay" | "notify">("");
  const [busy, setBusy] = useState(false);
  const [pair, setPair] = useState<[number, number]>();
  const load = () => Promise.all([api.admin<Seat[]>(`/trips/${row.id}/seats`), api.admin<Fares>(`/schedules/${row.id}/fares`).catch(() => undefined), permissions()])
    .then(([s, f]) => { setSeats(s); setFares(f); }).catch(toastError);
  useEffect(() => { void load(); }, [row.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const cities = fares?.cities ?? [];
  const [from, to] = pair ?? (cities.length > 1 ? [cities[0].sequence, cities[cities.length - 1].sequence] : [0, 0]);
  const main = useMemo(() => fares?.fares.find((f) => f.fromSequence === from && f.toSequence === to), [fares, from, to]);
  const fareOf = (s: Seat) => main ? (groupOf(s) === "SS" ? main.seater : groupOf(s) === "SLB" ? main.sleeperLower : main.sleeperUpper) : 0;
  const counts = { blocked: (seats ?? []).filter((s) => s.state === "blocked").length };
  const decks = [...new Set((seats ?? []).map((s) => s.deck))];

  const pick = (s: Seat) => {
    if (!["free", "blocked"].includes(s.state)) return toast("Choose an available or blocked seat to modify.", "warn");
    setSel((x) => { const n = new Set(x); if (n.has(s.seatCode)) n.delete(s.seatCode); else n.add(s.seatCode); return n; });
  };
  const apply = async (action: "block" | "unblock" | "follow_route") => {
    if (action === "follow_route") return toast("Routes carry no seat-block template in this backend; trip blocks are managed here only.", "warn");
    const list = [...sel];
    if (!list.length) return toast("Select seats on the layout first", "warn");
    if (!can("bookings.block_seats") && !can("schedules.modify")) return toast("No permission to block seats", "bad");
    if (!(await confirmDialog(`${action} ${list.length} selected seat(s)?`, { ok: "Confirm" }))) return;
    setBusy(true);
    try {
      if (action === "block") {
        const r = reason.trim() || "Operator quota";
        await api.admin(`/trips/${row.id}/blocks`, "POST", { seats: list.filter((c) => seats?.find((s) => s.seatCode === c)?.state === "free"), reason: gender === "Any" ? r : `${r} (${gender} only)` });
      } else {
        for (const c of list.filter((c) => seats?.find((s) => s.seatCode === c)?.state === "blocked")) await api.admin(`/trips/${row.id}/blocks/${encodeURIComponent(c)}`, "DELETE");
      }
      setSel(new Set()); await load(); toast("Seat block update saved", "ok");
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };

  if (!seats) return <div className="sx-loading">Loading block…</div>;
  return (
    <div className="sx-book-columns">
      <section className="sx-book-left">
        <header className="sx-book-head"><strong><I n="layout" /> Seat Layout</strong>
          <div><Bt n="copy" label="Copy" cls="mini" attrs={{ "data-sx-copy": "", title: "Copy seat layout image" }} onClick={() => void copyLayout()} /><Bt n="link" label="Share" cls="mini" attrs={{ "data-sx-share": "" }} onClick={() => void share(row)} /></div></header>
        <div className="sx-book-ident"><I n="bus" s={13} /> {row.coach ? "Vehicle per assignment" : "Unassigned vehicle"} <span><I n="user" s={13} /> Crew per Update tab</span><span>{row.serviceNumber}</span></div>
        <div className="sx-book-location"><I n="pin" s={13} /> No verified live position <small></small></div>
        <div className="sx-station-tools">{([["stations", "Stations", "map"], ["pickups", "Pickups", "arrowUp"], ["drops", "Drops", "arrowDown"], ["bookedby", "Booked by", "credit"], ["bookings", "Bookings", "file"]] as const).map(([k, l, ic]) =>
          <button key={k} data-sx-summary={k} onClick={() => toast(summary(k, detail))}><I n={ic} s={15} /><small>{l}</small></button>)}</div>
        <div className="sx-journey-select">
          <label><I n="pin" s={12} /> From <select data-sx-fromcity="" value={from} onChange={(e) => { const a = Number(e.target.value); setPair([a, Math.max(to, cities.find((c) => c.sequence > a)?.sequence ?? to)]); }}>{cities.slice(0, -1).map((c) => <option key={c.sequence} value={c.sequence}>{c.name}</option>)}</select></label>
          <span>→</span>
          <label>To <select data-sx-tocity="" value={to} onChange={(e) => setPair([from, Number(e.target.value)])}>{cities.slice(1).map((c) => <option key={c.sequence} value={c.sequence} disabled={c.sequence <= from}>{c.name}</option>)}</select></label>
        </div>
        <div className="sx-seat-scroll">
          <div className="sx-seat-diagram">{decks.map((d) => {
            const ds = seats.filter((s) => s.deck === d), rows = Math.max(0, ...ds.map((s) => s.row)) + 1, cols = Math.max(0, ...ds.map((s) => s.col)) + 1;
            return <div key={d} className="sx-deck"><div className="sx-deck-head"><b>{d}</b></div>
              <div className="sx-deck-grid" style={{ gridTemplateColumns: `repeat(${Math.max(1, cols)},minmax(28px,1fr))`, gridTemplateRows: `repeat(${Math.max(1, rows)},32px)` }}>
                {ds.map((s) => <button key={s.seatCode} type="button" className={`sx-seat sx-${color(s, sel.has(s.seatCode))}${sel.has(s.seatCode) ? " sx-chosen" : ""}`} data-sx-seat={s.seatCode}
                  style={{ gridColumn: `${s.col + 1}/span 1`, gridRow: `${s.row + 1}/span 1` }} title={`${s.seatCode} • ${s.state}${main ? ` • ₹${fareOf(s)}` : ""}`} onClick={() => pick(s)}>
                  <span className="sx-seat-fare">{hide || !main ? "—" : Math.round(fareOf(s))}</span><strong>{s.seatCode}</strong></button>)}
              </div><div className="sx-deck-footer"><I n="arrowDown" s={14} /> <span>Door</span></div></div>;
          })}</div>
        </div>
        <div className="sx-legend">{[["available", "Available"], ["male", "Male (Booked)"], ["female", "Female (Booked)"], ["blocked", "Blocked"], ["hold", "Hold"], ["selected", "Selected"]].map(([t, l]) => <span key={t}><i className={`sx-legend-${t}`}></i>{l}</span>)}</div>
        <div className="sx-seat-bottom">
          <Bt n="pin" label="Location" cls="mini" attrs={{ "data-sx-location": "" }} onClick={() => toast("No verified live GPS position has been reported for this vehicle.", "warn")} />
          <Bt n="clock" label="Timings" cls="mini" attrs={{ "data-sx-timings": "" }} onClick={() => toast(detail.stops.map((s) => `${s.name ?? ""} ${s.time ?? ""}`).join(" · "))} />
          <Bt n="clock" label="Delay" cls="mini" attrs={{ "data-sx-delay": "" }} onClick={() => setPanel((p) => p === "delay" ? "" : "delay")} />
          <Bt n="bell" label="Notify" cls="mini" attrs={{ "data-sx-notify-pop": "" }} onClick={() => setPanel((p) => p === "notify" ? "" : "notify")} />
          <Bt n="shield" label={hide ? "Show fares" : "Hide fares"} cls="mini" attrs={{ "data-sx-hidefares": "" }} onClick={() => setHide((h) => !h)} />
          <Bt n="rupee" label="Print" cls="mini" attrs={{ "data-sx-print": "" }} onClick={() => window.print()} />
        </div>
        {panel === "delay" && <DelayForm tripId={row.id} onDone={() => setPanel("")} />}
        {panel === "notify" && <NotifyForm tripId={row.id} pnrs={[...new Set(detail.history.filter((h) => h.status.toLowerCase() === "confirmed").map((h) => h.pnr))]} onDone={() => setPanel("")} />}
      </section>
      <section className="sx-book-right">
        <header className="sx-side-top"><I n="shield" /> Block <span className="sx-muted">({counts.blocked} blocked)</span></header>
        <div className="sx-block-hint"><h3>{sel.size ? `Selected seats: ${[...sel].join(", ")}` : "Select seats from the layout below"}</h3><p>Click seats to block or unblock them. Only available or already blocked seats may be changed.</p></div>
        <div className="sx-control-grid">
          <label className="sx-field"><span>Reason</span><input name="reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <label className="sx-field"><span>Restriction</span><select name="gender" value={gender} onChange={(e) => setGender(e.target.value)}>{["Any", "Male", "Female"].map((g) => <option key={g} value={g}>{g}</option>)}</select></label>
        </div>
        <Bt n="shield" label="Block selected seats" cls="primary" attrs={{ "data-sx-block": "block", ...(busy ? { disabled: "" } : {}) }} onClick={() => void apply("block")} />
        <Bt n="check" label="Unblock selected seats" attrs={{ "data-sx-block": "unblock" }} onClick={() => void apply("unblock")} />
        <Bt n="refresh" label="Follow route blocks" attrs={{ "data-sx-block": "follow_route" }} onClick={() => void apply("follow_route")} />
        <div className="sx-preview-note"><I n="shield" s={15} /> Seat block changes use the existing authorized schedule API after confirmation.</div>
      </section>
    </div>
  );
}

/** legacy ScheduleManageV48.summary(): short real-data summaries for the station tool buttons. */
function summary(kind: string, d: ScheduleDetail) {
  const live = d.history.filter((h) => h.status.toLowerCase() === "confirmed");
  const by = (f: (h: ScheduleDetail["history"][number]) => string) => Object.entries(live.reduce<Record<string, number>>((a, h) => ({ ...a, [f(h)]: (a[f(h)] ?? 0) + h.seats.length }), {})).map(([k, v]) => `${k}: ${v}`).join(" · ") || "No confirmed bookings";
  if (kind === "stations") return d.stops.map((s) => s.name).join(" → ");
  if (kind === "pickups") return `${d.stages.filter((s) => s.kind === "pickup").length} pickup points`;
  if (kind === "drops") return `${d.stages.filter((s) => s.kind === "drop").length} drop points`;
  if (kind === "bookedby") return by((h) => h.source || "Unknown");
  return `${live.length} confirmed PNR(s), ${live.reduce((a, h) => a + h.seats.length, 0)} seat(s)`;
}

/** legacy ScheduleManageV48.delay(): minutes (−720…720), mandatory reason, optional passenger notification. */
export function DelayForm({ tripId, onDone }: { tripId: number; onDone: () => void }) {
  const [mins, setMins] = useState("15"); const [reason, setReason] = useState(""); const [notify, setNotify] = useState(false); const [busy, setBusy] = useState(false);
  const save = async () => {
    const m = Number(mins);
    if (!Number.isInteger(m) || Math.abs(m) > 720) return toast("Timing change must be an integer between -720 and +720 minutes", "warn");
    if (m !== 0 && !reason.trim()) return toast("Reason is required for a timing change", "warn");
    if (!(await confirmDialog(`${m >= 0 ? "Delay" : "Advance"} this trip by ${Math.abs(m)} minutes?`, { ok: "Apply timing" }))) return;
    setBusy(true);
    try {
      const r = await api.admin<{ recorded: number }>(`/trips/${tripId}/delay`, "POST", { minutes: m, reason: reason.trim(), notify });
      toast(`Trip timing updated${notify ? ` · ${r.recorded} notification(s) recorded (no messaging provider connected)` : ""}`, "ok"); onDone();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  return (
    <div className="sx-control-grid" data-sx-delay-form="">
      <label className="sx-field"><span>Minutes (+ late / − early)</span><input type="number" min={-720} max={720} value={mins} onChange={(e) => setMins(e.target.value)} /></label>
      <label className="sx-field"><span>Reason</span><input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></label>
      <label className="sx-field"><span>Notify passengers</span><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /></label>
      <button type="button" className="sx-btn primary" disabled={busy} onClick={() => void save()}><span>Apply timing</span></button>
    </div>
  );
}

/** legacy ScheduleManageV48.notify(): template + PNRs (+ text for custom / cancellation). */
export function NotifyForm({ tripId, pnrs, onDone }: { tripId: number; pnrs: string[]; onDone: () => void }) {
  const [tpl, setTpl] = useState("bus_details"); const [text, setText] = useState(""); const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!pnrs.length) return toast("No confirmed passenger PNRs on this trip", "warn");
    if ((tpl === "custom" || tpl === "bus_cancellation") && !text.trim()) return toast("Message text is required", "warn");
    if (!(await confirmDialog(`Record "${tpl.replace(/_/g, " ")}" notification for ${pnrs.length} PNR(s)?`, { ok: "Notify" }))) return;
    setBusy(true);
    try { const r = await api.admin<{ recorded: number }>(`/trips/${tripId}/notify`, "POST", { template: tpl, pnrs: pnrs.slice(0, 200), text }); toast(`${r.recorded} notification(s) recorded · delivery not verified (no provider connected)`, "ok"); onDone(); }
    catch (e) { toastError(e); } finally { setBusy(false); }
  };
  return (
    <div className="sx-control-grid" data-sx-notify-form="">
      <label className="sx-field"><span>Template ({pnrs.length} PNRs)</span><select value={tpl} onChange={(e) => setTpl(e.target.value)}>
        {[["ticket_confirmation", "Ticket confirmation"], ["bus_details", "Bus details"], ["bus_cancellation", "Bus cancellation"], ["custom", "Custom message"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      {(tpl === "custom" || tpl === "bus_cancellation") && <label className="sx-field"><span>Message</span><input value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} /></label>}
      <button type="button" className="sx-btn primary" disabled={busy} onClick={() => void send()}><span>Notify</span></button>
    </div>
  );
}

/** legacy seat-layout-copy-v49: copy the rendered seat diagram as a PNG (SVG foreignObject → canvas). */
async function copyLayout() {
  const node = document.querySelector<HTMLElement>(".sx-seat-diagram");
  if (!node) return;
  try {
    const { width, height } = node.getBoundingClientRect();
    const css = [...document.styleSheets].map((s) => { try { return [...s.cssRules].map((r) => r.cssText).join(""); } catch { return ""; } }).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>${css}</style>${node.outerHTML}</div></foreignObject></svg>`;
    const img = new Image(); img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    await img.decode();
    const c = document.createElement("canvas"); c.width = width * 2; c.height = height * 2;
    const g = c.getContext("2d")!; g.scale(2, 2); g.fillStyle = "#fff"; g.fillRect(0, 0, width, height); g.drawImage(img, 0, 0);
    const blob = await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("Image unavailable"))), "image/png"));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    toast("Seat layout image copied", "ok");
  } catch (e) { toast(`Could not copy the seat layout image: ${(e as Error).message}`, "bad"); }
}

/** legacy schedule-booking-share-v50: share service + availability text (Web Share API, clipboard fallback). */
async function share(row: ScheduleRow) {
  const text = `${row.serviceNumber} ${row.serviceName} · ${row.origin} → ${row.destination} · ${row.travelDate} ${row.departureTime} · ${row.free} seats available`;
  try {
    if (navigator.share) await navigator.share({ title: row.serviceNumber, text });
    else { await navigator.clipboard.writeText(text); toast("Schedule details copied to clipboard", "ok"); }
  } catch (e) { if ((e as Error).name !== "AbortError") toast(`Share failed: ${(e as Error).message}`, "bad"); }
}
