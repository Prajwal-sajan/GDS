import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, type CrmBooking, type CrmDeck, type CrmMapSeat, type Me } from "../../api";
import { confirmDialog, infoDialog, promptDialog, toast, toastError } from "../../components/ui/feedback";

// React port of the legacy CRM booking overlay (crm-screenshot-v8.js openBooking + crm-journey-v45.js seat map / cards).
// Data: GET /api/admin/crm/booking/{pnr}. Actions use the same prompts/confirmations as legacy: Update Ticket (PUT /bookings/{pnr}),
// Cancel Ticket (refund-quote + cancel), Shift Passenger (shift-options → shift-seats → shift-to), Show History, Comment and Notify.
const P: Record<string, string> = {
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m11-7a4 4 0 1 0-8 0 4 4 0 0 0 8 0Zm3-9v6m3-3h-6",
  phone: "M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 2.09 4.18 2 2 0 0 1 4.09 2h3a2 2 0 0 1 2 1.72l.55 3a2 2 0 0 1-.57 1.71L7.91 9.59a16 16 0 0 0 6.5 6.5l1.16-1.16a2 2 0 0 1 1.71-.57l3 .55A2 2 0 0 1 22 16.92z",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm-2 2 10 7L22 6",
  ticket: "M2 9V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a3 3 0 0 0 0 6v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a3 3 0 0 0 0-6zm10-5v3m0 4v2m0 4v3",
  x: "M18 6 6 18M6 6l12 12",
  chat: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.5-8.5h.5A8.5 8.5 0 0 1 21 11.5z",
  calendar: "M3 5h18v16H3zM7 2v6m10-6v6M3 10h18",
  pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0zm-8 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  wallet: "M20 7H4a2 2 0 0 0-2 2v10h20V9a2 2 0 0 0-2-2zM4 7V4h15v3M16 14h4",
  circlex: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM15 9l-6 6m0-6 6 6",
  edit: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4L16.5 3.5z",
  printer: "M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9m-8 13h4",
  history: "M3 12a9 9 0 1 0 3-7M3 3v5h5m4-1v5l4 2",
  arrows: "M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4",
  clipboard: "M8 4h8l2 3h3v14H3V7h3l2-3zm0 0V2h8v2M8 11h8m-8 4h8",
  plus: "M12 5v14M5 12h14",
  chevron: "m6 9 6 6 6-6",
  more: "M4 12h.01M12 12h.01M20 12h.01",
};
function I({ n, s = 18 }: { n: string; s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[n] || P.more} /></svg>;
}
const R = (n: number | null | undefined) => `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dmy = (x: string | null | undefined) => (x ? String(x).slice(0, 10).split("-").reverse().join("/") : "—");
const journeyDate = (x: string) => new Date(`${x.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const datetime = (x: string | null | undefined) => (x ? new Date(x).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const time = (x: string | null | undefined) => { if (!x) return "—"; const [h, m] = String(x).split(":").map(Number); return Number.isFinite(h) ? `${h % 12 || 12}:${String(m || 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}` : x; };

const STATUSES: Record<string, string> = { available: "Available", booked_male: "Booked · male", booked_female: "Booked · female", hold: "On hold", blocked: "Blocked", no_show: "No show", other_leg: "Booked on another leg", selected: "Current passenger seat" };
const STEERING = '<svg class="cv8-wheel-svg" viewBox="0 0 46 46" fill="none" aria-hidden="true"><circle cx="23" cy="23" r="20" fill="#062961" stroke="#e4f6ff" stroke-width="2"/><circle cx="23" cy="23" r="15" stroke="#65a8ff" stroke-width="2"/><circle cx="23" cy="23" r="5.5" fill="#e6f3ff" stroke="#ffffff" stroke-width="1.5"/><path d="M23 17 17 7M17 26 7 33M29 26 39 33" stroke="#f8fcff" stroke-width="4" stroke-linecap="round"/></svg>';
const EMERGENCY = '<svg class="cv8-emergency-svg" viewBox="0 0 46 44" aria-hidden="true" fill="none" stroke="#eb232b" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="17" cy="7" r="3.2" fill="#eb232b" stroke="none"/><path d="m18 12-4 9 8 5 3 10M16 19l-8 5-3 8M14 22l9-1 5-6M32 9h10v29H32zM26 38h18"/></svg>';
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function projection(d: CrmDeck) {
  const seats = d.seats;
  const mixed = d.deck === "LOWER" && Number(d.cols) === 4 && seats.some((s) => s.type === "sleeper" && Number(s.col) === 3) && seats.some((s) => s.type === "seater" && [0, 1].includes(Number(s.col)))
    && seats.every((s) => (s.type === "sleeper" ? Number(s.col) === 3 : s.type === "seater" && [0, 1].includes(Number(s.col))));
  if (mixed) return { kind: "reference-mixed", cols: 4, pos: (s: CrmMapSeat) => (s.type === "sleeper" ? 1 : Number(s.col) + 3) };
  const upper = d.deck === "UPPER" && Number(d.cols) === 4 && seats.length > 0 && seats.every((s) => s.type === "sleeper" && [0, 1, 3].includes(Number(s.col)));
  if (upper) return { kind: "reference-upper", cols: 4, pos: (s: CrmMapSeat) => (Number(s.col) === 3 ? 1 : Number(s.col) === 1 ? 3 : 4) };
  return { kind: "source", cols: Math.max(1, Math.min(12, n(d.cols) || 4)), pos: (s: CrmMapSeat) => n(s.col) + 1 };
}

function Deck({ d, b }: { d: CrmDeck; b: CrmBooking }) {
  const proj = projection(d), rows = Math.max(1, Math.min(120, n(d.rows) || 12)), lower = d.deck === "LOWER";
  const active = new Set(b.passengers.filter((p) => p.status !== "cancelled").map((p) => String(p.seat)));
  return (
    <section className={`cv8-deck cv8-v45-deck ${lower ? "cv8-deck-lower" : "cv8-deck-upper"} ${proj.kind}`} aria-label={`${d.deck} deck`}>
      <div className="cv8-deck-title"><strong>{d.deck}</strong>{lower && <span className="cv8-wheel" aria-label="Driver steering wheel" dangerouslySetInnerHTML={{ __html: STEERING }} />}</div>
      <div className="cv8-seatgrid" style={{ ["--cv8-columns" as string]: proj.cols, ["--cv8-rows" as string]: rows, gridTemplateColumns: `repeat(${proj.cols},minmax(0,1fr))`, gridTemplateRows: `repeat(${rows},44px)` }}>
        {d.seats.filter((s) => s.code).map((s) => {
          const state = b.status !== "cancelled" && active.has(String(s.code)) && s.booking?.isCurrent ? "selected" : STATUSES[s.status] ? s.status : "available";
          const long = s.type === "sleeper" || n(s.h) > 1;
          const row = Math.max(1, Math.min(120, n(s.row) + 1)), col = Math.max(1, Math.min(proj.cols, proj.pos(s)));
          const h = Math.max(1, Math.min(8, n(s.h) || 1)), w = Math.max(1, Math.min(proj.cols - col + 1, n(s.w) || 1));
          const count = Math.max(0, Math.min(999, Math.round(n(s.reservationCount))));
          const fare = s.fare == null || !Number.isFinite(Number(s.fare)) ? null : Math.round(Number(s.fare));
          const desc = `Seat ${s.code} · ${STATUSES[state]}${fare === null ? "" : ` · ₹${fare}`}${count ? ` · ${count} reservation${count === 1 ? "" : "s"} across the service` : ""}`;
          const countEl = count ? <span className={`cv8-seat-count${long ? " bottom" : ""}`} aria-hidden="true">×{count}</span> : null;
          return (
            <button key={s.code} type="button" className={`cv8-seat cv8-v45-seat ${long ? "cv8-berth" : "cv8-chair"} ${state}`} style={{ gridRow: `${row}/span ${h}`, gridColumn: `${col}/span ${w}` }}
              data-cv8-seat={s.code} data-cv8-seat-status={state} aria-label={desc} title={desc}>
              {long ? <><span className="cv8-seat-fare">{fare === null ? "—" : fare}</span><strong>{s.code}</strong>{countEl}</>
                : <><strong>{s.code}</strong>{fare !== null && <span className="cv8-seat-fare">{fare}</span>}{countEl}</>}
            </button>
          );
        })}
      </div>
      {lower && <><span className="cv8-emergency" title="Emergency exit" aria-label="Emergency exit" dangerouslySetInnerHTML={{ __html: EMERGENCY }} /><span className="cv8-exit" title="Door" aria-label="Door"></span></>}
    </section>
  );
}

function DetailsBox({ icon, title, more = "", children }: { icon: string; title: string; more?: string; children: React.ReactNode }) {
  return <section className={`cv8-detailcard ${more}`}><h3><span className="cv8-card-icon"><I n={icon} s={23} /></span>{title}</h3>{children}</section>;
}

function printBooking(b: CrmBooking, invoice: boolean) {
  const win = window.open("", "_blank", "width=860,height=700");
  if (!win) { toast("Allow popups to print the ticket", "warn"); return; }
  const e = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  win.document.write(`<!doctype html><html><head><title>${invoice ? "Payment statement" : "Ticket"} ${e(b.pnr)}</title><style>body{font:15px Arial,sans-serif;color:#17213d;margin:40px}h1{color:#235de9}table{border-collapse:collapse;width:100%}td,th{padding:10px;border:1px solid #ddd;text-align:left}</style></head><body><h1>${invoice ? "Booking payment statement" : "Passenger ticket"}</h1><p>Service ${e(b.service)} · PNR ${e(b.pnr)} · ${e(dmy(b.travelDate))}</p><p>${e(b.from)} → ${e(b.to)}</p><p>Contact ${e(b.contact.name)} · ${e(b.contact.phone)}</p><table><tr><th>Passenger</th><th>Seat</th><th>Fare</th></tr>${b.passengers.map((p) => `<tr><td>${e(p.name)}</td><td>${e(p.seat)}</td><td>${R(p.fare)}</td></tr>`).join("")}</table><h2>Total ${R(b.fare.total)}</h2><p>Payment status: ${e(b.payment)}</p>${invoice ? "<p>This is a payment statement, not a statutory GST tax invoice. Verify operator invoice details before issuing one.</p>" : ""}</body></html>`);
  win.document.close(); win.focus(); win.print();
}

const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** Legacy shiftBookingV45: date → service → seat per passenger → confirm → optional notification. */
async function shiftBooking(b: CrmBooking): Promise<boolean> {
  const pnr = b.pnr, active = b.passengers.filter((p) => p.status !== "cancelled");
  if (!active.length) { toast("This booking has no active passenger seats", "warn"); return false; }
  const proposed = b.travelDate.slice(0, 10) >= todayIso() ? b.travelDate.slice(0, 10) : todayIso();
  const dp = await promptDialog("Shift Passenger · Select journey date", [{ name: "date", label: "Target journey date", type: "date", required: true, value: proposed }], { ok: "Find services" });
  if (!dp) return false;
  const date = String(dp.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast("Select a valid journey date", "bad"); return false; }
  const { services } = await api.bookingShiftOptions(pnr, date);
  if (!services.length) { toast("No eligible active services with this journey direction", "warn"); return false; }
  const sc = await promptDialog("Shift Passenger · Select service", [{ name: "schedule_id", type: "select", label: "Target service", full: true, required: true,
    options: services.map((x) => [String(x.id), `${x.service} · ${x.departure_time} · ${x.free_seats} free seats`] as [string, string]) }], { ok: "Choose passenger seats" });
  if (!sc) return false;
  const selected = services.find((x) => String(x.id) === String(sc.schedule_id));
  if (!selected) { toast("Choose an available service", "bad"); return false; }
  const { seats: choices } = await api.bookingShiftSeats(pnr, selected.id);
  if (choices.length < active.length) { toast("Not enough available seats on the target service", "warn"); return false; }
  const asg = await promptDialog("Shift Passenger · Assign seats", [
    ...active.map((p, i) => ({ name: `seat_${i}`, label: `New seat for ${p.name} (${p.seat})`, type: "select" as const, required: true, full: true,
      options: choices.map((x) => [x.seat, `${x.seat} · ${(x.status || "available").replace(/_/g, " ")}`] as [string, string]) })),
    { name: "notify", label: "Record passenger notification after shift", type: "checkbox", value: true, full: true },
  ], { ok: "Review shift" });
  if (!asg) return false;
  const assigned = active.map((_, i) => String(asg[`seat_${i}`] || ""));
  if (assigned.some((x) => !choices.some((y) => y.seat === x)) || new Set(assigned).size !== assigned.length) { toast("Select a different available target seat for every passenger", "bad"); return false; }
  const seatMap = Object.fromEntries(active.map((p, i) => [p.seat, assigned[i]]));
  const desc = `${active.length} passenger(s) to ${date} · ${selected.service} · ${Object.entries(seatMap).map(([f, t]) => `${f} → ${t}`).join(", ")}`;
  if (!(await confirmDialog(`Confirm shift of ${desc}?`, { ok: "Confirm Shift" }))) return false;
  await api.bookingShift(pnr, selected.id, seatMap);
  if (asg.notify) {
    try { const n = await api.tripNotify(selected.id, { template: "ticket_confirmation", pnrs: [pnr] }); if (n.recorded) toast("Passenger message recorded; external delivery not verified", "ok"); }
    catch (e) { toast(`Shift saved, but notification was not recorded: ${e instanceof Error ? e.message : e}`, "warn"); }
  }
  return true;
}

export function BookingOverlay({ me, pnr, onClose, onChanged }: { me: Me; pnr: string; onClose: () => void; onChanged?: () => void }) {
  const [data, setData] = useState<{ booking: CrmBooking; map: { decks: CrmDeck[] } | null } | null>(null);
  const [rev, setRev] = useState(0);
  const [inspect, setInspect] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<Element | null>(document.activeElement);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const canOps = ["owner", "admin", "ops"].includes(me.role);

  useEffect(() => {
    let live = true;
    api.crmBooking(pnr).then((d) => { if (live) setData(d); }).catch((e) => { toastError(e); onClose(); });
    return () => { live = false; };
  }, [pnr, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    document.body.classList.add("cv8-locked");
    const key = (ev: KeyboardEvent) => { if (ev.key === "Escape") { if (document.querySelector("#modal-root .ov")) return; ev.preventDefault(); closeRef.current(); } };
    document.addEventListener("keydown", key);
    const prev = prevFocus.current;
    return () => {
      document.removeEventListener("keydown", key);
      if (!document.querySelector(".cv8-overlay")) document.body.classList.remove("cv8-locked");
      if (prev instanceof HTMLElement && prev.isConnected) prev.focus();
    };
  }, []);
  useEffect(() => { if (data) root.current?.querySelector<HTMLElement>(".cv8-dialog-close")?.focus(); }, [data]);
  if (!data) return null;

  const b = data.booking, f = b.fare;
  const base = Number(f.gross || 0), discount = Number(f.discount || 0), miles = Number(f.milesDiscount || 0), net = base - discount - miles;
  const confirmed = b.status === "confirmed";
  const refresh = () => { setRev((x) => x + 1); onChanged?.(); };
  const run = (f: () => Promise<void>) => { f().catch(toastError); };
  const act = (type: string) => run(async () => {
    if (type === "print") return printBooking(b, false);
    if (type === "invoice") { toast("A statutory tax invoice is not available; the document is a booking payment statement.", "warn"); return printBooking(b, true); }
    if (type === "chat") { onClose(); location.hash = `#/chats?q=${encodeURIComponent(b.contact.phone || "")}`; return; }
    if (type === "comment") {
      const v = await promptDialog("Add booking comment", [{ name: "text", label: "Comment", type: "textarea", required: true, full: true }], { ok: "Add comment" });
      if (v?.text) { await api.bookingComment(b.pnr, String(v.text).trim()); refresh(); }
      return;
    }
    if (type === "history") {
      const h = await api.bookingHistory(b.pnr);
      await infoDialog(`Ticket history · ${b.ticketNumber || b.pnr}`, <div className="cv8-history">{h.events.length ? h.events.map((x) => (
        <div key={x.id}><b>{x.title || "Change"}</b> · {datetime(x.at)}<div>{x.actor || "System"} · {x.source || "GDS"}</div>{x.details.map((y, i) => <p key={i}>{y.label}: {y.value}</p>)}</div>
      )) : <p>No recorded booking events.</p>}</div>, "lg");
      return;
    }
    if (type === "edit") {
      const v = await promptDialog("Update ticket", [{ name: "name", label: "Contact name", value: b.contact.name }, { name: "phone", label: "Mobile", value: b.contact.phone }, { name: "email", label: "Email", value: b.contact.email || "" },
        ...b.passengers.map((p, i) => ({ name: `p_${i}`, label: `Passenger ${p.seat}`, value: p.name }))], { ok: "Save changes" });
      if (v) {
        await api.bookingEdit(b.pnr, { contact: { name: String(v.name ?? ""), phone: String(v.phone ?? ""), email: String(v.email ?? "") }, passengers: b.passengers.map((p, i) => ({ seat: p.seat, name: String(v[`p_${i}`] ?? p.name) })) });
        toast("Booking updated", "ok"); refresh();
      }
      return;
    }
    if (type === "cancel") {
      const q = await api.bookingRefundQuote(b.pnr);
      const v = await promptDialog("Cancel ticket", [{ name: "by", label: "Cancelled by", type: "select", options: [["passenger", `Passenger · ${q.refund_pct}% policy refund`], ["operator", "Operator · 100% refund"]] },
        { name: "reason", label: "Reason", required: true }, { name: "notify", label: "Notify passenger", type: "checkbox", value: true }], { ok: "Cancel booking" });
      if (v && (await confirmDialog("Confirm ticket cancellation?", { ok: "Cancel ticket" }))) {
        await api.bookingCancel(b.pnr, { seats: b.passengers.filter((p) => p.status !== "cancelled").map((p) => p.seat), by: String(v.by), reason: String(v.reason), notify: !!v.notify });
        toast("Booking cancellation recorded", "ok"); refresh();
      }
      return;
    }
    if (type === "shift") {
      if (b.status !== "confirmed") return toast("Only confirmed tickets can be shifted with permission", "warn");
      if (await shiftBooking(b)) { toast("Passenger shifted successfully", "ok"); refresh(); }
    }
  });
  const notify = (t: string) => run(async () => {
    setNotifyOpen(false);
    let text = "";
    if (t === "custom" || t === "bus_cancellation") {
      const v = await promptDialog(t === "custom" ? "Bus delay / early notification" : "Bus cancellation notice", [{ name: "minutes", label: "Delay / early (minutes)", type: "number", value: 0 }, { name: "reason", label: "Reason / message", type: "textarea", full: true, required: true }], { ok: "Send message" });
      if (!v) return;
      text = t === "custom" ? `Bus update: ${v.minutes || 0} minute(s). ${v.reason}` : String(v.reason);
    }
    if (!(await confirmDialog(`Send ${t.replace(/_/g, " ")} notification for PNR ${b.pnr}?`, { ok: "Send notification" }))) return;
    const r = await api.tripNotify(b.scheduleId, { pnrs: [b.pnr], template: t, text });
    toast(r.recorded ? `Message recorded for ${r.recorded} booking(s); external delivery is not verified.` : "No eligible confirmed booking found", r.recorded ? "ok" : "warn");
  });
  const btn = (type: string, enabled: boolean, title: string, cls?: string) => ({
    className: cls, "data-cv8-action": type, disabled: !enabled || undefined, title: enabled ? undefined : title, onClick: () => act(type),
  });
  const seats = b.passengers.filter((p) => p.status !== "cancelled").length;

  return createPortal(
    <div ref={root} className="cv8-overlay cv8-v45-overlay" role="dialog" aria-modal="true" aria-label={`Booking details ${pnr}`}
      onClick={(ev) => {
        const seat = (ev.target as Element).closest("[data-cv8-seat]");
        if (seat) { setInspect(seat.getAttribute("aria-label") || ""); return; }
        if (ev.target === root.current || (ev.target as Element).closest("[data-cv8-close]")) onClose();
      }}>
      <div className="cv8-dialog">
        <header className="cv8-dialog-hd"><h2>Book Seats - {b.service}</h2><div>{`${b.from} → ${b.to} • ${journeyDate(b.travelDate)}`}</div>
          <button className="cv8-dialog-close" data-cv8-close="" title="Close"><I n="x" s={24} /></button></header>
        <div className="cv8-dialog-body">
          <div className="cv8-map-side">
            <div className="cv8-map-wrap"><div className="cv8-busmaps">
              {data.map?.decks.length ? [...data.map.decks].sort((a, z) => (a.deck === "LOWER" ? -1 : z.deck === "LOWER" ? 1 : 0)).map((d) => <Deck key={d.deck} d={d} b={b} />)
                : <div className="cv8-unavailable">Seat layout unavailable for this booking.</div>}
            </div></div>
            <div className="cv8-seat-inspection" data-cv8-seat-inspection="" role="status" aria-live="polite">{inspect}</div>
            <div className="cv8-seat-rule"><I n="users" /> Seat availability and adjacency restrictions follow the current route configuration.</div>
          </div>
          <aside className="cv8-dialog-side">
            <section className="cv8-actionbar">
              <button {...btn("edit", confirmed && canOps, "Requires confirmed booking and permission", "primary")}><I n="edit" /> Update Ticket</button>
              <button data-cv8-action="print" onClick={() => act("print")}><I n="printer" /> Print Ticket</button>
              <button data-cv8-action="invoice" onClick={() => act("invoice")}><I n="clipboard" /> Print Invoice</button>
              <span className="cv8-notifyholder">
                <button data-cv8-action="notify-toggle" disabled={!canOps || undefined} title={canOps ? undefined : "Messaging permission required"} onClick={() => setNotifyOpen((o) => !o)}><I n="bell" /> Notify <I n="chevron" s={14} /></button>
                <div className="cv8-notifymenu" data-cv8-notifymenu="" hidden={!notifyOpen}>
                  {[["ticket_confirmation", "Ticket Confirmation", "Resend booking confirmation"], ["bus_details", "Bus Details", "Tracker + bus + driver"], ["custom", "Bus Delay / Early", "Reason + minutes + tracker"], ["bus_cancellation", "Bus Cancellation", "Inform pax; cancellation is separate"]].map(([k, t, st]) => (
                    <button key={k} data-cv8-notify={k} onClick={() => notify(k)}><b>{t}</b><small>{st}</small></button>
                  ))}
                </div>
              </span>
              <button {...btn("cancel", confirmed && canOps, "Requires confirmed booking and cancellation permission", "danger")}><I n="circlex" /> Cancel Ticket</button>
              <button {...btn("shift", confirmed && canOps, "Requires confirmed booking and access")}><I n="arrows" /> Shift Passenger</button>
              <button {...btn("history", canOps, "Booking history requires access")}><I n="history" /> Show History</button>
              <button {...btn("chat", canOps, "Chat permission required")}><I n="chat" /> Chat Pax</button>
              <button {...btn("comment", canOps, "Booking comment permission required")}><I n="plus" /> Comment</button>
            </section>
            <section className={`cv8-detailcard booking${collapsed ? " is-collapsed" : ""}`} data-cv8-bookingcard="">
              <span className="cv8-booking-icon"><I n="ticket" s={26} /></span>
              <div className="cv8-booking-main"><h3>Booking Details <small>({seats} seat{seats === 1 ? "" : "s"})</small></h3>
                <p>PNR: <b className="cv8-blue">{b.ticketNumber || b.pnr}</b>{` \u00a0 Ref: ${b.pnr} `}<span className="cv8-source">{b.source || "GDS"}</span></p>
                <p className="cv8-muted">Booked: {datetime(b.bookedAt)}</p></div>
              <button type="button" className="cv8-booking-collapse" data-cv8-action="booking-collapse" aria-expanded={!collapsed} aria-label={collapsed ? "Expand booking details" : "Collapse booking details"}
                onClick={() => setCollapsed((c) => !c)}><I n="x" s={24} /></button>
            </section>
            <section className="cv8-commentcard"><div>COMMENTS <button {...btn("comment", canOps, "Booking comment permission required")}><I n="plus" s={16} /> Add comment</button></div>
              {b.comments.length ? b.comments.map((c, i) => <p key={i}>{c.text}<small>{` · ${c.by} ${datetime(c.at)}`}</small></p>) : <p className="cv8-muted">No comments yet</p>}</section>
            <DetailsBox icon="calendar" title="Contact & Journey Details" more="contact">
              <div className="cv8-contactgrid">
                <div><I n="phone" s={22} /> <span><small>MOBILE</small><strong>{b.contact.phone || "—"}</strong></span></div>
                <div><I n="mail" s={22} /> <span><small>EMAIL</small><strong>{b.contact.email || "N/A"}</strong></span></div>
                <div><I n="pin" s={22} /> <span><small>PICKUP POINT</small><strong>{b.boarding?.name || b.from}</strong></span><b>{time(b.boarding?.time)}</b></div>
                <div><I n="pin" s={22} /> <span><small>DROP POINT</small><strong>{b.dropping?.name || b.to}</strong></span><b>{time(b.dropping?.time)}</b></div>
              </div>
            </DetailsBox>
            <div className="cv8-sectionhead"><I n="users" s={24} /> <h3>Passenger Information</h3></div>
            {b.passengers.map((p) => {
              const gd = String(p.gender || "").toUpperCase(), g = gd === "F" || gd === "FEMALE" ? "female" : gd === "M" || gd === "MALE" ? "male" : "other";
              return (
                <div key={p.seat} className="cv8-passenger"><span className="cv8-seatlabel">{p.seat}</span>
                  <div><b>{p.name || "Passenger"}</b><div><span className={`cv8-gender ${g}`}>{g === "female" ? "♀ Female" : g === "male" ? "♂ Male" : "Other"}</span>{" "}
                    <span className="cv8-person-age">{p.age == null ? "—" : `${p.age}y`}</span>{p.status === "cancelled" && <>{" "}<span className="cv8-passenger-cancelled">Cancelled</span></>}</div></div>
                  <span className="cv8-passfare">{R(p.fare)}</span></div>
              );
            })}
            <DetailsBox icon="clipboard" title="" more="fare">
              <div className="cv8-fare-row"><span>Base Fare ({b.passengers.length} seat{b.passengers.length > 1 ? "s" : ""})</span>{R(base)}</div>
              <div className="cv8-fare-row good"><span>Discount</span>−{R(discount)}</div>
              {miles ? <div className="cv8-fare-row good"><span>Miles redeemed</span>−{R(miles)}</div> : null}
              <div className="cv8-fare-row"><span>Net Fare</span>{R(net)}</div>
              <div className="cv8-fare-row"><span>GST (5%)</span>{R(f.gst)}</div>
              <div className="cv8-fare-row total"><strong>Total Payable</strong><strong>{R(f.total)}</strong></div>
              <div className="cv8-fare-row good"><span>Amount Paid</span>{b.payment === "paid" ? R(f.total) : b.payment === "settle_later" ? "Pending settlement" : b.payment === "unpaid" ? "Not paid" : "—"}</div>
            </DetailsBox>
            <DetailsBox icon="wallet" title="" more="payment">
              <div className="cv8-paid">Payment: <span className="cv8-paidbadge">{b.payment || "Unknown"}</span></div>
              <div className="cv8-fare-row"><span>Method</span>{b.paymentMethod || "Not recorded"}</div>
              <div className="cv8-fare-row"><span>Source</span>{b.source}</div>
              {f.commission != null && <div className="cv8-fare-row"><span>Commission</span>{R(f.commission)}</div>}
            </DetailsBox>
            <div className="cv8-dialog-foot"><button className="cv8-primary" data-cv8-close=""><I n="x" /> Close</button></div>
          </aside>
        </div>
        <div className="cv8-outerfooter"><button data-cv8-close="">Close</button></div>
      </div>
    </div>,
    document.body,
  );
}
