import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api, type BookingStop, type CrmBooking } from "../../api";
import { toast, toastError } from "../../components/ui/feedback";
import { can } from "../settings/legacy";

// React port of legacy public/js/ticket-print-v41.js: operator-branded passenger ticket (Ticket / Update tabs).
// Data: GET /crm/booking/{pnr} (passengers, fare, status) + GET /bookings/{pnr}/ticket/v41 (operator, stage details, terms).
// The legacy server rendered a vector PDF; here Download / Print / Share use the browser print pipeline (Save as PDF).
type Place = { id: number; name: string; city: string; address: string; instructions: string; time: string; reporting: string | null; contact: string; maps_url: string | null };
type Extras = { operator: { name: string; legal_name: string; phone: string; alternate_phone: string; email: string; gstin: string; address: string; website: string; tagline: string };
  boarding: Place; dropping: Place; journey_minutes: number; cancellation_policy: string; terms: string[] };

const P: Record<string, ReactNode> = {
  bus: <><rect x="4" y="3" width="16" height="16" rx="3" /><path d="M4 12h16M8 19v2m8-2v2M8 7h2m4 0h2" /><circle cx="8" cy="15" r="1" /><circle cx="16" cy="15" r="1" /></>,
  close: <path d="M18 6 6 18M6 6l12 12" />, phone: <><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></>,
  call: <path d="M22 16v3a3 3 0 0 1-3 3A18 18 0 0 1 2 5a3 3 0 0 1 3-3h3l2 5-3 2a14 14 0 0 0 7 7l2-3z" />,
  pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2" /></>,
  download: <path d="M12 2v13m-4-5 4 5 4-5M4 18v4h16v-4" />, print: <path d="M6 8V3h12v5M6 18H3V9h18v9h-3M6 15h12v7H6z" />,
  clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
  whatsapp: <><path d="M4 19 2.5 22l5-1.5a10 10 0 1 0-3.5-3.5z" /><path d="M8 8c1 5 4 8 8 8l1.5-2-3-1.5-1.3 1a8 8 0 0 1-3-3L11 9z" /></>,
  warning: <path d="m12 3 10 18H2L12 3Zm0 7v4m0 3h.01" />, info: <><circle cx="12" cy="12" r="10" /><path d="M12 11v6m0-10h.01" /></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />, check: <path d="m5 12 5 5 9-9" />, email: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m3 5 9 8 9-8" /></>,
};
const Ic = ({ n, s = 20 }: { n: string; s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{P[n] ?? P.info}</svg>;
const money = (n: unknown) => `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const booked = (x?: string | null) => { if (!x) return ""; const d = new Date(x); return Number.isFinite(+d) ? d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : x; };
const Val = ({ k, v }: { k: string; v?: string | null }) => <><span className="ticket41-label">{k}</span><strong>{v || "—"}</strong></>;

/** legacy TicketPrintV41.invoiceNotice(): transient "coming soon" status toast. */
export function invoiceNotice41() {
  document.querySelector(".ticket41-invoice-notice")?.remove();
  const node = document.createElement("div"); node.className = "ticket41-invoice-notice"; node.setAttribute("role", "status");
  node.innerHTML = '<span class="ticket41-invoice-ico"><svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.9"><circle cx="12" cy="12" r="10"/><path d="M12 11v6m0-10h.01"/></svg></span><span>Print invoice feature coming soon</span>'
    + '<button type="button" aria-label="Dismiss notification"><svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.9"><path d="M18 6 6 18M6 6l12 12"/></svg></button><span class="ticket41-notice-progress"></span>';
  document.body.appendChild(node);
  const t = window.setTimeout(() => node.remove(), 4600);
  node.querySelector("button")!.addEventListener("click", () => { window.clearTimeout(t); node.remove(); });
}

/** Print only the ticket paper in a separate window with the app's stylesheets (browser "Save as PDF" covers Download). */
function printPaper(pnr: string) {
  const paper = document.querySelector<HTMLElement>(".ticket41-paper");
  if (!paper) return;
  const win = window.open("", "_blank", "width=900,height=900");
  if (!win) return toast("Allow popups to print the ticket", "warn");
  const css = [...document.styleSheets].map((s) => { try { return [...s.cssRules].map((r) => r.cssText).join("\n"); } catch { return ""; } }).join("\n");
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>ticket-${pnr.replace(/[^a-z0-9_-]/gi, "")}</title><style>${css}</style>`
    + `<style>body{background:#fff;margin:0;padding:24px}.ticket41-paper{box-shadow:none;margin:0 auto}@media print{body{padding:0}}</style></head><body><div class="ticket41-overlay" style="position:static;display:block;overflow:visible">${paper.outerHTML}</div></body></html>`);
  win.document.close();
  win.onload = () => { win.focus(); win.print(); };
  setTimeout(() => { try { win.focus(); win.print(); } catch { /* window closed */ } }, 600);
}

export function TicketPrintV41({ pnr, onClose, onChanged }: { pnr: string; onClose: () => void; onChanged?: () => void }) {
  const [b, setB] = useState<CrmBooking>();
  const [coach, setCoach] = useState("");
  const [x, setX] = useState<Extras>();
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"ticket" | "update">("ticket");
  const [choice, setChoice] = useState<"" | "stops" | "mobile">("");
  const [stops, setStops] = useState<{ pickups: BookingStop[]; drops: BookingStop[] }>();
  const [pickup, setPickup] = useState("");
  const [drop, setDrop] = useState("");
  const [phone, setPhone] = useState("");
  const [dark, setDark] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = () => Promise.all([api.crmBooking(pnr), api.admin<Extras>(`/bookings/${encodeURIComponent(pnr)}/ticket/v41`)])
    .then(([r, e]) => { setB(r.booking); setCoach(r.map?.coach.name ?? ""); setX(e); setError(""); }).catch((e) => setError((e as Error).message));
  useEffect(() => { void load(); }, [pnr]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const old = document.body.style.overflow; document.body.style.overflow = "hidden";
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k, true);
    return () => { document.body.style.overflow = old; document.removeEventListener("keydown", k, true); };
  }, [onClose]);

  const op = x?.operator;
  const wphone = (op?.alternate_phone || op?.phone || "").replace(/\D/g, "");
  const canUpdate = !!b && b.status === "confirmed" && can("bookings.modify");
  const active = b?.passengers.filter((p) => p.status !== "cancelled") ?? [];
  const share = async () => {
    if (!b) return;
    const text = `Ticket ${b.ticketNumber || b.pnr} · ${b.from} → ${b.to} · ${x?.boarding.time ?? ""} · Seats ${active.map((p) => p.seat).join(", ")}`;
    if (navigator.share) { try { await navigator.share({ title: `Ticket ${b.pnr}`, text }); } catch (e) { if ((e as Error).name !== "AbortError") toast(`Share sheet unavailable: ${(e as Error).message}`, "warn"); } return; }
    printPaper(b.pnr); toast("Save the ticket as PDF, then attach it in WhatsApp or your preferred app.", "warn");
  };
  const saveMobile = async () => {
    if (!b) return;
    const v = phone.trim();
    if (!/^[6-9]\d{9}$/.test(v)) return toast("Enter a valid 10-digit Indian mobile number", "bad");
    setBusy(true);
    try { await api.bookingEdit(b.pnr, { contact: { name: b.contact.name || active[0]?.name || "Passenger", phone: v, email: b.contact.email || "" } }); await load(); setChoice(""); onChanged?.(); toast("Mobile number updated", "ok"); }
    catch (e) { toastError(e); } finally { setBusy(false); }
  };
  const saveStops = async () => {
    if (!b) return;
    if (!pickup || !drop) return toast("Select valid pickup and dropping points", "bad");
    setBusy(true);
    try { await api.bookingEdit(b.pnr, { boardingStageId: Number(pickup), droppingStageId: Number(drop) }); await load(); setChoice(""); onChanged?.(); toast("Pickup and drop updated", "ok"); }
    catch (e) { toastError(e); } finally { setBusy(false); }
  };
  const openStops = async () => {
    try { const s = await api.bookingStops(pnr); setStops(s); setPickup(String(x?.boarding.id ?? s.boarding_stage_id ?? "")); setDrop(String(x?.dropping.id ?? s.dropping_stage_id ?? "")); setChoice("stops"); }
    catch (e) { toastError(e); }
  };

  const footer = op && <footer className="ticket41-footer"><div className="ticket41-footer-grid">
    <section><h2>{op.name}</h2><p>{op.tagline}</p>{op.address && <p><Ic n="pin" s={15} /> {op.address}</p>}</section>
    <section><h4>COMPANY</h4>{["About Us", "Contact", "Terms & Conditions", "Refund Policy", "Privacy Policy", "Delete My Data"].map((t) => <p key={t}><Ic n="info" s={14} /> {t}</p>)}</section>
    <section><h4>GET IN TOUCH</h4>{op.phone && <p><Ic n="call" s={15} /> {op.phone}</p>}{op.email && <p><Ic n="email" s={15} /> {op.email}</p>}<p><Ic n="clock" s={15} /> Contact the operator for office timings</p></section></div>
    <div className="ticket41-footer-pay"><span><Ic n="check" s={17} /> Secure Payments</span><span>24×7 Support</span></div>
    <div className="ticket41-payment-marks"><b>VISA</b><b>Mastercard</b><b>UPI</b><b>RuPay</b><b>Net Banking</b></div>
    <div className="ticket41-credit">© {new Date().getFullYear()} - {op.name}<span>Powered by JourneyOS GDS</span></div></footer>;

  const place = (o: Place, title: "BOARDING" | "DROPPING") => <div className="ticket41-place"><span>{title}</span><h3>{o.city}</h3><h4>{o.name}</h4>
    {o.instructions && <p>{o.instructions}</p>}{o.address && o.address !== o.name && <p>{o.address}</p>}<p>Time: <b>{o.time}</b></p>
    {title === "BOARDING" && o.reporting && <p>Reporting: {o.reporting}</p>}{o.contact && <p>Contact: {o.contact}</p>}
    {o.maps_url && <a href={o.maps_url} target="_blank" rel="noopener noreferrer">Google Maps Link</a>}</div>;

  let content: ReactNode;
  if (!b || !x || !op) content = <p className="ticket41-loading">{error || "Loading your ticket…"}</p>;
  else if (tab === "ticket") {
    const paid = b.payment.toLowerCase() === "paid", gstRate = b.fare.net > 0 ? Number((100 * b.fare.gst / b.fare.net).toFixed(2)) : 0;
    const row = (t: string, a: number, k = "") => <div className={`ticket41-moneyrow ${k}`}><span>{t}</span><strong>{money(a)}</strong></div>;
    content = <>
      <div className="ticket41-tools"><div><b>Get your ticket</b><p>Save a PDF copy, print it, or send it via WhatsApp.</p></div>
        <div className="ticket41-buttons">
          <button type="button" className="ticket41-btn ticket41-download" onClick={() => { printPaper(b.pnr); toast("Choose “Save as PDF” in the print dialog to download the ticket", ""); }}><Ic n="download" /> Download</button>
          <button type="button" className="ticket41-btn ticket41-print" onClick={() => printPaper(b.pnr)}><Ic n="print" /> Print</button>
          <button type="button" className="ticket41-btn ticket41-share" onClick={() => void share()}><Ic n="whatsapp" /> Share</button></div></div>
      <article className="ticket41-paper">
        <div className="ticket41-legal"><div className="ticket41-legal-top"><h1>{op.name}</h1>{op.website && <span>{op.website}</span>}</div>
          <div className="ticket41-legal-contact"><span><Ic n="call" s={14} /> {op.phone}{op.alternate_phone && op.alternate_phone !== op.phone ? `, ${op.alternate_phone}` : ""}</span><span><Ic n="email" s={14} /> {op.email}</span></div>
          {op.legal_name ? <p>Bus service provided by: {op.legal_name}{op.address ? `, ${op.address}` : ""}</p> : op.address ? <p>{op.address}</p> : null}
          {op.gstin && <p>Operator GSTIN: {op.gstin}</p>}</div>
        <div className="ticket41-booking"><div><Val k="Booking ID" v={b.pnr} /><div className="ticket41-book-status"><span className="ticket41-label">Status</span><b>{b.status.toUpperCase()}</b><small>Booked: {booked(b.bookedAt)}</small></div></div>
          <div className="ticket41-right"><Val k="PNR" v={b.ticketNumber || b.pnr} /><div><Val k="Service" v={b.service} /><small>{coach}</small></div></div></div>
        <div className="ticket41-trip"><div className="ticket41-duration"><Ic n="clock" s={17} /> <strong>{Math.round(x.journey_minutes / 60)}h</strong> journey</div>
          <div className="ticket41-route">{place(x.boarding, "BOARDING")}{place(x.dropping, "DROPPING")}</div></div>
        <section className="ticket41-pass"><h3>Passenger Detail</h3><div className="ticket41-pass-scroll"><table><thead><tr>{["Passenger", "Phone", "Gender", "Age", "Seat", "Fare"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{active.map((p) => <tr key={p.seat}><td>{p.name}</td><td>{b.contact.phone ?? "**********"}</td><td>{p.gender}</td><td>{p.age ?? ""}</td><td><b className="ticket41-seat">{p.seat}</b></td><td>{money(p.fare)}</td></tr>)}</tbody></table></div>
          {row(`Base Fare (${active.length} seat${active.length === 1 ? "" : "s"})`, b.fare.gross, "base")}{row("Discount", -(b.fare.discount || 0), "discount")}
          {row("Net Fare", b.fare.net)}{row(`GST (${gstRate}%)`, b.fare.gst)}{row(paid ? "Amount Paid" : "Total Payable", b.fare.total, "paid")}
          <div className="ticket41-booked-via">Booked via: <b>{b.source}</b></div></section>
        <section className="ticket41-policy"><div><Ic n="warning" s={21} /></div><div><b>CANCELLATION POLICY</b><p>{x.cancellation_policy}</p></div></section>
        <section className="ticket41-terms"><h3>TERMS &amp; CONDITIONS</h3><ul>{x.terms.map((t, i) => <li key={i}>{t}</li>)}</ul></section>
      </article>{footer}</>;
  } else if (choice === "stops") {
    const sel = (title: string, list: BookingStop[] | undefined, val: string, set: (v: string) => void) => <label><span>{title}</span>
      <select value={val} onChange={(e) => set(e.target.value)}>{(list ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}{s.time ? ` - ${s.time}` : ""}</option>)}</select></label>;
    content = <><div className="ticket41-updateform"><h3>Change Pick-up &amp; Drop</h3><p>Select another permitted stop on the same service. Your seat and journey date remain unchanged.</p>
      <div className="ticket41-formgrid">{sel("Pick-up point", stops?.pickups, pickup, setPickup)}{sel("Drop point", stops?.drops, drop, setDrop)}</div>
      <div className="ticket41-form-actions"><button type="button" onClick={() => setChoice("")}>Back</button><button className="ticket41-btn ticket41-download" type="button" disabled={busy} onClick={() => void saveStops()}>Save changes</button></div></div>{footer}</>;
  } else if (choice === "mobile") {
    content = <><div className="ticket41-updateform"><h3>Change Mobile</h3><p>Change the mobile number linked to this booking. No SMS or WhatsApp delivery is assumed.</p>
      <label><span>Mobile number</span><input type="tel" inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
      <div className="ticket41-form-actions"><button type="button" onClick={() => setChoice("")}>Back</button><button className="ticket41-btn ticket41-download" type="button" disabled={busy} onClick={() => void saveMobile()}>Save changes</button></div></div>{footer}</>;
  } else {
    content = <><div className="ticket41-updatecards"><h4>EDIT MY TICKET</h4>
      <button type="button" disabled={!canUpdate} onClick={() => void openStops()}><span className="ticket41-cardtitle"><Ic n="pin" s={33} /> <b>Change Pick-up &amp; Drop</b></span><p>Pick a different stop on this trip.</p><strong>Choose <Ic n="arrow" s={19} /></strong></button>
      <button type="button" disabled={!canUpdate} onClick={() => { setPhone(b.contact.phone || ""); setChoice("mobile"); }}><span className="ticket41-cardtitle"><Ic n="phone" s={33} /> <b>Change Mobile</b></span><p>Send the ticket to a different mobile.</p><strong>Choose <Ic n="arrow" s={19} /></strong></button>
      {!canUpdate && <p className="ticket41-readonly">Updates are available only to authorized staff for confirmed bookings.</p>}</div>{footer}</>;
  }

  return createPortal(<div className={`ticket41-overlay${dark ? " ticket41-dark" : ""}${tab === "update" ? " ticket41-is-update" : ""}`} role="dialog" aria-label="Passenger ticket preview">
    <header className="ticket41-nav"><div className="ticket41-logo"><b>N</b><strong>{op?.name || "Operator"}</strong></div>
      <div className="ticket41-topactions">
        <button type="button" className="ticket41-btn ticket41-search" onClick={onClose}><Ic n="bus" /> Search</button>
        <button type="button" className="ticket41-btn ticket41-whatsapp" disabled={!wphone} onClick={() => window.open(`https://wa.me/${wphone.length === 10 ? `91${wphone}` : wphone}`, "_blank", "noopener,noreferrer")}><Ic n="whatsapp" /> WhatsApp</button>
        <button type="button" className="ticket41-theme" title="Toggle theme" aria-label="Toggle theme" onClick={() => setDark((d) => !d)}><Ic n="sun" /></button>
        <button type="button" className="ticket41-smallclose" aria-label="Close ticket preview" onClick={onClose}><Ic n="close" /></button></div></header>
    <div className="ticket41-main"><div className="ticket41-tabs" role="tablist" aria-label="Ticket and update">
      <button type="button" role="tab" aria-selected={tab === "ticket"} className={tab === "ticket" ? "active" : ""} onClick={() => { setTab("ticket"); setChoice(""); }}>Ticket</button>
      <button type="button" role="tab" aria-selected={tab === "update"} className={tab === "update" ? "active" : ""} onClick={() => { setTab("update"); setChoice(""); }}>Update</button></div>
      {content}</div>
  </div>, document.body);
}
