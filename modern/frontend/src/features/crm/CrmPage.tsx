import { useEffect, useRef, useState } from "react";
import { api, type BookingView, type CustomerHit, type Me } from "../../api";
import { toast, toastError } from "../../components/ui/feedback";
import { BookingOverlay } from "./BookingOverlay";

// React port of the legacy CRM search screen (public/js/crm-screenshot-v8.js `G.screens.crm`). Same DOM/classes/SVG so the
// vendored crm-screenshot-v8.css renders it identically. Data: GET /api/admin/crm/passenger-search (never lists without a query).
const P: Record<string, string> = {
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m11-7a4 4 0 1 0-8 0 4 4 0 0 0 8 0Zm3-9v6m3-3h-6",
  phone: "M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 2.09 4.18 2 2 0 0 1 4.09 2h3a2 2 0 0 1 2 1.72l.55 3a2 2 0 0 1-.57 1.71L7.91 9.59a16 16 0 0 0 6.5 6.5l1.16-1.16a2 2 0 0 1 1.71-.57l3 .55A2 2 0 0 1 22 16.92z",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm-2 2 10 7L22 6",
  ticket: "M2 9V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a3 3 0 0 0 0 6v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a3 3 0 0 0 0-6zm10-5v3m0 4v2m0 4v3",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm6-2 5 5",
  x: "M18 6 6 18M6 6l12 12",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  chat: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.5-8.5h.5A8.5 8.5 0 0 1 21 11.5z",
  calendar: "M3 5h18v16H3zM7 2v6m10-6v6M3 10h18",
  pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0zm-8 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  wallet: "M20 7H4a2 2 0 0 0-2 2v10h20V9a2 2 0 0 0-2-2zM4 7V4h15v3M16 14h4",
  plane: "M22 2 9 12l-6 1-1 3 8-1 1 7 3-1 1-9 7-10z",
  crown: "m2 7 5 4 5-7 5 7 5-4-2 13H4L2 7z",
  spark: "M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2z",
  circlex: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM15 9l-6 6m0-6 6 6",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm0-16v6l4 2",
  bus: "M4 5h16v12H4zM4 13h16M7 20h.01M17 20h.01",
  rupee: "M6 3h12M6 8h12M7 3c7 0 7 10 0 10l8 8",
  more: "M4 12h.01M12 12h.01M20 12h.01",
  route: "M6 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm12 12a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM6 8v3c0 2 3 2 6 2s6 0 6 3",
};
function I({ n, s = 18 }: { n: string; s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[n] || P.more} /></svg>;
}
const R = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dmy = (x: string | null | undefined) => (x ? String(x).slice(0, 10).split("-").reverse().join("/") : "—");
const datetime = (x: string | null | undefined) => (x ? new Date(x).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
type Cls = "confirmed" | "cancelled" | "expired";
const cls = (b: BookingView): Cls => { const s = b.status.toLowerCase(); return s === "confirmed" ? "confirmed" : s === "cancelled" ? "cancelled" : "expired"; };
const statusName = (b: BookingView) => { const s = b.status.toLowerCase(); return s === "confirmed" ? "Confirmed" : s === "cancelled" ? "Cancelled" : s === "hold" ? "Hold" : "Expired"; };
type Mode = "phone" | "email" | "pnr";
const FILTERS: [string, string][] = [["all", "All"], ["confirmed", "Confirmed"], ["cancelled", "Cancelled"], ["expired", "Expired"]];
type Data = { query: string; total: number; customers: CustomerHit[] };

export function CrmPage({ me, onOpenBooking }: { me: Me; onOpenBooking?: (pnr: string, refresh: () => void) => void }) {
  const q0 = new URLSearchParams(location.hash.split("?")[1] || "");
  const [mode, setMode] = useState<Mode>((["phone", "email", "pnr"].includes(q0.get("mode") || "") ? q0.get("mode") : "pnr") as Mode);
  const [query, setQuery] = useState(q0.get("q") || "");
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");
  const serial = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const canComms = ["owner", "admin", "ops"].includes(me.role);

  const search = async (m = mode, text = input.current?.value ?? query) => {
    const s = ++serial.current; const v = text.trim(); setQuery(v); setFilter("all");
    if (!v) { setData(null); return; }
    if (m === "phone" && !/^\+?[0-9\s()-]{7,20}$/.test(v)) return toast("Enter a valid passenger phone number", "bad");
    if (m === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return toast("Enter a valid passenger email", "bad");
    if (m === "pnr" && v.length < 4) return toast("Enter at least four PNR characters", "bad");
    setBusy(true);
    try { const r = await api.passengerSearch(m, v); if (s === serial.current) setData({ query: v, total: r.total, customers: r.customers }); }
    catch (e) { if (s === serial.current) { setData(null); toastError(e); } }
    finally { if (s === serial.current) setBusy(false); }
  };
  useEffect(() => { if (query) void search(mode, query); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const chat = (phone: string) => { if (!canComms) return toast("Chat access is not enabled for your role", "warn"); location.hash = `#/chats?q=${encodeURIComponent(phone)}`; };
  const call = () => toast(canComms ? "Calling is preview-only: no telephony provider is connected" : "Calls are not enabled for your role", "warn");
  const [openPnr, setOpenPnr] = useState<string | null>(null);
  const openBooking = (pnr: string) => (onOpenBooking ? onOpenBooking(pnr, () => void search(mode, query)) : setOpenPnr(pnr));

  const bs = data ? data.customers.flatMap((c) => c.bookings).filter((b, i, a) => a.findIndex((x) => x.pnr === b.pnr) === i)
    .sort((a, b) => a.travelDate.localeCompare(b.travelDate) || a.pnr.localeCompare(b.pnr)) : [];
  const tot: Record<string, number> = { all: bs.length, confirmed: bs.filter((b) => cls(b) === "confirmed").length, cancelled: bs.filter((b) => cls(b) === "cancelled").length, expired: bs.filter((b) => cls(b) === "expired").length };
  const shown = bs.filter((b) => filter === "all" || cls(b) === filter);
  const total = data?.total ?? bs.length;

  return (
    <div className="cv8-page">
      <section className="cv8-searchpanel">
        <div className="cv8-search-main">
          <div className="cv8-titleicon"><I n="users" s={27} /></div>
          <div className="cv8-title"><strong>Passenger Search</strong><small>Customer 360 · trips, loyalty &amp; contact</small></div>
          <div className="cv8-modes">
            {([["phone", "Phone"], ["email", "Email"], ["pnr", "PNR"]] as [Mode, string][]).map(([k, v]) => (
              <button key={k} type="button" data-cv8-mode={k} className={k === mode ? "active" : ""}
                onClick={() => { serial.current++; setMode(k); setData(null); setQuery(""); if (input.current) input.current.value = ""; }}>
                <I n={k === "pnr" ? "ticket" : k === "email" ? "mail" : "phone"} />{` ${v}`}
              </button>
            ))}
          </div>
          <form className="cv8-searchform" data-cv8-searchform="" onSubmit={(e) => { e.preventDefault(); void search(); }}>
            <span><I n="search" s={23} /></span>
            <input ref={input} key={mode} data-cv8-q="" aria-label={`Passenger ${mode}`} autoComplete="off" defaultValue={query}
              placeholder={mode === "phone" ? "Enter phone number" : mode === "email" ? "Enter passenger email" : "Enter PNR / ticket number"} />
            <button type="button" className="cv8-clear" data-cv8-clear="" title="Clear search" onClick={() => { serial.current++; setQuery(""); setData(null); if (input.current) input.current.value = ""; }}><I n="x" /></button>
            <button className="cv8-primary" type="submit">Search</button>
          </form>
        </div>
        <div data-cv8-countbar="">
          {data && (
            <div className="cv8-countbar">
              <span><strong>{total}</strong>{` ${total === 1 ? "trip" : "trips"} for `}<b>{data.query}</b></span>
              <div className="cv8-status-tabs">
                {FILTERS.map(([k, v]) => <button key={k} data-cv8-filter={k} className={filter === k ? "active" : ""} onClick={() => setFilter(k)}><i className={`dot ${k}`}></i>{`${v} `}<em>{tot[k]}</em></button>)}
              </div>
            </div>
          )}
        </div>
      </section>
      <div data-cv8-results="">
        {busy ? <div className="cv8-loading">Searching passenger records…</div>
          : !data ? (
            <section className="cv8-unsearched"><div className="cv8-empty-icon"><I n="search" s={31} /></div><strong>Find a passenger</strong><span>Search by phone number, email or PNR to view a customer and their bookings.</span></section>
          ) : !data.customers.length ? (
            <div className="cv8-unsearched"><strong>No matching passenger found</strong><span>Check the {mode} and search again.</span></div>
          ) : (
            <>
              {data.customers.map((c) => <CustomerCard key={c.phone} c={c} onCall={call} onChat={chat} />)}
              <div className="cv8-table-scroll"><table className="cv8-tickets">
                <thead><tr>{[["circlex", "STATUS"], ["users", "NAME"], ["ticket", "TICKET NO"], ["route", "ROUTE"], ["bus", "SEAT NUMBERS"], ["rupee", "TICKET FARE"], ["calendar", "JOURNEY DATE"], ["clock", "ISSUED ON"], ["more", ""]].map(([i, v]) => <th key={i}><I n={i} />{` ${v}`}</th>)}</tr></thead>
                <tbody>
                  {shown.length ? shown.map((b) => <TicketRow key={b.pnr} b={b} onOpen={openBooking} onChat={chat} />)
                    : <tr><td colSpan={9} className="cv8-none">No bookings match this status</td></tr>}
                </tbody>
              </table></div>
            </>
          )}
      </div>
      {openPnr && <BookingOverlay me={me} pnr={openPnr} onClose={() => setOpenPnr(null)} />}
    </div>
  );
}

function CustomerCard({ c, onCall, onChat }: { c: CustomerHit; onCall: () => void; onChat: (p: string) => void }) {
  const last = c.bookings[0];
  const email = c.bookings.map((b) => b.email).find((e) => e) || "";
  return (
    <article className="cv8-customer" data-cv8-phone={c.phone}>
      <div className="cv8-customer-hd">
        <div className="cv8-avatar">{(c.name || "?").trim().charAt(0).toUpperCase()}</div>
        <div className="cv8-identity">
          <div className="cv8-name">{`${c.name} `}<span className="cv8-tier"><I n="crown" s={14} />{` ${c.tier}`}</span></div>
          <div className="cv8-meta">
            <span><I n="phone" s={15} />{` ${c.phone}`}</span>
            <span><I n="mail" s={15} />{` ${email || "Not provided"}`}</span>
            <span><I n="pin" s={15} />{` ${last?.from || "—"} → ${last?.to || "—"}`}</span>
            <span><I n="calendar" s={15} />{` Last: ${dmy(c.lastTravel)}`}</span>
          </div>
        </div>
        <div className="cv8-person-actions">
          <button className="cv8-plain" data-cv8-call={c.phone} onClick={onCall}><I n="phone" /> Call</button>
          <button className="cv8-square" data-cv8-chat={c.phone} title="Open passenger chats" onClick={() => onChat(c.phone)}><I n="chat" s={22} /></button>
        </div>
      </div>
      <div className="cv8-kpis">
        <div className="cv8-stat"><span className="cv8-stat-ico sky"><I n="plane" s={23} /></span><div><small>TOTAL TRIPS</small><strong>{c.totalTrips}</strong><label>{c.upcoming} upcoming · {c.cancelled} cancelled</label></div></div>
        <div className="cv8-stat"><span className="cv8-stat-ico mint"><I n="wallet" s={22} /></span><div><small>TOTAL SPEND</small><strong className="green">{R(c.spend)}</strong><label>Lifetime value</label></div></div>
        <div className="cv8-stat"><span className="cv8-stat-ico coral"><I n="circlex" s={22} /></span><div><small>CANCELLATION RATE</small><strong>{c.cancellationPct}%</strong><label>{c.cancelled} of {c.totalBookings} bookings</label></div></div>
        <div className="cv8-stat"><span className="cv8-stat-ico lilac"><I n="spark" s={22} /></span><div><small>BALANCE MILES</small><strong className="purple">{Number(c.miles || 0).toLocaleString("en-IN")}</strong><label>Available loyalty miles</label></div></div>
      </div>
    </article>
  );
}

function TicketRow({ b, onOpen, onChat }: { b: BookingView; onOpen: (pnr: string) => void; onChat: (p: string) => void }) {
  const x = b;
  const pax = b.passengers[0];
  const k = cls(b);
  return (
    <tr className={`cv8-ticketrow ${k}`}>
      <td><span className={`cv8-status ${k}`}><span className="cv8-dot"></span>{statusName(b)}</span></td>
      <td><div className="cv8-pax"><b className="cv8-initial">{String(pax?.name || "?").trim().charAt(0).toUpperCase()}</b>
        <div><strong>{pax?.name}</strong><div className="cv8-muted">{b.contact || ""}</div><div className="cv8-muted">{x.email || ""}</div></div>
        <button className="cv8-tiny-blue" data-cv8-chat={b.contact || ""} title="Chat passenger" onClick={() => onChat(b.contact || "")}><I n="chat" /></button></div></td>
      <td><button className="cv8-link" data-cv8-booking={b.pnr} onClick={() => onOpen(b.pnr)}><I n="eye" />{` ${b.pnr}`}</button><div className="cv8-muted">{b.pnr.slice(-6)}</div></td>
      <td><div className="cv8-route">{`${b.from ?? ""} `}<span>→</span>{` ${b.to ?? ""}`}</div></td>
      <td><strong>{b.passengers.map((p) => p.seatCode).join(", ") || "—"}</strong><div className="cv8-muted">{b.passengers.length} seat(s)</div></td>
      <td><strong>{R(b.amount)}</strong></td>
      <td>{dmy(b.travelDate)}</td>
      <td>{dmy(x.issuedAt)}<div className="cv8-muted">{datetime(x.issuedAt).split(", ").slice(-1)[0]}</div><div className="cv8-muted">{b.channel}</div></td>
      <td><button className="cv8-small-btn" data-cv8-booking={b.pnr} title="View ticket" onClick={() => onOpen(b.pnr)}><I n="eye" /></button></td>
    </tr>
  );
}
