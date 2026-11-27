import { useEffect, useState } from "react";
import { api, type BookingStop, type CrmBooking } from "../../api";
import { confirmDialog, infoDialog, promptDialog, toast, toastError } from "../../components/ui/feedback";
import { can } from "../settings/legacy";
import { printBooking } from "../crm/BookingOverlay";

// React port of legacy public/js/booking-ticket-v38.js: integrated PNR ticket workspace shown in the
// Schedule → Bookings right panel (view / edit / shift modes, comments, notify, cancel, history, print).
const S: Record<string, string> = {
  ticket: "M3 6h18v12H3zM8 6v3m0 6v3M16 6v3m0 6v3", close: "M18 6 6 18M6 6l12 12", print: "M6 9V3h12v6M6 18H3V9h18v9h-3M6 15h12v7H6z",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 12a2 2 0 0 0 4 0", history: "M3 12a9 9 0 1 0 3-6.7M3 3v5h5m4-1v5l3 2",
  people: "M2 21v-3a6 6 0 0 1 12 0v3m4-9a4 4 0 0 0 0-8m1 17v-3a6 6 0 0 0-3-5M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  phone: "M22 17v3a2 2 0 0 1-2.2 2A20 20 0 0 1 2 4.2 2 2 0 0 1 4 2h3l2 5-3 2a16 16 0 0 0 9 9l2-3 5 2Z", search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4-4",
  chevron: "m6 9 6 6 6-6", arrow: "M5 12h14m-6-6 6 6-6 6", chat: "M4 4h16v12H8l-4 4V4Z", edit: "m15 4 5 5M4 20l5-1L20 8a3 3 0 0 0-4-4L5 15z",
  calendar: "M3 4h18v18H3zM7 2v4m10-4v4M3 10h18", check: "m5 12 5 5L19 7", pin: "M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 0 1 16 0Zm-8 2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
};
const Ic = ({ n, s = 19 }: { n: string; s?: number }) => <svg className="sx38-svg" viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={S[n] ?? S.ticket} /></svg>;
const Btn = ({ label, n, cls = "", disabled, onClick, attrs }: { label: string; n: string; cls?: string; disabled?: boolean; onClick: () => void; attrs?: Record<string, string> }) =>
  <button type="button" className={`sx38-btn ${cls}`} disabled={disabled} onClick={onClick} {...attrs}><Ic n={n} s={18} /> <span>{label}</span></button>;
const money = (x: unknown) => `₹${(Number(x) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fdt = (x?: string | null) => { if (!x) return "—"; const d = new Date(x); return Number.isFinite(+d) ? d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : x; };
const fdate = (s?: string | null) => { const d = new Date(String(s ?? "").slice(0, 10) + "T12:00:00"); return Number.isFinite(+d) ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : String(s || "—"); };
const t12 = (s?: string | null) => s && /^\d\d:\d\d/.test(s) ? `${Number(s.slice(0, 2)) % 12 || 12}:${s.slice(3, 5)} ${Number(s.slice(0, 2)) >= 12 ? "PM" : "AM"}` : s || "—";
const gcode = (x?: string | null) => /^F/i.test(String(x ?? "")) ? "F" : /^O/i.test(String(x ?? "")) ? "O" : "M";
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const Tag = ({ t, cls = "" }: { t: string; cls?: string }) => <span className={`sx38-tag ${cls}`}>{t}</span>;
const Heading = ({ title, n }: { title: string; n: string }) => <h3 className="sx38-section-heading"><span className="sx38-section-icon"><Ic n={n} s={22} /></span>{title}</h3>;

type Edit = { contact: { name: string; phone: string; email: string }; passengers: { seat: string; name: string; age: string; gender: string; fare: number }[]; boarding?: number | null; dropping?: number | null; notify: boolean };
type Stops = { boarding_stage_id: number | null; dropping_stage_id: number | null; pickups: BookingStop[]; drops: BookingStop[] };
type Shift = { date: string; service: string; services: { id: number; service: string; departure_time: string; free_seats: number }[]; seats: { seat: string }[]; assignment: Record<string, string>; chosen: number; notify: boolean };

export function TicketWorkspaceV38({ pnr, seat, tripId, onClose, onChanged }: { pnr: string; seat?: string; tripId: number; onClose: () => void; onChanged: () => void }) {
  const [b, setB] = useState<CrmBooking>();
  const [err, setErr] = useState("");
  const [mode, setMode] = useState<"view" | "edit" | "shift">("view");
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [edit, setEdit] = useState<Edit>();
  const [stops, setStops] = useState<Stops>();
  const [stopOpen, setStopOpen] = useState<"" | "pickup" | "drop">("");
  const [stopQ, setStopQ] = useState("");
  const [sh, setSh] = useState<Shift>();
  const reload = () => api.crmBooking(pnr).then((r) => { setB(r.booking); setErr(""); }).catch((e) => setErr((e as Error).message));
  useEffect(() => { setB(undefined); setMode("view"); setNotifyOpen(false); setCommentOpen(false); void reload(); }, [pnr]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!b) return <div className="sx38-no-data">{err || "Loading booking details…"}<p><button type="button" data-v38="chart" onClick={onClose}>Back to Pickup Chart</button></p></div>;
  const active = b.passengers.filter((p) => p.status !== "cancelled");
  const confirmed = b.status === "confirmed";
  const canEdit = confirmed && can("bookings.modify"), canCancel = confirmed && can("bookings.cancel"), canChat = can("chats.view");
  const after = async () => { await reload(); onChanged(); };
  const run = (f: () => Promise<unknown>) => () => { void f().catch(toastError); };

  const ticketNotify = (template: string) => run(async () => {
    setNotifyOpen(false);
    if (!can("trips.chat")) return toast("Notification permission required", "bad");
    let text = "";
    if (template === "custom") {
      const p = await promptDialog("Custom notification", [{ name: "text", label: "Message", full: true }], { ok: "Record notification" });
      if (!p) return; text = String(p.text ?? "").trim(); if (!text) return toast("Enter message text", "bad");
    }
    if (!(await confirmDialog(`Record ${template.replaceAll("_", " ")} for PNR ${b.ticketNumber || b.pnr}? Delivery is not verified.`, { ok: "Record" }))) return;
    const r = await api.tripNotify(tripId, { template, pnrs: [pnr], text });
    toast(`${r.recorded ?? 0} notification record(s) saved; provider delivery is unverified`, "ok");
  })();

  const cancelTicket = run(async () => {
    if (!canCancel) return;
    const subset = seat && active.some((p) => p.seat === seat) ? [seat] : active.map((p) => p.seat);
    const q = await api.bookingRefundQuote(pnr);
    const p = await promptDialog(`Cancel ticket ${b.ticketNumber || pnr}`, [
      { name: "seats", label: "Seats to cancel (comma-separated)", value: subset.join(", "), required: true },
      { name: "by", label: "Cancelled by", type: "select", options: [["passenger", `Passenger (policy ${q.refund_pct}% refund)`], ["operator", "Operator (authorized override)"]] },
      { name: "reason", label: "Reason for cancellation", full: true },
      { name: "notify", label: "Notify passenger", type: "checkbox", value: true },
    ], { ok: "Review cancellation" });
    if (!p) return;
    const seats = String(p.seats ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    if (!seats.length || seats.some((x) => !active.some((a) => a.seat === x))) return toast("Choose valid active passenger seats", "bad");
    if (!(await confirmDialog(`Cancel seats ${seats.join(", ")} under PNR ${b.ticketNumber || pnr}? The operation cannot be undone and refunds follow cancellation policy.`, { ok: "Confirm Cancellation", danger: true }))) return;
    const r = await api.bookingCancel(pnr, { seats, by: String(p.by || "passenger"), reason: String(p.reason || "") || "Cancellation requested", notify: !!p.notify });
    toast(`Ticket cancellation recorded · refund ${money(r.refund)}`, "ok");
    await after();
  });

  const history = run(async () => {
    const h = await api.bookingHistory(pnr);
    const node = (k: string) => k === "created" ? "ticket" : k === "discount" ? "edit" : k === "cancel" ? "close" : "check";
    await infoDialog(`PNR History　${h.ticket_number || h.pnr}　| ${h.pnr}`, <div className="sx38-history-dialog"><p>Every recorded change to this booking — who did what, when, and from where.</p>
      {h.events.length ? h.events.map((x) => <div key={x.id} className="sx38-history-event"><span className="sx38-history-node"><Ic n={node(x.kind)} s={20} /></span>
        <article><header><b>{x.title}</b><small>{fdt(x.at)}</small></header>{x.details.map((y, i) => <p key={i}>{y.label}　<strong>{y.value}</strong></p>)}
          <footer>Source: {x.source || "GDS"} · By: {x.actor || "System"}</footer></article></div>) : <p>No recorded changes yet.</p>}</div>, "lg");
  });

  const startEdit = run(async () => {
    if (!canEdit) return;
    const st = await api.bookingStops(pnr);
    setStops(st);
    setEdit({ contact: { name: b.contact.name || "", phone: b.contact.phone || "", email: b.contact.email || "" },
      passengers: active.map((p) => ({ seat: p.seat, name: p.name || "", age: p.age == null ? "" : String(p.age), gender: gcode(p.gender), fare: p.fare })),
      boarding: st.boarding_stage_id, dropping: st.dropping_stage_id, notify: true });
    setStopOpen(""); setMode("edit");
  });
  const saveEdit = run(async () => {
    if (!edit || !can("bookings.modify")) return;
    if (!/^\d{10}$/.test(edit.contact.phone.trim())) return toast("Enter a valid 10-digit mobile number", "bad");
    if (edit.passengers.some((p) => !p.name.trim() || !(Number(p.age) >= 1 && Number(p.age) <= 120))) return toast("Enter passenger names and ages 1–120", "bad");
    await api.bookingEdit(pnr, { contact: { ...edit.contact, phone: edit.contact.phone.trim(), name: b.contact.name || edit.passengers[0]?.name || "Passenger" },
      passengers: edit.passengers.map((p) => ({ seat: p.seat, name: p.name.trim(), age: Number(p.age), gender: p.gender })),
      boardingStageId: edit.boarding ?? undefined, droppingStageId: edit.dropping ?? undefined });
    let warning = "";
    if (edit.notify) {
      try { const r = await api.tripNotify(tripId, { template: "ticket_confirmation", pnrs: [pnr] }); if (!r.recorded) warning = "; notification was not recorded"; }
      catch (e) { warning = `; notification could not be recorded: ${(e as Error).message}`; }
    }
    setMode("view"); setEdit(undefined); await after();
    toast(`Booking changes saved${warning}`, "ok");
  });

  const loadServices = async (date: string, base: Shift) => {
    const r = await api.bookingShiftOptions(pnr, date);
    setSh({ ...base, date, services: r.services, service: "", seats: [], assignment: {}, chosen: 0 });
  };
  const startShift = run(async () => {
    if (!canEdit) return;
    const date = b.travelDate.slice(0, 10) >= today() ? b.travelDate.slice(0, 10) : today();
    const base: Shift = { date, service: "", services: [], seats: [], assignment: {}, chosen: 0, notify: true };
    setSh(base); setMode("shift"); await loadServices(date, base);
  });
  const pickService = (id: string) => run(async () => {
    if (!sh) return;
    const next = { ...sh, service: id, seats: [], assignment: {}, chosen: 0 };
    setSh(next);
    if (id) { const r = await api.bookingShiftSeats(pnr, Number(id)); setSh({ ...next, seats: r.seats }); }
  })();
  const pickSeat = (code: string) => {
    if (!sh) return;
    const person = active[sh.chosen] ?? active.find((p) => !sh.assignment[p.seat]);
    if (!person) return;
    const asg = Object.fromEntries(Object.entries(sh.assignment).filter(([, v]) => v !== code));
    asg[person.seat] = code;
    const nx = active.findIndex((p) => !asg[p.seat]);
    setSh({ ...sh, assignment: asg, chosen: nx < 0 ? sh.chosen : nx });
  };
  const confirmShift = run(async () => {
    if (!sh || !sh.service || active.some((p) => !sh.assignment[p.seat])) return;
    if (!(await confirmDialog(`Shift ${active.length} passenger(s) to ${sh.date}? This changes their trip and seat assignment.`, { ok: "Confirm Shift" }))) return;
    await api.bookingShift(pnr, Number(sh.service), sh.assignment);
    let warning = "";
    if (sh.notify) { try { const r = await api.tripNotify(Number(sh.service), { template: "ticket_confirmation", pnrs: [pnr] }); if (!r.recorded) warning = "; notification not recorded"; } catch { warning = "; notification not recorded"; } }
    setMode("view"); setSh(undefined); await after();
    toast(`Passenger shifted successfully${warning}`, "ok");
  });

  const saveComment = run(async () => {
    const text = commentText.trim(); if (!text) return;
    await api.bookingComment(pnr, text);
    setCommentOpen(false); setCommentText(""); await reload();
    toast("Internal comment saved", "ok");
  });

  const chat = () => { if (!canChat) return; location.hash = `#/chats?q=${encodeURIComponent(b.contact.phone || "")}`; };

  const head = (editing = false) => <section className="sx38-ticket-head"><span className="sx38-head-icon"><Ic n="ticket" s={24} /></span>
    <div><h2>{editing ? "Edit Booking" : "Booking Details"} <small>({active.length} seat{active.length === 1 ? "" : "s"})</small></h2>
      <p>PNR: <strong>{b.ticketNumber || b.pnr}</strong>　Ref: {b.pnr}　<Tag t={b.source || "GDS"} cls="source" /></p>
      <small>Booked: {fdt(b.bookedAt)}</small></div>
    <button type="button" className="sx38-head-close" data-v38="close-ticket" aria-label="Close ticket" onClick={onClose}><Ic n="close" s={24} /></button></section>;

  const toolbar = <div className="sx38-ticket-toolbar">
    <Btn label="Update Ticket" n="edit" cls="primary" disabled={!canEdit} onClick={startEdit} />
    <Btn label="Print Ticket" n="print" onClick={() => printBooking(b, false)} />
    <Btn label="Print Invoice" n="ticket" onClick={() => toast("Print invoice feature coming soon", "warn")} />
    <div className="sx38-notify-wrap"><Btn label="Notify" n="bell" onClick={() => setNotifyOpen((o) => !o)} />
      {notifyOpen && <div className="sx38-notify-dropdown" role="menu">{[["ticket_confirmation", "Ticket Confirmation"], ["bus_details", "Bus Details"], ["custom", "Custom Message"]].map(([k, l]) =>
        <button key={k} type="button" role="menuitem" data-v38="notify-send" data-template={k} onClick={() => ticketNotify(k)}>{l}</button>)}</div>}</div>
    <Btn label="Cancel Ticket" n="close" cls="danger" disabled={!canCancel} onClick={cancelTicket} />
    <Btn label="Shift Passenger" n="arrow" disabled={!canEdit} onClick={startShift} />
    <Btn label="Show History" n="history" onClick={history} />
    <Btn label="Chat Pax" n="chat" disabled={!canChat} onClick={chat} />
    <Btn label="Comment" n="chat" onClick={() => { setCommentOpen((o) => !o); setCommentText(""); }} />
  </div>;

  const view = <>
    {head()}
    <section className="sx38-comments"><div className="sx38-section-title"><span>COMMENTS</span>
      <button type="button" data-v38="comment" onClick={() => { setCommentOpen((o) => !o); setCommentText(""); }}><Ic n="chat" s={16} /> Add comment</button></div>
      {b.comments.length ? b.comments.map((c, i) => <div key={i} className="sx38-comment-entry"><b>{c.by || "Staff"}</b> <small>{fdt(c.at)}</small><p>{c.text}</p></div>) : <p className="sx38-muted">No comments yet</p>}
      {commentOpen && <div className="sx38-comment-edit"><textarea rows={4} maxLength={2000} placeholder="Note for the record — staff only, never sent to the passenger" value={commentText} onChange={(e) => setCommentText(e.target.value)} />
        <div><button type="button" onClick={() => { setCommentOpen(false); setCommentText(""); }}>Cancel</button><button type="button" className="sx38-btn primary" disabled={!commentText.trim()} onClick={saveComment}>Save comment</button></div></div>}
    </section>
    <section className="sx38-detail-card"><Heading title="Contact & Journey Details" n="calendar" />
      <div className="sx38-detail-grid">{([["MOBILE", b.contact.phone || "—", "phone"], ["EMAIL", b.contact.email || "N/A", "chat"], ["PICKUP POINT", b.boarding?.name || "—", "pin"], ["DROP POINT", b.dropping?.name || "—", "pin"]] as const).map(([l, v, n], i) =>
        <div key={l} className="sx38-detail-item"><span className="sx38-detail-icon"><Ic n={n} s={20} /></span><div><small>{l}</small><strong title={v}>{v}</strong></div>
          {i >= 2 && <span className="sx38-time-pill">{t12((i === 2 ? b.boarding : b.dropping)?.time)}</span>}</div>)}</div></section>
    <section className="sx38-passengers"><Heading title="Passenger Information" n="people" />
      {active.map((p) => { const g = gcode(p.gender); return <div key={p.seat} className="sx38-passenger-card"><span className="sx38-seat-ref">{p.seat}</span>
        <div className="sx38-passenger-name"><strong>{p.name || "Passenger"}</strong><div><Tag t={g === "F" ? "♀ Female" : g === "M" ? "♂ Male" : "Other"} cls={g === "F" ? "female" : "male"} /> <small>{p.age ?? "—"}y</small></div></div>
        <b className="sx38-passenger-fare">{money(p.fare)}</b></div>; })}</section>
    <section className="sx38-fare-card"><span className="sx38-section-icon"><Ic n="ticket" s={21} /></span><div className="sx38-fare-lines">
      {([[`Base Fare (${active.length} seat)`, b.fare.gross], ["Discount", -(b.fare.discount || 0)], ["Net Fare", b.fare.net], ["GST (5%)", b.fare.gst]] as const).map(([l, v]) =>
        <div key={l} className={`sx38-fare-row ${l === "Discount" ? "discount" : ""}`}><span>{l}</span><span>{money(v)}</span></div>)}
      <div className="sx38-fare-row total"><b>Total Payable</b><strong>{money(b.fare.total)}</strong></div>
      <div className="sx38-fare-row paid"><span>Amount {b.payment === "paid" ? "Paid" : "Due / Settled Later"}</span><strong>{money(b.payment === "paid" ? b.fare.total : 0)}</strong></div>
    </div></section>
    <section className="sx38-payment-card"><h3>Payment: <Tag t={b.payment || "Unknown"} cls={b.payment === "paid" ? "paid" : ""} /></h3>
      <dl><dt>Paid</dt><dd>{b.paymentMethod || b.payment || "Not specified"}</dd><dt>Channel</dt><dd>{b.source || "GDS"}</dd>
        <dt>Operator settlement</dt><dd>{b.fare.commission != null ? `Commission ${money(b.fare.commission)}` : "No settlement breakdown provided"}</dd></dl></section>
    <div className="sx38-ticket-footer"><Btn label="Close" n="close" cls="primary" onClick={onClose} /></div>
  </>;

  const stopsMenu = (kind: "pickup" | "drop") => {
    if (!edit) return null;
    const pick = kind === "pickup", rows = (pick ? stops?.pickups : stops?.drops) ?? [];
    const chosen = pick ? edit.boarding : edit.dropping, sel = rows.find((s) => s.id === chosen);
    const original = rows.find((s) => s.id === (pick ? stops?.boarding_stage_id : stops?.dropping_stage_id));
    const opened = stopOpen === kind;
    return <div className="sx38-stop-field"><button type="button" className="sx38-stop-trigger" aria-expanded={opened} aria-haspopup="listbox" onClick={() => { setStopOpen(opened ? "" : kind); setStopQ(""); }}>
      <span>{sel?.name || `Select ${pick ? "pickup" : "drop"} point`}{sel?.time ? ` - ${t12(sel.time)}` : ""}</span><Ic n="chevron" s={16} /></button>
      {opened && <div className="sx38-stop-menu" role="listbox" aria-label={`${pick ? "Pickup" : "Drop"} points`}>
        <label className="sx38-stop-search"><Ic n="search" /><input type="search" placeholder="Search" aria-label="Search stops" value={stopQ} onChange={(e) => setStopQ(e.target.value)} autoFocus /></label>
        <div className="sx38-stop-options"><div className="sx38-stop-city"><Ic n="pin" s={14} /> {rows[0]?.city_name || "CITY"}</div>
          {rows.filter((s) => !stopQ || `${s.name} ${s.pickup_type ?? ""} ${t12(s.time)}`.toLowerCase().includes(stopQ.toLowerCase())).map((s) =>
            <button key={s.id} type="button" role="option" aria-selected={s.id === chosen} title={s.name} onClick={() => { setEdit({ ...edit, [pick ? "boarding" : "dropping"]: s.id }); setStopOpen(""); }}>
              <span className="sx38-stop-dot"><Ic n="pin" s={16} /></span><span className="sx38-stop-name">{s.name}<small>{s.pickup_type || ""}</small></span>
              <span className="sx38-time-pill">{t12(s.time)}</span>{s.id === chosen && <Ic n="check" s={17} />}</button>)}</div></div>}
      <small>Booked: {original?.name || "—"}</small></div>;
  };
  const setPax = (i: number, patch: Partial<Edit["passengers"][number]>) => edit && setEdit({ ...edit, passengers: edit.passengers.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const editor = edit ? <>
    {head(true)}
    <section className="sx38-editor-details"><Heading title="Contact & Journey Details" n="calendar" /><div className="sx38-editor-grid">
      <label className="sx38-edit-field"><span></span><input name="contact_phone" type="tel" value={edit.contact.phone} onChange={(e) => setEdit({ ...edit, contact: { ...edit.contact, phone: e.target.value } })} /></label>
      <label className="sx38-edit-field"><span></span><input name="contact_email" type="email" value={edit.contact.email} onChange={(e) => setEdit({ ...edit, contact: { ...edit.contact, email: e.target.value } })} /></label>
      {stopsMenu("pickup")}{stopsMenu("drop")}</div></section>
    <section className="sx38-editor-passengers"><Heading title="Passenger Information" n="people" />
      {edit.passengers.map((p, i) => <div key={p.seat} className="sx38-edit-pax"><div className="sx38-edit-row"><span className="sx38-seat-ref">{p.seat}</span>
        <input aria-label={`Passenger name seat ${p.seat}`} value={p.name} maxLength={120} onChange={(e) => setPax(i, { name: e.target.value })} />
        <input aria-label="Age" type="number" min={1} max={120} value={p.age} onChange={(e) => setPax(i, { age: e.target.value })} /></div>
        <div className="sx38-edit-genders">{([["M", "Male"], ["F", "Female"], ["O", "Other"]] as const).map(([g, l]) => <button key={g} type="button" className={p.gender === g ? "active" : ""} onClick={() => setPax(i, { gender: g })}>{l}</button>)}</div>
        <b>{money(p.fare)}</b></div>)}</section>
    <div className="sx38-edit-summary"><div><span>Subtotal ({edit.passengers.length} seat)</span><span>{money(b.fare.total)}</span></div><div className="total"><b>Total Amount</b><strong>{money(b.fare.total)}</strong></div></div>
    <label className="sx38-notify-checkbox"><input type="checkbox" checked={edit.notify} onChange={(e) => setEdit({ ...edit, notify: e.target.checked })} /> Notify Passenger</label>
    <div className="sx38-submit-row"><button type="button" onClick={() => { setMode("view"); setStopOpen(""); }}>Back</button><button type="button" className="primary" onClick={saveEdit}>Save Changes</button></div>
  </> : <div className="sx38-no-data">Preparing editor…</div>;

  const used = new Set(Object.values(sh?.assignment ?? {}));
  const ready = !!sh?.service && active.every((p) => sh.assignment[p.seat]);
  const shift = sh ? <div className="sx38-shift-layout"><div className="sx38-shift-inventory">
    {sh.service ? <><h3>Available seats · {sh.seats.length}</h3><div className="sx38-shift-seat-grid">{sh.seats.map((s) =>
      <button key={s.seat} type="button" className={used.has(s.seat) ? "assigned" : ""} disabled={used.has(s.seat)} onClick={() => pickSeat(s.seat)}>{s.seat}</button>)}</div>
      <small>Select a passenger, then select an available seat.</small></> : <div className="sx38-shift-empty">Select date and service to<br />view available seats</div>}</div>
    <div className="sx38-shift-form"><header><h2>Shift Passenger</h2><button type="button" aria-label="Close shift editor" onClick={() => setMode("view")}><Ic n="close" /></button></header>
      <section className="sx38-current-booking"><h3>Current Booking</h3><p>PNR: <strong>{b.pnr}</strong></p>
        <div><span>Date: {fdate(b.travelDate)}</span><span>Route: {b.from} → {b.to}</span></div><hr /><p>Passengers:</p>
        {active.map((p) => <div key={p.seat}><Tag t={p.seat} cls="seat" /> {p.name} <small>({gcode(p.gender)})</small></div>)}</section>
      <section className="sx38-shift-to"><h3>Shift To</h3>
        <label>Date:<input type="date" value={sh.date} min={today()} onChange={(e) => { const d = e.target.value; void loadServices(d, { ...sh, date: d }).catch(toastError); }} /></label>
        <label>Time & Service:<select value={sh.service} onChange={(e) => pickService(e.target.value)}><option value="">Select a service</option>
          {sh.services.map((s) => <option key={s.id} value={s.id}>{s.service} · {t12(s.departure_time)} · {s.free_seats} free</option>)}</select></label></section>
      <section className="sx38-assignment"><h3>Seat Assignment</h3><div className="sx38-assign-cols"><b>Passenger</b><b>Before</b><b>After</b></div>
        {active.map((p, i) => <button key={p.seat} type="button" className={`sx38-assignment-row ${sh.chosen === i ? "chosen" : ""}`} onClick={() => setSh({ ...sh, chosen: i })}>
          <span>{p.name}</span><span><Tag t={p.seat} cls="seat" /></span><span>→ {sh.assignment[p.seat] ? <Tag t={sh.assignment[p.seat]} cls="after" /> : "Select"}</span></button>)}</section>
      <label className="sx38-notify-checkbox"><input type="checkbox" checked={sh.notify} onChange={(e) => setSh({ ...sh, notify: e.target.checked })} /> Notify Passenger</label>
      <div className="sx38-submit-row"><button type="button" onClick={() => setMode("view")}>Back</button><button type="button" className="primary" disabled={!ready} onClick={confirmShift}>Confirm Shift</button></div>
    </div></div> : null;

  return <>{toolbar}{mode === "edit" ? editor : mode === "shift" ? shift : view}</>;
}
